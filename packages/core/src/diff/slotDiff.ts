import type { CanvasSlot, EntityNode, RelationEdge } from '../types';

export interface NodeDiffChange {
  nodeId: string;
  key: string;
  changes: string[];
  summary: string;
}

export interface SlotDiffStats {
  addedNodes: number;
  modifiedNodes: number;
  removedNodes: number;
  addedEdges: number;
  modifiedEdges: number;
  removedEdges: number;
  hasChanges: boolean;
}

export interface SlotDiffResult {
  addedNodeIds: string[];
  modifiedNodes: Record<string, NodeDiffChange>;
  removedNodes: EntityNode[];
  /** Maps removed base node's semantic key -> ghost node id */
  removedKeyToGhostId: Record<string, string>;
  addedEdgeIds: string[];
  modifiedEdgeIds: string[];
  removedEdges: RelationEdge[];
  stats: SlotDiffStats;
}

export function getNodeSemanticKey(node: EntityNode): string {
  return (node.dslId && node.dslId.trim()) || node.id;
}

function normalizeFieldsSignature(node: EntityNode): string {
  const fields = node.fields ?? [];
  return fields
    .map((f) => `${f.key ?? ''}:${f.name}:${f.type}:${f.note ?? ''}`)
    .join('|');
}

function buildEdgeSemanticSignature(
  edge: RelationEdge,
  nodeIdToKey: Map<string, string>
): string {
  const fromKey = nodeIdToKey.get(edge.from) ?? edge.from;
  const toKey = nodeIdToKey.get(edge.to) ?? edge.to;
  const fromExpr = edge.fromField ? `${fromKey}.${edge.fromField}` : fromKey;
  const toExpr = edge.toField ? `${toKey}.${edge.toField}` : toKey;
  return `${fromExpr}->${toExpr}`;
}

function describeNodeChanges(base: EntityNode, curr: EntityNode): string[] {
  const changes: string[] = [];
  if (base.title !== curr.title) {
    changes.push(`名称: "${base.title}" → "${curr.title}"`);
  }
  if (base.kind !== curr.kind) {
    changes.push(`类型: ${base.kind} → ${curr.kind}`);
  }
  if (base.tag !== curr.tag) {
    changes.push(`标签: ${base.tag} → ${curr.tag}`);
  }
  if ((base.tech ?? '') !== (curr.tech ?? '')) {
    changes.push(`技术栈: ${base.tech || '无'} → ${curr.tech || '无'}`);
  }
  if ((base.status ?? '') !== (curr.status ?? '')) {
    changes.push(`状态: ${base.status || '默认'} → ${curr.status || '默认'}`);
  }
  if ((base.owner ?? '') !== (curr.owner ?? '')) {
    changes.push(`负责人: ${base.owner || '无'} → ${curr.owner || '无'}`);
  }
  if ((base.summary ?? '') !== (curr.summary ?? '')) {
    changes.push('摘要已更新');
  }
  if ((base.note ?? '') !== (curr.note ?? '')) {
    changes.push('推演备注已更新');
  }
  if (normalizeFieldsSignature(base) !== normalizeFieldsSignature(curr)) {
    const baseCount = base.fields?.length ?? 0;
    const currCount = curr.fields?.length ?? 0;
    changes.push(`字段 Schema 变更 (${baseCount} → ${currCount})`);
  }
  if ((base.kv?.ttl ?? '') !== (curr.kv?.ttl ?? '') || (base.kv?.policy ?? '') !== (curr.kv?.policy ?? '')) {
    changes.push('缓存策略/TTL 变更');
  }
  return changes;
}

function isEdgeSemanticallyModified(base: RelationEdge, curr: RelationEdge): boolean {
  return (
    (base.label ?? '') !== (curr.label ?? '') ||
    (base.protocol ?? '') !== (curr.protocol ?? '') ||
    (base.cardinality ?? '') !== (curr.cardinality ?? '') ||
    Boolean(base.dashed) !== Boolean(curr.dashed) ||
    (base.resilience?.timeout ?? '') !== (curr.resilience?.timeout ?? '') ||
    (base.resilience?.retry ?? -1) !== (curr.resilience?.retry ?? -1) ||
    Boolean(base.resilience?.circuitBreaker) !== Boolean(curr.resilience?.circuitBreaker)
  );
}

/**
 * Compute a semantic architecture diff between a baseline slot (snapshot, layer, or Git commit)
 * and the current canvas slot. Pure layout coordinate nudges are ignored so architectural
 * changes stand out cleanly.
 */
