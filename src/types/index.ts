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
}

export interface NoteData {
  id?: string;
  savedAt?: string;
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
  homeExercise: string;
  noteDate: string;
  therapist?: Therapist | null;
  therapistUid?: string;
}

export const EMPTY_NOTE: Omit<NoteData, "id" | "savedAt"> = {
  patientName: "", chartNo: "", birthDate: "", gender: "", diagnosis: "", pmh: "",
  painScore: null, painAreas: {}, chiefComplaint: "", rom: [],
  postural: "", palpation: "", specialTest: "", treatment: "", homeExercise: "",
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
  patientName: z.string().min(1, "환자 성명을 입력해주세요."),
  chartNo: z.string(),
  birthDate: z.string(),
  gender: z.string(),
  diagnosis: z.string().min(1, "진단명을 입력해주세요."),
  pmh: z.string(),
  painScore: z.number().nullable(),
  painAreas: z.record(z.string(), z.number()),
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
  homeExercise: z.string(),
  noteDate: z.string(),
  therapist: TherapistSchema.nullable().optional(),
  therapistUid: z.string().optional(),
});

