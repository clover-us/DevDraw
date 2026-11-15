/**
 * 请求追踪内核测试 —— docs/design/core-semantics.md §2.3。
 * 手动步进为主、分支 = when、overlay 不改模型、简单路径只作建议、会话重放对账。
 */
import { describe, expect, it } from 'vitest';
import { sampleModel } from '../sample';
import {
  TRACE_EDGE_TYPES,
  annotateHop,
  currentNode,
  enumerateTracePaths,
  replayTrace,
  startTrace,
  stepTrace,
  traceBottleneck,
  traceLatency,
  traceOptions,
  tracePathNodes,
  undoTrace,
} from '../trace';
import type { Model } from '../types';

const fresh = (): Model => structuredClone(sampleModel);

/** 走完「用户 → 网关 → 订单服务」的公共前缀。 */
function atOrder(m: Model) {
  let s = startTrace(m, 'n_user')!;
  s = stepTrace(m, s, 'e_user_gw')!;
  s = stepTrace(m, s, 'e_gw_order')!;
  return s;
}

describe('追踪边类型', () => {
  it('只含请求会流过的五种边；depends-on/contains 不是请求的一跳', () => {
    expect([...TRACE_EDGE_TYPES].sort()).toEqual(['calls', 'publishes', 'reads', 'subscribes', 'writes']);
    expect(TRACE_EDGE_TYPES.has('depends-on')).toBe(false);
    expect(TRACE_EDGE_TYPES.has('contains')).toBe(false);
  });
});

describe('开始与步进', () => {
  it('从 Actor 入口开始；未知节点返回 null', () => {
    const m = fresh();
    expect(startTrace(m, 'n_user')).toEqual({ entry: 'n_user', hops: [] });
    expect(startTrace(m, 'n_nope')).toBeNull();
  });

  it('每跳记录 edgeId/from/to；currentNode 随步进前进', () => {
    const m = fresh();
    const s = atOrder(m);
    expect(currentNode(s)).toBe('n_order');
    expect(s.hops).toEqual([
      { edgeId: 'e_user_gw', from: 'n_user', to: 'n_gateway' },
      { edgeId: 'e_gw_order', from: 'n_gateway', to: 'n_order' },
    ]);
    expect(tracePathNodes(s)).toEqual(['n_user', 'n_gateway', 'n_order']);
  });

  it('只接受当前节点发出的请求边：反向边、结构边、未知边一律 null', () => {
    const m = fresh();
    const s = atOrder(m);
    expect(stepTrace(m, s, 'e_gw_order')).toBeNull(); // 上一跳的边，不是当前出边
    expect(stepTrace(m, s, 'e_evt_notify')).toBeNull(); // 不是 n_order 的出边
    expect(stepTrace(m, s, 'e_nope')).toBeNull();
    const withContains = {
      ...m,
      edges: { ...m.edges, c_x: { type: 'contains' as const, from: 'n_order', to: 'n_order_db' } },
    };
    expect(stepTrace(withContains, s, 'c_x')).toBeNull(); // contains 不是请求边
  });

  it('不可变：步进/退步/注解都不修改入参', () => {
    const m = fresh();
    const s = atOrder(m);
    const snapshot = structuredClone(s);
    stepTrace(m, s, 'e_order_pay');
    undoTrace(s);
    annotateHop(s, 0, 'x');
    expect(s).toEqual(snapshot);
  });

  it('退一跳丢弃最后一跳（含注解）；空场景原样返回', () => {
    const m = fresh();
    let s = atOrder(m);
    s = annotateHop(s, 1, '网关到订单 8ms');
    s = undoTrace(s);
    expect(currentNode(s)).toBe('n_gateway');
    expect(s.hops).toHaveLength(1);
    const empty = startTrace(m, 'n_user')!;
    expect(undoTrace(empty)).toBe(empty);
  });

  it('允许成环（重试是现实语义），但候选标 revisits 提示', () => {
    const m: Model = {
      schemaVersion: 1,
      name: 'cycle',
      nodes: { a: { type: 'Service', name: 'A' }, b: { type: 'Service', name: 'B' } },
      edges: {
        e1: { type: 'calls', from: 'a', to: 'b' },
        e2: { type: 'calls', from: 'b', to: 'a' },
      },
    };
    let s = startTrace(m, 'a')!;
    s = stepTrace(m, s, 'e1')!;
    expect(traceOptions(m, s)[0].revisits).toBe(true);
    s = stepTrace(m, s, 'e2')!; // 手动步进允许走回 A
    expect(currentNode(s)).toBe('a');
    expect(tracePathNodes(s)).toEqual(['a', 'b', 'a']);
  });
});

