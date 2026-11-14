/**
 * 组件目录 —— 类型注册表「是数据不是枚举」的显性化。
 * 内置组件在代码里（BUILTIN_COMPONENTS）；自定义组件存 model.components，随项目走、git 友好。
 * 关键纪律：组件 = 语义底座(baseType) + 表现身份(icon/category/name)。语义类型保持稳定，
 * 推演器照跑（Redis 仍是 Database）；图标只是皮肤，存 node.attrs，删组件不破坏已有节点。
 */
import type { ComponentDef, Model, ModelNode, NodeType } from './types';

export interface ComponentCategory {
  id: string;
  label: string;
}

/** 分类目录（有序）。 */
export const COMPONENT_CATEGORIES: ComponentCategory[] = [
  { id: 'compute', label: '计算' },
  { id: 'gateway', label: '网关与流量' },
  { id: 'data', label: '数据存储' },
  { id: 'messaging', label: '消息与流' },
  { id: 'observability', label: '可观测' },
  { id: 'infra', label: '基础设施' },
  { id: 'knowledge', label: '知识与决策' },
];

export function categoryLabel(id: string): string {
  return COMPONENT_CATEGORIES.find((c) => c.id === id)?.label ?? '其他';
}

/** 内置组件：高辨识度技术组件，映射到稳定语义底座。 */
export const BUILTIN_COMPONENTS: ComponentDef[] = [
  // 计算
  { id: 'service', name: '业务服务', baseType: 'Service', icon: 'service', category: 'compute', description: '通用微服务 / 业务进程' },
  { id: 'container', name: '容器实例', baseType: 'Service', icon: 'container', category: 'compute', description: 'Docker 容器运行的服务' },
  { id: 'kubernetes', name: 'Kubernetes', baseType: 'Service', icon: 'orchestration', category: 'compute', description: '容器编排平台 / 集群' },
  { id: 'serverless', name: '函数计算', baseType: 'Service', icon: 'function', category: 'compute', description: 'FaaS / Serverless' },
  { id: 'server', name: '服务器', baseType: 'Service', icon: 'server', category: 'compute', description: '物理机 / 虚拟机节点' },
  { id: 'actor', name: '用户角色', baseType: 'Actor', icon: 'actor', category: 'compute', description: '发起请求的人或终端' },
  { id: 'client', name: '终端客户端', baseType: 'Endpoint', icon: 'client', category: 'compute', description: 'Web / 移动客户端' },
  // 网关与流量
  { id: 'gateway', name: 'API 网关', baseType: 'Service', icon: 'gateway', category: 'gateway', description: '统一入口 · 路由 · 鉴权' },
  { id: 'ingress', name: 'Ingress', baseType: 'Service', icon: 'ingress', category: 'gateway', description: 'K8s 集群入口流量' },
  { id: 'lb', name: '负载均衡', baseType: 'Service', icon: 'loadbalancer', category: 'gateway', description: '分发流量到多实例' },
  { id: 'cdn', name: 'CDN', baseType: 'ExternalSystem', icon: 'cdn', category: 'gateway', description: '内容分发网络' },
  { id: 'firewall', name: '防火墙', baseType: 'Service', icon: 'firewall', category: 'gateway', description: '边界安全防护' },
  { id: 'external', name: '第三方系统', baseType: 'ExternalSystem', icon: 'external', category: 'gateway', description: '外部依赖系统' },
  // 数据存储
  { id: 'mysql', name: 'MySQL', baseType: 'Database', icon: 'relational-db', category: 'data', description: '关系型数据库' },
  { id: 'postgres', name: 'PostgreSQL', baseType: 'Database', icon: 'relational-db', category: 'data', description: '关系型数据库' },
  { id: 'mongodb', name: 'MongoDB', baseType: 'Database', icon: 'document-db', category: 'data', description: '文档数据库' },
  { id: 'redis', name: 'Redis', baseType: 'Database', icon: 'cache', category: 'data', description: '内存缓存 / KV 存储' },
  { id: 'elasticsearch', name: 'ElasticSearch', baseType: 'Database', icon: 'search', category: 'data', description: '搜索 / 分析引擎' },
  { id: 'oss', name: '对象存储', baseType: 'Database', icon: 'object-storage', category: 'data', description: 'OSS / MinIO / S3' },
  { id: 'database', name: '数据库', baseType: 'Database', icon: 'database', category: 'data', description: '通用数据存储' },
  // 消息与流
  { id: 'kafka', name: 'Kafka', baseType: 'Queue', icon: 'stream', category: 'messaging', description: '分布式事件流' },
  { id: 'rabbitmq', name: 'RabbitMQ', baseType: 'Queue', icon: 'queue', category: 'messaging', description: '消息队列' },
  { id: 'rocketmq', name: 'RocketMQ', baseType: 'Queue', icon: 'queue', category: 'messaging', description: '消息队列' },
  { id: 'eventbus', name: '事件总线', baseType: 'Queue', icon: 'event-bus', category: 'messaging', description: '领域事件发布订阅' },
  // 可观测
  { id: 'prometheus', name: 'Prometheus', baseType: 'Service', icon: 'monitoring', category: 'observability', description: '指标采集 / 监控' },
  { id: 'grafana', name: 'Grafana', baseType: 'Service', icon: 'dashboard', category: 'observability', description: '可视化仪表盘' },
  { id: 'skywalking', name: 'SkyWalking', baseType: 'Service', icon: 'tracing', category: 'observability', description: '分布式链路追踪' },
  { id: 'logging', name: '日志平台', baseType: 'Service', icon: 'logging', category: 'observability', description: 'ELK / 日志聚合' },
  { id: 'alert', name: '告警平台', baseType: 'Service', icon: 'alert', category: 'observability', description: '告警通知' },
  // 基础设施
  { id: 'nacos', name: 'Nacos', baseType: 'Service', icon: 'registry', category: 'infra', description: '注册中心 + 配置中心' },
  { id: 'config', name: '配置中心', baseType: 'Service', icon: 'config', category: 'infra', description: '集中配置管理' },
  { id: 'sentinel', name: 'Sentinel', baseType: 'Service', icon: 'circuit-breaker', category: 'infra', description: '限流 / 熔断降级' },
  { id: 'seata', name: 'Seata', baseType: 'Service', icon: 'transaction', category: 'infra', description: '分布式事务' },
  { id: 'scheduler', name: '调度中心', baseType: 'Service', icon: 'scheduler', category: 'infra', description: '分布式任务调度' },
  { id: 'dns', name: 'DNS', baseType: 'ExternalSystem', icon: 'dns', category: 'infra', description: '域名解析' },
  // 知识与决策
  { id: 'decision', name: '决策记录', baseType: 'Decision', icon: 'decision', category: 'knowledge', description: 'ADR · 设计决策' },
  { id: 'assumption', name: '假设', baseType: 'Assumption', icon: 'assumption', category: 'knowledge', description: '待验证的假设' },
  { id: 'note', name: '笔记', baseType: 'Note', icon: 'note', category: 'knowledge', description: '自由笔记 / 知识卡片' },
];

