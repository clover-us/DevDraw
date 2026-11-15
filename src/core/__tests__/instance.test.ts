import { describe, expect, it } from 'vitest';
import { emptyInstanceRow, instanceColumns, instanceRows, serializeInstanceRows, VALUE_COLUMN } from '../instance';
import { sampleThreeLensModel } from '../sample-three-lens';
import type { Model } from '../types';

describe('instanceColumns', () => {
  it('表 = 字段列（id/name/dataType）', () => {
    const cols = instanceColumns(sampleThreeLensModel, 't_orders');
    expect(cols.map((c) => c.name)).toEqual(['id', 'status', 'amount']);
    expect(cols[0]).toMatchObject({ id: 'f_orders_id', dataType: 'bigint' });
  });
  it('hash 键 = 字段列', () => {
    const cols = instanceColumns(sampleThreeLensModel, 'k_session');
    expect(cols.map((c) => c.name)).toEqual(['user_id', 'cart', 'last_seen']);
  });
  it('非 hash 键 = 单值列', () => {
    const cols = instanceColumns(sampleThreeLensModel, 'k_order_cache');
    expect(cols).toEqual([{ id: VALUE_COLUMN, name: '示例值', dataType: 'string' }]);
  });
  it('非结构节点 = 空', () => {
    expect(instanceColumns(sampleThreeLensModel, 'n_order_db')).toEqual([]);
  });
});

describe('instanceRows', () => {
  it('读取示例表数据（键为字段 id）', () => {
    const rows = instanceRows(sampleThreeLensModel, 't_orders');
    expect(rows.length).toBe(3);
    expect(rows[0]).toMatchObject({ f_orders_id: '1001', f_orders_status: 'Paid', f_orders_amount: '129.00' });
  });
  it('读取单值键数据', () => {
    const rows = instanceRows(sampleThreeLensModel, 'k_order_cache');
    expect(rows.length).toBe(2);
    expect(rows[0][VALUE_COLUMN]).toContain('1001');
  });
  it('无 data / 损坏 data 安全退为空', () => {
    const m = sampleThreeLensModel as Model;
    expect(instanceRows(m, 't_products')).toEqual([]);
    const bad: Model = { ...m, nodes: { ...m.nodes, t_products: { ...m.nodes.t_products, attrs: { data: '{not json' } } } };
    expect(instanceRows(bad, 't_products')).toEqual([]);
    const arr: Model = { ...m, nodes: { ...m.nodes, t_products: { ...m.nodes.t_products, attrs: { data: '[1,2]' } } } };
    expect(instanceRows(arr, 't_products')).toEqual([]);
  });
});

describe('serialize / empty', () => {
  it('空行依列生成、序列化可回读', () => {
    const cols = instanceColumns(sampleThreeLensModel, 't_orders');
    const row = emptyInstanceRow(cols);
    expect(Object.keys(row)).toEqual(cols.map((c) => c.id));
    const m: Model = {
      ...sampleThreeLensModel,
      nodes: { ...sampleThreeLensModel.nodes, t_products: { ...sampleThreeLensModel.nodes.t_products, attrs: { data: serializeInstanceRows([row]) } } },
    };
    expect(instanceRows(m, 't_products')).toEqual([row]);
  });
});
