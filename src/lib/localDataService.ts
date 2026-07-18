/**
 * localStorage 기반 데이터 서비스 (현재 운영 중인 단일 데이터 소스)
 *
 * 클라우드 모드 복귀 시: 새 lib/dataService.ts 작성 + 스토어의 import 변경.
 * (이전 Supabase 연동 코드는 git history 에서 참조 가능 — dataService.ts,
 * supabase.ts, database.types.ts 삭제 커밋 이전)
 */

import type { NoteData, TherapistRecord, Therapist, PainEntry, PainLevel, PainView } from "@/types";
import { hashPassword, verifyPassword, isLegacyHash } from "@/components/hashUtils";
import { ANT_CENTER, ANT_PAIRED, POST_CENTER, POST_PAIRED } from "@/components/bodyDiagramShapes";
import { encryptData, decryptData } from "./cryptoService";
import { snapshotBeforeDestructive, listBackups, type BackupSnapshot } from "./autoBackup";
import { DEFAULT_PASSWORD } from "./passwordPolicy";

/* ── Storage Keys ── */
const NOTES_KEY = "pt_local_notes";
const THERAPISTS_KEY = "pt_local_therapists";
const SESSION_KEY = "pt_local_session";

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

/* ── 환자 노트 암호화 저장 (PT-Progress-Note 에서 이식) ──
   노트 본문은 AES-GCM 으로 암호화해 저장하고, 복호화 실패 시 원본을
   격리 보관해 영구 소실을 막는다. therapists/session 은 평문 유지. */

/** 환자 노트를 AES-GCM 암호화해서 저장 */
async function writeNotes(notes: NoteData[]): Promise<void> {
  if (typeof window === "undefined") return;
  const encrypted = await encryptData(JSON.stringify(notes));
  window.localStorage.setItem(NOTES_KEY, encrypted);
}

/**
 * 복호화/파싱이 모두 실패한 원본을 별도 키에 격리 보관.
 * readNotes 가 빈 배열을 반환한 뒤 사용자가 노트를 저장하면 NOTES_KEY 가
 * 덮어써지므로, 격리해 두지 않으면 원본이 영구 소실됨 (암호화 키 손상 대비).
 */
function quarantineCorruptNotes(raw: string): void {
  try {
    window.localStorage.setItem(`${NOTES_KEY}_corrupt_${Date.now()}`, raw);
    console.error(
      `[localDataService] 노트 복호화 실패 — 원본을 "${NOTES_KEY}_corrupt_*" 키에 보관했습니다.`
    );
  } catch {
    /* 격리 보관 실패 (쿼터 초과 등) — 앱 동작은 계속 */
  }
}

/**
 * 환자 노트 복호화 읽기.
 * 기존 평문 데이터(마이그레이션 전)는 JSON 폴백으로 자동 처리.
 * 복호화·파싱 모두 실패 시 원본을 격리 보관 후 빈 배열 반환.
 */
async function readNotes(): Promise<NoteData[]> {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(NOTES_KEY);
  if (!raw) return [];
  try {
    const decrypted = await decryptData(raw);
    return JSON.parse(decrypted) as NoteData[];
  } catch {
    // 암호화 전 평문 데이터 폴백 (최초 1회 마이그레이션)
    try {
      const plain = JSON.parse(raw);
      if (Array.isArray(plain)) {
        await writeNotes(plain as NoteData[]); // 즉시 암호화로 업그레이드
        return plain as NoteData[];
      }
    } catch {
      /* 아래 격리 처리로 진행 */
    }
    quarantineCorruptNotes(raw);
    return [];
  }
}

let bootstrapped = false;