/** 语义类型 → 兜底图标（节点没有组件身份时用）。 */
export const DEFAULT_NODE_ICON: Record<NodeType, string> = {
  Service: 'service',
  Database: 'database',
  Table: 'table',
  Field: 'field',
  Queue: 'queue',
  Endpoint: 'endpoint',
  ExternalSystem: 'external',
  Actor: 'actor',
  Decision: 'decision',
  Assumption: 'assumption',
  Note: 'note',
  Lifecycle: 'lifecycle',
  State: 'state',
};

/** 完整目录 = 内置 + 自定义（自定义可覆盖同 id 内置）。 */
export function componentCatalog(model: Model): ComponentDef[] {
  const custom = Object.values(model.components ?? {});
  const customIds = new Set(custom.map((c) => c.id));
  return [...BUILTIN_COMPONENTS.filter((c) => !customIds.has(c.id)), ...custom];
}

/** 解析组件 id（自定义优先，其次内置）。 */
export function resolveComponent(model: Model, id: string | undefined): ComponentDef | undefined {
  if (!id) return undefined;
  return model.components?.[id] ?? BUILTIN_COMPONENTS.find((c) => c.id === id);
}

/** 节点最终渲染的 glyph id：attrs.icon 快照 > 组件图标 > 语义类型兜底 > 拼图。 */
export function nodeGlyph(model: Model, node: ModelNode): string {
  const snapshot = node.attrs?.icon;
  if (typeof snapshot === 'string' && snapshot) return snapshot;
  const comp = resolveComponent(model, typeof node.attrs?.component === 'string' ? node.attrs.component : undefined);
  if (comp) return comp.icon;
  return DEFAULT_NODE_ICON[node.type] ?? 'component';
}

/** 节点关联的组件（若有）。 */
export function nodeComponent(model: Model, node: ModelNode): ComponentDef | undefined {
  return resolveComponent(model, typeof node.attrs?.component === 'string' ? node.attrs.component : undefined);
}

/** 由组件实例化一个节点（icon 快照进 attrs，删组件不破坏节点）。id 由调用方生成。 */
export function nodeFromComponent(comp: ComponentDef, name?: string): ModelNode {
  return {
    type: comp.baseType,
    name: name?.trim() || comp.name,
    attrs: { ...comp.attrs, component: comp.id, icon: comp.icon },
    provenance: { by: 'human' },
  };
}