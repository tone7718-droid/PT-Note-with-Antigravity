import { create } from "zustand";
import { NoteDataSchema, type NoteData } from "@/types";
import * as ds from "@/lib/localDataService"; // 로컬 전환용
import { useAuthStore } from "./useAuthStore";

interface NoteStore {
  notes: NoteData[];
  selectedNoteId: string | null;
  pendingDuplicate: Omit<NoteData, "id" | "savedAt"> | null;
  isLoading: boolean;
  error: string | null;

  selectNote: (id: string | null) => void;
  createNewNote: () => void;
  duplicateNote: (id: string) => void;
  clearPendingDuplicate: () => void;
  refreshNotes: () => Promise<void>;
  saveNote: (data: Omit<NoteData, "id" | "savedAt">, existingId?: string | null) => Promise<NoteData>;
  deleteNotes: (ids: string[]) => Promise<void>;
  transferNotes: (fromUid: string, toUid: string, toName: string, toLoginId: string | null) => Promise<void>;
  exportData: () => Promise<string>;
  importData: (json: string) => Promise<{ notesCount: number; therapistsCount: number }>;
  listBackups: () => Promise<import("@/lib/autoBackup").BackupSnapshot[]>;
  restoreBackup: (at: string) => Promise<number>;
  initSync: () => void;
}

const bySavedAtDesc = (a: NoteData, b: NoteData) =>
  new Date(b.savedAt || 0).getTime() - new Date(a.savedAt || 0).getTime();

export const useNoteStore = create<NoteStore>((set, get) => ({
  notes: [],
  selectedNoteId: null,
  pendingDuplicate: null,
  isLoading: false,
  error: null,

  selectNote: (id) => set({ selectedNoteId: id }),
  createNewNote: () => set({ selectedNoteId: null, pendingDuplicate: null }),

  duplicateNote: (id) => {
    const note = get().notes.find((n) => n.id === id);
    if (!note) return;
    // 임상 데이터는 유지하고 작성일/담당 치료사만 초기화
    const duplicated: Omit<NoteData, "id" | "savedAt"> = {
      patientId: note.patientId, // 같은 환자의 후속 기록이므로 유지
      patientName: note.patientName,
      chartNo: note.chartNo,
      birthDate: note.birthDate,
      gender: note.gender,
      diagnosis: note.diagnosis,
      pmh: note.pmh,
      painScore: note.painScore,
      painAreas: { ...note.painAreas },
      chiefComplaint: note.chiefComplaint,
      rom: note.rom?.map((r) => ({ ...r })) || [],
      postural: note.postural,
      palpation: note.palpation,
      specialTest: note.specialTest,
      treatment: note.treatment,
      homeExercise: note.homeExercise,
      noteDate: new Date().toISOString().split("T")[0],
      therapist: null,
      therapistUid: "",
    };
    set({ selectedNoteId: null, pendingDuplicate: duplicated });
  },

  clearPendingDuplicate: () => set({ pendingDuplicate: null }),

  initSync: () => {
    // Auth 상태 리스너 등록
    ds.onAuthStateChange(async (t) => {
      useAuthStore.getState().setTherapist(t);
      if (t) {
        set({ isLoading: true });
        try {
          const [fetchedNotes, fetchedTherapists] = await Promise.all([
            ds.fetchNotes(),
            ds.fetchTherapists(),
          ]);
          set({ notes: fetchedNotes, error: null });
          useAuthStore.getState().setTherapists(fetchedTherapists);
        } catch (err) {
          console.error("[init] fetch after auth failed:", err);
          set({ error: (err as Error).message });
        } finally {
          set({ isLoading: false });
        }
      } else {
        set({ notes: [] });
        useAuthStore.getState().setTherapists([]);
      }
    });

    // Cleanup은 이 스토어 생명주기 동안 유지하므로 생략하거나 애플리케이션 종료시 처리
  },

  refreshNotes: async () => {
    try {
      const fetchedNotes = await ds.fetchNotes();
      set({ notes: fetchedNotes });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  saveNote: async (data, existingId) => {
    const now = new Date().toISOString();
    const noteToSave: NoteData = {
      ...data,
      id: existingId || `note-${Date.now()}`,
      savedAt: now,
    };

    // Optimistic Update — 목록에 있으면 교체, 없으면 추가.
    // selectedNoteId는 건드리지 않는다 (폼이 저장 완료 후 직접 동기화).
    set((state) => {
      const exists = state.notes.some((n) => n.id === noteToSave.id);
      const updated = exists
        ? state.notes.map((n) => (n.id === noteToSave.id ? noteToSave : n))
        : [noteToSave, ...state.notes];
      return { notes: updated.sort(bySavedAtDesc) };
    });

    try {
      const saved = await ds.upsertNote(noteToSave);
      set((state) => ({
        notes: state.notes
          .map((n) => (n.id === saved.id ? saved : n))
          .sort(bySavedAtDesc),
      }));
      return saved;
    } catch (err) {
      // rollback
      get().refreshNotes();
      throw err;
    }
  },

  deleteNotes: async (ids) => {
    set((state) => ({
      notes: state.notes.filter((n) => !n.id || !ids.includes(n.id)),
      selectedNoteId: state.selectedNoteId && ids.includes(state.selectedNoteId) ? null : state.selectedNoteId
    }));

    try {
      await ds.deleteNotes(ids);
    } catch (err) {
      get().refreshNotes();
      throw err;
    }
  },

  transferNotes: async (fromUid, toUid, toName, toLoginId) => {
    await ds.transferNotesRpc(fromUid, toUid, toName, toLoginId);
    set((state) => ({
      notes: state.notes.map((n) => {
        if (n.therapistUid === fromUid) {
          return {
            ...n,
            therapistUid: toUid,
            therapist: { uid: toUid, id: toLoginId, name: toName, role: "therapist" as const },
          };
        }
        return n;
      })
    }));
  },

  exportData: async () => {
    return ds.exportAllData();
  },

  importData: async (json) => {
    const data = JSON.parse(json);
    if (!data.notes || !Array.isArray(data.notes)) throw new Error("잘못된 데이터 형식입니다.");

    // 스키마 검증 — 필수 필드가 깨진 노트는 걸러내 앱 크래시를 방지
    const validNotes = (data.notes as unknown[]).flatMap((raw) => {
      const parsed = NoteDataSchema.safeParse(raw);
      return parsed.success ? [parsed.data as NoteData] : [];
    });

    const notesCount = await ds.importNotes(validNotes);
    const therapistsCount = Array.isArray(data.therapists)
      ? await ds.importTherapists(data.therapists as ds.ImportableTherapist[])
      : 0;

    const updatedNotes = await ds.fetchNotes();
    set({ notes: updatedNotes });
    if (therapistsCount > 0) {
      useAuthStore.getState().setTherapists(await ds.fetchTherapists());
    }

    return { notesCount, therapistsCount };
  },

  listBackups: async () => {
    return ds.listAutoBackups();
  },

  restoreBackup: async (at) => {
    const restored = await ds.restoreAutoBackup(at);
    set({ notes: await ds.fetchNotes(), selectedNoteId: null });
    return restored;
  },
}));
