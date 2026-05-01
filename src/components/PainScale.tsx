"use client";
import React from "react";

const PAIN_LEVELS = [
  { level: 0, face: "😀", color: "text-green-500 dark:text-green-400" },
  { level: 1, face: "🙂", color: "text-green-400 dark:text-green-300" },
  { level: 2, face: "😐", color: "text-yellow-400 dark:text-yellow-300" },
  { level: 3, face: "😕", color: "text-yellow-500 dark:text-yellow-400" },
  { level: 4, face: "😟", color: "text-orange-400 dark:text-orange-300" },
  { level: 5, face: "☹️", color: "text-orange-500 dark:text-orange-400" },
  { level: 6, face: "😣", color: "text-red-400 dark:text-red-300" },
  { level: 7, face: "😖", color: "text-red-500 dark:text-red-400" },
  { level: 8, face: "😫", color: "text-red-600 dark:text-red-500" },
  { level: 9, face: "😩", color: "text-rose-600 dark:text-rose-500" },
  { level: 10, face: "😭", color: "text-rose-700 dark:text-rose-600" },
];

interface PainScaleProps {
  value: number | null;
  onChange: (val: number) => void;
}

export default function PainScale({ value, onChange }: PainScaleProps) {

  return (
    <div className="w-full bg-zinc-50 dark:bg-zinc-900/50 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800">
      <div className="flex justify-between items-center w-full gap-1 overflow-x-auto pb-2 custom-scrollbar">
        {PAIN_LEVELS.map((item) => {
          const isSelected = value === item.level;
          return (
            <button
              key={item.level}
              onClick={() => onChange(item.level)}
              type="button"
              className={`relative flex flex-col items-center justify-center p-2 rounded-lg transition-all duration-300 min-w-[44px] ${
                isSelected 
                  ? "scale-125 z-10 bg-white dark:bg-zinc-800 shadow-md ring-2 ring-red-500 ring-offset-1 dark:ring-offset-zinc-900" 
                  : "hover:bg-zinc-100 dark:hover:bg-zinc-800/80 hover:scale-110"
              }`}
            >
              {isSelected && (
                <div className="absolute inset-0 rounded-lg border-2 border-red-500 pointer-events-none animate-pulse-fast"></div>
              )}
              <span className="text-2xl mb-1 drop-shadow-sm">{item.face}</span>
              <span className={`text-xs font-bold ${item.color}`}>
                {item.level}
              </span>
              
              {isSelected && (
                <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-white dark:border-zinc-800 z-20"></div>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between text-[11px] text-zinc-400 mt-2 px-2 font-medium">
        <span>통증 없음(0)</span>
        <span>심한 통증(5)</span>
        <span>극심한 통증(10)</span>
      </div>
    </div>
  );
}
