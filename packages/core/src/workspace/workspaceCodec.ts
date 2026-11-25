import {
  buildNodeDslIdMap,
  parseArchDsl,
  sanitizeDslId,
  serializeSlotToDsl,
} from '../dsl/parser';
import type {
  CanvasSlot,
  EntityNode,
  EntityVisualStyle,
  LayerDocument,
  LayerTemplateName,
  LayoutDocument,
  ProjectCategory,
  ProjectDocument,
  RelationEdge,
  SubCanvasEngine,
  ViewLayoutOverride,
} from '../types';

export interface WorkspaceDiagnostic {
  file: string;
  line: number;
  message: string;
  severity: 'error' | 'warning';
}

export interface WorkspaceSubCanvasManifest {
  id: string;
  name: string;
  engine?: SubCanvasEngine;
  file: string;
}

export interface WorkspaceLayerManifest {
  id: string;
  name: string;
  template: LayerTemplateName;
  file?: string;
  activeChildIndex?: number;
  children?: WorkspaceSubCanvasManifest[];
}

export interface WorkspaceManifest {
  schemaVersion: 1;
  id: string;
  title: string;
  subtitle: string;
  meta: string;
  category?: ProjectCategory;
  icon?: string;
  badgeText?: string;
  kindStyles?: Record<string, EntityVisualStyle>;
  updatedAt: number;
  layers: WorkspaceLayerManifest[];
}

export interface WorkspaceLoadResult {
  project: ProjectDocument;
  diagnostics: WorkspaceDiagnostic[];
}

const VALID_TEMPLATES = new Set<LayerTemplateName>([
  '空白项目',
  '系统架构拓扑',
  '数据建模',
  '云原生部署拓扑',
  '状态机与时序',
  '算法与数据流',
  '接口契约与领域边界',
]);

