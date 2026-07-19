"use client";

import { useEffect, useState } from "react";
import { useNoteStore } from "@/store/useNoteStore";
import type { BackupSnapshot, BackupReason } from "@/lib/autoBackup";
import { X, History, AlertCircle, RotateCcw } from "lucide-react";

interface BackupRestoreModalProps {
  onClose: () => void;
}

const REASON_LABELS: Record<BackupReason, string> = {
  "before-delete": "삭제 전 자동 백업",
  "before-import": "가져오기 전 자동 백업",
  "before-restore": "복원 전 자동 백업",
  "before-edit": "수정 전 자동 백업",
};

function formatDateTime(isoStr: string): string {
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return isoStr;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function BackupRestoreModal({ onClose }: BackupRestoreModalProps) {
  const listBackups = useNoteStore((s) => s.listBackups);
  const restoreBackup = useNoteStore((s) => s.restoreBackup);

  const [snapshots, setSnapshots] = useState<BackupSnapshot[] | null>(null);
  const [confirming, setConfirming] = useState<BackupSnapshot | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void listBackups().then((snaps) => {
      // 최신이 배열 끝에 저장되므로 화면에는 최신부터 표시
      if (!cancelled) setSnapshots([...snaps].reverse());
    });
    return () => {
      cancelled = true;
    };
  }, [listBackups]);

  const handleRestore = async () => {
    if (!confirming) return;
    setError("");
    setRestoring(true);
    try {
      const count = await restoreBackup(confirming.at);
      setConfirming(null);
      alert(`복원 완료: 노트 ${count}건으로 되돌렸습니다.\n(복원 직전 상태도 자동 백업에 남아 있습니다.)`);
      onClose();
    } catch (err) {
      setError((err as Error).message || "복원 중 오류가 발생했습니다.");
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]">
        {/* 헤더 */}
        <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-gray-50/50 dark:bg-gray-900/40">
          <h2 className="text-xl font-black text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <History className="text-blue-600 dark:text-blue-400" size={24} /> 자동 백업 복원
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-500 dark:text-gray-400" aria-label="모달 닫기"><X size={22} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
            삭제·가져오기 직전에 자동으로 저장된 스냅샷입니다 (최근 5개, 암호화 저장).
            복원하면 <b>현재 노트 전체가 선택한 시점의 내용으로 교체</b>되며,
            복원 직전 상태도 자동 백업에 남아 다시 되돌릴 수 있습니다.
          </p>

          {snapshots === null ? (
            <p className="text-center text-gray-400 dark:text-gray-500 py-8 text-sm font-bold">불러오는 중...</p>
          ) : snapshots.length === 0 ? (
            <p className="text-center text-gray-400 dark:text-gray-500 py-8 text-sm font-bold bg-gray-50 dark:bg-gray-900/40 rounded-2xl border-2 border-dashed border-gray-100 dark:border-gray-700">
              저장된 자동 백업이 없습니다.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {snapshots.map((snap) => (
                <li key={snap.at} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900/40 rounded-2xl border-2 border-gray-100 dark:border-gray-700">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 dark:text-gray-100 text-sm">{formatDateTime(snap.at)}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {REASON_LABELS[snap.reason] ?? snap.reason} · 노트 {snap.noteCount}건
                    </p>
                  </div>
                  <button
                    onClick={() => { setConfirming(snap); setError(""); }}
                    className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 text-sm font-bold text-blue-600 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-xl border border-blue-100 dark:border-blue-800 transition-colors"
                    aria-label={`${formatDateTime(snap.at)} 백업으로 복원`}
                  >
                    <RotateCcw size={14} /> 복원
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 복원 확인 */}
      {confirming && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-14 h-14 rounded-full bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center mb-6 mx-auto">
              <AlertCircle size={32} className="text-amber-500" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2 text-center text-balance">백업으로 복원</h3>
            <p className="text-center text-gray-500 dark:text-gray-400 mb-6 leading-relaxed text-sm">
              <span className="font-bold text-gray-800 dark:text-gray-200">{formatDateTime(confirming.at)}</span> 시점
              (노트 {confirming.noteCount}건)으로<br />전체 노트를 교체하시겠습니까?
            </p>
            {error && <p className="text-red-500 dark:text-red-400 text-xs font-bold text-center mb-3">{error}</p>}
            <div className="flex gap-3">
              <button onClick={() => setConfirming(null)} className="flex-1 py-3.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-bold rounded-xl transition-colors">취소</button>
              <button onClick={handleRestore} disabled={restoring} className="flex-1 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white dark:bg-gray-100 dark:hover:bg-white dark:disabled:bg-gray-600 dark:text-gray-900 font-bold rounded-xl shadow-lg transition-colors">
                {restoring ? "복원 중..." : "복원"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
