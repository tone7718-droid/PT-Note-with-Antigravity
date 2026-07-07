"use client";

import Sidebar from "@/components/Sidebar";
import ProgressNoteForm from "@/components/ProgressNoteForm";
import LoginModal from "@/components/LoginModal";

import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { useNoteStore } from "@/store/useNoteStore";
import { useThemeStore } from "@/store/useThemeStore";
import { Moon, Sun } from "lucide-react";

function HomeContent() {
  const therapist = useAuthStore((s) => s.therapist);
  // 주의: 로그인 진행(isAuthLoading) 중에는 스피너로 전환하지 않는다.
  // 전환하면 LoginModal이 언마운트→리마운트되며 로그인 실패 에러 메시지가 사라진다.
  // (로그인 진행 표시는 LoginModal의 "인증 중..." 버튼이 담당)
  const isLoading = useNoteStore((s) => s.isLoading);
  const initSync = useNoteStore((s) => s.initSync);
  const resolvedTheme = useThemeStore((s) => s.resolved);
  const setTheme = useThemeStore((s) => s.setTheme);
  const initTheme = useThemeStore((s) => s.init);
  
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  useEffect(() => {
    initSync();
  }, [initSync]);

  // Close mobile menu when a note is selected
  useEffect(() => {
    return useNoteStore.subscribe((state, prev) => {
      if (state.selectedNoteId !== prev.selectedNoteId) {
        setIsMobileMenuOpen(false);
      }
    });
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-900 dark:border-white border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400 font-bold">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!therapist) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-900">
        <LoginModal onClose={() => {}} hideCancel />
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row h-[100dvh] bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden font-sans print:h-auto print:overflow-visible print:block">
      {/* Mobile Header */}
      <div className="lg:hidden flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm z-20 shrink-0 print:hidden relative">
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className="p-2 -ml-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
          aria-label="사이드바 열기"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
        </button>
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-black text-lg tracking-tight dark:text-white pointer-events-none">PT NOTE</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition-colors"
            aria-label="테마 변경"
          >
            {resolvedTheme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <span className="text-sm font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-full truncate max-w-[100px]">
            {therapist.name}
          </span>
        </div>
      </div>

      {/* Sidebar Overlay (Mobile) */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-40 w-4/5 max-w-[360px] bg-white dark:bg-gray-900 shadow-2xl transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 lg:w-[360px] xl:w-[400px] lg:shadow-sm lg:border-r border-gray-200 dark:border-gray-800 print:hidden
        ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        <Sidebar />
      </div>

      {/* Form */}
      <div className="w-full flex-1 overflow-y-auto relative bg-white dark:bg-gray-900 scroll-smooth h-full print:h-auto print:overflow-visible print:block">
        <ProgressNoteForm />
      </div>
    </div>
  );
}

export default function Home() {
  return <HomeContent />;
}
