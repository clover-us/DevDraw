/**
 * DevDraw 推演内核 —— 确定性失效传播，零 LLM 依赖，可解释。
 * 设计依据：docs/design/core-semantics.md §2。
 *
 * 语义：
 * - 依赖边 A→B 表示 A 依赖 B；B 失效时影响沿**反方向**传播到 A，强度由依赖模式决定。
 * - contains 边例外：整体失效则部分失效，沿**正方向**传播。
 * - 状态格 ok < degraded < failed 单调上升，worklist BFS 有环也终止。
 * - 模拟只产出 overlay（states/paths），绝不修改模型。
 */
import type { DependencyMode, EdgeType, Model, ModelEdge, NodeState } from './types';

export const DEFAULT_DEPENDENCY: Record<EdgeType, DependencyMode> = {
  calls: 'hard',
  reads: 'hard',
  writes: 'hard',
  publishes: 'hard',
  subscribes: 'async',
  'depends-on': 'hard',
  contains: 'hard',
};

export function edgeDependency(edge: ModelEdge): DependencyMode {
  return edge.attrs?.dependency ?? DEFAULT_DEPENDENCY[edge.type];
}

const STATE_RANK: Record<NodeState, number> = { ok: 0, degraded: 1, failed: 2 };

/** 依赖方状态为 s 时，对依赖它的一方造成的影响。 */
function impact(s: NodeState, mode: DependencyMode): NodeState {
  if (s === 'ok') return 'ok';
  if (mode === 'hard') return s; // failed→failed，degraded→degraded
  return 'degraded'; // soft/async 把失效吸收为降级
}

export interface ImpactStep {
  /** 传播路径上的上游节点（影响来源） */
  node: string;
  /** 影响经过的边 */
  edge: string;
  mode: DependencyMode;
}

export interface BlastRadius {
  /** 失效节点数（不含失效源） */
  failed: number;
  /** 降级节点数（不含失效源） */
  degraded: number;
  /** 受影响的入口（Actor/Endpoint） */
  affectedEntries: string[];
}

export interface SimulationResult {
  seeds: string[];
  /** overlay：仅记录非 ok 节点；未出现 = ok */
  states: Record<string, NodeState>;
  /** 每个受影响节点从失效源出发的传播路径（可解释性） */
  paths: Record<string, ImpactStep[]>;
  blastRadius: BlastRadius;
}

interface PropLink {
  edgeId: string;
  target: string;
  mode: DependencyMode;
}

export function simulate(model: Model, seeds: string[]): SimulationResult {
  // 传播邻接表
  const links = new Map<string, PropLink[]>();
  const addLink = (src: string, link: PropLink): void => {
    const list = links.get(src);
    if (list) list.push(link);
    else links.set(src, [link]);
  };
  for (const [edgeId, edge] of Object.entries(model.edges)) {
    if (!model.nodes[edge.from] || !model.nodes[edge.to]) continue;
    if (edge.type === 'contains') {
      addLink(edge.from, { edgeId, target: edge.to, mode: 'hard' });
    } else {
      addLink(edge.to, { edgeId, target: edge.from, mode: edgeDependency(edge) });
    }
  }

  const states: Record<string, NodeState> = {};
  const via: Record<string, ImpactStep | undefined> = {};
  const queue: string[] = [];

  for (const seed of seeds) {
    if (!model.nodes[seed]) continue;
    if (STATE_RANK[states[seed] ?? 'ok'] < STATE_RANK.failed) {
      states[seed] = 'failed';
      queue.push(seed);
    }
  }

  // worklist BFS：状态只升不降 → 每个节点至多升级两次 → 有环也终止
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentState = states[current] ?? 'ok';
    for (const link of links.get(current) ?? []) {
      const next = impact(currentState, link.mode);
      if (STATE_RANK[next] > STATE_RANK[states[link.target] ?? 'ok']) {
        states[link.target] = next;
        via[link.target] = { node: current, edge: link.edgeId, mode: link.mode };
        queue.push(link.target);
      }
    }
  }

  // 重建传播路径（via 指针回溯到失效源）
  const seedSet = new Set(seeds);
  const paths: Record<string, ImpactStep[]> = {};
  for (const id of Object.keys(states)) {
    if (seedSet.has(id)) {
      paths[id] = [];
      continue;
    }
    const path: ImpactStep[] = [];
    let cursor: string | undefined = id;
    const guard = new Set<string>();
    while (cursor && via[cursor] && !guard.has(cursor)) {
      guard.add(cursor);
      const step: ImpactStep = via[cursor]!;
      path.unshift(step);
      cursor = step.node;
    }
    paths[id] = path;
  }

  // 爆炸半径（不含失效源本身）
  let failed = 0;
  let degraded = 0;
  const affectedEntries: string[] = [];
  for (const [id, state] of Object.entries(states)) {
    if (seedSet.has(id)) continue;
    if (state === 'failed') failed += 1;
    else if (state === 'degraded') degraded += 1;
    const type = model.nodes[id]?.type;
    if (type === 'Actor' || type === 'Endpoint') affectedEntries.push(id);
  }

  return { seeds: [...seeds], states, paths, blastRadius: { failed, degraded, affectedEntries } };
}
