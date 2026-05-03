"use client";

import React, { useState, useRef, useEffect } from "react";
import { RotateCw, CheckCircle2, X } from "lucide-react";

export type BodyDiagramProps = {
  painAreas?: Record<string, number>;
  setPainAreas?: (areas: Record<string, number>) => void;
};

const PAIN_LABEL: Record<number, string> = { 1: "경도(Mild)", 2: "중등도(Moderate)", 3: "중증(Severe)" };

const VIEW_LABEL: Record<string, string> = { anterior: "전면부", posterior: "후면부" };

const SEVERITY_COLOR: Record<number, { fill: string; stroke: string; tw: string }> = {
  1: { fill: "#fde047", stroke: "#ca8a04", tw: "bg-yellow-300 border-yellow-600" },
  2: { fill: "#f97316", stroke: "#c2410c", tw: "bg-orange-500 border-orange-700" },
  3: { fill: "#ef4444", stroke: "#991b1b", tw: "bg-red-500 border-red-800" },
};

// ----------------------------------------------------------------------
// SVG Components
// ----------------------------------------------------------------------

function PainLabel({ bbox, level }: { bbox: DOMRect; level: number }) {
  if (level === 0 || bbox.width < 14 || bbox.height < 14) return null;
  return (
    <text
      x={bbox.x + bbox.width / 2}
      y={bbox.y + bbox.height / 2}
      textAnchor="middle"
      dominantBaseline="central"
      className="pain-label"
      aria-hidden="true"
    >
      {level}
    </text>
  );
}

// ----------------------------------------------------------------------
// BodyDiagram Component
// ----------------------------------------------------------------------

