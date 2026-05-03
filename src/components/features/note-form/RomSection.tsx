"use client";

import React, { useState, useRef, useEffect } from "react";
import { useFormContext, useFieldArray, Controller } from "react-hook-form";
import type { NoteData } from "@/types";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { cn } from "@/utils/cn";

/* ── 한국 물리치료 기준 주요 관절 정상 ROM 데이터베이스 ── */
const ROM_DATABASE: Record<string, string> = {
  // 어깨
  "오른쪽 어깨 굴곡": "0~180°", "왼쪽 어깨 굴곡": "0~180°", "오른쪽 어깨 신전": "0~60°", "왼쪽 어깨 신전": "0~60°",
  "오른쪽 어깨 외전": "0~180°", "왼쪽 어깨 외전": "0~180°", "오른쪽 어깨 내전": "0~50°", "왼쪽 어깨 내전": "0~50°",
  "오른쪽 어깨 내회전": "0~70°", "왼쪽 어깨 내회전": "0~70°", "오른쪽 어깨 외회전": "0~90°", "왼쪽 어깨 외회전": "0~90°",
  // 팔꿈치/전완
  "오른쪽 팔꿈치 굴곡": "0~150°", "왼쪽 팔꿈치 굴곡": "0~150°", "오른쪽 팔꿈치 신전": "0~0°", "왼쪽 팔꿈치 신전": "0~0°",
  "오른쪽 전완 회외 (Supination)": "0~80°", "왼쪽 전완 회외 (Supination)": "0~80°",
  "오른쪽 전완 회내 (Pronation)": "0~80°", "왼쪽 전완 회내 (Pronation)": "0~80°",
  // 손목
  "오른쪽 손목 굴곡": "0~80°", "왼쪽 손목 굴곡": "0~80°", "오른쪽 손목 신전": "0~70°", "왼쪽 손목 신전": "0~70°",
  // 고관절
  "오른쪽 고관절 굴곡": "0~120°", "왼쪽 고관절 굴곡": "0~120°", "오른쪽 고관절 신전": "0~30°", "왼쪽 고관절 신전": "0~30°",
  "오른쪽 고관절 외전": "0~45°", "왼쪽 고관절 외전": "0~45°", "오른쪽 고관절 내전": "0~30°", "왼쪽 고관절 내전": "0~30°",
  "오른쪽 고관절 내회전": "0~45°", "왼쪽 고관절 내회전": "0~45°", "오른쪽 고관절 외회전": "0~45°", "왼쪽 고관절 외회전": "0~45°",
  // 무릎
  "오른쪽 무릎 굴곡": "0~135°", "왼쪽 무릎 굴곡": "0~135°", "오른쪽 무릎 신전": "0~0°", "왼쪽 무릎 신전": "0~0°",
  // 발목
  "오른쪽 발목 배굴": "0~20°", "왼쪽 발목 배굴": "0~20°", "오른쪽 발목 저굴": "0~50°", "왼쪽 발목 저굴": "0~50°",
  "오른쪽 발목 내번 (Inversion)": "0~35°", "왼쪽 발목 내번 (Inversion)": "0~35°",
  "오른쪽 발목 외번 (Eversion)": "0~15°", "왼쪽 발목 외번 (Eversion)": "0~15°",
  // 목
  "목 굴곡": "0~45°", "목 신전": "0~45°", "목 회전": "0~80°", "목 좌회전": "0~80°", "목 우회전": "0~80°",
  "목 좌측굴": "0~45°", "목 우측굴": "0~45°",
  // 허리
  "허리 굴곡": "0~60°", "허리 신전": "0~25°", "허리 좌회전": "0~45°", "허리 우회전": "0~45°",
  "허리 좌측굴": "0~25°", "허리 우측굴": "0~25°",
};

const JOINT_NAMES = Object.keys(ROM_DATABASE);

