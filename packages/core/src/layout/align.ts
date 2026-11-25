import type { EntityNode } from '../types';
import { getAnnotationKind, isCollapsibleEntity, isGroupEntity } from '../primitives';

export type AlignDirection = 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom';
export type DistributeAxis = 'horizontal' | 'vertical';

export function estimateEntityDimensions(node: EntityNode): { w: number; h: number } {
  if (node.w && node.h) return { w: node.w, h: node.h };
  if (isGroupEntity(node)) return { w: node.w ?? 420, h: node.h ?? 280 };
  if (isCollapsibleEntity(node) && !node.collapsed) {
    const count = Math.min(node.fields?.length ?? 0, 8);
    return { w: node.w ?? 264, h: node.h ?? 88 + count * 28 };
  }
  if (getAnnotationKind(node)) {
    return { w: node.w ?? 252, h: node.h ?? 88 };
  }
  return { w: node.w ?? 248, h: node.h ?? 96 };
}

/**
 * Align the specified nodes along an edge or center axis, marking moved nodes as pinned.
 */
export function alignNodes(
  nodes: EntityNode[],
  targetIds: string[],
  direction: AlignDirection
): EntityNode[] {
  const idSet = new Set(targetIds);
  const targets = nodes.filter((n) => idSet.has(n.id));
  if (targets.length < 2) return nodes;

  const boxes = targets.map((n) => ({ node: n, ...estimateEntityDimensions(n) }));

  let anchor = 0;
  if (direction === 'left') {
    anchor = Math.min(...boxes.map((b) => b.node.x));
  } else if (direction === 'right') {
    anchor = Math.max(...boxes.map((b) => b.node.x + b.w));
  } else if (direction === 'center-x') {
    const minX = Math.min(...boxes.map((b) => b.node.x));
    const maxX = Math.max(...boxes.map((b) => b.node.x + b.w));
    anchor = (minX + maxX) / 2;
  } else if (direction === 'top') {
    anchor = Math.min(...boxes.map((b) => b.node.y));
  } else if (direction === 'bottom') {
    anchor = Math.max(...boxes.map((b) => b.node.y + b.h));
  } else if (direction === 'center-y') {
    const minY = Math.min(...boxes.map((b) => b.node.y));
    const maxY = Math.max(...boxes.map((b) => b.node.y + b.h));
    anchor = (minY + maxY) / 2;
  }

  const sizeMap = new Map(boxes.map((b) => [b.node.id, { w: b.w, h: b.h }]));

  return nodes.map((n) => {
    if (!idSet.has(n.id)) return n;
    const { w, h } = sizeMap.get(n.id)!;
    let x = n.x;
    let y = n.y;
    if (direction === 'left') x = Math.round(anchor);
    else if (direction === 'right') x = Math.round(anchor - w);
    else if (direction === 'center-x') x = Math.round(anchor - w / 2);
    else if (direction === 'top') y = Math.round(anchor);
    else if (direction === 'bottom') y = Math.round(anchor - h);
    else if (direction === 'center-y') y = Math.round(anchor - h / 2);
    return { ...n, x, y, pinned: true };
  });
}

/**
 * Evenly distribute 3+ selected nodes along the horizontal or vertical axis while
 * keeping the two outermost nodes anchored in place.
 */
export function distributeNodes(
  nodes: EntityNode[],
  targetIds: string[],
  axis: DistributeAxis
): EntityNode[] {
  const idSet = new Set(targetIds);
  const targets = nodes.filter((n) => idSet.has(n.id));
  if (targets.length < 3) return nodes;

  const boxes = targets
    .map((n) => ({ node: n, ...estimateEntityDimensions(n) }))
    .sort((a, b) => (axis === 'horizontal' ? a.node.x - b.node.x : a.node.y - b.node.y));

  const nextPos = new Map<string, { x: number; y: number }>();

  if (axis === 'horizontal') {
    const first = boxes[0];
    const last = boxes[boxes.length - 1];
    const totalSpan = last.node.x + last.w - first.node.x;
    const sumWidths = boxes.reduce((s, b) => s + b.w, 0);
    const gap = (totalSpan - sumWidths) / (boxes.length - 1);

    let cursor = first.node.x;
    for (const b of boxes) {
      nextPos.set(b.node.id, { x: Math.round(cursor), y: b.node.y });
      cursor += b.w + gap;
    }
  } else {
    const first = boxes[0];
    const last = boxes[boxes.length - 1];
    const totalSpan = last.node.y + last.h - first.node.y;
    const sumHeights = boxes.reduce((s, b) => s + b.h, 0);
    const gap = (totalSpan - sumHeights) / (boxes.length - 1);

    let cursor = first.node.y;
    for (const b of boxes) {
      nextPos.set(b.node.id, { x: b.node.x, y: Math.round(cursor) });
      cursor += b.h + gap;
    }
  }

  return nodes.map((n) => {
    const pos = nextPos.get(n.id);
    if (!pos) return n;
    return { ...n, x: pos.x, y: pos.y, pinned: true };
  });
}

/**
 * Compute a bounding Group container frame wrapping the selected entities with generous header padding.
 */
export function computeGroupBoundsForNodes(
  nodes: EntityNode[],
  targetIds: string[],
  padding = 36
): { x: number; y: number; w: number; h: number } | null {
  const idSet = new Set(targetIds);
  const targets = nodes.filter((n) => idSet.has(n.id) && !isGroupEntity(n));
  if (targets.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const n of targets) {
    const { w, h } = estimateEntityDimensions(n);
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + w);
    maxY = Math.max(maxY, n.y + h);
  }

  const headerTopPad = 56;
  return {
    x: Math.round(minX - padding),
    y: Math.round(minY - headerTopPad),
    w: Math.max(280, Math.round(maxX - minX + padding * 2)),
    h: Math.max(180, Math.round(maxY - minY + headerTopPad + padding)),
  };
}
