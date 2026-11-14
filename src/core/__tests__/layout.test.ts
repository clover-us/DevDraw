import { describe, expect, it } from 'vitest';
import { layoutProjection } from '../layout';
import { getLens, projectLens } from '../registry';
import { sampleThreeLensModel } from '../sample-three-lens';

describe('layoutProjection（ELK 自动布局）', () => {
  it('架构镜片：为每个投影节点产出有限坐标', async () => {
    const projection = projectLens(sampleThreeLensModel, getLens('architecture'));
    const pos = await layoutProjection(projection, 'architecture');
    const ids = Object.keys(projection.nodes);
    expect(ids.length).toBe(8);
    for (const id of ids) {
      expect(pos[id]).toBeDefined();
      expect(Number.isFinite(pos[id].x)).toBe(true);
      expect(Number.isFinite(pos[id].y)).toBe(true);
    }
  });

  it('ER 镜片：字段排在所属表下方（contains 边驱动分层）', async () => {
    const projection = projectLens(sampleThreeLensModel, getLens('er'));
    const pos = await layoutProjection(projection, 'er');
    expect(Object.keys(pos).length).toBe(Object.keys(projection.nodes).length);
    const containsTableField = Object.values(projection.edges).filter(
      (e) => e.type === 'contains' && projection.nodes[e.from]?.type === 'Table' && projection.nodes[e.to]?.type === 'Field',
    );
    expect(containsTableField.length).toBeGreaterThan(0);
    for (const e of containsTableField) {
      expect(pos[e.to].y).toBeGreaterThan(pos[e.from].y);
    }
  });

  it('状态机镜片：初始态在终态左侧（左→右流）', async () => {
    const projection = projectLens(sampleThreeLensModel, getLens('state-machine'));
    const pos = await layoutProjection(projection, 'state-machine');
    expect(Object.keys(pos).length).toBe(7);
    expect(pos['s_created'].x).toBeLessThan(pos['s_completed'].x);
  });

  it('确定性：同一投影两次布局结果一致', async () => {
    const projection = projectLens(sampleThreeLensModel, getLens('architecture'));
    const a = await layoutProjection(projection, 'architecture');
    const b = await layoutProjection(projection, 'architecture');
    expect(a).toEqual(b);
  });

  it('空投影：返回空坐标表', async () => {
    const pos = await layoutProjection({ nodes: {}, edges: {} }, 'architecture');
    expect(pos).toEqual({});
  });
});
