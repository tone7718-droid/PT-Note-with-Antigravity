import {
  supabase,
  callEdgeFunction,
  setCachedAccessToken,
  verifyPasswordViaRest,
} from "./supabase";
import type { NoteData, TherapistRecord, Therapist } from "@/types";
import {
  dbNoteToNoteData,
  noteDataToDbInsert,
  dbTherapistToRecord,
  therapistIdToEmail,
  type DbNoteRow,
  type DbTherapistRow,
} from "./database.types";

/* ══════════════════════════════════════════
   Auth
   ══════════════════════════════════════════ */

export async function signIn(loginId: string, password: string): Promise<{ therapist: Therapist }> {
  const email = therapistIdToEmail(loginId);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.message.includes("Invalid login credentials")) {
      throw new Error("ID 또는 비밀번호를 확인해주세요.");
    }
    if (error.message.includes("Email not confirmed")) {
      throw new Error("계정이 아직 활성화되지 않았습니다.");
    }
    throw new Error(error.message);
  }

  // ★ access_token을 즉시 캐싱 — getSession() 우회용
  if (data.session?.access_token) {
    setCachedAccessToken(data.session.access_token);
  }

  const therapist = await getTherapistByAuthId(data.user.id);
  if (!therapist) throw new Error("치료사 정보를 찾을 수 없습니다.");
  if (therapist.resigned) throw new Error("퇴사 처리된 계정입니다.");

  return {
    therapist: {
      uid: therapist.uid,
      id: therapist.id,
      name: therapist.name,
      role: therapist.role,
    },
  };
}

export async function signOut(): Promise<void> {
  setCachedAccessToken(null);
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

export function onAuthStateChange(callback: (therapist: Therapist | null) => void) {
  return supabase.auth.onAuthStateChange(async (event: string, session: any) => {
    if (event === "SIGNED_OUT" || !session?.user) {
      setCachedAccessToken(null);
      callback(null);
      return;
    }
    if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
      // ★ 세션 토큰을 항상 최신으로 캐싱 (refresh 대응)
      if (session.access_token) {
        setCachedAccessToken(session.access_token);
      }
      try {
        const record = await getTherapistByAuthId(session.user.id);
        if (record && !record.resigned) {
          callback({
            uid: record.uid,
            id: record.id,
            name: record.name,
            role: record.role,
          });
        } else {
          callback(null);
        }
      } catch (err) {
        console.error("[auth] onAuthStateChange therapist lookup failed:", err);
        callback(null);
      }
    }
  });
}

async function getTherapistByAuthId(authUserId: string): Promise<TherapistRecord | null> {
  const { data, error } = await supabase
    .from("therapists")
    .select("*")
    .eq("auth_user_id", authUserId)
    .single();

  if (error || !data) return null;
  return dbTherapistToRecord(data as DbTherapistRow);
}

/* ══════════════════════════════════════════
   Notes CRUD
   ══════════════════════════════════════════ */

export async function fetchNotes(): Promise<NoteData[]> {
  const { data, error } = await supabase
    .from("progress_notes")
    .select("*")
    .order("saved_at", { ascending: false });

  if (error) throw new Error(`노트 조회 실패: ${error.message}`);
  return (data as DbNoteRow[]).map(dbNoteToNoteData);
}

export async function upsertNote(note: NoteData): Promise<NoteData> {
  const dbRow = noteDataToDbInsert(note);
  const { data, error } = await supabase
    .from("progress_notes")
    .upsert(dbRow, { onConflict: "id" })
    .select()
    .single();

  if (error) throw new Error(`노트 저장 실패: ${error.message}`);
  return dbNoteToNoteData(data as DbNoteRow);
}

export async function deleteNotes(ids: string[]): Promise<void> {
  const { error } = await supabase
    .from("progress_notes")
    .delete()
    .in("id", ids);

  if (error) throw new Error(`노트 삭제 실패: ${error.message}`);
}

