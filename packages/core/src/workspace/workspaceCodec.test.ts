import { describe, expect, it } from 'vitest';
import { createDefaultProjects } from '../presets';
import {
  deserializeWorkspaceFilesToProject,
  serializeProjectToWorkspaceFiles,
} from './workspaceCodec';

describe('@devdraw/core three-layer Git-friendly workspace codec', () => {
  it('roundtrips full multi-layer project with sub-canvases, comments, layout overrides, and freehand strokes', () => {
    const starter = createDefaultProjects()[0];
    // Mutate geometry, custom style, collapsed flag, edge waypoints, freehand, and custom DSL comment
    const archLayer = starter.layers[0];
    archLayer.nodes[0].x = 512;
    archLayer.nodes[0].y = 333;
    archLayer.nodes[0].pinned = true;
    archLayer.nodes[0].customStyle = { borderStyle: 'dashed', radius: '2xl' };
    archLayer.edges[0].waypoints = [{ x: 640, y: 220 }];
    archLayer.edges[0].sourcePort = 'bottom';
    archLayer.edges[0].targetPort = 'top';
    archLayer.freehand = [
      { id: 's1', color: '#a78bfa', width: 2, points: [{ x: 10, y: 20 }, { x: 40, y: 50 }] },
    ];
    archLayer.dslSource = `// Custom Git PR comment\n${archLayer.dslSource || ''}`;
    starter.kindStyles = { service: { accentBar: 'top' } };

    // Also set collapsed state on a data modeling ER table inside a sub-canvas
    const dataLayer = starter.layers.find((l) => l.children && l.children.length > 0);
    expect(dataLayer).toBeDefined();
    dataLayer!.children![0].nodes[0].collapsed = true;

    const files = serializeProjectToWorkspaceFiles(starter);

    // Verify expected 3-layer file structure
    expect(files['project.json']).toBeDefined();
    expect(files['.arch-layout.json']).toBeDefined();
    const archKeys = Object.keys(files).filter((k) => k.startsWith('layers/') && k.endsWith('.arch'));
    expect(archKeys.length).toBeGreaterThanOrEqual(3);

    // Reload from files
    const { project: reloaded, diagnostics } = deserializeWorkspaceFilesToProject(
      files,
      'D:/repos/devdraw-demo'
    );

    expect(diagnostics).toHaveLength(0);
    expect(reloaded.workspacePath).toBe('D:/repos/devdraw-demo');
    expect(reloaded.title).toBe(starter.title);
    expect(reloaded.layers.length).toBe(starter.layers.length);
    expect(reloaded.kindStyles).toEqual({ service: { accentBar: 'top' } });

    const reloadedArch = reloaded.layers[0];
    expect(reloadedArch.dslSource).toContain('// Custom Git PR comment');
    expect(reloadedArch.nodes[0].x).toBe(512);
    expect(reloadedArch.nodes[0].y).toBe(333);
    expect(reloadedArch.nodes[0].pinned).toBe(true);
    expect(reloadedArch.nodes[0].customStyle).toEqual({ borderStyle: 'dashed', radius: '2xl' });
    expect(reloadedArch.edges[0].waypoints).toEqual([{ x: 640, y: 220 }]);
    expect(reloadedArch.edges[0].sourcePort).toBe('bottom');
    expect(reloadedArch.edges[0].targetPort).toBe('top');
    expect(reloadedArch.freehand).toHaveLength(1);

    const reloadedData = reloaded.layers.find((l) => l.children && l.children.length > 0);
    expect(reloadedData?.children?.[0].nodes[0].collapsed).toBe(true);
  });

  it('re-attaches layout coordinates by dslId after external Git/IDE edits to .arch files', () => {
    const starter = createDefaultProjects()[0];
    const targetNode = starter.layers[0].nodes[0];
    targetNode.x = 777;
    targetNode.y = 444;
    targetNode.pinned = true;

    const files = serializeProjectToWorkspaceFiles(starter);
    const archFileKey = Object.keys(files).find((k) => k.startsWith('layers/') && k.includes(starter.layers[0].id))!;

    // Simulate external developer editing title in VS Code
    files[archFileKey] = files[archFileKey].replace(targetNode.title, '外部修改后的标题');

    const { project: reloaded } = deserializeWorkspaceFilesToProject(files, '/tmp/arch-repo');
    const reloadedNode = reloaded.layers[0].nodes.find((n) => n.dslId === targetNode.dslId);
    expect(reloadedNode?.title).toBe('外部修改后的标题');
    expect(reloadedNode?.x).toBe(777);
    expect(reloadedNode?.y).toBe(444);
    expect(reloadedNode?.pinned).toBe(true);
  });

  it('gracefully opens a bare folder containing only .arch files without project.json', () => {
    const files: Record<string, string> = {
      'layers/payments.arch': [
        'service pay_api "支付网关" {',
        '  tech "Go"',
        '}',
        'db pay_db "支付账本"',
        'pay_api -> pay_db "写入流水" [SQL]',
      ].join('\n'),
    };

    const { project, diagnostics } = deserializeWorkspaceFilesToProject(files, 'C:\\work\\payments-arch');
    expect(diagnostics).toHaveLength(0);
    expect(project.title).toBe('payments-arch');
    expect(project.layers).toHaveLength(1);
    expect(project.layers[0].name).toBe('payments');
    expect(project.layers[0].nodes).toHaveLength(2);
    expect(project.layers[0].edges).toHaveLength(1);
  });
});
