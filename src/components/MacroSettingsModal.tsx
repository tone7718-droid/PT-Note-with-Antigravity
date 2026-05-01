"use client";

import { useState, useEffect } from "react";
import { useMacroStore, type MacroEntry } from "@/store/useMacroStore";
import { X, Save, Zap } from "lucide-react";

interface MacroSettingsModalProps {
  onClose: () => void;
}

export default function MacroSettingsModal({ onClose }: MacroSettingsModalProps) {
  const storeMacros = useMacroStore((s) => s.macros);
  const saveMacros = useMacroStore((s) => s.saveMacros);

  const [draft, setDraft] = useState<MacroEntry[]>([]);

  useEffect(() => {
    setDraft(storeMacros.map((m) => ({ ...m })));
  }, [storeMacros]);

  const handleChange = (index: number, text: string) => {
    setDraft((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], text };
      return next;
    });
  };

  const handleSave = () => {
    saveMacros(draft);
    onClose();
  };

  const filledCount = draft.filter((m) => m.text.trim() !== "").length;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* 헤더 */}
        <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Zap className="text-amber-500" size={28} /> 매크로 문구 등록
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors" aria-label="모달 닫기">
            <X size={24} />
          </button>
        </div>

        {/* 안내 */}
        <div className="px-8 py-4 bg-amber-50 border-b border-amber-100">
          <p className="text-sm text-amber-800 font-medium leading-relaxed">
            각 슬롯에 자주 사용하는 문구를 등록하세요. 텍스트 입력창에서 <span className="font-bold font-mono bg-amber-100 px-1.5 py-0.5 rounded">/도수</span>를 입력하면 등록된 문구 목록이 나타나며, 선택하면 자동으로 입력됩니다.
          </p>
          <p className="text-xs text-amber-600 mt-1">
            등록된 매크로: <span className="font-bold">{filledCount}</span> / 20개
          </p>
        </div>

        {/* 목록 */}
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-4">
          {draft.map((macro, idx) => (
            <div key={macro.key} className="flex items-start gap-4">
              <div className="shrink-0 w-20 h-[3.25rem] flex items-center justify-center bg-gray-900 text-white font-mono font-bold text-sm rounded-xl shadow-sm">
                {macro.key}
              </div>
              <div className="flex-1 relative">
                <textarea
                  value={macro.text}
                  onChange={(e) => handleChange(idx, e.target.value)}
                  placeholder={`/도수${idx + 1}에 해당하는 문구를 입력하세요...`}
                  rows={1}
                  className="w-full p-3.5 border-2 border-gray-100 rounded-2xl focus:border-gray-900 focus:ring-4 focus:ring-gray-900/10 transition-all font-medium text-sm outline-none resize-none min-h-[3.25rem]"
                  onInput={(e) => {
                    const ta = e.currentTarget;
                    ta.style.height = "auto";
                    ta.style.height = `${ta.scrollHeight}px`;
                  }}
                />
                {macro.text.trim() && (
                  <button
                    type="button"
                    onClick={() => handleChange(idx, "")}
                    className="absolute top-3 right-3 text-gray-300 hover:text-red-500 transition-colors"
                    aria-label="문구 삭제"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* 하단 버튼 */}
        <div className="px-8 py-5 border-t border-gray-100 flex items-center justify-end gap-3 bg-gray-50/50">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-3 text-gray-600 bg-gray-100 hover:bg-gray-200 font-bold rounded-2xl transition-all"
          >
            취소 (Cancel)
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-2 px-8 py-3 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-2xl shadow-lg transition-all transform hover:-translate-y-0.5"
          >
            <Save size={18} /> 저장 (Save)
          </button>
        </div>
      </div>
    </div>
  );
}
