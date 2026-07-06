"use client";

import React, { useState, useRef, useEffect } from "react";
import { CheckCircle2, X } from "lucide-react";
import {
  smoothPath,
  MIRROR_TRANSFORM,
  ANT_SILHOUETTE,
  ANT_CENTER,
  ANT_PAIRED,
  POST_SILHOUETTE,
  POST_CENTER,
  POST_PAIRED,
  type CenterShape,
  type PairedShape,
  type DiagramShape,
} from "./bodyDiagramShapes";

export type BodyDiagramProps = {
  painAreas?: Record<string, number>;
  setPainAreas?: (areas: Record<string, number>) => void;
};

const PAIN_LABEL: Record<number, string> = { 1: "경도(Mild)", 2: "중등도(Moderate)", 3: "중증(Severe)" };

const SEVERITY_COLOR: Record<number, { fill: string; stroke: string; tw: string }> = {
  1: { fill: "#fde047", stroke: "#ca8a04", tw: "bg-yellow-300 border-yellow-600" },
  2: { fill: "#f97316", stroke: "#c2410c", tw: "bg-orange-500 border-orange-700" },
  3: { fill: "#ef4444", stroke: "#991b1b", tw: "bg-red-500 border-red-800" },
};

/** 실루엣 path (모듈 로드 시 1회 계산) — 반개방 경로를 Z로 정중선 마감 */
const ANT_SIL_D = smoothPath(ANT_SILHOUETTE, false) + " Z";
const POST_SIL_D = smoothPath(POST_SILHOUETTE, false) + " Z";

