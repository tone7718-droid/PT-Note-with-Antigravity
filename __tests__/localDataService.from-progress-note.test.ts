// AG<-PN localDataService — ported from pt-progress-note
import { seedLegacyAdmin, addTransferTarget } from "./testAuth";
import { describe, it, expect, beforeEach } from "vitest";
import * as ds from "@/lib/localDataService";
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
});

describe("localDataService — auth", () => {
  it("existing legacy administrator can still sign in", async () => {
    const result = await ds.signIn("master", "0000");
    expect(result.therapist.role).toBe("master");
    expect(result.therapist.id).toBe("master");
  });

  it("signIn rejects wrong password with friendly message", async () => {
    await expect(ds.signIn("master", "wrong")).rejects.toThrow(
      /ID 또는 비밀번호/
    );
  });

  it("signIn rejects unknown ID", async () => {
    await expect(ds.signIn("nobody", "0000")).rejects.toThrow(
      /ID 또는 비밀번호/
    );
  });

  it("reauthenticate succeeds with correct password", async () => {
    await ds.signIn("master", "0000"); // bootstrap master
    expect(await ds.reauthenticate("master", "0000")).toBe(true);
    expect(await ds.reauthenticate("master", "wrong")).toBe(false);
  });
});

describe("localDataService — change own password", () => {
  it("changes password and allows re-login with the new one (old one fails)", async () => {
    await ds.signIn("master", "0000"); // 세션 확보
    await ds.updateTherapistPasswordViaAuth("Newpass1!");

    // 새 비밀번호로 재로그인 성공, 기존 0000 은 실패
    const relogin = await ds.signIn("master", "Newpass1!");
    expect(relogin.therapist.id).toBe("master");
    await expect(ds.signIn("master", "0000")).rejects.toThrow(/ID 또는 비밀번호/);
  });

  it("can be changed repeatedly (no first-change lock)", async () => {
    await ds.signIn("master", "0000");
    await ds.updateTherapistPasswordViaAuth("first-11");
    await ds.updateTherapistPasswordViaAuth("second-2");
    await ds.updateTherapistPasswordViaAuth("third-33");

    expect(await ds.reauthenticate("master", "third-33")).toBe(true);
    expect(await ds.reauthenticate("master", "first-11")).toBe(false);
    expect(await ds.reauthenticate("master", "second-2")).toBe(false);
  });

  it("rejects changing to the default password 0000", async () => {
    await ds.signIn("master", "0000");
    await expect(ds.updateTherapistPasswordViaAuth("0000")).rejects.toThrow(/기본 비밀번호/);
  });

  it("regular therapist can change their own password", async () => {
    await ds.signIn("master", "0000");
    await ds.createTherapistViaEdgeFunction("PT-001", "김치료", "Test1234!");
    await ds.signIn("PT-001", "Test1234!"); // 일반 치료사로 로그인 (세션 전환)

    await ds.updateTherapistPasswordViaAuth("Pt-secret9");
    expect(await ds.reauthenticate("PT-001", "Pt-secret9")).toBe(true);
    expect(await ds.reauthenticate("PT-001", "Test1234!")).toBe(false);
    // 마스터 계정은 영향 없음
    expect(await ds.reauthenticate("master", "0000")).toBe(true);
  });
});

describe("localDataService — notes CRUD", () => {
  it("upsertNote inserts new note and fetchNotes returns it", async () => {
    const note = sampleNote({ patientName: "김환자", id: "n1" });
    await ds.upsertNote(note);

    const all = await ds.fetchNotes();
    expect(all).toHaveLength(1);
    expect(all[0].patientName).toBe("김환자");
    expect(all[0].id).toBe("n1");
  });

  it("upsertNote updates existing note in place (not duplicate)", async () => {
    await ds.upsertNote(sampleNote({ id: "n1", patientName: "원래" }));
    await ds.upsertNote(sampleNote({ id: "n1", patientName: "수정됨" }));

    const all = await ds.fetchNotes();
    expect(all).toHaveLength(1);
    expect(all[0].patientName).toBe("수정됨");
  });

  it("fetchNotes sorts by savedAt descending (newest first)", async () => {
    await ds.upsertNote(
      sampleNote({ id: "old", savedAt: "2026-01-01T00:00:00Z" })
    );
    await ds.upsertNote(
      sampleNote({ id: "mid", savedAt: "2026-03-01T00:00:00Z" })
    );
    await ds.upsertNote(
      sampleNote({ id: "new", savedAt: "2026-06-01T00:00:00Z" })
    );

    const all = await ds.fetchNotes();
    expect(all.map((n) => n.id)).toEqual(["new", "mid", "old"]);
  });

  it("deleteNotes removes specified ids only", async () => {
    await ds.upsertNote(sampleNote({ id: "a" }));
    await ds.upsertNote(sampleNote({ id: "b" }));
    await ds.upsertNote(sampleNote({ id: "c" }));

    await ds.deleteNotes(["a", "c"]);

    const all = await ds.fetchNotes();
    expect(all.map((n) => n.id)).toEqual(["b"]);
  });

  it("deleteNotes is no-op for non-existent ids", async () => {
    await ds.upsertNote(sampleNote({ id: "a" }));
    await ds.deleteNotes(["does-not-exist"]);
    expect(await ds.fetchNotes()).toHaveLength(1);
  });
});

