"use client";

import { useState } from "react";
import { useNoteStore } from "@/store/useNoteStore";
import type { NoteData } from "@/types";
import * as ds from "@/lib/dataService";
import { noteDataToDbInsert } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";
import { X, Upload, CheckCircle, AlertCircle } from "lucide-react";

interface DataMigrationModalProps {
  onClose: () => void;
}

export default function DataMigrationModal({ onClose }: DataMigrationModalProps) {
  const refreshNotes = useNoteStore((s) => s.refreshNotes);
  const [status, setStatus] = useState<"idle" | "migrating" | "done" | "error">("idle");
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState({ notes: 0, skipped: 0 });
  const [errorMsg, setErrorMsg] = useState("");

  const handleMigrate = async () => {
    setStatus("migrating");
    setErrorMsg("");

    try {
      // localStorage에서 데이터 읽기
      const localNotesRaw = localStorage.getItem("progressNotes");
      const localNotes: NoteData[] = localNotesRaw ? JSON.parse(localNotesRaw) : [];

      if (localNotes.length === 0) {
        setResult({ notes: 0, skipped: 0 });
        setStatus("done");
        return;
      }

      setProgress({ current: 0, total: localNotes.length });

      // 기존 Supabase 노트 ID 확인 (중복 방지)
      const existingNotes = await ds.fetchNotes();
      const existingIds = new Set(existingNotes.map((n) => n.id));

      const newNotes = localNotes.filter((n) => !existingIds.has(n.id));
      const skipped = localNotes.length - newNotes.length;

      // 50건씩 배치 업로드
      const BATCH_SIZE = 50;
      let uploaded = 0;

      for (let i = 0; i < newNotes.length; i += BATCH_SIZE) {
        const batch = newNotes.slice(i, i + BATCH_SIZE).map(noteDataToDbInsert);
        const { error } = await supabase.from("progress_notes").upsert(batch, { onConflict: "id" });
        if (error) throw new Error(`배치 ${i} 업로드 실패: ${error.message}`);
        uploaded += batch.length;
        setProgress({ current: uploaded, total: newNotes.length });
      }

      setResult({ notes: uploaded, skipped });
      setStatus("done");

      // 노트 목록 새로고침
      await refreshNotes();
    } catch (err) {
      setErrorMsg((err as Error).message);
      setStatus("error");
    }
  };

  const handleClearLocal = () => {
    localStorage.removeItem("progressNotes");
    localStorage.removeItem("pt_therapists");
    localStorage.removeItem("pt_therapist");
    alert("로컬 데이터가 삭제되었습니다.");
    onClose();
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
            <Upload className="text-blue-600" size={24} /> 데이터 마이그레이션
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors"><X size={20} /></button>
        </div>

        <div className="p-8">
          {status === "idle" && (
            <>
              <p className="text-gray-600 mb-6 leading-relaxed">
                브라우저 로컬 저장소에 있는 기존 노트 데이터를<br />
                Supabase 클라우드로 마이그레이션합니다.
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6">
                <p className="text-amber-800 text-sm font-bold">
                  주의: 치료사 계정은 자동 마이그레이션되지 않습니다.<br />
                  치료사 관리 메뉴에서 새로 등록해주세요.
                </p>
              </div>
              <button onClick={handleMigrate}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg rounded-2xl shadow-lg transition-all">
                마이그레이션 시작
              </button>
            </>
          )}

          {status === "migrating" && (
            <div className="text-center py-4">
              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-700 font-bold mb-3">마이그레이션 진행 중...</p>
              <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                <div
                  className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                  style={{ width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : "0%" }}
                />
              </div>
              <p className="text-sm text-gray-500 font-medium">
                {progress.current} / {progress.total}건
              </p>
            </div>
          )}

          {status === "done" && (
            <div className="text-center py-4">
              <CheckCircle size={48} className="text-green-500 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-900 mb-2">마이그레이션 완료!</h3>
              <p className="text-gray-600 mb-6">
                노트 <span className="font-bold text-green-600">{result.notes}건</span> 업로드 완료
                {result.skipped > 0 && (
                  <>, <span className="font-bold text-gray-500">{result.skipped}건</span> 중복 건너뜀</>
                )}
              </p>
              <div className="space-y-3">
                <button onClick={handleClearLocal}
                  className="w-full py-3.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-2xl border border-red-200 transition-all">
                  로컬 데이터 삭제 (권장)
                </button>
                <button onClick={onClose}
                  className="w-full py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-2xl transition-all">
                  나중에 삭제
                </button>
              </div>
            </div>
          )}

          {status === "error" && (
            <div className="text-center py-4">
              <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-900 mb-2">오류 발생</h3>
              <p className="text-red-600 text-sm mb-6 bg-red-50 p-3 rounded-xl">{errorMsg}</p>
              <div className="flex gap-3">
                <button onClick={() => setStatus("idle")}
                  className="flex-1 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-2xl transition-all">
                  다시 시도
                </button>
                <button onClick={onClose}
                  className="flex-1 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-2xl transition-all">
                  닫기
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
