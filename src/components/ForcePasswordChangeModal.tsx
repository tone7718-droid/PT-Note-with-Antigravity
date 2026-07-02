"use client";

import { useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { ShieldAlert } from "lucide-react";

/**
 * 기본 비밀번호(0000) 상태의 master가 로그인하면 표시되는 강제 비밀번호 변경 모달.
 * 변경 완료 전까지 앱 사용이 차단되며 닫을 수 없다.
 */
export default function ForcePasswordChangeModal() {
  const therapist = useAuthStore((s) => s.therapist);
  const setTherapist = useAuthStore((s) => s.setTherapist);
  const updateTherapistPassword = useAuthStore((s) => s.updateTherapistPassword);
  const signOut = useAuthStore((s) => s.signOut);

  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!/^\d{4,8}$/.test(password)) {
      setError("비밀번호는 숫자 4~8자리여야 합니다.");
      return;
    }
    if (password === "0000") {
      setError("기본 비밀번호(0000)는 다시 사용할 수 없습니다.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("비밀번호가 서로 일치하지 않습니다.");
      return;
    }

    setLoading(true);
    try {
      await updateTherapistPassword(password);
      if (therapist) {
        setTherapist({ ...therapist, mustChangePassword: false });
      }
    } catch (err) {
      setError((err as Error).message || "비밀번호 변경에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="p-8">
          <div className="w-14 h-14 rounded-full bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center mb-4 mx-auto">
            <ShieldAlert size={30} className="text-amber-500 dark:text-amber-400" />
          </div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-white mb-2 text-center tracking-tight">
            비밀번호를 변경해주세요
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-6 leading-relaxed">
            기본 비밀번호(0000)를 사용 중입니다.<br />
            보안을 위해 새 비밀번호 설정 전까지<br />앱을 사용할 수 없습니다.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="force-pw" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">새 비밀번호 (숫자 4~8자리)</label>
              <input id="force-pw" type="password" value={password}
                onChange={(e) => { setPassword(e.target.value.replace(/\D/g, "")); setError(""); }}
                placeholder="••••••••" autoFocus
                className="w-full p-4 border-2 border-gray-200 dark:border-gray-700 rounded-2xl focus:outline-none focus:ring-4 focus:ring-gray-900/30 dark:focus:ring-white/10 focus:border-gray-900 dark:focus:border-white font-medium text-lg tracking-widest bg-white dark:bg-gray-900 dark:text-white" />
            </div>
            <div>
              <label htmlFor="force-pw2" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">새 비밀번호 확인</label>
              <input id="force-pw2" type="password" value={passwordConfirm}
                onChange={(e) => { setPasswordConfirm(e.target.value.replace(/\D/g, "")); setError(""); }}
                placeholder="••••••••"
                className="w-full p-4 border-2 border-gray-200 dark:border-gray-700 rounded-2xl focus:outline-none focus:ring-4 focus:ring-gray-900/30 dark:focus:ring-white/10 focus:border-gray-900 dark:focus:border-white font-medium text-lg tracking-widest bg-white dark:bg-gray-900 dark:text-white" />
            </div>
            {error && <p className="text-red-500 dark:text-red-400 text-sm font-bold text-center">{error}</p>}
            <div className="pt-4 flex gap-3">
              <button type="button" onClick={() => signOut()}
                className="flex-[0.5] py-4 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-bold text-base rounded-2xl transition-all">
                로그아웃
              </button>
              <button type="submit" disabled={loading}
                className="flex-1 py-4 bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-200 disabled:bg-gray-400 text-white dark:text-gray-900 font-bold text-base rounded-2xl shadow-lg transition-all">
                {loading ? "변경 중..." : "비밀번호 변경"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
