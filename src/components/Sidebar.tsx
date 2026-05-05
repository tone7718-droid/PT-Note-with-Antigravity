"use client";

import { useState, useRef } from "react";
import { useNoteStore } from "@/store/useNoteStore";
import { useAuthStore } from "@/store/useAuthStore";
import { Menu, Search, User, LogOut, Plus, Trash2, UserPlus, LogIn, ChevronDown, ChevronRight, ArrowRightLeft, Shield, Download, Upload, Copy, Filter, Calendar, ListFilter, SortAsc, SortDesc } from "lucide-react";
import LoginModal from "./LoginModal";
import TherapistManagementModal from "./TherapistManagementModal";
import PatientTrendChart from "./PatientTrendChart";

export default function Sidebar() {
  const notes = useNoteStore((s) => s.notes);
  const selectedNoteId = useNoteStore((s) => s.selectedNoteId);
  const selectNote = useNoteStore((s) => s.selectNote);
  const createNewNote = useNoteStore((s) => s.createNewNote);
  const duplicateNote = useNoteStore((s) => s.duplicateNote);
  const deleteNotes = useNoteStore((s) => s.deleteNotes);
  const transferNotes = useNoteStore((s) => s.transferNotes);
  const exportData = useNoteStore((s) => s.exportData);
  const importData = useNoteStore((s) => s.importData);
  
  const therapist = useAuthStore((s) => s.therapist);
  const therapists = useAuthStore((s) => s.therapists);
  const signOut = useAuthStore((s) => s.signOut);
  const reauthenticate = useAuthStore((s) => s.reauthenticate);

  const getResignedTherapistNotes = () => {
    const resigned = therapists.filter((t) => t.resigned);
    return resigned
      .map((rt) => ({
        therapistName: rt.name,
        therapistUid: rt.uid,
        notes: notes.filter((n) => n.therapistUid === rt.uid),
      }))
      .filter((g) => g.notes.length > 0);
  };
  const [search, setSearch] = useState("");
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showTherapistModal, setShowTherapistModal] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showResignedFolder, setShowResignedFolder] = useState(false);

  /* ── 필터 및 정렬 ── */
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [filterTherapist, setFilterTherapist] = useState<string>("all");
  const [filterStartDate, setFilterStartDate] = useState<string>("");
  const [filterEndDate, setFilterEndDate] = useState<string>("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "patientName">("newest");
  const [trendChartData, setTrendChartData] = useState<{ patientName: string; chartNo: string } | null>(null);

  /* ── 삭제 2단계 비밀번호 확인 ── */
  const [showPwConfirm, setShowPwConfirm] = useState(false);
  const [deletePw, setDeletePw] = useState("");
  const [deletePwError, setDeletePwError] = useState("");

  /* ── 이관 ── */
  const [transferSource, setTransferSource] = useState<{ therapistUid: string; therapistName: string } | null>(null);

  /* ── 데이터 내보내기/가져오기 ── */
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportData = async () => {
    try {
      const json = await exportData();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pt-progress-notes-backup-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("데이터 내보내기에 실패했습니다.");
    }
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const result = await importData(ev.target?.result as string);
        alert(`가져오기 완료: 노트 ${result.notesCount}건 추가됨`);
      } catch {
        alert("데이터 가져오기 실패: 올바른 JSON 파일인지 확인해주세요.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleLogout = async () => {
    try {
      await signOut();
    } catch {
      alert("로그아웃에 실패했습니다.");
    }
  };

  const isMaster = therapist?.role === "master";

  /* 현재 로그인된 치료사의 노트만 표시 (master는 전체, 단 퇴사자 노트는 폴더에서만) */
  const visibleNotes = notes.filter((n) => {
    if (isMaster) {
      const isResigned = therapists.some((t) => t.resigned && t.uid === n.therapistUid);
      return !isResigned;
    }
    if (therapist) return n.therapistUid === therapist.uid || !n.therapistUid;
    return true;
  });

  const filteredNotes = visibleNotes
    .filter((n) => {
      // 검색어 필터
      const matchesSearch = n.patientName.includes(search) ||
        n.diagnosis.includes(search) ||
        n.chartNo.includes(search);
      
      // 치료사 필터 (Master 전용)
      const matchesTherapist = filterTherapist === "all" || n.therapistUid === filterTherapist;
      
      // 날짜 필터
      const noteDate = new Date(n.noteDate || n.savedAt || 0).getTime();
      const matchesStartDate = !filterStartDate || noteDate >= new Date(filterStartDate).getTime();
      const matchesEndDate = !filterEndDate || noteDate <= new Date(filterEndDate).getTime() + 86400000; // include full day
      
      return matchesSearch && matchesTherapist && matchesStartDate && matchesEndDate;
    })
    .sort((a, b) => {
      if (sortBy === "newest") return new Date(b.savedAt || 0).getTime() - new Date(a.savedAt || 0).getTime();
      if (sortBy === "oldest") return new Date(a.savedAt || 0).getTime() - new Date(b.savedAt || 0).getTime();
      if (sortBy === "patientName") return (a.patientName || "").localeCompare(b.patientName || "");
      return 0;
    });

  const resignedGroups = getResignedTherapistNotes();
  const activeTherapists = therapists.filter((t) => !t.resigned && t.role !== "master");

  const handleDeleteStep1Confirm = () => {
    setShowDeleteModal(false);
    setShowPwConfirm(true);
    setDeletePw("");
    setDeletePwError("");
  };

  const handleDeleteStep2Confirm = async () => {
    if (!therapist || !therapist.id) {
      setDeletePwError("로그인 정보를 확인할 수 없습니다.");
      return;
    }
    setDeletePwError("");
    try {
      // 1) 비밀번호 재확인 (10초 타임아웃)
      const ok = await Promise.race<boolean>([
        reauthenticate(therapist.id, deletePw),
        new Promise<boolean>((_, rej) =>
          setTimeout(() => rej(new Error("비밀번호 확인 시간 초과")), 10000)
        ),
      ]);
      if (!ok) {
        setDeletePwError("비밀번호가 일치하지 않습니다.");
        return;
      }

      // 2) 실제 삭제 (15초 타임아웃)
      await Promise.race<void>([
        deleteNotes(selectedIds),
        new Promise<void>((_, rej) =>
          setTimeout(() => rej(new Error("삭제 요청 시간 초과")), 15000)
        ),
      ]);

      // 3) 모달/상태 정리
      setIsDeleteMode(false);
      setSelectedIds([]);
      setShowPwConfirm(false);
      setDeletePw("");
      alert("선택한 기록이 삭제되었습니다.");
    } catch (err) {
      console.error("[delete] failed:", err);
      setDeletePwError(
        (err as Error)?.message ?? "삭제 처리 중 오류가 발생했습니다."
      );
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-gray-900 relative">
      <div className="flex items-center gap-3 p-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <div className="relative flex-shrink-0">
          <button onClick={() => setShowDropdown(!showDropdown)} className="p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition-colors" aria-label="메뉴 열기" title="메뉴 열기"><Menu size={24} /></button>
          {showDropdown && (
            <>
              <div className="fixed inset-0 z-[50]" onClick={() => setShowDropdown(false)} />
              <div className="absolute left-0 top-full mt-2 w-56 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 py-2 z-[60] animate-in fade-in slide-in-from-top-2 duration-150">
                <button onClick={() => { setShowLoginModal(true); setShowDropdown(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors"><LogIn size={18} /> 로그인</button>
                <button onClick={() => { setShowTherapistModal(true); setShowDropdown(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-green-50 dark:hover:bg-green-900/30 hover:text-green-700 dark:hover:text-green-400 transition-colors"><UserPlus size={18} /> 치료사 등록 / 관리</button>
                <hr className="my-1 border-gray-100 dark:border-gray-700" />
                <button onClick={() => { handleExportData(); setShowDropdown(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-purple-50 dark:hover:bg-purple-900/30 hover:text-purple-700 dark:hover:text-purple-400 transition-colors"><Download size={18} /> 데이터 내보내기</button>
                <button onClick={() => { fileInputRef.current?.click(); setShowDropdown(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-orange-50 dark:hover:bg-orange-900/30 hover:text-orange-700 dark:hover:text-orange-400 transition-colors"><Upload size={18} /> 데이터 가져오기</button>
              </div>
            </>
          )}
        </div>
        <div className="flex-1 relative">
          <input id="sidebar-search" type="text" placeholder="환자 이름 · 진단명 검색..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-4 pr-11 py-3 bg-gray-50 border-2 border-gray-100 dark:border-gray-800 dark:bg-gray-900 rounded-xl text-sm font-medium outline-none dark:text-white" aria-label="기록 검색" />
          <button className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-900 dark:hover:text-white" aria-label="검색 실행"><Search size={18} /></button>
        </div>
        <button 
          onClick={() => setShowFilterPanel(!showFilterPanel)}
          className={`p-2.5 rounded-xl transition-colors shrink-0 ${showFilterPanel ? "bg-gray-900 text-white shadow-md" : "hover:bg-gray-100 text-gray-500"}`}
          aria-label="필터 및 정렬"
        >
          <Filter size={20} />
        </button>
      </div>

      {/* 필터 패널 */}
      {showFilterPanel && (
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700 animate-in slide-in-from-top-2 duration-200">
          <div className="space-y-3">
            {/* 치료사 필터 (Master 전용) */}
            {isMaster && (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1">치료사 필터</label>
                <select 
                  value={filterTherapist} 
                  onChange={(e) => setFilterTherapist(e.target.value)}
                  className="w-full p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-bold outline-none"
                >
                  <option value="all">전체 치료사</option>
                  {activeTherapists.map(t => (
                    <option key={t.uid} value={t.uid}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* 날짜 범위 */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1">날짜 범위</label>
              <div className="flex items-center gap-2">
                <input 
                  type="date" 
                  value={filterStartDate} 
                  onChange={(e) => setFilterStartDate(e.target.value)}
                  className="flex-1 p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-[10px] font-bold outline-none"
                />
                <span className="text-gray-400">~</span>
                <input 
                  type="date" 
                  value={filterEndDate} 
                  onChange={(e) => setFilterEndDate(e.target.value)}
                  className="flex-1 p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-[10px] font-bold outline-none"
                />
              </div>
            </div>

            {/* 정렬 방식 */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1">정렬 기준</label>
              <div className="flex gap-2">
                <button 
                  onClick={() => setSortBy("newest")}
                  className={`flex-1 py-2 rounded-lg text-[10px] font-bold border transition-all ${sortBy === "newest" ? "bg-gray-900 text-white border-gray-900" : "bg-white dark:bg-gray-900 text-gray-500 border-gray-200 dark:border-gray-700"}`}
                >
                  최신순
                </button>
                <button 
                  onClick={() => setSortBy("oldest")}
                  className={`flex-1 py-2 rounded-lg text-[10px] font-bold border transition-all ${sortBy === "oldest" ? "bg-gray-900 text-white border-gray-900" : "bg-white dark:bg-gray-900 text-gray-500 border-gray-200 dark:border-gray-700"}`}
                >
                  과거순
                </button>
                <button 
                  onClick={() => setSortBy("patientName")}
                  className={`flex-1 py-2 rounded-lg text-[10px] font-bold border transition-all ${sortBy === "patientName" ? "bg-gray-900 text-white border-gray-900" : "bg-white dark:bg-gray-900 text-gray-500 border-gray-200 dark:border-gray-700"}`}
                >
                  가나다순
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {therapist && (
        <div className="px-4 pt-4 shrink-0">
          <div className="flex items-center justify-between gap-2 text-[15px] font-bold text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm w-full">
            <div className="flex items-center gap-3">
              <div className={`${isMaster ? "bg-amber-500" : "bg-gray-800 dark:bg-gray-700"} text-white p-1.5 rounded-full`}><Shield size={16} /></div>
              <span className="truncate">{therapist.name} {therapist.id && <span className="text-gray-400 dark:text-gray-500 font-mono text-xs">({therapist.id})</span>}</span>
            </div>
            <button onClick={handleLogout} className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 font-bold bg-white dark:bg-gray-900 px-2.5 py-1.5 rounded-lg border border-red-100 dark:border-red-900/50 shadow-sm transition-colors">로그아웃</button>
          </div>
        </div>
      )}

      <div className="p-4 shrink-0 pb-2">
        <button type="button" onClick={createNewNote} className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-gray-900 dark:bg-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 text-white font-bold text-base rounded-2xl shadow-lg transition-all transform hover:-translate-y-0.5"><Plus size={20} /> 새 노트 작성</button>
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-50/50 dark:bg-gray-900/50">
        <div className="px-4 pt-2 pb-1 flex justify-between items-center">
          <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">최신 치료 내역</h3>
          {filteredNotes.length > 0 && (
            <div className="flex items-center gap-1">
              {isDeleteMode && (
                <button onClick={() => { setIsDeleteMode(false); setSelectedIds([]); }} className="px-2 py-1 text-xs font-bold text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">취소</button>
              )}
              <button onClick={() => { 
                if (isDeleteMode && selectedIds.length > 0) {
                  setShowDeleteModal(true);
                } else {
                  setIsDeleteMode(!isDeleteMode); 
                  setSelectedIds([]); 
                }
              }} className={`p-1.5 rounded-md transition-colors ${isDeleteMode ? "text-red-600 bg-red-50 dark:bg-red-900/30" : "text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800"}`} aria-label="삭제 모드 전환" title="삭제 모드 전환"><Trash2 size={16} /></button>
            </div>
          )}
        </div>

        {filteredNotes.length === 0 ? (
          <div className="p-8 text-center flex flex-col items-center h-32 opacity-40 justify-center text-sm font-medium">기록이 없습니다.</div>
        ) : (
          <ul className="p-3 space-y-2.5">
            {filteredNotes.map((note) => (
              <li key={note.id} onClick={() => { if (note.id) { if (isDeleteMode) setSelectedIds(prev => prev.includes(note.id!) ? prev.filter(i => i !== note.id) : [...prev, note.id!]); else selectNote(note.id); } }}
                className={`group p-4 rounded-2xl cursor-pointer transition-all border-2 flex items-center gap-3 ${selectedNoteId === note.id && !isDeleteMode ? "bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600" : "bg-white dark:bg-gray-800 border-transparent shadow-sm"} ${isDeleteMode && note.id && selectedIds.includes(note.id) ? "border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20" : ""}`}>
                {isDeleteMode && <input type="checkbox" checked={!!note.id && selectedIds.includes(note.id)} readOnly className="w-5 h-5 rounded border-gray-300 dark:border-gray-600 text-red-600" aria-label={`${note.patientName} 기록 선택`} />}
                <span className={`font-bold text-[15px] truncate block flex-1 text-left ${selectedNoteId === note.id && !isDeleteMode ? "text-gray-900 dark:text-white" : isDeleteMode && note.id && selectedIds.includes(note.id) ? "text-red-800 dark:text-red-400" : "text-gray-900 dark:text-gray-100"}`}>
                  {note.patientName || "(이름 없음)"} - {formatDate(note.savedAt || "")}
                </span>
                {!isDeleteMode && note.id && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); setTrendChartData({ patientName: note.patientName, chartNo: note.chartNo }); }}
                      className="shrink-0 p-1.5 rounded-lg text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                      aria-label={`${note.patientName} 추이 보기`}
                      title="이 환자의 치료 추이 그래프 보기"
                    >
                      <TrendingUp size={15} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); duplicateNote(note.id!); }}
                      className="shrink-0 p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                      aria-label={`${note.patientName} 노트 복사`}
                      title="이 노트를 복사하여 새 노트 작성"
                    >
                      <Copy size={15} />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {isMaster && resignedGroups.length > 0 && (
          <div className="px-3 pb-3 mt-2">
            <button onClick={() => setShowResignedFolder(!showResignedFolder)} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-400 font-bold text-sm">
              {showResignedFolder ? <ChevronDown size={16} /> : <ChevronRight size={16} />} 퇴사한 치료사 기록 <span className="ml-auto text-xs bg-amber-200 dark:bg-amber-900/40 px-2 py-0.5 rounded-full">{resignedGroups.reduce((s, g) => s + g.notes.length, 0)}</span>
            </button>
            {showResignedFolder && (
              <div className="mt-2 space-y-3">
                {resignedGroups.map((group) => (
                  <div key={group.therapistUid} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
                    <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-50 dark:border-gray-700">
                      <span className="text-sm font-bold text-gray-700 dark:text-gray-300">{group.therapistName} (퇴사)</span>
                      <button onClick={() => setTransferSource({ therapistUid: group.therapistUid, therapistName: group.therapistName })} className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors border border-gray-200 dark:border-gray-600"><ArrowRightLeft size={12} /> 이관</button>
                    </div>
                    <ul className="space-y-1">
                      {group.notes.map((note) => (
                        <li key={note.id} onClick={() => selectNote(note.id ?? null)} className={`p-2.5 rounded-lg cursor-pointer text-sm font-medium transition-colors ${selectedNoteId === note.id ? "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white" : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50"}`}>
                          {note.patientName || "(이름 없음)"} - {formatDate(note.savedAt || "")}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="p-4 bg-gray-50 dark:bg-gray-900 shrink-0 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between min-h-[56px]">
        <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">총 {notes.length}건</span>
      </div>

      {showLoginModal && <LoginModal onClose={() => setShowLoginModal(false)} />}
      {showTherapistModal && <TherapistManagementModal onClose={() => setShowTherapistModal(false)} />}
      {trendChartData && (
        <PatientTrendChart 
          patientName={trendChartData.patientName} 
          chartNo={trendChartData.chartNo} 
          onClose={() => setTrendChartData(null)} 
        />
      )}
      <input ref={fileInputRef} type="file" accept=".json" onChange={handleImportData} className="hidden" />

      {/* ── 삭제 확인 모달 (1단계) ── */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 print:hidden">
          <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">기록 삭제 경고</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-8 font-medium leading-relaxed">선택한 <span className="font-bold text-red-600 dark:text-red-400">{selectedIds.length}건</span>의 기록을<br />정말로 삭제하시겠습니까?</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteModal(false)} className="flex-1 py-3.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-bold rounded-xl transition-colors">아니오</button>
              <button onClick={handleDeleteStep1Confirm} className="flex-1 py-3.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg transition-colors">예 (삭제)</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 삭제 2단계: 비밀번호 확인 ── */}
      {showPwConfirm && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 print:hidden">
          <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2 text-center text-balance">본인 확인 비밀번호</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6 font-medium text-sm text-center">삭제를 완료하려면 치료사의<br />비밀번호를 다시 입력해주세요.</p>
            <label htmlFor="confirm-delete-pw" className="sr-only">비밀번호 입력</label>
            <input id="confirm-delete-pw" type="password" value={deletePw} onChange={(e) => { setDeletePw(e.target.value); setDeletePwError(""); }} placeholder="비밀번호 입력"
              className="w-full p-4 border-2 border-gray-200 dark:border-gray-700 rounded-2xl focus:border-gray-900 dark:focus:border-white focus:ring-4 focus:ring-gray-900/10 dark:focus:ring-white/5 text-center font-bold tracking-widest outline-none mb-3 bg-white dark:bg-gray-900 dark:text-white" autoFocus />
            {deletePwError && <p className="text-red-500 dark:text-red-400 text-sm font-bold text-center mb-3">{deletePwError}</p>}
            <div className="flex gap-3">
              <button onClick={() => { setShowPwConfirm(false); setDeletePw(""); }} className="flex-1 py-3.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-bold rounded-xl transition-colors">취소</button>
              <button onClick={handleDeleteStep2Confirm} className="flex-1 py-3.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg transition-colors">삭제 확인</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 이관 모달 ── */}
      {transferSource && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">기록 이관</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6 text-sm">퇴사한 {transferSource.therapistName}의 모든 기록을<br />아래 치료사 중 한 명에게 이관합니다.</p>
            <ul className="space-y-2 max-h-48 overflow-y-auto mb-6">
              {activeTherapists.map((t) => (
                <li key={t.uid}>
                  <button onClick={async () => {
                    try {
                      await transferNotes(transferSource.therapistUid, t.uid, t.name, t.id);
                      setTransferSource(null);
                      alert(`${t.name} 치료사에게 이관되었습니다.`);
                    } catch {
                      alert("이관 처리 중 오류가 발생했습니다.");
                    }
                  }}
                    className="w-full flex items-center justify-between p-3.5 bg-gray-50 dark:bg-gray-900 rounded-xl border-2 border-gray-100 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all font-bold text-left dark:text-gray-200">
                    <span>{t.name} <span className="text-gray-400 dark:text-gray-500 font-mono text-xs">({t.id})</span></span>
                    <ArrowRightLeft size={14} className="text-gray-500" />
                  </button>
                </li>
              ))}
            </ul>
            <button onClick={() => setTransferSource(null)} className="w-full py-3.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-bold rounded-xl transition-colors">취소</button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDate(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  } catch { return isoStr; }
}
