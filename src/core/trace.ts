/**
 * 请求追踪 —— 手动步进推演「一个请求怎么走」。
 * 设计依据：docs/design/core-semantics.md §2.3。
 *
 * 与 simulate 同一 overlay 哲学（§2.2）：追踪只读模型，绝不修改模型；
 * 走过的路径是场景（TraceScenario），存 views / 推演会话，不进 model.json。
 * 手动步进为主：每一跳由用户在出边中选择（分支 = 边 attrs.when），
 * 自动枚举简单路径只作建议，不替人拍板。
 */
import { edgeDependency } from './simulate';
import type { DependencyMode, EdgeType, Model } from './types';

/**
 * 请求会流过的边类型（§2.3 原文）。depends-on 是静态依赖、contains 是结构归属，
 * 都不是请求的一跳，故不在其列。方向严格沿出边：subscribes 由订阅方指向队列，
 * 所以从消费者出发的追踪能走到队列；「队列 → 消费者」的反向续走不在 v1 语义里。
 */
export const TRACE_EDGE_TYPES: ReadonlySet<EdgeType> = new Set<EdgeType>([
  'calls',
  'reads',
  'writes',
  'publishes',
  'subscribes',
]);

/** 一跳（已确认）。纯数据，可直接序列化进 views.json / 推演会话。 */
export interface TraceHop {
  edgeId: string;
  from: string;
  to: string;
  /** 用户注解，如「这里是瓶颈」。空注解不存（序列化干净）。 */
  note?: string;
}

/** 一次追踪场景：入口 + 已走过的跳。与 seeds 同等待遇（what-if 场景，刷新不丢）。 */
export interface TraceScenario {
  entry: string;
  hops: TraceHop[];
}

/** 当前节点的候选出边 —— 用户选下一跳所需的全部判断信息都在这一条里。 */
export interface TraceOption {
  edgeId: string;
  edgeType: EdgeType;
  to: string;
  toName: string;
  label?: string;
  /** 分支条件（attrs.when），如「缓存未命中」。 */
  when?: string;
  latencyMs?: number;
  dependency: DependencyMode;
  /** 目标已在路径上：再走就成环。手动步进允许（现实请求确有重试环），UI 应提示。 */
  revisits: boolean;
}

/** 从入口开始追踪。节点不存在返回 null（调用方忽略）。 */
export function startTrace(model: Model, entry: string): TraceScenario | null {
  if (!model.nodes[entry]) return null;
  return { entry, hops: [] };
}

/** 请求当前到达的节点。 */
export function currentNode(state: TraceScenario): string {
  return state.hops.length > 0 ? state.hops[state.hops.length - 1].to : state.entry;
}

/** 路径上的全部节点（按顺序；手动步进允许成环，故可能重复）。 */
export function tracePathNodes(state: TraceScenario): string[] {
  return [state.entry, ...state.hops.map((h) => h.to)];
}

/** 稳定排序：目标名 → 边 id（码位比较，跨平台确定，UI 列表不跳动）。 */
function compareOptions(a: { toName: string; edgeId: string }, b: { toName: string; edgeId: string }): number {
  if (a.toName !== b.toName) return a.toName < b.toName ? -1 : 1;
  return a.edgeId < b.edgeId ? -1 : a.edgeId > b.edgeId ? 1 : 0;
}

/** 当前节点的全部候选出边（请求边类型、目标存在）。 */
export function traceOptions(model: Model, state: TraceScenario): TraceOption[] {
  const cur = currentNode(state);
  const visited = new Set(tracePathNodes(state));
  const options: TraceOption[] = [];
  for (const [edgeId, edge] of Object.entries(model.edges)) {
    if (edge.from !== cur || !TRACE_EDGE_TYPES.has(edge.type)) continue;
    const target = model.nodes[edge.to];
    if (!target) continue; // 悬空边不进候选（完整性闸门外再兜一层底）
    options.push({
      edgeId,
      edgeType: edge.type,
      to: edge.to,
      toName: target.name,
      label: edge.label,
      when: edge.attrs?.when,
      latencyMs: edge.attrs?.latencyMs,
      dependency: edgeDependency(edge),
      revisits: visited.has(edge.to),
    });
  }
  return options.sort(compareOptions);
}

/** 走一跳：只接受当前节点发出的请求边，否则返回 null（非法点击被忽略）。 */
export function stepTrace(model: Model, state: TraceScenario, edgeId: string): TraceScenario | null {
  const cur = currentNode(state);
  const edge = model.edges[edgeId];
  if (!edge || edge.from !== cur || !TRACE_EDGE_TYPES.has(edge.type)) return null;
  if (!model.nodes[edge.to]) return null;
  return { ...state, hops: [...state.hops, { edgeId, from: cur, to: edge.to }] };
}

/** 退一跳（注解随跳一起丢弃）。空场景原样返回。 */
export function undoTrace(state: TraceScenario): TraceScenario {
  if (state.hops.length === 0) return state;
  return { ...state, hops: state.hops.slice(0, -1) };
}

