/** 订单系统示例模型 —— 与 docs/design/core-semantics.md §1.1 的 running example 一致。 */
import type { Model } from './types';

export const sampleModel: Model = {
  schemaVersion: 1,
  name: '订单系统',
  nodes: {
    n_user: { type: 'Actor', name: '用户' },
    n_gateway: { type: 'Service', name: 'API 网关', attrs: { replicas: 2 } },
    n_order: { type: 'Service', name: '订单服务', attrs: { tech: 'Go', criticality: 'high' } },
    n_payment: { type: 'Service', name: '支付服务', attrs: { replicas: 3 } },
    n_risk: { type: 'Service', name: '风控服务' },
    n_order_db: { type: 'Database', name: '订单库' },
    n_events: { type: 'Queue', name: '订单事件队列' },
    n_notify: { type: 'Service', name: '通知服务' },
  },
  edges: {
    e_user_gw: { type: 'calls', from: 'n_user', to: 'n_gateway', label: '下单请求' },
    e_gw_order: { type: 'calls', from: 'n_gateway', to: 'n_order', attrs: { protocol: 'HTTP', latencyMs: 8 } },
    e_order_pay: { type: 'calls', from: 'n_order', to: 'n_payment', attrs: { dependency: 'hard', latencyMs: 120 } },
    e_order_risk: {
      type: 'calls',
      from: 'n_order',
      to: 'n_risk',
      attrs: { dependency: 'soft', fallback: '降级为事后人工审核' },
    },
    e_order_db: { type: 'writes', from: 'n_order', to: 'n_order_db' },
    e_order_evt: {
      type: 'publishes',
      from: 'n_order',
      to: 'n_events',
      attrs: { dependency: 'soft', fallback: '本地 outbox 暂存' },
    },
    e_evt_notify: { type: 'subscribes', from: 'n_notify', to: 'n_events' },
  },
  groups: {
    g_trade: { name: '交易域', members: ['n_order', 'n_payment', 'n_risk', 'n_order_db'] },
  },
};

/** 手写布局（spike 不做自动布局；正式产品中布局存 views.json，不存模型）。 */
export const samplePositions: Record<string, { x: number; y: number }> = {
  n_user: { x: 0, y: 190 },
  n_gateway: { x: 210, y: 190 },
  n_order: { x: 450, y: 190 },
  n_payment: { x: 750, y: 30 },
  n_risk: { x: 750, y: 170 },
  n_order_db: { x: 750, y: 310 },
  n_events: { x: 450, y: 430 },
  n_notify: { x: 150, y: 430 },
};
