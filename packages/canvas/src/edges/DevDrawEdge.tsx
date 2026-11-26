import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  useReactFlow,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';
import type { EdgeWaypoint, RelationEdge } from '@devdraw/core';

export interface DevDrawFlowEdgeData extends Record<string, unknown> {
  relation: RelationEdge;
  theme: 'dark' | 'light';
  isSelected?: boolean;
  simulating?: boolean;
  flowState?: 'idle' | 'active' | 'dimmed';
  diffState?: 'added' | 'modified' | 'removed' | 'unchanged';
  isEditingLabel?: boolean;
  onSelectEdge?: (edgeId: string) => void;
  onOpenInspector?: (edgeId: string) => void;
  onCommitLabel?: (edgeId: string, nextLabel: string) => void;
  onCancelEditLabel?: () => void;
  onUpdateWaypoints?: (edgeId: string, waypoints: EdgeWaypoint[]) => void;
}

export type DevDrawFlowEdge = Edge<DevDrawFlowEdgeData, 'devdraw'>;

interface Point {
  x: number;
  y: number;
}

/**
 * Build a clean rounded-corner SVG path through [source, ...waypoints, target],
 * and return the optimal label anchor at the midpoint of the longest segment.
 */
function buildRoundedPolylinePath(
  points: Point[],
  cornerRadius = 10
): { path: string; labelX: number; labelY: number } {
  if (points.length < 2) {
    return { path: '', labelX: points[0]?.x ?? 0, labelY: points[0]?.y ?? 0 };
  }

  // Deduplicate near-identical consecutive points
  const pts: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = pts[pts.length - 1];
    if (Math.hypot(points[i].x - prev.x, points[i].y - prev.y) > 1.5) {
      pts.push(points[i]);
    }
  }
  if (pts.length < 2) {
    return { path: '', labelX: pts[0].x, labelY: pts[0].y };
  }

  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;

  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const next = pts[i + 1];

    const v1x = curr.x - prev.x;
    const v1y = curr.y - prev.y;
    const len1 = Math.hypot(v1x, v1y);

    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;
    const len2 = Math.hypot(v2x, v2y);

    if (len1 < 2 || len2 < 2) {
      d += ` L ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
      continue;
    }

    const r = Math.min(cornerRadius, len1 / 2, len2 / 2);
    const p1x = curr.x - (v1x / len1) * r;
    const p1y = curr.y - (v1y / len1) * r;
    const p2x = curr.x + (v2x / len2) * r;
    const p2y = curr.y + (v2y / len2) * r;

    d += ` L ${p1x.toFixed(1)} ${p1y.toFixed(1)} Q ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}, ${p2x.toFixed(1)} ${p2y.toFixed(1)}`;
  }

  const last = pts[pts.length - 1];
  d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;

  // Place label on the longest segment for maximum readability
  let bestLen = -1;
  let labelX = (pts[0].x + last.x) / 2;
  let labelY = (pts[0].y + last.y) / 2;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (segLen > bestLen) {
      bestLen = segLen;
      labelX = (a.x + b.x) / 2;
      labelY = (a.y + b.y) / 2;
    }
  }

  return { path: d, labelX, labelY };
}

export const DevDrawEdgeComponent = memo(function DevDrawEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
}: EdgeProps<DevDrawFlowEdge>) {
  const { screenToFlowPosition } = useReactFlow();
  const relation = data?.relation;
  const isLight = data?.theme === 'light';
  const simulating = !!data?.simulating;
  const flowState = data?.flowState ?? 'idle';
  const isEditingLabel = !!data?.isEditingLabel;

  const [draftLabel, setDraftLabel] = useState(relation?.label ?? '');
  const [draggingWaypoints, setDraggingWaypoints] = useState<EdgeWaypoint[] | null>(null);
  const draggingIdxRef = useRef<number | null>(null);

  useEffect(() => {
    if (isEditingLabel) {
      setDraftLabel(relation?.label ?? '');
    }
  }, [isEditingLabel, relation?.label]);

  const isOrthogonal = relation?.routing === 'orthogonal';
  const activeWaypoints = draggingWaypoints ?? relation?.waypoints ?? [];
  const useCustomWaypoints = isOrthogonal && activeWaypoints.length > 0;

  let edgePath = '';
  let labelX = (sourceX + targetX) / 2;
  let labelY = (sourceY + targetY) / 2;

  if (useCustomWaypoints) {
    const poly = buildRoundedPolylinePath(
      [{ x: sourceX, y: sourceY }, ...activeWaypoints, { x: targetX, y: targetY }],
      12
    );
    edgePath = poly.path;
    labelX = poly.labelX;
    labelY = poly.labelY;
  } else if (isOrthogonal) {
    [edgePath, labelX, labelY] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      borderRadius: 12,
    });
  } else {
    [edgePath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });
  }

  const startWaypointDrag = useCallback(
    (e: React.PointerEvent, index: number, seedPoints?: EdgeWaypoint[]) => {
      e.preventDefault();
      e.stopPropagation();
      const basePoints = seedPoints ?? [...(relation?.waypoints ?? [])];
      if (!basePoints[index]) return;
      draggingIdxRef.current = index;
      setDraggingWaypoints(basePoints);

      const onMove = (ev: PointerEvent) => {
        if (draggingIdxRef.current === null) return;
        const pos = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
        const nx = Math.round(pos.x);
        const ny = Math.round(pos.y);
        setDraggingWaypoints((prev) => {
          if (!prev) return prev;
          const next = prev.map((pt, i) => (i === draggingIdxRef.current ? { x: nx, y: ny } : pt));
          return next;
        });
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        const idx = draggingIdxRef.current;
        draggingIdxRef.current = null;
        setDraggingWaypoints((latest) => {
          if (idx !== null && latest) {
            data?.onUpdateWaypoints?.(id, latest);
          }
          return null;
        });
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [data, id, relation?.waypoints, screenToFlowPosition]
  );

  const isDimmed = flowState === 'dimmed';
  const isActive = flowState === 'active';
  const isSelected = Boolean(selected || data?.isSelected);
  const diffState = data?.diffState;

  const strokeColor =
    diffState === 'added'
      ? '#34d399'
      : diffState === 'modified'
        ? '#fbbf24'
        : diffState === 'removed'
          ? '#f43f5e'
          : isActive
            ? '#34d399'
            : isSelected
              ? isLight
                ? '#0284c7'
                : '#38bdf8'
              : relation?.dashed
                ? '#f59e0b'
                : isLight
                  ? '#7c3aed'
                  : '#8b5cf6';

  const markerId =
    diffState === 'added'
      ? 'dd-arrow-emerald'
      : diffState === 'modified'
        ? 'dd-arrow-amber'
        : diffState === 'removed'
          ? 'dd-arrow-rose'
          : isActive
            ? 'dd-arrow-emerald'
            : isSelected
              ? isLight
                ? 'dd-arrow-sky-light'
                : 'dd-arrow-sky'
              : relation?.dashed
                ? 'dd-arrow-amber'
                : isLight
                  ? 'dd-arrow-violet-light'
                  : 'dd-arrow-violet';

  const labelText = [relation?.protocol, relation?.label].filter(Boolean).join(' · ');
  const cardinality = relation?.cardinality;
  const showLabel = Boolean(labelText) || Boolean(cardinality) || isEditingLabel;

  // When an orthogonal edge is selected and has no custom waypoints yet, offer a
  // single midpoint handle so the user can pull out a custom bend immediately.
  const handlesToRender: Array<{ pt: EdgeWaypoint; isSeed: boolean; idx: number }> =
    isSelected && isOrthogonal && !isDimmed
      ? activeWaypoints.length > 0
        ? activeWaypoints.map((pt, idx) => ({ pt, isSeed: false, idx }))
        : [{ pt: { x: Math.round(labelX), y: Math.round(labelY) }, isSeed: true, idx: 0 }]
      : [];

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={`url(#${markerId})`}
        interactionWidth={24}
        style={{
          stroke: strokeColor,
          strokeWidth: diffState && diffState !== 'unchanged' ? 2.3 : isActive ? 2.4 : isSelected ? 2.1 : 1.5,
          strokeDasharray: diffState === 'removed' || relation?.dashed ? '5 4' : undefined,
          opacity: isDimmed ? 0.16 : diffState === 'unchanged' ? 0.28 : isSelected ? 1 : 0.88,
          filter:
            isSelected && !isDimmed
              ? isLight
                ? 'drop-shadow(0 0 2px rgba(2, 132, 199, 0.32))'
                : 'drop-shadow(0 0 3px rgba(56, 189, 248, 0.55))'
              : undefined,
          transition: draggingWaypoints ? 'none' : 'opacity 0.2s ease, stroke 0.2s ease',
        }}
      />

      {/* Animated flow overlay when simulating or active in Step-by-step playback */}
      {(simulating || isActive) && !isDimmed && (
        <path
          d={edgePath}
          fill="none"
          stroke={isActive ? '#a7f3d0' : '#c4b5fd'}
          strokeWidth={isActive ? 3 : 2.2}
          className={isActive ? 'dd-edge-flow-sim' : 'dd-edge-flow'}
        />
      )}

      {/* Draggable Orthogonal Waypoint Handles */}
      {handlesToRender.map(({ pt, isSeed, idx }) => (
        <circle
          key={`wp-${idx}`}
          cx={pt.x}
          cy={pt.y}
          r={isSeed ? 5.5 : 5}
          fill={isLight ? '#ffffff' : '#16121e'}
          stroke="#38bdf8"
          strokeWidth={2}
          className="cursor-grab active:cursor-grabbing"
          style={{ pointerEvents: 'all' }}
          onPointerDown={(e) => {
            if (isSeed) {
              // Seed two orthogonal bend points around midpoint when first dragged
              startWaypointDrag(e, 0, [{ x: pt.x, y: pt.y }]);
            } else {
              startWaypointDrag(e, idx);
            }
          }}
        >
          <title>拖动微调正交折线拐点</title>
        </circle>
      ))}

      {showLabel && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
              opacity: isDimmed ? 0.2 : 1,
            }}
            onClick={(e) => {
              e.stopPropagation();
              data?.onSelectEdge?.(id);
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              data?.onOpenInspector?.(id);
            }}
            className="nodrag nopan"
          >
            {isEditingLabel ? (
              <input
                autoFocus
                type="text"
                value={draftLabel}
                onChange={(e) => setDraftLabel(e.target.value)}
                onBlur={() => data?.onCommitLabel?.(id, draftLabel.trim())}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    data?.onCommitLabel?.(id, draftLabel.trim());
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    data?.onCancelEditLabel?.();
                  }
                }}
                placeholder="输入协议 / 关系..."
                className="h-6 min-w-[110px] px-2 rounded-lg bg-[#191424] border border-sky-400 text-[11px] font-mono text-sky-200 text-center shadow-xl focus:outline-none"
              />
            ) : (
              <span
                title="双击查看连线详情"
                style={{
                  textShadow: isLight
                    ? '0 0 4px #f3f5f9, 0 0 8px #f3f5f9, 0 0 12px #f3f5f9'
                    : '0 0 4px #110e17, 0 0 8px #110e17, 0 0 12px #110e17',
                }}
                className={`inline-flex items-center gap-1.5 text-[10.5px] font-sans tracking-[0.01em] leading-none whitespace-nowrap select-none cursor-pointer transition-colors ${
                  isActive
                    ? isLight
                      ? 'text-emerald-600 font-semibold'
                      : 'text-emerald-300 font-semibold'
                    : isSelected
                      ? isLight
                        ? 'text-sky-600 font-semibold'
                        : 'text-sky-300 font-semibold'
                      : isLight
                        ? 'text-slate-500 hover:text-slate-800'
                        : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {cardinality && (
                  <span
                    className={`px-1.5 py-0.5 rounded-md font-mono text-[9.5px] font-bold border ${
                      isLight
                        ? 'bg-sky-50 border-sky-300/80 text-sky-700'
                        : 'bg-[#1a1526] border-sky-400/45 text-sky-300'
                    }`}
                  >
                    {cardinality}
                  </span>
                )}
                {labelText && <span>{labelText}</span>}
              </span>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
