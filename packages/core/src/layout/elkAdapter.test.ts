import { describe, expect, it } from 'vitest';
import { computeAutoLayout } from './elkAdapter';
import { buildScenePresetForTemplate } from '../presets';
import type { EntityNode, RelationEdge } from '../types';

describe('@devdraw/core ELK hybrid auto-layout engine', () => {
  it('lays out system architecture preset left-to-right with finite coordinates', async () => {
    const preset = buildScenePresetForTemplate('系统架构拓扑');
    const result = await computeAutoLayout(preset.nodes, preset.edges, {
      direction: 'RIGHT',
      respectPinned: false,
    });

    expect(result.nodes).toHaveLength(preset.nodes.length);
    expect(result.edges).toHaveLength(preset.edges.length);

    for (const node of result.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
      expect(node.pinned).toBe(false);
    }

    // Verify upstream gateway sits to the left of downstream storage/service
    const byId = new Map(result.nodes.map((n) => [n.id, n]));
    const firstEdge = preset.edges[0];
    const src = byId.get(firstEdge.from)!;
    const dst = byId.get(firstEdge.to)!;
    expect(src.x).toBeLessThan(dst.x);
  });

  it('docks linked reasoning annotations directly underneath their target entity without overlap', async () => {
    const nodes: EntityNode[] = [
      {
        id: 'svc-1',
        kind: 'service',
        title: '核心服务',
        tag: 'Service',
        note: '',
        color: 'sky',
        x: 0,
        y: 0,
      },
      {
        id: 'db-1',
        kind: 'db',
        title: '主数据库',
        tag: 'DB',
        note: '',
        color: 'emerald',
        x: 0,
        y: 0,
      },
      {
        id: 'ann-1',
        kind: 'assumption',
        title: '并发假设',
        tag: 'Assumption',
        note: '峰值 20k QPS',
        color: 'amber',
        linkNodeId: 'svc-1',
        x: 999,
        y: 999,
      },
      {
        id: 'ann-2',
        kind: 'decision',
        title: '架构决策',
        tag: 'Decision',
        note: '采用读写分离',
        color: 'emerald',
        linkNodeId: 'svc-1',
        x: 888,
        y: 888,
      },
    ];
    const edges: RelationEdge[] = [
      { id: 'e1', from: 'svc-1', to: 'db-1', label: 'SQL' },
    ];

    const result = await computeAutoLayout(nodes, edges, { direction: 'RIGHT' });
    const byId = new Map(result.nodes.map((n) => [n.id, n]));

    const svc = byId.get('svc-1')!;
    const ann1 = byId.get('ann-1')!;
    const ann2 = byId.get('ann-2')!;

    // Both annotations align horizontally with their target entity and stack vertically below it
    expect(ann1.x).toBe(svc.x);
    expect(ann2.x).toBe(svc.x);
    expect(ann1.y).toBeGreaterThan(svc.y + 96);
    expect(ann2.y).toBeGreaterThan(ann1.y + 88);
  });

  it('preserves coordinates of pinned nodes when respectPinned is true', async () => {
    const nodes: EntityNode[] = [
      {
        id: 'a',
        kind: 'service',
        title: '固定服务',
        tag: 'Service',
        note: '',
        color: 'sky',
        x: 777,
        y: 333,
        pinned: true,
      },
      {
        id: 'b',
        kind: 'service',
        title: '自由服务',
        tag: 'Service',
        note: '',
        color: 'violet',
        x: 0,
        y: 0,
        pinned: false,
      },
    ];
    const edges: RelationEdge[] = [{ id: 'e1', from: 'a', to: 'b', label: 'calls' }];

    const incremental = await computeAutoLayout(nodes, edges, { respectPinned: true });
    const pinnedNode = incremental.nodes.find((n) => n.id === 'a')!;
    expect(pinnedNode.x).toBe(777);
    expect(pinnedNode.y).toBe(333);
    expect(pinnedNode.pinned).toBe(true);

    // Full re-layout resets pinned flag and repositions
    const full = await computeAutoLayout(nodes, edges, { respectPinned: false });
    const resetNode = full.nodes.find((n) => n.id === 'a')!;
    expect(resetNode.pinned).toBe(false);
    expect(resetNode.x).not.toBe(777);
  });

  it('supports vertical DOWN layout direction', async () => {
    const nodes: EntityNode[] = [
      { id: 'top', kind: 'ingress', title: '入口', tag: 'GW', note: '', color: 'violet', x: 0, y: 0 },
      { id: 'bot', kind: 'db', title: '存储', tag: 'DB', note: '', color: 'emerald', x: 0, y: 0 },
    ];
    const edges: RelationEdge[] = [{ id: 'e1', from: 'top', to: 'bot', label: 'query' }];

    const result = await computeAutoLayout(nodes, edges, { direction: 'DOWN' });
    const top = result.nodes.find((n) => n.id === 'top')!;
    const bot = result.nodes.find((n) => n.id === 'bot')!;
    expect(top.y).toBeLessThan(bot.y);
  });
});
