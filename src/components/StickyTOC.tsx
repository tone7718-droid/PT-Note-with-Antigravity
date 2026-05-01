"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export const SECTION_IDS = [
  { id: "section-info", title: "1. 기본 정보" },
  { id: "section-cc", title: "2. 주호소 및 발병" },
  { id: "section-pain", title: "3. 통증 부위 (NRS)" },
  { id: "section-rom", title: "4. 관절 가동범위" },
  { id: "section-postural", title: "5. 자세 분석" },
  { id: "section-palpation", title: "6. 촉진" },
  { id: "section-special", title: "7. 특수 검사" },
  { id: "section-treatment", title: "8. 치료 내용" },
  { id: "section-home", title: "9. 홈 프로그램" },
];

export default function StickyTOC() {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const observers = new Map<string, IntersectionObserver>();
    
    // Create an observer for each section
    SECTION_IDS.forEach(({ id }) => {
      const element = document.getElementById(id);
      if (element) {
        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                // When intersecting, we set it as active
                setActiveId(id);
              }
            });
          },
          { rootMargin: "-20% 0px -60% 0px" } // Trigger when element is somewhat near top
        );
        observer.observe(element);
        observers.set(id, observer);
      }
    });

    return () => {
      observers.forEach((observer) => observer.disconnect());
    };
  }, []);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <nav className="w-56 shrink-0 hidden xl:block sticky top-8 h-fit self-start pl-6">
      <div className="glass p-5 rounded-3xl shadow-sm border-[var(--border)] relative overflow-hidden">
        <h4 className="font-extrabold text-sm mb-4 text-[var(--foreground)] tracking-wide flex items-center gap-2">
          <span className="w-1.5 h-6 bg-primary rounded-full"></span>
          빠른 이동 (내비게이션)
        </h4>

        <ul className="flex flex-col gap-1 relative border-l-2 border-[var(--border)] ml-1">
          {SECTION_IDS.map(({ id, title }) => {
            const isActive = activeId === id;
            return (
              <li key={id} className="relative">
                <button
                  type="button"
                  onClick={() => scrollToSection(id)}
                  className={cn(
                    "w-full text-left py-2 px-4 text-xs font-bold transition-all rounded-r-xl outline-none hover:bg-primary/5",
                    isActive ? "text-primary" : "text-gray-500 dark:text-gray-400 hover:text-foreground"
                  )}
                >
                  {title}
                </button>
                {/* Active Indicator Line */}
                {isActive && (
                  <motion.div
                    layoutId="activeTOC"
                    className="absolute left-[-2px] top-0 w-[2px] h-full bg-primary"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
