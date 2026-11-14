import { describe, expect, it } from 'vitest';
import { erFieldRows, foldRows, foldedCardHeight, shouldAutoFold, tableCardHeight } from '../er';
import { layoutProjection } from '../layout';
import { getLens, projectLens } from '../registry';
import { sampleThreeLensModel } from '../sample-three-lens';

describe('layoutProjection（ELK 自动布局）', () => {
  it('架构镜片：为每个投影节点产出有限坐标', async () => {
    const projection = projectLens(sampleThreeLensModel, getLens('architecture'));
    const pos = await layoutProjection(projection, 'architecture');
    const ids = Object.keys(projection.nodes);
    expect(ids.length).toBe(8);
    for (const id of ids) {
      expect(pos[id]).toBeDefined();
      expect(Number.isFinite(pos[id].x)).toBe(true);
      expect(Number.isFinite(pos[id].y)).toBe(true);
    }
  });

  it('ER 镜片：表卡片按外键分层，父表在子表左侧（字段已折进卡片）', async () => {
    const projection = projectLens(sampleThreeLensModel, getLens('er'));
    const pos = await layoutProjection(projection, 'er', sampleThreeLensModel);
    expect(Object.keys(pos).length).toBe(7);
    for (const id of Object.keys(projection.nodes)) {
      expect(Number.isFinite(pos[id].x)).toBe(true);
      expect(Number.isFinite(pos[id].y)).toBe(true);
    }
    // orders 1—N order_items / payments：父表 orders 在子表左侧（外键流向 = 左→右）。
    expect(pos['t_orders'].x).toBeLessThan(pos['t_order_items'].x);
    expect(pos['t_orders'].x).toBeLessThan(pos['t_payments'].x);
    // payments 1—N refunds：两级依赖仍然保持同向。
    expect(pos['t_payments'].x).toBeLessThan(pos['t_refunds'].x);
    // 宽表 audit_log 挂在 orders / products 下游，落在最右一列。
    expect(pos['t_orders'].x).toBeLessThan(pos['t_audit_log'].x);
  });

  it('ER 镜片：宽表按自动折叠后的高度参与布局（12 列只按 3 个键列算高）', async () => {
    const rows = erFieldRows(sampleThreeLensModel, 't_audit_log');
    expect(shouldAutoFold(rows)).toBe(true);
    const shown = foldRows(rows, true);
    expect(shown.rows.length).toBe(3);
    expect(shown.hidden).toBeLessThanOrEqual(rows.length - 3);
    // 折叠后的卡片高度 < 全展开高度：布局取的是前者，所以 y 不会被 12 行撑开。
    expect(foldedCardHeight(shown.rows.length)).toBeLessThan(tableCardHeight(rows.length));
  });

  it('状态机镜片：初始态在终态左侧（左→右流）', async () => {
    const projection = projectLens(sampleThreeLensModel, getLens('state-machine'));
    const pos = await layoutProjection(projection, 'state-machine');
    expect(Object.keys(pos).length).toBe(7);
    expect(pos['s_created'].x).toBeLessThan(pos['s_completed'].x);
  });

  it('确定性：同一投影两次布局结果一致', async () => {
    const projection = projectLens(sampleThreeLensModel, getLens('architecture'));
    const a = await layoutProjection(projection, 'architecture');
    const b = await layoutProjection(projection, 'architecture');
    expect(a).toEqual(b);
  });

  it('空投影：返回空坐标表', async () => {
    const pos = await layoutProjection({ nodes: {}, edges: {} }, 'architecture');
    expect(pos).toEqual({});
  });
});