export async function transferNotesRpc(
  fromUid: string,
  toUid: string,
  toName: string,
  toLoginId: string | null
): Promise<number> {
  const { data, error } = await supabase.rpc("transfer_notes", {
    from_uid: fromUid,
    to_uid: toUid,
    to_name: toName,
    to_login_id: toLoginId,
  });

  if (error) throw new Error(`노트 이관 실패: ${error.message}`);
  return data as number;
}

/* ══════════════════════════════════════════
   Therapists CRUD
   ══════════════════════════════════════════ */

export async function fetchTherapists(): Promise<TherapistRecord[]> {
  const { data, error } = await supabase
    .from("therapists")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw new Error(`치료사 조회 실패: ${error.message}`);
  return (data as DbTherapistRow[]).map(dbTherapistToRecord);
}

export async function createTherapistViaEdgeFunction(
  loginId: string,
  name: string,
  password: string
): Promise<TherapistRecord> {
  // Raw fetch로 호출 — supabase.functions.invoke()의 자동 setAuth 메커니즘 우회
  try {
    const data = await callEdgeFunction<
      { loginId: string; name: string; password: string },
      { therapist: DbTherapistRow; error?: string }
    >("create-therapist", { loginId, name, password });

    if (data?.error) throw new Error(data.error);
    if (!data?.therapist) throw new Error("응답에 therapist 데이터가 없습니다.");
    return dbTherapistToRecord(data.therapist);
  } catch (err) {
    console.error("[createTherapist] Edge Function error:", err);
    throw new Error(`치료사 등록 실패: ${(err as Error).message}`);
  }
}

export async function resignTherapistDb(uid: string): Promise<void> {
  const { error } = await supabase
    .from("therapists")
    .update({ resigned: true, login_id: null })
    .eq("uid", uid);

  if (error) throw new Error(`퇴사 처리 실패: ${error.message}`);
}

export async function deleteTherapistDb(uid: string): Promise<void> {
  const { error } = await supabase
    .from("therapists")
    .delete()
    .eq("uid", uid);

  if (error) throw new Error(`기록 영구 삭제 실패: ${error.message}`);
}

export async function updateTherapistPasswordViaAuth(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(`비밀번호 변경 실패: ${error.message}`);
}

/* ══════════════════════════════════════════
   Export / Import
   ══════════════════════════════════════════ */

export async function exportAllData(): Promise<string> {
  const [notes, therapists] = await Promise.all([fetchNotes(), fetchTherapists()]);
  return JSON.stringify(
    { version: 2, exportedAt: new Date().toISOString(), notes, therapists },
    null,
    2
  );
}

export async function importNotes(notes: NoteData[]): Promise<number> {
  if (notes.length === 0) return 0;

  const existing = await fetchNotes();
  const existingIds = new Set(existing.map((n) => n.id));
  const newNotes = notes.filter((n) => !existingIds.has(n.id));

  if (newNotes.length === 0) return 0;

  // 50건씩 배치 upsert
  const BATCH_SIZE = 50;
  for (let i = 0; i < newNotes.length; i += BATCH_SIZE) {
    const batch = newNotes.slice(i, i + BATCH_SIZE).map(noteDataToDbInsert);
    const { error } = await supabase.from("progress_notes").upsert(batch, { onConflict: "id" });
    if (error) throw new Error(`가져오기 실패 (batch ${i}): ${error.message}`);
  }

  return newNotes.length;
}

/* ══════════════════════════════════════════
   Re-auth (비밀번호 재확인용)
   ══════════════════════════════════════════ */

export async function reauthenticate(loginId: string, password: string): Promise<boolean> {
  // ★ SDK 우회 — 이미 로그인된 상태에서 signInWithPassword를 다시 호출하면
  // LockManager 이슈로 hang하므로 Auth REST API 직접 호출.
  const email = therapistIdToEmail(loginId);
  return verifyPasswordViaRest(email, password);
}
