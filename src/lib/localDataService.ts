/**
 * localStorage 기반 데이터 서비스 (임시 로컬 모드)
 *
 * 클라우드(Supabase) 저장이 완전히 검증/안정화되면
 * NoteContext.tsx의 import를 다시 dataService로 바꾸면 됩니다.
 *
 *   변경 전:  import * as ds from "@/lib/localDataService";
 *   변경 후:  import * as ds from "@/lib/dataService";
 */

import type { NoteData, TherapistRecord, Therapist } from "@/types";
import { hashPassword, verifyPassword } from "@/components/hashUtils";

/* ── Storage Keys ── */
const NOTES_KEY = "pt_local_notes";
const THERAPISTS_KEY = "pt_local_therapists";
const SESSION_KEY = "pt_local_session";

const DEFAULT_MASTER_PW = "0000";

/* ══════════════════════════════════════════
   Helpers
   ══════════════════════════════════════════ */

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

let bootstrapped = false;

async function ensureBootstrapMaster(): Promise<void> {
  if (bootstrapped) return;
  const therapists = read<TherapistRecord[]>(THERAPISTS_KEY, []);
  if (therapists.length === 0) {
    const masterPwHash = await hashPassword(DEFAULT_MASTER_PW);
    const master: TherapistRecord = {
      uid: "master-default",
      id: "master",
      name: "마스터",
      passwordHash: masterPwHash,
      role: "master",
      resigned: false,
    };
    write(THERAPISTS_KEY, [master]);
  }
  bootstrapped = true;
}

/* ══════════════════════════════════════════
   Auth
   ══════════════════════════════════════════ */

export async function signIn(
  loginId: string,
  password: string
): Promise<{ therapist: Therapist }> {
  await ensureBootstrapMaster();
  const therapists = read<TherapistRecord[]>(THERAPISTS_KEY, []);
  const found = therapists.find((t) => t.id === loginId);

  if (!found) throw new Error("ID 또는 비밀번호를 확인해주세요.");
  if (found.resigned) throw new Error("퇴사 처리된 계정입니다.");

  const valid = await verifyPassword(password, found.passwordHash);
  if (!valid) throw new Error("ID 또는 비밀번호를 확인해주세요.");

  const session: Therapist = {
    uid: found.uid,
    id: found.id,
    name: found.name,
    role: found.role,
  };
  write(SESSION_KEY, session);
  return { therapist: session };
}

export async function signOut(): Promise<void> {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_KEY);
}

type AuthSubscription = { unsubscribe: () => void };

export function onAuthStateChange(
  callback: (therapist: Therapist | null) => void
): { data: { subscription: AuthSubscription } } {
  // 페이지 로드 시 저장된 세션 복원
  void ensureBootstrapMaster().then(() => {
    const session = read<Therapist | null>(SESSION_KEY, null);
    callback(session);
  });

  return {
    data: {
      subscription: { unsubscribe: () => {} },
    },
  };
}

export async function reauthenticate(
  loginId: string,
  password: string
): Promise<boolean> {
  const therapists = read<TherapistRecord[]>(THERAPISTS_KEY, []);
  const found = therapists.find((t) => t.id === loginId);
  if (!found) return false;
  return verifyPassword(password, found.passwordHash);
}

/* ══════════════════════════════════════════
   Notes CRUD
   ══════════════════════════════════════════ */

export async function fetchNotes(): Promise<NoteData[]> {
  return read<NoteData[]>(NOTES_KEY, []).sort(
    (a, b) => new Date(b.savedAt || 0).getTime() - new Date(a.savedAt || 0).getTime()
  );
}

export async function upsertNote(note: NoteData): Promise<NoteData> {
  const session = read<Therapist | null>(SESSION_KEY, null);
  const enriched: NoteData = {
    ...note,
    therapist: note.therapist ?? session ?? undefined,
    therapistUid: note.therapistUid || session?.uid || "",
  };

  const notes = read<NoteData[]>(NOTES_KEY, []);
  const idx = notes.findIndex((n) => n.id === enriched.id);
  if (idx >= 0) notes[idx] = enriched;
  else notes.unshift(enriched);
  write(NOTES_KEY, notes);
  return enriched;
}

