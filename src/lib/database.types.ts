import type { NoteData, Therapist, TherapistRecord } from "@/types";

/* ── DB Row 타입 (snake_case) ── */

export interface DbTherapistRow {
  uid: string;
  auth_user_id: string | null;
  login_id: string | null;
  name: string;
  role: "therapist" | "master";
  resigned: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbNoteRow {
  id: string;
  saved_at: string;
  patient_name: string;
  chart_no: string;
  birth_date: string;
  gender: string;
  diagnosis: string;
  pmh: string;
  pain_score: number | null;
  pain_areas: string[];
  chief_complaint: string;
  rom: { joint: string; measuredROM: string; normalRange: string }[];
  postural: string;
  palpation: string;
  special_test: string;
  treatment: string;
  home_exercise: string;
  note_date: string;
  therapist_snapshot: Therapist | null;
  therapist_uid: string | null;
  created_at: string;
  updated_at: string;
}

/* ── DB Insert 타입 ── */

export type DbNoteInsert = Omit<DbNoteRow, "created_at" | "updated_at">;
export type DbTherapistInsert = Omit<DbTherapistRow, "created_at" | "updated_at">;

/* ── 매핑 함수 (DB Row ↔ App 타입) ── */

export function dbNoteToNoteData(row: DbNoteRow): NoteData {
  return {
    id: row.id,
    savedAt: row.saved_at,
    patientName: row.patient_name,
    chartNo: row.chart_no,
    birthDate: row.birth_date,
    gender: row.gender,
    diagnosis: row.diagnosis,
    pmh: row.pmh,
    painScore: row.pain_score,
    painAreas: (row.pain_areas || []).reduce((acc, curr) => {
      const parts = curr.split(":");
      if (parts.length === 2) {
        acc[parts[0]] = parseInt(parts[1], 10);
      } else {
        acc[curr] = 3; // 기본값 (기존 하위 호환성)
      }
      return acc;
    }, {} as Record<string, number>),
    chiefComplaint: row.chief_complaint,
    rom: row.rom || [],
    postural: row.postural,
    palpation: row.palpation,
    specialTest: row.special_test,
    treatment: row.treatment,
    homeExercise: row.home_exercise,
    noteDate: row.note_date,
    therapist: row.therapist_snapshot,
    therapistUid: row.therapist_uid || "",
  };
}

export function noteDataToDbInsert(note: NoteData): DbNoteInsert {
  return {
    id: note.id,
    saved_at: note.savedAt,
    patient_name: note.patientName,
    chart_no: note.chartNo,
    birth_date: note.birthDate,
    gender: note.gender,
    diagnosis: note.diagnosis,
    pmh: note.pmh,
    pain_score: note.painScore,
    pain_areas: Object.entries(note.painAreas || {}).map(([k, v]) => `${k}:${v}`),
    chief_complaint: note.chiefComplaint,
    rom: note.rom,
    postural: note.postural,
    palpation: note.palpation,
    special_test: note.specialTest,
    treatment: note.treatment,
    home_exercise: note.homeExercise,
    note_date: note.noteDate,
    therapist_snapshot: note.therapist || null,
    therapist_uid: note.therapistUid || null,
  };
}

export function dbTherapistToRecord(row: DbTherapistRow): TherapistRecord {
  return {
    uid: row.uid,
    id: row.login_id,
    name: row.name,
    passwordHash: "", // Supabase Auth에서 관리 — 앱에서는 사용하지 않음
    role: row.role,
    resigned: row.resigned,
  };
}

export function therapistIdToEmail(loginId: string): string {
  return `${loginId.toLowerCase().replace(/\s+/g, "-")}@pt-clinic.internal`;
}

export function emailToTherapistId(email: string): string {
  return email.replace("@pt-clinic.internal", "").toUpperCase();
}
