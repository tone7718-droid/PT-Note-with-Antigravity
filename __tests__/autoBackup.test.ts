// ported from pt-progress-note
import { describe, it, expect, beforeEach } from "vitest";
import { snapshotBeforeDestructive, listBackups } from "@/lib/autoBackup";
import type { NoteData } from "@/types";

const KEY = "pt_auto_backup_v1";

const makeNote = (id: string, name: string): NoteData => ({
  id,
  savedAt: new Date().toISOString(),
  patientName: name,
  chartNo: "",
  birthDate: "",
  gender: "",
  diagnosis: "",
  pmh: "",
  painScore: null,
  painAreas: [],
  chiefComplaint: "",
  postural: "",
  palpation: "",
  specialTest: "",
  treatment: "",
  homeExercise: "",
  rom: [],
  noteDate: "",
  therapist: null,
  therapistUid: "",
});

beforeEach(() => {
  localStorage.removeItem(KEY);
});

describe("autoBackup", () => {
  it("preserves an empty state for undo", async () => {
    await snapshotBeforeDestructive("before-delete", []);
    expect((await listBackups())[0].notes).toEqual([]);
  });

  it("writes a snapshot before destructive action", async () => {
    const notes = [makeNote("n1", "환자A"), makeNote("n2", "환자B")];
    await snapshotBeforeDestructive("before-delete", notes);

    const list = await listBackups();
    expect(list).toHaveLength(1);
    expect(list[0].reason).toBe("before-delete");
    expect(list[0].noteCount).toBe(2);
    expect(list[0].notes).toEqual(notes);
  });

  it("stores snapshots encrypted (no plaintext patient data in localStorage)", async () => {
    await snapshotBeforeDestructive("before-delete", [makeNote("n1", "환자A")]);

    const raw = localStorage.getItem(KEY)!;
    expect(raw).not.toContain("환자A");
    expect(raw).not.toContain("snapshots");
    // 그래도 listBackups 로는 복호화되어 읽힘
    const list = await listBackups();
    expect(list[0].notes[0].patientName).toBe("환자A");
  });

  it("reads legacy plaintext store and keeps it usable", async () => {
    // 암호화 도입 전 형식의 평문 스토어
    const legacy = {
      snapshots: [
        { at: new Date().toISOString(), reason: "before-delete", noteCount: 1, notes: [makeNote("old", "레거시")] },
      ],
    };
    localStorage.setItem(KEY, JSON.stringify(legacy));

    const list = await listBackups();
    expect(list).toHaveLength(1);
    expect(list[0].notes[0].patientName).toBe("레거시");

    // 다음 스냅샷 작성 시 암호화 형식으로 업그레이드됨
    await snapshotBeforeDestructive("before-import", [makeNote("n2", "새환자")]);
    expect(localStorage.getItem(KEY)!).not.toContain("레거시");
    expect(await listBackups()).toHaveLength(2);
  });

  it("keeps a ring of last 5 snapshots", async () => {
    for (let i = 0; i < 8; i++) {
      await snapshotBeforeDestructive("before-import", [makeNote(`n${i}`, `환자${i}`)]);
    }
    const list = await listBackups();
    expect(list).toHaveLength(5);
    // 가장 오래된 것이 버려졌는지 — 마지막 5개는 n3..n7
    expect(list[0].notes[0].id).toBe("n3");
    expect(list[4].notes[0].id).toBe("n7");
  });
});
