/** 注册表入口 + 投影helper。设计依据：docs/design/lens-model.md §4。 */
import type { Model, ModelEdge, ModelNode } from '../types';
import { LENSES } from './lenses';
import type { LensDef, LensId } from './types';

export * from './types';
export { NODE_TYPES } from './nodeTypes';
export { EDGE_TYPES, STRUCTURAL_EDGE_TYPES, connectableEdgeTypes } from './edgeTypes';
export { LENSES } from './lenses';

export function getLens(id: LensId): LensDef {
  const lens = LENSES.find((l) => l.id === id);
  if (!lens) throw new Error(`unknown lens: ${id}`);
  return lens;
}

export interface Projection {
  nodes: Record<string, ModelNode>;
  edges: Record<string, ModelEdge>;
}

/** 投影：节点按类型归属筛选；边按"两端均在投影内"筛选（跨镜片边自动隐藏）。 */
export function projectLens(model: Model, lens: LensDef): Projection {
  const allowed = new Set(lens.nodeTypes);
  const nodes: Record<string, ModelNode> = {};
  for (const [id, n] of Object.entries(model.nodes)) {
    if (allowed.has(n.type)) nodes[id] = n;
  }
  const edges: Record<string, ModelEdge> = {};
  for (const [id, e] of Object.entries(model.edges)) {
    if (nodes[e.from] && nodes[e.to]) edges[id] = e;
  }
  return { nodes, edges };
}
