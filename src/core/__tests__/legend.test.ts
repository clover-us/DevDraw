/**
 * 动态图例读数（core/legend.ts）单测。
 * 图例是「当前视图实时读数」，计数必须和 simulate / trace 的语义严格一致：
 * 节点三态用 result.states（只存非 ok）+ 总数减出 ok；依赖线型用 edgeDependency；
 * 结构边不数；传播边去重；追踪跳数 = hops.length。这里把这些口径钉死，防回归。
 */
import { describe, expect, it } from 'vitest';
import { computeLegendStats } from '../legend';
import { sampleModel } from '../sample';
import { simulate, type SimulationResult } from '../simulate';
import type { TraceScenario } from '../trace';
import type { ModelEdge, ModelNode } from '../types';

const NODES = sampleModel.nodes;
const EDGES = sampleModel.edges;

/** 样例 9 节点；9 条可见边 = 5 hard + 3 soft + 1 async（subscribes）。 */
describe('computeLegendStats（动态图例实时读数）', () => {
  it('无推演无追踪：全部正常，依赖线型按 edgeDependency 归类', () => {
    const s = computeLegendStats(NODES, EDGES, null, [], null);
    expect(s.nodeCounts).toEqual({ failed: 0, degraded: 0, ok: 9, seeds: 0 });
    expect(s.edgeCounts).toEqual({ hard: 5, soft: 3, async: 1 });
    expect(s.impactedCount).toBe(0);
    expect(s.tracedCount).toBe(0);
    expect(s.simulating).toBe(false);
    expect(s.tracing).toBe(false);
  });

  it('失效推演（订单库挂）：硬依赖链 4 失效，传播边去重为 3', () => {
    const result = simulate(sampleModel, ['n_order_db']);
    const s = computeLegendStats(NODES, EDGES, result, ['n_order_db'], null);
    expect(s.nodeCounts).toEqual({ failed: 4, degraded: 0, ok: 5, seeds: 1 });
    expect(s.simulating).toBe(true);
    expect(s.tracing).toBe(false);
    // 传播路径覆盖 e_order_db / e_gw_order / e_user_gw 三条边（多路径共用要去重）。
    expect(s.impactedCount).toBe(3);
  });

  it('软依赖失效（风控挂）：吸收为降级而非失效', () => {
    const result = simulate(sampleModel, ['n_risk']);
    const s = computeLegendStats(NODES, EDGES, result, ['n_risk'], null);
    expect(s.nodeCounts).toEqual({ failed: 1, degraded: 3, ok: 5, seeds: 1 });
    expect(s.impactedCount).toBe(3);
  });

  it('请求追踪：跳数 = hops.length，tracing 真、simulating 假', () => {
    const trace: TraceScenario = {
      entry: 'n_user',
      hops: [
        { edgeId: 'e_user_gw', from: 'n_user', to: 'n_gateway' },
        { edgeId: 'e_gw_order', from: 'n_gateway', to: 'n_order' },
      ],
    };
    const s = computeLegendStats(NODES, EDGES, null, [], trace);
    expect(s.tracedCount).toBe(2);
    expect(s.tracing).toBe(true);
    expect(s.simulating).toBe(false);
    expect(s.nodeCounts.ok).toBe(9);
  });

  it('结构边（contains / has-lifecycle / encodes）不计入依赖线型', () => {
    const edges: Record<string, ModelEdge> = {
      ...EDGES,
      e_contains: { type: 'contains', from: 'n_order', to: 'n_payment' },
      e_lifecycle: { type: 'has-lifecycle', from: 'n_order', to: 'n_events' },
      e_encodes: { type: 'encodes', from: 'n_order', to: 'n_cache' },
    };
    const s = computeLegendStats(NODES, edges, null, [], null);
    expect(s.edgeCounts).toEqual({ hard: 5, soft: 3, async: 1 });
  });

  it('ok 钳到 0：状态数超过节点总数也不出现负数', () => {
    const result: SimulationResult = {
      seeds: [],
      states: { ghost: 'failed' },
      paths: {},
      blastRadius: { failed: 0, degraded: 0, affectedEntries: [] },
    };
    const s = computeLegendStats({}, {}, result, [], null);
    expect(s.nodeCounts.ok).toBe(0);
    expect(s.nodeCounts.failed).toBe(1);
  });

  it('传播边跨多条路径去重：同一边只数一次', () => {
    const result: SimulationResult = {
      seeds: ['x'],
      states: {},
      paths: {
        a: [{ node: 'x', edge: 'e1', mode: 'hard' }],
        b: [
          { node: 'y', edge: 'e1', mode: 'hard' },
          { node: 'z', edge: 'e2', mode: 'soft' },
        ],
      },
      blastRadius: { failed: 0, degraded: 0, affectedEntries: [] },
    };
    const s = computeLegendStats(NODES, EDGES, result, ['x'], null);
    expect(s.impactedCount).toBe(2);
  });

  it('只读：绝不修改传入的模型 / 结果 / 场景（overlay 哲学）', () => {
    const result = simulate(sampleModel, ['n_order_db']);
    const trace: TraceScenario = { entry: 'n_user', hops: [{ edgeId: 'e_user_gw', from: 'n_user', to: 'n_gateway' }] };
    const nodes: Record<string, ModelNode> = JSON.parse(JSON.stringify(NODES));
    const edges: Record<string, ModelEdge> = JSON.parse(JSON.stringify(EDGES));
    const before = JSON.stringify({ nodes, edges, result, trace });
    computeLegendStats(nodes, edges, result, ['n_order_db'], trace);
    expect(JSON.stringify({ nodes, edges, result, trace })).toBe(before);
  });
});