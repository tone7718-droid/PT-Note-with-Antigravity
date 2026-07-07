"use client";

import { useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { validateNewPassword } from "@/lib/passwordPolicy";
import { KeyRound, CheckCircle2 } from "lucide-react";

interface PasswordChangeModalProps {
  onClose: () => void;
}

/**
 * 치료사 본인 비밀번호 변경 모달 (master·일반 공통, 무제한 반복 가능).
 * 현재 비밀번호 재확인 → 새 비밀번호 + 확인 → 저장.
 */
export default function PasswordChangeModal({ onClose }: PasswordChangeModalProps) {
  const therapist = useAuthStore((s) => s.therapist);
  const setTherapist = useAuthStore((s) => s.setTherapist);
  const reauthenticate = useAuthStore((s) => s.reauthenticate);
  const updateTherapistPassword = useAuthStore((s) => s.updateTherapistPassword);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!therapist?.id) {
      setError("로그인 정보를 확인할 수 없습니다.");
      return;
    }
    const policyError = validateNewPassword(next);
    if (policyError) {
      setError(policyError);
      return;
    }
    if (next !== confirm) {
      setError("새 비밀번호가 서로 일치하지 않습니다.");
      return;
    }

    setLoading(true);
    try {
      const ok = await reauthenticate(therapist.id, current);
      if (!ok) {
        setError("현재 비밀번호가 일치하지 않습니다.");
        return;
      }
      await updateTherapistPassword(next);
      // 기본 비밀번호 사용 배너 해제
      if (therapist.usingDefaultPassword) {
        const updated = { ...therapist };
        delete updated.usingDefaultPassword;
        setTherapist(updated);
      }
      setSuccess(true);
      setTimeout(onClose, 1200);
    } catch (err) {
      setError((err as Error).message || "비밀번호 변경에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="p-8">
          <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-4 mx-auto">
            <KeyRound size={28} className="text-gray-700 dark:text-gray-200" />
          </div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-white mb-1 text-center tracking-tight">
            비밀번호 변경
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center mb-6">
            4~20자 영문/숫자/특수문자
          </p>

          {success ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <CheckCircle2 size={44} className="text-green-500" />
              <p className="font-bold text-gray-900 dark:text-white">비밀번호가 변경되었습니다.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="pw-current" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">현재 비밀번호</label>
                <input id="pw-current" type="password" value={current} autoComplete="current-password"
                  onChange={(e) => { setCurrent(e.target.value); setError(""); }}
                  placeholder="••••••••" autoFocus
                  className="w-full p-3.5 border-2 border-gray-200 dark:border-gray-700 rounded-2xl focus:outline-none focus:ring-4 focus:ring-gray-900/30 dark:focus:ring-white/10 focus:border-gray-900 dark:focus:border-white font-medium bg-white dark:bg-gray-900 dark:text-white" />
              </div>
              <div>
                <label htmlFor="pw-new" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">새 비밀번호</label>
                <input id="pw-new" type="password" value={next} autoComplete="new-password"
                  onChange={(e) => { setNext(e.target.value); setError(""); }}
                  placeholder="••••••••"
                  className="w-full p-3.5 border-2 border-gray-200 dark:border-gray-700 rounded-2xl focus:outline-none focus:ring-4 focus:ring-gray-900/30 dark:focus:ring-white/10 focus:border-gray-900 dark:focus:border-white font-medium bg-white dark:bg-gray-900 dark:text-white" />
              </div>
              <div>
                <label htmlFor="pw-new2" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">새 비밀번호 확인</label>
                <input id="pw-new2" type="password" value={confirm} autoComplete="new-password"
                  onChange={(e) => { setConfirm(e.target.value); setError(""); }}
                  placeholder="••••••••"
                  className="w-full p-3.5 border-2 border-gray-200 dark:border-gray-700 rounded-2xl focus:outline-none focus:ring-4 focus:ring-gray-900/30 dark:focus:ring-white/10 focus:border-gray-900 dark:focus:border-white font-medium bg-white dark:bg-gray-900 dark:text-white" />
              </div>
              {error && <p className="text-red-500 dark:text-red-400 text-sm font-bold text-center">{error}</p>}
              <div className="pt-2 flex gap-3">
                <button type="button" onClick={onClose}
                  className="flex-[0.5] py-3.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-bold rounded-2xl transition-all">
                  취소
                </button>
                <button type="submit" disabled={loading}
                  className="flex-1 py-3.5 bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-200 disabled:bg-gray-400 text-white dark:text-gray-900 font-bold rounded-2xl shadow-lg transition-all">
                  {loading ? "변경 중..." : "변경하기"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
