import { describe, expect, it } from 'vitest';
import {
  ER_ANCHOR_HANDLE,
  erFieldPort,
  erFieldRows,
  fieldIdFromHandle,
  planFkConnection,
  resolveFkLink,
  resolveFkLinks,
  tableCardHeight,
  tableFieldIds,
} from '../er';
import { sampleThreeLensModel } from '../sample-three-lens';
import type { Model } from '../types';

/** 一张只含两列的表的小模型：用来测"外键列写在父表一侧"这种模型写反的情形。 */
function tinyModel(): Model {
  return {
    schemaVersion: 1,
    name: 'tiny',
    nodes: {
      t_parent: { type: 'Table', name: 'parent' },
      f_parent_id: { type: 'Field', name: 'id', attrs: { key: 'PK' } },
      t_child: { type: 'Table', name: 'child' },
      f_child_parent: { type: 'Field', name: 'parent_id' },
    },
    edges: {
      c1: { type: 'contains', from: 't_parent', to: 'f_parent_id' },
      c2: { type: 'contains', from: 't_child', to: 'f_child_parent' },
      // 写反的外键：key 列挂在了 from（父表）上，但它在模型里根本不存在。
      fk_reversed: { type: 'fk', from: 't_child', to: 't_parent', attrs: { cardinality: '1:N', key: 'parent_id' } },
    },
  };
}

describe('ER 字段行与字段级端口', () => {
  it('表内字段按 contains 边的出现顺序排列', () => {
    expect(tableFieldIds(sampleThreeLensModel, 't_orders')).toEqual(['f_orders_id', 'f_orders_status', 'f_orders_amount']);
    expect(erFieldRows(sampleThreeLensModel, 't_orders')[0]).toEqual({ id: 'f_orders_id', name: 'id', keyRole: 'PK' });
  });

  it('卡片高度随字段行数增长，空表也留出表头', () => {
    expect(tableCardHeight(0)).toBeGreaterThan(0);
    expect(tableCardHeight(4)).toBeGreaterThan(tableCardHeight(2));
  });

  it('字段端口 id 可逆，卡片级兜底锚点不会被误认成字段', () => {
    expect(fieldIdFromHandle(erFieldPort('right', 'f_orders_id'))).toBe('f_orders_id');
    expect(fieldIdFromHandle(erFieldPort('left', 'f_orders_id'))).toBe('f_orders_id');
    expect(fieldIdFromHandle(ER_ANCHOR_HANDLE.left)).toBeUndefined();
    expect(fieldIdFromHandle(ER_ANCHOR_HANDLE.right)).toBeUndefined();
    expect(fieldIdFromHandle(undefined)).toBeUndefined();
  });
});

describe('外键边 → 字段行解析', () => {
  it('正常外键：父表主键行 → 子表外键列行', () => {
    const links = resolveFkLinks(sampleThreeLensModel);
    expect(links.fk_orders_items).toMatchObject({
      fromFieldId: 'f_orders_id',
      toFieldId: 'f_items_order_id',
      parentTable: 't_orders',
      childTable: 't_order_items',
      fieldLevel: true,
    });
    expect(links.fk_payments_refunds).toMatchObject({ fromFieldId: 'f_pay_id', toFieldId: 'f_ref_pay_id' });
  });

  it('外键列在模型里对不上（N:M 缺中间表）：只锚父键，退回卡片级', () => {
    const links = resolveFkLinks(sampleThreeLensModel);
    // products 表里没有 product_id 列，orders→products 的 N:M 边锚不到目标行。
    expect(links.fk_orders_products_nm.fieldLevel).toBe(false);
    expect(links.fk_orders_products_nm.fromFieldId).toBe('f_orders_id');
    expect(links.fk_orders_products_nm.toFieldId).toBeUndefined();
  });

  it('边方向写反时按"外键列在哪张表"翻回来', () => {
    const model = tinyModel();
    const rowsOf = (tableId: string) => erFieldRows(model, tableId);
    const link = resolveFkLink(model.edges.fk_reversed, rowsOf);
    // child.parent_id 引用 parent.id：语义上 parent 是 1 端。
    expect(link).toMatchObject({
      parentTable: 't_parent',
      childTable: 't_child',
      fromFieldId: 'f_child_parent',
      toFieldId: 'f_parent_id',
      fieldLevel: true,
    });
  });
});

describe('拖线 → 外键语义', () => {
  it('主键拖到普通列：父表在前，外键列取目标列名', () => {
    const plan = planFkConnection(sampleThreeLensModel, 't_orders', 't_order_items', 'f_orders_id', 'f_items_order_id');
    expect(plan).toEqual({ from: 't_orders', to: 't_order_items', key: 'order_id', cardinality: '1:N' });
  });

  it('从子表往父表反着拖：方向自动纠正，外键列取源端列名', () => {
    const plan = planFkConnection(sampleThreeLensModel, 't_order_items', 't_orders', 'f_items_order_id', 'f_orders_id');
    expect(plan).toEqual({ from: 't_orders', to: 't_order_items', key: 'order_id', cardinality: '1:N' });
  });

  it('两个主键相连 = 1:1', () => {
    const plan = planFkConnection(sampleThreeLensModel, 't_orders', 't_payments', 'f_orders_id', 'f_pay_id');
    expect(plan.cardinality).toBe('1:1');
    expect(plan).toMatchObject({ from: 't_orders', to: 't_payments' });
  });

  it('没有字段信息时按表级连一条 1:N', () => {
    const plan = planFkConnection(sampleThreeLensModel, 't_orders', 't_payments');
    expect(plan).toEqual({ from: 't_orders', to: 't_payments', key: undefined, cardinality: '1:N' });
  });
});