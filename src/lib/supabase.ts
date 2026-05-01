import { createClient } from "@supabase/supabase-js";

// Fallback placeholders so `next build` (static export) does not crash
// when environment variables are not yet provisioned (e.g. first Vercel deploy).
// At runtime, real values must be injected via NEXT_PUBLIC_* env vars at build time.
const PLACEHOLDER_URL = "https://placeholder.supabase.co";
const PLACEHOLDER_KEY = "placeholder-anon-key";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? PLACEHOLDER_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? PLACEHOLDER_KEY;

export const isSupabaseConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!isSupabaseConfigured && typeof window !== "undefined") {
  // Browser-side warning only (avoid noisy build logs on Vercel)
  console.warn(
    "[supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY not set. " +
    "The app is running with placeholder credentials and cannot reach the backend."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/* ══════════════════════════════════════════
   Access Token 캐싱 — getSession() 우회
   ══════════════════════════════════════════
   이슈: supabase.auth.getSession()이 일부 환경에서 LockManager hang 또는
   stale/corrupt 세션을 반환해 Edge Function 호출 시 "Invalid JWT" 에러 발생.
   해결: signIn 시 받은 access_token을 모듈 전역에 캐싱 + 페이지 새로고침
   대응을 위해 localStorage에서 직접 파싱.
*/

let cachedAccessToken: string | null = null;

// Supabase JS SDK가 사용하는 localStorage 키 형식: sb-<project-ref>-auth-token
function getStorageKey(): string | null {
  try {
    const url = new URL(supabaseUrl);
    const ref = url.hostname.split(".")[0]; // e.g. "cuhnjrxuoanvloyfthhg"
    return `sb-${ref}-auth-token`;
  } catch {
    return null;
  }
}

function readTokenFromStorage(): string | null {
  if (typeof window === "undefined") return null;
  const key = getStorageKey();
  if (!key) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // 형태: { access_token, refresh_token, expires_at, ... }
    return parsed?.access_token ?? parsed?.currentSession?.access_token ?? null;
  } catch {
    return null;
  }
}

// 모듈 로드 시 localStorage에서 한 번 시도 (페이지 새로고침 후에도 사용 가능)
if (typeof window !== "undefined") {
  cachedAccessToken = readTokenFromStorage();
}

export function setCachedAccessToken(token: string | null) {
  cachedAccessToken = token;
}

export function getCachedAccessToken(): string | null {
  // 메모리 캐시가 없으면 localStorage에서 다시 시도
  if (!cachedAccessToken) {
    cachedAccessToken = readTokenFromStorage();
  }
  return cachedAccessToken;
}

// Edge Function 호출용 헬퍼 — supabase.functions.invoke()의 자동 setAuth 메커니즘이
// 이 환경에서 신뢰성 없게 동작하므로 raw fetch로 직접 호출
export async function callEdgeFunction<TReq, TRes>(
  name: string,
  body: TReq
): Promise<TRes> {
  const token = getCachedAccessToken();
  if (!token) {
    throw new Error("로그인 세션이 없습니다. 다시 로그인해주세요.");
  }

  // 디버그: 토큰 형태 확인 (실제 값은 로깅하지 않음)
  if (typeof window !== "undefined") {
    console.log(
      `[callEdgeFunction] ${name} — token length=${token.length}, prefix=${token.slice(0, 12)}…`
    );
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify(body),
  });

  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    // ignore parse errors — fall through to status-based error
  }

  if (!response.ok) {
    const msg =
      (parsed as { error?: string; message?: string })?.error ??
      (parsed as { error?: string; message?: string })?.message ??
      `HTTP ${response.status} ${response.statusText}`;
    throw new Error(msg);
  }

  return parsed as TRes;
}

/* ══════════════════════════════════════════
   비밀번호 재확인 (raw fetch — SDK 우회)
   ══════════════════════════════════════════
   이슈: 이미 로그인된 상태에서 supabase.auth.signInWithPassword를
   다시 호출하면 LockManager 이슈로 hang됨. Auth REST API를 직접 호출.
*/
export async function verifyPasswordViaRest(
  email: string,
  password: string
): Promise<boolean> {
  try {
    const response = await fetch(
      `${supabaseUrl}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify({ email, password }),
      }
    );
    return response.ok;
  } catch (err) {
    console.error("[verifyPasswordViaRest] failed:", err);
    return false;
  }
}
