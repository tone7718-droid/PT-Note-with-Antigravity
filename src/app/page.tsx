"use client";

import Sidebar from "@/components/Sidebar";
import ProgressNoteForm from "@/components/ProgressNoteForm";
import LoginModal from "@/components/LoginModal";

import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { useNoteStore } from "@/store/useNoteStore";

function HomeContent() {
  const therapist = useAuthStore((s) => s.therapist);
  const isAuthLoading = useAuthStore((s) => s.isLoading);
  const isNoteLoading = useNoteStore((s) => s.isLoading);
  const isLoading = isAuthLoading || isNoteLoading;
  const initSync = useNoteStore((s) => s.initSync);
  const checkLocalData = useNoteStore((s) => s.checkLocalData);
  
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    checkLocalData();
    initSync();
  }, [checkLocalData, initSync]);

  // Close mobile menu when a note is selected
  const selectedNoteId = useNoteStore((s) => s.selectedNoteId);
  useEffect(() => {
    if (isMobileMenuOpen) {
      setIsMobileMenuOpen(false);
    }
  }, [selectedNoteId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 font-bold">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!therapist) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <LoginModal onClose={() => {}} hideCancel />
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row h-[100dvh] bg-gray-50 text-gray-900 overflow-hidden font-sans">
      {/* Mobile Header */}
      <div className="lg:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 shadow-sm z-20 shrink-0">
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className="p-2 -ml-2 rounded-xl hover:bg-gray-100 text-gray-700 transition-colors"
          aria-label="사이드바 열기"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
        </button>
        <span className="font-black text-lg tracking-tight">PT NOTE</span>
        <span className="text-sm font-bold text-gray-600 bg-gray-100 px-3 py-1.5 rounded-full truncate max-w-[120px]">
          {therapist.name} {therapist.id && <span className="font-mono text-[10px]">({therapist.id})</span>}
        </span>
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
        fixed inset-y-0 left-0 z-40 w-4/5 max-w-[360px] bg-white shadow-2xl transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 lg:w-[360px] xl:w-[400px] lg:shadow-sm lg:border-r border-gray-200
        ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        <Sidebar />
      </div>

      {/* Form */}
      <div className="w-full flex-1 overflow-y-auto relative bg-white scroll-smooth h-full">
        <ProgressNoteForm />
      </div>
    </div>
  );
}

export default function Home() {
  return <HomeContent />;
}