export default function BodyDiagram({ painAreas: ext, setPainAreas: setExt }: BodyDiagramProps) {
  const [local, setLocal] = useState<Record<string, number>>({});
  const [hoveredNode, setHoveredNode] = useState<{ name: string; level: number; x: number; y: number } | null>(null);

  // Magnifier state
  const [magnify, setMagnify] = useState<{
    active: boolean;
    x: number;
    y: number;
    targetName: string | null;
    view: 'anterior' | 'posterior' | null;
    svgRect: DOMRect | null;
  } | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startPos = useRef({ x: 0, y: 0, name: null as string | null });
  const isDragging = useRef(false);

  const magnifyRef = useRef(magnify);
  magnifyRef.current = magnify;

  useEffect(() => {
    const handleTouchMove = (e: TouchEvent) => {
      if (magnifyRef.current?.active) {
        e.preventDefault();
      }
    };
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    return () => {
      document.removeEventListener("touchmove", handleTouchMove);
    };
  }, []);

  const svgAntRef = useRef<SVGSVGElement>(null);
  const svgPostRef = useRef<SVGSVGElement>(null);

  const ctrl = ext !== undefined && setExt !== undefined;
  const areas = ctrl ? ext : local;
  const setAreas = ctrl ? setExt : setLocal;

  // React state doesn't easily map to DOMRects for SVGs immediately during render, 
  // so we will rely on a trick or just use pure CSS classes for the coloring, 
  // and maybe attach labels after layout effect if needed, or simply let the CSS do the heavy lifting for colors 
  // and skip the numbers if BBox calculation is too tricky in pure React without refs.
  // Actually, we can just render the numbers by using refs on the SVG groups, but it's easier to use a simple BBox approach if we map them.
  // Let's implement the core logic first.

  const cyclePainLevel = (name: string, group?: string) => {
    const currentLevel = areas[name] || 0;
    const nextLevel = (currentLevel + 1) % 4;
    
    const next = { ...areas };
    if (nextLevel === 0) {
      delete next[name];
    } else {
      next[name] = nextLevel;
    }
    setAreas(next);
  };

  const removeArea = (name: string) => {
    const next = { ...areas };
    delete next[name];
    setAreas(next);
  };

  // ----------------------------------------------------------------------
  // Event Handlers
  // ----------------------------------------------------------------------

  const handlePointerDown = (e: React.PointerEvent) => {
    const target = (e.target as Element).closest("[data-name]");
    const viewGroup = (e.target as Element).closest("[data-view]");
    if (!target || !viewGroup) return;

    if (e.pointerType !== 'touch' && e.button !== 0) return;
    if (magnify?.active) return;

    const name = target.getAttribute("data-name");
    const view = viewGroup.getAttribute("data-view") as 'anterior' | 'posterior';
    const svgEl = view === 'anterior' ? svgAntRef.current : svgPostRef.current;
    
    startPos.current = { x: e.clientX, y: e.clientY, name };
    isDragging.current = false;

    e.currentTarget.setPointerCapture(e.pointerId);

    timerRef.current = setTimeout(() => {
      isDragging.current = true;
      setMagnify({
        active: true,
        x: e.clientX,
        y: e.clientY,
        targetName: name,
        view,
        svgRect: svgEl ? svgEl.getBoundingClientRect() : null
      });
      if (navigator.vibrate) navigator.vibrate(50);
    }, 400);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    // Normal hover for desktop
    if (!magnify?.active) {
      const target = (e.target as Element).closest("[data-name]");
      if (target) {
        const name = target.getAttribute("data-name");
        if (name) {
          const level = areas[name] || 0;
          setHoveredNode({ name, level, x: e.clientX, y: e.clientY });
        }
      } else {
        setHoveredNode(null);
      }
    }

    if (timerRef.current && !isDragging.current) {
      const dx = e.clientX - startPos.current.x;
      const dy = e.clientY - startPos.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > 10) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }

    if (isDragging.current && magnify) {
      // Create a temporary class on magnifier to hide it from elementFromPoint
      const magEl = document.getElementById('magnifier-overlay');
      const backdropEl = document.getElementById('magnifier-backdrop');
      if (magEl) magEl.style.pointerEvents = 'none';
      if (backdropEl) backdropEl.style.pointerEvents = 'none';
      
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const target = el?.closest("[data-name]");
      const name = target ? target.getAttribute("data-name") : magnify.targetName;
      
      if (magEl) magEl.style.pointerEvents = 'auto';
      if (backdropEl) backdropEl.style.pointerEvents = 'auto';

      setMagnify(prev => prev ? { ...prev, x: e.clientX, y: e.clientY, targetName: name } : null);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    
    if (isDragging.current) {
      isDragging.current = false;
    } else if (!magnify?.active) {
      // Tap (not long press, not dragged)
      // Check distance in case timer was cleared by move
      const dx = e.clientX - startPos.current.x;
      const dy = e.clientY - startPos.current.y;
      if (Math.sqrt(dx * dx + dy * dy) <= 10) {
        if (startPos.current.name) {
          cyclePainLevel(startPos.current.name);
          if (navigator.vibrate) navigator.vibrate(15);
        }
      }
    }
  };

  const handlePointerOut = (e: React.PointerEvent) => {
    if (!magnify?.active) {
      setHoveredNode(null);
    }
  };

  const getStyleClass = (name: string, isDeep: boolean = false) => {
    const base = isDeep ? "muscle-deep" : "muscle";
    const level = areas[name] || 0;
    if (level > 0) return `${base} pain-${level}`;
    return base;
  };

  const renderPath = (type: string, props: any) => {
    const name = props["data-name"];
    const isDeep = props.className?.includes("muscle-deep");
    const Comp = type as any;
    
    return (
      <Comp
        {...props}
        className={getStyleClass(name, isDeep)}
        tabIndex={0}
        role="button"
        aria-pressed={(areas[name] || 0) > 0}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            cyclePainLevel(name);
          }
        }}
      >
        <title>{name}</title>
      </Comp>
    );
  };

  // To support labels (1,2,3), we could use SVG text if we had bounding boxes, 
  // but to keep the React port reliable and responsive, CSS `fill` and `stroke` already show severity clearly.
  // We will include the CSS in a style tag.

  const records = Object.entries(areas)
    .filter(([_, level]) => level > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="w-full flex flex-col items-center">
      <style>{`
        .muscle { fill: #e2e8f0; stroke: #64748b; stroke-width: 2; transition: all 0.15s ease; cursor: pointer; outline: none; }
        .muscle-deep { fill: rgba(203, 213, 225, 0.5); stroke: #475569; stroke-width: 2; stroke-dasharray: 4, 3; transition: all 0.15s ease; cursor: pointer; outline: none; }
        
        @media (hover: hover) {
          .muscle:hover, .muscle-deep:hover { stroke-width: 3; }
          .muscle:hover { fill: #cbd5e1; }
          .muscle-deep:hover { fill: rgba(148, 163, 184, 0.8); }
        }
        
        .muscle:focus-visible, .muscle-deep:focus-visible { outline: 3px solid #2563eb; outline-offset: 2px; }
        
        .muscle.pain-1, .muscle-deep.pain-1 { fill: #fde047; stroke: #ca8a04; stroke-width: 3; stroke-dasharray: 0; }
        .muscle.pain-2, .muscle-deep.pain-2 { fill: #f97316; stroke: #c2410c; stroke-width: 3.5; stroke-dasharray: 0; }
        .muscle.pain-3, .muscle-deep.pain-3 { fill: #ef4444; stroke: #991b1b; stroke-width: 4; stroke-dasharray: 0; }
        
        .lr-marker { font-size: 14px; font-weight: bold; fill: #94a3b8; letter-spacing: 0.05em; pointer-events: none; }
      `}</style>

      {hoveredNode && (
        <div
          className="fixed bg-slate-900/95 text-white px-3 py-1.5 rounded-lg text-sm font-medium pointer-events-none z-[100] shadow-md whitespace-nowrap"
          style={{ left: hoveredNode.x, top: hoveredNode.y - 30, transform: "translate(-50%, -100%)" }}
        >
          {hoveredNode.name} {hoveredNode.level > 0 && `(${PAIN_LABEL[hoveredNode.level]})`}
        </div>
      )}

      {/* Toolbar & Legend */}
      <div className="flex flex-col w-full mb-4 gap-3">
        <div className="flex justify-between items-center px-1">
          <p className="text-sm font-bold text-slate-500">📌 부위 클릭 (경도 ➔ 중등도 ➔ 중증 ➔ 취소)</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
          <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-sm bg-[#e2e8f0] border border-[#64748b]"></span> 정상</span>
          <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-sm bg-[#fde047] border border-[#ca8a04]"></span> 경도(1)</span>
          <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-sm bg-[#f97316] border border-[#c2410c]"></span> 중등도(2)</span>
          <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-sm bg-[#ef4444] border border-[#991b1b]"></span> 중증(3)</span>
          <span className="text-slate-400 ml-auto hidden sm:inline">· 점선 = 심부근육</span>
        </div>
      </div>

      {/* Diagram Container */}
      <div 
        className="w-full grid grid-cols-1 md:grid-cols-2 gap-4"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerOut={handlePointerOut}
        style={{ touchAction: magnify?.active ? "none" : "auto" }}
      >
        {/* Anterior View */}
        <div className="relative bg-white rounded-2xl shadow-sm border border-slate-200 p-2 overflow-hidden flex flex-col items-center">
          <h2 className="absolute top-4 left-4 font-bold text-slate-300 tracking-widest uppercase text-xs">
            Anterior
          </h2>
          <svg ref={svgAntRef} viewBox="0 0 500 950" className="w-full h-auto mt-4 drop-shadow-sm select-none" aria-label="전면부 해부도">
            <line x1="250" y1="0" x2="250" y2="950" stroke="#f1f5f9" strokeWidth="2" strokeDasharray="8,8" />
            <text x="50" y="50" className="lr-marker">R (우측)</text>
            <text x="380" y="50" className="lr-marker">L (좌측)</text>

            <g data-view="anterior">
              {renderPath("ellipse", { cx: 250, cy: 70, rx: 40, ry: 55, "data-name": "머리 및 안면" })}
              {renderPath("circle", { cx: 220, cy: 90, r: 12, "data-name": "우측 턱관절 (TMJ)" })}
              {renderPath("circle", { cx: 280, cy: 90, r: 12, "data-name": "좌측 턱관절 (TMJ)" })}
              {renderPath("polygon", { points: "215,105 225,105 245,145 235,145", "data-name": "우측 흉쇄유돌근" })}
              {renderPath("polygon", { points: "275,105 285,105 265,145 255,145", "data-name": "좌측 흉쇄유돌근" })}
              {renderPath("rect", { x: 246, y: 150, width: 8, height: 70, rx: 4, "data-name": "흉골" })}
              {renderPath("polygon", { points: "246,150 180,150 160,220 246,230", "data-name": "우측 대흉근" })}
              {renderPath("polygon", { points: "254,150 320,150 340,220 254,230", "data-name": "좌측 대흉근" })}
              {renderPath("polygon", { points: "225,155 185,175 200,205", className: "muscle-deep", "data-name": "우측 소흉근 (심부)" })}
              {renderPath("polygon", { points: "275,155 315,175 300,205", className: "muscle-deep", "data-name": "좌측 소흉근 (심부)" })}
              {renderPath("polygon", { points: "180,150 160,160 145,230 160,220", "data-name": "우측 전면 삼각근" })}
              {renderPath("polygon", { points: "160,160 140,170 130,240 145,230", "data-name": "우측 측면 삼각근" })}
              {renderPath("polygon", { points: "320,150 340,160 355,230 340,220", "data-name": "좌측 전면 삼각근" })}
              {renderPath("polygon", { points: "340,160 360,170 370,240 355,230", "data-name": "좌측 측면 삼각근" })}
              {renderPath("polygon", { points: "130,240 110,330 140,330 160,220", "data-name": "우측 이두근" })}
              {renderPath("polygon", { points: "370,240 390,330 360,330 340,220", "data-name": "좌측 이두근" })}
              {renderPath("circle", { cx: 145, cy: 335, r: 10, "data-name": "우측 안쪽 상과" })}
              {renderPath("circle", { cx: 355, cy: 335, r: 10, "data-name": "좌측 안쪽 상과" })}
              {renderPath("polygon", { points: "140,340 120,440 140,440 150,340", "data-name": "우측 안쪽 전완" })}
              {renderPath("polygon", { points: "110,340 90,440 120,440 130,340", "data-name": "우측 가쪽 전완" })}
              {renderPath("polygon", { points: "360,340 380,440 360,440 350,340", "data-name": "좌측 안쪽 전완" })}
              {renderPath("polygon", { points: "390,340 410,440 380,440 370,340", "data-name": "좌측 가쪽 전완" })}
              {renderPath("polygon", { points: "90,450 70,520 110,520 120,450", "data-name": "우측 손" })}
              {renderPath("polygon", { points: "410,450 430,520 390,520 380,450", "data-name": "좌측 손" })}
              {renderPath("rect", { x: 215, y: 235, width: 33, height: 35, rx: 5, "data-name": "복직근" })}
              {renderPath("rect", { x: 252, y: 235, width: 33, height: 35, rx: 5, "data-name": "복직근" })}
              {renderPath("rect", { x: 218, y: 275, width: 30, height: 40, rx: 5, "data-name": "복직근" })}
              {renderPath("rect", { x: 252, y: 275, width: 30, height: 40, rx: 5, "data-name": "복직근" })}
              {renderPath("rect", { x: 222, y: 320, width: 26, height: 45, rx: 5, "data-name": "복직근" })}
              {renderPath("rect", { x: 252, y: 320, width: 26, height: 45, rx: 5, "data-name": "복직근" })}
              {renderPath("polygon", { points: "185,230 155,240 170,280 210,270", "data-name": "우측 전거근" })}
              {renderPath("polygon", { points: "315,230 345,240 330,280 290,270", "data-name": "좌측 전거근" })}
              {renderPath("polygon", { points: "210,275 165,285 180,360 220,360", "data-name": "우측 복사근" })}
              {renderPath("polygon", { points: "290,275 335,285 320,360 280,360", "data-name": "좌측 복사근" })}
              {renderPath("polygon", { points: "248,365 230,365 235,440 248,430", className: "muscle-deep", "data-name": "우측 장요근 (심부)" })}
              {renderPath("polygon", { points: "252,365 270,365 265,440 252,430", className: "muscle-deep", "data-name": "좌측 장요근 (심부)" })}
              {renderPath("circle", { cx: 195, cy: 380, r: 12, "data-name": "우측 골반뼈 (ASIS)" })}
              {renderPath("circle", { cx: 305, cy: 380, r: 12, "data-name": "좌측 골반뼈 (ASIS)" })}
              {renderPath("polygon", { points: "195,375 190,385 235,445 240,435", "data-name": "우측 서혜부" })}
              {renderPath("polygon", { points: "305,375 310,385 265,445 260,435", "data-name": "좌측 서혜부" })}
              {renderPath("polygon", { points: "245,435 195,400 160,480 180,650 240,650", "data-name": "우측 대퇴사두근" })}
              {renderPath("polygon", { points: "255,435 305,400 340,480 320,650 260,650", "data-name": "좌측 대퇴사두근" })}
              {renderPath("polygon", { points: "160,480 145,530 170,650 180,650", "data-name": "우측 장경인대" })}
              {renderPath("polygon", { points: "340,480 355,530 330,650 320,650", "data-name": "좌측 장경인대" })}
              {renderPath("circle", { cx: 210, cy: 675, r: 22, "data-name": "우측 무릎뼈 (Patella)" })}
              {renderPath("circle", { cx: 290, cy: 675, r: 22, "data-name": "좌측 무릎뼈 (Patella)" })}
              {renderPath("polygon", { points: "210,700 205,700 195,830 205,830", "data-name": "우측 정강이뼈" })}
              {renderPath("polygon", { points: "205,700 170,700 185,830 195,830", "data-name": "우측 전경골근" })}
              {renderPath("polygon", { points: "235,700 215,700 205,830 220,830", "data-name": "우측 안쪽 종아리" })}
              {renderPath("polygon", { points: "290,700 295,700 305,830 295,830", "data-name": "좌측 정강이뼈" })}
              {renderPath("polygon", { points: "295,700 330,700 315,830 305,830", "data-name": "좌측 전경골근" })}
              {renderPath("polygon", { points: "265,700 285,700 295,830 280,830", "data-name": "좌측 안쪽 종아리" })}
              {renderPath("polygon", { points: "215,845 180,845 185,920 230,920", "data-name": "우측 발등" })}
              {renderPath("polygon", { points: "285,845 320,845 315,920 270,920", "data-name": "좌측 발등" })}
            </g>
          </svg>
        </div>

        {/* Posterior View */}
        <div className="relative bg-white rounded-2xl shadow-sm border border-slate-200 p-2 overflow-hidden flex flex-col items-center">
          <h2 className="absolute top-4 left-4 font-bold text-slate-300 tracking-widest uppercase text-xs">
            Posterior
          </h2>
          <svg ref={svgPostRef} viewBox="0 0 500 950" className="w-full h-auto mt-4 drop-shadow-sm select-none" aria-label="후면부 해부도">
            <line x1="250" y1="0" x2="250" y2="950" stroke="#f1f5f9" strokeWidth="2" strokeDasharray="8,8" />
            <text x="50" y="50" className="lr-marker">L (좌측)</text>
            <text x="380" y="50" className="lr-marker">R (우측)</text>

            <g data-view="posterior">
              {renderPath("ellipse", { cx: 250, cy: 70, rx: 40, ry: 55, "data-name": "머리 뒤통수" })}
              {renderPath("rect", { x: 247, y: 110, width: 6, height: 35, rx: 3, "data-name": "경추" })}
              {renderPath("rect", { x: 247, y: 150, width: 6, height: 170, rx: 3, "data-name": "흉추" })}
              {renderPath("rect", { x: 247, y: 325, width: 6, height: 50, rx: 3, "data-name": "요추" })}
              {renderPath("polygon", { points: "250,380 242,385 250,420 258,385", "data-name": "천골" })}
              {renderPath("rect", { x: 225, y: 110, width: 20, height: 20, rx: 4, className: "muscle-deep", "data-name": "좌측 후두하근 (심부)" })}
              {renderPath("rect", { x: 255, y: 110, width: 20, height: 20, rx: 4, className: "muscle-deep", "data-name": "우측 후두하근 (심부)" })}
              {renderPath("polygon", { points: "245,135 225,135 230,160 245,160", className: "muscle-deep", "data-name": "좌측 목 근육" })}
              {renderPath("polygon", { points: "255,135 275,135 270,160 255,160", className: "muscle-deep", "data-name": "우측 목 근육" })}
              {renderPath("polygon", { points: "245,145 200,155 170,165 245,185", "data-name": "좌측 상부승모근" })}
              {renderPath("polygon", { points: "255,145 300,155 330,165 255,185", "data-name": "우측 상부승모근" })}
              {renderPath("circle", { cx: 195, cy: 165, r: 10, "data-name": "좌측 견갑골 상각" })}
              {renderPath("polygon", { points: "215,170 220,230 195,230 190,170", "data-name": "좌측 견갑골 내측연" })}
              {renderPath("circle", { cx: 205, cy: 240, r: 10, "data-name": "좌측 견갑골 하각" })}
              {renderPath("polygon", { points: "190,165 155,170 165,185 195,180", "data-name": "좌측 극상근" })}
              {renderPath("polygon", { points: "195,180 160,190 175,230 195,230", "data-name": "좌측 극하근" })}
              {renderPath("circle", { cx: 305, cy: 165, r: 10, "data-name": "우측 견갑골 상각" })}
              {renderPath("polygon", { points: "285,170 280,230 305,230 310,170", "data-name": "우측 견갑골 내측연" })}
              {renderPath("circle", { cx: 295, cy: 240, r: 10, "data-name": "우측 견갑골 하각" })}
              {renderPath("polygon", { points: "310,165 345,170 335,185 305,180", "data-name": "우측 극상근" })}
              {renderPath("polygon", { points: "305,180 340,190 325,230 305,230", "data-name": "우측 극하근" })}
              {renderPath("polygon", { points: "160,165 140,180 150,230 170,190", "data-name": "좌측 후면 삼각근" })}
              {renderPath("polygon", { points: "340,165 360,180 350,230 330,190", "data-name": "우측 후면 삼각근" })}
              {renderPath("polygon", { points: "150,230 120,330 150,330 170,230", "data-name": "좌측 삼두근" })}
              {renderPath("polygon", { points: "350,230 380,330 350,330 330,230", "data-name": "우측 삼두근" })}
              {renderPath("circle", { cx: 120, cy: 335, r: 10, "data-name": "좌측 가쪽 상과" })}
              {renderPath("circle", { cx: 380, cy: 335, r: 10, "data-name": "우측 가쪽 상과" })}
              {renderPath("polygon", { points: "150,340 130,440 150,440 160,340", "data-name": "좌측 안쪽 전완" })}
              {renderPath("polygon", { points: "120,340 100,440 130,440 140,340", "data-name": "좌측 가쪽 전완" })}
              {renderPath("polygon", { points: "350,340 370,440 350,440 340,340", "data-name": "우측 안쪽 전완" })}
              {renderPath("polygon", { points: "380,340 400,440 370,440 360,340", "data-name": "우측 가쪽 전완" })}
              {renderPath("polygon", { points: "100,450 80,520 120,520 130,450", "data-name": "좌측 손등" })}
              {renderPath("polygon", { points: "400,450 420,520 380,520 370,450", "data-name": "우측 손등" })}
              {renderPath("polygon", { points: "245,190 205,240 165,290 245,340", "data-name": "좌측 광배근" })}
              {renderPath("polygon", { points: "255,190 295,240 335,290 255,340", "data-name": "우측 광배근" })}
              {renderPath("rect", { x: 230, y: 190, width: 14, height: 135, rx: 4, className: "muscle-deep", "data-name": "좌측 흉요추 기립근" })}
              {renderPath("rect", { x: 256, y: 190, width: 14, height: 135, rx: 4, className: "muscle-deep", "data-name": "우측 흉요추 기립근" })}
              {renderPath("polygon", { points: "245,330 215,335 220,370 245,370", className: "muscle-deep", "data-name": "좌측 요방형근 (심부)" })}
              {renderPath("polygon", { points: "255,330 285,335 280,370 255,370", className: "muscle-deep", "data-name": "우측 요방형근 (심부)" })}
              {renderPath("circle", { cx: 225, cy: 380, r: 10, "data-name": "좌측 PSIS" })}
              {renderPath("circle", { cx: 275, cy: 380, r: 10, "data-name": "우측 PSIS" })}
              {renderPath("polygon", { points: "215,370 170,390 185,420 220,395", "data-name": "좌측 중둔근" })}
              {renderPath("polygon", { points: "285,370 330,390 315,420 280,395", "data-name": "우측 중둔근" })}
              {renderPath("path", { d: "M 245,385 L 210,395 L 170,460 L 245,475 Z M 215,420 A 12 12 0 1 0 215 444 A 12 12 0 1 0 215 420 Z", fillRule: "evenodd", "data-name": "좌측 대둔근" })}
              {renderPath("circle", { cx: 215, cy: 432, r: 12, className: "muscle-deep", "data-name": "좌측 이상근 (심부)" })}
              {renderPath("path", { d: "M 255,385 L 290,395 L 330,460 L 255,475 Z M 285,420 A 12 12 0 1 0 285 444 A 12 12 0 1 0 285 420 Z", fillRule: "evenodd", "data-name": "우측 대둔근" })}
              {renderPath("circle", { cx: 285, cy: 432, r: 12, className: "muscle-deep", "data-name": "우측 이상근 (심부)" })}
              {renderPath("polygon", { points: "242,480 210,480 220,660 238,660", "data-name": "좌측 안쪽 햄스트링" })}
              {renderPath("polygon", { points: "205,480 175,480 195,660 215,660", "data-name": "좌측 가쪽 햄스트링" })}
              {renderPath("polygon", { points: "258,480 290,480 280,660 262,660", "data-name": "우측 안쪽 햄스트링" })}
              {renderPath("polygon", { points: "295,480 325,480 305,660 285,660", "data-name": "우측 가쪽 햄스트링" })}
              {renderPath("ellipse", { cx: 220, cy: 675, rx: 18, ry: 12, className: "muscle-deep", "data-name": "좌측 오금" })}
              {renderPath("ellipse", { cx: 280, cy: 675, rx: 18, ry: 12, className: "muscle-deep", "data-name": "우측 오금" })}
              {renderPath("polygon", { points: "238,690 220,690 215,800 230,800", "data-name": "좌측 안쪽 종아리" })}
              {renderPath("polygon", { points: "215,690 190,690 205,800 210,800", "data-name": "좌측 가쪽 종아리" })}
              {renderPath("polygon", { points: "262,690 280,690 285,800 270,800", "data-name": "우측 안쪽 종아리" })}
              {renderPath("polygon", { points: "285,690 310,690 295,800 290,800", "data-name": "우측 가쪽 종아리" })}
              {renderPath("polygon", { points: "225,805 210,805 210,860 225,860", "data-name": "좌측 아킬레스건" })}
              {renderPath("polygon", { points: "275,805 290,805 290,860 275,860", "data-name": "우측 아킬레스건" })}
              {renderPath("polygon", { points: "230,870 205,870 200,890 235,890", "data-name": "좌측 발뒤꿈치" })}
              {renderPath("polygon", { points: "235,890 200,890 195,930 240,930", "data-name": "좌측 앞발바닥" })}
              {renderPath("polygon", { points: "270,870 295,870 300,890 265,890", "data-name": "우측 발뒤꿈치" })}
              {renderPath("polygon", { points: "265,890 300,890 305,930 260,930", "data-name": "우측 앞발바닥" })}
            </g>
          </svg>
        </div>
      </div>

      {/* Summary Chips */}
      <div className="w-full mt-4 bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="text-sm font-bold text-slate-800 mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-indigo-600" />
            기록된 부위 ({records.length})
          </div>
          {records.length > 0 && (
            <button
              type="button"
              onClick={() => setAreas({})}
              className="text-xs text-slate-400 hover:text-red-500 underline underline-offset-2"
            >
              전체 초기화
            </button>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          {records.length === 0 ? (
            <span className="text-sm text-slate-400 italic">선택된 통증 부위가 없습니다.</span>
          ) : (
            records.map(([name, level]) => {
              const color = SEVERITY_COLOR[level];
              return (
                <div key={name} className="flex items-center justify-between bg-slate-50 border border-slate-100 px-3 py-2 rounded-lg text-sm">
                  <div className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full border ${color.tw}`}></span>
                    <span className="font-semibold text-slate-700">{name}</span>
                    <span className="text-xs text-slate-500">({PAIN_LABEL[level]})</span>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => removeArea(name)} 
                    className="text-slate-400 hover:text-red-500 transition-colors p-1"
                    aria-label={`${name} 선택 취소`}
                  >
                    <X size={16} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
      {/* Magnifier Overlay */}
      {magnify?.active && (
        <>
          <div 
            id="magnifier-backdrop"
            className="fixed inset-0 z-[150]" 
            onClick={() => setMagnify(null)}
            onTouchEnd={(e) => { e.preventDefault(); setMagnify(null); }}
          />
          <div 
            id="magnifier-overlay"
            className="fixed z-[160] w-48 h-48 rounded-full border-4 border-indigo-500 bg-white shadow-[0_10px_40px_rgba(0,0,0,0.3)] flex items-center justify-center overflow-hidden pointer-events-auto select-none"
            style={{ 
              left: magnify.x, 
              top: magnify.y - 140, // offset above finger
              transform: 'translate(-50%, -50%)',
              touchAction: 'none'
            }}
            onClick={() => {
              if (magnify.targetName) cyclePainLevel(magnify.targetName);
              if (navigator.vibrate) navigator.vibrate(15);
            }}
          >
            {/* Center crosshair */}
            <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center opacity-30">
              <div className="w-4 h-4 border-2 border-indigo-500 rounded-full" />
              <div className="absolute w-full h-[1px] bg-indigo-500" />
              <div className="absolute h-full w-[1px] bg-indigo-500" />
            </div>

            <div 
              className="absolute pointer-events-none"
              style={{
                width: magnify.svgRect?.width,
                height: magnify.svgRect?.height,
                left: magnify.svgRect ? 96 - (magnify.x - magnify.svgRect.left) * 2.5 : 0,
                top: magnify.svgRect ? 96 - (magnify.y - magnify.svgRect.top) * 2.5 : 0,
                transform: 'scale(2.5)',
                transformOrigin: 'top left'
              }}
            >
              <svg viewBox="0 0 500 950" className="w-full h-full drop-shadow-sm" aria-hidden="true">
                {magnify.view === 'anterior' ? (
                  <g>
                    {renderPath("ellipse", { cx: 250, cy: 70, rx: 40, ry: 55, "data-name": "머리 및 안면" })}
                    {renderPath("circle", { cx: 220, cy: 90, r: 12, "data-name": "우측 턱관절 (TMJ)" })}
                    {renderPath("circle", { cx: 280, cy: 90, r: 12, "data-name": "좌측 턱관절 (TMJ)" })}
                    {renderPath("polygon", { points: "215,105 225,105 245,145 235,145", "data-name": "우측 흉쇄유돌근" })}
                    {renderPath("polygon", { points: "275,105 285,105 265,145 255,145", "data-name": "좌측 흉쇄유돌근" })}
                    {renderPath("rect", { x: 246, y: 150, width: 8, height: 70, rx: 4, "data-name": "흉골" })}
                    {renderPath("polygon", { points: "246,150 180,150 160,220 246,230", "data-name": "우측 대흉근" })}
                    {renderPath("polygon", { points: "254,150 320,150 340,220 254,230", "data-name": "좌측 대흉근" })}
                    {renderPath("polygon", { points: "225,155 185,175 200,205", className: "muscle-deep", "data-name": "우측 소흉근 (심부)" })}
                    {renderPath("polygon", { points: "275,155 315,175 300,205", className: "muscle-deep", "data-name": "좌측 소흉근 (심부)" })}
                    {renderPath("polygon", { points: "180,150 160,160 145,230 160,220", "data-name": "우측 전면 삼각근" })}
                    {renderPath("polygon", { points: "160,160 140,170 130,240 145,230", "data-name": "우측 측면 삼각근" })}
                    {renderPath("polygon", { points: "320,150 340,160 355,230 340,220", "data-name": "좌측 전면 삼각근" })}
                    {renderPath("polygon", { points: "340,160 360,170 370,240 355,230", "data-name": "좌측 측면 삼각근" })}
                    {renderPath("polygon", { points: "130,240 110,330 140,330 160,220", "data-name": "우측 이두근" })}
                    {renderPath("polygon", { points: "370,240 390,330 360,330 340,220", "data-name": "좌측 이두근" })}
                    {renderPath("circle", { cx: 145, cy: 335, r: 10, "data-name": "우측 안쪽 상과" })}
                    {renderPath("circle", { cx: 355, cy: 335, r: 10, "data-name": "좌측 안쪽 상과" })}
                    {renderPath("polygon", { points: "140,340 120,440 140,440 150,340", "data-name": "우측 안쪽 전완" })}
                    {renderPath("polygon", { points: "110,340 90,440 120,440 130,340", "data-name": "우측 가쪽 전완" })}
                    {renderPath("polygon", { points: "360,340 380,440 360,440 350,340", "data-name": "좌측 안쪽 전완" })}
                    {renderPath("polygon", { points: "390,340 410,440 380,440 370,340", "data-name": "좌측 가쪽 전완" })}
                    {renderPath("polygon", { points: "90,450 70,520 110,520 120,450", "data-name": "우측 손" })}
                    {renderPath("polygon", { points: "410,450 430,520 390,520 380,450", "data-name": "좌측 손" })}
                    {renderPath("rect", { x: 215, y: 235, width: 33, height: 35, rx: 5, "data-name": "복직근" })}
                    {renderPath("rect", { x: 252, y: 235, width: 33, height: 35, rx: 5, "data-name": "복직근" })}
                    {renderPath("rect", { x: 218, y: 275, width: 30, height: 40, rx: 5, "data-name": "복직근" })}
                    {renderPath("rect", { x: 252, y: 275, width: 30, height: 40, rx: 5, "data-name": "복직근" })}
                    {renderPath("rect", { x: 222, y: 320, width: 26, height: 45, rx: 5, "data-name": "복직근" })}
                    {renderPath("rect", { x: 252, y: 320, width: 26, height: 45, rx: 5, "data-name": "복직근" })}
                    {renderPath("polygon", { points: "185,230 155,240 170,280 210,270", "data-name": "우측 전거근" })}
                    {renderPath("polygon", { points: "315,230 345,240 330,280 290,270", "data-name": "좌측 전거근" })}
                    {renderPath("polygon", { points: "210,275 165,285 180,360 220,360", "data-name": "우측 복사근" })}
                    {renderPath("polygon", { points: "290,275 335,285 320,360 280,360", "data-name": "좌측 복사근" })}
                    {renderPath("polygon", { points: "248,365 230,365 235,440 248,430", className: "muscle-deep", "data-name": "우측 장요근 (심부)" })}
                    {renderPath("polygon", { points: "252,365 270,365 265,440 252,430", className: "muscle-deep", "data-name": "좌측 장요근 (심부)" })}
                    {renderPath("circle", { cx: 195, cy: 380, r: 12, "data-name": "우측 골반뼈 (ASIS)" })}
                    {renderPath("circle", { cx: 305, cy: 380, r: 12, "data-name": "좌측 골반뼈 (ASIS)" })}
                    {renderPath("polygon", { points: "195,375 190,385 235,445 240,435", "data-name": "우측 서혜부" })}
                    {renderPath("polygon", { points: "305,375 310,385 265,445 260,435", "data-name": "좌측 서혜부" })}
                    {renderPath("polygon", { points: "245,435 195,400 160,480 180,650 240,650", "data-name": "우측 대퇴사두근" })}
                    {renderPath("polygon", { points: "255,435 305,400 340,480 320,650 260,650", "data-name": "좌측 대퇴사두근" })}
                    {renderPath("polygon", { points: "160,480 145,530 170,650 180,650", "data-name": "우측 장경인대" })}
                    {renderPath("polygon", { points: "340,480 355,530 330,650 320,650", "data-name": "좌측 장경인대" })}
                    {renderPath("circle", { cx: 210, cy: 675, r: 22, "data-name": "우측 무릎뼈 (Patella)" })}
                    {renderPath("circle", { cx: 290, cy: 675, r: 22, "data-name": "좌측 무릎뼈 (Patella)" })}
                    {renderPath("polygon", { points: "210,700 205,700 195,830 205,830", "data-name": "우측 정강이뼈" })}
                    {renderPath("polygon", { points: "205,700 170,700 185,830 195,830", "data-name": "우측 전경골근" })}
                    {renderPath("polygon", { points: "235,700 215,700 205,830 220,830", "data-name": "우측 안쪽 종아리" })}
                    {renderPath("polygon", { points: "290,700 295,700 305,830 295,830", "data-name": "좌측 정강이뼈" })}
                    {renderPath("polygon", { points: "295,700 330,700 315,830 305,830", "data-name": "좌측 전경골근" })}
                    {renderPath("polygon", { points: "265,700 285,700 295,830 280,830", "data-name": "좌측 안쪽 종아리" })}
                    {renderPath("polygon", { points: "215,845 180,845 185,920 230,920", "data-name": "우측 발등" })}
                    {renderPath("polygon", { points: "285,845 320,845 315,920 270,920", "data-name": "좌측 발등" })}
                  </g>
                ) : (
                  <g>
                    {renderPath("ellipse", { cx: 250, cy: 70, rx: 40, ry: 55, "data-name": "머리 뒤통수" })}
                    {renderPath("rect", { x: 247, y: 110, width: 6, height: 35, rx: 3, "data-name": "경추" })}
                    {renderPath("rect", { x: 247, y: 150, width: 6, height: 170, rx: 3, "data-name": "흉추" })}
                    {renderPath("rect", { x: 247, y: 325, width: 6, height: 50, rx: 3, "data-name": "요추" })}
                    {renderPath("polygon", { points: "250,380 242,385 250,420 258,385", "data-name": "천골" })}
                    {renderPath("rect", { x: 225, y: 110, width: 20, height: 20, rx: 4, className: "muscle-deep", "data-name": "좌측 후두하근 (심부)" })}
                    {renderPath("rect", { x: 255, y: 110, width: 20, height: 20, rx: 4, className: "muscle-deep", "data-name": "우측 후두하근 (심부)" })}
                    {renderPath("polygon", { points: "245,135 225,135 230,160 245,160", className: "muscle-deep", "data-name": "좌측 목 근육" })}
                    {renderPath("polygon", { points: "255,135 275,135 270,160 255,160", className: "muscle-deep", "data-name": "우측 목 근육" })}
                    {renderPath("polygon", { points: "245,145 200,155 170,165 245,185", "data-name": "좌측 상부승모근" })}
                    {renderPath("polygon", { points: "255,145 300,155 330,165 255,185", "data-name": "우측 상부승모근" })}
                    {renderPath("circle", { cx: 195, cy: 165, r: 10, "data-name": "좌측 견갑골 상각" })}
                    {renderPath("polygon", { points: "215,170 220,230 195,230 190,170", "data-name": "좌측 견갑골 내측연" })}
                    {renderPath("circle", { cx: 205, cy: 240, r: 10, "data-name": "좌측 견갑골 하각" })}
                    {renderPath("polygon", { points: "190,165 155,170 165,185 195,180", "data-name": "좌측 극상근" })}
                    {renderPath("polygon", { points: "195,180 160,190 175,230 195,230", "data-name": "좌측 극하근" })}
                    {renderPath("circle", { cx: 305, cy: 165, r: 10, "data-name": "우측 견갑골 상각" })}
                    {renderPath("polygon", { points: "285,170 280,230 305,230 310,170", "data-name": "우측 견갑골 내측연" })}
                    {renderPath("circle", { cx: 295, cy: 240, r: 10, "data-name": "우측 견갑골 하각" })}
                    {renderPath("polygon", { points: "310,165 345,170 335,185 305,180", "data-name": "우측 극상근" })}
                    {renderPath("polygon", { points: "305,180 340,190 325,230 305,230", "data-name": "우측 극하근" })}
                    {renderPath("polygon", { points: "160,165 140,180 150,230 170,190", "data-name": "좌측 후면 삼각근" })}
                    {renderPath("polygon", { points: "340,165 360,180 350,230 330,190", "data-name": "우측 후면 삼각근" })}
                    {renderPath("polygon", { points: "150,230 120,330 150,330 170,230", "data-name": "좌측 삼두근" })}
                    {renderPath("polygon", { points: "350,230 380,330 350,330 330,230", "data-name": "우측 삼두근" })}
                    {renderPath("circle", { cx: 120, cy: 335, r: 10, "data-name": "좌측 가쪽 상과" })}
                    {renderPath("circle", { cx: 380, cy: 335, r: 10, "data-name": "우측 가쪽 상과" })}
                    {renderPath("polygon", { points: "150,340 130,440 150,440 160,340", "data-name": "좌측 안쪽 전완" })}
                    {renderPath("polygon", { points: "120,340 100,440 130,440 140,340", "data-name": "좌측 가쪽 전완" })}
                    {renderPath("polygon", { points: "350,340 370,440 350,440 340,340", "data-name": "우측 안쪽 전완" })}
                    {renderPath("polygon", { points: "380,340 400,440 370,440 360,340", "data-name": "우측 가쪽 전완" })}
                    {renderPath("polygon", { points: "100,450 80,520 120,520 130,450", "data-name": "좌측 손등" })}
                    {renderPath("polygon", { points: "400,450 420,520 380,520 370,450", "data-name": "우측 손등" })}
                    {renderPath("polygon", { points: "245,190 205,240 165,290 245,340", "data-name": "좌측 광배근" })}
                    {renderPath("polygon", { points: "255,190 295,240 335,290 255,340", "data-name": "우측 광배근" })}
                    {renderPath("rect", { x: 230, y: 190, width: 14, height: 135, rx: 4, className: "muscle-deep", "data-name": "좌측 흉요추 기립근" })}
                    {renderPath("rect", { x: 256, y: 190, width: 14, height: 135, rx: 4, className: "muscle-deep", "data-name": "우측 흉요추 기립근" })}
                    {renderPath("polygon", { points: "245,330 215,335 220,370 245,370", className: "muscle-deep", "data-name": "좌측 요방형근 (심부)" })}
                    {renderPath("polygon", { points: "255,330 285,335 280,370 255,370", className: "muscle-deep", "data-name": "우측 요방형근 (심부)" })}
                    {renderPath("circle", { cx: 225, cy: 380, r: 10, "data-name": "좌측 PSIS" })}
                    {renderPath("circle", { cx: 275, cy: 380, r: 10, "data-name": "우측 PSIS" })}
                    {renderPath("polygon", { points: "215,370 170,390 185,420 220,395", "data-name": "좌측 중둔근" })}
                    {renderPath("polygon", { points: "285,370 330,390 315,420 280,395", "data-name": "우측 중둔근" })}
                    {renderPath("path", { d: "M 245,385 L 210,395 L 170,460 L 245,475 Z M 215,420 A 12 12 0 1 0 215 444 A 12 12 0 1 0 215 420 Z", fillRule: "evenodd", "data-name": "좌측 대둔근" })}
                    {renderPath("circle", { cx: 215, cy: 432, r: 12, className: "muscle-deep", "data-name": "좌측 이상근 (심부)" })}
                    {renderPath("path", { d: "M 255,385 L 290,395 L 330,460 L 255,475 Z M 285,420 A 12 12 0 1 0 285 444 A 12 12 0 1 0 285 420 Z", fillRule: "evenodd", "data-name": "우측 대둔근" })}
                    {renderPath("circle", { cx: 285, cy: 432, r: 12, className: "muscle-deep", "data-name": "우측 이상근 (심부)" })}
                    {renderPath("polygon", { points: "242,480 210,480 220,660 238,660", "data-name": "좌측 안쪽 햄스트링" })}
                    {renderPath("polygon", { points: "205,480 175,480 195,660 215,660", "data-name": "좌측 가쪽 햄스트링" })}
                    {renderPath("polygon", { points: "258,480 290,480 280,660 262,660", "data-name": "우측 안쪽 햄스트링" })}
                    {renderPath("polygon", { points: "295,480 325,480 305,660 285,660", "data-name": "우측 가쪽 햄스트링" })}
                    {renderPath("ellipse", { cx: 220, cy: 675, rx: 18, ry: 12, className: "muscle-deep", "data-name": "좌측 오금" })}
                    {renderPath("ellipse", { cx: 280, cy: 675, rx: 18, ry: 12, className: "muscle-deep", "data-name": "우측 오금" })}
                    {renderPath("polygon", { points: "238,690 220,690 215,800 230,800", "data-name": "좌측 안쪽 종아리" })}
                    {renderPath("polygon", { points: "215,690 190,690 205,800 210,800", "data-name": "좌측 가쪽 종아리" })}
                    {renderPath("polygon", { points: "262,690 280,690 285,800 270,800", "data-name": "우측 안쪽 종아리" })}
                    {renderPath("polygon", { points: "285,690 310,690 295,800 290,800", "data-name": "우측 가쪽 종아리" })}
                    {renderPath("polygon", { points: "225,805 210,805 210,860 225,860", "data-name": "좌측 아킬레스건" })}
                    {renderPath("polygon", { points: "275,805 290,805 290,860 275,860", "data-name": "우측 아킬레스건" })}
                    {renderPath("polygon", { points: "230,870 205,870 200,890 235,890", "data-name": "좌측 발뒤꿈치" })}
                    {renderPath("polygon", { points: "235,890 200,890 195,930 240,930", "data-name": "좌측 앞발바닥" })}
                    {renderPath("polygon", { points: "270,870 295,870 300,890 265,890", "data-name": "우측 발뒤꿈치" })}
                    {renderPath("polygon", { points: "265,890 300,890 305,930 260,930", "data-name": "우측 앞발바닥" })}
                  </g>
                )}
              </svg>
            </div>

            {/* Target Label overlay */}
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-slate-900/90 text-white px-4 py-1.5 rounded-full text-sm whitespace-nowrap font-bold pointer-events-none shadow-lg border border-slate-700">
              {magnify.targetName || "부위를 선택하세요"}
              {magnify.targetName && areas[magnify.targetName] ? (
                <span className="ml-1 text-yellow-400">
                  {`(${PAIN_LABEL[areas[magnify.targetName]]})`}
                </span>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
