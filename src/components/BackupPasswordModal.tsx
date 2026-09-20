"use client";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useNoteStore } from "@/store/useNoteStore";
import { useAuthStore } from "@/store/useAuthStore";
import { describeImport } from "@/lib/backupExchange";
import { todayLocalISO } from "@/lib/localDate";

export default function BackupPasswordModal({ text, onClose }: { text?: string; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async () => {
    setBusy(true); setError("");
    try {
      if (text !== undefined) {
        alert(describeImport(await useNoteStore.getState().importData(text, password)));
      } else {
        if (password.length < 8 || password !== confirm) throw new Error("백업 암호는 8자 이상이며 확인란과 일치해야 합니다.");
        if (!await useAuthStore.getState().reauthenticate(useAuthStore.getState().therapist?.id ?? "", loginPassword)) throw new Error("현재 로그인 비밀번호가 일치하지 않습니다.");
        const json = await useNoteStore.getState().exportDataEncrypted(password);
        const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
        const a = document.createElement("a"); a.href = url; a.download = `pt-note-backup-${todayLocalISO()}.encrypted.json`; a.click(); URL.revokeObjectURL(url);
      }
      onClose();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  return createPortal(<div className="fixed inset-0 z-[250] bg-black/50 flex items-center justify-center p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="backup-title" className="w-full max-w-sm rounded-3xl bg-white dark:bg-gray-900 p-6 shadow-xl">
      <h2 id="backup-title" className="font-bold text-xl mb-3">{text !== undefined ? "암호화 백업 가져오기" : "암호화 백업 내보내기"}</h2>
      <p className="text-sm mb-4">백업 암호를 잊으면 파일을 복원할 수 없습니다. 안전한 곳에 보관하세요.</p>
      <form onSubmit={e => { e.preventDefault(); void run(); }}>
        <label className="block text-sm">백업 암호<input type="password" autoComplete="off" required value={password} onChange={e => setPassword(e.target.value)} disabled={busy} className="block w-full border rounded-xl p-3 mb-3 dark:bg-gray-800" /></label>
        {text === undefined && <>
          <label className="block text-sm">백업 암호 확인<input type="password" autoComplete="off" required value={confirm} onChange={e => setConfirm(e.target.value)} disabled={busy} className="block w-full border rounded-xl p-3 mb-3 dark:bg-gray-800" /></label>
          <label className="block text-sm">현재 로그인 비밀번호<input type="password" autoComplete="current-password" required value={loginPassword} onChange={e => setLoginPassword(e.target.value)} disabled={busy} className="block w-full border rounded-xl p-3 mb-3 dark:bg-gray-800" /></label>
        </>}
        {error && <p role="alert" className="text-red-600 my-3">{error}</p>}
        <div className="flex gap-3 mt-4"><button type="button" disabled={busy} onClick={onClose} className="flex-1 p-3 border rounded-xl">취소</button><button disabled={busy} className="flex-1 p-3 bg-blue-600 text-white rounded-xl">{busy ? "처리 중…" : "확인"}</button></div>
      </form>
    </section>
  </div>, document.body);
}
