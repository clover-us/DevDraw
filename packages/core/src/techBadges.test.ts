import { describe, expect, it } from 'vitest';
import { resolveTechBadges } from './techBadges';
import { parseArchDsl, serializeSlotToDsl } from './dsl/parser';
import { exportSlotToSvg } from './export/exporters';
import type { CanvasSlot } from './types';

describe('techBadges & ER cardinality roundtrip', () => {
  it('resolves compound developer tech stack strings into brand badges', () => {
    const resolved = resolveTechBadges('Go / gRPC / Redis Cluster / CustomEngine');
    expect(resolved).toHaveLength(4);
    expect(resolved[0].badge?.id).toBe('go');
    expect(resolved[1].badge?.id).toBe('grpc');
    expect(resolved[2].badge?.id).toBe('redis');
    expect(resolved[3].badge).toBeUndefined();
    expect(resolved[3].raw).toBe('CustomEngine');
  });

  it('roundtrips edge cardinality through .arch DSL and renders badges in SVG export', () => {
    const slot: CanvasSlot = {
      id: 'er-test',
      name: 'ER 测试',
      nodes: [
        {
          id: 'n1',
          dslId: 'users',
          kind: 'er_table',
          title: '用户表',
          tag: 'TABLE',
          tech: 'PostgreSQL 16',
          note: '',
          color: 'sky',
          x: 0,
          y: 0,
        },
        {
          id: 'n2',
          dslId: 'orders',
          kind: 'er_table',
          title: '订单表',
          tag: 'TABLE',
          tech: 'PostgreSQL',
          note: '',
          color: 'violet',
          x: 340,
          y: 0,
        },
      ],
      edges: [
        {
          id: 'e1',
          from: 'n1',
          to: 'n2',
          label: '下单',
          protocol: 'SQL',
          cardinality: '1:N',
        },
      ],
    };

    const dsl = serializeSlotToDsl(slot);
    expect(dsl).toContain('[SQL, 1:N]');

    const parsed = parseArchDsl(dsl);
    expect(parsed.edges).toHaveLength(1);
    expect(parsed.edges[0].cardinality).toBe('1:N');
    expect(parsed.edges[0].protocol).toBe('SQL');

    const svg = exportSlotToSvg(slot);
    expect(svg).toContain('PG');
    expect(svg).toContain('1:N');
  });
});
