"use client";
import React, { useRef, useEffect } from "react";

interface AutoExpTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export default function AutoExpTextarea(props: AutoExpTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resizeTextarea = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  useEffect(() => {
    resizeTextarea();
  }, [props.value]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    resizeTextarea();
    if (props.onChange) props.onChange(e);
  };

  return (
    <textarea
      ref={textareaRef}
      rows={1}
      {...props}
      onChange={handleChange}
      className={`w-full resize-none overflow-hidden p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-gray-900/50 transition-all text-sm leading-relaxed min-h-[48px] ${props.className || ""}`}
    />
  );
}
