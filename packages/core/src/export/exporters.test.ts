import { describe, expect, it } from 'vitest';
import {
  exportSlotToInteractiveHtml,
  exportSlotToJson,
  exportSlotToMarkdownAdr,
  exportSlotToMermaid,
  exportSlotToSvg,
} from './exporters';
import { buildScenePresetForTemplate } from '../presets';
import type { CanvasSlot } from '../types';

describe('@devdraw/core multi-format exporters', () => {
  it('exports ER relational modeling slot as Mermaid erDiagram with fields & cardinality', () => {
    const dataLayer = buildScenePresetForTemplate('数据建模');
    const erSlot = dataLayer.children![0];

    const mmd = exportSlotToMermaid(erSlot);
    expect(mmd).toContain('erDiagram');
    expect(mmd).toContain('users {');
    expect(mmd).toContain('BIGINT user_id PK');
    expect(mmd).toContain('users ||--o{ projects');
  });

  it('exports DDD domain layer as Mermaid classDiagram', () => {
    const dddLayer = buildScenePresetForTemplate('接口契约与领域边界');
    const slot: CanvasSlot = {
      id: 'ddd-only',
      name: dddLayer.name,
      nodes: dddLayer.nodes.filter((n) => n.kind.startsWith('ddd_')),
      edges: dddLayer.edges,
    };

    const mmd = exportSlotToMermaid(slot);
    expect(mmd).toContain('classDiagram');
    expect(mmd).toContain('class ');
  });

  it('exports system architecture slot as Mermaid flowchart LR with subgraph and annotation style', () => {
    const arch = buildScenePresetForTemplate('系统架构拓扑');
    const slot: CanvasSlot = {
      id: 'arch-1',
      name: arch.name,
      nodes: arch.nodes,
      edges: arch.edges,
      flows: arch.flows,
    };

    const mmd = exportSlotToMermaid(slot);
    expect(mmd).toContain('flowchart LR');
    expect(mmd).toContain('subgraph LAYER[');
    expect(mmd).toContain(':::annotation');
    expect(mmd).toContain('classDef annotation stroke-dasharray: 5 5;');
  });

  it('exports valid theme-aware SVG with tight viewBox and XML escaping', () => {
    const slot: CanvasSlot = {
      id: 'svg-test',
      name: 'SVG Test',
      nodes: [
        {
          id: 'n1',
          kind: 'service',
          title: 'Auth <OAuth2> & "SSO"',
          tag: 'AUTH',
          note: 'Handles <tokens> & sessions',
          color: 'violet',
          x: 100,
          y: 200,
          w: 240,
          h: 96,
        },
        {
          id: 'n2',
          kind: 'db',
          title: 'Users DB',
          tag: 'PG',
          note: '',
          color: 'emerald',
          x: 460,
          y: 200,
          w: 240,
          h: 96,
        },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2', label: 'SQL & read', routing: 'orthogonal', dashed: true },
      ],
    };

    const darkSvg = exportSlotToSvg(slot, 'dark');
    expect(darkSvg.startsWith('<svg ')).toBe(true);
    expect(darkSvg).toContain('#110e17');
    expect(darkSvg).toContain('Auth &lt;OAuth2&gt; &amp; &quot;SSO&quot;');
    expect(darkSvg).toContain('stroke-dasharray="6 5"');
    expect(darkSvg).toContain('L 400 248'); // orthogonal midpoint

    const lightSvg = exportSlotToSvg(slot, 'light');
    expect(lightSvg).toContain('#f3f5f9');

    // Empty canvas still produces a valid fallback viewBox
    const emptySvg = exportSlotToSvg({ id: 'empty', name: 'Empty', nodes: [], edges: [] });
    expect(emptySvg).toContain('viewBox="');
  });

  it('exports valid JSON and XSS-safe self-contained interactive HTML snapshot', () => {
    const arch = buildScenePresetForTemplate('系统架构拓扑');
    const slot: CanvasSlot = {
      id: 'arch-html',
      name: '核心链路 </script>',
      nodes: arch.nodes,
      edges: arch.edges,
      flows: arch.flows,
    };

    const json = exportSlotToJson(slot);
    const parsed = JSON.parse(json) as CanvasSlot;
    expect(parsed.nodes.length).toBe(arch.nodes.length);

    const html = exportSlotToInteractiveHtml(slot, 'DevDraw Demo');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('DevDraw Demo');
    // Embedded JSON payload must escape `<` so `</script>` cannot break out of script tag
    expect(html).toContain('\\u003c/script>');
    expect(html).toContain('id="player"');
  });

  it('renders ER fields, custom styles, waypoints, and freehand strokes in upgraded SVG', () => {
    const dataLayer = buildScenePresetForTemplate('数据建模');
    const erSlot: CanvasSlot = {
      ...dataLayer.children![0],
      edges: [
        {
          ...dataLayer.children![0].edges[0],
          waypoints: [
            { x: 320, y: 120 },
            { x: 350, y: 120 },
          ],
        },
      ],
      freehand: [
        { id: 'f1', color: '#34d399', width: 2.5, points: [{ x: 10, y: 10 }, { x: 80, y: 40 }] },
      ],
    };

    const svg = exportSlotToSvg(erSlot, 'dark', { er_main: { accentBar: 'top' } });
    expect(svg).toContain('user_id');
    expect(svg).toContain('BIGINT');
    expect(svg).toContain('PK');
    expect(svg).toContain('L 320 120 L 350 120');
    expect(svg).toContain('<polyline points="10,10 80,40"');
  });

  it('exports Markdown / ADR engineering document with Mermaid, entities, annotations, and flows', () => {
    const arch = buildScenePresetForTemplate('系统架构拓扑');
    const slot: CanvasSlot = {
      id: 'arch-md',
      name: arch.name,
      nodes: arch.nodes,
      edges: arch.edges,
      flows: arch.flows,
    };

    const md = exportSlotToMarkdownAdr(slot, '订单中心架构');
    expect(md).toContain('# 订单中心架构 — 系统架构拓扑');
    expect(md).toContain('```mermaid');
    expect(md).toContain('## 2. 核心实体清单');
    expect(md).toContain('研思推演记录');
    expect(md).toContain('动态推演链路');
  });
});