async function ensureBootstrapMaster(): Promise<void> {
  if (bootstrapped) return;
  const therapists = read<TherapistRecord[]>(THERAPISTS_KEY, []);
  if (therapists.length === 0) {
    const masterPwHash = await hashPassword(DEFAULT_PASSWORD);
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
  if (!found.passwordHash) {
    throw new Error("비밀번호가 설정되지 않은 계정입니다. 마스터에게 비밀번호 재설정을 요청하세요.");
  }

  const valid = await verifyPassword(password, found.passwordHash);
  if (!valid) throw new Error("ID 또는 비밀번호를 확인해주세요.");

  // 레거시(솔트 없는 SHA-256) 해시는 로그인 성공 시 PBKDF2로 자동 업그레이드
  if (isLegacyHash(found.passwordHash)) {
    const upgraded = await hashPassword(password);
    write(
      THERAPISTS_KEY,
      therapists.map((t) => (t.uid === found.uid ? { ...t, passwordHash: upgraded } : t))
    );
  }

  const session: Therapist = {
    uid: found.uid,
    id: found.id,
    name: found.name,
    role: found.role,
  };
  // 기본 비밀번호(0000)로 로그인한 경우 변경 권장 배너를 위해 표시 (차단하지 않음)
  if (password === DEFAULT_PASSWORD) {
    session.usingDefaultPassword = true;
  }
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
   환자 식별자 (patientId)
   ══════════════════════════════════════════
   동명이인 구분을 위해 노트마다 내부 환자 ID를 부여한다.
   매칭 규칙: 차트번호 → 이름+생년월일 → (백필 한정) 이름 단독 → 신규 발급 */

function newPatientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `patient-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function resolvePatientId(
  note: NoteData,
  pool: NoteData[],
  options: { allowNameOnly?: boolean } = {}
): string {
  if (note.patientId) return note.patientId;

  const chartNo = note.chartNo?.trim();
  if (chartNo) {
    const match = pool.find((n) => n.patientId && n.chartNo?.trim() === chartNo);
    if (match?.patientId) return match.patientId;
  }

  const name = note.patientName?.trim();
  const birth = note.birthDate?.trim();
  if (name && birth) {
    const match = pool.find(
      (n) => n.patientId && n.patientName?.trim() === name && n.birthDate?.trim() === birth
    );
    if (match?.patientId) return match.patientId;
  }

  // 구데이터 백필용 이름 단독 매칭 — 동명이인 오병합을 막기 위해
  // "양쪽 모두 차트번호·생년월일이 전혀 없는" 완전히 구분 불가능한
  // 레코드끼리만 묶는다. (생년월일이 다른 동명이인은 절대 병합하지 않음)
  if (options.allowNameOnly && name && !birth && !chartNo) {
    const match = pool.find(
      (n) =>
        n.patientId &&
        n.patientName?.trim() === name &&
        !n.birthDate?.trim() &&
        !n.chartNo?.trim()
    );
    if (match?.patientId) return match.patientId;
  }

  return newPatientId();
}

/** patientId가 없는 기존 노트에 백필. 모든 노트에 있으면 no-op (idempotent). */
async function ensurePatientIds(notes: NoteData[]): Promise<NoteData[]> {
  if (notes.length === 0 || notes.every((n) => n.patientId)) return notes;

  // 먼저 기록된 노트 기준으로 그룹핑되도록 savedAt 오름차순으로 부여
  const ordered = [...notes].sort(
    (a, b) => new Date(a.savedAt || 0).getTime() - new Date(b.savedAt || 0).getTime()
  );
  for (const note of ordered) {
    if (!note.patientId) {
      note.patientId = resolvePatientId(note, ordered, { allowNameOnly: true });
    }
  }
  await writeNotes(notes);
  return notes;
}

/* ══════════════════════════════════════════
   Notes CRUD
   ══════════════════════════════════════════ */

/**
 * painAreas 형식 정규화.
 * 표준 형식: PainEntry[] ({view, region, painLevel}) — 자매 앱들과 공유.
 * 구버전 Record<string, number> (부위명 → 1|2|3)는 부위명으로 view 를
 * 역추정해 변환. 전면·후면 양쪽에 존재하는 부위명(전완·종아리 등)은
 * 구형식에 view 정보가 없어 전면(anterior)으로 귀속 (결정적 규칙).
 */
const VALID_VIEWS = new Set<string>(["anterior", "posterior"]);

let _regionViewMap: Map<string, PainView> | null = null;

/** 부위명 → view 매핑 (도해 데이터에서 생성, 전면 우선) */
function getRegionViewMap(): Map<string, PainView> {
  if (_regionViewMap) return _regionViewMap;
  const m = new Map<string, PainView>();
  const add = (name: string, view: PainView) => {
    if (!m.has(name)) m.set(name, view);
  };
  for (const s of ANT_CENTER) add(s.name, "anterior");
  for (const s of ANT_PAIRED) {
    add(`우측 ${s.base}`, "anterior");
    add(`좌측 ${s.base}`, "anterior");
  }
  for (const s of POST_CENTER) add(s.name, "posterior");
  for (const s of POST_PAIRED) {
    add(`우측 ${s.base}`, "posterior");
    add(`좌측 ${s.base}`, "posterior");
  }
  _regionViewMap = m;
  return m;
}

function sanitizePainAreas(note: NoteData): NoteData {
  const pa = note.painAreas as unknown;

  // 표준 형식 (PainEntry[]) — 항목별 구조·범위 검증
  if (Array.isArray(pa)) {
    const clean: PainEntry[] = [];
    for (const item of pa) {
      if (item && typeof item === "object" && "region" in item && "painLevel" in item) {
        const { view, region, painLevel } = item as { view?: unknown; region?: unknown; painLevel?: unknown };
        if (
          typeof region === "string" &&
          typeof painLevel === "number" &&
          painLevel >= 1 &&
          painLevel <= 3 &&
          typeof view === "string" &&
          VALID_VIEWS.has(view)
        ) {
          clean.push({ view: view as PainView, region, painLevel: painLevel as PainLevel });
        }
      }
      // string[] 등 그 외 항목은 변환 불가 → 무시
    }
    return { ...note, painAreas: clean };
  }

  // 구버전 Record<string, number> → PainEntry[] (부위명으로 view 역추정)
  if (pa && typeof pa === "object") {
    const regionView = getRegionViewMap();
    const entries: PainEntry[] = [];
    for (const [region, level] of Object.entries(pa as Record<string, unknown>)) {
      if (typeof level === "number" && level >= 1 && level <= 3) {
        entries.push({
          view: regionView.get(region) ?? "anterior",
          region,
          painLevel: level as PainLevel,
        });
      }
    }
    return { ...note, painAreas: entries };
  }

  // null/undefined 등
  return { ...note, painAreas: [] };
}

export async function fetchNotes(): Promise<NoteData[]> {
  const notes = await ensurePatientIds(await readNotes());
  return notes
    .map(sanitizePainAreas)
    .sort((a, b) => new Date(b.savedAt || 0).getTime() - new Date(a.savedAt || 0).getTime());
}

export async function upsertNote(note: NoteData): Promise<NoteData> {
  const session = read<Therapist | null>(SESSION_KEY, null);
  const pool = await ensurePatientIds(await readNotes());
  const enriched: NoteData = {
    ...note,
    // 같은 id 의 기존 노트가 있으면 그 patientId 를 재사용 — 폼이 patientId 를
    // 돌려받지 못한 경우에도 재저장 churn 이 발생하지 않도록 이중 방어
    patientId:
      note.patientId ||
      pool.find((n) => n.id === note.id)?.patientId ||
      resolvePatientId(note, pool),
    therapist: note.therapist ?? session ?? undefined,
    therapistUid: note.therapistUid || session?.uid || "",
  };

  const idx = pool.findIndex((n) => n.id === enriched.id);
  if (idx >= 0) {
    // 기존 노트 덮어쓰기 전 스냅샷 — 의무기록 수정 이력 보존 (실수로 덮어쓴 내용 복원 가능)
    await snapshotBeforeDestructive("before-edit", pool);
    pool[idx] = enriched;
  } else {
    pool.unshift(enriched);
  }
  await writeNotes(pool);
  return enriched;
}

export async function deleteNotes(ids: string[]): Promise<void> {
  const notes = await readNotes();
  await snapshotBeforeDestructive("before-delete", notes);
  await writeNotes(notes.filter((n) => !ids.includes(n.id || "")));
}

export async function transferNotesRpc(
  fromUid: string,
  toUid: string,
  toName: string,
  toLoginId: string | null
): Promise<number> {
  const notes = await readNotes();
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
  await writeNotes(updated);
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

/**
 * 퇴사 처리된 치료사 레코드를 영구 삭제.
 * 마스터 계정·재직 중 치료사는 삭제 불가 (UI 우회 대비 데이터 계층 방어).
 */
export async function deleteTherapistDb(uid: string): Promise<void> {
  const therapists = read<TherapistRecord[]>(THERAPISTS_KEY, []);
  const target = therapists.find((t) => t.uid === uid);
  if (!target) throw new Error("해당 치료사를 찾을 수 없습니다.");
  if (target.role === "master") throw new Error("마스터 계정은 삭제할 수 없습니다.");
  if (!target.resigned) throw new Error("퇴사 처리된 치료사만 삭제할 수 있습니다.");
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

  // 기본 비밀번호 상태 해제 (새로고침 후에도 유지되도록 세션 갱신)
  if (session.usingDefaultPassword) {
    const updatedSession = { ...session };
    delete updatedSession.usingDefaultPassword;
    write(SESSION_KEY, updatedSession);
  }
}

/** master 전용: 특정 치료사의 비밀번호를 재설정 (백업 복원 등으로 비밀번호가 없는 계정용) */
export async function resetTherapistPasswordDb(
  uid: string,
  newPassword: string
): Promise<void> {
  const session = read<Therapist | null>(SESSION_KEY, null);
  if (!session || session.role !== "master") {
    throw new Error("마스터 계정만 비밀번호를 재설정할 수 있습니다.");
  }

  const therapists = read<TherapistRecord[]>(THERAPISTS_KEY, []);
  if (!therapists.some((t) => t.uid === uid)) {
    throw new Error("해당 치료사를 찾을 수 없습니다.");
  }
  const passwordHash = await hashPassword(newPassword);
  write(
    THERAPISTS_KEY,
    therapists.map((t) => (t.uid === uid ? { ...t, passwordHash } : t))
  );
}

/* ══════════════════════════════════════════
   Export / Import
   ══════════════════════════════════════════ */

export async function exportAllData(): Promise<string> {
  const notes = await ensurePatientIds(await readNotes());
  // 비밀번호 해시는 절대 백업에 포함하지 않는다 (v3부터 제외)
  const therapists = read<TherapistRecord[]>(THERAPISTS_KEY, []).map((t) => ({
    uid: t.uid,
    id: t.id,
    name: t.name,
    role: t.role,
    resigned: t.resigned,
  }));
  return JSON.stringify(
    { version: 3, exportedAt: new Date().toISOString(), notes, therapists },
    null,
    2
  );
}

export async function importNotes(notes: NoteData[]): Promise<number> {
  if (notes.length === 0) return 0;
  const existing = await ensurePatientIds(await readNotes());
  await snapshotBeforeDestructive("before-import", existing);
  const existingIds = new Set(existing.map((n) => n.id));
  const newOnes = notes.filter((n) => !existingIds.has(n.id));
  if (newOnes.length === 0) return 0;

  // patientId가 없는 노트에는 기존+가져오는 노트 전체를 기준으로 부여
  const pool = [...existing, ...newOnes];
  for (const n of newOnes) {
    if (!n.patientId) {
      n.patientId = resolvePatientId(n, pool, { allowNameOnly: true });
    }
  }

  await writeNotes([...newOnes, ...existing]);
  return newOnes.length;
}

/* ── 자동 백업 복원 ── */

export async function listAutoBackups(): Promise<BackupSnapshot[]> {
  return listBackups();
}

/**
 * 자동 백업 스냅샷으로 전체 복원 (현재 노트를 스냅샷 내용으로 교체).
 * 복원 직전 현재 상태를 추가 스냅샷으로 남겨 복원 자체도 되돌릴 수 있게 한다.
 */
export async function restoreAutoBackup(at: string): Promise<number> {
  const snapshots = await listBackups();
  const target = snapshots.find((s) => s.at === at);
  if (!target) throw new Error("해당 백업을 찾을 수 없습니다.");

  const current = await readNotes();
  await snapshotBeforeDestructive("before-restore", current);
  await writeNotes(target.notes);
  return target.notes.length;
}

/** 백업 복원용 치료사 레코드 — 비밀번호 해시는 백업에 없으므로 선택 필드 */
export type ImportableTherapist = Omit<TherapistRecord, "passwordHash"> & {
  passwordHash?: string;
};

export async function importTherapists(therapists: ImportableTherapist[]): Promise<number> {
  await ensureBootstrapMaster();
  if (!Array.isArray(therapists) || therapists.length === 0) return 0;

  const existing = read<TherapistRecord[]>(THERAPISTS_KEY, []);
  const existingUids = new Set(existing.map((t) => t.uid));
  const newOnes = therapists
    .filter(
      (t) =>
        t &&
        typeof t.uid === "string" &&
        typeof t.name === "string" &&
        t.role !== "master" && // master는 기기마다 자체 관리 (중복 master 방지)
        !existingUids.has(t.uid)
    )
    // 보안상 백업의 해시는 신뢰하지 않고 항상 비밀번호 미설정 상태로 복원.
    // 복원된 계정은 master가 '비밀번호 재설정'으로 활성화한다.
    .map((t) => ({
      uid: t.uid,
      id: t.id ?? null,
      name: t.name,
      role: "therapist" as const,
      resigned: !!t.resigned,
      passwordHash: "",
    }));
  if (newOnes.length === 0) return 0;

  write(THERAPISTS_KEY, [...existing, ...newOnes]);
  return newOnes.length;
}