describe("localDataService — painAreas migration", () => {
  it("migrates legacy Record<string, number> to PainEntry[] on fetch (view 역추정)", async () => {
    const legacyPainAreas = { "우측 대흉근": 2, "좌측 광배근": 3 };
    // 구버전 형식을 강제로 주입 (현재 타입은 PainEntry[] 라 캐스팅)
    await ds.upsertNote(sampleNote({ id: "legacy", painAreas: legacyPainAreas as never }));

    const all = await ds.fetchNotes();
    const note = all.find((n) => n.id === "legacy")!;
    // 대흉근은 전면 전용, 광배근은 후면 전용 부위 → view 가 정확히 복원됨
    expect(note.painAreas).toEqual(
      expect.arrayContaining([
        { view: "anterior", region: "우측 대흉근", painLevel: 2 },
        { view: "posterior", region: "좌측 광배근", painLevel: 3 },
      ])
    );
    expect(note.painAreas).toHaveLength(2);
  });

  it("clears unconvertible legacy string[] painAreas", async () => {
    await ds.upsertNote(sampleNote({ id: "veryold", painAreas: ["head", "neck"] as never }));
    const all = await ds.fetchNotes();
    expect(all.find((n) => n.id === "veryold")!.painAreas).toEqual([]);
  });

  it("drops out-of-range pain levels and invalid views", async () => {
    await ds.upsertNote(
      sampleNote({
        id: "rec",
        painAreas: [
          { view: "anterior", region: "우측 대흉근", painLevel: 2 },
          { view: "anterior", region: "좌측 이두근", painLevel: 9 }, // 범위 밖
          { view: "sideways", region: "허리", painLevel: 1 }, // 잘못된 view
        ] as never,
      })
    );
    const all = await ds.fetchNotes();
    expect(all.find((n) => n.id === "rec")!.painAreas).toEqual([
      { view: "anterior", region: "우측 대흉근", painLevel: 2 },
    ]);
  });
});

describe("localDataService — corrupt data safety", () => {

  it("migrates legacy plaintext notes to encrypted storage", async () => {
    const legacy = [sampleNote({ id: "legacy-1", patientName: "평문환자" })];
    window.localStorage.setItem("pt_local_notes", JSON.stringify(legacy));

    const notes = await ds.fetchNotes();
    expect(notes).toHaveLength(1);
    expect(notes[0].patientName).toBe("평문환자");

    // 읽는 순간 암호화로 업그레이드됨
    expect(window.localStorage.getItem("pt_local_notes")!).not.toContain("평문환자");
  });
});

describe("localDataService — therapist import", () => {
  const record = (uid: string, id: string | null, overrides = {}) => ({
    uid,
    id,
    name: `치료사-${uid}`,
    passwordHash: "pbkdf2v1:00:11",
    role: "therapist" as const,
    resigned: false,
    ...overrides,
  });

  it("imports new therapists and skips duplicates by uid", async () => {
    await ds.signIn("master", "0000"); // bootstrap
    expect(await ds.importTherapists([record("t1", "PT-001")])).toBe(1);
    // 같은 uid 재임포트 → 스킵
    expect(await ds.importTherapists([record("t1", "PT-001")])).toBe(0);

    const all = await ds.fetchTherapists();
    expect(all.filter((t) => t.role === "therapist")).toHaveLength(1);
  });

  it("skips masters and preserves login collisions as unassigned identities", async () => {
    await ds.signIn("master", "0000");
    await ds.createTherapistViaEdgeFunction("PT-001", "기존", "Test1234!");

    const imported = await ds.importTherapists([
      record("m2", "master2", { role: "master" as const }), // 마스터 → 스킵
      record("t2", "PT-001"), // 활성 ID 충돌 → 미배정 보존
      record("t3", "PT-002"), // 정상
    ]);
    expect(imported).toBe(2);

    const all = await ds.fetchTherapists();
    expect(all.find((t) => t.uid === "t3")).toBeTruthy();
    expect(all.find((t) => t.uid === "t2")).toMatchObject({ id: null, importUnassigned: true, passwordHash: "" });
    expect(all.find((t) => t.uid === "m2")).toBeUndefined();
  });
});

