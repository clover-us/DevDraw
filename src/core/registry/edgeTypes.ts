/** 边类型注册表。设计依据：docs/design/lens-model.md §4.4。 */
import type { EdgeType } from '../types';
import type { EdgeTypeDef } from './types';

export const EDGE_TYPES: Record<EdgeType, EdgeTypeDef> = {
  calls: { id: 'calls', label: '调用', lenses: ['architecture'], attrs: { dependency: '依赖模式', latencyMs: '延迟', protocol: '协议' } },
  reads: { id: 'reads', label: '读', lenses: ['architecture', 'er'], attrs: { dependency: '依赖模式' } },
  writes: { id: 'writes', label: '写', lenses: ['architecture', 'er'], attrs: { dependency: '依赖模式' } },
  publishes: { id: 'publishes', label: '发布', lenses: ['architecture'], attrs: { dependency: '依赖模式', fallback: '兜底' } },
  subscribes: { id: 'subscribes', label: '订阅', lenses: ['architecture'], attrs: { dependency: '依赖模式' } },
  'depends-on': { id: 'depends-on', label: '依赖', lenses: ['architecture'] },
  contains: { id: 'contains', label: '包含', lenses: ['architecture', 'er', 'state-machine'] },
  fk: { id: 'fk', label: '外键', lenses: ['er'], attrs: { cardinality: '基数', key: '外键列' } },
  transition: { id: 'transition', label: '迁移', lenses: ['state-machine'], attrs: { event: '事件', effectedBy: '实现服务', manual: '人工' } },
  'has-lifecycle': { id: 'has-lifecycle', label: '拥有生命周期', lenses: ['er', 'state-machine'] },
  encodes: { id: 'encodes', label: '编码', lenses: ['er', 'state-machine'] },
};
