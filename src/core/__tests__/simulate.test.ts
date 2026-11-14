import { describe, expect, it } from 'vitest';
import { applyPatch } from '../patch';
import { sampleModel } from '../sample';
import { edgeDependency, simulate } from '../simulate';
import type { Model } from '../types';

const fresh = (): Model => structuredClone(sampleModel);

describe('依赖模式默认值', () => {
  it('未显式标注时按边类型取默认：calls=hard，subscribes=async', () => {
    const m = fresh();
    expect(edgeDependency(m.edges.e_gw_order)).toBe('hard');
    expect(edgeDependency(m.edges.e_evt_notify)).toBe('async');
    expect(edgeDependency(m.edges.e_order_pay)).toBe('hard');
    expect(edgeDependency(m.edges.e_order_risk)).toBe('soft');
  });
});

describe('失效传播：hard 链', () => {
  it('杀死支付服务 → 订单、网关、用户入口沿 hard 链相继失效', () => {
    const r = simulate(fresh(), ['n_payment']);
    expect(r.states.n_payment).toBe('failed');
    expect(r.states.n_order).toBe('failed');
    expect(r.states.n_gateway).toBe('failed');
    expect(r.states.n_user).toBe('failed');
    // 旁路不受影响
    expect(r.states.n_risk).toBeUndefined();
    expect(r.states.n_events).toBeUndefined();
    expect(r.states.n_notify).toBeUndefined();
    expect(r.states.n_order_db).toBeUndefined();
    expect(r.blastRadius.failed).toBe(3);
    expect(r.blastRadius.degraded).toBe(0);
    expect(r.blastRadius.affectedEntries).toEqual(['n_user']);
  });

  it('每个受影响节点都有可解释的传播路径', () => {
    const r = simulate(fresh(), ['n_payment']);
    expect(r.paths.n_gateway).toEqual([
      { node: 'n_payment', edge: 'e_order_pay', mode: 'hard' },
      { node: 'n_order', edge: 'e_gw_order', mode: 'hard' },
    ]);
    expect(r.paths.n_payment).toEqual([]); // 失效源自身
  });

  it('杀死订单库 → 订单服务失效（writes 默认 hard）', () => {
    const r = simulate(fresh(), ['n_order_db']);
    expect(r.states.n_order).toBe('failed');
    expect(r.states.n_gateway).toBe('failed');
    expect(r.blastRadius.failed).toBe(3);
  });
});

describe('失效传播：soft 降级', () => {
  it('杀死风控服务 → 订单链路降级而非失效（soft + fallback）', () => {
    const r = simulate(fresh(), ['n_risk']);
    expect(r.states.n_order).toBe('degraded');
    expect(r.states.n_gateway).toBe('degraded');
    expect(r.states.n_user).toBe('degraded');
    expect(r.blastRadius.failed).toBe(0);
    expect(r.blastRadius.degraded).toBe(3);
  });
});

describe('失效传播：async 缓冲', () => {
  it('杀死队列 → 发布者降级（outbox）、订阅者降级（async），全链无失效', () => {
    const r = simulate(fresh(), ['n_events']);
    expect(r.states.n_order).toBe('degraded'); // publishes soft + outbox
    expect(r.states.n_notify).toBe('degraded'); // subscribes async
    expect(r.states.n_gateway).toBe('degraded');
    expect(r.states.n_user).toBe('degraded');
    expect(r.blastRadius.failed).toBe(0);
    expect(r.blastRadius.degraded).toBe(4);
  });

  it('杀死订阅者（通知服务）→ 不影响队列与上游（失败不沿依赖正向传播）', () => {
    const r = simulate(fresh(), ['n_notify']);
    expect(r.blastRadius.failed).toBe(0);
    expect(r.blastRadius.degraded).toBe(0);
    expect(Object.keys(r.states)).toEqual(['n_notify']);
  });
});

describe('核心价值循环：编辑 → 重演 → 对比', () => {
  it('把订单→支付从 hard 改为 soft+兜底后，同一失效场景的爆炸半径收缩', () => {
    const before = simulate(fresh(), ['n_payment']);
    expect(before.blastRadius.failed).toBe(3);

    const edited = applyPatch(fresh(), {
      op: 'update-edge',
      id: 'e_order_pay',
      attrs: { dependency: 'soft', fallback: '降级为人工对账' },
    });
    const after = simulate(edited, ['n_payment']);

    expect(after.states.n_order).toBe('degraded');
    expect(after.states.n_gateway).toBe('degraded');
    expect(after.blastRadius.failed).toBe(0);
    expect(after.blastRadius.degraded).toBe(3);
    // 爆炸半径收缩：failed 3 → 0
    expect(after.blastRadius.failed).toBeLessThan(before.blastRadius.failed);
  });

  it('applyPatch 不可变：不修改原模型', () => {
    const m = fresh();
    const edited = applyPatch(m, { op: 'update-edge', id: 'e_order_pay', attrs: { dependency: 'soft' } });
    expect(m.edges.e_order_pay.attrs?.dependency).toBe('hard');
    expect(edited.edges.e_order_pay.attrs?.dependency).toBe('soft');
    expect(edited).not.toBe(m);
  });
});

describe('结构语义', () => {
  it('contains 正向传播：数据库失效 → 其中的表失效', () => {
    const m = fresh();
    m.nodes.t_order = { type: 'Table', name: '订单表' };
    m.edges.e_db_table = { type: 'contains', from: 'n_order_db', to: 't_order' };
    const r = simulate(m, ['n_order_db']);
    expect(r.states.t_order).toBe('failed');
  });

  it('依赖环保证终止：A↔B 互调（hard），杀死 A → 两者皆失效', () => {
    const m: Model = {
      schemaVersion: 1,
      name: 'cycle',
      nodes: { a: { type: 'Service', name: 'A' }, b: { type: 'Service', name: 'B' } },
      edges: {
        e1: { type: 'calls', from: 'a', to: 'b' },
        e2: { type: 'calls', from: 'b', to: 'a' },
      },
    };
    const r = simulate(m, ['a']);
    expect(r.states.a).toBe('failed');
    expect(r.states.b).toBe('failed');
  });

  it('状态格单调：soft 与 hard 两条路径汇聚时，failed 覆盖 degraded', () => {
    const m: Model = {
      schemaVersion: 1,
      name: 'merge',
      nodes: {
        a: { type: 'Service', name: 'A' },
        b: { type: 'Service', name: 'B' },
        c: { type: 'Service', name: 'C' },
      },
      edges: {
        e1: { type: 'calls', from: 'c', to: 'a', attrs: { dependency: 'soft', fallback: 'x' } },
        e2: { type: 'calls', from: 'c', to: 'b' },
      },
    };
    const r = simulate(m, ['a', 'b']);
    expect(r.states.c).toBe('failed');
  });
});

describe('边界情况', () => {
  it('空失效集 → 空 overlay', () => {
    const r = simulate(fresh(), []);
    expect(Object.keys(r.states)).toHaveLength(0);
    expect(r.blastRadius.failed).toBe(0);
  });

  it('未知节点 id 被忽略', () => {
    const r = simulate(fresh(), ['n_does_not_exist']);
    expect(Object.keys(r.states)).toHaveLength(0);
  });

  it('多失效源叠加', () => {
    const r = simulate(fresh(), ['n_payment', 'n_risk']);
    expect(r.states.n_order).toBe('failed'); // hard 压过 soft
    expect(r.blastRadius.failed).toBe(3);
  });
});
