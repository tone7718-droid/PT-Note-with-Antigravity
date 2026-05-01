/* ── Web Crypto API SHA-256 해싱 유틸리티 ── */

export async function hashPassword(plain: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  const plainHash = await hashPassword(plain);
  return plainHash === hash;
}
