"use client";

import { create } from "zustand";

type Theme = "light" | "dark" | "system";

interface ThemeStore {
  theme: Theme;
  resolved: "light" | "dark";
  setTheme: (t: Theme) => void;
  init: () => void;
}

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(resolved: "light" | "dark") {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (resolved === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  theme: "light",
  resolved: "light",

  setTheme: (t) => {
    const resolved = t === "system" ? getSystemTheme() : t;
    applyTheme(resolved);
    set({ theme: t, resolved });
    try {
      localStorage.setItem("pt-theme", t);
    } catch {}
  },

  init: () => {
    let saved: Theme = "light";
    try {
      const stored = localStorage.getItem("pt-theme");
      if (stored === "dark" || stored === "system") saved = stored;
    } catch {}

    const resolved = saved === "system" ? getSystemTheme() : saved;
    applyTheme(resolved);
    set({ theme: saved, resolved });

    // Listen for system theme changes
    if (typeof window !== "undefined") {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
        const { theme } = get();
        if (theme === "system") {
          const newResolved = getSystemTheme();
          applyTheme(newResolved);
          set({ resolved: newResolved });
        }
      });
    }
  },
}));
