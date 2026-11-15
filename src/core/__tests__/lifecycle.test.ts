import { describe, expect, it } from 'vitest';
import { applySmScope, lifecycleOfState, smMachines, unassignedStateIds } from '../lifecycle';
import { getLens, projectLens } from '../registry';
import { sampleThreeLensModel as M } from '../sample-three-lens';

const smProj = () => projectLens(M, getLens('state-machine'));

describe('状态机按生命周期分scope', () => {
  it('smMachines：两台机器 + 各自状态 + 来源实体名', () => {
    const machines = smMachines(M);
    expect(machines.map((m) => m.id)).toEqual(['sm_order', 'sm_payment']);
    const order = machines[0];
    expect(order.name).toBe('订单生命周期');
    expect(order.ownerName).toBe('orders');
    expect(order.stateIds).toEqual(['s_created', 's_awaiting', 's_paid', 's_fulfilling', 's_completed', 's_cancelled', 's_refunded']);
    const pay = machines[1];
    expect(pay.name).toBe('支付生命周期');
    expect(pay.ownerName).toBe('payments');
    expect(pay.stateIds).toEqual(['s_pay_pending', 's_pay_success', 's_pay_failed', 's_pay_refunded']);
  });

  it('lifecycleOfState：状态经 contains 找到归属机器；未归属返回 undefined', () => {
    expect(lifecycleOfState(M, 's_paid')).toBe('sm_order');
    expect(lifecycleOfState(M, 's_pay_pending')).toBe('sm_payment');
    expect(lifecycleOfState(M, 't_orders')).toBeUndefined();
    expect(unassignedStateIds(M)).toEqual([]);
  });

  it('单机器scope：只留自己的状态与内部迁移，跨机器迁移隐藏', () => {
    const pay = applySmScope(M, smProj(), 'sm_payment');
    expect(Object.keys(pay.nodes).sort()).toEqual(['s_pay_failed', 's_pay_pending', 's_pay_refunded', 's_pay_success']);
    expect(Object.keys(pay.edges).sort()).toEqual(['tr_pay_fail', 'tr_pay_refund', 'tr_pay_success']);
    const order = applySmScope(M, smProj(), 'sm_order');
    expect(Object.keys(order.nodes)).toHaveLength(7);
    expect(Object.keys(order.edges)).toHaveLength(6);
    expect(order.edges['tr_refund_sync']).toBeUndefined();
  });

  it('「全部」与未知scope原样返回；注释类节点任何scope都保留', () => {
    const proj = smProj();
    expect(applySmScope(M, proj, 'all')).toBe(proj);
    expect(applySmScope(M, proj, 'sm_missing')).toBe(proj);
    const withNote = {
      nodes: { ...proj.nodes, n_note: { type: 'Note' as const, name: '注解' } },
      edges: proj.edges,
    };
    const scoped = applySmScope(M, withNote, 'sm_payment');
    expect(scoped.nodes['n_note']).toBeDefined();
    expect(Object.keys(scoped.nodes)).toHaveLength(5);
  });

  it('未归属：没挂机器的状态进「未归属」scope', () => {
    const withOrphan = {
      ...M,
      nodes: { ...M.nodes, s_orphan: { type: 'State' as const, name: 'Orphan' } },
    };
    expect(unassignedStateIds(withOrphan)).toEqual(['s_orphan']);
    const scoped = applySmScope(withOrphan, projectLens(withOrphan, getLens('state-machine')), 'unassigned');
    expect(Object.keys(scoped.nodes)).toEqual(['s_orphan']);
    expect(Object.keys(scoped.edges)).toEqual([]);
  });
});