export function computeSlotDiff(
  base: Pick<CanvasSlot, 'nodes' | 'edges'>,
  current: Pick<CanvasSlot, 'nodes' | 'edges'>
): SlotDiffResult {
  const baseByKey = new Map<string, EntityNode>();
  const baseIdToKey = new Map<string, string>();
  for (const n of base.nodes) {
    const k = getNodeSemanticKey(n);
    baseByKey.set(k, n);
    baseIdToKey.set(n.id, k);
  }

  const currByKey = new Map<string, EntityNode>();
  const currIdToKey = new Map<string, string>();
  const currKeyToId = new Map<string, string>();
  for (const n of current.nodes) {
    const k = getNodeSemanticKey(n);
    currByKey.set(k, n);
    currIdToKey.set(n.id, k);
    currKeyToId.set(k, n.id);
  }

  const addedNodeIds: string[] = [];
  const modifiedNodes: Record<string, NodeDiffChange> = {};

  for (const n of current.nodes) {
    const key = getNodeSemanticKey(n);
    const prev = baseByKey.get(key);
    if (!prev) {
      addedNodeIds.push(n.id);
    } else {
      const changes = describeNodeChanges(prev, n);
      if (changes.length > 0) {
        modifiedNodes[n.id] = {
          nodeId: n.id,
          key,
          changes,
          summary: changes.join(' · '),
        };
      }
    }
  }

  const removedNodes: EntityNode[] = [];
  const removedKeyToGhostId: Record<string, string> = {};
  for (const n of base.nodes) {
    const key = getNodeSemanticKey(n);
    if (!currByKey.has(key)) {
      const ghostId = `__ghost__${key}`;
      removedKeyToGhostId[key] = ghostId;
      removedNodes.push({
        ...n,
        id: ghostId,
      });
    }
  }

  // Match edges by semantic endpoint signature (with occurrence index for parallel edges)
  const baseEdgeMap = new Map<string, RelationEdge>();
  const baseOcc = new Map<string, number>();
  for (const e of base.edges) {
    const sig = buildEdgeSemanticSignature(e, baseIdToKey);
    const idx = baseOcc.get(sig) ?? 0;
    baseOcc.set(sig, idx + 1);
    baseEdgeMap.set(`${sig}#${idx}`, e);
  }

  const currEdgeSigs = new Set<string>();
  const currOcc = new Map<string, number>();
  const addedEdgeIds: string[] = [];
  const modifiedEdgeIds: string[] = [];

  for (const e of current.edges) {
    const sig = buildEdgeSemanticSignature(e, currIdToKey);
    const idx = currOcc.get(sig) ?? 0;
    currOcc.set(sig, idx + 1);
    const fullKey = `${sig}#${idx}`;
    currEdgeSigs.add(fullKey);

    const prevEdge = baseEdgeMap.get(fullKey);
    if (!prevEdge) {
      addedEdgeIds.push(e.id);
    } else if (isEdgeSemanticallyModified(prevEdge, e)) {
      modifiedEdgeIds.push(e.id);
    }
  }

  const removedEdges: RelationEdge[] = [];
  for (const [fullKey, baseEdge] of baseEdgeMap.entries()) {
    if (currEdgeSigs.has(fullKey)) continue;
    const fromKey = baseIdToKey.get(baseEdge.from) ?? baseEdge.from;
    const toKey = baseIdToKey.get(baseEdge.to) ?? baseEdge.to;
    const resolvedFrom = currKeyToId.get(fromKey) ?? removedKeyToGhostId[fromKey];
    const resolvedTo = currKeyToId.get(toKey) ?? removedKeyToGhostId[toKey];
    if (!resolvedFrom || !resolvedTo) continue;
    removedEdges.push({
      ...baseEdge,
      id: `__ghost_edge__${fullKey}`,
      from: resolvedFrom,
      to: resolvedTo,
      dashed: true,
    });
  }

  const stats: SlotDiffStats = {
    addedNodes: addedNodeIds.length,
    modifiedNodes: Object.keys(modifiedNodes).length,
    removedNodes: removedNodes.length,
    addedEdges: addedEdgeIds.length,
    modifiedEdges: modifiedEdgeIds.length,
    removedEdges: removedEdges.length,
    hasChanges:
      addedNodeIds.length > 0 ||
      Object.keys(modifiedNodes).length > 0 ||
      removedNodes.length > 0 ||
      addedEdgeIds.length > 0 ||
      modifiedEdgeIds.length > 0 ||
      removedEdges.length > 0,
  };

  return {
    addedNodeIds,
    modifiedNodes,
    removedNodes,
    removedKeyToGhostId,
    addedEdgeIds,
    modifiedEdgeIds,
    removedEdges,
    stats,
  };
}
