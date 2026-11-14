/**
 * 稳定序列化 —— git 友好的硬约束（持久化定调第 2 条）。
 * 固定键序、固定 2 空格缩进、UTF-8 无 BOM、结尾换行。
 * 目标：没改语义就绝不产生 diff 噪音；map 按键排序，增删不引起位移。
 */
import type { Model, ModelEdge, ModelNode } from './types';

/** 递归把对象的键按字典序排序（数组保持顺序），保证序列化确定性。 */
function sortKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map(sortKeys) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out as T;
  }
  return value;
}

/** 顶层固定键序：schemaVersion → name → nodes → edges → groups → components。 */
export function serializeModel(model: Model): string {
  const ordered: Record<string, unknown> = {
    schemaVersion: model.schemaVersion,
    name: model.name,
    nodes: sortKeys(model.nodes),
    edges: sortKeys(model.edges),
  };
  if (model.groups) ordered.groups = sortKeys(model.groups);
  if (model.components) ordered.components = sortKeys(model.components);
  return JSON.stringify(ordered, null, 2) + '\n';
}

/** 反序列化 + 基本结构校验（schemaVersion 必须是 1）。 */
export function deserializeModel(text: string): Model {
  const raw = JSON.parse(text) as Partial<Model>;
  if (raw.schemaVersion !== 1) {
    throw new Error(`unsupported schemaVersion: ${String(raw.schemaVersion)} (expected 1)`);
  }
  if (!raw.nodes || !raw.edges || typeof raw.name !== 'string') {
    throw new Error('invalid model.json: missing name/nodes/edges');
  }
  return {
    schemaVersion: 1,
    name: raw.name,
    nodes: raw.nodes as Record<string, ModelNode>,
    edges: raw.edges as Record<string, ModelEdge>,
    ...(raw.groups ? { groups: raw.groups } : {}),
    ...(raw.components ? { components: raw.components } : {}),
  };
}

/** views.json：每镜片的布局/过滤/样式覆盖/当前场景。与模型分离，挪位置不污染语义 diff。 */
export interface LensView {
  positions: Record<string, { x: number; y: number }>;
  filter?: Record<string, unknown>;
  styleOverrides?: Record<string, unknown>;
  /** 当前失效场景（what-if 假设），刷新后不丢。 */
  seeds?: string[];
}
export type Views = Record<string, LensView>;

export function serializeViews(views: Views): string {
  return JSON.stringify(sortKeys(views), null, 2) + '\n';
}

export function deserializeViews(text: string): Views {
  return JSON.parse(text) as Views;
}
