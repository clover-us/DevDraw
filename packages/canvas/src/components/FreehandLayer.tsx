import React, { useCallback, useRef, useState } from 'react';
import { useReactFlow, useViewport } from '@xyflow/react';
import { Eraser, PenTool, X } from 'lucide-react';
import type { FreehandStroke } from '@devdraw/core';

export interface FreehandLayerProps {
  strokes: FreehandStroke[];
  active: boolean;
  theme: 'dark' | 'light';
  onAddStroke: (stroke: FreehandStroke) => void;
  onClearStrokes: () => void;
  onExitDrawMode: () => void;
}

const PEN_COLORS = [
  { id: 'violet', value: '#a78bfa', label: '电光紫' },
  { id: 'emerald', value: '#34d399', label: '薄荷绿' },
  { id: 'amber', value: '#fbbf24', label: '琥珀金' },
  { id: 'sky', value: '#38bdf8', label: '冰川青' },
  { id: 'rose', value: '#fb7185', label: '警告红' },
];

const PEN_WIDTHS = [
  { label: '细', value: 2 },
  { label: '中', value: 3.5 },
  { label: '粗', value: 5.5 },
];

/**
 * Convert world-space polyline points into a smooth quadratic Bezier SVG path.
 */
function pointsToSmoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x} ${p.y} L ${p.x + 0.1} ${p.y + 0.1}`;
  }
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    d += ` Q ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
  return d;
}

export const FreehandLayer: React.FC<FreehandLayerProps> = ({
  strokes,
  active,
  theme,
  onAddStroke,
  onClearStrokes,
  onExitDrawMode,
}) => {
  const { x: vpX, y: vpY, zoom } = useViewport();
  const { screenToFlowPosition } = useReactFlow();

  const [penColor, setPenColor] = useState('#34d399');
  const [penWidth, setPenWidth] = useState(3);
  const [draftPoints, setDraftPoints] = useState<Array<{ x: number; y: number }> | null>(null);
  const drawingRef = useRef(false);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!active || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      const pt = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      drawingRef.current = true;
      setDraftPoints([{ x: Math.round(pt.x * 10) / 10, y: Math.round(pt.y * 10) / 10 }]);
    },
    [active, screenToFlowPosition]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!drawingRef.current) return;
      e.preventDefault();
      const pt = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const nx = Math.round(pt.x * 10) / 10;
      const ny = Math.round(pt.y * 10) / 10;
      setDraftPoints((prev) => {
        if (!prev || prev.length === 0) return [{ x: nx, y: ny }];
        const last = prev[prev.length - 1];
        // Filter sub-pixel jitter in world space
        if (Math.hypot(nx - last.x, ny - last.y) < 2) return prev;
        return [...prev, { x: nx, y: ny }];
      });
    },
    [screenToFlowPosition]
  );

  const finishStroke = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      setDraftPoints((prev) => {
        if (prev && prev.length >= 2) {
          onAddStroke({
            id: `fh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
            points: prev,
            color: penColor,
            width: penWidth,
          });
        }
        return null;
      });
    },
    [onAddStroke, penColor, penWidth]
  );

  const isLight = theme === 'light';

  return (
    <>
      {/* World-space SVG layer synced 1:1 with React Flow viewport pan & zoom */}
      <svg
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishStroke}
        onPointerCancel={finishStroke}
        className={`absolute inset-0 w-full h-full z-20 ${
          active ? 'pointer-events-auto cursor-crosshair touch-none' : 'pointer-events-none'
        }`}
      >
        <g transform={`translate(${vpX}, ${vpY}) scale(${zoom})`}>
          {strokes.map((s) => (
            <path
              key={s.id}
              d={pointsToSmoothPath(s.points)}
              fill="none"
              stroke={s.color}
              strokeWidth={s.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.92}
            />
          ))}

          {draftPoints && draftPoints.length > 0 && (
            <path
              d={pointsToSmoothPath(draftPoints)}
              fill="none"
              stroke={penColor}
              strokeWidth={penWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.95}
            />
          )}
        </g>
      </svg>

      {/* Floating Pen Controls Pill when Freehand Mode is active */}
      {active && (
        <div
          className={`absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-1.5 rounded-full border backdrop-blur-xl shadow-2xl text-xs select-none ${
            isLight
              ? 'bg-white/95 border-slate-200 text-slate-700'
              : 'bg-[#171220]/94 border-emerald-400/35 text-zinc-200'
          }`}
        >
          <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-emerald-400">
            <PenTool className="w-3.5 h-3.5" />
            自由落绘
          </span>

          <div className="h-3.5 w-px bg-white/10" />

          <div className="flex items-center gap-1.5">
            {PEN_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                title={c.label}
                onClick={() => setPenColor(c.value)}
                style={{ backgroundColor: c.value }}
                className={`w-4 h-4 rounded-full transition-transform ${
                  penColor === c.value ? 'scale-125 ring-2 ring-white/80' : 'opacity-75 hover:opacity-100'
                }`}
              />
            ))}
          </div>

          <div className="h-3.5 w-px bg-white/10" />

          <div className="flex items-center gap-1">
            {PEN_WIDTHS.map((w) => (
              <button
                key={w.label}
                type="button"
                onClick={() => setPenWidth(w.value)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                  penWidth === w.value
                    ? 'bg-violet-500/25 text-violet-300'
                    : 'text-zinc-400 hover:bg-white/10'
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>

          <div className="h-3.5 w-px bg-white/10" />

          <button
            type="button"
            onClick={onClearStrokes}
            disabled={strokes.length === 0}
            title="清除当前画布手绘笔迹"
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] text-amber-300 hover:bg-amber-500/15 disabled:opacity-35"
          >
            <Eraser className="w-3 h-3" />
            <span>清空 ({strokes.length})</span>
          </button>

          <button
            type="button"
            onClick={onExitDrawMode}
            title="退出自由落绘 (Esc / V)"
            className="p-1 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </>
  );
};
