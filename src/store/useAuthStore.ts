import { create } from "zustand";
import type { Therapist, TherapistRecord } from "@/types";
import * as ds from "@/lib/localDataService"; // 로컬 전환용. 나중에 dataService로 바꿀 수 있음.

interface AuthStore {
  therapist: Therapist | null;
  therapists: TherapistRecord[];
  isLoading: boolean;
  error: string | null;
  setTherapist: (t: Therapist | null) => void;
  setTherapists: (ts: TherapistRecord[]) => void;
  signIn: (loginId: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  reauthenticate: (loginId: string, password: string) => Promise<boolean>;
  registerTherapist: (loginId: string, name: string, password: string) => Promise<void>;
  resignTherapist: (uid: string) => Promise<void>;
  deleteTherapist: (uid: string) => Promise<void>;
  updateTherapistPassword: (newPassword: string) => Promise<void>;
  setError: (err: string | null) => void;
  setLoading: (isLoading: boolean) => void;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  therapist: null,
  therapists: [],
  isLoading: false,
  error: null,
  
  setTherapist: (t) => set({ therapist: t }),
  setTherapists: (ts) => set({ therapists: ts }),
  setError: (err) => set({ error: err }),
  setLoading: (isLoading) => set({ isLoading }),

  signIn: async (loginId, password) => {
    set({ isLoading: true, error: null });
    try {
      const { therapist: t } = await ds.signIn(loginId, password);
      set({ therapist: t });
      // 이 부분에서 fetchTherapists도 할 수 있지만 그건 noteData 연동에서 진행하거나 여기서 진행
      const fetchedTherapists = await ds.fetchTherapists();
      set({ therapists: fetchedTherapists });
    } catch (err) {
      set({ error: (err as Error).message });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  signOut: async () => {
    await ds.signOut();
    set({ therapist: null, therapists: [] });
  },

  reauthenticate: async (loginId, password) => {
    return ds.reauthenticate(loginId, password);
  },

  registerTherapist: async (loginId, name, password) => {
    const newRecord = await ds.createTherapistViaEdgeFunction(loginId, name, password);
    set((state) => ({ therapists: [...state.therapists, newRecord] }));
  },

  resignTherapist: async (uid) => {
    await ds.resignTherapistDb(uid);
    set((state) => ({
      therapists: state.therapists.map((t) =>
        t.uid === uid ? { ...t, id: null, resigned: true } : t
      ),
    }));
  },

  deleteTherapist: async (uid) => {
    await ds.deleteTherapistDb(uid);
    set((state) => ({
      therapists: state.therapists.filter((t) => t.uid !== uid),
    }));
  },

  updateTherapistPassword: async (newPassword) => {
    await ds.updateTherapistPasswordViaAuth(newPassword);
  },
}));
