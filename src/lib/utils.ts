import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ── 날짜 포맷 (Invalid Date 방어 포함) ──
   new Date("잘못된값")은 예외를 던지지 않고 Invalid Date를 반환하므로
   try/catch가 아니라 getTime() NaN 검사로 방어해야 한다. */

export function formatDate(isoStr: string): string {
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return isoStr || "-";
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export function formatShortDate(isoStr: string): string {
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return isoStr || "-";
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
