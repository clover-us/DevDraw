/** 边类型注册表。设计依据：docs/design/lens-model.md §4.4。 */
import type { EdgeType } from '../types';
import type { EdgeTypeDef, LensId } from './types';

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

/**
 * 结构边：由建模动作隐式生成（建表字段、挂生命周期、字段编码状态机），
 * 不在画布上直接画，也不该出现在「拖出连线后选类型」的菜单里。
 */
export const STRUCTURAL_EDGE_TYPES: EdgeType[] = ['contains', 'has-lifecycle', 'encodes'];

/**
 * 某副镜片里「人手可以画出来」的边类型。
 *
 * 拖线松手时用它做类型选择——边类型是最该由人决定的语义（同样是两个节点之间的线，
 * calls 和 publishes 的失效传播规则完全不同），不该由镜片偷偷替用户决定。
 */
export function connectableEdgeTypes(lens: LensId): EdgeTypeDef[] {
  return Object.values(EDGE_TYPES).filter(
    (def) => def.lenses.includes(lens) && !STRUCTURAL_EDGE_TYPES.includes(def.id),
  );
}