type ShapeVariant = "muscle" | "muscle-deep" | "bone";

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
  useEffect(() => {
    magnifyRef.current = magnify;
  }, [magnify]);

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

  const cyclePainLevel = (name: string) => {
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

  const handlePointerOut = () => {
    if (!magnify?.active) {
      setHoveredNode(null);
    }
  };

  const getStyleClass = (name: string, variant: ShapeVariant) => {
    const level = areas[name] || 0;
    if (level > 0) return `${variant} pain-${level}`;
    return variant;
  };

  const renderShape = (shape: DiagramShape, name: string, key: string) => {
    const variant: ShapeVariant = shape.deep ? "muscle-deep" : shape.bone ? "bone" : "muscle";
    const common = {
      key,
      "data-name": name,
      className: getStyleClass(name, variant),
      tabIndex: 0,
      role: "button",
      "aria-pressed": (areas[name] || 0) > 0,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          cyclePainLevel(name);
        }
      },
    };
    const title = <title key="title">{name}</title>;
    if (shape.kind === "circle") {
      return React.createElement("circle", { ...common, cx: shape.cx, cy: shape.cy, r: shape.r }, title);
    }
    return React.createElement("path", { ...common, d: smoothPath(shape.pts) }, title);
  };

  /**
   * 한쪽 절반만 저작된 도형을 direct + 미러 그룹으로 렌더링해 전신을 구성.
   * 전면: direct = 우측(화면 왼쪽) / 후면: direct = 좌측(화면 왼쪽)
   */
  const renderBodyView = (
    view: "anterior" | "posterior",
    silD: string,
    center: CenterShape[],
    paired: PairedShape[],
    directSide: string,
    mirrorSide: string
  ) => (
    <g data-view={view}>
      <path d={silD} className="silhouette" />
      <path d={silD} className="silhouette" transform={MIRROR_TRANSFORM} />
      <g>{paired.map((shape, i) => renderShape(shape, `${directSide} ${shape.base}`, `d-${i}`))}</g>
      <g transform={MIRROR_TRANSFORM}>
        {paired.map((shape, i) => renderShape(shape, `${mirrorSide} ${shape.base}`, `m-${i}`))}
      </g>
      {center.map((shape, i) => renderShape(shape, shape.name, `c-${i}`))}
    </g>
  );

  const renderAnterior = () =>
    renderBodyView("anterior", ANT_SIL_D, ANT_CENTER, ANT_PAIRED, "우측", "좌측");

  const renderPosterior = () =>
    renderBodyView("posterior", POST_SIL_D, POST_CENTER, POST_PAIRED, "좌측", "우측");

  const records = Object.entries(areas)
    .filter(([, level]) => level > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="w-full flex flex-col items-center">
      <style>{`
        .silhouette { fill: #f1e8dd; stroke: none; pointer-events: none; }
        .muscle { fill: #e7d6c4; stroke: #a08872; stroke-width: 1.6; transition: all 0.15s ease; cursor: pointer; outline: none; -webkit-tap-highlight-color: transparent; }
        .muscle-deep { fill: rgba(196, 174, 152, 0.45); stroke: #8a715c; stroke-width: 1.4; stroke-dasharray: 4, 3; transition: all 0.15s ease; cursor: pointer; outline: none; -webkit-tap-highlight-color: transparent; }
        .bone { fill: #f5efe6; stroke: #b3a18c; stroke-width: 1.4; transition: all 0.15s ease; cursor: pointer; outline: none; -webkit-tap-highlight-color: transparent; }

        @media (hover: hover) {
          .muscle:hover, .muscle-deep:hover, .bone:hover { stroke-width: 2.8; }
          .muscle:hover { fill: #dcc6ae; }
          .muscle-deep:hover { fill: rgba(196, 174, 152, 0.7); }
          .bone:hover { fill: #ece2d2; }
        }

        .muscle:focus-visible, .muscle-deep:focus-visible, .bone:focus-visible { outline: 3px solid #2563eb; outline-offset: 2px; }

        .muscle.pain-1, .muscle-deep.pain-1, .bone.pain-1 { fill: #fde047; stroke: #ca8a04; stroke-width: 3; stroke-dasharray: 0; }
        .muscle.pain-2, .muscle-deep.pain-2, .bone.pain-2 { fill: #f97316; stroke: #c2410c; stroke-width: 3.5; stroke-dasharray: 0; }
        .muscle.pain-3, .muscle-deep.pain-3, .bone.pain-3 { fill: #ef4444; stroke: #991b1b; stroke-width: 4; stroke-dasharray: 0; }

        .lr-marker { font-size: 14px; font-weight: bold; fill: #94a3b8; letter-spacing: 0.05em; pointer-events: none; }
      `}</style>

      {hoveredNode && (
        <div
          className="fixed bg-slate-900/95 dark:bg-slate-50/95 text-white dark:text-slate-900 px-3 py-1.5 rounded-lg text-sm font-medium pointer-events-none z-[100] shadow-md whitespace-nowrap"
          style={{ left: hoveredNode.x, top: hoveredNode.y - 30, transform: "translate(-50%, -100%)" }}
        >
          {hoveredNode.name} {hoveredNode.level > 0 && `(${PAIN_LABEL[hoveredNode.level]})`}
        </div>
      )}

      {/* Toolbar & Legend */}
      <div className="flex flex-col w-full mb-4 gap-3">
        <div className="flex justify-between items-center px-1">
          <p className="text-sm font-bold text-slate-500 dark:text-slate-400">📌 부위 클릭 (경도 ➔ 중등도 ➔ 중증 ➔ 취소)</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
          <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-sm bg-[#e7d6c4] border border-[#a08872]"></span> 정상</span>
          <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-sm bg-[#fde047] border border-[#ca8a04]"></span> 경도(1)</span>
          <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-sm bg-[#f97316] border border-[#c2410c]"></span> 중등도(2)</span>
          <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-sm bg-[#ef4444] border border-[#991b1b]"></span> 중증(3)</span>
          <span className="text-slate-400 dark:text-slate-500 ml-auto hidden sm:inline">· 점선 = 심부근육 · 밝은 톤 = 뼈</span>
        </div>
      </div>

      {/* Diagram Container */}
      <div 
        className="w-full grid grid-cols-1 md:grid-cols-2 gap-4 select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerOut={handlePointerOut}
        style={{ 
          touchAction: magnify?.active ? "none" : "auto",
          WebkitTouchCallout: "none",
          WebkitUserSelect: "none",
          userSelect: "none"
        }}
      >
        {/* Anterior View */}
        <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700 p-2 overflow-hidden flex flex-col items-center">
          <h2 className="absolute top-4 left-4 font-bold text-slate-300 dark:text-slate-600 tracking-widest uppercase text-xs">
            Anterior
          </h2>
          <svg ref={svgAntRef} viewBox="0 0 500 950" className="w-full h-auto mt-4 drop-shadow-sm select-none" aria-label="전면부 해부도">
            <line x1="250" y1="0" x2="250" y2="950" stroke="#f1f5f9" strokeWidth="2" strokeDasharray="8,8" />
            <text x="50" y="50" className="lr-marker">R (우측)</text>
            <text x="380" y="50" className="lr-marker">L (좌측)</text>

            {renderAnterior()}
          </svg>
        </div>

        {/* Posterior View */}
        <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700 p-2 overflow-hidden flex flex-col items-center">
          <h2 className="absolute top-4 left-4 font-bold text-slate-300 dark:text-slate-600 tracking-widest uppercase text-xs">
            Posterior
          </h2>
          <svg ref={svgPostRef} viewBox="0 0 500 950" className="w-full h-auto mt-4 drop-shadow-sm select-none" aria-label="후면부 해부도">
            <line x1="250" y1="0" x2="250" y2="950" stroke="#f1f5f9" strokeWidth="2" strokeDasharray="8,8" />
            <text x="50" y="50" className="lr-marker">L (좌측)</text>
            <text x="380" y="50" className="lr-marker">R (우측)</text>

            {renderPosterior()}
          </svg>
        </div>
      </div>

      {/* Summary Chips */}
      <div className="w-full mt-4 bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 p-4 shadow-sm">
        <div className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-indigo-600 dark:text-indigo-400" />
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
                <div key={name} className="flex items-center justify-between bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-gray-700 px-3 py-2 rounded-lg text-sm">
                  <div className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full border ${color.tw}`}></span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{name}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">({PAIN_LABEL[level]})</span>
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
            className="fixed z-[160] w-48 h-48 rounded-full border-4 border-indigo-500 bg-white dark:bg-gray-800 shadow-[0_10px_40px_rgba(0,0,0,0.3)] flex items-center justify-center overflow-hidden pointer-events-auto select-none"
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
                left: magnify.svgRect ? 96 - (magnify.x - magnify.svgRect.left) * 1.5 : 0,
                top: magnify.svgRect ? 96 - (magnify.y - magnify.svgRect.top) * 1.5 : 0,
                transform: 'scale(1.5)',
                transformOrigin: 'top left'
              }}
            >
              <svg viewBox="0 0 500 950" className="w-full h-full drop-shadow-sm" aria-hidden="true">
                {magnify.view === 'anterior' ? renderAnterior() : renderPosterior()}
              </svg>
            </div>

            {/* Target Label overlay */}
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-slate-900/90 dark:bg-slate-50/90 text-white dark:text-slate-900 px-4 py-1.5 rounded-full text-sm whitespace-nowrap font-bold pointer-events-none shadow-lg border border-slate-700 dark:border-slate-300">
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
