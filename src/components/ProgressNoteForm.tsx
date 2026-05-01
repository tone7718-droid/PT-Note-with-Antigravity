"use client";

import { useState, useEffect } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNoteStore } from "@/store/useNoteStore";
import { useAuthStore } from "@/store/useAuthStore";
import { EMPTY_NOTE, type NoteData, type Therapist, NoteDataSchema } from "@/types";

import { PatientInfoSection } from "./features/note-form/PatientInfoSection";
import { ComplaintSection } from "./features/note-form/ComplaintSection";
import { BodyDiagramSection } from "./features/note-form/BodyDiagramSection";
import { RomSection } from "./features/note-form/RomSection";
import { ClinicalSections } from "./features/note-form/ClinicalSections";

export default function ProgressNoteForm() {
  const selectedNoteId = useNoteStore((s) => s.selectedNoteId);
  const notes = useNoteStore((s) => s.notes);
  const saveNote = useNoteStore((s) => s.saveNote);
  const therapist = useAuthStore((s) => s.therapist);

  const methods = useForm<NoteData>({
    defaultValues: EMPTY_NOTE,
    resolver: zodResolver(NoteDataSchema),
  });

  const { handleSubmit, reset, watch } = methods;

  const [showSaved, setShowSaved] = useState(false);
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
  const [savedTherapist, setSavedTherapist] = useState<Therapist | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // 현재 값 구독 (하단 서명 및 토스트용)
  const patientName = watch("patientName");
  const noteDate = watch("noteDate");

  // selectedNoteId 변경 시 폼 데이터 로드 또는 리셋
  useEffect(() => {
    if (selectedNoteId === null) {
      reset({ ...EMPTY_NOTE, noteDate: new Date().toISOString().split("T")[0], rom: [{ joint: "", measuredROM: "", normalRange: "" }] });
      setCurrentNoteId(null);
      setSavedTherapist(null);
      return;
    }
    const note = notes.find((n) => n.id === selectedNoteId);
    if (note) {
      const roms = note.rom && note.rom.length > 0 ? note.rom : [{ joint: "", measuredROM: "", normalRange: "" }];
      reset({ ...note, rom: roms });
      setCurrentNoteId(note.id ?? null);
      setSavedTherapist(note.therapist ?? null);
    }
  }, [selectedNoteId, notes, reset]);

  // 저장 로직
  const onSaveSubmit = async (data: NoteData) => {
    setValidationErrors([]);

    const effectiveNoteDate = data.noteDate || new Date().toISOString().split("T")[0];
    data.noteDate = effectiveNoteDate;
    
    // rom 빈 값 제거
    data.rom = data.rom?.filter(r => r.joint.trim() !== "") || [];

    const formData = {
      ...data,
      therapist: therapist || savedTherapist,
      therapistUid: therapist?.uid || savedTherapist?.uid || "",
    };

    setIsSaving(true);
    try {
      const saved = await saveNote(formData, currentNoteId);
      setCurrentNoteId(saved.id ?? null);
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 3000);
    } catch (err) {
      console.error("저장 실패:", err);
      alert("저장에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setIsSaving(false);
    }
  };

  const onInvalid = (errors: any) => {
    const errorList: string[] = [];
    if (errors.patientName) errorList.push("환자 성명");
    if (errors.diagnosis) errorList.push("진단명");
    setValidationErrors(errorList);
    setTimeout(() => setValidationErrors([]), 4000);
  };

  const handlePrint = () => {
    window.print();
  };

  const displayTherapist = currentNoteId ? savedTherapist : therapist;

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSaveSubmit, onInvalid)}>
        <div className="max-w-5xl mx-auto px-5 sm:px-10 py-10 bg-gray-50/30 min-h-full pb-48 scroll-smooth print:bg-white print:p-0 print:m-0 print:pb-0">
          <div className="w-full h-full">
            
            {/* 타이틀 & 버튼 */}
            <div className="relative pb-6 border-b-2 border-gray-200 mb-10 print:border-transparent print:mb-6 print:pb-2">
              <h1 className="font-extrabold text-center tracking-tight text-3xl sm:text-4xl text-gray-900 print:text-3xl print:text-left print:border-b-4 print:border-gray-800 print:pb-4">
                물리치료 환자 평가지
              </h1>
              
              <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-2 hidden sm:flex print:hidden">
                <button type="button" onClick={handlePrint} className="flex items-center gap-2 px-6 py-3 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-xl shadow-md hover:shadow-xl transition-all" aria-label="기록 인쇄 및 PDF 저장">
                  🖨️ 인쇄 / PDF 저장
                </button>
              </div>
            </div>

            <div className="mb-8 flex justify-between items-center text-sm font-medium print:hidden">
              {currentNoteId ? (
                <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-full shadow-sm ml-auto">
                  기존 노트 수정 중: <span className="font-bold">{patientName || "(이름 없음)"}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-50 text-green-800 border border-green-200 rounded-full shadow-sm ml-auto">
                  ✨ 새 노트 작성
                </span>
              )}
            </div>

            <div className="text-gray-800 space-y-10 sm:space-y-12 print:space-y-6">
              <PatientInfoSection isGeneratingPdf={false} />
              <ComplaintSection isGeneratingPdf={false} />
              <BodyDiagramSection isGeneratingPdf={false} />
              <RomSection isGeneratingPdf={false} />
              <ClinicalSections isGeneratingPdf={false} />
            </div>

            {/* 서명 & 날짜 하단 배치 */}
            <div className="pt-8 pb-10 mt-12 flex flex-col items-end gap-6 bg-white p-8 rounded-3xl shadow-sm border border-gray-200 print:border-none print:shadow-none print:p-0 print:mt-10 print:break-inside-avoid">
              <div className="flex flex-col items-end gap-3 min-w-[280px] w-full sm:w-auto">
                <div className="w-full flex justify-between items-center px-1">
                  <span className="font-bold text-lg text-gray-700 print:text-base">담당 치료사:</span>
                  {displayTherapist ? (
                    <span className="font-extrabold text-xl text-gray-900 print:text-lg">
                      {displayTherapist.name} <span className="font-mono text-gray-500 tracking-tight text-sm">({displayTherapist.id})</span>
                    </span>
                  ) : (
                    <span className="text-sm text-gray-400 italic">기록 없음</span>
                  )}
                </div>
                
                <div className="w-full mt-2">
                  <div className="w-full flex items-center justify-center italic h-16 border-b-2 border-gray-400 bg-gray-50 rounded-2xl text-gray-500 text-lg shadow-inner print:border-b-2 print:border-gray-800 print:shadow-none print:bg-transparent print:rounded-none">
                    {displayTherapist ? `${displayTherapist.name} (전자서명)` : "(서명)"}
                  </div>
                </div>
                
                <div className="w-full flex justify-between items-center px-1 mt-4">
                  <label className="font-bold text-lg text-gray-700 print:text-base">작성 일자:</label>
                  <input type="date" className="p-2.5 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-gray-900/30 focus:border-gray-900 font-bold text-lg text-gray-800 bg-gray-50 shadow-sm print:border-none print:shadow-none print:bg-transparent print:p-0 text-right w-40"
                    {...methods.register("noteDate")} />
                </div>
              </div>
            </div>
            
          </div>
        </div>

        {/* ── 고정 저장 & 모바일 PDF 버튼 ── */}
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:bottom-8 sm:right-8 z-50 flex items-center justify-end gap-3 print:hidden">
          <button type="button" onClick={handlePrint} className="flex-1 sm:hidden flex items-center justify-center gap-2 px-5 py-4 bg-gray-800 hover:bg-gray-900 active:bg-black text-white font-bold text-lg rounded-2xl shadow-lg transition-all focus:outline-none focus:ring-4 focus:ring-gray-300">
            📄 PDF
          </button>
          <button type="submit" disabled={isSaving} className="flex-[2] sm:flex-none flex items-center justify-center gap-2 sm:gap-3 px-6 sm:px-8 py-4 bg-gray-900 hover:bg-gray-800 active:bg-black disabled:bg-gray-400 text-white font-extrabold text-lg sm:text-xl rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-gray-900/50 transform sm:hover:-translate-y-2 select-none">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 sm:h-7 sm:w-7" viewBox="0 0 20 20" fill="currentColor">
              <path d="M17 3H5a2 2 0 00-2 2v10a2 2 0 002 2h10l4-4V5a2 2 0 00-2-2zm-5 12H7v-4h5v4zm4-6H4V5h12v4z" />
            </svg>
            {isSaving ? "저장 중..." : currentNoteId ? "수정 저장" : "새 노트 저장"}
          </button>
        </div>

        {/* ── 검증 에러 토스트 ── */}
        <div className={`fixed bottom-[6.5rem] right-8 z-[100] flex items-center gap-3 px-6 py-4 bg-red-600 text-white font-bold text-lg rounded-2xl shadow-2xl transition-all duration-500 ease-out pointer-events-none transform print:hidden ${validationErrors.length > 0 ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-10 scale-95"}`}>
          <div className="bg-white/20 rounded-full p-1 border border-white/30">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          필수 항목을 입력해주세요: {validationErrors.join(", ")}
        </div>

        {/* ── 저장 성공 토스트 ── */}
        <div className={`fixed bottom-[6.5rem] right-8 z-[100] flex items-center gap-3 px-6 py-4 bg-green-600 text-white font-bold text-lg rounded-2xl shadow-2xl transition-all duration-500 ease-out pointer-events-none transform print:hidden ${showSaved ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-10 scale-95"}`}>
          <div className="bg-white/20 rounded-full p-1 border border-white/30">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
          노트가 성공적으로 저장되었습니다.
        </div>
      </form>
    </FormProvider>
  );
}
