/**
 * 类型注册表（数据，不是枚举）。每个类型声明镜片归属 + 属性软 schema + 可参与边。
 * 设计依据：docs/design/lens-model.md §4.2。类型携带意义；推演语义由镜片推演器分派。
 */
import type { NodeType } from '../types';
import type { TypeDef } from './types';

export const NODE_TYPES: Record<NodeType, TypeDef> = {
  Service: {
    id: 'Service',
    label: '服务',
    lenses: ['architecture'],
    attrs: { replicas: '副本数', tech: '技术栈', criticality: '关键度' },
    edges: { asSource: ['calls', 'reads', 'writes', 'publishes', 'subscribes', 'depends-on'], asTarget: ['calls'] },
  },
  Database: {
    id: 'Database',
    label: '数据库',
    lenses: ['architecture'],
    // persistence / eviction 只对 Redis 这类内存引擎有意义，AttrsEditor 按引擎显隐。
    attrs: { engine: '引擎', version: '版本', charset: '字符集', persistence: '持久化', eviction: '淘汰策略', comment: '备注' },
    edges: { asSource: ['contains'], asTarget: ['reads', 'writes'] },
  },
  Table: {
    id: 'Table',
    label: '表',
    lenses: ['er'],
    attrs: { engine: '存储引擎', charset: '字符集', comment: '备注' },
    edges: { asSource: ['contains', 'fk', 'has-lifecycle'], asTarget: ['contains', 'fk', 'reads', 'writes'] },
  },
  RedisKey: {
    id: 'RedisKey',
    label: '键',
    lenses: ['er'],
    attrs: { structure: '结构', ttl: 'TTL', comment: '备注' },
    // hash 的字段复用 Field（contains）；键本身挂在 Database 下（contains）。
    edges: { asSource: ['contains'], asTarget: ['contains', 'reads', 'writes'] },
  },
  Field: {
    id: 'Field',
    label: '字段',
    lenses: ['er'],
    attrs: {
      dataType: '数据类型',
      key: '键',
      nullable: '可空',
      unique: '唯一',
      autoIncrement: '自增',
      default: '默认值',
      comment: '备注',
    },
    edges: { asSource: ['encodes'], asTarget: ['contains'] },
  },
  Queue: {
    id: 'Queue',
    label: '队列',
    lenses: ['architecture'],
    edges: { asTarget: ['publishes', 'subscribes'] },
  },
  Endpoint: { id: 'Endpoint', label: '端点', lenses: ['architecture'] },
  ExternalSystem: { id: 'ExternalSystem', label: '外部系统', lenses: ['architecture'] },
  Actor: { id: 'Actor', label: '角色', lenses: ['architecture'], edges: { asSource: ['calls'] } },
  Decision: {
    id: 'Decision',
    label: '决策',
    lenses: ['architecture', 'er', 'state-machine'],
    attrs: { about: '关联节点', topic: '议题', detail: '决策内容' },
  },
  Assumption: {
    id: 'Assumption',
    label: '假设',
    lenses: ['architecture', 'er', 'state-machine'],
    attrs: { about: '关联节点', topic: '议题', detail: '假设内容' },
  },
  Note: { id: 'Note', label: '笔记', lenses: ['architecture', 'er', 'state-machine'] },
  Lifecycle: {
    id: 'Lifecycle',
    label: '生命周期',
    lenses: ['state-machine'],
    edges: { asSource: ['contains'], asTarget: ['has-lifecycle', 'encodes'] },
  },
  State: {
    id: 'State',
    label: '状态',
    lenses: ['state-machine'],
    attrs: { initial: '初始态', terminal: '终态' },
    edges: { asSource: ['transition'], asTarget: ['transition', 'contains'] },
  },
};
