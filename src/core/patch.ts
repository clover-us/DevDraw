/**
 * applyPatch —— 模型变更的唯一入口。
 * 设计依据：docs/design/core-semantics.md §1.2、docs/design/lens-model.md §6。
 * 手动编辑、决策卡片、AI 草稿、未来的 CRDT 同步都复用这一个咽喉点。
 * 不可变：返回新模型，绝不修改入参。
 */
import type { ComponentDef, EdgeAttrs, Model, ModelEdge, ModelNode } from './types';
import { checkIntegrity } from './validate';

export type Patch =
  | { op: 'update-edge'; id: string; attrs?: Partial<EdgeAttrs>; label?: string }
  | { op: 'update-node'; id: string; name?: string; attrs?: Record<string, string | number | boolean> }
  | { op: 'add-node'; id: string; node: ModelNode }
  | { op: 'remove-node'; id: string }
  | { op: 'add-edge'; id: string; edge: ModelEdge }
  | { op: 'remove-edge'; id: string }
  | { op: 'add-component'; id: string; component: ComponentDef }
  | { op: 'update-component'; id: string; component: ComponentDef }
  | { op: 'remove-component'; id: string };

export function applyPatch(model: Model, patch: Patch): Model {
  switch (patch.op) {
    case 'update-edge': {
      const edge = model.edges[patch.id];
      if (!edge) throw new Error(`update-edge: edge not found: ${patch.id}`);
      return {
        ...model,
        edges: {
          ...model.edges,
          [patch.id]: {
            ...edge,
            label: patch.label === undefined ? edge.label : patch.label || undefined,
            attrs: { ...edge.attrs, ...patch.attrs },
          },
        },
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
    case 'add-component': {
      if (model.components?.[patch.id]) throw new Error(`add-component: already exists: ${patch.id}`);
      return { ...model, components: { ...model.components, [patch.id]: patch.component } };
    }
    case 'update-component': {
      if (!model.components?.[patch.id]) throw new Error(`update-component: not found: ${patch.id}`);
      return { ...model, components: { ...model.components, [patch.id]: patch.component } };
    }
    case 'remove-component': {
      if (!model.components?.[patch.id]) throw new Error(`remove-component: not found: ${patch.id}`);
      const components = { ...model.components };
      delete components[patch.id];
      // 不级联删节点：节点已把 icon 快照进 attrs.icon，删组件不破坏已有建模。
      return { ...model, components };
    }
  }
}

/** 顺序应用多个补丁（决策卡片的一次选择可能产生多处变更）。 */
export function applyPatches(model: Model, patches: Patch[]): Model {
  return patches.reduce((m, p) => applyPatch(m, p), model);
}

/**
 * 语义守门员：应用补丁后校验完整性，悬空边/非法引用直接拒绝。
 * 手动编辑、AI 草稿、未来 CRDT 合并都走这道闸——字节不打架 ≠ 语义对。
 * 返回新模型；若破坏完整性则抛错（调用方可捕获并提示用户）。
 */
export function applyPatchChecked(model: Model, patch: Patch): Model {
  const next = applyPatch(model, patch);
  const issues = checkIntegrity(next);
  if (issues.length > 0) {
    throw new Error(`patch rejected (integrity): ${issues.map((i) => i.detail).join('; ')}`);
  }
  return next;
}

/** applyPatches 的守门版本：整批落地后统一校验。 */
export function applyPatchesChecked(model: Model, patches: Patch[]): Model {
  const next = applyPatches(model, patches);
  const issues = checkIntegrity(next);
  if (issues.length > 0) {
    throw new Error(`patches rejected (integrity): ${issues.map((i) => i.detail).join('; ')}`);
  }
  return next;
}