describe('候选出边：判断信息齐全', () => {
  it('带上 when/latency/依赖模式/边标签；默认依赖按边类型', () => {
    const m = fresh();
    const opts = traceOptions(m, atOrder(m));
    const cache = opts.find((o) => o.edgeId === 'e_order_cache')!;
    expect(cache).toMatchObject({
      edgeType: 'reads',
      to: 'n_cache',
      toName: '订单缓存',
      label: '查缓存',
      when: '缓存命中',
      latencyMs: 2,
      dependency: 'soft',
      revisits: false,
    });
    const miss = opts.find((o) => o.edgeId === 'e_order_db_read')!;
    expect(miss.when).toBe('缓存未命中');
    expect(miss.dependency).toBe('hard'); // reads 默认 hard
    const pay = opts.find((o) => o.edgeId === 'e_order_pay')!;
    expect(pay.latencyMs).toBe(120);
  });

  it('稳定排序：目标名 → 边 id，与模型键序无关', () => {
    const m = fresh();
    const s = atOrder(m);
    const a = traceOptions(m, s).map((o) => o.edgeId);
    const reversed = { ...m, edges: Object.fromEntries(Object.entries(m.edges).reverse()) };
    expect(traceOptions(reversed, s).map((o) => o.edgeId)).toEqual(a);
  });

  it('入口的出边只有下单请求；队列没有出边（subscribes 方向由订阅方指向队列）', () => {
    const m = fresh();
    expect(traceOptions(m, startTrace(m, 'n_user')!).map((o) => o.edgeId)).toEqual(['e_user_gw']);
    const s = stepTrace(m, atOrder(m), 'e_order_evt')!;
    expect(traceOptions(m, s)).toEqual([]);
  });
});

describe('注解', () => {
  it('加/改/清注解；空白清除；越界原样返回', () => {
    const m = fresh();
    let s = atOrder(m);
    s = annotateHop(s, 1, '  这里是瓶颈  ');
    expect(s.hops[1].note).toBe('这里是瓶颈');
    s = annotateHop(s, 1, '改口：网关才是');
    expect(s.hops[1].note).toBe('改口：网关才是');
    s = annotateHop(s, 1, '   ');
    expect(s.hops[1]).toEqual({ edgeId: 'e_gw_order', from: 'n_gateway', to: 'n_order' });
    expect(annotateHop(s, 9, 'x')).toBe(s);
    expect(annotateHop(s, -1, 'x')).toBe(s);
  });
});

describe('延迟与瓶颈', () => {
  it('累计延迟 = 各跳 latencyMs 之和；未标注计 0', () => {
    const m = fresh();
    let s = atOrder(m); // 0 + 8
    expect(traceLatency(m, s)).toBe(8);
    s = stepTrace(m, s, 'e_order_pay')!; // + 120
    expect(traceLatency(m, s)).toBe(128);
  });

  it('瓶颈 = 延迟最大的一跳；无标注返回 null', () => {
    const m = fresh();
    let s = atOrder(m);
    expect(traceBottleneck(m, s)).toMatchObject({ index: 1, latencyMs: 8 });
    s = stepTrace(m, s, 'e_order_pay')!;
    expect(traceBottleneck(m, s)).toMatchObject({ index: 2, latencyMs: 120, hop: { edgeId: 'e_order_pay' } });
    expect(traceBottleneck(m, startTrace(m, 'n_user')!)).toBeNull();
  });
});