export async function deleteNotes(ids: string[]): Promise<void> {
  const notes = read<NoteData[]>(NOTES_KEY, []);
  write(
    NOTES_KEY,
    notes.filter((n) => !ids.includes(n.id || ""))
  );
}

export async function transferNotesRpc(
  fromUid: string,
  toUid: string,
  toName: string,
  toLoginId: string | null
): Promise<number> {
  const notes = read<NoteData[]>(NOTES_KEY, []);
  let count = 0;
  const updated = notes.map((n) => {
    if (n.therapistUid === fromUid) {
      count++;
      return {
        ...n,
        therapistUid: toUid,
        therapist: {
          uid: toUid,
          id: toLoginId,
          name: toName,
          role: "therapist" as const,
        },
      };
    }
    return n;
  });
  write(NOTES_KEY, updated);
  return count;
}

/* ══════════════════════════════════════════
   Therapists CRUD
   ══════════════════════════════════════════ */

export async function fetchTherapists(): Promise<TherapistRecord[]> {
  await ensureBootstrapMaster();
  return read<TherapistRecord[]>(THERAPISTS_KEY, []);
}

export async function createTherapistViaEdgeFunction(
  loginId: string,
  name: string,
  password: string
): Promise<TherapistRecord> {
  if (!/^PT-\d{3}$/.test(loginId)) {
    throw new Error("ID 형식이 올바르지 않습니다 (PT-001 ~ PT-999).");
  }

  const therapists = read<TherapistRecord[]>(THERAPISTS_KEY, []);
  if (therapists.some((t) => t.id === loginId && !t.resigned)) {
    throw new Error("이미 사용 중인 ID입니다.");
  }

  const passwordHash = await hashPassword(password);
  const newRecord: TherapistRecord = {
    uid: `therapist-${Date.now()}`,
    id: loginId,
    name,
    passwordHash,
    role: "therapist",
    resigned: false,
  };

  write(THERAPISTS_KEY, [...therapists, newRecord]);
  return newRecord;
}

export async function resignTherapistDb(uid: string): Promise<void> {
  const therapists = read<TherapistRecord[]>(THERAPISTS_KEY, []);
  write(
    THERAPISTS_KEY,
    therapists.map((t) => (t.uid === uid ? { ...t, id: null, resigned: true } : t))
  );
}

export async function deleteTherapistDb(uid: string): Promise<void> {
  const therapists = read<TherapistRecord[]>(THERAPISTS_KEY, []);
  write(
    THERAPISTS_KEY,
    therapists.filter((t) => t.uid !== uid)
  );
}

export async function updateTherapistPasswordViaAuth(
  newPassword: string
): Promise<void> {
  const session = read<Therapist | null>(SESSION_KEY, null);
  if (!session) throw new Error("로그인 세션이 없습니다.");

  const therapists = read<TherapistRecord[]>(THERAPISTS_KEY, []);
  const passwordHash = await hashPassword(newPassword);
  write(
    THERAPISTS_KEY,
    therapists.map((t) => (t.uid === session.uid ? { ...t, passwordHash } : t))
  );
}

/* ══════════════════════════════════════════
   Export / Import
   ══════════════════════════════════════════ */

export async function exportAllData(): Promise<string> {
  const notes = read<NoteData[]>(NOTES_KEY, []);
  const therapists = read<TherapistRecord[]>(THERAPISTS_KEY, []);
  return JSON.stringify(
    { version: 2, exportedAt: new Date().toISOString(), notes, therapists },
    null,
    2
  );
}

export async function importNotes(notes: NoteData[]): Promise<number> {
  if (notes.length === 0) return 0;
  const existing = read<NoteData[]>(NOTES_KEY, []);
  const existingIds = new Set(existing.map((n) => n.id));
  const newOnes = notes.filter((n) => !existingIds.has(n.id));
  if (newOnes.length === 0) return 0;
  write(NOTES_KEY, [...newOnes, ...existing]);
  return newOnes.length;
}
