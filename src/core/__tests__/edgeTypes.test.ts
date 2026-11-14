import { describe, expect, it } from 'vitest';
import { connectableEdgeTypes, EDGE_TYPES, STRUCTURAL_EDGE_TYPES } from '../registry';

/**
 * 拖线松手后的类型选择器依赖这份列表：
 * 只列本镜片能画的边，且必须排除结构边（contains 等由建模动作隐式生成）。
 */
describe('connectableEdgeTypes', () => {
  it('架构镜片：六种运行时依赖，按注册表顺序（calls 在前＝默认）', () => {
    const ids = connectableEdgeTypes('architecture').map((d) => d.id);
    expect(ids).toEqual(['calls', 'reads', 'writes', 'publishes', 'subscribes', 'depends-on']);
  });

  it('ER 镜片：读/写/外键三种（结构边 excluded）', () => {
    expect(connectableEdgeTypes('er').map((d) => d.id)).toEqual(['reads', 'writes', 'fk']);
  });

  it('状态机镜片：只剩迁移——因此不需要弹选择器', () => {
    expect(connectableEdgeTypes('state-machine').map((d) => d.id)).toEqual(['transition']);
  });

  it('任何镜片都不含结构边', () => {
    for (const lens of ['architecture', 'er', 'state-machine'] as const) {
      const ids = connectableEdgeTypes(lens).map((d) => d.id);
      for (const structural of STRUCTURAL_EDGE_TYPES) expect(ids).not.toContain(structural);
    }
  });

  it('返回的一定是本镜片的边类型', () => {
    for (const lens of ['architecture', 'er', 'state-machine'] as const) {
      for (const def of connectableEdgeTypes(lens)) expect(def.lenses).toContain(lens);
    }
  });

  it('结构边本身仍在注册表里（只是不给手画）', () => {
    expect(EDGE_TYPES.contains.lenses).toContain('er');
    expect(STRUCTURAL_EDGE_TYPES).toContain('contains');
  });
});