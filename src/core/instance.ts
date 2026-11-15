/**
 * 实例数据：表 / Redis 键的示例记录（行）。
 * 结构（字段）描述「有哪些列」，实例数据描述「长什么样」——用于示意、推演与沟通，
 * 不参与布局 / 外键解析。行以 JSON 字符串存于节点 attrs.data，键为字段 id（改名不丢值）。
 * 非 hash 的 Redis 键是单值/集合，用单一「示例值」列。
 */
import type { Model } from './types';
import { erFieldRows } from './er';

export type InstanceRow = Record<string, string>;
export interface InstanceColumn {
  id: string;
  name: string;
  dataType?: string;
}

/** 非 hash 键的单值列 id。 */
export const VALUE_COLUMN = 'value';

/** 实例数据的列：表 / hash 键 = 字段；其余 Redis 键 = 单值列。 */
export function instanceColumns(model: Model, nodeId: string): InstanceColumn[] {
  const n = model.nodes[nodeId];
  if (!n) return [];
  if (n.type === 'Table' || (n.type === 'RedisKey' && n.attrs?.structure === 'hash')) {
    return erFieldRows(model, nodeId).map((f) => ({ id: f.id, name: f.name, dataType: f.dataType }));
  }
  if (n.type === 'RedisKey') {
    const s = typeof n.attrs?.structure === 'string' && n.attrs.structure ? n.attrs.structure : 'string';
    return [{ id: VALUE_COLUMN, name: '示例值', dataType: s }];
  }
  return [];
}

/** 读取实例行；attrs.data 损坏 / 非数组时安全退为空。 */
export function instanceRows(model: Model, nodeId: string): InstanceRow[] {
  const raw = model.nodes[nodeId]?.attrs?.data;
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === 'object' && !Array.isArray(r))
      .map((r) => {
        const out: InstanceRow = {};
        for (const [k, v] of Object.entries(r)) out[k] = typeof v === 'string' ? v : v == null ? '' : String(v);
        return out;
      });
  } catch {
    return [];
  }
}

export function serializeInstanceRows(rows: InstanceRow[]): string {
  return JSON.stringify(rows);
}

/** 依列生成一条空行。 */
export function emptyInstanceRow(cols: InstanceColumn[]): InstanceRow {
  const row: InstanceRow = {};
  for (const c of cols) row[c.id] = '';
  return row;
}
