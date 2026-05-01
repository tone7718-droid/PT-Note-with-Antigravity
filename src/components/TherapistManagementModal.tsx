"use client";

import { useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import type { TherapistRecord } from "@/types";
import { X, UserPlus, Users, Trash2, AlertCircle, ShieldCheck } from "lucide-react";

interface TherapistManagementModalProps {
  onClose: () => void;
}

export default function TherapistManagementModal({ onClose }: TherapistManagementModalProps) {
  const therapists = useAuthStore((s) => s.therapists);
  const registerTherapist = useAuthStore((s) => s.registerTherapist);
  const resignTherapist = useAuthStore((s) => s.resignTherapist);
  const deleteTherapist = useAuthStore((s) => s.deleteTherapist);
  const currentTherapist = useAuthStore((s) => s.therapist);
  const [activeTab, setActiveTab] = useState<"register" | "list">("register");

  /* 등록 폼 */
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [registerError, setRegisterError] = useState("");
  const [registerSuccess, setRegisterSuccess] = useState("");
  const [registering, setRegistering] = useState(false);

  /* 퇴사 처리 */
  const [resigningTherapist, setResigningTherapist] = useState<TherapistRecord | null>(null);
  const [resignError, setResignError] = useState("");
  const [resigning, setResigning] = useState(false);

  /* 영구 삭제 처리 */
  const [deletingTherapist, setDeletingTherapist] = useState<TherapistRecord | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const activeTherapists = therapists.filter((t) => !t.resigned && t.role !== "master");
  const resignedTherapists = therapists.filter((t) => t.resigned);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError("");
    setRegisterSuccess("");

    if (!name.trim()) { setRegisterError("이름을 입력해주세요."); return; }
    if (!/^PT-\d{3}$/.test(id)) { setRegisterError("ID 형식이 올바르지 않습니다 (PT-001 ~ PT-999)."); return; }
    if (!/^\d{4,8}$/.test(password)) { setRegisterError("비밀번호는 숫자 4~8자리여야 합니다."); return; }

    setRegistering(true);
    try {
      await registerTherapist(id, name.trim(), password);
      setRegisterSuccess(`${name} (${id}) 등록 완료!`);
      setName(""); setId(""); setPassword("");
    } catch (err: any) {
      setRegisterError(err.message || "등록 중 오류가 발생했습니다.");
    } finally {
      setRegistering(false);
    }
  };

  const handleResign = async () => {
    if (!resigningTherapist) return;
    setResignError("");

    if (currentTherapist?.role !== "master") {
      setResignError("마스터 계정만 퇴사 처리가 가능합니다.");
      return;
    }

    setResigning(true);
    try {
      await resignTherapist(resigningTherapist.uid);
      setResigningTherapist(null);
    } catch (err: any) {
      setResignError(err.message || "퇴사 처리 중 오류가 발생했습니다.");
    } finally {
      setResigning(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingTherapist) return;
    setDeleteError("");

    if (currentTherapist?.role !== "master") {
      setDeleteError("마스터 계정만 삭제 처리가 가능합니다.");
      return;
    }

    setDeleting(true);
    try {
      await deleteTherapist(deletingTherapist.uid);
      setDeletingTherapist(null);
    } catch (err: any) {
      setDeleteError(err.message || "삭제 처리 중 오류가 발생했습니다.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* 헤더 */}
        <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Users className="text-gray-900" size={28} /> 치료사 관리
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors" aria-label="모달 닫기"><X size={24} /></button>
        </div>

        {/* 탭 메뉴 */}
        <div className="flex border-b border-gray-100">
          <button onClick={() => setActiveTab("register")}
            className={`flex-1 py-4 text-sm font-bold transition-all ${activeTab === "register" ? "text-gray-900 border-b-2 border-gray-900 bg-gray-100/50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"}`}>
            신규 등록
          </button>
          <button onClick={() => setActiveTab("list")}
            className={`flex-1 py-4 text-sm font-bold transition-all ${activeTab === "list" ? "text-gray-900 border-b-2 border-gray-900 bg-gray-100/50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"}`}>
            치료사 목록 ({activeTherapists.length})
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          {activeTab === "register" ? (
            <form onSubmit={handleRegister} className="space-y-6 max-w-md mx-auto">
              <div className="space-y-4">
                <div>
                  <label htmlFor="reg-name" className="block text-sm font-bold text-gray-700 mb-1.5">이름</label>
                  <input id="reg-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 홍길동"
                    className="w-full p-4 border-2 border-gray-100 rounded-2xl focus:border-gray-900 focus:ring-4 focus:ring-gray-900/10 transition-all font-medium text-lg outline-none" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="reg-id" className="block text-sm font-bold text-gray-700 mb-1.5">ID (PT-000)</label>
                    <input id="reg-id" type="text" value={id} onChange={(e) => setId(e.target.value.toUpperCase())} placeholder="PT-001"
                      className="w-full p-4 border-2 border-gray-100 rounded-2xl focus:border-gray-900 focus:ring-4 focus:ring-gray-900/10 transition-all font-bold text-lg outline-none" />
                  </div>
                  <div>
                    <label htmlFor="reg-pw" className="block text-sm font-bold text-gray-700 mb-1.5">비밀번호 (숫자)</label>
                    <input id="reg-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value.replace(/\D/g, ""))} placeholder="4~8자리"
                      className="w-full p-4 border-2 border-gray-100 rounded-2xl focus:border-gray-900 focus:ring-4 focus:ring-gray-900/10 transition-all font-bold text-lg outline-none tracking-widest" />
                  </div>
                </div>
              </div>
              {registerError && <p className="text-red-500 text-sm font-bold flex items-center gap-1.5 bg-red-50 p-3 rounded-xl"><AlertCircle size={16} />{registerError}</p>}
              {registerSuccess && <p className="text-green-600 text-sm font-bold flex items-center gap-1.5 bg-green-50 p-3 rounded-xl"><ShieldCheck size={16} />{registerSuccess}</p>}
              <button type="submit" disabled={registering} className="w-full py-4 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white font-bold text-lg rounded-2xl shadow-lg transition-all transform hover:-translate-y-0.5">
                {registering ? "등록 중..." : "등록하기"}
              </button>
            </form>
          ) : (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">재직 중인 치료사</h3>
                {activeTherapists.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-8 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-100">등록된 치료사가 없습니다.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {activeTherapists.map((t) => (
                      <div key={t.uid} className="flex items-center justify-between p-5 bg-white border-2 border-gray-100 rounded-2xl hover:border-gray-300 transition-all">
                        <div>
                          <p className="font-bold text-gray-900 text-lg">{t.name}</p>
                          <p className="text-sm text-gray-400 font-mono font-bold">{t.id}</p>
                        </div>
                        <button onClick={() => setResigningTherapist(t)} className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-red-500 hover:bg-red-50 rounded-xl transition-colors" aria-label={`${t.name} 퇴사 처리`}><Trash2 size={16}/> 퇴사 처리</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {resignedTherapists.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">퇴사한 치료사</h3>
                  <div className="grid grid-cols-1 gap-3 opacity-60">
                    {resignedTherapists.map((t) => (
                      <div key={t.uid} className="flex items-center justify-between p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl group transition-all">
                        <p className="font-bold text-gray-600">{t.name} (퇴사)</p>
                        <div className="flex items-center gap-4">
                          <span className="text-xs font-bold text-gray-400">ID 해제됨</span>
                          <button 
                            onClick={() => setDeletingTherapist(t)}
                            className="text-gray-300 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                            aria-label={`${t.name} 영구 삭제`}
                            title="기록 영구 삭제"
                          >
                            <X size={18} strokeWidth={3} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 퇴사 확인 모달 */}
      {resigningTherapist && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-6 mx-auto">
              <AlertCircle size={32} className="text-red-500" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2 text-center text-balance">퇴사 처리 확인</h3>
            <p className="text-center text-gray-500 mb-6 leading-relaxed">
              <span className="font-bold text-red-500">{resigningTherapist.name} ({resigningTherapist.id})</span>을(를)<br />퇴사 처리하시겠습니까?<br />
              <span className="text-xs text-gray-400 mt-2 block">※ 해당 ID는 즉시 해제되어 재사용 가능해집니다.</span>
            </p>

            {resignError && <p className="text-red-500 text-xs font-bold text-center mb-3">{resignError}</p>}
            <div className="flex gap-3">
              <button onClick={() => { setResigningTherapist(null); setResignError(""); }} className="flex-1 py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-2xl transition-all">취소</button>
              <button onClick={handleResign} disabled={resigning} className="flex-1 py-4 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-bold rounded-2xl transition-all shadow-lg">
                {resigning ? "처리 중..." : "퇴사 처리"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 영구 삭제 확인 모달 */}
      {deletingTherapist && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-6 mx-auto">
              <Trash2 size={32} className="text-red-500" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2 text-center text-balance">목록 영구 삭제</h3>
            <p className="text-center text-gray-500 mb-6 leading-relaxed">
              <span className="font-bold text-red-500">{deletingTherapist.name}</span> 선생님의 계정 기록을<br />완전히 삭제하시겠습니까?<br />
              <span className="text-xs text-gray-400 mt-2 block">※ 이 작업은 되돌릴 수 없습니다.</span>
            </p>

            {deleteError && <p className="text-red-500 text-xs font-bold text-center mb-3">{deleteError}</p>}
            <div className="flex gap-3">
              <button onClick={() => { setDeletingTherapist(null); setDeleteError(""); }} className="flex-1 py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-2xl transition-all">취소</button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 py-4 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-bold rounded-2xl transition-all shadow-lg">
                {deleting ? "삭제 중..." : "영구 삭제"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
