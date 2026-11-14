/**
 * 三镜片共用模型 —— 架构 + ER + 状态机，跨镜片边连成一张图。
 * 设计依据：docs/design/lens-model.md §2、§3。架构部分复用 sample.ts（spike 原样）。
 *
 * 刻意埋入的"顶嘴"素材：
 *  - 状态机：tr_fulfill / tr_deliver 引用 n_fulfillment，但架构无此服务 → 履约缺口（Order 卡在 Paid）。
 *  - 状态机：Paid 不可取消而 AwaitingPayment 可 → 缺失迁移反问。
 *  - ER：orders ↔ products 直连 N:M（缺中间表）；order_items.order_id 可空（孤儿记录反问）。
 */
import { sampleModel, samplePositions } from './sample';
import type { Model } from './types';

/** 架构节点 → 内置组件身份（图标由组件目录解析，语义底座不变，推演照算）。 */
const ARCH_IDENTITY: Record<string, string> = {
  n_user: 'actor',
  n_gateway: 'gateway',
  n_order: 'service',
  n_payment: 'service',
  n_risk: 'sentinel',
  n_order_db: 'mysql',
  n_events: 'kafka',
  n_notify: 'service',
};

export const sampleThreeLensModel: Model = {
  schemaVersion: 1,
  name: '订单系统 · 三镜片',
  nodes: {
    ...Object.fromEntries(
      Object.entries(sampleModel.nodes).map(([id, n]) => [
        id,
        ARCH_IDENTITY[id] ? { ...n, attrs: { ...n.attrs, component: ARCH_IDENTITY[id] } } : n,
      ]),
    ),
    // ── ER：表 ──
    t_orders: { type: 'Table', name: 'orders' },
    t_order_items: { type: 'Table', name: 'order_items' },
    t_payments: { type: 'Table', name: 'payments' },
    t_refunds: { type: 'Table', name: 'refunds' },
    t_products: { type: 'Table', name: 'products' },
    // ── ER：字段 ──
    f_orders_id: { type: 'Field', name: 'id', attrs: { dataType: 'bigint', key: 'PK' } },
    f_orders_status: { type: 'Field', name: 'status', attrs: { dataType: 'varchar' } },
    f_orders_amount: { type: 'Field', name: 'amount', attrs: { dataType: 'decimal' } },
    f_items_id: { type: 'Field', name: 'id', attrs: { dataType: 'bigint', key: 'PK' } },
    f_items_order_id: { type: 'Field', name: 'order_id', attrs: { dataType: 'bigint', nullable: true, key: 'FK' } },
    f_items_product_id: { type: 'Field', name: 'product_id', attrs: { dataType: 'bigint', key: 'FK' } },
    f_items_qty: { type: 'Field', name: 'qty', attrs: { dataType: 'int' } },
    f_pay_id: { type: 'Field', name: 'id', attrs: { dataType: 'bigint', key: 'PK' } },
    f_pay_order_id: { type: 'Field', name: 'order_id', attrs: { dataType: 'bigint', key: 'FK' } },
    f_pay_amount: { type: 'Field', name: 'amount', attrs: { dataType: 'decimal' } },
    f_ref_id: { type: 'Field', name: 'id', attrs: { dataType: 'bigint', key: 'PK' } },
    f_ref_pay_id: { type: 'Field', name: 'payment_id', attrs: { dataType: 'bigint', key: 'FK' } },
    f_ref_amount: { type: 'Field', name: 'amount', attrs: { dataType: 'decimal' } },
    f_prod_id: { type: 'Field', name: 'id', attrs: { dataType: 'bigint', key: 'PK' } },
    f_prod_name: { type: 'Field', name: 'name', attrs: { dataType: 'varchar' } },
    // ── 状态机：生命周期 + 状态 ──
    sm_order: { type: 'Lifecycle', name: '订单生命周期' },
    s_created: { type: 'State', name: 'Created', attrs: { initial: true } },
    s_awaiting: { type: 'State', name: 'AwaitingPayment' },
    s_paid: { type: 'State', name: 'Paid' },
    s_fulfilling: { type: 'State', name: 'Fulfilling' },
    s_completed: { type: 'State', name: 'Completed' },
    s_cancelled: { type: 'State', name: 'Cancelled' },
    s_refunded: { type: 'State', name: 'Refunded' },
  },
  edges: {
    ...sampleModel.edges,
    // ── ER：表 contains 字段 ──
    c_orders_id: { type: 'contains', from: 't_orders', to: 'f_orders_id' },
    c_orders_status: { type: 'contains', from: 't_orders', to: 'f_orders_status' },
    c_orders_amount: { type: 'contains', from: 't_orders', to: 'f_orders_amount' },
    c_items_id: { type: 'contains', from: 't_order_items', to: 'f_items_id' },
    c_items_order: { type: 'contains', from: 't_order_items', to: 'f_items_order_id' },
    c_items_product: { type: 'contains', from: 't_order_items', to: 'f_items_product_id' },
    c_items_qty: { type: 'contains', from: 't_order_items', to: 'f_items_qty' },
    c_pay_id: { type: 'contains', from: 't_payments', to: 'f_pay_id' },
    c_pay_order: { type: 'contains', from: 't_payments', to: 'f_pay_order_id' },
    c_pay_amount: { type: 'contains', from: 't_payments', to: 'f_pay_amount' },
    c_ref_id: { type: 'contains', from: 't_refunds', to: 'f_ref_id' },
    c_ref_pay: { type: 'contains', from: 't_refunds', to: 'f_ref_pay_id' },
    c_ref_amount: { type: 'contains', from: 't_refunds', to: 'f_ref_amount' },
    c_prod_id: { type: 'contains', from: 't_products', to: 'f_prod_id' },
    c_prod_name: { type: 'contains', from: 't_products', to: 'f_prod_name' },
    // ── ER：外键（parent 1 → child N，key 列在 child）──
    fk_orders_items: { type: 'fk', from: 't_orders', to: 't_order_items', attrs: { cardinality: '1:N', key: 'order_id' } },
    fk_orders_payments: { type: 'fk', from: 't_orders', to: 't_payments', attrs: { cardinality: '1:N', key: 'order_id' } },
    fk_payments_refunds: { type: 'fk', from: 't_payments', to: 't_refunds', attrs: { cardinality: '1:N', key: 'payment_id' } },
    fk_items_products: { type: 'fk', from: 't_products', to: 't_order_items', attrs: { cardinality: '1:N', key: 'product_id' } },
    // 刻意错误：orders ↔ products 直连 N:M，缺中间表（order_items 才是正解）
    fk_orders_products_nm: { type: 'fk', from: 't_orders', to: 't_products', attrs: { cardinality: 'N:M', key: 'product_id' } },
    // ── 跨镜片：架构 ↔ ER ──
    c_db_orders: { type: 'contains', from: 'n_order_db', to: 't_orders' },
    c_db_items: { type: 'contains', from: 'n_order_db', to: 't_order_items' },
    c_db_payments: { type: 'contains', from: 'n_order_db', to: 't_payments' },
    c_db_refunds: { type: 'contains', from: 'n_order_db', to: 't_refunds' },
    c_db_products: { type: 'contains', from: 'n_order_db', to: 't_products' },
    e_order_reads_orders: { type: 'reads', from: 'n_order', to: 't_orders' },
    e_order_writes_orders: { type: 'writes', from: 'n_order', to: 't_orders' },
    e_pay_writes_payments: { type: 'writes', from: 'n_payment', to: 't_payments' },
    // ── 跨镜片：ER ↔ 状态机 ──
    e_orders_lifecycle: { type: 'has-lifecycle', from: 't_orders', to: 'sm_order' },
    e_status_encodes: { type: 'encodes', from: 'f_orders_status', to: 'sm_order' },
    // ── 状态机：生命周期 contains 状态 ──
    c_sm_created: { type: 'contains', from: 'sm_order', to: 's_created' },
    c_sm_awaiting: { type: 'contains', from: 'sm_order', to: 's_awaiting' },
    c_sm_paid: { type: 'contains', from: 'sm_order', to: 's_paid' },
    c_sm_fulfilling: { type: 'contains', from: 'sm_order', to: 's_fulfilling' },
    c_sm_completed: { type: 'contains', from: 'sm_order', to: 's_completed' },
    c_sm_cancelled: { type: 'contains', from: 'sm_order', to: 's_cancelled' },
    c_sm_refunded: { type: 'contains', from: 'sm_order', to: 's_refunded' },
    // ── 状态机：迁移 ──
    tr_create: { type: 'transition', from: 's_created', to: 's_awaiting', attrs: { event: 'create', effectedBy: 'n_order' } },
    tr_pay: { type: 'transition', from: 's_awaiting', to: 's_paid', attrs: { event: 'pay', effectedBy: 'n_payment' } },
    tr_cancel_awaiting: { type: 'transition', from: 's_awaiting', to: 's_cancelled', attrs: { event: 'cancel', effectedBy: 'n_order' } },
    // 履约缺口：引用架构中不存在的 n_fulfillment
    tr_fulfill: { type: 'transition', from: 's_paid', to: 's_fulfilling', attrs: { event: 'fulfill', effectedBy: 'n_fulfillment' } },
    tr_deliver: { type: 'transition', from: 's_fulfilling', to: 's_completed', attrs: { event: 'deliver', effectedBy: 'n_fulfillment' } },
    tr_refund: { type: 'transition', from: 's_paid', to: 's_refunded', attrs: { event: 'refund', effectedBy: 'n_payment' } },
  },
  groups: sampleModel.groups,
};

