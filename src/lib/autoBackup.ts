/**
 * 조용한 자동 백업 — 파괴적 작업(삭제 / import) 직전에 현재 노트 전체를
 * localStorage 링버퍼에 스냅샷으로 남긴다. 사용자에게는 노출하지 않음.
 *
 * 사용자 보호: "방금 삭제했는데 잘못 눌렀다" 같은 사고 시 복원 단서를 남기는 게 목적.
 * 복원은 사이드바 메뉴(자동 백업 복원, master 전용)에서 가능하며, 콘솔에서
 * `await listBackups()` 로도 접근 가능 (노트 본문과 동일하게 AES-GCM 암호화 저장).
 *
 * 저장 키: localStorage["pt_auto_backup_v1"]
 * 형식:    encryptData(JSON.stringify({ snapshots: BackupSnapshot[] })) — 최신이 배열 끝.
 * 보관:    최근 MAX_SNAPSHOTS 개만 유지. 쿼터 초과 시 가장 오래된 것부터 비우며 재시도.
 */

import type { NoteData } from "@/types";
import { encryptData, decryptData } from "@/lib/cryptoService";

const KEY = "pt_auto_backup_v1";
const MAX_SNAPSHOTS = 5;

export type BackupReason = "before-delete" | "before-import" | "before-restore" | "before-edit";

export interface BackupSnapshot {
  at: string;          // ISO timestamp
  reason: BackupReason;
  noteCount: number;
  notes: NoteData[];
}

interface BackupStore {
  snapshots: BackupSnapshot[];
}

async function readStore(): Promise<BackupStore> {
  if (typeof window === "undefined") return { snapshots: [] };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { snapshots: [] };
    let json: string;
    try {
      json = await decryptData(raw);
    } catch {
      json = raw; // 암호화 전 평문 데이터 폴백 (다음 write 때 암호화로 업그레이드됨)
    }
    const parsed = JSON.parse(json);
    if (!parsed || !Array.isArray(parsed.snapshots)) throw new Error("백업 형식 오류");
    if (parsed.snapshots.some((snap: BackupSnapshot) => !snap || typeof snap.at !== "string" || !Number.isFinite(Date.parse(snap.at)) || !Array.isArray(snap.notes))) throw new Error("백업 항목 오류");
    return parsed as BackupStore;
  } catch {
    throw new Error("자동 백업을 읽을 수 없어 작업을 중단했습니다. 원본을 보존했습니다.");
  }
}

async function writeStore(store: BackupStore): Promise<boolean> {
  if (typeof window === "undefined") return false;
  /* 쿼터 초과 시 오래된 스냅샷부터 1개씩 버려가며 재시도. 최후 1개도 못 넣으면 포기. */
  let snapshots = [...store.snapshots];
  for (let i = 0; i < MAX_SNAPSHOTS; i++) {
    try {
      const encrypted = await encryptData(JSON.stringify({ snapshots }));
      window.localStorage.setItem(KEY, encrypted);
      return true;
    } catch {
      if (snapshots.length <= 1) return false;
      snapshots = snapshots.slice(1);
    }
  }
  return false;
}

/** 파괴적 작업 직전 호출. 백업 저장 실패 시 throw 하여 원본 변경을 중단한다. */
export async function snapshotBeforeDestructive(reason: BackupReason, notes: NoteData[]): Promise<void> {
  if (typeof window === "undefined") return;
  if (!Array.isArray(notes)) throw new Error("백업 기록 형식 오류");

  const snap: BackupSnapshot = {
    at: new Date().toISOString(),
    reason,
    noteCount: notes.length,
    notes,
  };
  const store = await readStore();
  const lastAt = store.snapshots.at(-1)?.at;
  if (lastAt) snap.at = new Date(Math.max(Date.now(), new Date(lastAt).getTime() + 1)).toISOString();
  const next = [...store.snapshots, snap].slice(-MAX_SNAPSHOTS);
  if (!await writeStore({ snapshots: next })) throw new Error("자동 백업 저장에 실패하여 작업을 중단했습니다. 저장 공간을 확인해주세요.");
}

/** 복원 UI(BackupRestoreModal) / 콘솔 디버깅용. 최신이 배열 끝. */
export async function listBackups(): Promise<BackupSnapshot[]> {
  return (await readStore()).snapshots;
}
