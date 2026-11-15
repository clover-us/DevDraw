/**
 * 三镜片注册表 + 推演器 + 反问落地回路测试。
 * 验证 docs/design/lens-model.md 的浮现抽象与"模型顶嘴"演示。
 */
import { describe, expect, it } from 'vitest';
import { applyPatches } from '../patch';
import { architectureReasoner } from '../reasoners/architecture';
import { columnImpact, erReasoner } from '../reasoners/er';
import { stateMachineReasoner } from '../reasoners/stateMachine';
import type { Finding } from '../reasoners/types';
import { getLens, projectLens } from '../registry';
import { sampleModel } from '../sample';
import { sampleThreeLensModel as M } from '../sample-three-lens';

const byId = (findings: Finding[], id: string) => findings.find((f) => f.id === id);
const option = (f: Finding | undefined, id: string) => f?.question?.options.find((o) => o.id === id);

describe('镜片注册表 / 投影', () => {
  it('架构镜片投影 == spike 原模型（9 节点 9 边，跨镜片边隐藏）', () => {
    const p = projectLens(M, getLens('architecture'));
    expect(Object.keys(p.nodes).sort()).toEqual(Object.keys(sampleModel.nodes).sort());
    expect(Object.keys(p.edges).sort()).toEqual(Object.keys(sampleModel.edges).sort());
  });

  it('ER 镜片只含表（7 表，字段折进表卡片不独立投影），跨镜片胶水边隐藏', () => {
    const p = projectLens(M, getLens('er'));
    expect(Object.keys(p.nodes)).toHaveLength(7);
    expect(Object.values(p.nodes).every((n) => n.type === 'Table')).toBe(true);
    // 字段不投影 → contains 边两端不全在投影内被隐藏；只剩表间外键（含 audit_log / shipments / refunds 的长边）。
    expect(Object.keys(p.edges)).toHaveLength(9);
    expect(Object.values(p.edges).every((e) => e.type === 'fk')).toBe(true);
  });

  it('状态机镜片只含状态（Lifecycle 仅作锚点不投影），6 条迁移', () => {
    const p = projectLens(M, getLens('state-machine'));
    expect(Object.keys(p.nodes)).toHaveLength(7);
    expect(Object.values(p.nodes).every((n) => n.type === 'State')).toBe(true);
    expect(Object.keys(p.edges)).toHaveLength(6);
    expect(Object.values(p.edges).every((e) => e.type === 'transition')).toBe(true);
  });
});

describe('架构推演器：单点故障', () => {
  it('标出 gateway/order/payment/order_db 为 SPOF，soft/async 不算', () => {
    const findings = architectureReasoner.run(M);
    const ids = findings.map((f) => f.id).sort();
    expect(ids).toEqual(['spof:n_gateway', 'spof:n_order', 'spof:n_order_db', 'spof:n_payment']);
    expect(findings.every((f) => f.severity === 'warning')).toBe(true);
  });
});

describe('ER 推演器：基数一致性', () => {
  it('N:M 直连报错；可空外键反问；正确 1:N 外键通过', () => {
    const findings = erReasoner.run(M);
    expect(byId(findings, 'erm:nm:fk_orders_products_nm')?.severity).toBe('error');
    expect(byId(findings, 'erm:nullable:f_items_order_id')?.severity).toBe('question');
    expect(findings.some((f) => f.id.startsWith('erm:fkpos'))).toBe(false);
  });

  it('改列牵连：order_items.order_id 被 orders→items 外键引用', () => {
    const impact = columnImpact(M, 'f_items_order_id');
    expect(impact.edgeIds).toEqual(['fk_orders_items']);
    expect(impact.tableIds).toEqual(['t_orders']);
  });
});

describe('状态机推演器：跨镜片缺口 + 反问', () => {
  it('履约缺口：tr_fulfill/tr_deliver 引用不存在的 n_fulfillment', () => {
    const findings = stateMachineReasoner.run(M);
    const gap = byId(findings, 'sm:gap:n_fulfillment');
    expect(gap?.severity).toBe('error');
    expect(gap?.edgeIds).toEqual(expect.arrayContaining(['tr_fulfill', 'tr_deliver']));
    expect(gap?.question?.options.map((o) => o.id)).toEqual(['add-service', 'manual', 'assume']);
  });

  it('缺失迁移反问：Paid 不可取消（headline=Paid）', () => {
    const findings = stateMachineReasoner.run(M);
    const cancel = byId(findings, 'sm:cancel:s_cancelled:s_paid');
    expect(cancel?.severity).toBe('question');
    expect(cancel?.question?.options.map((o) => o.id)).toEqual(['allow', 'forbid', 'pending']);
  });

  it('结构干净：全可达、无卡死，含生命周期摘要', () => {
    const findings = stateMachineReasoner.run(M);
    expect(findings.some((f) => f.id.startsWith('sm:unreachable'))).toBe(false);
    expect(findings.some((f) => f.id.startsWith('sm:deadlock'))).toBe(false);
    expect(byId(findings, 'sm:summary:sm_order')?.severity).toBe('info');
  });
});

describe('反问落地回路（applyPatch 唯一咽喉点 → 模型不再追问）', () => {
  it('履约缺口选"新增服务"→ 缺口消失', () => {
    const gap = byId(stateMachineReasoner.run(M), 'sm:gap:n_fulfillment');
    const next = applyPatches(M, option(gap, 'add-service')!.patches);
    expect(next.nodes.n_fulfillment?.type).toBe('Service');
    expect(byId(stateMachineReasoner.run(next), 'sm:gap:n_fulfillment')).toBeUndefined();
    // 不可变：原模型未被修改
    expect(M.nodes.n_fulfillment).toBeUndefined();
  });

  it('取消反问选"维持不可取消"→ 记录 Decision，反问降级为 info', () => {
    const cancel = byId(stateMachineReasoner.run(M), 'sm:cancel:s_cancelled:s_paid');
    const next = applyPatches(M, option(cancel, 'forbid')!.patches);
    expect(next.nodes.dec_cancel_s_paid?.type).toBe('Decision');
    const after = stateMachineReasoner.run(next);
    expect(byId(after, 'sm:cancel:s_cancelled:s_paid')).toBeUndefined();
    expect(byId(after, 'sm:cancel-decided:s_paid')?.severity).toBe('info');
  });

  it('可空外键选"改为必填"→ 反问消失', () => {
    const q = byId(erReasoner.run(M), 'erm:nullable:f_items_order_id');
    const next = applyPatches(M, option(q, 'notnull')!.patches);
    expect(next.nodes.f_items_order_id?.attrs?.nullable).toBe(false);
    expect(byId(erReasoner.run(next), 'erm:nullable:f_items_order_id')).toBeUndefined();
  });
});
