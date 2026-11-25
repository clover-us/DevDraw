import { describe, expect, it } from 'vitest';
import {
  appendEdgeToDsl,
  appendEntityToDsl,
  applyTextPatch,
  createRenameEntityPatch,
  deleteEdgesFromDsl,
  deleteEntityFromDsl,
  locateEdgeInDsl,
  locateEntityInDsl,
  locateSelectionAtDslLine,
  parseArchDsl,
  patchEdgeInDsl,
  patchEntityInDsl,
  serializeSlotToDsl,
} from './parser';
import { buildScenePresetForTemplate } from '../presets';
import type { EntityNode, RelationEdge } from '../types';

describe('@devdraw/core .arch DSL parser & lossless patcher', () => {
  it('roundtrips architecture preset with entities, annotations, relations, and flows', () => {
    const preset = buildScenePresetForTemplate('系统架构拓扑');
    const dsl = serializeSlotToDsl(preset);
    const parsed = parseArchDsl(dsl, preset.nodes, preset.edges);

    expect(parsed.diagnostics).toHaveLength(0);
    expect(parsed.nodes.length).toBe(preset.nodes.length);
    expect(parsed.edges.length).toBe(preset.edges.length);
    expect(parsed.flows.length).toBe(1);
    expect(parsed.flows[0].steps.length).toBe(3);
  });

  it('roundtrips extended semantic fields (status, drillTarget, ref, links, resilience, flow rationale)', () => {
    const nodes: EntityNode[] = [
      {
        id: 'n1',
        dslId: 'order_svc',
        kind: 'service',
        title: '订单服务',
        tag: 'CORE',
        summary: '处理下单与支付回调',
        tech: 'Go / gRPC',
        status: 'planned',
        owner: '@commerce',
        tags: ['p0', 'stateless'],
        links: { repo: 'https://git.local/order', adr: 'ADR-012' },
        drillTarget: { layerId: 'layer-data', subCanvasId: 'sub-relational' },
        note: '核心链路服务',
        color: 'violet',
        x: 100,
        y: 200,
      },
      {
        id: 'n2',
        dslId: 'users_ref',
        kind: 'store_ref',
        title: 'users',
        tag: 'REF',
        note: '跨层只读引用',
        color: 'slate',
        ref: { layerId: 'layer-data', subCanvasId: 'sub-relational', nodeId: 'er-1' },
        x: 400,
        y: 200,
      },
    ];
    const edges: RelationEdge[] = [
      {
        id: 'e1',
        from: 'n1',
        to: 'n2',
        label: 'reads',
        protocol: 'SQL',
        routing: 'orthogonal',
        resilience: { timeout: '2s', retry: 3, circuitBreaker: true },
        sourcePort: 'right',
        targetPort: 'left',
        waypoints: [{ x: 250, y: 200 }],
      },
    ];

    const dsl = serializeSlotToDsl({
      name: 'Extended',
      nodes,
      edges,
      flows: [
        {
          id: 'checkout',
          name: '下单主链路',
          description: '校验用户并创建订单',
          steps: [
            {
              order: 1,
              from: 'n1',
              to: 'n2',
              label: '查询用户状态',
              latency: '8ms',
              rationale: '确认账号未被风控冻结',
              parallel: true,
            },
          ],
        },
      ],
    });

    const parsed = parseArchDsl(dsl, nodes, edges);
    expect(parsed.diagnostics).toHaveLength(0);
    expect(parsed.nodes[0].status).toBe('planned');
    expect(parsed.nodes[0].summary).toBe('处理下单与支付回调');
    expect(parsed.nodes[0].tags).toEqual(['p0', 'stateless']);
    expect(parsed.nodes[0].links).toEqual({ repo: 'https://git.local/order', adr: 'ADR-012' });
    expect(parsed.nodes[0].drillTarget).toEqual({ layerId: 'layer-data', subCanvasId: 'sub-relational' });
    expect(parsed.nodes[1].ref).toEqual({
      layerId: 'layer-data',
      subCanvasId: 'sub-relational',
      nodeId: 'er-1',
    });

    // Edge resilience + preserved layout properties from existingEdges
    expect(parsed.edges[0].id).toBe('e1');
    expect(parsed.edges[0].resilience).toEqual({ timeout: '2s', retry: 3, circuitBreaker: true });
    expect(parsed.edges[0].sourcePort).toBe('right');
    expect(parsed.edges[0].waypoints).toEqual([{ x: 250, y: 200 }]);

    // Flow description & step rationale
    expect(parsed.flows[0].description).toBe('校验用户并创建订单');
    expect(parsed.flows[0].steps[0].rationale).toBe('确认账号未被风控冻结');
    expect(parsed.flows[0].steps[0].parallel).toBe(true);
  });

  it('does not resurrect deleted semantic properties when editing DSL directly', () => {
    const existing: EntityNode[] = [
      {
        id: 'n1',
        dslId: 'api_gw',
        kind: 'ingress',
        title: 'API 网关',
        tag: 'GW',
        tech: 'Envoy',
        note: '旧备注',
        color: 'violet',
        x: 320,
        y: 180,
        pinned: true,
      },
    ];

    const editedDsl = [
      'ingress api_gw "API 网关" {',
      '  tag "GW"',
      '}',
    ].join('\n');

    const parsed = parseArchDsl(editedDsl, existing);
    expect(parsed.diagnostics).toHaveLength(0);
    expect(parsed.nodes[0].tech).toBeUndefined();
    expect(parsed.nodes[0].note).toBe('');
    // Geometry & pinned state ARE preserved
    expect(parsed.nodes[0].x).toBe(320);
    expect(parsed.nodes[0].y).toBe(180);
    expect(parsed.nodes[0].pinned).toBe(true);
  });

  it('applies surgical rename patch without erasing comments or formatting', () => {
    const src = [
      '// Keep my top comment',
      'service order_svc "订单聚合服务" {',
      '  tech "Go / gRPC"',
      '}',
      '',
      '// Trailing comment',
    ].join('\n');

    const patch = createRenameEntityPatch(src, 'order_svc', '订单中心 v2');
    expect(patch).not.toBeNull();
    const updated = applyTextPatch(src, patch!);
    expect(updated).toContain('// Keep my top comment');
    expect(updated).toContain('service order_svc "订单中心 v2" {');
    expect(updated).toContain('// Trailing comment');
  });

  it('surgically patches entity properties, adds/edits/deletes entities and edges while preserving comments', () => {
    const src = [
      '// Top architecture header comment',
      'service order_svc "订单服务" {',
      '  // Inline comment inside block',
      '  tag "Service"',
      '  tech "Go"',
      '}',
      '',
      'db order_db "订单库" {',
      '  tag "PostgreSQL"',
      '}',
      '',
      '// Relations section comment',
      'order_svc -> order_db "writes" [SQL]',
      '',
      '// Footer comment',
    ].join('\n');

    const parsed = parseArchDsl(src);
    expect(parsed.diagnostics).toHaveLength(0);

    // 1. Patch entity: change tech, add owner, keep inline comment!
    const updatedOrder: EntityNode = {
      ...parsed.nodes[0],
      title: '订单核心服务',
      tech: 'Rust / Tonic',
      owner: '@order-team',
    };
    const afterEntityPatch = patchEntityInDsl(src, updatedOrder, [updatedOrder, parsed.nodes[1]]);
    expect(afterEntityPatch).not.toBeNull();
    expect(afterEntityPatch!).toContain('// Top architecture header comment');
    expect(afterEntityPatch!).toContain('// Inline comment inside block');
    expect(afterEntityPatch!).toContain('service order_svc "订单核心服务" {');
    expect(afterEntityPatch!).toContain('  tech "Rust / Tonic"');
    expect(afterEntityPatch!).toContain('  owner "@order-team"');
    expect(afterEntityPatch!).toContain('// Footer comment');

    // 2. Append new entity
    const newCache: EntityNode = {
      id: 'n-cache',
      dslId: 'order_cache',
      kind: 'cache',
      title: '订单缓存',
      tag: 'Redis',
      note: '热点订单缓存',
      color: 'rose',
      x: 0,
      y: 0,
    };
    const all3 = [updatedOrder, parsed.nodes[1], newCache];
    const afterAppend = appendEntityToDsl(afterEntityPatch!, newCache, all3);
    expect(afterAppend).toContain('cache order_cache "订单缓存"');
    expect(afterAppend).toContain('// Relations section comment');

    // 3. Append edge, then patch it, then delete it
    const newEdge: RelationEdge = {
      id: 'e-cache',
      from: updatedOrder.id,
      to: newCache.id,
      label: 'cache lookup',
      protocol: 'Redis',
    };
    const parsed3 = parseArchDsl(afterAppend, all3, parsed.edges);
    const afterEdgeAppend = appendEdgeToDsl(afterAppend, newEdge, parsed3.nodes, parsed3.edges);
    expect(afterEdgeAppend).not.toBeNull();
    expect(afterEdgeAppend!).toContain('order_svc -> order_cache "cache lookup" [Redis]');
    expect(afterEdgeAppend!).toContain('// Footer comment');

    const editedEdge: RelationEdge = { ...newEdge, dashed: true, label: 'async invalidate' };
    const parsed4 = parseArchDsl(afterEdgeAppend!, all3, [...parsed3.edges, newEdge]);
    const afterEdgePatch = patchEdgeInDsl(
      afterEdgeAppend!,
      editedEdge,
      parsed4.nodes,
      parsed4.edges,
      newEdge
    );
    expect(afterEdgePatch).not.toBeNull();
    expect(afterEdgePatch!).toContain('order_svc ~> order_cache "async invalidate" [Redis]');

    const afterEdgeDel = deleteEdgesFromDsl(
      afterEdgePatch!,
      [editedEdge.id],
      parsed4.nodes,
      parsed4.edges
    );
    expect(afterEdgeDel).not.toBeNull();
    expect(afterEdgeDel!).not.toContain('async invalidate');
    expect(afterEdgeDel!).toContain('order_svc -> order_db "writes" [SQL]');

    // 4. Delete entity removes both entity and its incident edge cleanly while preserving comments
    const parsed5 = parseArchDsl(afterEdgeDel!, all3, parsed.edges);
    const afterNodeDel = deleteEntityFromDsl(afterEdgeDel!, parsed5.nodes[1].id, parsed5.nodes, parsed5.edges);
    expect(afterNodeDel).not.toBeNull();
    expect(afterNodeDel!).not.toContain('db order_db');
    expect(afterNodeDel!).not.toContain('order_svc -> order_db');
    expect(afterNodeDel!).toContain('// Top architecture header comment');
    expect(afterNodeDel!).toContain('// Footer comment');
  });

  it('locates entities and edges bidirectionally between canvas selection and DSL line numbers', () => {
    const src = [
      '// Header',
      'service gw "网关" {',
      '  tech "Envoy"',
      '}',
      'service app "应用"',
      'gw -> app "HTTP"',
    ].join('\n');

    const parsed = parseArchDsl(src);
    const gwLoc = locateEntityInDsl(src, parsed.nodes[0].id, parsed.nodes);
    expect(gwLoc?.startLine).toBe(2);
    expect(gwLoc?.endLine).toBe(4);

    const edgeLoc = locateEdgeInDsl(src, parsed.edges[0].id, parsed.nodes, parsed.edges);
    expect(edgeLoc?.line).toBe(6);

    expect(locateSelectionAtDslLine(src, 3, parsed.nodes, parsed.edges)).toEqual({
      kind: 'node',
      id: parsed.nodes[0].id,
    });
    expect(locateSelectionAtDslLine(src, 6, parsed.nodes, parsed.edges)).toEqual({
      kind: 'edge',
      id: parsed.edges[0].id,
    });
    expect(locateSelectionAtDslLine(src, 1, parsed.nodes, parsed.edges)).toBeNull();
  });

  it('reports diagnostic error on unclosed entity block', () => {
    const bad = 'service broken "未闭合" {\n  tech "Go"';
    const parsed = parseArchDsl(bad);
    expect(parsed.diagnostics.some((d) => d.severity === 'error')).toBe(true);
  });
});
