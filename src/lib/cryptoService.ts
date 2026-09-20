import { withBrowserLock } from "@/lib/storageLock";
/* ── AES-GCM localStorage 암호화 서비스 ──
 *
 * 랜덤 256-bit 키를 최초 실행 시 생성해 별도 localStorage 슬롯에 보관.
 * 환자 노트(pt_local_notes)를 암호화해 평문 노출을 방지.
 * 내보내기/가져오기는 localDataService에서 복호화 후 처리해 서식이 유지됨.
 */

/* 한계: 키가 암호문과 같은 localStorage 에 저장되므로 기기(브라우저 프로필)
 * 접근자에게는 보호가 되지 않는다. 근본 해결은 Tauri(데스크톱)에서 OS 보안
 * 저장소(Windows DPAPI / macOS Keychain)에 키를 보관하는 것 — Rust 측
 * keyring 연동이 필요해 향후 과제 (README "Security Model" 참고). */
const ENC_KEY_STORAGE = "pt_enc_key_v1";

let _cachedKey: CryptoKey | null = null;
let _cachedHex: string | null = null;

function bufToHex(buf: Uint8Array<ArrayBuffer>): string {
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBuf(hex: string): Uint8Array<ArrayBuffer> {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    arr[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return arr;
}

async function getKey(): Promise<CryptoKey> {
  return withBrowserLock("pt-note:key:v1", async () => {
    const stored = window.localStorage.getItem(ENC_KEY_STORAGE);
    if (stored) {
      if (!/^[0-9a-f]{64}$/i.test(stored)) throw new Error("암호화 키가 손상되었습니다.");
      if (_cachedKey && _cachedHex === stored) return _cachedKey;
      const key = await crypto.subtle.importKey("raw", hexToBuf(stored), { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      _cachedKey = key; _cachedHex = stored; return key;
    }
    for (const name of ["pt_local_notes", "pt_draft_note", "pt_auto_backup_v1", "pt_auto_backups"]) {
      const raw = window.localStorage.getItem(name);
      if (raw && (!/^[\s]*[\[{]/.test(raw) || raw.includes('"payloadEnc"'))) throw new Error("암호화 키가 없습니다. 기존 기록을 보존하기 위해 저장을 중단했습니다.");
    }
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const hex = bufToHex(new Uint8Array(await crypto.subtle.exportKey("raw", key)));
    window.localStorage.setItem(ENC_KEY_STORAGE, hex);
    _cachedKey = key; _cachedHex = hex; return key;
  });
}
export async function encryptData(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv); // 반환값 대신 원본 버퍼 사용 → ArrayBuffer 타입 유지
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return `${bufToHex(iv)}:${bufToHex(new Uint8Array(ciphertext))}`;
}

export async function decryptData(encrypted: string): Promise<string> {
  const sep = encrypted.indexOf(":");
  if (sep !== 24) throw new Error("invalid format"); // IV는 항상 24자 hex (12 bytes)
  const key = await getKey();
  const iv = hexToBuf(encrypted.slice(0, sep));
  const ciphertext = hexToBuf(encrypted.slice(sep + 1));
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

/** 테스트/초기화 시 캐시 무효화 */
export function invalidateEncKeyCache(): void {
  _cachedKey = null;
  _cachedHex = null;
}

/* ── passphrase 기반 암복호화 (백업 파일용) ──
 *
 * 위 로컬 키(pt_enc_key_v1)와 달리 기기 밖으로 나가는 백업 파일을 보호한다.
 * 사용자가 입력한 passphrase 에서 PBKDF2 로 AES-GCM 키를 파생 —
 * 키가 파일이나 localStorage 어디에도 저장되지 않으므로, passphrase 를
 * 모르면 백업 파일만으로는 복호화할 수 없다.
 */

const PASSPHRASE_KDF_ITERATIONS = 200_000;

async function deriveKeyFromPassphrase(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PASSPHRASE_KDF_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export interface PassphraseEncrypted {
  kdf: { algo: "PBKDF2-SHA256"; iterations: number; salt: string }; // salt: hex
  iv: string;   // hex (12 bytes)
  data: string; // hex ciphertext
}

export async function encryptWithPassphrase(
  plaintext: string,
  passphrase: string
): Promise<PassphraseEncrypted> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const key = await deriveKeyFromPassphrase(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return {
    kdf: { algo: "PBKDF2-SHA256", iterations: PASSPHRASE_KDF_ITERATIONS, salt: bufToHex(salt) },
    iv: bufToHex(iv),
    data: bufToHex(new Uint8Array(ciphertext)),
  };
}

export async function decryptWithPassphrase(
  payload: PassphraseEncrypted,
  passphrase: string
): Promise<string> {
  if (!payload?.kdf || payload.kdf.algo !== "PBKDF2-SHA256" || !Number.isInteger(payload.kdf.iterations) || payload.kdf.iterations < 100_000 || payload.kdf.iterations > 1_000_000 || !/^[0-9a-f]{32}$/i.test(payload.kdf.salt) || !/^[0-9a-f]{24}$/i.test(payload.iv) || typeof payload.data !== "string" || payload.data.length < 32 || payload.data.length % 2 || !/^[0-9a-f]+$/i.test(payload.data)) throw new Error("암호화 백업 형식이 올바르지 않습니다.");
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: hexToBuf(payload.kdf.salt),
      iterations: payload.kdf.iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: hexToBuf(payload.iv) },
    key,
    hexToBuf(payload.data)
  );
  return new TextDecoder().decode(plaintext);
}
