import ELK, { type ElkNode } from 'elkjs/lib/elk.bundled.js';
import type { EntityNode, RelationEdge } from '../types';
import { getAnnotationKind, isCollapsibleEntity, isGroupEntity } from '../primitives';

export interface AutoLayoutOptions {
  direction?: 'RIGHT' | 'DOWN';
  respectPinned?: boolean;
  nodeSpacing?: number;
  layerSpacing?: number;
}

export interface AutoLayoutResult {
  nodes: EntityNode[];
  edges: RelationEdge[];
}

const elk = new ELK();

function estimateNodeSize(node: EntityNode): { width: number; height: number } {
  if (node.w && node.h) return { width: node.w, height: node.h };
  if (isCollapsibleEntity(node) && !node.collapsed) {
    const fieldCount = node.fields?.length ?? 0;
    return { width: 264, height: 88 + Math.min(fieldCount, 8) * 28 };
  }
  if (getAnnotationKind(node)) {
    return { width: 252, height: 88 };
  }
  return { width: 248, height: 96 };
}

/**
 * Estimate pixel width of an edge's rendered label ("protocol · label")
 * so ELK guarantees enough inter-layer breathing room and never lets nodes cover labels.
 */
function estimateEdgeLabelWidth(edge: RelationEdge): number {
  const text = [edge.protocol, edge.label].filter(Boolean).join(' · ');
  if (!text) return 0;
  let width = 0;
  for (const ch of text) {
    // Tight estimate at 10.5px sans font
    width += ch.charCodeAt(0) > 255 ? 10.5 : 5.8;
  }
  return Math.min(140, Math.ceil(width) + 12);
}

/**
 * Hybrid ELK layout engine:
 * 1. Main architecture/data entities are laid out with ELK layered + ORTHOGONAL routing,
 *    with compact label-aware spacing (~140-165px gap) so labels stay legible without long edges.
 * 2. Pinned nodes keep their manual coordinates when `respectPinned` is enabled.
 * 3. Reasoning Annotations (`assumption`, `decision`, `note`) with `linkNodeId`
 *    reserve vertical clearance below their target entity and dock neatly underneath it.
 */
export async function computeAutoLayout(
  nodes: EntityNode[],
  edges: RelationEdge[],
  options: AutoLayoutOptions = {}
): Promise<AutoLayoutResult> {
  const { direction = 'RIGHT', respectPinned = false, nodeSpacing = 56 } = options;

  const groupNodes = nodes.filter((n) => isGroupEntity(n));
  const groupIds = new Set(groupNodes.map((n) => n.id));
  const linkedAnnotations = nodes.filter((n) => !!getAnnotationKind(n) && !!n.linkNodeId);
  const linkedAnnIds = new Set(linkedAnnotations.map((n) => n.id));
  const primaryNodes = nodes.filter((n) => !linkedAnnIds.has(n.id) && !groupIds.has(n.id));
  const primaryIds = new Set(primaryNodes.map((n) => n.id));

  const primaryEdges = edges.filter((e) => primaryIds.has(e.from) && primaryIds.has(e.to));

  // Reserve extra vertical height under any entity that owns docked reasoning annotations
  const extraHeightByTarget = new Map<string, number>();
  for (const ann of linkedAnnotations) {
    if (!ann.linkNodeId) continue;
    const annSize = estimateNodeSize(ann);
    const prev = extraHeightByTarget.get(ann.linkNodeId) ?? 0;
    extraHeightByTarget.set(ann.linkNodeId, prev + annSize.height + 20);
  }

  // Compute exact single-gap inter-layer spacing from longest edge label (avoids ELK dummy-layer double spacing)
  const maxLabelWidth = primaryEdges.reduce(
    (max, e) => Math.max(max, estimateEdgeLabelWidth(e)),
    0
  );
  const resolvedLayerSpacing =
    options.layerSpacing ?? Math.max(124, Math.min(184, maxLabelWidth + 28));

  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction,
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': String(nodeSpacing),
      'elk.spacing.edgeNode': '24',
      'elk.spacing.edgeEdge': '20',
      'elk.layered.spacing.nodeNodeBetweenLayers': String(resolvedLayerSpacing),
      'elk.layered.spacing.edgeNodeBetweenLayers': '24',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '18',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
    },
    children: primaryNodes.map((n) => {
      const size = estimateNodeSize(n);
      const extraH = extraHeightByTarget.get(n.id) ?? 0;
      return {
        id: n.id,
        width: size.width,
        height: size.height + extraH,
      };
    }),
    edges: primaryEdges.map((e) => ({
      id: e.id,
      sources: [e.from],
      targets: [e.to],
    })),
  };

  const laidOut = await elk.layout(elkGraph);

  const posMap = new Map<string, { x: number; y: number; w: number; h: number }>();
  for (const child of laidOut.children ?? []) {
    posMap.set(child.id, {
      x: Math.round(child.x ?? 0),
      y: Math.round(child.y ?? 0),
      w: Math.round(child.width ?? 248),
      h: Math.round(child.height ?? 96),
    });
  }

  // Extract orthogonal bend points computed by ELK
  const waypointsMap = new Map<string, Array<{ x: number; y: number }>>();
  for (const edge of laidOut.edges ?? []) {
    const sections = (
      edge as unknown as { sections?: Array<{ bendPoints?: Array<{ x: number; y: number }> }> }
    ).sections;
    const bends = sections?.flatMap((s) => s.bendPoints ?? []) ?? [];
    if (bends.length > 0) {
      waypointsMap.set(
        edge.id,
        bends.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }))
      );
    }
  }

  // Place primary nodes (respecting pinned nodes when requested)
  const nextNodes: EntityNode[] = primaryNodes.map((n) => {
    if (respectPinned && n.pinned) return { ...n };
    const pos = posMap.get(n.id);
    if (!pos) return { ...n };
    return {
      ...n,
      x: pos.x,
      y: pos.y,
      pinned: respectPinned ? n.pinned : false,
    };
  });

  // Dock linked reasoning annotations neatly below their target entities
  const nodeById = new Map(nextNodes.map((n) => [n.id, n]));
  const stackOffsets = new Map<string, number>();

  for (const ann of linkedAnnotations) {
    if (respectPinned && ann.pinned) {
      nextNodes.push({ ...ann });
      continue;
    }
    const target = ann.linkNodeId ? nodeById.get(ann.linkNodeId) : undefined;
    if (!target) {
      nextNodes.push({ ...ann });
      continue;
    }
    const targetSize = estimateNodeSize(target);
    const prevOffset = stackOffsets.get(target.id) ?? 0;
    const annSize = estimateNodeSize(ann);
    const y = target.y + targetSize.height + 24 + prevOffset;
    stackOffsets.set(target.id, prevOffset + annSize.height + 16);
    nextNodes.push({
      ...ann,
      x: target.x,
      y,
      pinned: respectPinned ? ann.pinned : false,
    });
  }

  // Keep group boundary frames preserved underneath laid-out entities
  const finalNodes: EntityNode[] = [...groupNodes.map((g) => ({ ...g })), ...nextNodes];

  const nextEdges: RelationEdge[] = edges.map((e) => {
    const waypoints = waypointsMap.get(e.id);
    if (!respectPinned) {
      return {
        ...e,
        sourcePort: undefined,
        targetPort: undefined,
        waypoints: waypoints && waypoints.length > 0 ? waypoints : undefined,
      };
    }
    return waypoints ? { ...e, waypoints } : { ...e };
  });

  return { nodes: finalNodes, edges: nextEdges };
}
