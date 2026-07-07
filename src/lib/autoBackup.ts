import type { NoteData } from "@/types";
import { decryptData, encryptData } from "@/lib/cryptoService";

const KEY = "pt_auto_backup_v1";
const MAX_SNAPSHOTS = 5;

export type BackupReason = "before-delete" | "before-import" | "before-restore";

export interface BackupSnapshot {
  at: string;
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
      json = raw;
    }
    const parsed = JSON.parse(json);
    if (!parsed || !Array.isArray(parsed.snapshots)) return { snapshots: [] };
    return parsed as BackupStore;
  } catch {
    return { snapshots: [] };
  }
}

async function writeStore(store: BackupStore): Promise<boolean> {
  if (typeof window === "undefined") return false;
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

export async function snapshotBeforeDestructive(reason: BackupReason, notes: NoteData[]): Promise<void> {
  if (typeof window === "undefined") return;
  if (!Array.isArray(notes) || notes.length === 0) return;

  const snap: BackupSnapshot = {
    at: new Date().toISOString(),
    reason,
    noteCount: notes.length,
    notes,
  };
  const store = await readStore();
  const next = [...store.snapshots, snap].slice(-MAX_SNAPSHOTS);
  await writeStore({ snapshots: next });
}

export async function listBackups(): Promise<BackupSnapshot[]> {
  return (await readStore()).snapshots;
}
