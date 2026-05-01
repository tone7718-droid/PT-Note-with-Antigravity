"use client";
import React, { useRef, useEffect, useState, useCallback } from "react";
import { useMacroStore } from "@/store/useMacroStore";

interface AutoExpTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export default function AutoExpTextarea(props: AutoExpTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const macros = useMacroStore((s) => s.macros);
  const [showDropdown, setShowDropdown] = useState(false);
  const [filteredMacros, setFilteredMacros] = useState<typeof macros>([]);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [matchStart, setMatchStart] = useState(0);
  const [matchEnd, setMatchEnd] = useState(0);

  const resizeTextarea = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  useEffect(() => {
    resizeTextarea();
  }, [props.value]);

  // 클릭 바깥 감지 — 드롭다운 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const checkForMacroTrigger = useCallback(
    (value: string, cursorPos: number) => {
      // 커서 왼쪽에서 `/도수` 패턴 찾기
      const textBeforeCursor = value.slice(0, cursorPos);
      const match = textBeforeCursor.match(/\/도수(\d{0,2})$/);

      if (match) {
        const fullMatch = match[0]; // "/도수" or "/도수1" or "/도수12"
        const numPart = match[1]; // "" or "1" or "12"
        const start = cursorPos - fullMatch.length;

        // 등록된(빈 문자열이 아닌) 매크로만 필터
        let results = macros.filter((m) => m.text.trim() !== "");

        // 숫자가 입력된 경우 해당 번호로 필터
        if (numPart) {
          results = results.filter((m) => m.key.startsWith(`/도수${numPart}`));
        }

        if (results.length > 0) {
          setFilteredMacros(results);
          setMatchStart(start);
          setMatchEnd(cursorPos);
          setHighlightIdx(0);
          setShowDropdown(true);
          return;
        }
      }

      setShowDropdown(false);
    },
    [macros]
  );

  const insertMacro = (macro: (typeof macros)[0]) => {
    if (!textareaRef.current) return;
    const value = textareaRef.current.value;
    const newValue = value.slice(0, matchStart) + macro.text + value.slice(matchEnd);

    // React Hook Form 등과의 호환을 위해 native event를 발생시킴
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    )?.set;

    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(textareaRef.current, newValue);
      const event = new Event("input", { bubbles: true });
      textareaRef.current.dispatchEvent(event);
      // onChange도 직접 호출
      const changeEvent = new Event("change", { bubbles: true });
      textareaRef.current.dispatchEvent(changeEvent);
    }

    // props.onChange도 직접 호출
    if (props.onChange) {
      const syntheticEvent = {
        target: { ...textareaRef.current, value: newValue },
        currentTarget: { ...textareaRef.current, value: newValue },
      } as unknown as React.ChangeEvent<HTMLTextAreaElement>;
      props.onChange(syntheticEvent);
    }

    setShowDropdown(false);

    // 커서를 삽입된 텍스트 끝으로 이동
    setTimeout(() => {
      if (textareaRef.current) {
        const cursorPos = matchStart + macro.text.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(cursorPos, cursorPos);
        resizeTextarea();
      }
    }, 0);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    resizeTextarea();
    if (props.onChange) props.onChange(e);

    // 매크로 트리거 체크
    const cursorPos = e.target.selectionStart ?? e.target.value.length;
    checkForMacroTrigger(e.target.value, cursorPos);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showDropdown && filteredMacros.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIdx((i) => Math.min(i + 1, filteredMacros.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        insertMacro(filteredMacros[highlightIdx]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setShowDropdown(false);
      } else if (e.key === "Tab") {
        e.preventDefault();
        insertMacro(filteredMacros[highlightIdx]);
      }
    }
    if (props.onKeyDown) props.onKeyDown(e);
  };

  // 하이라이트된 항목이 스크롤 영역에 보이도록
  useEffect(() => {
    if (!showDropdown || !dropdownRef.current) return;
    const highlighted = dropdownRef.current.querySelector(`[data-idx="${highlightIdx}"]`);
    if (highlighted) {
      highlighted.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIdx, showDropdown]);

  return (
    <div className="relative w-full">
      <textarea
        ref={textareaRef}
        rows={1}
        {...props}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className={`w-full resize-none overflow-hidden p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-gray-900/50 transition-all text-sm leading-relaxed min-h-[48px] ${props.className || ""}`}
      />

      {/* 매크로 자동완성 드롭다운 */}
      {showDropdown && filteredMacros.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute left-0 right-0 z-[200] mt-1 bg-white border-2 border-gray-200 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          style={{ bottom: "auto" }}
        >
          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">매크로 자동완성</span>
            <span className="text-xs text-gray-400">↑↓ 선택 · Enter/Tab 적용 · Esc 닫기</span>
          </div>
          <ul className="max-h-[280px] overflow-y-auto divide-y divide-gray-50">
            {filteredMacros.map((macro, idx) => (
              <li
                key={macro.key}
                data-idx={idx}
                className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${
                  idx === highlightIdx
                    ? "bg-gray-900 text-white"
                    : "hover:bg-gray-50 text-gray-800"
                }`}
                onMouseEnter={() => setHighlightIdx(idx)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMacro(macro);
                }}
              >
                <span
                  className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-bold font-mono ${
                    idx === highlightIdx
                      ? "bg-white/20 text-white"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {macro.key}
                </span>
                <span
                  className={`text-sm font-medium leading-relaxed line-clamp-2 ${
                    idx === highlightIdx ? "text-gray-100" : "text-gray-700"
                  }`}
                >
                  {macro.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