describe('自动枚举简单路径（只作建议）', () => {
  it('缓存命中/未命中是两条独立建议路径', () => {
    const m = fresh();
    const paths = enumerateTracePaths(m, 'n_user');
    expect(paths).toContainEqual(['e_user_gw', 'e_gw_order', 'e_order_cache']);
    expect(paths).toContainEqual(['e_user_gw', 'e_gw_order', 'e_order_db_read']);
    // 订单服务的每条请求出边各是一条极大路径（目标都是死胡同）
    expect(paths).toHaveLength(6);
    expect(paths.every((p) => p[0] === 'e_user_gw' && p[1] === 'e_gw_order')).toBe(true);
  });

  it('简单路径不重复节点：环上不会无限打转', () => {
    const m: Model = {
      schemaVersion: 1,
      name: 'cycle',
      nodes: {
        a: { type: 'Service', name: 'A' },
        b: { type: 'Service', name: 'B' },
        c: { type: 'Service', name: 'C' },
      },
      edges: {
        e1: { type: 'calls', from: 'a', to: 'b' },
        e2: { type: 'calls', from: 'b', to: 'a' },
        e3: { type: 'calls', from: 'b', to: 'c' },
      },
    };
    // b→a 会重复节点 a，不是简单路径；唯一极大简单路径是 a→b→c。
    expect(enumerateTracePaths(m, 'a')).toEqual([['e1', 'e3']]);
    // 纯双节点环：出边全指向已走过节点 = 走不动了，报告到这里为止。
    const duo: Model = {
      schemaVersion: 1,
      name: 'duo',
      nodes: { a: { type: 'Service', name: 'A' }, b: { type: 'Service', name: 'B' } },
      edges: { e1: { type: 'calls', from: 'a', to: 'b' }, e2: { type: 'calls', from: 'b', to: 'a' } },
    };
    expect(enumerateTracePaths(duo, 'a')).toEqual([['e1']]);
  });

  it('maxPaths / maxDepth 截断；未知入口返回空', () => {
    const m = fresh();
    expect(enumerateTracePaths(m, 'n_user', { maxPaths: 2 })).toHaveLength(2);
    expect(enumerateTracePaths(m, 'n_user', { maxDepth: 1 })).toEqual([['e_user_gw']]);
    expect(enumerateTracePaths(m, 'n_nope')).toEqual([]);
  });

  it('确定性：同一模型两次枚举结果一致', () => {
    const m = fresh();
    expect(enumerateTracePaths(m, 'n_user')).toEqual(enumerateTracePaths(m, 'n_user'));
  });
});

describe('会话重放：昨天的判断今天还成立吗（§2.6）', () => {
  it('模型没变 → 全部 ok，延迟不变', () => {
    const m = fresh();
    let s = atOrder(m);
    s = stepTrace(m, s, 'e_order_pay')!;
    const r = replayTrace(m, s);
    expect(r).toEqual({
      entryMissing: false,
      hops: [
        { edgeId: 'e_user_gw', status: 'ok' },
        { edgeId: 'e_gw_order', status: 'ok' },
        { edgeId: 'e_order_pay', status: 'ok' },
      ],
      broken: 0,
      totalLatencyMs: 128,
    });
  });

  it('边被删 → missing；边改指向 → moved；断跳不计延迟', () => {
    const m = fresh();
    let s = atOrder(m);
    s = stepTrace(m, s, 'e_order_pay')!;
    const edited = structuredClone(m);
    delete edited.edges.e_gw_order; // 网关→订单 没了
    edited.edges.e_order_pay = { ...edited.edges.e_order_pay, to: 'n_risk' }; // 支付边改指向
    const r = replayTrace(edited, s);
    expect(r.hops.map((h) => h.status)).toEqual(['ok', 'missing', 'moved']);
    expect(r.broken).toBe(2);
    expect(r.totalLatencyMs).toBe(0); // 只剩入口跳（无延迟标注）
  });

  it('入口被删 → entryMissing（路径可能整体被孤立，不替你下结论）', () => {
    const m = fresh();
    const s = atOrder(m);
    const edited = structuredClone(m);
    delete edited.nodes.n_user;
    expect(replayTrace(edited, s).entryMissing).toBe(true);
  });
});

describe('overlay 哲学：追踪绝不改模型（§2.2）', () => {
  it('走完全部分支后模型逐字节不变', () => {
    const m = fresh();
    const before = structuredClone(m);
    let s = startTrace(m, 'n_user')!;
    for (const edgeId of ['e_user_gw', 'e_gw_order', 'e_order_cache']) {
      s = stepTrace(m, s, edgeId)!;
    }
    traceOptions(m, s);
    traceLatency(m, s);
    enumerateTracePaths(m, 'n_user');
    replayTrace(m, s);
    expect(m).toEqual(before);
  });
});