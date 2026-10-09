// ported from pt-note-with-chatgpt
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useThemeStore } from "@/store/useThemeStore";

describe("theme store", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    document.documentElement.style.colorScheme = "";
    useThemeStore.setState({ theme: "light", resolved: "light" });
  });

  it("applies and persists dark mode", () => {
    useThemeStore.getState().setTheme("dark");

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    // color-scheme 동기화는 ChatGPT 버전에만 있는 기능이라 여기서는 검사하지 않음
    expect(localStorage.getItem("pt-theme")).toBe("dark");
    expect(useThemeStore.getState().resolved).toBe("dark");
  });

  it("resolves system theme during initialization", () => {
    localStorage.setItem("pt-theme", "system");
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn((query: string) => ({
      matches: query === "(prefers-color-scheme: dark)",
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      })),
    });

    useThemeStore.getState().init();

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(useThemeStore.getState()).toMatchObject({ theme: "system", resolved: "dark" });
  });
});
