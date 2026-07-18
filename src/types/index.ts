import { z } from "zod";

export interface TherapistRecord {
  uid: string;
  id: string | null;
  name: string;
  passwordHash: string; // Supabase Auth에서 관리
  role: "therapist" | "master";
  resigned: boolean;
}

export interface Therapist {
  uid: string;
  id: string | null;
  name: string;
  role: "therapist" | "master";
  usingDefaultPassword?: boolean; // 기본 비밀번호(0000)로 로그인 중 — 변경 권장 배너용 (차단 아님)
}

export interface NoteData {
  id?: string;
  savedAt?: string;
  patientId?: string; // 내부 환자 식별자 (동명이인 구분용, 저장 시 자동 부여)
  patientName: string;
  chartNo: string;
  birthDate: string;
  gender: string;
  diagnosis: string;
  pmh: string;
  painScore: number | null;
  painAreas: Record<string, number>;
  chiefComplaint: string;
  rom: { joint: string; measuredROM: string; normalRange: string }[];
  postural: string;
  palpation: string;
  specialTest: string;
  treatment: string;
  /** 치료 직후 통증 점수 (NRS 0~10) — painScore(치료 전)와 비교용. 구버전 노트에는 없음 */
  painScoreAfter?: number | null;
  /** 평가 소견 (Assessment) — 치료 반응·호전도·임상적 판단. 구버전 노트에는 없음 */
  assessment?: string;
  homeExercise: string;
  /** 계획 (Plan) — 다음 회차 치료 방향. 구버전 노트에는 없음 */
  plan?: string;
  noteDate: string;
  therapist?: Therapist | null;
  therapistUid?: string;
}

export const EMPTY_NOTE: Omit<NoteData, "id" | "savedAt"> = {
  patientName: "", chartNo: "", birthDate: "", gender: "", diagnosis: "", pmh: "",
  painScore: null, painAreas: {}, chiefComplaint: "", rom: [],
  postural: "", palpation: "", specialTest: "", treatment: "", painScoreAfter: null,
  assessment: "", homeExercise: "", plan: "",
  noteDate: "", therapist: null, therapistUid: "",
};

export const TherapistSchema = z.object({
  uid: z.string(),
  id: z.string().nullable(),
  name: z.string(),
  role: z.enum(["therapist", "master"]),
});

export const NoteDataSchema = z.object({
  id: z.string().optional(),
  savedAt: z.string().optional(),
  patientId: z.string().optional(),
  patientName: z.string().min(1, "환자 성명을 입력해주세요."),
  chartNo: z.string(),
  birthDate: z.string(),
  gender: z.string(),
  diagnosis: z.string().min(1, "진단명을 입력해주세요."),
  pmh: z.string(),
  painScore: z.number().min(0).max(10).nullable(),
  painAreas: z.record(z.string(), z.number().int().min(1).max(3)),
  chiefComplaint: z.string(),
  rom: z.array(
    z.object({
      joint: z.string(),
      measuredROM: z.string(),
      normalRange: z.string()
    })
  ),
  postural: z.string(),
  palpation: z.string(),
  specialTest: z.string(),
  treatment: z.string(),
  painScoreAfter: z.number().min(0).max(10).nullish(),
  assessment: z.string().optional(),
  homeExercise: z.string(),
  plan: z.string().optional(),
  noteDate: z.string(),
  therapist: TherapistSchema.nullable().optional(),
  therapistUid: z.string().optional(),
});

