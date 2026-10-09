import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Module, { createRequire } from "node:module";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

type Handler = (event: unknown, ...args: unknown[]) => unknown;
const handlers: Record<string, Handler> = {};
const win: { loaded?: string; listeners: Record<string, (...a: unknown[]) => void> } = { listeners: {} };
let permissionHandler: ((wc: unknown, permission: string, cb: (ok: boolean) => void) => void) | undefined;
const userData = mkdtempSync(path.join(tmpdir(), "pt-electron-"));

const electronMock = {
  app: { isPackaged: true, getPath: () => userData, whenReady: () => ({ then: (f: () => void) => f() }), on() {} },
  BrowserWindow: class {
    webContents = {
      on: (e: string, f: (...a: unknown[]) => void) => { win.listeners[e] = f; },
      setWindowOpenHandler() {},
      openDevTools() {},
    };
    once() {}
    loadURL() {}
    loadFile(p: string) { win.loaded = p; }
    static getAllWindows() { return []; }
  },
  ipcMain: { handle: (name: string, f: Handler) => { handlers[name] = f; } },
  safeStorage: { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(s), decryptString: (b: Buffer) => b.toString() },
  session: { defaultSession: { setPermissionRequestHandler: (f: typeof permissionHandler) => { permissionHandler = f; } } },
  shell: { openExternal() {} },
};

const moduleWithLoad = Module as unknown as { _load: (request: string, ...rest: unknown[]) => unknown };
const originalLoad = moduleWithLoad._load;
let appUrl = "";
const sender = (url: string, parent: unknown = null) => ({ senderFrame: { url, parent } });

beforeAll(() => {
  moduleWithLoad._load = function (request: string, ...rest: unknown[]) {
    return request === "electron" ? electronMock : originalLoad.call(this, request, ...rest);
  };
  createRequire(import.meta.url)("../electron/main.js");
  appUrl = pathToFileURL(win.loaded!).href;
});
afterAll(() => { moduleWithLoad._load = originalLoad; });

describe("electron main process hardening", () => {
  it("serves the encryption key only to the app's own main frame", async () => {
    await handlers["enc-key:set"](sender(appUrl), "ab".repeat(32));
    expect(await handlers["enc-key:get"](sender(appUrl))).toBe("ab".repeat(32));
    for (const event of [sender("file:///tmp/other.html"), sender(appUrl, {}), sender("https://example.com/")]) {
      expect(() => handlers["enc-key:get"](event)).toThrow("허용되지 않은 요청");
      expect(() => handlers["enc-key:set"](event, "cd".repeat(32))).toThrow("허용되지 않은 요청");
    }
  });

  it("blocks navigation to local files outside the app bundle", () => {
    const navigate = (url: string) => { let prevented = false; win.listeners["will-navigate"]({ preventDefault: () => { prevented = true; } }, url); return prevented; };
    expect(navigate("file:///tmp/other.html")).toBe(true);
    expect(navigate(`${appUrl}#notes`)).toBe(false);
  });

  it("denies browser permission requests", () => {
    let granted: boolean | undefined;
    permissionHandler!(null, "media", (ok) => { granted = ok; });
    expect(granted).toBe(false);
  });
});
