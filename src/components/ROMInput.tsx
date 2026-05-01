"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const ROM_DATABASE: Record<string, string> = {
  "오른쪽 어깨 굴곡": "0~180°", "왼쪽 어깨 굴곡": "0~180°", "오른쪽 어깨 신전": "0~60°", "왼쪽 어깨 신전": "0~60°",
  "오른쪽 어깨 외전": "0~180°", "왼쪽 어깨 외전": "0~180°", "오른쪽 어깨 내전": "0~50°", "왼쪽 어깨 내전": "0~50°",
  "오른쪽 팔꿈치 굴곡": "0~150°", "왼쪽 팔꿈치 굴곡": "0~150°",
  "오른쪽 손목 굴곡": "0~80°", "왼쪽 손목 굴곡": "0~80°",
  "오른쪽 고관절 굴곡": "0~120°", "왼쪽 고관절 굴곡": "0~120°",
  "오른쪽 무릎 굴곡": "0~135°", "왼쪽 무릎 굴곡": "0~135°",
  "오른쪽 발목 배굴": "0~20°", "왼쪽 발목 배굴": "0~20°",
  "목 굴곡": "0~45°", "목 신전": "0~45°", "목 회전": "0~80°",
  "허리 굴곡": "0~60°", "허리 신전": "0~25°",
};

const JOINT_NAMES = Object.keys(ROM_DATABASE);

interface ROMEntry {
  id: number;
  joint: string;
  measuredROM: string;
}

interface ROMInputProps {
  entries: ROMEntry[];
  setEntries: React.Dispatch<React.SetStateAction<ROMEntry[]>>;
}

export default function ROMInput({ entries, setEntries }: ROMInputProps) {
  const [activeId, setActiveId] = useState<number | null>(null);
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
    if (!query.trim()) return [];
    const normalizedQuery = query.toLowerCase().replace(/\s+/g, "");
    return JOINT_NAMES.filter((j) => j.toLowerCase().replace(/\s+/g, "").includes(normalizedQuery));
  };

  const getNormalRange = (joint: string) => ROM_DATABASE[joint] ?? null;

  const updateEntry = (id: number, field: keyof ROMEntry, value: string) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
  };

  const addEntry = () => setEntries((prev) => [...prev, { id: Date.now(), joint: "", measuredROM: "" }]);
  const removeEntry = (id: number) => setEntries((prev) => prev.filter((e) => e.id !== id));

  return (
    <div className="w-full">
      <div className="hidden lg:grid lg:grid-cols-[1fr_1.5fr_48px] gap-6 mb-4 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider">
        <span>관절 동작 선택</span>
        <span>측정 ROM & 정상 범위</span>
        <span />
      </div>

      <div className="space-y-4">
        <AnimatePresence>
          {entries.map((entry) => {
            const suggestions = getFilteredJoints(entry.joint);
            const normalRange = getNormalRange(entry.joint);
            const showDropdown = activeId === entry.id && suggestions.length > 0;
            const isSelected = !!normalRange;

            return (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                layout
                className={`
                  grid grid-cols-1 lg:grid-cols-[1fr_1.5fr_48px] gap-4 items-center p-4 rounded-3xl border transition-all duration-300 relative
                  ${isSelected ? "bg-primary/5 border-primary/20 dark:bg-primary/10" : "bg-[var(--card)] border-border shadow-sm"}
                `}
                style={{ zIndex: showDropdown ? 50 : 1 }}
              >
                <div className="relative w-full" ref={activeId === entry.id ? dropdownRef : undefined}>
                  <input
                    type="text"
                    className={`w-full p-4 rounded-xl border focus:ring-4 focus:ring-primary/20 focus:border-primary transition-colors bg-[var(--background)] text-foreground placeholder:text-gray-400 font-medium ${isSelected ? "text-primary border-primary/30" : "border-border"}`}
                    placeholder="관절 부위 입력..."
                    value={entry.joint}
                    onChange={(e) => {
                      updateEntry(entry.id, "joint", e.target.value);
                      setActiveId(entry.id);
                      setHighlightIdx(-1);
                    }}
                    onFocus={() => { if (entry.joint.trim()) setActiveId(entry.id); }}
                    onKeyDown={(e) => {
                      if (!showDropdown) return;
                      // Handle dropdown keyboard navigation
                      if (e.key === "ArrowDown") { e.preventDefault(); setHighlightIdx(i => Math.min(i + 1, suggestions.length - 1)); }
                      if (e.key === "ArrowUp") { e.preventDefault(); setHighlightIdx(i => Math.max(i - 1, 0)); }
                      if (e.key === "Enter" && highlightIdx >= 0) { e.preventDefault(); updateEntry(entry.id, "joint", suggestions[highlightIdx]); setActiveId(null); }
                    }}
                  />

                  {showDropdown && (
                    <motion.ul 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute top-[105%] left-0 w-full z-50 bg-[var(--card)] border border-border rounded-xl shadow-xl overflow-hidden"
                    >
                      {suggestions.map((s, idx) => (
                        <li
                          key={s}
                          className={`px-4 py-3 cursor-pointer text-sm font-medium transition-colors flex justify-between ${idx === highlightIdx ? "bg-primary text-primary-foreground" : "hover:bg-primary/10 text-foreground"}`}
                          onMouseEnter={() => setHighlightIdx(idx)}
                          onMouseDown={(e) => { e.preventDefault(); updateEntry(entry.id, "joint", s); setActiveId(null); }}
                        >
                          <span>{s}</span>
                          <span className={idx === highlightIdx ? "text-primary-foreground/70" : "text-gray-400"}>{ROM_DATABASE[s]}</span>
                        </li>
                      ))}
                    </motion.ul>
                  )}
                </div>

                <div className="flex items-center gap-4 w-full">
                  <div className="relative w-32 shrink-0">
                    <input
                      type="number"
                      className={`w-full p-4 pr-8 rounded-xl border text-center font-bold text-xl appearance-none focus:ring-4 focus:ring-primary/20 focus:border-primary transition-colors ${isSelected ? "text-primary bg-[var(--background)] border-primary/30" : "bg-gray-100 dark:bg-gray-800 text-gray-400 border-transparent placeholder-gray-300"}`}
                      placeholder="0"
                      value={entry.measuredROM}
                      onChange={(e) => updateEntry(entry.id, "measuredROM", e.target.value)}
                      disabled={!isSelected}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none font-bold">°</span>
                  </div>
                  <span className={`text-sm font-bold flex-1 truncate ${isSelected ? "text-primary/70" : "text-gray-400 italic"}`}>
                    {isSelected ? `/ 정상 범위 : ${normalRange}` : "관절 선택 요망"}
                  </span>
                </div>

                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => removeEntry(entry.id)}
                  className="w-12 h-12 flex mx-auto xl:mx-0 items-center justify-center rounded-xl bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                >
                  &times;
                </motion.button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <div className="mt-8 flex justify-center">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={addEntry}
          className="px-8 py-3 rounded-2xl bg-primary/10 text-primary font-bold text-sm border border-primary/20 hover:bg-primary hover:text-primary-foreground transition-all"
        >
          + 관절 동작 추가
        </motion.button>
      </div>
    </div>
  );
}
