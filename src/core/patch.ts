/**
 * applyPatch —— 模型变更的唯一入口。
 * 设计依据：docs/design/core-semantics.md §1.2、docs/design/lens-model.md §6。
 * 手动编辑、决策卡片、AI 草稿、未来的 CRDT 同步都复用这一个咽喉点。
 * 不可变：返回新模型，绝不修改入参。
 */
import type { EdgeAttrs, Model, ModelEdge, ModelNode } from './types';

export type Patch =
  | { op: 'update-edge'; id: string; attrs: Partial<EdgeAttrs> }
  | { op: 'update-node'; id: string; name?: string; attrs?: Record<string, string | number | boolean> }
  | { op: 'add-node'; id: string; node: ModelNode }
  | { op: 'remove-node'; id: string }
  | { op: 'add-edge'; id: string; edge: ModelEdge }
  | { op: 'remove-edge'; id: string };

export function applyPatch(model: Model, patch: Patch): Model {
  switch (patch.op) {
    case 'update-edge': {
      const edge = model.edges[patch.id];
      if (!edge) throw new Error(`update-edge: edge not found: ${patch.id}`);
      return {
        ...model,
        edges: { ...model.edges, [patch.id]: { ...edge, attrs: { ...edge.attrs, ...patch.attrs } } },
      };
    }
    case 'update-node': {
      const node = model.nodes[patch.id];
      if (!node) throw new Error(`update-node: node not found: ${patch.id}`);
      return {
        ...model,
        nodes: {
          ...model.nodes,
          [patch.id]: {
            ...node,
            name: patch.name ?? node.name,
            attrs: { ...node.attrs, ...patch.attrs },
          },
        },
      };
    }
    case 'add-node': {
      if (model.nodes[patch.id]) throw new Error(`add-node: node already exists: ${patch.id}`);
      return { ...model, nodes: { ...model.nodes, [patch.id]: patch.node } };
    }
    case 'remove-node': {
      if (!model.nodes[patch.id]) throw new Error(`remove-node: node not found: ${patch.id}`);
      const nodes = { ...model.nodes };
      delete nodes[patch.id];
      // 级联删除关联边，保持图完整
      const edges: Record<string, ModelEdge> = {};
      for (const [id, edge] of Object.entries(model.edges)) {
        if (edge.from !== patch.id && edge.to !== patch.id) edges[id] = edge;
      }
      return { ...model, nodes, edges };
    }
    case 'add-edge': {
      if (model.edges[patch.id]) throw new Error(`add-edge: edge already exists: ${patch.id}`);
      if (!model.nodes[patch.edge.from] || !model.nodes[patch.edge.to]) {
        throw new Error(`add-edge: endpoint not found: ${patch.edge.from} -> ${patch.edge.to}`);
      }
      return { ...model, edges: { ...model.edges, [patch.id]: patch.edge } };
    }
    case 'remove-edge': {
      if (!model.edges[patch.id]) throw new Error(`remove-edge: edge not found: ${patch.id}`);
      const edges = { ...model.edges };
      delete edges[patch.id];
      return { ...model, edges };
    }
  }
}

/** 顺序应用多个补丁（决策卡片的一次选择可能产生多处变更）。 */
export function applyPatches(model: Model, patches: Patch[]): Model {
  return patches.reduce((m, p) => applyPatch(m, p), model);
}