function sanitizeFileSegment(raw: string, fallback: string): string {
  const cleaned = raw
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

function buildStableEdgeLayoutKey(
  edge: RelationEdge,
  idToDsl: Map<string, string>,
  occurrenceIndex: number
): string {
  const from = idToDsl.get(edge.from) ?? edge.from;
  const to = idToDsl.get(edge.to) ?? edge.to;
  const fromExpr = edge.fromField ? `${from}.${edge.fromField}` : from;
  const toExpr = edge.toField ? `${to}.${edge.toField}` : to;
  return `${fromExpr}->${toExpr}#${occurrenceIndex}`;
}

/**
 * Build the pure geometry & visual override document saved to `.arch-layout.json`.
 * Nodes are keyed by `dslId || id` and edges by semantic endpoint signature so
 * layouts survive external Git/IDE edits to `.arch` files.
 */
export function buildLayoutDocument(project: ProjectDocument): LayoutDocument {
  const views: LayoutDocument['views'] = {};

  for (const layer of project.layers) {
    const slots = layer.children && layer.children.length > 0 ? layer.children : [layer];
    for (const slot of slots) {
      const idToDsl = buildNodeDslIdMap(slot.nodes);
      const nodes: ViewLayoutOverride['nodes'] = {};
      const edges: ViewLayoutOverride['edges'] = {};

      for (const n of slot.nodes) {
        const key = idToDsl.get(n.id) ?? n.id;
        const entry: ViewLayoutOverride['nodes'][string] = {
          x: Math.round(n.x),
          y: Math.round(n.y),
        };
        if (n.w !== undefined) entry.w = n.w;
        if (n.h !== undefined) entry.h = n.h;
        if (n.pinned) entry.pinned = true;
        if (n.collapsed) entry.collapsed = true;
        if (n.customStyle && Object.keys(n.customStyle).length > 0) {
          entry.customStyle = n.customStyle;
        }
        nodes[key] = entry;
      }

      const occurrenceCount = new Map<string, number>();
      for (const e of slot.edges) {
        const hasOverride = Boolean(
          e.sourcePort ||
            e.targetPort ||
            e.curveOffsetX ||
            e.curveOffsetY ||
            (e.waypoints && e.waypoints.length > 0) ||
            e.routing
        );
        const from = idToDsl.get(e.from) ?? e.from;
        const to = idToDsl.get(e.to) ?? e.to;
        const base = `${from}${e.fromField ? '.' + e.fromField : ''}->${to}${e.toField ? '.' + e.toField : ''}`;
        const occ = occurrenceCount.get(base) ?? 0;
        occurrenceCount.set(base, occ + 1);
        if (!hasOverride) continue;

        const key = buildStableEdgeLayoutKey(e, idToDsl, occ);
        const edgeEntry: ViewLayoutOverride['edges'][string] = {};
        if (e.sourcePort) edgeEntry.sourcePort = e.sourcePort;
        if (e.targetPort) edgeEntry.targetPort = e.targetPort;
        if (e.curveOffsetX !== undefined) edgeEntry.curveOffsetX = e.curveOffsetX;
        if (e.curveOffsetY !== undefined) edgeEntry.curveOffsetY = e.curveOffsetY;
        if (e.waypoints && e.waypoints.length > 0) edgeEntry.waypoints = e.waypoints;
        if (e.routing) edgeEntry.routing = e.routing;
        edges[key] = edgeEntry;
      }

      const viewOverride: ViewLayoutOverride = {
        viewport: project.layout?.views?.[slot.id]?.viewport,
        nodes,
        edges,
      };
      if (slot.freehand && slot.freehand.length > 0) {
        viewOverride.freehand = slot.freehand;
      }
      views[slot.id] = viewOverride;
    }
  }

  return { schemaVersion: 1, views };
}

/**
 * Serialize a ProjectDocument into the three-layer Git-friendly file set:
 * - `project.json`
 * - `layers/<slot>.arch`
 * - `.arch-layout.json`
 */
export function serializeProjectToWorkspaceFiles(project: ProjectDocument): Record<string, string> {
  const files: Record<string, string> = {};
  const usedFilePaths = new Set<string>();

  const allocateLayerFile = (rawId: string, fallback: string): string => {
    const base = sanitizeFileSegment(rawId, fallback);
    let candidate = `layers/${base}.arch`;
    let suffix = 2;
    while (usedFilePaths.has(candidate)) {
      candidate = `layers/${base}-${suffix++}.arch`;
    }
    usedFilePaths.add(candidate);
    return candidate;
  };

  const layerManifests: WorkspaceLayerManifest[] = project.layers.map((layer, layerIdx) => {
    if (layer.children && layer.children.length > 0) {
      const children: WorkspaceSubCanvasManifest[] = layer.children.map((sub, subIdx) => {
        const file = allocateLayerFile(`${layer.id}-${sub.id}`, `layer-${layerIdx + 1}-sub-${subIdx + 1}`);
        files[file] = sub.dslSource || serializeSlotToDsl(sub);
        return {
          id: sub.id,
          name: sub.name,
          engine: sub.engine,
          file,
        };
      });
      return {
        id: layer.id,
        name: layer.name,
        template: layer.template,
        activeChildIndex: layer.activeChildIndex ?? 0,
        children,
      };
    }

    const file = allocateLayerFile(layer.id, `layer-${layerIdx + 1}`);
    files[file] = layer.dslSource || serializeSlotToDsl(layer);
    return {
      id: layer.id,
      name: layer.name,
      template: layer.template,
      file,
    };
  });

  const manifest: WorkspaceManifest = {
    schemaVersion: 1,
    id: project.id,
    title: project.title,
    subtitle: project.subtitle,
    meta: project.meta,
    category: project.category,
    icon: project.icon,
    badgeText: project.badgeText,
    kindStyles: project.kindStyles,
    updatedAt: project.updatedAt,
    layers: layerManifests,
  };

  files['project.json'] = JSON.stringify(manifest, null, 2) + '\n';
  files['.arch-layout.json'] = JSON.stringify(buildLayoutDocument(project), null, 2) + '\n';

  return files;
}

function applyLayoutToSlot(
  slot: CanvasSlot,
  viewLayout: ViewLayoutOverride | undefined
): CanvasSlot {
  if (!viewLayout) return slot;

  const idToDsl = buildNodeDslIdMap(slot.nodes);
  const nodes: EntityNode[] = slot.nodes.map((node) => {
    const dslKey = idToDsl.get(node.id) ?? node.id;
    const saved = viewLayout.nodes?.[dslKey] ?? viewLayout.nodes?.[node.id];
    if (!saved) return node;
    return {
      ...node,
      x: typeof saved.x === 'number' ? saved.x : node.x,
      y: typeof saved.y === 'number' ? saved.y : node.y,
      w: saved.w ?? node.w,
      h: saved.h ?? node.h,
      pinned: saved.pinned ?? node.pinned,
      collapsed: saved.collapsed ?? node.collapsed,
      customStyle: saved.customStyle ?? node.customStyle,
    };
  });

  const occurrenceCount = new Map<string, number>();
  const edges: RelationEdge[] = slot.edges.map((edge) => {
    const from = idToDsl.get(edge.from) ?? edge.from;
    const to = idToDsl.get(edge.to) ?? edge.to;
    const base = `${from}${edge.fromField ? '.' + edge.fromField : ''}->${to}${edge.toField ? '.' + edge.toField : ''}`;
    const occ = occurrenceCount.get(base) ?? 0;
    occurrenceCount.set(base, occ + 1);

    const stableKey = buildStableEdgeLayoutKey(edge, idToDsl, occ);
    const saved = viewLayout.edges?.[stableKey] ?? viewLayout.edges?.[edge.id];
    if (!saved) return edge;
    return {
      ...edge,
      sourcePort: saved.sourcePort ?? edge.sourcePort,
      targetPort: saved.targetPort ?? edge.targetPort,
      curveOffsetX: saved.curveOffsetX ?? edge.curveOffsetX,
      curveOffsetY: saved.curveOffsetY ?? edge.curveOffsetY,
      waypoints: saved.waypoints ?? edge.waypoints,
      routing: edge.routing ?? saved.routing,
    };
  });

  return {
    ...slot,
    nodes,
    edges,
    freehand: viewLayout.freehand ?? slot.freehand,
  };
}

function inferTemplateFromNodes(nodes: EntityNode[], engine?: SubCanvasEngine): LayerTemplateName {
  if (engine === 'relational' || engine === 'redis') return '数据建模';
  if (nodes.some((n) => n.kind.startsWith('er_') || n.kind.startsWith('kv_'))) return '数据建模';
  if (nodes.some((n) => n.kind.startsWith('dep_'))) return '云原生部署拓扑';
  if (nodes.some((n) => n.kind.startsWith('fsm_'))) return '状态机与时序';
  if (nodes.some((n) => n.kind.startsWith('dag_'))) return '算法与数据流';
  if (nodes.some((n) => n.kind.startsWith('ddd_'))) return '接口契约与领域边界';
  return '系统架构拓扑';
}

function getFolderDisplayName(rootPath: string): string {
  const normalized = rootPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || '本地工作区';
}

/**
 * Assemble a ProjectDocument from a map of relative workspace files
 * (`project.json`, `.arch-layout.json`, `layers/*.arch`).
 * Also gracefully imports directories that only contain `.arch` files without `project.json`.
 */
export function deserializeWorkspaceFilesToProject(
  files: Record<string, string>,
  rootPath: string
): WorkspaceLoadResult {
  const diagnostics: WorkspaceDiagnostic[] = [];
  const normalizedFiles = new Map<string, string>();
  for (const [k, v] of Object.entries(files)) {
    normalizedFiles.set(k.replace(/\\/g, '/').replace(/^\.\//, ''), v);
  }

  let layoutDoc: LayoutDocument | undefined;
  const rawLayout = normalizedFiles.get('.arch-layout.json');
  if (rawLayout) {
    try {
      const parsedLayout = JSON.parse(rawLayout);
      if (parsedLayout && typeof parsedLayout === 'object' && parsedLayout.views) {
        layoutDoc = parsedLayout as LayoutDocument;
      }
    } catch {
      diagnostics.push({
        file: '.arch-layout.json',
        line: 1,
        severity: 'warning',
        message: '.arch-layout.json 格式异常，已回退使用默认节点坐标',
      });
    }
  }

  let manifest: WorkspaceManifest | null = null;
  const rawManifest = normalizedFiles.get('project.json');
  if (rawManifest) {
    try {
      const parsed = JSON.parse(rawManifest);
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.layers)) {
        manifest = parsed as WorkspaceManifest;
      }
    } catch {
      diagnostics.push({
        file: 'project.json',
        line: 1,
        severity: 'warning',
        message: 'project.json 解析失败，将自动扫描目录中的 .arch 文件恢复项目',
      });
    }
  }

  const parseSlotFile = (
    slotId: string,
    slotName: string,
    filePath: string,
    engine?: SubCanvasEngine
  ): CanvasSlot => {
    const rawDsl = normalizedFiles.get(filePath) ?? '';
    const parsed = parseArchDsl(rawDsl);
    for (const d of parsed.diagnostics) {
      diagnostics.push({ file: filePath, ...d });
    }
    const baseSlot: CanvasSlot = {
      id: slotId,
      name: slotName,
      engine,
      nodes: parsed.nodes,
      edges: parsed.edges,
      flows: parsed.flows,
      dslSource: rawDsl || serializeSlotToDsl({ name: slotName, nodes: parsed.nodes, edges: parsed.edges, flows: parsed.flows }),
    };
    return applyLayoutToSlot(baseSlot, layoutDoc?.views?.[slotId]);
  };

  const layers: LayerDocument[] = [];

  if (manifest && manifest.layers.length > 0) {
    for (const lm of manifest.layers) {
      const template: LayerTemplateName = VALID_TEMPLATES.has(lm.template)
        ? lm.template
        : '系统架构拓扑';

      if (lm.children && lm.children.length > 0) {
        const children = lm.children.map((sub) => {
          const filePath = sub.file || `layers/${sub.id}.arch`;
          return parseSlotFile(sub.id, sub.name, filePath, sub.engine);
        });
        const first = children[0];
        layers.push({
          id: lm.id,
          name: lm.name,
          template,
          nodes: first?.nodes ?? [],
          edges: first?.edges ?? [],
          flows: first?.flows ?? [],
          activeChildIndex: Math.min(Math.max(0, lm.activeChildIndex ?? 0), Math.max(0, children.length - 1)),
          children,
        });
      } else {
        const filePath = lm.file || `layers/${lm.id}.arch`;
        const slot = parseSlotFile(lm.id, lm.name, filePath);
        layers.push({
          ...slot,
          template,
        });
      }
    }
  } else {
    // Fallback: discover any *.arch files in the folder
    const archFiles = Array.from(normalizedFiles.keys())
      .filter((k) => k.endsWith('.arch'))
      .sort((a, b) => a.localeCompare(b));

    for (const filePath of archFiles) {
      const baseName = filePath.split('/').pop()!.replace(/\.arch$/, '');
      const slotId = sanitizeDslId(baseName, `layer_${layers.length + 1}`);
      const slot = parseSlotFile(slotId, baseName, filePath);
      layers.push({
        ...slot,
        template: inferTemplateFromNodes(slot.nodes, slot.engine),
      });
    }
  }

  if (layers.length === 0) {
    const emptySlot: CanvasSlot = {
      id: 'architecture',
      name: '系统架构拓扑',
      nodes: [],
      edges: [],
      flows: [],
      dslSource: '// DevDraw .arch — 系统架构拓扑\n',
    };
    layers.push({ ...emptySlot, template: '系统架构拓扑' });
  }

  const folderName = getFolderDisplayName(rootPath);
  const project: ProjectDocument = {
    id: manifest?.id || `ws-${sanitizeFileSegment(folderName, 'project')}-${Date.now().toString(36)}`,
    title: manifest?.title || folderName,
    subtitle: manifest?.subtitle || `本地目录工作区 · ${layers.length} 层架构`,
    meta: manifest?.meta || layers.map((l) => l.name).join(' + '),
    category: manifest?.category || 'personal',
    type: 'local',
    icon: manifest?.icon || 'network',
    badgeText: manifest?.badgeText,
    workspacePath: rootPath,
    layers,
    layout: layoutDoc,
    kindStyles: manifest?.kindStyles,
    updatedAt: manifest?.updatedAt || Date.now(),
  };

  return { project, diagnostics };
}