/** 给第 index 跳加/改/清注解。空白 = 清除；越界原样返回。不可变。 */
export function annotateHop(state: TraceScenario, index: number, note: string): TraceScenario {
  if (index < 0 || index >= state.hops.length) return state;
  const trimmed = note.trim();
  const hops = state.hops.map((h, i) => {
    if (i !== index) return h;
    if (!trimmed) return { edgeId: h.edgeId, from: h.from, to: h.to };
    return { ...h, note: trimmed };
  });
  return { ...state, hops };
}

/** 累计延迟：各跳边 latencyMs 之和；未标注计 0（v1 纯手工标注，§2.5）。 */
export function traceLatency(model: Model, state: TraceScenario): number {
  let total = 0;
  for (const hop of state.hops) {
    const ms = model.edges[hop.edgeId]?.attrs?.latencyMs;
    if (typeof ms === 'number') total += ms;
  }
  return total;
}

/** 瓶颈跳 = 路径上延迟最大的一跳；没有任何延迟标注时返回 null。 */
export function traceBottleneck(
  model: Model,
  state: TraceScenario,
): { index: number; hop: TraceHop; latencyMs: number } | null {
  let best: { index: number; hop: TraceHop; latencyMs: number } | null = null;
  for (let i = 0; i < state.hops.length; i++) {
    const hop = state.hops[i];
    const ms = model.edges[hop.edgeId]?.attrs?.latencyMs;
    if (typeof ms === 'number' && ms > 0 && (best === null || ms > best.latencyMs)) {
      best = { index: i, hop, latencyMs: ms };
    }
  }
  return best;
}

export interface EnumerateOptions {
  /** 单条路径最大跳数，防深图失控。默认 12。 */
  maxDepth?: number;
  /** 最多返回几条路径，防组合爆炸。默认 20。 */
  maxPaths?: number;
}

/**
 * 自动枚举入口出发的简单路径（不重复节点）—— 只作建议（§2.3）。
 * 只报告「走到走不动」的极大路径：死胡同，或出边全指向已走过的节点。
 * DFS + 与 traceOptions 同序的出边排序 → 结果顺序稳定；达到上限即截断。
 * 返回边 id 数组的数组；入口不存在或无请求出边 → 空。
 */
export function enumerateTracePaths(model: Model, entry: string, opts: EnumerateOptions = {}): string[][] {
  const maxDepth = opts.maxDepth ?? 12;
  const maxPaths = opts.maxPaths ?? 20;
  if (!model.nodes[entry]) return [];

  // 预计算邻接表（排序与 traceOptions 一致），DFS 里不再反复扫全图。
  const adj = new Map<string, { edgeId: string; to: string; toName: string }[]>();
  for (const [edgeId, edge] of Object.entries(model.edges)) {
    if (!TRACE_EDGE_TYPES.has(edge.type)) continue;
    const target = model.nodes[edge.to];
    if (!target || !model.nodes[edge.from]) continue;
    const list = adj.get(edge.from) ?? [];
    list.push({ edgeId, to: edge.to, toName: target.name });
    adj.set(edge.from, list);
  }
  for (const list of adj.values()) list.sort(compareOptions);

  const results: string[][] = [];
  const path: string[] = [];
  const onPath = new Set<string>([entry]);

  const dfs = (node: string): void => {
    if (results.length >= maxPaths) return;
    const nexts = (adj.get(node) ?? []).filter((e) => !onPath.has(e.to));
    if (nexts.length === 0 || path.length >= maxDepth) {
      if (path.length > 0) results.push([...path]);
      return;
    }
    for (const e of nexts) {
      if (results.length >= maxPaths) return;
      path.push(e.edgeId);
      onPath.add(e.to);
      dfs(e.to);
      path.pop();
      onPath.delete(e.to);
    }
  };

  dfs(entry);
  return results;
}

/** 重放时单跳的状态：ok=仍成立；missing=边没了；moved=边还在但两端变了。 */
export type HopReplayStatus = 'ok' | 'missing' | 'moved';

export interface TraceReplay {
  entryMissing: boolean;
  hops: { edgeId: string; status: HopReplayStatus }[];
  /** 断掉的跳数（missing + moved）。 */
  broken: number;
  /** 今天仍成立的跳的累计延迟（断跳不计；未标注计 0）。 */
  totalLatencyMs: number;
}

/**
 * 把存档的追踪场景放在今天的模型上重放（§2.6：存场景不存快照）。
 * 逐跳核对边是否还在、两端是否没变；只摆事实，不下「变好/变坏」的结论。
 */
export function replayTrace(model: Model, scenario: TraceScenario): TraceReplay {
  const hops: TraceReplay['hops'] = [];
  let broken = 0;
  let totalLatencyMs = 0;
  for (const hop of scenario.hops) {
    const edge = model.edges[hop.edgeId];
    let status: HopReplayStatus;
    if (!edge) {
      status = 'missing';
    } else if (edge.from !== hop.from || edge.to !== hop.to) {
      status = 'moved';
    } else {
      status = 'ok';
      const ms = edge.attrs?.latencyMs;
      if (typeof ms === 'number') totalLatencyMs += ms;
    }
    if (status !== 'ok') broken++;
    hops.push({ edgeId: hop.edgeId, status });
  }
  return { entryMissing: !model.nodes[scenario.entry], hops, broken, totalLatencyMs };
}