describe("localDataService — import sanitize (임상 문구 보존)", () => {
  it("preserves clinical phrases like 'onset =' and 'pronation =' on import", async () => {
    const clinical = "onset = 3일 전, pronation = 80도, ONSET =급성";
    await ds.importNotes([
      sampleNote({ id: "clin-1", treatment: clinical, chiefComplaint: "onset = 2주 전" }),
    ]);

    const all = await ds.fetchNotes();
    const note = all.find((n) => n.id === "clin-1")!;
    expect(note.treatment).toBe(clinical);
    expect(note.chiefComplaint).toBe("onset = 2주 전");
  });

  it("still strips <script> blocks and inline event handler attributes", async () => {
    await ds.importNotes([
      sampleNote({
        id: "xss-1",
        treatment: '<script>alert(1)</script>치료 내용',
        chiefComplaint: '<img src=x onclick="alert(1)"> 주호소',
      }),
    ]);

    const all = await ds.fetchNotes();
    const note = all.find((n) => n.id === "xss-1")!;
    expect(note.treatment).not.toContain("<script");
    expect(note.treatment).toContain("치료 내용");
    expect(note.chiefComplaint).not.toMatch(/onclick\s*=\s*["']/i);
    expect(note.chiefComplaint).toContain("주호소");
  });
});

describe("localDataService — export security (v3)", () => {
  it("export excludes password hashes and marks version 3", async () => {
    await ds.signIn("master", "0000");
    await ds.createTherapistViaEdgeFunction("PT-001", "김치료", "Secret1!");
    await ds.upsertNote(sampleNote({ id: "n1", patientName: "김환자" }));

    const parsed = JSON.parse(await ds.exportAllData());
    expect(parsed.version).toBe(3);
    expect(parsed.notes).toHaveLength(1);
    expect(parsed.therapists.length).toBeGreaterThanOrEqual(2);
    for (const t of parsed.therapists) {
      expect(t.passwordHash ?? "").toBe(""); // Antigravity 는 필드 자체를 생략
    }
    // 파일 문자열 어디에도 해시 파편이 남지 않아야 함
    expect(await ds.exportAllData()).not.toContain("pbkdf2v1:");
  });

  it("therapists restored from v3 backup are login-locked until master resets", async () => {
    await ds.signIn("master", "0000");
    await ds.createTherapistViaEdgeFunction("PT-001", "김치료", "Secret1!");
    const backup = JSON.parse(await ds.exportAllData());

    // 새 기기 시뮬레이션
    await seedLegacyAdmin();
    await ds.signIn("master", "0000"); // 새 기기의 master 부트스트랩
    const imported = await ds.importTherapists(backup.therapists);
    expect(imported).toBe(1);

    // 기존 비밀번호로 로그인 불가 (해시 미포함 → 잠금)
    await expect(ds.signIn("PT-001", "Secret1!")).rejects.toThrow(/비밀번호가 설정되지 않은 계정/); // Antigravity 안내 문구

    // master 가 재설정하면 로그인 가능
    const restored = (await ds.fetchTherapists()).find((t) => t.id === "PT-001")!;
    await ds.resetTherapistPasswordDb(restored.uid, "Newpass2@");
    const relogin = await ds.signIn("PT-001", "Newpass2@");
    expect(relogin.therapist.id).toBe("PT-001");
  });

  it("legacy v2 backups with hashes still restore working credentials", async () => {
    await ds.signIn("master", "0000");
    await ds.createTherapistViaEdgeFunction("PT-001", "김치료", "Secret1!");
    const withHash = (await ds.fetchTherapists()).find((t) => t.id === "PT-001")!;

    await seedLegacyAdmin();
    await ds.signIn("master", "0000");
    expect(await ds.importTherapists([withHash])).toBe(1);

    // v2 백업(해시 포함)은 기존 비밀번호 그대로 사용 가능 (하위 호환)
    const relogin = await ds.signIn("PT-001", "Secret1!");
    expect(relogin.therapist.id).toBe("PT-001");
  });
});

describe("localDataService — master password reset", () => {
  it("rejects reset when session is not master", async () => {
    await ds.signIn("master", "0000");
    await ds.createTherapistViaEdgeFunction("PT-001", "김치료", "Secret1!");
    const target = (await ds.fetchTherapists()).find((t) => t.id === "PT-001")!;

    await ds.signIn("PT-001", "Secret1!"); // 일반 치료사 세션으로 전환
    await expect(ds.resetTherapistPasswordDb(target.uid, "Hijack99!")).rejects.toThrow(
      /관리자 권한/
    );
  });

  it("enforces the password policy on reset", async () => {
    await ds.signIn("master", "0000");
    await ds.createTherapistViaEdgeFunction("PT-001", "김치료", "Secret1!");
    const target = (await ds.fetchTherapists()).find((t) => t.id === "PT-001")!;

    await expect(ds.resetTherapistPasswordDb(target.uid, "0000")).rejects.toThrow(/기본 비밀번호/);
    await expect(ds.resetTherapistPasswordDb(target.uid, "abc")).rejects.toThrow(/8~20자/);
  });
});

describe("localDataService — registration password policy", () => {
  it("rejects weak or default passwords at the data layer (UI 우회 방어)", async () => {
    await ds.signIn("master", "0000");
    await expect(ds.createTherapistViaEdgeFunction("PT-001", "김치료", "0000")).rejects.toThrow(
      /기본 비밀번호/
    );
    await expect(ds.createTherapistViaEdgeFunction("PT-001", "김치료", "abc")).rejects.toThrow(
      /8~20자/
    );
    await expect(
      ds.createTherapistViaEdgeFunction("PT-001", "김치료", "한글비밀번호여덟자")
    ).rejects.toThrow(/영문·숫자·특수문자/);
  });

  it("accepts alphanumeric/special passwords (숫자 전용 강제 아님)", async () => {
    await ds.signIn("master", "0000");
    const rec = await ds.createTherapistViaEdgeFunction("PT-001", "김치료", "Pw-2026!");
    expect(rec.id).toBe("PT-001");
    const login = await ds.signIn("PT-001", "Pw-2026!");
    expect(login.therapist.id).toBe("PT-001");
  });
});

describe("localDataService — encrypted backup (passphrase)", () => {
  it("round-trips notes through an encrypted backup", async () => {
    await ds.signIn("master", "0000");
    await ds.upsertNote(sampleNote({ id: "n1", patientName: "김환자" }));

    const encText = await ds.exportAllDataEncrypted("backup-pass-123");
    expect(ds.isEncryptedBackup(encText)).toBe(true);
    expect(encText).not.toContain("김환자"); // 환자정보 평문 미노출

    const plain = await ds.decryptBackupText(encText, "backup-pass-123");
    const payload = JSON.parse(plain);
    expect(payload.version).toBe(3);
    expect(payload.notes[0].patientName).toBe("김환자");
    for (const t of payload.therapists) expect(t.passwordHash ?? "").toBe("");
    expect(plain).not.toContain("pbkdf2");
  });

  it("rejects a wrong passphrase", async () => {
    await ds.signIn("master", "0000");
    await ds.upsertNote(sampleNote({ id: "n1" }));
    const encText = await ds.exportAllDataEncrypted("correct-pass-1");
    await expect(ds.decryptBackupText(encText, "wrong-pass-99")).rejects.toThrow(/백업 암호/);
  });

  it("plain backups are not detected as encrypted", async () => {
    await ds.signIn("master", "0000");
    expect(ds.isEncryptedBackup(await ds.exportAllData())).toBe(false);
    expect(ds.isEncryptedBackup("not-json")).toBe(false);
  });
});

describe("localDataService — patientId", () => {
  it("assigns a patientId on save and groups by chart number", async () => {
    const a = await ds.upsertNote(sampleNote({ id: "a", chartNo: "C-100", patientName: "김철수" }));
    const b = await ds.upsertNote(sampleNote({ id: "b", chartNo: "C-100", patientName: "김철수" }));
    expect(a.patientId).toBeTruthy();
    expect(b.patientId).toBe(a.patientId);
  });

  it("distinguishes same-name patients by birth date (동명이인)", async () => {
    const a = await ds.upsertNote(
      sampleNote({ id: "a", chartNo: "", patientName: "김철수", birthDate: "1980-01-01" })
    );
    const b = await ds.upsertNote(
      sampleNote({ id: "b", chartNo: "", patientName: "김철수", birthDate: "1999-12-31" })
    );
    expect(b.patientId).not.toBe(a.patientId);
  });

  it("does NOT merge same-name patients with different birth dates during backfill", async () => {
    const legacy = [
      sampleNote({ id: "p1", chartNo: "", patientName: "김철수", birthDate: "1980-01-01" }),
      sampleNote({ id: "p2", chartNo: "", patientName: "김철수", birthDate: "1999-12-31" }),
    ];
    window.localStorage.setItem("pt_local_notes", JSON.stringify(legacy)); // 구버전 평문 주입
    const all = await ds.fetchNotes();
    const a = all.find((n) => n.id === "p1")!;
    const b = all.find((n) => n.id === "p2")!;
    expect(a.patientId).toBeTruthy();
    expect(b.patientId).not.toBe(a.patientId); // 동명이인 보호
  });

  it("remaps imported patientIds to the local patient (기기 간 재조정)", async () => {
    // 이 기기: 차트번호 C-100 환자
    const local = await ds.upsertNote(sampleNote({ id: "loc-1", chartNo: "C-100", patientName: "김철수" }));

    // 다른 기기 백업: 같은 차트번호지만 다른 patientId 로 발급된 노트 2건
    const result = await ds.importNotes([
      sampleNote({ id: "imp-1", chartNo: "C-100", patientName: "김철수", patientId: "foreign-pid" }),
      sampleNote({ id: "imp-2", chartNo: "C-100", patientName: "김철수", patientId: "foreign-pid" }),
    ]);
    expect(result).toBe(2); // Antigravity importNotes 는 추가 건수(number)를 반환

    const all = await ds.fetchNotes();
    expect(all.find((n) => n.id === "imp-1")!.patientId).toBe(local.patientId);
    expect(all.find((n) => n.id === "imp-2")!.patientId).toBe(local.patientId);
  });

  it("backfills patientId for legacy notes on fetch", async () => {
    const legacy = [
      sampleNote({ id: "l1", patientName: "이영희" }),
      sampleNote({ id: "l2", patientName: "이영희" }),
    ];
    window.localStorage.setItem("pt_local_notes", JSON.stringify(legacy)); // 구버전 평문 주입
    const all = await ds.fetchNotes();
    expect(all.every((n) => !!n.patientId)).toBe(true);
    expect(all[0].patientId).toBe(all[1].patientId);
  });
});

describe("localDataService — import validation & auto-backup restore", () => {

  it("restores notes from an auto-backup snapshot", async () => {
    await ds.upsertNote(sampleNote({ id: "keep-1", patientName: "복원대상" }));
    await ds.deleteNotes(["keep-1"]); // before-delete 스냅샷 생성
    expect(await ds.fetchNotes()).toHaveLength(0);

    const backups = await ds.listAutoBackups();
    expect(backups.length).toBeGreaterThan(0);
    const last = backups[backups.length - 1];
    expect(last.reason).toBe("before-delete");

    const count = await ds.restoreAutoBackup(last.at);
    expect(count).toBe(1);
    expect((await ds.fetchNotes()).map((n) => n.id)).toEqual(["keep-1"]);
  });
});

describe("localDataService — note transfer", () => {
  it("transferNotesRpc reassigns notes from one therapist to another", async () => {
    await ds.upsertNote(
      sampleNote({ id: "n1", therapistUid: "uid-A" })
    );
    await ds.upsertNote(
      sampleNote({ id: "n2", therapistUid: "uid-A" })
    );
    await ds.upsertNote(
      sampleNote({ id: "n3", therapistUid: "uid-B" })
    );

    await addTransferTarget("uid-B", "PT-002", "B-치료사");
    const count = await ds.transferNotesRpc("uid-A", "uid-B", "B-치료사", "PT-002");
    expect(count).toBe(2);

    const all = await ds.fetchNotes();
    const n1 = all.find((n) => n.id === "n1")!;
    const n3 = all.find((n) => n.id === "n3")!;
    expect(n1.therapistUid).toBe("uid-B");
    expect(n1.therapist?.name).toBe("B-치료사");
    expect(n3.therapistUid).toBe("uid-B"); // 기존 그대로
  });
});
