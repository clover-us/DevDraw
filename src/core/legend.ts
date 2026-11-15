/**
 * 动态图例的实时读数（纯函数）。
 *
 * 图例不是死对照表，而是「当前视图里到底有什么」的活计数：节点三态 + 失效源、
 * 依赖三种线型、失效传播与请求追踪两层 overlay。把计数逻辑放在内核而不是组件里，
 * 是为了让它和 simulate / trace 一样可单测、可回归——UI 只负责把这些数字摆出来。
 *
 * 只读：传入投影的 nodes/edges 与推演结果，绝不改模型（与 overlay 同一哲学）。
 */
import { edgeDependency, type SimulationResult } from './simulate';
import type { TraceScenario } from './trace';
import type { EdgeType, ModelEdge, ModelNode } from './types';

export interface LegendStats {
  nodeCounts: { failed: number; degraded: number; ok: number; seeds: number };
  edgeCounts: { hard: number; soft: number; async: number };
  /** 失效传播路径覆盖的边数（result.paths 去重）。 */
  impactedCount: number;
  /** 请求追踪已走的跳数。 */
  tracedCount: number;
  /** 是否正在失效推演（有失效源）。 */
  simulating: boolean;
  /** 是否正在请求追踪。 */
  tracing: boolean;
}

/** 结构边（contains / has-lifecycle / encodes）在画布上隐藏，图例也不数。 */
const HIDDEN_EDGES = new Set<EdgeType>(['contains', 'has-lifecycle', 'encodes']);

export function computeLegendStats(
  nodes: Record<string, ModelNode>,
  edges: Record<string, ModelEdge>,
  result: SimulationResult | null,
  seeds: string[],
  trace: TraceScenario | null,
): LegendStats {
  // result.states 只存非 ok 的节点；ok 用总数减出来，钳到 0 防越界。
  const states = result?.states ?? {};
  let failed = 0;
  let degraded = 0;
  for (const s of Object.values(states)) {
    if (s === 'failed') failed += 1;
    else if (s === 'degraded') degraded += 1;
  }
  const total = Object.keys(nodes).length;

  const edgeCounts = { hard: 0, soft: 0, async: 0 };
  for (const e of Object.values(edges)) {
    if (HIDDEN_EDGES.has(e.type)) continue;
    edgeCounts[edgeDependency(e)] += 1;
  }

  const impacted = new Set<string>();
  if (result) for (const path of Object.values(result.paths)) for (const step of path) impacted.add(step.edge);

  return {
    nodeCounts: { failed, degraded, ok: Math.max(0, total - failed - degraded), seeds: seeds.length },
    edgeCounts,
    impactedCount: impacted.size,
    tracedCount: trace?.hops.length ?? 0,
    simulating: result != null,
    tracing: trace != null,
  };
}