/** 手写布局（正式产品中存 views.json）。架构复用 spike 坐标；ER 表+字段纵向堆叠；状态机左→右带分支。 */
export const threeLensPositions: Record<string, { x: number; y: number }> = {
  ...samplePositions,
  // 反问"新增履约服务"后动态加入的节点，预留一个架构镜片位置
  n_fulfillment: { x: 750, y: -120 },
  // ER 表
  t_orders: { x: 0, y: 0 },
  t_order_items: { x: 320, y: 0 },
  t_payments: { x: 640, y: 0 },
  t_refunds: { x: 960, y: 0 },
  t_products: { x: 1280, y: 0 },
  // ER 字段（堆在各自表下）
  f_orders_id: { x: 0, y: 90 },
  f_orders_status: { x: 0, y: 160 },
  f_orders_amount: { x: 0, y: 230 },
  f_items_id: { x: 320, y: 90 },
  f_items_order_id: { x: 320, y: 160 },
  f_items_product_id: { x: 320, y: 230 },
  f_items_qty: { x: 320, y: 300 },
  f_pay_id: { x: 640, y: 90 },
  f_pay_order_id: { x: 640, y: 160 },
  f_pay_amount: { x: 640, y: 230 },
  f_ref_id: { x: 960, y: 90 },
  f_ref_pay_id: { x: 960, y: 160 },
  f_ref_amount: { x: 960, y: 230 },
  f_prod_id: { x: 1280, y: 90 },
  f_prod_name: { x: 1280, y: 160 },
  // 状态机
  sm_order: { x: 0, y: 0 },
  s_created: { x: 0, y: 200 },
  s_awaiting: { x: 250, y: 200 },
  s_paid: { x: 500, y: 200 },
  s_fulfilling: { x: 750, y: 110 },
  s_completed: { x: 1000, y: 110 },
  s_cancelled: { x: 500, y: 380 },
  s_refunded: { x: 750, y: 320 },
};
