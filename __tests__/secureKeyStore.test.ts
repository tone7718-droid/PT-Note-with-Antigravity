import { afterEach, expect, it, vi } from "vitest";
import { encryptData, decryptData, invalidateEncKeyCache } from "@/lib/cryptoService";
afterEach(() => { Reflect.deleteProperty(window, "electronAPI"); invalidateEncKeyCache(); localStorage.clear(); });
it("migrates a legacy localStorage key into the Electron secure store", async () => {
  const store: { key: string | null } = { key: null };
  Object.defineProperty(window, "electronAPI", { configurable: true, value: { getEncKey: vi.fn(async () => store.key), setEncKey: vi.fn(async (v: string) => { store.key = v; }) } });
  const legacyKey = "ab".repeat(32); localStorage.setItem("pt_enc_key_v1", legacyKey); invalidateEncKeyCache();
  expect(await decryptData(await encryptData("clinical data"))).toBe("clinical data");
  expect(store.key).toBe(legacyKey);
  expect(localStorage.getItem("pt_enc_key_v1")).toBeNull();
});
it("does not fall back to localStorage when the secure store fails", async () => {
  Object.defineProperty(window, "electronAPI", { configurable: true, value: { getEncKey: vi.fn().mockRejectedValue(new Error("safeStorage unavailable")), setEncKey: vi.fn() } });
  invalidateEncKeyCache();
  await expect(encryptData("clinical data")).rejects.toThrow("safeStorage unavailable");
  expect(localStorage.getItem("pt_enc_key_v1")).toBeNull();
});
