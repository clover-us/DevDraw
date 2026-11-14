/** 推演器共享小工具：命名、决策/假设记录（反问沉淀为 ADR）。 */
import type { Patch } from '../patch';
import type { Model, ModelNode } from '../types';

export function nodeName(model: Model, id: string): string {
  return model.nodes[id]?.name ?? id;
}

/** 是否已存在针对 (about, topic) 的决策/假设——用于"记录后模型不再追问"。 */
export function findRecord(model: Model, about: string, topic: string): [string, ModelNode] | undefined {
  return Object.entries(model.nodes).find(
    ([, n]) =>
      (n.type === 'Decision' || n.type === 'Assumption') &&
      n.attrs?.about === about &&
      n.attrs?.topic === topic,
  );
}

export function hasRecord(model: Model, about: string, topic: string): boolean {
  return findRecord(model, about, topic) !== undefined;
}

/** 生成"记录为决策/假设"的 add-node 补丁（经 applyPatch 落地）。 */
export function recordPatch(
  kind: 'Decision' | 'Assumption',
  id: string,
  name: string,
  about: string,
  topic: string,
  detail: string,
): Patch {
  return { op: 'add-node', id, node: { type: kind, name, attrs: { about, topic, detail } } };
}

export function pushMap(m: Map<string, string[]>, k: string, v: string): void {
  const a = m.get(k);
  if (a) a.push(v);
  else m.set(k, [v]);
}

/** 从 start 集合出发的可达集（BFS）。 */
export function reachable(adj: Map<string, string[]>, start: string[]): Set<string> {
  const seen = new Set<string>(start);
  const queue = [...start];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const nxt of adj.get(cur) ?? []) {
      if (!seen.has(nxt)) {
        seen.add(nxt);
        queue.push(nxt);
      }
    }
  }
  return seen;
}

/** 从 start 出发到各点的最短距离（BFS 层数）。 */
export function distances(adj: Map<string, string[]>, start: string): Map<string, number> {
  const dist = new Map<string, number>([[start, 0]]);
  const queue = [start];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const nxt of adj.get(cur) ?? []) {
      if (!dist.has(nxt)) {
        dist.set(nxt, (dist.get(cur) ?? 0) + 1);
        queue.push(nxt);
      }
    }
  }
  return dist;
}

export const SEVERITY_RANK: Record<'error' | 'question' | 'warning' | 'info', number> = {
  error: 0,
  question: 1,
  warning: 2,
  info: 3,
};
