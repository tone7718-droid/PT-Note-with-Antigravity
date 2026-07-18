import { describe, it, expect, beforeEach } from "vitest";
import * as ds from "@/lib/localDataService";
import { listBackups } from "@/lib/autoBackup";
import { invalidateEncKeyCache } from "@/lib/cryptoService";
import type { NoteData } from "@/types";

const sampleNote = (overrides: Partial<NoteData> = {}): NoteData => ({
  id: `note-${Math.random().toString(36).slice(2, 9)}`,
  savedAt: new Date().toISOString(),
  patientName: "홍길동",
  chartNo: "0001",
  birthDate: "1990-01-01",
  gender: "M",
  diagnosis: "",
  pmh: "",
  painScore: null,
  painAreas: [],
  chiefComplaint: "",
  rom: [],
  postural: "",
  palpation: "",
  specialTest: "",
  treatment: "",
  homeExercise: "",
  noteDate: "2026-07-10",
  therapist: null,
  therapistUid: "",
  ...overrides,
});

beforeEach(() => {
  window.localStorage.clear();
  invalidateEncKeyCache();
});

describe("localDataService — 암호화 저장", () => {
  it("saves notes encrypted (환자명이 localStorage 에 평문으로 남지 않음)", async () => {
    await ds.upsertNote(sampleNote({ id: "n1", patientName: "김환자" }));
    const raw = window.localStorage.getItem("pt_local_notes")!;
    expect(raw).not.toContain("김환자");

    const all = await ds.fetchNotes();
    expect(all).toHaveLength(1);
    expect(all[0].patientName).toBe("김환자");
  });

  it("migrates legacy plaintext notes to encrypted storage on read", async () => {
    const legacy = [sampleNote({ id: "legacy-1", patientName: "평문환자" })];
    window.localStorage.setItem("pt_local_notes", JSON.stringify(legacy));

    const notes = await ds.fetchNotes();
    expect(notes).toHaveLength(1);
    expect(notes[0].patientName).toBe("평문환자");
    expect(window.localStorage.getItem("pt_local_notes")!).not.toContain("평문환자");
  });

  it("quarantines undecryptable data instead of silently losing it", async () => {
    window.localStorage.setItem("pt_local_notes", "corrupted-not-json{{{");

    expect(await ds.fetchNotes()).toEqual([]);

    const quarantineKeys = Object.keys(window.localStorage).filter((k) =>
      k.startsWith("pt_local_notes_corrupt_")
    );
    expect(quarantineKeys).toHaveLength(1);
    expect(window.localStorage.getItem(quarantineKeys[0])).toBe("corrupted-not-json{{{");

    await ds.upsertNote(sampleNote({ id: "new-1" }));
    expect(window.localStorage.getItem(quarantineKeys[0])).toBe("corrupted-not-json{{{");
    expect(await ds.fetchNotes()).toHaveLength(1);
  });
});

describe("localDataService — 자동 백업 스냅샷", () => {
  it("snapshots before delete and preserves the deleted note", async () => {
    await ds.upsertNote(sampleNote({ id: "keep-1", patientName: "복원대상" }));
    await ds.deleteNotes(["keep-1"]);

    expect(await ds.fetchNotes()).toHaveLength(0);

    const backups = await listBackups();
    expect(backups.length).toBeGreaterThan(0);
    const last = backups[backups.length - 1];
    expect(last.reason).toBe("before-delete");
    expect(last.notes.map((n) => n.id)).toEqual(["keep-1"]);
  });

  it("snapshots before import", async () => {
    await ds.upsertNote(sampleNote({ id: "old-1" }));
    await ds.importNotes([sampleNote({ id: "new-1" })]);

    const backups = await listBackups();
    expect(backups.some((b) => b.reason === "before-import")).toBe(true);
    expect(await ds.fetchNotes()).toHaveLength(2);
  });

  it("restores notes from an auto-backup snapshot (복원 직전 상태도 스냅샷)", async () => {
    await ds.upsertNote(sampleNote({ id: "keep-1", patientName: "복원대상" }));
    await ds.deleteNotes(["keep-1"]);
    await ds.upsertNote(sampleNote({ id: "temp-1", patientName: "복원으로대체될노트" }));

    const backups = await ds.listAutoBackups();
    const target = backups.find((b) => b.reason === "before-delete")!;
    const restored = await ds.restoreAutoBackup(target.at);

    expect(restored).toBe(1);
    const notes = await ds.fetchNotes();
    expect(notes.map((n) => n.id)).toEqual(["keep-1"]);

    // 복원 직전 상태(temp-1)도 before-restore 스냅샷으로 남는다
    const after = await ds.listAutoBackups();
    const preRestore = after[after.length - 1];
    expect(preRestore.reason).toBe("before-restore");
    expect(preRestore.notes.map((n) => n.id)).toEqual(["temp-1"]);
  });

  it("throws for an unknown snapshot timestamp", async () => {
    await expect(ds.restoreAutoBackup("1999-01-01T00:00:00.000Z")).rejects.toThrow(
      "해당 백업을 찾을 수 없습니다."
    );
  });
});

describe("localDataService — patientId", () => {
  it("keeps the same patientId when re-saving a note without identifiers (no churn)", async () => {
    const first = await ds.upsertNote(
      sampleNote({ id: "x", chartNo: "", birthDate: "", patientName: "" })
    );
    const again = await ds.upsertNote(
      sampleNote({ id: "x", chartNo: "", birthDate: "", patientName: "" })
    );
    expect(first.patientId).toBeTruthy();
    expect(again.patientId).toBe(first.patientId);
  });

  it("groups notes by chart number", async () => {
    const a = await ds.upsertNote(sampleNote({ id: "a", chartNo: "C-1" }));
    const b = await ds.upsertNote(sampleNote({ id: "b", chartNo: "C-1" }));
    expect(b.patientId).toBe(a.patientId);
  });
});
