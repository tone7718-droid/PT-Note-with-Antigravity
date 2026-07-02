"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useForm, FormProvider, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNoteStore } from "@/store/useNoteStore";
import { useAuthStore } from "@/store/useAuthStore";
import { EMPTY_NOTE, type NoteData, type Therapist, NoteDataSchema } from "@/types";

import { PatientInfoSection } from "./features/note-form/PatientInfoSection";
import { ComplaintSection } from "./features/note-form/ComplaintSection";
import { BodyDiagramSection } from "./features/note-form/BodyDiagramSection";
import { RomSection } from "./features/note-form/RomSection";
import { ClinicalSections } from "./features/note-form/ClinicalSections";
import MacroSettingsModal from "./MacroSettingsModal";
import { useMacroStore } from "@/store/useMacroStore";

const emptyRomRow = () => ({ joint: "", measuredROM: "", normalRange: "" });
const todayStr = () => new Date().toISOString().split("T")[0];

export default function ProgressNoteForm() {
  const selectedNoteId = useNoteStore((s) => s.selectedNoteId);
  const notes = useNoteStore((s) => s.notes);
  const saveNote = useNoteStore((s) => s.saveNote);
  const selectNote = useNoteStore((s) => s.selectNote);
  const therapist = useAuthStore((s) => s.therapist);
  const loadMacros = useMacroStore((s) => s.loadMacros);

  const methods = useForm<NoteData>({
    defaultValues: EMPTY_NOTE,
    resolver: zodResolver(NoteDataSchema),
  });

  const { handleSubmit, reset, watch, getValues } = methods;

  const [showSaved, setShowSaved] = useState(false);
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
  const [savedTherapist, setSavedTherapist] = useState<Therapist | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [lastAutoSaved, setLastAutoSaved] = useState<Date | null>(null);
  const [showMacroModal, setShowMacroModal] = useState(false);
  const [isDuplicated, setIsDuplicated] = useState(false);

  // 노트 복사 감지
  const pendingDuplicate = useNoteStore((s) => s.pendingDuplicate);
  const clearPendingDuplicate = useNoteStore((s) => s.clearPendingDuplicate);

  // 저장 경합/중복 저장 방지용 ref
  // - currentNoteIdRef: setState 반영 전에도 최신 노트 id를 참조 (자동/수동 저장 경합 시 중복 생성 방지)
  // - lastSavedSnapshotRef: 마지막으로 저장된 폼 스냅샷 — 값이 안 바뀌면 자동 저장을 걸지 않음
  // - pendingSaveRef: 진행 중인 저장 Promise — 수동 저장이 자동 저장을 기다리도록 직렬화
  const currentNoteIdRef = useRef<string | null>(null);
  const lastSavedSnapshotRef = useRef<string | null>(null);
  const pendingSaveRef = useRef<Promise<NoteData> | null>(null);

  // 매크로 스토어 초기화
  useEffect(() => {
    loadMacros();
  }, [loadMacros]);

  // 현재 값 구독 (하단 서명 및 토스트, 자동 저장용)
  // watch()는 렌더마다 새 객체를 반환하므로 effect 의존성으로는 직렬화한 스냅샷을 사용
  const formData = watch();
  const patientName = formData.patientName;
  const formSnapshot = JSON.stringify(formData);

  const runSave = useCallback(
    async (data: NoteData, snapshot: string): Promise<NoteData> => {
      const payload = {
        ...data,
        noteDate: data.noteDate || todayStr(),
        rom: data.rom?.filter((r) => r.joint.trim() !== "") || [],
        therapist: therapist || savedTherapist,
        therapistUid: therapist?.uid || savedTherapist?.uid || "",
      };

      const savePromise = (async () => {
        // 진행 중인 저장이 있으면 완료를 기다려 같은 노트가 두 번 생성되지 않게 함
        if (pendingSaveRef.current) {
          await pendingSaveRef.current.catch(() => {});
        }
        return saveNote(payload, currentNoteIdRef.current);
      })();

      pendingSaveRef.current = savePromise;
      try {
        const saved = await savePromise;
        lastSavedSnapshotRef.current = snapshot;
        if (saved.id) {
          currentNoteIdRef.current = saved.id;
          setCurrentNoteId(saved.id);
          selectNote(saved.id); // 사이드바 하이라이트 동기화
        }
        setSavedTherapist(saved.therapist ?? null);
        return saved;
      } finally {
        if (pendingSaveRef.current === savePromise) {
          pendingSaveRef.current = null;
        }
      }
    },
    [therapist, savedTherapist, saveNote, selectNote]
  );

  // 자동 임시 저장 (Auto-save: 5초 디바운스)
  // 마지막 저장 스냅샷과 같으면 타이머를 걸지 않으므로, 저장이 유발한 리렌더로
  // 저장이 무한 반복되지 않는다.
  useEffect(() => {
    if (formSnapshot === lastSavedSnapshotRef.current) return;

    const data = JSON.parse(formSnapshot) as NoteData;
    if (!data.patientName || !data.diagnosis) return; // 필수 항목이 없으면 자동 저장 안 함

    const timer = setTimeout(() => {
      runSave(data, formSnapshot)
        .then(() => setLastAutoSaved(new Date()))
        .catch(console.error);
    }, 5000);

    return () => clearTimeout(timer);
  }, [formSnapshot, runSave]);

  // selectedNoteId 변경 시 폼 데이터 로드 또는 리셋
  // notes 갱신(저장 완료 등)만으로는 reset하지 않아 입력 중인 내용이 날아가지 않는다.
  const prevSelectedRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const selectionChanged = prevSelectedRef.current !== selectedNoteId;
    if (!selectionChanged && !pendingDuplicate) return;
    prevSelectedRef.current = selectedNoteId;

    if (selectedNoteId === null) {
      // pendingDuplicate가 있으면 복사된 데이터로 리셋
      if (pendingDuplicate) {
        const roms = pendingDuplicate.rom && pendingDuplicate.rom.length > 0
          ? pendingDuplicate.rom
          : [emptyRomRow()];
        reset({ ...pendingDuplicate, rom: roms } as NoteData);
        currentNoteIdRef.current = null;
        lastSavedSnapshotRef.current = null;
        setCurrentNoteId(null);
        setSavedTherapist(null);
        setIsDuplicated(true);
        clearPendingDuplicate();
        return;
      }
      reset({ ...EMPTY_NOTE, noteDate: todayStr(), rom: [emptyRomRow()] });
      currentNoteIdRef.current = null;
      lastSavedSnapshotRef.current = null;
      setCurrentNoteId(null);
      setSavedTherapist(null);
      setIsDuplicated(false);
      return;
    }

    // 자동 저장으로 id가 부여된 자기 자신의 저장 라운드트립이면 폼을 다시 로드하지 않음
    if (selectedNoteId === currentNoteIdRef.current) return;

    const note = notes.find((n) => n.id === selectedNoteId);
    if (note) {
      const roms = note.rom && note.rom.length > 0 ? note.rom : [emptyRomRow()];
      const values = { ...note, rom: roms };
      reset(values);
      currentNoteIdRef.current = note.id ?? null;
      lastSavedSnapshotRef.current = JSON.stringify(values);
      setCurrentNoteId(note.id ?? null);
      setSavedTherapist(note.therapist ?? null);
      setIsDuplicated(false);
    }
  }, [selectedNoteId, notes, reset, pendingDuplicate, clearPendingDuplicate]);

  // 저장 로직
  const onSaveSubmit = async (data: NoteData) => {
    setValidationErrors([]);
    setIsSaving(true);
    try {
      const snapshot = JSON.stringify(getValues());
      await runSave(data, snapshot);
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 3000);
    } catch (err) {
      console.error("저장 실패:", err);
      alert("저장에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setIsSaving(false);
    }
  };

  const onInvalid = (errors: FieldErrors<NoteData>) => {
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
        <div className="max-w-5xl mx-auto px-3 sm:px-10 py-6 sm:py-10 bg-gray-50/30 dark:bg-gray-900 min-h-full pb-48 scroll-smooth print:bg-white print:p-0 print:m-0 print:pb-0">
          <div className="w-full h-full">

            {/* 타이틀 & 버튼 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b-2 border-gray-200 dark:border-gray-800 mb-10 gap-4 print:border-transparent print:mb-6 print:pb-2">
              <h1 className="font-extrabold text-center sm:text-left tracking-tight text-3xl sm:text-4xl text-gray-900 dark:text-white print:text-3xl print:text-left print:border-b-4 print:border-gray-800 print:pb-4">
                물리치료 환자 평가지
              </h1>

              <div className="flex items-center gap-2 justify-center sm:justify-end hidden sm:flex print:hidden">
                <button type="button" onClick={() => setShowMacroModal(true)} className="flex items-center gap-2 px-5 py-3 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-amber-800 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50 font-bold rounded-xl shadow-sm hover:shadow-md transition-all" aria-label="매크로 문구 등록">
                  ⚡ 매크로 등록
                </button>
                <button type="button" onClick={handlePrint} className="flex items-center gap-2 px-6 py-3 bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 text-white dark:text-gray-900 font-bold rounded-xl shadow-md hover:shadow-xl transition-all" aria-label="기록 인쇄 및 PDF 저장">
                  🖨️ 인쇄 / PDF 저장
                </button>
              </div>
            </div>

            <div className="mb-8 flex justify-between items-center text-sm font-medium print:hidden">
              {currentNoteId ? (
                <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50 rounded-full shadow-sm ml-auto">
                  기존 노트 수정 중: <span className="font-bold">{patientName || "(이름 없음)"}</span>
                </span>
              ) : isDuplicated ? (
                <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-50 dark:bg-purple-900/20 text-purple-800 dark:text-purple-400 border border-purple-200 dark:border-purple-900/50 rounded-full shadow-sm ml-auto">
                  📋 노트 복사됨 — 새 노트로 저장됩니다
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-400 border border-green-200 dark:border-green-900/50 rounded-full shadow-sm ml-auto">
                  ✨ 새 노트 작성
                </span>
              )}
              {lastAutoSaved && (
                <span className="ml-4 text-xs text-gray-400">
                  마지막 임시 저장: {lastAutoSaved.toLocaleTimeString()}
                </span>
              )}
            </div>

            <div className="text-gray-800 dark:text-gray-200 space-y-6 sm:space-y-10 md:space-y-12 print:space-y-6">
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
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:bottom-8 sm:right-8 z-50 flex items-center justify-end gap-2 print:hidden">
          <button type="button" onClick={() => setShowMacroModal(true)} className="sm:hidden flex items-center justify-center px-4 py-4 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-bold text-base rounded-2xl shadow-lg transition-all focus:outline-none focus:ring-4 focus:ring-amber-300">
            ⚡
          </button>
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

      {/* 매크로 설정 모달 */}
      {showMacroModal && (
        <MacroSettingsModal onClose={() => setShowMacroModal(false)} />
      )}
    </FormProvider>
  );
}
