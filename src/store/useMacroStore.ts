import { create } from "zustand";

const MACRO_STORAGE_KEY = "pt_macros";
const MAX_MACROS = 20;

export interface MacroEntry {
  key: string;   // "/도수1" ~ "/도수20"
  text: string;  // 실제 문장
}

interface MacroStore {
  macros: MacroEntry[];
  loadMacros: () => void;
  saveMacros: (macros: MacroEntry[]) => void;
  updateMacro: (index: number, text: string) => void;
  getMacroByKey: (key: string) => MacroEntry | undefined;
  searchMacros: (query: string) => MacroEntry[];
}

function getDefaultMacros(): MacroEntry[] {
  return Array.from({ length: MAX_MACROS }, (_, i) => ({
    key: `/도수${i + 1}`,
    text: "",
  }));
}

function loadFromStorage(): MacroEntry[] {
  if (typeof window === "undefined") return getDefaultMacros();
  try {
    const raw = localStorage.getItem(MACRO_STORAGE_KEY);
    if (!raw) return getDefaultMacros();
    const parsed = JSON.parse(raw) as MacroEntry[];
    // 항상 20개 유지
    const defaults = getDefaultMacros();
    return defaults.map((d, i) => ({
      ...d,
      text: parsed[i]?.text || "",
    }));
  } catch {
    return getDefaultMacros();
  }
}

function saveToStorage(macros: MacroEntry[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(MACRO_STORAGE_KEY, JSON.stringify(macros));
}

export const useMacroStore = create<MacroStore>((set, get) => ({
  macros: getDefaultMacros(),

  loadMacros: () => {
    set({ macros: loadFromStorage() });
  },

  saveMacros: (macros) => {
    saveToStorage(macros);
    set({ macros });
  },

  updateMacro: (index, text) => {
    const updated = [...get().macros];
    if (index >= 0 && index < MAX_MACROS) {
      updated[index] = { ...updated[index], text };
      saveToStorage(updated);
      set({ macros: updated });
    }
  },

  getMacroByKey: (key) => {
    return get().macros.find((m) => m.key === key && m.text.trim() !== "");
  },

  searchMacros: (query) => {
    const q = query.toLowerCase();
    return get().macros.filter(
      (m) => m.text.trim() !== "" && (m.key.toLowerCase().includes(q) || m.text.toLowerCase().includes(q))
    );
  },
}));
