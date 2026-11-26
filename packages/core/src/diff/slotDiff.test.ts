import { describe, expect, it } from 'vitest';
import { computeSlotDiff } from './slotDiff';
import type { CanvasSlot } from '../types';

describe('computeSlotDiff', () => {
  it('detects added, modified, and removed nodes and edges while ignoring coordinate moves', () => {
    const base: Pick<CanvasSlot, 'nodes' | 'edges'> = {
      nodes: [
        {
          id: 'n1',
          dslId: 'gw',
          kind: 'gateway',
          title: 'API 网关',
          tag: 'GATEWAY',
          tech: 'Nginx',
          note: '',
          color: 'sky',
          x: 0,
          y: 0,
        },
        {
          id: 'n2',
          dslId: 'order_svc',
          kind: 'svc',
          title: '订单服务',
          tag: 'SERVICE',
          tech: 'Go',
          note: 'v1',
          color: 'violet',
          x: 300,
          y: 0,
        },
        {
          id: 'n3',
          dslId: 'legacy_db',
          kind: 'db',
          title: '老旧单库',
          tag: 'DB',
          note: '',
          color: 'amber',
          x: 600,
          y: 0,
        },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2', label: '下单', protocol: 'HTTP' },
        { id: 'e2', from: 'n2', to: 'n3', label: '写库', protocol: 'SQL' },
      ],
    };

    const current: Pick<CanvasSlot, 'nodes' | 'edges'> = {
      nodes: [
        // Pure coordinate nudge — should NOT be marked modified
        {
          id: 'n1-new-id',
          dslId: 'gw',
          kind: 'gateway',
          title: 'API 网关',
          tag: 'GATEWAY',
          tech: 'Nginx',
          note: '',
          color: 'sky',
          x: 120,
          y: 80,
        },
        // Tech & note changed — modified
        {
          id: 'n2',
          dslId: 'order_svc',
          kind: 'svc',
          title: '订单聚合服务',
          tag: 'SERVICE',
          tech: 'Go / gRPC',
          note: 'v2 拆库',
          color: 'violet',
          x: 300,
          y: 0,
        },
        // Newly added cache
        {
          id: 'n4',
          dslId: 'order_cache',
          kind: 'cache',
          title: '订单缓存',
          tag: 'CACHE',
          tech: 'Redis',
          note: '',
          color: 'rose',
          x: 600,
          y: 120,
        },
      ],
      edges: [
        // Protocol changed HTTP -> gRPC
        { id: 'e1', from: 'n1-new-id', to: 'n2', label: '下单', protocol: 'gRPC' },
        // Newly added edge
        { id: 'e3', from: 'n2', to: 'n4', label: '读缓存', protocol: 'Redis' },
      ],
    };

    const diff = computeSlotDiff(base, current);

    expect(diff.addedNodeIds).toEqual(['n4']);
    expect(Object.keys(diff.modifiedNodes)).toEqual(['n2']);
    expect(diff.modifiedNodes['n2'].summary).toContain('订单聚合服务');
    expect(diff.modifiedNodes['n2'].summary).toContain('Go / gRPC');
    expect(diff.removedNodes).toHaveLength(1);
    expect(diff.removedNodes[0].id).toBe('__ghost__legacy_db');

    expect(diff.addedEdgeIds).toEqual(['e3']);
    expect(diff.modifiedEdgeIds).toEqual(['e1']);
    expect(diff.removedEdges).toHaveLength(1);
    expect(diff.removedEdges[0].from).toBe('n2');
    expect(diff.removedEdges[0].to).toBe('__ghost__legacy_db');
    expect(diff.stats.hasChanges).toBe(true);
  });

  it('reports no changes when slots are semantically identical', () => {
    const slot: Pick<CanvasSlot, 'nodes' | 'edges'> = {
      nodes: [
        {
          id: 'a',
          dslId: 'svc_a',
          kind: 'svc',
          title: '服务 A',
          tag: 'SVC',
          note: '',
          color: 'sky',
          x: 10,
          y: 20,
        },
      ],
      edges: [],
    };
    const diff = computeSlotDiff(slot, {
      nodes: [{ ...slot.nodes[0], x: 400, y: 500 }],
      edges: [],
    });
    expect(diff.stats.hasChanges).toBe(false);
  });
});
