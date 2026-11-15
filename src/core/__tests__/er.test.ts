import { describe, expect, it } from 'vitest';
import {
  applyErScope,
  databaseEngine,
  databaseOfField,
  databaseOfTable,
  ER_ANCHOR_HANDLE,
  erDatabases,
  erFieldPort,
  erFieldRows,
  fieldIdFromHandle,
  fieldRowOffset,
  foldRows,
  isErStructure,
  planFkConnection,
  resolveFkLink,
  resolveFkLinks,
  tableCardHeight,
  tableFieldIds,
  unassignedTableIds,
} from '../er';
import { getLens, projectLens } from '../registry';
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
    expect(erFieldRows(sampleThreeLensModel, 't_orders')[0]).toEqual({
      id: 'f_orders_id',
      name: 'id',
      keyRole: 'PK',
      dataType: 'bigint',
      nullable: false,
      comment: '订单号，全局唯一',
    });
  });

  it('字段行携带类型 / 可空 / 备注：画布三列（名称·备注·类型）与折叠共用同一来源', () => {
    const rows = erFieldRows(sampleThreeLensModel, 't_payments');
    expect(rows.map((r) => r.dataType)).toEqual(['bigint', 'bigint', 'decimal']);
    expect(rows[1]).toMatchObject({ name: 'order_id', keyRole: 'FK', comment: '关联 orders.id' });
    expect(rows[2]).toMatchObject({ name: 'amount', comment: '实付金额（元，含优惠分摊）' });
    // 折叠只挑行，不丢列信息：折起来的键列仍带类型与备注。
    const folded = foldRows(erFieldRows(sampleThreeLensModel, 't_audit_log'), true);
    expect(folded.rows.every((r) => typeof r.dataType === 'string')).toBe(true);
    expect(folded.hidden).toBeGreaterThan(0);
  });

  it('卡片高度随字段行数增长，空表也留出表头', () => {
    expect(tableCardHeight(0)).toBeGreaterThan(0);
    expect(tableCardHeight(4)).toBeGreaterThan(tableCardHeight(2));
  });

  it('行高与渲染一致：每多一行正好 25px，首行中心在 53.5', () => {
    // 对不上会让高卡比估算矮，卡片之间 44px 的空当被吃掉，长外键就只能贴着卡片挤过去。
    expect(tableCardHeight(3) - tableCardHeight(2)).toBe(25);
    expect(tableCardHeight(24) - tableCardHeight(12)).toBe(300);
    expect(fieldRowOffset(0)).toBe(53.5);
    expect(fieldRowOffset(1) - fieldRowOffset(0)).toBe(25);
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

describe('ER 按数据库分scope', () => {
  const erProj = () => projectLens(sampleThreeLensModel, getLens('er'));

  it('表归属数据库：contains 边 Database→Table', () => {
    expect(databaseOfTable(sampleThreeLensModel, 't_payments')?.name).toBe('订单库');
    expect(databaseOfTable(sampleThreeLensModel, 't_audit_log')?.name).toBe('分析库');
    expect(databaseOfTable(sampleThreeLensModel, 't_orders')?.attrs?.engine).toBe('MySQL');
    expect(databaseOfTable(sampleThreeLensModel, 't_audit_log')?.attrs?.engine).toBe('PostgreSQL');
  });

  it('erDatabases 列出全部库 + 各自表/键清单（Redis 缓存收 3 个键）', () => {
    const dbs = erDatabases(sampleThreeLensModel);
    expect(dbs.map((d) => d.name)).toEqual(['订单库', '订单缓存', '分析库']);
    const order = dbs.find((d) => d.id === 'n_order_db')!;
    const analytics = dbs.find((d) => d.id === 'n_analytics_db')!;
    expect(order.tableIds).toContain('t_payments');
    expect(order.tableIds).not.toContain('t_audit_log');
    expect(analytics.tableIds).toEqual(['t_audit_log']);
    expect(analytics.engine).toBe('PostgreSQL');
    const cache = dbs.find((d) => d.id === 'n_cache')!;
    expect(cache.tableIds).toEqual(['k_session', 'k_order_cache', 'k_rank']);
    expect(cache.engine).toBe('Redis');
  });

  it('scope=订单缓存：只留 Redis 键；字段不独立投影（折进键卡片，渲染读全模型）', () => {
    const scoped = applyErScope(sampleThreeLensModel, erProj(), 'n_cache');
    const ids = Object.keys(scoped.nodes);
    expect(ids).toContain('k_session');
    expect(ids).toContain('k_order_cache');
    expect(ids).toContain('k_rank');
    expect(ids).not.toContain('t_orders');
    // 字段不在 ER 投影里（与表一致），但键卡片渲染仍能从全模型读到 hash 字段。
    expect(ids).not.toContain('f_sess_user');
    expect(erFieldRows(sampleThreeLensModel, 'k_session').length).toBe(3);
  });

  it('scope=分析库：只留它的表，跨库外键自动隐藏', () => {
    const scoped = applyErScope(sampleThreeLensModel, erProj(), 'n_analytics_db');
    expect(Object.keys(scoped.nodes).filter((id) => sampleThreeLensModel.nodes[id].type === 'Table')).toEqual(['t_audit_log']);
    // orders→audit_log 的外键一端在scope外 → 隐藏。
    expect(scoped.edges['fk_orders_audit']).toBeUndefined();
  });

  it('scope=订单库：六张表，不含 audit_log；库内外键保留', () => {
    const scoped = applyErScope(sampleThreeLensModel, erProj(), 'n_order_db');
    const tables = Object.keys(scoped.nodes).filter((id) => sampleThreeLensModel.nodes[id].type === 'Table');
    expect(tables).toHaveLength(6);
    expect(tables).not.toContain('t_audit_log');
    expect(scoped.edges['fk_orders_payments']).toBeDefined();
    expect(scoped.edges['fk_orders_audit']).toBeUndefined();
  });

  it('scope=all 原样；未知scope退回原样', () => {
    const proj = erProj();
    expect(applyErScope(sampleThreeLensModel, proj, 'all')).toBe(proj);
    expect(applyErScope(sampleThreeLensModel, proj, 'n_missing')).toBe(proj);
    expect(proj.edges['fk_orders_audit']).toBeDefined();
  });

  it('未归属表：单独scope可见，all 也可见', () => {
    const model: Model = {
      ...sampleThreeLensModel,
      nodes: { ...sampleThreeLensModel.nodes, t_loose: { type: 'Table', name: 'loose' } },
    };
    expect(unassignedTableIds(model)).toEqual(['t_loose']);
    const scoped = applyErScope(model, projectLens(model, getLens('er')), 'unassigned');
    expect(Object.keys(scoped.nodes)).toContain('t_loose');
    expect(Object.keys(scoped.nodes)).not.toContain('t_orders');
  });
});

describe('Redis 键空间与引擎推断', () => {
  it('isErStructure 收表与键，不收字段/库', () => {
    expect(isErStructure('Table')).toBe(true);
    expect(isErStructure('RedisKey')).toBe(true);
    expect(isErStructure('Field')).toBe(false);
    expect(isErStructure('Database')).toBe(false);
  });

  it('databaseEngine：显式 engine 优先，其次组件身份，最后 tech', () => {
    // 显式 engine。
    expect(databaseEngine(sampleThreeLensModel, sampleThreeLensModel.nodes.n_order_db)).toBe('MySQL');
    // 组件身份推断：redis 组件 → Redis（用户旧项目只有 component 没有 engine）。
    const redisOnly: Model = {
      ...sampleThreeLensModel,
      nodes: { ...sampleThreeLensModel.nodes, n_cache: { type: 'Database', name: '缓存', attrs: { component: 'redis' } } },
    };
    expect(databaseEngine(redisOnly, redisOnly.nodes.n_cache)).toBe('Redis');
    // 兜底 tech。
    const techOnly: Model = {
      ...sampleThreeLensModel,
      nodes: { ...sampleThreeLensModel.nodes, n_cache: { type: 'Database', name: '缓存', attrs: { tech: 'ClickHouse' } } },
    };
    expect(databaseEngine(techOnly, techOnly.nodes.n_cache)).toBe('ClickHouse');
  });

  it('databaseOfField：字段→结构→库，hash 字段归到 Redis', () => {
    expect(databaseOfField(sampleThreeLensModel, 'f_sess_user')?.name).toBe('订单缓存');
    expect(databaseOfField(sampleThreeLensModel, 'f_pay_id')?.name).toBe('订单库');
    expect(databaseOfField(sampleThreeLensModel, 'f_missing')).toBeUndefined();
  });

  it('hash 键的字段行带 Redis 类型；非 hash 键无字段行', () => {
    const rows = erFieldRows(sampleThreeLensModel, 'k_session');
    expect(rows.map((r) => r.name)).toEqual(['user_id', 'cart', 'last_seen']);
    expect(rows.map((r) => r.dataType)).toEqual(['number', 'json', 'timestamp']);
    expect(erFieldRows(sampleThreeLensModel, 'k_order_cache')).toEqual([]);
  });
});