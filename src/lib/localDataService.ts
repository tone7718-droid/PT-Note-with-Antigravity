import { currentActor, openSession, closeSession, requireMaster, requireNoteAccess, canAccessNote, hospitalId } from "@/lib/accessControl";
import { prepareNotesWrite, includeImportedHistory, readHistory, setHistoryOperation } from "@/lib/recordHistory";
import { withDataLock, commitData } from "@/lib/storageLock";
import { parseExchangeBackup, normalizeExchangeTherapist, reconcilePatients, mergeTherapists, type ImportResult } from "@/lib/backupExchange";
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
import { decryptData, encryptWithPassphrase, decryptWithPassphrase } from "./cryptoService";
import { snapshotBeforeDestructive, listBackups, type BackupSnapshot } from "./autoBackup";
import { DEFAULT_PASSWORD } from "./passwordPolicy";

/* ── Storage Keys ── */
const NOTES_KEY = "pt_local_notes";
const THERAPISTS_KEY = "pt_local_therapists";

/* ══════════════════════════════════════════
   Helpers
   ══════════════════════════════════════════ */

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    throw new Error("계정 또는 세션 저장소를 읽을 수 없습니다. 원본을 보존했습니다.");
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
  commitData(await prepareNotesWrite(notes));
}

/**
 * 복호화/파싱이 모두 실패한 원본을 별도 키에 격리 보관.
 * readNotes 가 빈 배열을 반환한 뒤 사용자가 노트를 저장하면 NOTES_KEY 가
 * 덮어써지므로, 격리해 두지 않으면 원본이 영구 소실됨 (암호화 키 손상 대비).
 */

/**
 * 환자 노트 복호화 읽기.
 * 기존 평문 데이터(마이그레이션 전)는 JSON 폴백으로 자동 처리.
 * 복호화·파싱 모두 실패 시 원본을 격리 보관 후 빈 배열 반환.
 */
async function readNotes(): Promise<NoteData[]> {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(NOTES_KEY);
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = raw.trimStart().startsWith("[") ? JSON.parse(raw) : JSON.parse(await decryptData(raw)); }
  catch { throw new Error("기록을 읽을 수 없습니다. 원본을 보존하기 위해 저장을 중단했습니다. 암호화 키와 백업을 확인해주세요."); }
  if (!Array.isArray(parsed)) throw new Error("기록 저장소가 손상되었습니다. 원본을 보존하고 저장을 중단했습니다.");
  const checked = parseExchangeBackup({ notes: parsed.map(sanitizePainAreas) });
  if (checked.skippedCount || checked.duplicateCount) throw new Error("기록 저장소에 잘못된 항목 또는 중복 ID가 있습니다. 원본을 보존하고 복구가 필요합니다.");
  return checked.notes;
}


async function ensureBootstrapMaster(): Promise<void> {
  const records = read<TherapistRecord[]>(THERAPISTS_KEY, []);
  if (!Array.isArray(records)) throw new Error("계정 저장소가 손상되었습니다.");
}
async function isSetupRequiredUnlocked(): Promise<boolean> {
  await ensureBootstrapMaster();
  return read<TherapistRecord[]>(THERAPISTS_KEY, []).length === 0;
}
async function setupInitialMasterUnlocked(name: string, password: string): Promise<void> {
  if (!await isSetupRequiredUnlocked()) throw new Error("이미 관리자 계정이 설정되어 있습니다.");
  if (!name.trim() || password.length < 8) throw new Error("관리자 이름과 8자 이상의 비밀번호를 입력해주세요.");
  hospitalId();
  write(THERAPISTS_KEY, [{ uid: "master-default", id: "master", name: name.trim(), role: "master", resigned: false, passwordHash: await hashPassword(password) }]);
}


/* ══════════════════════════════════════════
   Auth
   ══════════════════════════════════════════ */

async function signInUnlocked(
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
  openSession(session);
  return { therapist: session };
}

async function signOutUnlocked(): Promise<void> {
  if (typeof window === "undefined") return;
  closeSession();
}

type AuthSubscription = { unsubscribe: () => void };

export function onAuthStateChange(
  callback: (therapist: Therapist | null) => void
): { data: { subscription: AuthSubscription } } {
  // 페이지 로드 시 저장된 세션 복원
  void withDataLock(ensureBootstrapMaster).then(() => {
    const session = currentActor();
    callback(session);
  }).catch(() => callback(null));

  return {
    data: {
      subscription: { unsubscribe: () => {} },
    },
  };
}

