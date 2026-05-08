import * as React from "react";
import { useState, useRef, useEffect, useCallback, useImperativeHandle } from "react";
import { cn } from "@/utils/cn";
import { useMacroStore } from "@/store/useMacroStore";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  isPdfMode?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, isPdfMode, onChange, onKeyDown, value, ...props }, ref) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const macros = useMacroStore((s) => s.macros);
    
    const [showDropdown, setShowDropdown] = useState(false);
    const [filteredMacros, setFilteredMacros] = useState<typeof macros>([]);
    const [highlightIdx, setHighlightIdx] = useState(0);
    const [matchStart, setMatchStart] = useState(0);
    const [matchEnd, setMatchEnd] = useState(0);

    // forwardRef로 전달된 ref와 내부 ref 연결
    useImperativeHandle(ref, () => textareaRef.current as HTMLTextAreaElement);

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
      (val: string, cursorPos: number) => {
        const textBeforeCursor = val.slice(0, cursorPos);
        // "/도수" 또는 "/도수1", "/도수20" 패턴 매칭
        const match = textBeforeCursor.match(/\/도수(\d{0,2})$/);

        if (match) {
          const fullMatch = match[0];
          const numPart = match[1];
          const start = cursorPos - fullMatch.length;

          let results = macros.filter((m) => m.text.trim() !== "");
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
      const currentVal = textareaRef.current.value;
      const newVal = currentVal.slice(0, matchStart) + macro.text + currentVal.slice(matchEnd);

      // React Hook Form 호환을 위한 값 강제 설정 및 이벤트 발생
      const nativeValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      )?.set;

      if (nativeValueSetter) {
        nativeValueSetter.call(textareaRef.current, newVal);
        textareaRef.current.dispatchEvent(new Event("input", { bubbles: true }));
        textareaRef.current.dispatchEvent(new Event("change", { bubbles: true }));
      }

      // 수동 onChange 호출 (필요한 경우)
      if (onChange) {
        const event = {
          target: { ...textareaRef.current, value: newVal },
          currentTarget: { ...textareaRef.current, value: newVal },
        } as unknown as React.ChangeEvent<HTMLTextAreaElement>;
        onChange(event);
      }

      setShowDropdown(false);

      // 커서 위치 이동
      setTimeout(() => {
        if (textareaRef.current) {
          const newPos = matchStart + macro.text.length;
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newPos, newPos);
        }
      }, 0);
    };

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (onChange) onChange(e);
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
        } else if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          insertMacro(filteredMacros[highlightIdx]);
        } else if (e.key === "Escape") {
          e.preventDefault();
          setShowDropdown(false);
        }
      }
      if (onKeyDown) onKeyDown(e);
    };

    // 하이라이트 항목 스크롤 지원
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
          className={cn(
            isPdfMode
              ? "w-full py-1 text-base text-black bg-transparent border-0 border-b border-gray-300 font-medium leading-relaxed min-h-[4rem] resize-none overflow-hidden"
              : "w-full p-3 sm:p-4 text-sm sm:text-base md:text-lg border-2 border-gray-200 dark:border-gray-700 rounded-2xl focus:outline-none focus:ring-4 focus:ring-gray-900/10 dark:focus:ring-white/5 focus:border-gray-900 dark:focus:border-white transition-colors text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900 min-h-[5rem] sm:min-h-[7rem] placeholder:text-gray-400 dark:placeholder:text-gray-600 leading-relaxed shadow-sm overflow-y-auto custom-scrollbar resize-none print:shadow-none print:border-gray-300 print:text-base print:p-2 print:min-h-[5rem] print:bg-transparent",
            className
          )}
          ref={textareaRef}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          value={value}
          {...props}
        />

        {/* 매크로 드롭다운 UI */}
        {showDropdown && filteredMacros.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute left-0 right-0 z-[200] mt-1 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            style={{ bottom: "100%", marginBottom: "8px" }} // 입력 중인 곳 위로 표시 (모바일 키보드 고려)
          >
            <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">매크로 자동완성</span>
              <span className="text-[10px] text-gray-400 hidden sm:inline">↑↓ 선택 · Enter 적용 · Esc 닫기</span>
            </div>
            <ul className="max-h-[200px] overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800 custom-scrollbar">
              {filteredMacros.map((macro, idx) => (
                <li
                  key={macro.key}
                  data-idx={idx}
                  className={cn(
                    "flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors",
                    idx === highlightIdx
                      ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                      : "hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-800 dark:text-gray-200"
                  )}
                  onMouseEnter={() => setHighlightIdx(idx)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertMacro(macro);
                  }}
                >
                  <span className={cn(
                    "shrink-0 px-2 py-0.5 rounded-md text-[10px] font-bold font-mono",
                    idx === highlightIdx
                      ? "bg-white/20 text-white dark:bg-gray-900/10 dark:text-gray-900"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-500"
                  )}>
                    {macro.key}
                  </span>
                  <span className="text-sm font-medium leading-relaxed line-clamp-2 flex-1">
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
);
Textarea.displayName = "Textarea";

export { Textarea };
