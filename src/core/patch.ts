/**
 * applyPatch —— 模型变更的唯一入口（spike 版）。
 * 设计依据：docs/design/core-semantics.md §1.2。
 * 手动编辑、AI 草稿、未来的 CRDT 同步都将复用这一个咽喉点。
 * 不可变：返回新模型，绝不修改入参。
 */
import type { EdgeAttrs, Model } from './types';

export type Patch = { op: 'update-edge'; id: string; attrs: Partial<EdgeAttrs> };

export function applyPatch(model: Model, patch: Patch): Model {
  switch (patch.op) {
    case 'update-edge': {
      const edge = model.edges[patch.id];
      if (!edge) throw new Error(`update-edge: edge not found: ${patch.id}`);
      return {
        ...model,
        edges: {
          ...model.edges,
          [patch.id]: { ...edge, attrs: { ...edge.attrs, ...patch.attrs } },
        },
      };
    }
  }
}
