// AG<-CG localDataService — ported from pt-note-with-chatgpt
import { seedLegacyAdmin } from "./testAuth";
import { describe, it, expect, beforeEach } from "vitest";
import * as ds from "@/lib/localDataService";
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
  noteDate: "2026-04-28",
  therapist: null,
  therapistUid: "",
  ...overrides,
});

beforeEach(async () => {
  // 각 테스트마다 깨끗한 localStorage 로 시작
  await seedLegacyAdmin();
  invalidateEncKeyCache();
});

describe("localDataService — export / import security", () => {
  it("exportAllData strips password hashes from the backup file", async () => {
    await ds.signIn("master", "0000"); // bootstrap master
    const json = await ds.exportAllData();
    expect(json).not.toMatch(/pbkdf2v1:/);
    const parsed = JSON.parse(json);
    expect(parsed.therapists[0].passwordHash ?? "").toBe(""); // Antigravity 는 필드 자체를 생략
  });

  it("importNotes (레거시/호환 경로) sanitizes strings and drops malformed notes", async () => {
    const clinical = "onset = 3일 전, pronation = 80도";
    const count = await ds.importNotes([
      sampleNote({ id: "leg-1", treatment: clinical, chiefComplaint: '<script>x</script><img onclick="a"> 주호소' }),
      { id: "", savedAt: "2026-01-01" } as NoteData, // id 없음 → 제외
      { patientName: "no-id" } as NoteData, // id/savedAt 없음 → 제외
    ]);
    expect(count).toBe(1);

    const note = (await ds.fetchNotes()).find((n) => n.id === "leg-1")!;
    expect(note.treatment).toBe(clinical); // 임상 문구 보존
    expect(note.chiefComplaint).not.toContain("<script");
    expect(note.chiefComplaint).not.toMatch(/onclick\s*=\s*["']/i);
    expect(note.chiefComplaint).toContain("주호소");
  });
});

describe("localDataService — decrypt failure safety", () => {
  it("preserves the original ciphertext when the encryption key is lost", async () => {
    await ds.upsertNote(sampleNote({ id: "n1" }));
    const original = window.localStorage.getItem("pt_local_notes")!;

    // 암호화 키 유실 시뮬레이션 — 다른 키로 교체
    window.localStorage.setItem("pt_enc_key_v1", "00".repeat(32));
    invalidateEncKeyCache();

    await expect(ds.fetchNotes()).rejects.toThrow();
    await expect(ds.upsertNote(sampleNote({ id: "n2" }))).rejects.toThrow();
    expect(window.localStorage.getItem("pt_local_notes")).toBe(original);
  });
});
