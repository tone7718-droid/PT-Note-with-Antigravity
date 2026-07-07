const ENC_KEY_STORAGE = "pt_enc_key_v1";

let cachedKey: CryptoKey | null = null;

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
  if (cachedKey) return cachedKey;
  if (typeof window === "undefined") throw new Error("browser-only");

  const stored = window.localStorage.getItem(ENC_KEY_STORAGE);
  if (stored) {
    cachedKey = await crypto.subtle.importKey(
      "raw",
      hexToBuf(stored),
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
    return cachedKey;
  }

  cachedKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const exported = await crypto.subtle.exportKey("raw", cachedKey);
  window.localStorage.setItem(ENC_KEY_STORAGE, bufToHex(new Uint8Array(exported)));
  return cachedKey;
}

export async function encryptData(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return `${bufToHex(iv)}:${bufToHex(new Uint8Array(ciphertext))}`;
}

export async function decryptData(encrypted: string): Promise<string> {
  const sep = encrypted.indexOf(":");
  if (sep !== 24) throw new Error("invalid format");
  const key = await getKey();
  const iv = hexToBuf(encrypted.slice(0, sep));
  const ciphertext = hexToBuf(encrypted.slice(sep + 1));
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}
