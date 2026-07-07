/* ── 비밀번호 해싱 유틸리티 (PBKDF2 + salt, 레거시 SHA-256 호환) ── */

const PBKDF2_ITERATIONS = 120000;
const SALT_BYTES = 16;
const KEY_BITS = 256;
const PBKDF2_PREFIX = "pbkdf2";

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(plain: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(plain),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    keyMaterial,
    KEY_BITS
  );
  return new Uint8Array(bits);
}

/** 레거시(솔트 없는 SHA-256 hex) — 검증 호환 및 자동 업그레이드 판정용 */
async function legacySha256Hex(plain: string): Promise<string> {
  const data = new TextEncoder().encode(plain);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** 새 비밀번호를 PBKDF2 형식 문자열로 해싱: `pbkdf2$<iters>$<saltB64>$<hashB64>` */
export async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await deriveKey(plain, salt, PBKDF2_ITERATIONS);
  return `${PBKDF2_PREFIX}$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(derived)}`;
}

/** 저장된 해시가 레거시(SHA-256) 포맷이면 true — 로그인 성공 시 새 포맷으로 업그레이드 대상 */
export function isLegacyHash(stored: string): boolean {
  return !!stored && !stored.startsWith(`${PBKDF2_PREFIX}$`);
}

/** PBKDF2·레거시 두 포맷 모두 검증 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (!stored) return false;

  if (stored.startsWith(`${PBKDF2_PREFIX}$`)) {
    const parts = stored.split("$");
    if (parts.length !== 4) return false;
    const iterations = parseInt(parts[1], 10);
    if (!Number.isFinite(iterations) || iterations <= 0) return false;
    let salt: Uint8Array;
    let expected: Uint8Array;
    try {
      salt = fromBase64(parts[2]);
      expected = fromBase64(parts[3]);
    } catch {
      return false;
    }
    const derived = await deriveKey(plain, salt, iterations);
    return constantTimeEqual(derived, expected);
  }

  // 레거시 SHA-256 hex
  const legacy = await legacySha256Hex(plain);
  return legacy === stored;
}