async function reauthenticateUnlocked(
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

async function fetchNotesUnlocked(): Promise<NoteData[]> {
  const notes = await ensurePatientIds(await readNotes());
  return notes
    .filter(n => canAccessNote(n, currentActor()))
    .map(sanitizePainAreas)
    .sort((a, b) => new Date(b.savedAt || 0).getTime() - new Date(a.savedAt || 0).getTime());
}

async function upsertNoteUnlocked(note: NoteData, expectedSavedAt?: string): Promise<NoteData> {
  const session = currentActor();
  const pool = await ensurePatientIds(await readNotes());
  const existingRecord = pool.find(n => n.id === note.id);
  if (existingRecord) requireNoteAccess(existingRecord, session);
  else if (session.role !== "master" && note.therapistUid && note.therapistUid !== session.uid) throw new Error("다른 치료사의 기록을 만들 수 없습니다.");
  if (expectedSavedAt !== undefined && pool.find(n => n.id === note.id)?.savedAt !== expectedSavedAt) {
    throw new Error("다른 창에서 이 기록이 변경되거나 삭제되었습니다. 현재 입력 내용을 복사해 보관한 뒤 기록을 다시 열어주세요.");
  }
  const enriched: NoteData = {
    ...note,
    savedAt: new Date(Math.max(Date.now(), (Date.parse(existingRecord?.savedAt ?? "") || 0) + 1)).toISOString(),
    // 같은 id 의 기존 노트가 있으면 그 patientId 를 재사용 — 폼이 patientId 를
    // 돌려받지 못한 경우에도 재저장 churn 이 발생하지 않도록 이중 방어
    patientId:
      note.patientId ||
      pool.find((n) => n.id === note.id)?.patientId ||
      resolvePatientId(note, pool),
    therapist: existingRecord?.therapist ?? (session.role === "master" ? note.therapist : null) ?? session,
    therapistUid: existingRecord?.therapistUid || (session.role === "master" ? note.therapistUid : "") || session.uid,
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

async function deleteNotesUnlocked(ids: string[]): Promise<void> {
  const actor = currentActor();
  const candidates = await readNotes();
  for (const note of candidates.filter(n => n.id && ids.includes(n.id))) requireNoteAccess(note, actor);

  const notes = await readNotes();
  await snapshotBeforeDestructive("before-delete", notes);
  await writeNotes(notes.filter((n) => !ids.includes(n.id || "")));
}

async function transferNotesRpcUnlocked(
  fromUid: string,
  toUid: string,
  toName: string,
  toLoginId: string | null
): Promise<number> {
  const target = read<TherapistRecord[]>(THERAPISTS_KEY, []).find(t => t.uid === toUid && !t.resigned);
  if (!target) throw new Error("활성 상태의 담당 치료사를 선택해주세요.");
  toName = target.name; toLoginId = target.id;

  const notes = await readNotes();
  let count = 0;
  const updated = notes.map((n) => {
    if (n.therapistUid === fromUid) {
      count++;
      return {
        ...n,
        savedAt: new Date(Math.max(Date.now(), (Date.parse(n.savedAt ?? "") || 0) + 1)).toISOString(),
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
  if (count) {
    await snapshotBeforeDestructive("before-edit", notes);
    await writeNotes(updated);
  }
  return count;
}

/* ══════════════════════════════════════════
   Therapists CRUD
   ══════════════════════════════════════════ */

async function fetchTherapistsUnlocked(): Promise<TherapistRecord[]> {
  await ensureBootstrapMaster();
  const records = read<TherapistRecord[]>(THERAPISTS_KEY, []);
  return currentActor().role === "master" ? records : records.map(t => ({ ...t, passwordHash: "" }));
}

async function createTherapistViaEdgeFunctionUnlocked(
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

  if (password.length < 8) throw new Error("비밀번호는 8자 이상이어야 합니다.");
  const passwordHash = await hashPassword(password);
  const newRecord: TherapistRecord = {
    uid: `therapist-${crypto.randomUUID()}`,
    id: loginId,
    name,
    passwordHash,
    role: "therapist",
    resigned: false,
  };

  write(THERAPISTS_KEY, [...therapists, newRecord]);
  return newRecord;
}

async function resignTherapistDbUnlocked(uid: string): Promise<void> {
  if (read<TherapistRecord[]>(THERAPISTS_KEY, []).find(t => t.uid === uid)?.role === "master") throw new Error("관리자는 퇴사 처리할 수 없습니다.");

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
async function deleteTherapistDbUnlocked(uid: string): Promise<void> {
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

async function updateTherapistPasswordViaAuthUnlocked(
  newPassword: string
): Promise<void> {
  const session = currentActor();
  if (!session) throw new Error("로그인 세션이 없습니다.");

  const therapists = read<TherapistRecord[]>(THERAPISTS_KEY, []);
  if (newPassword.length < 8) throw new Error("비밀번호는 8자 이상이어야 합니다.");
  const passwordHash = await hashPassword(newPassword);
  write(
    THERAPISTS_KEY,
    therapists.map((t) => (t.uid === session.uid ? { ...t, passwordHash } : t))
  );

  openSession(session);
}

/** master 전용: 특정 치료사의 비밀번호를 재설정 (백업 복원 등으로 비밀번호가 없는 계정용) */
async function resetTherapistPasswordDbUnlocked(
  uid: string,
  newPassword: string
): Promise<void> {
  const session = currentActor();
  if (!session || session.role !== "master") {
    throw new Error("마스터 계정만 비밀번호를 재설정할 수 있습니다.");
  }

  const therapists = read<TherapistRecord[]>(THERAPISTS_KEY, []);
  if (!therapists.some((t) => t.uid === uid)) {
    throw new Error("해당 치료사를 찾을 수 없습니다.");
  }
  if (newPassword.length < 8) throw new Error("비밀번호는 8자 이상이어야 합니다.");
  const passwordHash = await hashPassword(newPassword);
  write(
    THERAPISTS_KEY,
    therapists.map((t) => (t.uid === uid ? { ...t, passwordHash } : t))
  );
}

/* ══════════════════════════════════════════
   Export / Import
   ══════════════════════════════════════════ */

async function exportAllDataUnlocked(): Promise<string> {
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
    { app: "PT-NOTE", reason: "manual", version: 3, exportedAt: new Date().toISOString(), notes, therapists, history: await readHistory() },
    null,
    2
  );
}

async function importNotesUnlocked(notes: NoteData[]): Promise<number> {
  const parsed = parseExchangeBackup({ notes });
  const existing = await readNotes();
  const ids = new Set(existing.map(n => n.id));
  const newOnes = parsed.notes.filter(n => !ids.has(n.id));
  reconcilePatients(newOnes, existing);
  if (newOnes.length) { await snapshotBeforeDestructive("before-import", existing); await writeNotes([...newOnes, ...existing]); }
  return newOnes.length;
}
/* ── 자동 백업 복원 ── */

async function listAutoBackupsUnlocked(): Promise<BackupSnapshot[]> {
  return listBackups();
}

/**
 * 자동 백업 스냅샷으로 전체 복원 (현재 노트를 스냅샷 내용으로 교체).
 * 복원 직전 현재 상태를 추가 스냅샷으로 남겨 복원 자체도 되돌릴 수 있게 한다.
 */
async function restoreAutoBackupUnlocked(at: string): Promise<number> {
  const snapshots = await listBackups();
  const target = snapshots.find((s) => s.at === at);
  if (!target) throw new Error("해당 백업을 찾을 수 없습니다.");

  const current = await readNotes();
  await snapshotBeforeDestructive("before-restore", current);
  const checked = parseExchangeBackup({ notes: target.notes });
  if (checked.skippedCount || checked.duplicateCount) throw new Error("백업 기록이 손상되어 복원을 중단했습니다.");
  await writeNotes(checked.notes);
  return checked.notes.length;
}

/** 백업 복원용 치료사 레코드 — 비밀번호 해시는 백업에 없으므로 선택 필드 */
export type ImportableTherapist = Omit<TherapistRecord, "passwordHash"> & {
  passwordHash?: string;
};

async function importTherapistsUnlocked(records: unknown[]): Promise<number> {
  await ensureBootstrapMaster();
  if (!Array.isArray(records)) throw new Error("치료사 백업 형식 오류");
  const valid = records.flatMap(r => { try { return [normalizeExchangeTherapist(r)]; } catch { return []; } });
  const existing = read<TherapistRecord[]>(THERAPISTS_KEY, []);
  const { added } = mergeTherapists(valid, existing);
  if (added.length) write(THERAPISTS_KEY, [...existing, ...added]);
  return added.length;
}
/** A single atomic, validated import path for plain, encrypted and legacy backups. */
async function importCompatibleBackupUnlocked(json: string, passphrase?: string): Promise<ImportResult> {
  const plain = isEncryptedBackup(json) ? await decryptBackupText(json, passphrase ?? "") : json;
  const parsed = parseExchangeBackup(JSON.parse(plain));
  const existing = await readNotes();
  await ensureBootstrapMaster();
  const therapists = read<TherapistRecord[]>(THERAPISTS_KEY, []);
  const ids = new Set(existing.map(n => n.id));
  const incoming = parsed.notes.filter(n => !ids.has(n.id));
  reconcilePatients(incoming, existing);
  const accounts = mergeTherapists(parsed.therapists, therapists);
  if (incoming.length || accounts.added.length) {
    await snapshotBeforeDestructive("before-import", existing);
    const values: Record<string, string> = {};
    if (incoming.length) Object.assign(values, await prepareNotesWrite([...incoming, ...existing]));
    if (accounts.added.length) values[THERAPISTS_KEY] = JSON.stringify([...therapists, ...accounts.added]);
    await includeImportedHistory(values, JSON.parse(plain).history, new Set(incoming.map(n => n.id!)));
    commitData(values);
  }
  return { notesCount: incoming.length, therapistsCount: accounts.added.length, skippedCount: parsed.skippedCount,
    duplicateCount: parsed.duplicateCount + parsed.notes.length - incoming.length + accounts.duplicates };
}

export function isEncryptedBackup(text: string): boolean {
  try { return JSON.parse(text)?.format === "ptnote-encrypted-v1"; } catch { return false; }
}
async function exportAllDataEncryptedUnlocked(passphrase: string): Promise<string> {
  const encrypted = await encryptWithPassphrase(await exportAllDataUnlocked(), passphrase);
  return JSON.stringify({ app: "PT-NOTE", format: "ptnote-encrypted-v1", exportedAt: new Date().toISOString(), ...encrypted });
}
export async function decryptBackupText(text: string, passphrase: string): Promise<string> {
  const payload = JSON.parse(text);
  if (payload.format !== "ptnote-encrypted-v1") throw new Error("암호화 백업 형식이 아닙니다.");
  try { return await decryptWithPassphrase(payload, passphrase); }
  catch { throw new Error("백업 암호 또는 파일이 올바르지 않습니다."); }
}

// Hold the origin-wide lock throughout every complete data operation.
export const signIn = (...args: Parameters<typeof signInUnlocked>): ReturnType<typeof signInUnlocked> => withDataLock(() => { setHistoryOperation("signIn"); return signInUnlocked(...args); });
export const signOut = (...args: Parameters<typeof signOutUnlocked>): ReturnType<typeof signOutUnlocked> => withDataLock(() => { setHistoryOperation("signOut"); return signOutUnlocked(...args); });
export const reauthenticate = (...args: Parameters<typeof reauthenticateUnlocked>): ReturnType<typeof reauthenticateUnlocked> => withDataLock(() => { currentActor(); setHistoryOperation("reauthenticate"); return reauthenticateUnlocked(...args); });
export const fetchNotes = (...args: Parameters<typeof fetchNotesUnlocked>): ReturnType<typeof fetchNotesUnlocked> => withDataLock(() => { currentActor(); setHistoryOperation("fetchNotes"); return fetchNotesUnlocked(...args); });
export const upsertNote = (...args: Parameters<typeof upsertNoteUnlocked>): ReturnType<typeof upsertNoteUnlocked> => withDataLock(() => { currentActor(); setHistoryOperation("upsertNote"); return upsertNoteUnlocked(...args); });
export const deleteNotes = (...args: Parameters<typeof deleteNotesUnlocked>): ReturnType<typeof deleteNotesUnlocked> => withDataLock(() => { currentActor(); setHistoryOperation("deleteNotes"); return deleteNotesUnlocked(...args); });
export const transferNotesRpc = (...args: Parameters<typeof transferNotesRpcUnlocked>): ReturnType<typeof transferNotesRpcUnlocked> => withDataLock(() => { requireMaster(); setHistoryOperation("transferNotesRpc"); return transferNotesRpcUnlocked(...args); });
export const fetchTherapists = (...args: Parameters<typeof fetchTherapistsUnlocked>): ReturnType<typeof fetchTherapistsUnlocked> => withDataLock(() => { currentActor(); setHistoryOperation("fetchTherapists"); return fetchTherapistsUnlocked(...args); });
export const createTherapistViaEdgeFunction = (...args: Parameters<typeof createTherapistViaEdgeFunctionUnlocked>): ReturnType<typeof createTherapistViaEdgeFunctionUnlocked> => withDataLock(() => { requireMaster(); setHistoryOperation("createTherapistViaEdgeFunction"); return createTherapistViaEdgeFunctionUnlocked(...args); });
export const resignTherapistDb = (...args: Parameters<typeof resignTherapistDbUnlocked>): ReturnType<typeof resignTherapistDbUnlocked> => withDataLock(() => { requireMaster(); setHistoryOperation("resignTherapistDb"); return resignTherapistDbUnlocked(...args); });
export const deleteTherapistDb = (...args: Parameters<typeof deleteTherapistDbUnlocked>): ReturnType<typeof deleteTherapistDbUnlocked> => withDataLock(() => { requireMaster(); setHistoryOperation("deleteTherapistDb"); return deleteTherapistDbUnlocked(...args); });
export const updateTherapistPasswordViaAuth = (...args: Parameters<typeof updateTherapistPasswordViaAuthUnlocked>): ReturnType<typeof updateTherapistPasswordViaAuthUnlocked> => withDataLock(() => { currentActor(); setHistoryOperation("updateTherapistPasswordViaAuth"); return updateTherapistPasswordViaAuthUnlocked(...args); });
export const resetTherapistPasswordDb = (...args: Parameters<typeof resetTherapistPasswordDbUnlocked>): ReturnType<typeof resetTherapistPasswordDbUnlocked> => withDataLock(() => { requireMaster(); setHistoryOperation("resetTherapistPasswordDb"); return resetTherapistPasswordDbUnlocked(...args); });
export const exportAllData = (...args: Parameters<typeof exportAllDataUnlocked>): ReturnType<typeof exportAllDataUnlocked> => withDataLock(() => { requireMaster(); setHistoryOperation("exportAllData"); return exportAllDataUnlocked(...args); });
export const importNotes = (...args: Parameters<typeof importNotesUnlocked>): ReturnType<typeof importNotesUnlocked> => withDataLock(() => { requireMaster(); setHistoryOperation("importNotes"); return importNotesUnlocked(...args); });
export const listAutoBackups = (...args: Parameters<typeof listAutoBackupsUnlocked>): ReturnType<typeof listAutoBackupsUnlocked> => withDataLock(() => { requireMaster(); setHistoryOperation("listAutoBackups"); return listAutoBackupsUnlocked(...args); });
export const restoreAutoBackup = (...args: Parameters<typeof restoreAutoBackupUnlocked>): ReturnType<typeof restoreAutoBackupUnlocked> => withDataLock(() => { requireMaster(); setHistoryOperation("restoreAutoBackup"); return restoreAutoBackupUnlocked(...args); });
export const importTherapists = (...args: Parameters<typeof importTherapistsUnlocked>): ReturnType<typeof importTherapistsUnlocked> => withDataLock(() => { requireMaster(); setHistoryOperation("importTherapists"); return importTherapistsUnlocked(...args); });
export const importCompatibleBackup = (...args: Parameters<typeof importCompatibleBackupUnlocked>): ReturnType<typeof importCompatibleBackupUnlocked> => withDataLock(() => { requireMaster(); setHistoryOperation("importCompatibleBackup"); return importCompatibleBackupUnlocked(...args); });
export const exportAllDataEncrypted = (...args: Parameters<typeof exportAllDataEncryptedUnlocked>): ReturnType<typeof exportAllDataEncryptedUnlocked> => withDataLock(() => { requireMaster(); setHistoryOperation("exportAllDataEncrypted"); return exportAllDataEncryptedUnlocked(...args); });

export const isSetupRequired = () => withDataLock(isSetupRequiredUnlocked);
export const setupInitialMaster = (name: string, password: string) => withDataLock(() => setupInitialMasterUnlocked(name, password));
export const fetchRecordHistory = (id: string) => withDataLock(async () => {
  const actor = currentActor();
  const note = (await readNotes()).find(n => n.id === id);
  if (note) requireNoteAccess(note, actor); else requireMaster();
  return (await readHistory()).filter(entry => entry.noteId === id);
});