export function RomSection({ isGeneratingPdf }: { isGeneratingPdf: boolean }) {
  const { control, watch, setValue } = useFormContext<NoteData>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: "rom",
  });
  
  // 감시용
  const romValues = watch("rom");

  const [activeId, setActiveId] = useState<string | null>(null);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setActiveId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const getFilteredJoints = (query: string) => {
    if (!query?.trim()) return [];
    const normalizedQuery = query.toLowerCase().replace(/\s+/g, "");
    return JOINT_NAMES.filter((j) => j.toLowerCase().replace(/\s+/g, "").includes(normalizedQuery));
  };

  const getNormalRange = (joint: string): string | null => {
    return ROM_DATABASE[joint] ?? null;
  };

  const sectionTitleCls = isGeneratingPdf
    ? "text-lg font-bold text-black border-b-2 border-gray-400 pb-1 mb-2 mt-4"
    : "text-lg sm:text-xl md:text-2xl font-bold text-gray-900 border-b-2 border-gray-100 pb-2 sm:pb-3 mb-4 sm:mb-6 print:text-xl print:mb-3 print:pb-2 print:-mt-2";

  return (
    <Card isPdfMode={isGeneratingPdf}>
      <h2 className={sectionTitleCls}>4. 관절 가동범위 (ROM &amp; Flexibility)</h2>
      
      <div className={cn("bg-white rounded-2xl border-2 border-slate-100 p-6 shadow-sm min-h-[250px]", isGeneratingPdf && "border-none shadow-none p-0")}>
        <div className="hidden lg:grid lg:grid-cols-[1fr_1.5fr_48px] gap-6 mb-4 px-2">
          <span className="text-sm font-bold text-gray-500 uppercase tracking-wider">관절 동작 선택</span>
          <span className="text-sm font-bold text-gray-500 uppercase tracking-wider">측정 ROM & 정상 범위</span>
          <span />
        </div>

        <div className="space-y-5">
          {fields.map((field, index) => {
            const currentVal = romValues?.[index] || field;
            const suggestions = getFilteredJoints(currentVal.joint);
            const normalRange = getNormalRange(currentVal.joint);
            const showDropdown = activeId === field.id && suggestions.length > 0 && !isGeneratingPdf;
            const isSelected = !!normalRange;

            return (
              <div
                key={field.id}
                className={cn(
                  "grid grid-cols-1 gap-4 items-center p-4 rounded-2xl border-2 transition-all relative",
                  isGeneratingPdf ? "lg:grid-cols-[1fr_1.5fr] border-none p-2 border-b border-gray-200" : "lg:grid-cols-[1fr_1.5fr_48px]",
                  isSelected && !isGeneratingPdf ? "bg-gray-100/50 border-gray-300" : "bg-gray-50/50 border-gray-100",
                  isGeneratingPdf && "bg-transparent border-b-gray-300 rounded-none pb-2"
                )}
                style={{ zIndex: showDropdown ? 50 : 1 }}
              >
                {/* 1) 관절명 */}
                <div className="relative w-full" ref={activeId === field.id ? dropdownRef : undefined}>
                  <Controller
                    control={control}
                    name={`rom.${index}.joint`}
                    render={({ field: inputProps }) => (
                      <Input
                        {...inputProps}
                        isPdfMode={isGeneratingPdf}
                        className={cn(isSelected && !isGeneratingPdf ? "text-gray-900 font-bold bg-white" : "", "bg-gray-50/50")}
                        placeholder="예: 오른쪽 어깨..."
                        onFocus={() => { if (inputProps.value?.trim()) setActiveId(field.id); }}
                        onChange={(e) => {
                          inputProps.onChange(e);
                          setActiveId(field.id);
                          setHighlightIdx(-1);
                          setValue(`rom.${index}.normalRange`, getNormalRange(e.target.value) || "");
                        }}
                        onKeyDown={(e) => {
                          if (!showDropdown) return;
                          if (e.key === "ArrowDown") {
                            e.preventDefault();
                            setHighlightIdx((i) => Math.min(i + 1, suggestions.length - 1));
                          } else if (e.key === "ArrowUp") {
                            e.preventDefault();
                            setHighlightIdx((i) => Math.max(i - 1, 0));
                          } else if (e.key === "Enter" && highlightIdx >= 0) {
                            e.preventDefault();
                            inputProps.onChange(suggestions[highlightIdx]);
                            setValue(`rom.${index}.normalRange`, getNormalRange(suggestions[highlightIdx]) || "");
                            setActiveId(null);
                          } else if (e.key === "Escape") {
                            setActiveId(null);
                          }
                        }}
                      />
                    )}
                  />

                  {showDropdown && (
                    <ul className="absolute top-[105%] left-0 w-full min-w-[240px] z-50 mt-1 max-h-[300px] overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl divide-y divide-gray-50 outline-none">
                      {suggestions.map((s, idx) => (
                        <li
                          key={s}
                          className={`px-4 py-3.5 cursor-pointer text-base font-medium transition-colors flex items-center justify-between ${
                            idx === highlightIdx ? "bg-gray-900 text-white" : "hover:bg-gray-100 text-gray-800"
                          }`}
                          onMouseEnter={() => setHighlightIdx(idx)}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            // dropdown 클릭 시에도 inputProps.onChange 사용
                            const targetJoint = s;
                            setValue(`rom.${index}.joint`, targetJoint, { shouldDirty: true });
                            setValue(`rom.${index}.normalRange`, ROM_DATABASE[targetJoint] || "");
                            setActiveId(null);
                          }}
                        >
                          <span>{s}</span>
                          <span className={`text-sm tracking-wide font-bold ${idx === highlightIdx ? "text-gray-300" : "text-gray-400"}`}>
                            {ROM_DATABASE[s]}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* 2) 측정 ROM + 정상 범위 */}
                <div className="flex items-center gap-3">
                  <div className="relative min-w-[140px] max-w-[160px] shrink-0">
                    <Controller
                      control={control}
                      name={`rom.${index}.measuredROM`}
                      render={({ field: inputProps }) => (
                        <Input
                          {...inputProps}
                          type="number"
                          isPdfMode={isGeneratingPdf}
                          min={0}
                          max={360}
                          className={cn(
                            "pr-8 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-center font-bold text-xl",
                            isSelected && !isGeneratingPdf ? "text-gray-900 bg-white ring-2 ring-gray-200 placeholder-gray-400" : !isGeneratingPdf ? "bg-gray-100 text-gray-400 placeholder-gray-300" : ""
                          )}
                          placeholder="0"
                          disabled={!isSelected}
                        />
                      )}
                    />
                    <span className={`absolute right-4 top-1/2 -translate-y-1/2 font-bold pointer-events-none select-none text-lg ${isSelected ? 'text-gray-500' : 'text-gray-300'}`}>
                      °
                    </span>
                  </div>

                  <span className={`flex-1 text-base font-bold whitespace-nowrap overflow-hidden text-ellipsis px-2 ${isSelected ? "text-slate-600" : "text-gray-300 italic"}`}>
                    {isSelected ? `/ 정상 범위 : ${normalRange}` : "관절 선택 시 표시"}
                  </span>
                </div>

                {/* 4) 삭제 버튼 */}
                {!isGeneratingPdf && (
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="h-[3.5rem] w-full lg:w-12 flex items-center justify-center rounded-xl text-red-400 hover:text-red-700 hover:bg-red-50 transition-colors border-2 border-transparent hover:border-red-200 bg-white shadow-sm"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {!isGeneratingPdf && (
          <div className="mt-8 flex justify-center">
            <button
              type="button"
              onClick={() => append({ joint: "", measuredROM: "", normalRange: "" })}
              className="inline-flex items-center gap-2 text-gray-900 hover:text-black font-extrabold px-8 py-3.5 rounded-2xl hover:bg-gray-100 border-2 border-transparent hover:border-gray-300 transition-all focus:ring-4 focus:ring-gray-900/20 active:scale-95 shadow-sm text-base"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              새로운 관절 측정 추가
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}
