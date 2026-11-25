import { create } from 'zustand';
import {
  alignNodes,
  appendEdgeToDsl,
  appendEntityToDsl,
  buildAiPromptContext,
  buildScenePresetForTemplate,
  computeAutoLayout,
  computeGroupBoundsForNodes,
  createDefaultProjects,
  deleteEdgesFromDsl,
  deleteEntityFromDsl,
  distributeNodes,
  findPrimitiveByKind,
  importDevDrawJson,
  importMermaidToSlot,
  importSqlDdlToSlot,
  isCollapsibleEntity,
  parseArchDsl,
  patchEdgeInDsl,
  patchEntityInDsl,
  sanitizeDslId,
  serializeSlotToDsl,
  syncFlowsInDsl,
  type AlignDirection,
  type CanvasExpandMode,
  type CanvasSlot,
  type CanvasToolMode,
  type CrossLayerRef,
  type DistributeAxis,
  type DslDiagnostic,
  type EdgeRoutingMode,
  type EdgeWaypoint,
  type EntityNode,
  type EntityVisualStyle,
  type FlowScript,
  type FlowStep,
  type FreehandStroke,
  type LayerDocument,
  type LayerTemplateName,
  type PortSide,
  type ProjectDocument,
  type RelationEdge,
  type SemanticColor,
  type SubCanvasEngine,
} from '@devdraw/core';
import { storageAdapter } from '../storage/adapter';

export type LeftActivityTab = 'palette' | 'layers' | 'flows' | 'dsl' | 'tools' | 'versions';
export type SaveState = 'saved' | 'saving' | 'error';

interface HistoryEntry {
  nodes: EntityNode[];
  edges: RelationEdge[];
  flows: FlowScript[];
  freehand: FreehandStroke[];
  dslSource: string;
}

interface WorkbenchState {
  projects: ProjectDocument[];
  activeProjectId: string | null;
  activeLayerIndex: number;
  selectedNodeId: string | null;
  selectedNodeIds: string[];
  selectedEdgeId: string | null;
  focusNodeRequest: { nodeId: string; nonce: number } | null;
  inspectorOpen: boolean;
  activeTool: CanvasToolMode;
  leftTab: LeftActivityTab | null;
  dslSplitOpen: boolean;
  dslDiagnostics: DslDiagnostic[];
  theme: 'dark' | 'light';
  expandMode: CanvasExpandMode;
  compactMode: boolean;
  saveState: SaveState;
  toastMessage: string | null;

  // Dynamic Step-by-step Flow playback & orchestration
  simulating: boolean;
  activeFlowId: string | null;
  flowStepIndex: number;
  isFlowPlaying: boolean;
  flowPickEdgeMode: boolean;

  // Export, Import, Cross-Ref, Command Palette & Style Customizer Modals
  exportModalOpen: boolean;
  importModalOpen: boolean;
  crossRefModalOpen: boolean;
  commandPaletteOpen: boolean;
  styleModalOpen: boolean;
  styleTargetNodeId: string | null;

  // Undo/Redo per active slot
  history: HistoryEntry[];
  historyIndex: number;
  recentKinds: string[];
  clipboard: { nodes: EntityNode[]; edges: RelationEdge[]; pasteCount: number } | null;

  // Actions
  hydrate: () => Promise<void>;
  showToast: (msg: string) => void;
  toggleTheme: () => void;
  openProject: (projectId: string) => void;
  returnToLauncher: () => void;
  createProject: (title: string, templates: LayerTemplateName[]) => void;
  duplicateProject: (projectId: string) => void;
  toggleArchiveProject: (projectId: string) => void;
  deleteProject: (projectId: string) => void;
  renameActiveProject: (title: string) => void;

  // Three-layer Git-friendly local directory workspace
  openWorkspaceFolder: () => Promise<void>;
  bindActiveProjectToFolder: () => Promise<void>;
  reloadWorkspaceFolder: (projectId?: string, fromWatcher?: boolean) => Promise<void>;
  unbindWorkspaceFolder: (projectId?: string) => void;

  // Layer & sub-canvas
  selectLayer: (index: number) => void;
  selectSubCanvas: (subIndex: number) => void;
  addLayer: (template: LayerTemplateName) => void;
  renameLayer: (layerIndex: number, name: string) => void;
  duplicateLayer: (layerIndex: number) => void;
  deleteLayer: (layerIndex: number) => void;
  reorderLayers: (fromIndex: number, toIndex: number) => void;
  addSubCanvas: (layerIndex: number, engine: SubCanvasEngine, name?: string) => void;
  renameSubCanvas: (layerIndex: number, subIndex: number, name: string) => void;
  deleteSubCanvas: (layerIndex: number, subIndex: number) => void;
  setCrossRefModalOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  focusNode: (nodeId: string) => void;
  addCrossLayerRefNode: (ref: CrossLayerRef, x?: number, y?: number) => boolean;
  drillToNodeTarget: (node: EntityNode) => void;

  // UI controls
  setTool: (tool: CanvasToolMode) => void;
  toggleLeftTab: (tab: LeftActivityTab) => void;
  toggleDslSplit: () => void;
  setExportModalOpen: (open: boolean) => void;
  setImportModalOpen: (open: boolean) => void;
  importSqlDdl: (sql: string, mode: 'append' | 'new-layer') => Promise<boolean>;
  importMermaid: (mermaid: string, mode: 'append' | 'new-layer') => Promise<boolean>;
  importJsonDocument: (
    rawJson: string,
    mode: 'replace-slot' | 'new-layer' | 'new-project'
  ) => boolean;
  copyAiPromptContext: () => Promise<void>;
  openStyleModal: (nodeId?: string | null) => void;
  closeStyleModal: () => void;
  updateNodeStyle: (nodeId: string, patch: Partial<EntityVisualStyle>) => void;
  resetNodeStyle: (nodeId: string) => void;
  updateKindStyle: (kind: string, patch: Partial<EntityVisualStyle>) => void;
  resetKindStyle: (kind: string) => void;
  applyStyleToKind: (kind: string, style: EntityVisualStyle) => void;

  // Canvas editing
  selectNode: (nodeId: string | null, openInspector?: boolean) => void;
  selectNodes: (nodeIds: string[]) => void;
  selectAllNodes: () => void;
  copySelectedNodes: () => void;
  pasteClipboard: () => void;
  selectEdge: (edgeId: string | null, openInspector?: boolean) => void;
  openNodeInspector: (nodeId: string) => void;
  openEdgeInspector: (edgeId: string) => void;
  closeInspector: () => void;
  addNodeFromPrimitive: (kind: string, x: number, y: number) => void;
  moveNode: (nodeId: string, x: number, y: number) => void;
  moveNodes: (updates: Array<{ id: string; x: number; y: number }>) => void;
  resizeNode: (nodeId: string, x: number, y: number, w: number, h: number) => void;
  updateNode: (nodeId: string, patch: Partial<EntityNode>) => void;
  deleteNode: (nodeId: string) => void;
  deleteNodes: (nodeIds: string[]) => void;
  alignSelectedNodes: (direction: AlignDirection) => void;
  distributeSelectedNodes: (axis: DistributeAxis) => void;
  groupSelectedNodes: () => void;
  duplicateNode: (nodeId: string) => void;
  disconnectNode: (nodeId: string) => void;
  toggleNodePinned: (nodeId: string) => void;
  connectNodes: (
    from: string,
    to: string,
    fromField?: string,
    toField?: string,
    sourcePort?: PortSide,
    targetPort?: PortSide
  ) => void;
  updateEdge: (edgeId: string, patch: Partial<RelationEdge>) => void;
  updateEdgeWaypoints: (edgeId: string, waypoints: EdgeWaypoint[] | undefined) => void;
  toggleEdgeDashed: (edgeId: string) => void;
  toggleEdgeRouting: (edgeId: string) => void;
  reverseEdge: (edgeId: string) => void;
  deleteEdge: (edgeId: string) => void;
  addFreehandStroke: (stroke: FreehandStroke) => void;
  clearFreehandStrokes: () => void;

  // Density & Layout
  toggleNodeCollapse: (nodeId: string) => void;
  cycleDensity: () => void;
  toggleCompactMode: () => void;
  runAutoLayout: (respectPinned?: boolean) => Promise<void>;

  // DSL bidirectional sync
  applyDslSource: (source: string) => void;

  // Versions
  createLayerVersion: (label?: string) => void;
  restoreLayerVersion: (versionId: string) => void;

  // Undo/Redo
  undo: () => void;
  redo: () => void;

  // Flow playback & orchestration
  toggleSimulation: () => void;
  selectFlow: (flowId: string) => void;
  setFlowStepIndex: (index: number) => void;
  stepFlow: (delta: 1 | -1) => void;
  toggleFlowAutoPlay: () => void;
  resetFlowStep: () => void;
  stopSimulation: () => void;
  openFlowEditor: () => void;
  setFlowPickEdgeMode: (active: boolean) => void;
  createFlow: (name?: string, description?: string) => string | null;
  updateFlowMeta: (flowId: string, patch: { name?: string; description?: string }) => void;
  deleteFlow: (flowId: string) => void;
  addFlowStep: (flowId: string, step: Omit<FlowStep, 'order'>) => void;
  addFlowStepFromEdge: (edgeId: string) => void;
  updateFlowStep: (flowId: string, stepIndex: number, patch: Partial<FlowStep>) => void;
  moveFlowStep: (flowId: string, fromIndex: number, toIndex: number) => void;
  deleteFlowStep: (flowId: string, stepIndex: number) => void;
}

export function getActiveSlotFromProject(
  project: ProjectDocument | undefined,
  layerIndex: number
): { layer: LayerDocument; slot: CanvasSlot } | null {
  if (!project) return null;
  const layer = project.layers[layerIndex];
  if (!layer) return null;
  if (layer.children && layer.children.length > 0) {
    const idx = Math.min(Math.max(0, layer.activeChildIndex ?? 0), layer.children.length - 1);
    return { layer, slot: layer.children[idx] };
  }
  return { layer, slot: layer };
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function mutateActiveSlot(
  projects: ProjectDocument[],
  projectId: string | null,
  layerIndex: number,
  updater: (slot: CanvasSlot, layer: LayerDocument) => void
): ProjectDocument[] {
  if (!projectId) return projects;
  return projects.map((p) => {
    if (p.id !== projectId) return p;
    const nextProject = clone(p);
    const active = getActiveSlotFromProject(nextProject, layerIndex);
    if (!active) return p;
    updater(active.slot, active.layer);
    nextProject.updatedAt = Date.now();
    return nextProject;
  });
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;
let workspaceSyncTimer: ReturnType<typeof setTimeout> | null = null;

export const useWorkbenchStore = create<WorkbenchState>((set, get) => {
  const persist = async (nextProjects: ProjectDocument[], projectIdToSync?: string | null) => {
    set({ saveState: 'saving' });
    const ok = await storageAdapter.saveProjects(nextProjects);

    const targetId = projectIdToSync !== undefined ? projectIdToSync : get().activeProjectId;
    const targetProject = targetId ? nextProjects.find((p) => p.id === targetId) : undefined;

    if (
      targetProject &&
      storageAdapter.hasWorkspaceBinding?.(targetProject) &&
      storageAdapter.syncWorkspaceDirectory
    ) {
      if (workspaceSyncTimer) clearTimeout(workspaceSyncTimer);
      workspaceSyncTimer = setTimeout(async () => {
        try {
          const synced = await storageAdapter.syncWorkspaceDirectory!(targetProject);
          set({ saveState: ok && synced ? 'saved' : 'error' });
        } catch {
          set({ saveState: 'error' });
        }
      }, 240);
      return;
    }

    set({ saveState: ok ? 'saved' : 'error' });
  };

  const pushHistoryForCurrent = (nextProjects: ProjectDocument[]) => {
    const { activeProjectId, activeLayerIndex, history, historyIndex } = get();
    const proj = nextProjects.find((p) => p.id === activeProjectId);
    const active = getActiveSlotFromProject(proj, activeLayerIndex);
    if (!active) return;
    const entry: HistoryEntry = {
      nodes: clone(active.slot.nodes),
      edges: clone(active.slot.edges),
      flows: clone(active.slot.flows ?? []),
      freehand: clone(active.slot.freehand ?? []),
      dslSource: active.slot.dslSource || serializeSlotToDsl(active.slot),
    };
    const sliced = history.slice(0, historyIndex + 1);
    sliced.push(entry);
    if (sliced.length > 50) sliced.shift();
    set({ history: sliced, historyIndex: sliced.length - 1 });
  };

  return {
    projects: createDefaultProjects(),
    activeProjectId: null,
    activeLayerIndex: 0,
    selectedNodeId: null,
    selectedNodeIds: [],
    selectedEdgeId: null,
    focusNodeRequest: null,
    inspectorOpen: false,
    activeTool: 'select',
    leftTab: null,
    dslSplitOpen: false,
    dslDiagnostics: [],
    theme: 'dark',
    expandMode: 'full',
    compactMode: false,
    saveState: 'saved',
    toastMessage: null,

    simulating: false,
    activeFlowId: null,
    flowStepIndex: -1,
    isFlowPlaying: false,
    flowPickEdgeMode: false,
    exportModalOpen: false,
    importModalOpen: false,
    crossRefModalOpen: false,
    commandPaletteOpen: false,
    styleModalOpen: false,
    styleTargetNodeId: null,

    history: [],
    historyIndex: -1,
    recentKinds: [],
    clipboard: null,

    async hydrate() {
      const [projects, theme] = await Promise.all([
        storageAdapter.loadProjects(),
        storageAdapter.loadTheme(),
      ]);
      set({ projects, theme });
    },

    showToast(msg) {
      if (toastTimer) clearTimeout(toastTimer);
      set({ toastMessage: msg });
      toastTimer = setTimeout(() => set({ toastMessage: null }), 2800);
    },

    toggleTheme() {
      const next = get().theme === 'dark' ? 'light' : 'dark';
      set({ theme: next });
      void storageAdapter.saveTheme(next);
      get().showToast(next === 'light' ? '已切换至晴昼白板画布' : '已切换至暗夜紫墨画布');
    },

    openProject(projectId) {
      const proj = get().projects.find((p) => p.id === projectId);
      if (!proj) return;
      const active = getActiveSlotFromProject(proj, 0);
      const initialHistory: HistoryEntry[] = active
        ? [
            {
              nodes: clone(active.slot.nodes),
              edges: clone(active.slot.edges),
              flows: clone(active.slot.flows ?? []),
              freehand: clone(active.slot.freehand ?? []),
              dslSource: active.slot.dslSource || serializeSlotToDsl(active.slot),
            },
          ]
        : [];
      set({
        activeProjectId: projectId,
        activeLayerIndex: 0,
        selectedNodeId: null,
        selectedEdgeId: null,
        inspectorOpen: false,
        leftTab: null,
        simulating: false,
        flowStepIndex: -1,
        isFlowPlaying: false,
        flowPickEdgeMode: false,
        dslDiagnostics: [],
        history: initialHistory,
        historyIndex: initialHistory.length - 1,
      });
    },

    returnToLauncher() {
      set({
        activeProjectId: null,
        selectedNodeId: null,
        selectedEdgeId: null,
        inspectorOpen: false,
        leftTab: null,
        simulating: false,
        isFlowPlaying: false,
      });
    },

    createProject(title, templates) {
      const list = templates.length > 0 ? templates : (['空白项目'] as LayerTemplateName[]);
      const layers: LayerDocument[] = list.map((tpl, idx) => ({
        id: `layer-${idx}-${Date.now()}`,
        ...buildScenePresetForTemplate(tpl),
      }));
      const newProj: ProjectDocument = {
        id: `p-${Date.now()}`,
        title: title.trim() || `${list[0]} · 未命名项目`,
        subtitle: `本地项目 · v0.1.0${list.length > 1 ? ` · ${list.length} 层架构` : ''}`,
        meta: list.join(' + '),
        category: 'personal',
        type: 'local',
        icon: list[0] === '数据建模' ? 'database' : list[0] === '状态机与时序' ? 'git-branch' : 'network',
        layers,
        updatedAt: Date.now(),
      };
      const next = [newProj, ...get().projects];
      set({ projects: next });
      void persist(next, null);
      get().openProject(newProj.id);
    },

    duplicateProject(projectId) {
      const origin = get().projects.find((p) => p.id === projectId);
      if (!origin) return;
      const copy: ProjectDocument = {
        ...clone(origin),
        id: `p-${Date.now()}`,
        title: `${origin.title} (副本)`,
        workspacePath: undefined,
        updatedAt: Date.now(),
      };
      const next = [copy, ...get().projects];
      set({ projects: next });
      void persist(next, null);
      get().showToast(`已创建副本：${copy.title}`);
    },

    toggleArchiveProject(projectId) {
      const next = get().projects.map((p) => {
        if (p.id !== projectId) return p;
        const archived = p.category === 'archived';
        return {
          ...p,
          category: archived ? ('personal' as const) : ('archived' as const),
          subtitle: archived
            ? p.subtitle.replace('归档项目', '本地项目')
            : p.subtitle.replace('本地项目', '归档项目'),
        };
      });
      set({ projects: next });
      void persist(next, null);
    },

    deleteProject(projectId) {
      storageAdapter.unbindWorkspaceDirectory?.(projectId);
      const next = get().projects.filter((p) => p.id !== projectId);
      set({ projects: next });
      void persist(next, null);
      get().showToast('已移除项目');
    },

    renameActiveProject(title) {
      const trimmed = title.trim();
      if (!trimmed) return;
      const next = get().projects.map((p) =>
        p.id === get().activeProjectId ? { ...p, title: trimmed, updatedAt: Date.now() } : p
      );
      set({ projects: next });
      void persist(next);
    },

    async openWorkspaceFolder() {
      if (!storageAdapter.openWorkspaceDirectory) {
        get().showToast('当前环境暂不支持打开本地文件夹');
        return;
      }
      try {
        const result = await storageAdapter.openWorkspaceDirectory();
        if (!result) return;

        const { project: loaded, diagnostics } = result;
        const existing = get().projects.find(
          (p) =>
            p.id === loaded.id ||
            (loaded.workspacePath && p.workspacePath === loaded.workspacePath)
        );
        const nextProjects = existing
          ? get().projects.map((p) => (p.id === existing.id ? { ...loaded, id: existing.id } : p))
          : [loaded, ...get().projects];
        const targetId = existing ? existing.id : loaded.id;

        set({ projects: nextProjects });
        await storageAdapter.saveProjects(nextProjects);
        get().openProject(targetId);

        if (diagnostics.length > 0) {
          get().showToast(
            `已打开「${loaded.title}」（${loaded.layers.length} 层，含 ${diagnostics.length} 条 DSL 提示）`
          );
        } else {
          get().showToast(`已打开本地工作区「${loaded.title}」（自动同步已启用）`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : '打开本地目录失败';
        get().showToast(message);
      }
    },

    async bindActiveProjectToFolder() {
      const activeId = get().activeProjectId;
      const proj = get().projects.find((p) => p.id === activeId);
      if (!proj || !storageAdapter.bindWorkspaceDirectory) return;

      try {
        set({ saveState: 'saving' });
        const rootPath = await storageAdapter.bindWorkspaceDirectory(proj);
        if (!rootPath) {
          set({ saveState: 'saved' });
          return;
        }
        const next = get().projects.map((p) =>
          p.id === activeId ? { ...p, workspacePath: rootPath, updatedAt: Date.now() } : p
        );
        set({ projects: next, saveState: 'saved' });
        await storageAdapter.saveProjects(next);
        get().showToast(`已绑定目录「${rootPath}」，三层文件将自动落盘同步`);
      } catch (err) {
        set({ saveState: 'error' });
        const message = err instanceof Error ? err.message : '绑定本地目录失败';
        get().showToast(message);
      }
    },

    async reloadWorkspaceFolder(projectId, fromWatcher = false) {
      const targetId = projectId ?? get().activeProjectId;
      const proj = get().projects.find((p) => p.id === targetId);
      if (!proj || !storageAdapter.reloadWorkspaceDirectory) return;

      try {
        const result = await storageAdapter.reloadWorkspaceDirectory(proj);
        if (!result) {
          if (!fromWatcher) {
            get().showToast('目录句柄未授权，请重新绑定或打开本地工作区');
          }
          return;
        }
        const { project: reloaded, diagnostics } = result;
        const next = get().projects.map((p) => (p.id === targetId ? reloaded : p));
        const safeLayerIdx = Math.min(get().activeLayerIndex, Math.max(0, reloaded.layers.length - 1));

        set({ projects: next });
        await storageAdapter.saveProjects(next);

        if (get().activeProjectId === targetId) {
          const active = getActiveSlotFromProject(reloaded, safeLayerIdx);
          const freshHistory: HistoryEntry[] = active
            ? [
                {
                  nodes: clone(active.slot.nodes),
                  edges: clone(active.slot.edges),
                  flows: clone(active.slot.flows ?? []),
                  freehand: clone(active.slot.freehand ?? []),
                  dslSource: active.slot.dslSource || serializeSlotToDsl(active.slot),
                },
              ]
            : [];
          set({
            activeLayerIndex: safeLayerIdx,
            selectedNodeId: null,
            selectedNodeIds: [],
            selectedEdgeId: null,
            dslDiagnostics: diagnostics
              .filter((d) => !active || d.file.includes(active.slot.id))
              .map(({ line, message, severity }) => ({ line, message, severity })),
            history: freshHistory,
            historyIndex: freshHistory.length - 1,
          });
        }

        get().showToast(
          fromWatcher
            ? diagnostics.length > 0
              ? `检测到外部目录变更，已热更新（含 ${diagnostics.length} 条 DSL 提示）`
              : '检测到外部文件变更，画布已实时热更新'
            : diagnostics.length > 0
              ? `已从磁盘重载（含 ${diagnostics.length} 条 DSL 提示）`
              : '已从磁盘重新加载最新 .arch 与布局文件'
        );
      } catch (err) {
        if (!fromWatcher) {
          const message = err instanceof Error ? err.message : '从磁盘重新加载失败';
          get().showToast(message);
        }
      }
    },

    unbindWorkspaceFolder(projectId) {
      const targetId = projectId ?? get().activeProjectId;
      if (!targetId) return;
      storageAdapter.unbindWorkspaceDirectory?.(targetId);
      const next = get().projects.map((p) =>
        p.id === targetId ? { ...p, workspacePath: undefined, updatedAt: Date.now() } : p
      );
      set({ projects: next });
      void persist(next, null);
      get().showToast('已解除本地目录绑定（仅保留浏览器本地缓存）');
    },

    selectLayer(index) {
      const proj = get().projects.find((p) => p.id === get().activeProjectId);
      if (!proj || index < 0 || index >= proj.layers.length) return;
      const active = getActiveSlotFromProject(proj, index);
      const history: HistoryEntry[] = active
        ? [
            {
              nodes: clone(active.slot.nodes),
              edges: clone(active.slot.edges),
              flows: clone(active.slot.flows ?? []),
              freehand: clone(active.slot.freehand ?? []),
              dslSource: active.slot.dslSource || serializeSlotToDsl(active.slot),
            },
          ]
        : [];
      set({
        activeLayerIndex: index,
        selectedNodeId: null,
        selectedEdgeId: null,
        inspectorOpen: false,
        simulating: false,
        flowStepIndex: -1,
        isFlowPlaying: false,
        flowPickEdgeMode: false,
        dslDiagnostics: [],
        history,
        historyIndex: history.length - 1,
      });
    },

    selectSubCanvas(subIndex) {
      const next = get().projects.map((p) => {
        if (p.id !== get().activeProjectId) return p;
        const copy = clone(p);
        const layer = copy.layers[get().activeLayerIndex];
        if (layer?.children && subIndex >= 0 && subIndex < layer.children.length) {
          layer.activeChildIndex = subIndex;
        }
        return copy;
      });
      const proj = next.find((p) => p.id === get().activeProjectId);
      const active = getActiveSlotFromProject(proj, get().activeLayerIndex);
      const history: HistoryEntry[] = active
        ? [
            {
              nodes: clone(active.slot.nodes),
              edges: clone(active.slot.edges),
              flows: clone(active.slot.flows ?? []),
              freehand: clone(active.slot.freehand ?? []),
              dslSource: active.slot.dslSource || serializeSlotToDsl(active.slot),
            },
          ]
        : [];
      set({
        projects: next,
        selectedNodeId: null,
        selectedEdgeId: null,
        flowPickEdgeMode: false,
        dslDiagnostics: [],
        history,
        historyIndex: history.length - 1,
      });
      void persist(next);
    },

    addLayer(template) {
      const { activeProjectId, projects } = get();
      if (!activeProjectId) return;
      let newIndex = 0;
      const next = projects.map((p) => {
        if (p.id !== activeProjectId) return p;
        const copy = clone(p);
        const newLayer: LayerDocument = {
          id: `layer-${Date.now()}`,
          ...buildScenePresetForTemplate(template),
        };
        copy.layers.push(newLayer);
        copy.meta = copy.layers.map((l) => l.name).join(' + ');
        copy.updatedAt = Date.now();
        newIndex = copy.layers.length - 1;
        return copy;
      });
      set({ projects: next });
      void persist(next);
      get().selectLayer(newIndex);
      get().showToast(`已新增推演层：${template}`);
    },

    renameLayer(layerIndex, name) {
      const trimmed = name.trim();
      const { activeProjectId, projects } = get();
      if (!activeProjectId || !trimmed) return;
      const next = projects.map((p) => {
        if (p.id !== activeProjectId) return p;
        const copy = clone(p);
        const target = copy.layers[layerIndex];
        if (!target) return p;
        target.name = trimmed;
        copy.meta = copy.layers.map((l) => l.name).join(' + ');
        copy.updatedAt = Date.now();
        return copy;
      });
      set({ projects: next });
      void persist(next);
      get().showToast(`已重命名推演层为「${trimmed}」`);
    },

    duplicateLayer(layerIndex) {
      const { activeProjectId, projects } = get();
      if (!activeProjectId) return;
      let insertedIndex = layerIndex + 1;
      const next = projects.map((p) => {
        if (p.id !== activeProjectId) return p;
        const copy = clone(p);
        const origin = copy.layers[layerIndex];
        if (!origin) return p;
        const stamp = Date.now().toString(36);
        const duplicated: LayerDocument = {
          ...clone(origin),
          id: `${origin.id}-copy-${stamp}`,
          name: `${origin.name} (副本)`,
          versions: [],
        };
        if (duplicated.children && duplicated.children.length > 0) {
          duplicated.children = duplicated.children.map((sub, idx) => ({
            ...sub,
            id: `${sub.id}-copy-${stamp}-${idx}`,
          }));
        }
        copy.layers.splice(layerIndex + 1, 0, duplicated);
        copy.meta = copy.layers.map((l) => l.name).join(' + ');
        copy.updatedAt = Date.now();
        insertedIndex = layerIndex + 1;
        return copy;
      });
      set({ projects: next });
      void persist(next);
      get().selectLayer(insertedIndex);
      get().showToast('已复制推演层');
    },

    deleteLayer(layerIndex) {
      const { activeProjectId, activeLayerIndex, projects } = get();
      if (!activeProjectId) return;
      const currentProj = projects.find((p) => p.id === activeProjectId);
      if (!currentProj || currentProj.layers.length <= 1) {
        get().showToast('项目至少保留 1 个推演层');
        return;
      }
      const removedName = currentProj.layers[layerIndex]?.name ?? '推演层';
      const next = projects.map((p) => {
        if (p.id !== activeProjectId) return p;
        const copy = clone(p);
        copy.layers.splice(layerIndex, 1);
        copy.meta = copy.layers.map((l) => l.name).join(' + ');
        copy.updatedAt = Date.now();
        return copy;
      });
      const nextActiveIdx =
        activeLayerIndex > layerIndex
          ? activeLayerIndex - 1
          : Math.min(activeLayerIndex, currentProj.layers.length - 2);
      set({ projects: next });
      void persist(next);
      get().selectLayer(Math.max(0, nextActiveIdx));
      get().showToast(`已删除推演层「${removedName}」`);
    },

    reorderLayers(fromIndex, toIndex) {
      const { activeProjectId, activeLayerIndex, projects } = get();
      if (!activeProjectId || fromIndex === toIndex) return;
      const proj = projects.find((p) => p.id === activeProjectId);
      if (
        !proj ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= proj.layers.length ||
        toIndex >= proj.layers.length
      ) {
        return;
      }
      const activeLayerId = proj.layers[activeLayerIndex]?.id;
      let nextActiveIdx = activeLayerIndex;
      const next = projects.map((p) => {
        if (p.id !== activeProjectId) return p;
        const copy = clone(p);
        const [moved] = copy.layers.splice(fromIndex, 1);
        copy.layers.splice(toIndex, 0, moved);
        copy.meta = copy.layers.map((l) => l.name).join(' + ');
        copy.updatedAt = Date.now();
        if (activeLayerId) {
          const found = copy.layers.findIndex((l) => l.id === activeLayerId);
          if (found >= 0) nextActiveIdx = found;
        }
        return copy;
      });
      set({ projects: next, activeLayerIndex: nextActiveIdx });
      void persist(next);
    },

    addSubCanvas(layerIndex, engine, name) {
      const { activeProjectId, projects } = get();
      if (!activeProjectId) return;
      let nextSubIndex = 0;
      const defaultName = engine === 'redis' ? '缓存键空间' : '关系库模型';
      const next = projects.map((p) => {
        if (p.id !== activeProjectId) return p;
        const copy = clone(p);
        const layer = copy.layers[layerIndex];
        if (!layer) return p;

        if (!layer.children || layer.children.length === 0) {
          // Promote existing layer content into the first child slot
          const firstChild: CanvasSlot = {
            id: `sub-${Date.now().toString(36)}-0`,
            name: layer.engine === 'redis' ? '缓存' : '关系库',
            engine: layer.engine ?? 'relational',
            nodes: clone(layer.nodes),
            edges: clone(layer.edges),
            flows: clone(layer.flows ?? []),
            freehand: clone(layer.freehand),
            dslSource: layer.dslSource || serializeSlotToDsl(layer),
          };
          layer.children = [firstChild];
        }

        const count = layer.children.length + 1;
        const slotName = (name || `${defaultName} ${count}`).trim();
        const newSub: CanvasSlot = {
          id: `sub-${engine}-${Date.now().toString(36)}`,
          name: slotName,
          engine,
          nodes: [],
          edges: [],
          flows: [],
          dslSource: `// DevDraw .arch — ${slotName}\n`,
        };
        layer.children.push(newSub);
        nextSubIndex = layer.children.length - 1;
        layer.activeChildIndex = nextSubIndex;
        copy.updatedAt = Date.now();
        return copy;
      });
      set({ projects: next });
      void persist(next);
      if (get().activeLayerIndex !== layerIndex) {
        get().selectLayer(layerIndex);
      }
      get().selectSubCanvas(nextSubIndex);
      get().showToast(`已新增子画布（${engine === 'redis' ? 'Redis 缓存' : '关系库'}）`);
    },

    renameSubCanvas(layerIndex, subIndex, name) {
      const trimmed = name.trim();
      const { activeProjectId, projects } = get();
      if (!activeProjectId || !trimmed) return;
      const next = projects.map((p) => {
        if (p.id !== activeProjectId) return p;
        const copy = clone(p);
        const sub = copy.layers[layerIndex]?.children?.[subIndex];
        if (!sub) return p;
        sub.name = trimmed;
        copy.updatedAt = Date.now();
        return copy;
      });
      set({ projects: next });
      void persist(next);
      get().showToast(`已重命名子画布为「${trimmed}」`);
    },

    deleteSubCanvas(layerIndex, subIndex) {
      const { activeProjectId, projects } = get();
      if (!activeProjectId) return;
      const proj = projects.find((p) => p.id === activeProjectId);
      const children = proj?.layers[layerIndex]?.children;
      if (!children || children.length <= 1) {
        get().showToast('至少保留 1 个子画布');
        return;
      }
      const removedName = children[subIndex]?.name ?? '子画布';
      let nextSubIdx = 0;
      const next = projects.map((p) => {
        if (p.id !== activeProjectId) return p;
        const copy = clone(p);
        const layer = copy.layers[layerIndex];
        if (!layer?.children) return p;
        layer.children.splice(subIndex, 1);
        nextSubIdx = Math.min(layer.activeChildIndex ?? 0, layer.children.length - 1);
        layer.activeChildIndex = Math.max(0, nextSubIdx);
        copy.updatedAt = Date.now();
        return copy;
      });
      set({ projects: next });
      void persist(next);
      if (get().activeLayerIndex === layerIndex) {
        get().selectSubCanvas(Math.max(0, nextSubIdx));
      }
      get().showToast(`已删除子画布「${removedName}」`);
    },

    setCrossRefModalOpen(open) {
      set({ crossRefModalOpen: open });
    },

    setCommandPaletteOpen(open) {
      set({ commandPaletteOpen: open });
    },

    focusNode(nodeId) {
      set({
        selectedNodeId: nodeId,
        selectedNodeIds: [nodeId],
        selectedEdgeId: null,
        focusNodeRequest: { nodeId, nonce: Date.now() },
      });
    },

    addCrossLayerRefNode(ref, x, y) {
      const { activeProjectId, activeLayerIndex, projects } = get();
      const proj = projects.find((p) => p.id === activeProjectId);
      const active = getActiveSlotFromProject(proj, activeLayerIndex);
      if (!proj || !active) return false;

      // Prevent duplicate reference to the exact same source node in the current slot
      const dup = active.slot.nodes.find(
        (n) =>
          n.ref?.layerId === ref.layerId &&
          (n.ref?.subCanvasId ?? '') === (ref.subCanvasId ?? '') &&
          n.ref?.nodeId === ref.nodeId
      );
      if (dup) {
        set({ selectedNodeId: dup.id, selectedEdgeId: null });
        get().showToast(`当前画布已引用「${dup.title}」，已为你选中`);
        return false;
      }

      // Resolve source layer / sub-canvas / entity
      const srcLayer = proj.layers.find((l) => l.id === ref.layerId);
      if (!srcLayer) return false;
      const srcSlot =
        ref.subCanvasId && srcLayer.children
          ? srcLayer.children.find((c) => c.id === ref.subCanvasId)
          : srcLayer;
      const srcNode = srcSlot?.nodes.find((n) => n.id === ref.nodeId);
      if (!srcSlot || !srcNode) return false;

      const refId = `ref-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 4)}`;
      const existingRefs = active.slot.nodes.filter((n) => Boolean(n.ref)).length;
      const posX = x ?? 60 + (existingRefs % 3) * 280;
      const posY = y ?? 60 + Math.floor(existingRefs / 3) * 140;
      const locationLabel = ref.subCanvasId ? `${srcLayer.name} / ${srcSlot.name}` : srcLayer.name;

      const refNode: EntityNode = {
        id: refId,
        dslId: sanitizeDslId(`ref_${srcNode.dslId || srcNode.title}`, `ref_${existingRefs + 1}`),
        kind: 'store_ref',
        title: srcNode.title,
        tag: `REF · ${srcSlot.name}`,
        note: `跨层只读引用（双击跳转至「${locationLabel}」）`,
        color: 'slate',
        icon: srcNode.icon,
        ref: { ...ref },
        x: posX,
        y: posY,
        pinned: true,
      };

      const next = mutateActiveSlot(projects, activeProjectId, activeLayerIndex, (slot) => {
        const baseDsl = slot.dslSource;
        slot.nodes.push(refNode);
        slot.dslSource = baseDsl
          ? appendEntityToDsl(baseDsl, refNode, slot.nodes)
          : serializeSlotToDsl(slot);
      });
      set({ projects: next, selectedNodeId: refId, selectedEdgeId: null });
      pushHistoryForCurrent(next);
      void persist(next);
      get().showToast(`已引入跨层引用「${srcNode.title}」← ${locationLabel}`);
      return true;
    },

    drillToNodeTarget(node) {
      const proj = get().projects.find((p) => p.id === get().activeProjectId);
      if (!proj) return;
      const targetLayerId = node.drillTarget?.layerId || node.ref?.layerId;
      const targetSubId = node.drillTarget?.subCanvasId || node.ref?.subCanvasId;
      if (!targetLayerId) return;

      const idx = proj.layers.findIndex((l) => l.id === targetLayerId);
      if (idx === -1) {
        get().showToast('未找到目标关联推演层');
        return;
      }
      get().selectLayer(idx);
      const targetLayer = proj.layers[idx];
      if (targetSubId && targetLayer.children) {
        const subIdx = targetLayer.children.findIndex((c) => c.id === targetSubId);
        if (subIdx >= 0) get().selectSubCanvas(subIdx);
      }
      if (node.ref?.nodeId) {
        set({ selectedNodeId: node.ref.nodeId });
      }
      get().showToast(`已下钻跳转至「${targetLayer.name}」`);
    },

    setTool(tool) {
      set({ activeTool: tool });
    },

    toggleLeftTab(tab) {
      if (tab === 'dsl') {
        get().toggleDslSplit();
        return;
      }
      set({ leftTab: get().leftTab === tab ? null : tab });
    },

    toggleDslSplit() {
      set({ dslSplitOpen: !get().dslSplitOpen });
    },

    setExportModalOpen(open) {
      set({ exportModalOpen: open });
    },

    setImportModalOpen(open) {
      set({ importModalOpen: open });
    },

    async importSqlDdl(sql, mode) {
      const parsed = importSqlDdlToSlot(sql);
      if (parsed.nodes.length === 0) {
        get().showToast(parsed.warnings[0] || '未检测到有效的 CREATE TABLE 语句');
        return false;
      }

      const laidOut = await computeAutoLayout(parsed.nodes, parsed.edges, {
        direction: 'RIGHT',
        respectPinned: false,
      });

      const activeProjId = get().activeProjectId;

      // If triggered from Launcher (no active project), create a new Data Modeling project
      if (!activeProjId) {
        const slotId = `sql-er-${Date.now().toString(36)}`;
        const erLayer: LayerDocument = {
          id: slotId,
          name: 'SQL 导入建模',
          template: '数据建模',
          engine: 'relational',
          nodes: laidOut.nodes,
          edges: laidOut.edges,
          flows: [],
        };
        erLayer.dslSource = serializeSlotToDsl(erLayer);

        const newProj: ProjectDocument = {
          id: `p-${Date.now()}`,
          title: `SQL ER 模型 (${parsed.tableCount} 表)`,
          subtitle: `本地项目 · SQL DDL 导入 · ${parsed.tableCount} 张表`,
          meta: '数据建模',
          category: 'personal',
          type: 'local',
          icon: 'database',
          layers: [erLayer],
          updatedAt: Date.now(),
        };
        const next = [newProj, ...get().projects];
        set({ projects: next });
        void persist(next, null);
        get().openProject(newProj.id);
        get().showToast(`已导入 ${parsed.tableCount} 张表、${parsed.relationCount} 条外键关系`);
        return true;
      }

      if (mode === 'new-layer') {
        let newIdx = 0;
        const next = get().projects.map((p) => {
          if (p.id !== activeProjId) return p;
          const copy = clone(p);
          const layerId = `layer-sql-${Date.now().toString(36)}`;
          const newLayer: LayerDocument = {
            id: layerId,
            name: `SQL 建模 (${parsed.tableCount} 表)`,
            template: '数据建模',
            engine: 'relational',
            nodes: laidOut.nodes,
            edges: laidOut.edges,
            flows: [],
          };
          newLayer.dslSource = serializeSlotToDsl(newLayer);
          copy.layers.push(newLayer);
          copy.updatedAt = Date.now();
          newIdx = copy.layers.length - 1;
          return copy;
        });
        set({ projects: next });
        void persist(next);
        get().selectLayer(newIdx);
        get().showToast(`已新建数据建模层：${parsed.tableCount} 张表、${parsed.relationCount} 条外键`);
        return true;
      }

      // Append to active slot with offset so it doesn't overlap existing nodes
      const next = mutateActiveSlot(get().projects, activeProjId, get().activeLayerIndex, (slot) => {
        const maxY = slot.nodes.reduce((m, n) => Math.max(m, n.y + (n.h ?? 160)), 0);
        const offsetY = slot.nodes.length > 0 ? maxY + 80 : 0;
        const shiftedNodes = laidOut.nodes.map((n) => ({ ...n, y: n.y + offsetY }));
        slot.nodes.push(...shiftedNodes);
        slot.edges.push(...laidOut.edges);
        slot.dslSource = serializeSlotToDsl(slot);
      });
      set({ projects: next });
      pushHistoryForCurrent(next);
      void persist(next);
      get().showToast(`已追加 ${parsed.tableCount} 张数据表、${parsed.relationCount} 条外键关系`);
      return true;
    },

    async importMermaid(mermaid, mode) {
      const parsed = importMermaidToSlot(mermaid);
      if (parsed.nodes.length === 0) {
        get().showToast(parsed.warnings[0] || '未检测到有效的 Mermaid 节点');
        return false;
      }

      const laidOut = await computeAutoLayout(parsed.nodes, parsed.edges, {
        direction: 'RIGHT',
        respectPinned: false,
      });

      const activeProjId = get().activeProjectId;
      const targetTemplate: LayerTemplateName = parsed.dialect === 'er' ? '数据建模' : '系统架构拓扑';

      if (!activeProjId) {
        const layer: LayerDocument = {
          id: `layer-mmd-${Date.now().toString(36)}`,
          name: `Mermaid 导入 (${parsed.nodeCount} 实体)`,
          template: targetTemplate,
          engine: parsed.dialect === 'er' ? 'relational' : undefined,
          nodes: laidOut.nodes,
          edges: laidOut.edges,
          flows: [],
        };
        layer.dslSource = serializeSlotToDsl(layer);

        const newProj: ProjectDocument = {
          id: `p-${Date.now()}`,
          title: `Mermaid 推演项目 (${parsed.nodeCount} 实体)`,
          subtitle: `本地项目 · Mermaid 导入 · ${parsed.nodeCount} 实体`,
          meta: targetTemplate,
          category: 'personal',
          type: 'local',
          icon: parsed.dialect === 'er' ? 'database' : 'network',
          layers: [layer],
          updatedAt: Date.now(),
        };
        const next = [newProj, ...get().projects];
        set({ projects: next });
        void persist(next, null);
        get().openProject(newProj.id);
        get().showToast(`已从 Mermaid 导入 ${parsed.nodeCount} 个实体、${parsed.edgeCount} 条关系`);
        return true;
      }

      if (mode === 'new-layer') {
        let newIdx = 0;
        const next = get().projects.map((p) => {
          if (p.id !== activeProjId) return p;
          const copy = clone(p);
          const newLayer: LayerDocument = {
            id: `layer-mmd-${Date.now().toString(36)}`,
            name: `Mermaid (${parsed.nodeCount} 实体)`,
            template: targetTemplate,
            engine: parsed.dialect === 'er' ? 'relational' : undefined,
            nodes: laidOut.nodes,
            edges: laidOut.edges,
            flows: [],
          };
          newLayer.dslSource = serializeSlotToDsl(newLayer);
          copy.layers.push(newLayer);
          copy.meta = copy.layers.map((l) => l.name).join(' + ');
          copy.updatedAt = Date.now();
          newIdx = copy.layers.length - 1;
          return copy;
        });
        set({ projects: next });
        void persist(next);
        get().selectLayer(newIdx);
        get().showToast(`已新建推演层：${parsed.nodeCount} 个实体、${parsed.edgeCount} 条关系`);
        return true;
      }

      const next = mutateActiveSlot(get().projects, activeProjId, get().activeLayerIndex, (slot) => {
        const maxY = slot.nodes.reduce((m, n) => Math.max(m, n.y + (n.h ?? 120)), 0);
        const offsetY = slot.nodes.length > 0 ? maxY + 80 : 0;
        const shiftedNodes = laidOut.nodes.map((n) => ({ ...n, y: n.y + offsetY }));
        slot.nodes.push(...shiftedNodes);
        slot.edges.push(...laidOut.edges);
        slot.dslSource = serializeSlotToDsl(slot);
      });
      set({ projects: next });
      pushHistoryForCurrent(next);
      void persist(next);
      get().showToast(`已追加 ${parsed.nodeCount} 个实体、${parsed.edgeCount} 条关系`);
      return true;
    },

    async copyAiPromptContext() {
      const proj = get().projects.find((p) => p.id === get().activeProjectId);
      const active = getActiveSlotFromProject(proj, get().activeLayerIndex);
      if (!proj || !active) return;
      const dsl = active.slot.dslSource || serializeSlotToDsl(active.slot);
      const prompt = buildAiPromptContext(active.slot, proj.title, dsl);
      try {
        await navigator.clipboard.writeText(prompt);
        get().showToast('已复制 .arch 语法规范与当前画布上下文（可直接发给 AI 助手）');
      } catch {
        get().showToast('复制 AI 上下文失败');
      }
    },

    importJsonDocument(rawJson, mode) {
      try {
        const imported = importDevDrawJson(rawJson);

        if (imported.kind === 'project') {
          const newProj: ProjectDocument = {
            ...clone(imported.project),
            id: `p-imp-${Date.now().toString(36)}`,
            workspacePath: undefined,
            updatedAt: Date.now(),
          };
          const next = [newProj, ...get().projects];
          set({ projects: next });
          void persist(next, null);
          get().openProject(newProj.id);
          get().showToast(`已导入完整项目「${newProj.title}」`);
          return true;
        }

        const slotData = clone(imported.slot);
        slotData.dslSource = serializeSlotToDsl(slotData);
        const activeProjId = get().activeProjectId;

        if (!activeProjId || mode === 'new-project') {
          const newLayer: LayerDocument = {
            ...slotData,
            id: `layer-imp-${Date.now().toString(36)}`,
            template: '系统架构拓扑',
          };
          const newProj: ProjectDocument = {
            id: `p-imp-${Date.now().toString(36)}`,
            title: slotData.name || '导入的推演项目',
            subtitle: `本地项目 · JSON 导入 · ${slotData.nodes.length} 实体`,
            meta: 'JSON 导入',
            category: 'personal',
            type: 'local',
            icon: 'network',
            layers: [newLayer],
            updatedAt: Date.now(),
          };
          const next = [newProj, ...get().projects];
          set({ projects: next });
          void persist(next, null);
          get().openProject(newProj.id);
          get().showToast(`已将 JSON 导入为新项目「${newProj.title}」`);
          return true;
        }

        if (mode === 'new-layer') {
          let newIdx = 0;
          const next = get().projects.map((p) => {
            if (p.id !== activeProjId) return p;
            const copy = clone(p);
            const newLayer: LayerDocument = {
              ...slotData,
              id: `layer-imp-${Date.now().toString(36)}`,
              template: '系统架构拓扑',
            };
            copy.layers.push(newLayer);
            copy.updatedAt = Date.now();
            newIdx = copy.layers.length - 1;
            return copy;
          });
          set({ projects: next });
          void persist(next);
          get().selectLayer(newIdx);
          get().showToast(`已导入为新推演层「${slotData.name}」`);
          return true;
        }

        const next = mutateActiveSlot(get().projects, activeProjId, get().activeLayerIndex, (slot) => {
          slot.nodes = slotData.nodes;
          slot.edges = slotData.edges;
          slot.flows = slotData.flows ?? [];
          slot.freehand = slotData.freehand;
          slot.dslSource = slotData.dslSource;
        });
        set({ projects: next, selectedNodeId: null, selectedEdgeId: null });
        pushHistoryForCurrent(next);
        void persist(next);
        get().showToast(`已导入 ${slotData.nodes.length} 个实体与 ${slotData.edges.length} 条连线（Ctrl+Z 可撤销）`);
        return true;
      } catch (err) {
        get().showToast(err instanceof Error ? err.message : 'JSON 导入失败');
        return false;
      }
    },

    openStyleModal(nodeId = null) {
      set({ styleModalOpen: true, styleTargetNodeId: nodeId });
    },

    closeStyleModal() {
      set({ styleModalOpen: false, styleTargetNodeId: null });
    },

    updateNodeStyle(nodeId, patch) {
      // Pure visual style override — never modifies .arch semantic DSL
      const next = mutateActiveSlot(get().projects, get().activeProjectId, get().activeLayerIndex, (slot) => {
        const target = slot.nodes.find((n) => n.id === nodeId);
        if (!target) return;
        target.customStyle = { ...(target.customStyle ?? {}), ...patch };
      });
      set({ projects: next });
      void persist(next);
    },

    resetNodeStyle(nodeId) {
      const next = mutateActiveSlot(get().projects, get().activeProjectId, get().activeLayerIndex, (slot) => {
        const target = slot.nodes.find((n) => n.id === nodeId);
        if (target) delete target.customStyle;
      });
      set({ projects: next });
      void persist(next);
      get().showToast('已恢复该实体默认样式');
    },

    updateKindStyle(kind, patch) {
      const next = get().projects.map((p) => {
        if (p.id !== get().activeProjectId) return p;
        const copy = clone(p);
        copy.kindStyles = {
          ...(copy.kindStyles ?? {}),
          [kind]: { ...(copy.kindStyles?.[kind] ?? {}), ...patch },
        };
        return copy;
      });
      set({ projects: next });
      void persist(next);
    },

    resetKindStyle(kind) {
      const next = get().projects.map((p) => {
        if (p.id !== get().activeProjectId) return p;
        const copy = clone(p);
        if (copy.kindStyles) delete copy.kindStyles[kind];
        return copy;
      });
      set({ projects: next });
      void persist(next);
      get().showToast(`已恢复 ${kind} 类型默认样式`);
    },

    applyStyleToKind(kind, style) {
      const next = get().projects.map((p) => {
        if (p.id !== get().activeProjectId) return p;
        const copy = clone(p);
        copy.kindStyles = { ...(copy.kindStyles ?? {}), [kind]: { ...style } };
        copy.layers.forEach((l) => {
          const slots = l.children && l.children.length > 0 ? l.children : [l];
          slots.forEach((s) => {
            s.nodes.forEach((n) => {
              if (n.kind === kind) delete n.customStyle;
            });
          });
        });
        return copy;
      });
      set({ projects: next });
      void persist(next);
      get().showToast(`已将样式同步至全项目所有 ${kind} 实体`);
    },

    selectNode(nodeId, openInspector) {
      set((state) => ({
        selectedNodeId: nodeId,
        selectedNodeIds: nodeId ? [nodeId] : [],
        selectedEdgeId: null,
        inspectorOpen:
          nodeId === null
            ? false
            : openInspector !== undefined
              ? openInspector
              : state.inspectorOpen,
      }));
    },

    selectNodes(nodeIds) {
      const unique = Array.from(new Set(nodeIds));
      set((state) => {
        const same =
          unique.length === state.selectedNodeIds.length &&
          unique.every((id, i) => id === state.selectedNodeIds[i]);
        if (same) return state;
        return {
          selectedNodeIds: unique,
          selectedNodeId: unique[0] ?? null,
          selectedEdgeId: null,
          inspectorOpen: unique.length === 1 ? state.inspectorOpen : false,
        };
      });
    },

    selectAllNodes() {
      const proj = get().projects.find((p) => p.id === get().activeProjectId);
      const active = getActiveSlotFromProject(proj, get().activeLayerIndex);
      if (!active || active.slot.nodes.length === 0) return;
      const allIds = active.slot.nodes.map((n) => n.id);
      set({
        selectedNodeIds: allIds,
        selectedNodeId: allIds[0] ?? null,
        selectedEdgeId: null,
        inspectorOpen: false,
      });
      get().showToast(`已全选当前画布 ${allIds.length} 个实体`);
    },

    copySelectedNodes() {
      const { projects, activeProjectId, activeLayerIndex, selectedNodeId, selectedNodeIds } = get();
      const proj = projects.find((p) => p.id === activeProjectId);
      const active = getActiveSlotFromProject(proj, activeLayerIndex);
      if (!active) return;

      const ids = selectedNodeIds.length > 0 ? selectedNodeIds : selectedNodeId ? [selectedNodeId] : [];
      if (ids.length === 0) return;
      const idSet = new Set(ids);

      const copiedNodes = active.slot.nodes.filter((n) => idSet.has(n.id)).map((n) => clone(n));
      const copiedEdges = active.slot.edges
        .filter((e) => idSet.has(e.from) && idSet.has(e.to))
        .map((e) => clone(e));

      if (copiedNodes.length === 0) return;
      set({ clipboard: { nodes: copiedNodes, edges: copiedEdges, pasteCount: 0 } });
      get().showToast(
        copiedEdges.length > 0
          ? `已复制 ${copiedNodes.length} 个实体与 ${copiedEdges.length} 条内部连线（支持跨层粘贴）`
          : `已复制 ${copiedNodes.length} 个实体（支持跨层 Ctrl+V 粘贴）`
      );
    },

    pasteClipboard() {
      const { clipboard, projects, activeProjectId, activeLayerIndex } = get();
      if (!clipboard || clipboard.nodes.length === 0 || !activeProjectId) return;

      const nextPasteCount = clipboard.pasteCount + 1;
      const offset = nextPasteCount * 44;
      const stamp = Date.now().toString(36);
      const idMap = new Map<string, string>();
      const pastedIds: string[] = [];

      const next = mutateActiveSlot(projects, activeProjectId, activeLayerIndex, (slot) => {
        const usedDslIds = new Set(slot.nodes.map((n) => n.dslId || n.id));
        const newNodes: EntityNode[] = clipboard.nodes.map((orig, idx) => {
          const newId = `n-${stamp}-${idx}-${Math.random().toString(36).slice(2, 4)}`;
          idMap.set(orig.id, newId);
          pastedIds.push(newId);

          const baseDsl = sanitizeDslId(`${orig.dslId || orig.id}_copy`, `node_copy_${idx + 1}`);
          let candidate = baseDsl;
          let suffix = 2;
          while (usedDslIds.has(candidate)) {
            candidate = `${baseDsl}_${suffix++}`;
          }
          usedDslIds.add(candidate);

          return {
            ...clone(orig),
            id: newId,
            dslId: candidate,
            x: Math.round(orig.x + offset),
            y: Math.round(orig.y + offset),
            pinned: true,
          };
        });

        // Remap internal annotation linkNodeId references
        for (const n of newNodes) {
          if (n.linkNodeId && idMap.has(n.linkNodeId)) {
            n.linkNodeId = idMap.get(n.linkNodeId)!;
          }
        }

        const newEdges: RelationEdge[] = clipboard.edges
          .filter((e) => idMap.has(e.from) && idMap.has(e.to))
          .map((e, idx) => ({
            ...clone(e),
            id: `e-${stamp}-${idx}-${Math.random().toString(36).slice(2, 4)}`,
            from: idMap.get(e.from)!,
            to: idMap.get(e.to)!,
            waypoints: e.waypoints?.map((wp) => ({
              x: Math.round(wp.x + offset),
              y: Math.round(wp.y + offset),
            })),
          }));

        let currentDsl = slot.dslSource;
        for (const n of newNodes) {
          slot.nodes.push(n);
          if (currentDsl) {
            currentDsl = appendEntityToDsl(currentDsl, n, slot.nodes);
          }
        }
        for (const e of newEdges) {
          const prevEdges = [...slot.edges];
          slot.edges.push(e);
          if (currentDsl) {
            currentDsl = appendEdgeToDsl(currentDsl, e, slot.nodes, prevEdges) ?? undefined;
          }
        }
        slot.dslSource = currentDsl ?? serializeSlotToDsl(slot);
      });

      set({
        projects: next,
        clipboard: { ...clipboard, pasteCount: nextPasteCount },
        selectedNodeIds: pastedIds,
        selectedNodeId: pastedIds[0] ?? null,
        selectedEdgeId: null,
        inspectorOpen: false,
      });
      pushHistoryForCurrent(next);
      void persist(next);
      get().showToast(`已粘贴 ${pastedIds.length} 个实体（Ctrl+Z 可撤销）`);
    },

    selectEdge(edgeId, openInspector) {
      set((state) => ({
        selectedEdgeId: edgeId,
        selectedNodeId: null,
        selectedNodeIds: [],
        inspectorOpen:
          edgeId === null
            ? false
            : openInspector !== undefined
              ? openInspector
              : state.inspectorOpen,
      }));
    },

    openNodeInspector(nodeId) {
      set({ selectedNodeId: nodeId, selectedEdgeId: null, inspectorOpen: true });
    },

    openEdgeInspector(edgeId) {
      set({ selectedEdgeId: edgeId, selectedNodeId: null, inspectorOpen: true });
    },

    closeInspector() {
      set({ inspectorOpen: false });
    },

    addNodeFromPrimitive(kind, x, y) {
      const prim = findPrimitiveByKind(kind);
      const id = `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
      const isEr = kind.startsWith('er_');
      const isKv = kind.startsWith('kv_');
      const newNode: EntityNode = {
        id,
        dslId: `${kind}_${Math.random().toString(36).slice(2, 5)}`,
        kind,
        title: prim?.label || '新实体',
        tag: prim?.badge || kind.toUpperCase(),
        note: prim?.desc || '',
        color: (prim?.defaultColor || 'sky') as SemanticColor,
        icon: prim?.icon,
        engine: prim?.engine,
        fields: isEr
          ? [
              { key: 'PK', name: 'id', type: 'BIGINT', note: '主键' },
              { key: '', name: 'created_at', type: 'TIMESTAMP', note: '创建时间' },
            ]
          : isKv
            ? [{ name: 'payload', type: 'string', note: '缓存值' }]
            : undefined,
        kv: isKv ? { ttl: '3600s', policy: 'allkeys-lru' } : undefined,
        x,
        y,
        w: kind === 'group' ? 440 : undefined,
        h: kind === 'group' ? 280 : undefined,
        pinned: true,
      };

      const next = mutateActiveSlot(get().projects, get().activeProjectId, get().activeLayerIndex, (slot) => {
        const baseDsl = slot.dslSource;
        slot.nodes.push(newNode);
        slot.dslSource = baseDsl
          ? appendEntityToDsl(baseDsl, newNode, slot.nodes)
          : serializeSlotToDsl(slot);
      });
      const prevRecent = get().recentKinds.filter((k) => k !== kind);
      const nextRecent = ['assumption', 'decision', 'note', 'group'].includes(kind)
        ? get().recentKinds
        : [kind, ...prevRecent].slice(0, 5);
      set({
        projects: next,
        selectedNodeId: id,
        selectedNodeIds: [id],
        selectedEdgeId: null,
        recentKinds: nextRecent,
      });
      pushHistoryForCurrent(next);
      void persist(next);
    },

    moveNode(nodeId, x, y) {
      // Geometry drag ONLY updates coordinates & pinned flag — preserves .arch DSL source untouched!
      const next = mutateActiveSlot(get().projects, get().activeProjectId, get().activeLayerIndex, (slot) => {
        const target = slot.nodes.find((n) => n.id === nodeId);
        if (target) {
          target.x = x;
          target.y = y;
          target.pinned = true;
        }
      });
      set({ projects: next });
      pushHistoryForCurrent(next);
      void persist(next);
    },

    moveNodes(updates) {
      if (updates.length === 0) return;
      const byId = new Map(updates.map((u) => [u.id, u]));
      const next = mutateActiveSlot(get().projects, get().activeProjectId, get().activeLayerIndex, (slot) => {
        for (const node of slot.nodes) {
          const u = byId.get(node.id);
          if (u) {
            node.x = u.x;
            node.y = u.y;
            node.pinned = true;
          }
        }
      });
      set({ projects: next });
      pushHistoryForCurrent(next);
      void persist(next);
    },

    resizeNode(nodeId, x, y, w, h) {
      // Pure geometry edit — preserves .arch DSL untouched
      const next = mutateActiveSlot(get().projects, get().activeProjectId, get().activeLayerIndex, (slot) => {
        const target = slot.nodes.find((n) => n.id === nodeId);
        if (target) {
          target.x = x;
          target.y = y;
          target.w = w;
          target.h = h;
          target.pinned = true;
        }
      });
      set({ projects: next });
      pushHistoryForCurrent(next);
      void persist(next);
    },

    updateNode(nodeId, patch) {
      const { activeProjectId, activeLayerIndex, projects } = get();
      const activeBefore = getActiveSlotFromProject(
        projects.find((p) => p.id === activeProjectId),
        activeLayerIndex
      );
      const srcLayerId = activeBefore?.layer.id;
      const srcSubId =
        activeBefore?.layer.children && activeBefore.layer.children.length > 0
          ? activeBefore.slot.id
          : undefined;

      let next = mutateActiveSlot(projects, activeProjectId, activeLayerIndex, (slot) => {
        const target = slot.nodes.find((n) => n.id === nodeId);
        if (!target) return;

        Object.assign(target, patch);

        if (slot.dslSource) {
          const patched = patchEntityInDsl(slot.dslSource, target, slot.nodes);
          slot.dslSource = patched ?? serializeSlotToDsl(slot);
        } else {
          slot.dslSource = serializeSlotToDsl(slot);
        }
      });

      // Keep cross-layer read-only reference anchors synced when source entity title changes
      if (typeof patch.title === 'string' && srcLayerId) {
        const syncedTitle = patch.title;
        next = next.map((p) => {
          if (p.id !== activeProjectId) return p;
          let changed = false;
          const copy = clone(p);
          for (const layer of copy.layers) {
            const slots = layer.children && layer.children.length > 0 ? layer.children : [layer];
            for (const slot of slots) {
              for (const n of slot.nodes) {
                if (
                  n.ref &&
                  n.ref.layerId === srcLayerId &&
                  (n.ref.subCanvasId ?? '') === (srcSubId ?? '') &&
                  n.ref.nodeId === nodeId &&
                  n.title !== syncedTitle
                ) {
                  n.title = syncedTitle;
                  if (slot.dslSource) {
                    const patched = patchEntityInDsl(slot.dslSource, n, slot.nodes);
                    slot.dslSource = patched ?? serializeSlotToDsl(slot);
                  }
                  changed = true;
                }
              }
            }
          }
          return changed ? copy : p;
        });
      }

      set({ projects: next });
      pushHistoryForCurrent(next);
      void persist(next);
    },

    deleteNode(nodeId) {
      const next = mutateActiveSlot(get().projects, get().activeProjectId, get().activeLayerIndex, (slot) => {
        const prevNodes = [...slot.nodes];
        const prevEdges = [...slot.edges];
        const prevDsl = slot.dslSource;

        slot.nodes = slot.nodes.filter((n) => n.id !== nodeId);
        slot.edges = slot.edges.filter((e) => e.from !== nodeId && e.to !== nodeId);
        slot.nodes.forEach((n) => {
          if (n.linkNodeId === nodeId) n.linkNodeId = null;
        });

        const patched = prevDsl ? deleteEntityFromDsl(prevDsl, nodeId, prevNodes, prevEdges) : null;
        slot.dslSource = patched ?? serializeSlotToDsl(slot);
      });
      const remainingSelected = get().selectedNodeIds.filter((id) => id !== nodeId);
      set({
        projects: next,
        selectedNodeId: remainingSelected[0] ?? null,
        selectedNodeIds: remainingSelected,
      });
      pushHistoryForCurrent(next);
      void persist(next);
    },

    deleteNodes(nodeIds) {
      const idSet = new Set(nodeIds);
      if (idSet.size === 0) return;
      const next = mutateActiveSlot(get().projects, get().activeProjectId, get().activeLayerIndex, (slot) => {
        let currentDsl = slot.dslSource;
        let currentNodes = [...slot.nodes];
        let currentEdges = [...slot.edges];

        for (const id of idSet) {
          if (currentDsl) {
            const patched = deleteEntityFromDsl(currentDsl, id, currentNodes, currentEdges);
            currentDsl = patched ?? undefined;
          }
          currentNodes = currentNodes.filter((n) => n.id !== id);
          currentEdges = currentEdges.filter((e) => e.from !== id && e.to !== id);
        }

        currentNodes.forEach((n) => {
          if (n.linkNodeId && idSet.has(n.linkNodeId)) n.linkNodeId = null;
        });

        slot.nodes = currentNodes;
        slot.edges = currentEdges;
        slot.dslSource = currentDsl ?? serializeSlotToDsl(slot);
      });
      set({
        projects: next,
        selectedNodeId: null,
        selectedNodeIds: [],
        inspectorOpen: false,
      });
      pushHistoryForCurrent(next);
      void persist(next);
      get().showToast(`已批量删除 ${idSet.size} 个实体（Ctrl+Z 可撤销）`);
    },

    alignSelectedNodes(direction) {
      const ids = get().selectedNodeIds;
      if (ids.length < 2) return;
      const next = mutateActiveSlot(get().projects, get().activeProjectId, get().activeLayerIndex, (slot) => {
        slot.nodes = alignNodes(slot.nodes, ids, direction);
      });
      set({ projects: next });
      pushHistoryForCurrent(next);
      void persist(next);
    },

    distributeSelectedNodes(axis) {
      const ids = get().selectedNodeIds;
      if (ids.length < 3) return;
      const next = mutateActiveSlot(get().projects, get().activeProjectId, get().activeLayerIndex, (slot) => {
        slot.nodes = distributeNodes(slot.nodes, ids, axis);
      });
      set({ projects: next });
      pushHistoryForCurrent(next);
      void persist(next);
      get().showToast(axis === 'horizontal' ? '已完成水平等距分布' : '已完成垂直等距分布');
    },

    groupSelectedNodes() {
      const ids = get().selectedNodeIds;
      if (ids.length === 0) return;
      let createdId: string | null = null;
      const next = mutateActiveSlot(get().projects, get().activeProjectId, get().activeLayerIndex, (slot) => {
        const bounds = computeGroupBoundsForNodes(slot.nodes, ids, 36);
        if (!bounds) return;
        createdId = `grp-${Date.now().toString(36)}`;
        const groupCount = slot.nodes.filter((n) => n.kind === 'group').length + 1;
        const groupNode: EntityNode = {
          id: createdId,
          dslId: `group_${groupCount}_${Math.random().toString(36).slice(2, 4)}`,
          kind: 'group',
          title: `架构分组边界 ${groupCount}`,
          tag: 'GROUP · BOUNDARY',
          note: 'VPC / 限界上下文边界',
          color: 'violet',
          icon: 'layers',
          x: bounds.x,
          y: bounds.y,
          w: bounds.w,
          h: bounds.h,
          pinned: true,
        };
        const baseDsl = slot.dslSource;
        slot.nodes.unshift(groupNode);
        slot.dslSource = baseDsl
          ? appendEntityToDsl(baseDsl, groupNode, slot.nodes)
          : serializeSlotToDsl(slot);
      });
      if (!createdId) return;
      set({
        projects: next,
        selectedNodeId: createdId,
        selectedNodeIds: [createdId],
        selectedEdgeId: null,
      });
      pushHistoryForCurrent(next);
      void persist(next);
      get().showToast('已创建分组容器包裹选中实体（选中边角可拖拽缩放）');
    },

    duplicateNode(nodeId) {
      let copyId: string | null = null;
      const next = mutateActiveSlot(get().projects, get().activeProjectId, get().activeLayerIndex, (slot) => {
        const orig = slot.nodes.find((n) => n.id === nodeId);
        if (!orig) return;
        const baseDsl = slot.dslSource;
        copyId = `n-${Date.now().toString(36)}`;
        const copyNode: EntityNode = {
          ...clone(orig),
          id: copyId,
          dslId: `${orig.dslId || orig.id}_copy_${Math.random().toString(36).slice(2, 4)}`,
          title: `${orig.title} (副本)`,
          x: orig.x + 40,
          y: orig.y + 40,
          pinned: true,
        };
        slot.nodes.push(copyNode);
        slot.dslSource = baseDsl
          ? appendEntityToDsl(baseDsl, copyNode, slot.nodes)
          : serializeSlotToDsl(slot);
      });
      set({ projects: next, selectedNodeId: copyId });
      pushHistoryForCurrent(next);
      void persist(next);
    },

    disconnectNode(nodeId) {
      const next = mutateActiveSlot(get().projects, get().activeProjectId, get().activeLayerIndex, (slot) => {
        const removedIds = slot.edges
          .filter((e) => e.from === nodeId || e.to === nodeId)
          .map((e) => e.id);
        const prevEdges = [...slot.edges];
        const prevDsl = slot.dslSource;
        slot.edges = slot.edges.filter((e) => e.from !== nodeId && e.to !== nodeId);

        const patched =
          prevDsl && removedIds.length > 0
            ? deleteEdgesFromDsl(prevDsl, removedIds, slot.nodes, prevEdges)
            : prevDsl;
        slot.dslSource = patched ?? serializeSlotToDsl(slot);
      });
      set({ projects: next });
      pushHistoryForCurrent(next);
      void persist(next);
      get().showToast('已断开该实体的全部关联连线');
    },

    toggleNodePinned(nodeId) {
      let isNowPinned = false;
      const next = mutateActiveSlot(get().projects, get().activeProjectId, get().activeLayerIndex, (slot) => {
        const target = slot.nodes.find((n) => n.id === nodeId);
        if (!target) return;
        target.pinned = !target.pinned;
        isNowPinned = !!target.pinned;
      });
      set({ projects: next });
      void persist(next);
      get().showToast(isNowPinned ? '已锁定节点坐标（增量布局保护）' : '已解除坐标锁定');
    },

    connectNodes(from, to, fromField, toField, sourcePort, targetPort) {
      const edgeId = `e-${Date.now().toString(36)}`;
      let added = false;
      const next = mutateActiveSlot(get().projects, get().activeProjectId, get().activeLayerIndex, (slot) => {
        const exists = slot.edges.some(
          (e) =>
            e.from === from &&
            e.to === to &&
            (e.fromField ?? '') === (fromField ?? '') &&
            (e.toField ?? '') === (toField ?? '') &&
            (e.sourcePort ?? '') === (sourcePort ?? '') &&
            (e.targetPort ?? '') === (targetPort ?? '')
        );
        if (exists) return;
        const isFieldLink = Boolean(fromField || toField);
        const newEdge: RelationEdge = {
          id: edgeId,
          from,
          to,
          fromField,
          toField,
          sourcePort: isFieldLink ? undefined : sourcePort,
          targetPort: isFieldLink ? undefined : targetPort,
          label: isFieldLink ? '1 : N' : 'calls',
          routing: isFieldLink ? 'orthogonal' : 'bezier',
        };
        const prevDsl = slot.dslSource;
        const prevEdges = [...slot.edges];
        slot.edges.push(newEdge);
        const patched = prevDsl ? appendEdgeToDsl(prevDsl, newEdge, slot.nodes, prevEdges) : null;
        slot.dslSource = patched ?? serializeSlotToDsl(slot);
        added = true;
      });
      if (!added) {
        get().showToast('该端口对之间已存在相同连线');
        return;
      }
      set({ projects: next, selectedEdgeId: edgeId, selectedNodeId: null });
      pushHistoryForCurrent(next);
      void persist(next);
    },

    updateEdge(edgeId, patch) {
      const next = mutateActiveSlot(get().projects, get().activeProjectId, get().activeLayerIndex, (slot) => {
        const target = slot.edges.find((e) => e.id === edgeId);
        if (!target) return;
        const prevEdge = { ...target };
        const prevEdges = slot.edges.map((e) => (e.id === edgeId ? prevEdge : e));
        Object.assign(target, patch);

        const patched = slot.dslSource
          ? patchEdgeInDsl(slot.dslSource, target, slot.nodes, prevEdges, prevEdge)
          : null;
        slot.dslSource = patched ?? serializeSlotToDsl(slot);
      });
      set({ projects: next });
      pushHistoryForCurrent(next);
      void persist(next);
    },

    updateEdgeWaypoints(edgeId, waypoints) {
      // Pure geometry edit: preserves .arch DSL source untouched
      const next = mutateActiveSlot(get().projects, get().activeProjectId, get().activeLayerIndex, (slot) => {
        const target = slot.edges.find((e) => e.id === edgeId);
        if (!target) return;
        target.waypoints = waypoints && waypoints.length > 0 ? waypoints : undefined;
      });
      set({ projects: next });
      pushHistoryForCurrent(next);
      void persist(next);
    },

    toggleEdgeDashed(edgeId) {
      const next = mutateActiveSlot(get().projects, get().activeProjectId, get().activeLayerIndex, (slot) => {
        const target = slot.edges.find((e) => e.id === edgeId);
        if (!target) return;
        const prevEdge = { ...target };
        const prevEdges = slot.edges.map((e) => (e.id === edgeId ? prevEdge : e));
        target.dashed = !target.dashed;
        const patched = slot.dslSource
          ? patchEdgeInDsl(slot.dslSource, target, slot.nodes, prevEdges, prevEdge)
          : null;
        slot.dslSource = patched ?? serializeSlotToDsl(slot);
      });
      set({ projects: next });
      pushHistoryForCurrent(next);
      void persist(next);
    },

    toggleEdgeRouting(edgeId) {
      const next = mutateActiveSlot(get().projects, get().activeProjectId, get().activeLayerIndex, (slot) => {
        const target = slot.edges.find((e) => e.id === edgeId);
        if (!target) return;
        const prevEdge = { ...target };
        const prevEdges = slot.edges.map((e) => (e.id === edgeId ? prevEdge : e));
        target.routing = target.routing === 'orthogonal' ? 'bezier' : 'orthogonal';
        if (target.routing === 'bezier') target.waypoints = undefined;
        const patched = slot.dslSource
          ? patchEdgeInDsl(slot.dslSource, target, slot.nodes, prevEdges, prevEdge)
          : null;
        slot.dslSource = patched ?? serializeSlotToDsl(slot);
      });
      set({ projects: next });
      pushHistoryForCurrent(next);
      void persist(next);
    },

    reverseEdge(edgeId) {
      const next = mutateActiveSlot(get().projects, get().activeProjectId, get().activeLayerIndex, (slot) => {
        const target = slot.edges.find((e) => e.id === edgeId);
        if (!target) return;
        const prevEdge = { ...target };
        const prevEdges = slot.edges.map((e) => (e.id === edgeId ? prevEdge : e));
        const tmp = target.from;
        target.from = target.to;
        target.to = tmp;
        const tmpField = target.fromField;
        target.fromField = target.toField;
        target.toField = tmpField;
        const tmpPort = target.sourcePort;
        target.sourcePort = target.targetPort;
        target.targetPort = tmpPort;
        const patched = slot.dslSource
          ? patchEdgeInDsl(slot.dslSource, target, slot.nodes, prevEdges, prevEdge)
          : null;
        slot.dslSource = patched ?? serializeSlotToDsl(slot);
      });
      set({ projects: next });
      pushHistoryForCurrent(next);
      void persist(next);
    },

    deleteEdge(edgeId) {
      const next = mutateActiveSlot(get().projects, get().activeProjectId, get().activeLayerIndex, (slot) => {
        const prevEdges = [...slot.edges];
        const prevDsl = slot.dslSource;
        slot.edges = slot.edges.filter((e) => e.id !== edgeId);
        const patched = prevDsl ? deleteEdgesFromDsl(prevDsl, [edgeId], slot.nodes, prevEdges) : null;
        slot.dslSource = patched ?? serializeSlotToDsl(slot);
      });
      set({ projects: next, selectedEdgeId: null });
      pushHistoryForCurrent(next);
      void persist(next);
    },

    addFreehandStroke(stroke) {
      const next = mutateActiveSlot(get().projects, get().activeProjectId, get().activeLayerIndex, (slot) => {
        slot.freehand = [...(slot.freehand ?? []), stroke];
      });
      set({ projects: next });
      pushHistoryForCurrent(next);
      void persist(next);
    },

    clearFreehandStrokes() {
      const next = mutateActiveSlot(get().projects, get().activeProjectId, get().activeLayerIndex, (slot) => {
        slot.freehand = [];
      });
      set({ projects: next });
      pushHistoryForCurrent(next);
      void persist(next);
      get().showToast('已清空当前画布手绘笔迹（Ctrl+Z 可撤销）');
    },

    toggleNodeCollapse(nodeId) {
      const next = mutateActiveSlot(get().projects, get().activeProjectId, get().activeLayerIndex, (slot) => {
        const n = slot.nodes.find((item) => item.id === nodeId);
        if (n && isCollapsibleEntity(n)) n.collapsed = !n.collapsed;
      });
      set({ projects: next });
      void persist(next);
    },

    cycleDensity() {
      const proj = get().projects.find((p) => p.id === get().activeProjectId);
      const active = getActiveSlotFromProject(proj, get().activeLayerIndex);
      if (!active) return;
      const collapsible = active.slot.nodes.filter(isCollapsibleEntity);
      if (collapsible.length === 0) return;

      const allCollapsed = collapsible.every((n) => !!n.collapsed);
      const allExpanded = collapsible.every((n) => !n.collapsed);

      let nextExpandMode: CanvasExpandMode = get().expandMode;
      let setCollapsedTo: boolean | null = null;

      if (allCollapsed) {
        nextExpandMode = 'full';
        setCollapsedTo = false;
        get().showToast('已切换为「完整展开」卡片视图');
      } else if (allExpanded && nextExpandMode !== 'related') {
        nextExpandMode = 'related';
        get().showToast('已切换为「仅关联字段」视图');
      } else {
        nextExpandMode = 'full';
        setCollapsedTo = true;
        get().showToast('已收起卡片轮廓，适合俯瞰全局');
      }

      const next = mutateActiveSlot(get().projects, get().activeProjectId, get().activeLayerIndex, (slot) => {
        if (setCollapsedTo !== null) {
          slot.nodes.forEach((n) => {
            if (isCollapsibleEntity(n)) n.collapsed = setCollapsedTo!;
          });
        }
      });
      set({ projects: next, expandMode: nextExpandMode });
      void persist(next);
    },

    toggleCompactMode() {
      const next = !get().compactMode;
      set({ compactMode: next });
      get().showToast(
        next ? '已切换至精简模式：仅显示图标、标签与名称' : '已切换至完整卡片模式'
      );
    },

    async runAutoLayout(respectPinned = false) {
      const proj = get().projects.find((p) => p.id === get().activeProjectId);
      const active = getActiveSlotFromProject(proj, get().activeLayerIndex);
      if (!active) return;
      const result = await computeAutoLayout(active.slot.nodes, active.slot.edges, {
        direction: 'RIGHT',
        respectPinned,
      });
      const next = mutateActiveSlot(get().projects, get().activeProjectId, get().activeLayerIndex, (slot) => {
        slot.nodes = result.nodes;
        slot.edges = result.edges;
      });
      set({ projects: next });
      pushHistoryForCurrent(next);
      void persist(next);
      get().showToast(respectPinned ? '已完成增量布局（保留已锁定节点）' : '已完成 ELK 分层正交布局');
    },

    applyDslSource(source) {
      const proj = get().projects.find((p) => p.id === get().activeProjectId);
      const active = getActiveSlotFromProject(proj, get().activeLayerIndex);
      if (!active) return;

      const parsed = parseArchDsl(source, active.slot.nodes, active.slot.edges);
      set({ dslDiagnostics: parsed.diagnostics });

      if (parsed.diagnostics.some((d) => d.severity === 'error')) {
        return;
      }

      const next = mutateActiveSlot(get().projects, get().activeProjectId, get().activeLayerIndex, (slot) => {
        slot.nodes = parsed.nodes;
        slot.edges = parsed.edges;
        slot.flows = parsed.flows;
        slot.dslSource = source;
      });
      set({ projects: next });
      pushHistoryForCurrent(next);
      void persist(next);
    },

    createLayerVersion(label) {
      const next = get().projects.map((p) => {
        if (p.id !== get().activeProjectId) return p;
        const copy = clone(p);
        const active = getActiveSlotFromProject(copy, get().activeLayerIndex);
        if (!active) return p;
        const versions = active.layer.versions ?? [];
        versions.unshift({
          id: `ver-${Date.now()}`,
          name: label || `快照 v${versions.length + 1}`,
          createdAt: Date.now(),
          nodeCount: active.slot.nodes.length,
          edgeCount: active.slot.edges.length,
          snapshot: {
            id: active.slot.id,
            name: active.slot.name,
            engine: active.slot.engine,
            nodes: clone(active.slot.nodes),
            edges: clone(active.slot.edges),
            flows: clone(active.slot.flows),
          },
        });
        active.layer.versions = versions;
        return copy;
      });
      set({ projects: next });
      void persist(next);
      get().showToast('已保存当前层版本快照');
    },

    restoreLayerVersion(versionId) {
      const next = get().projects.map((p) => {
        if (p.id !== get().activeProjectId) return p;
        const copy = clone(p);
        const active = getActiveSlotFromProject(copy, get().activeLayerIndex);
        if (!active) return p;
        const snap = active.layer.versions?.find((v) => v.id === versionId)?.snapshot;
        if (!snap) return p;
        active.slot.nodes = clone(snap.nodes);
        active.slot.edges = clone(snap.edges);
        active.slot.flows = clone(snap.flows);
        active.slot.dslSource = serializeSlotToDsl(active.slot);
        return copy;
      });
      set({ projects: next, selectedNodeId: null, selectedEdgeId: null });
      pushHistoryForCurrent(next);
      void persist(next);
      get().showToast('已恢复选定快照（支持 Ctrl+Z 撤销）');
    },

    undo() {
      const { history, historyIndex } = get();
      if (historyIndex <= 0) return;
      const target = history[historyIndex - 1];
      const next = mutateActiveSlot(get().projects, get().activeProjectId, get().activeLayerIndex, (slot) => {
        slot.nodes = clone(target.nodes);
        slot.edges = clone(target.edges);
        slot.flows = clone(target.flows ?? []);
        slot.freehand = clone(target.freehand ?? []);
        slot.dslSource = target.dslSource;
      });
      set({ projects: next, historyIndex: historyIndex - 1 });
      void persist(next);
    },

    redo() {
      const { history, historyIndex } = get();
      if (historyIndex >= history.length - 1) return;
      const target = history[historyIndex + 1];
      const next = mutateActiveSlot(get().projects, get().activeProjectId, get().activeLayerIndex, (slot) => {
        slot.nodes = clone(target.nodes);
        slot.edges = clone(target.edges);
        slot.flows = clone(target.flows ?? []);
        slot.freehand = clone(target.freehand ?? []);
        slot.dslSource = target.dslSource;
      });
      set({ projects: next, historyIndex: historyIndex + 1 });
      void persist(next);
    },

    toggleSimulation() {
      const currentlyOn = get().simulating;
      if (currentlyOn) {
        set({ simulating: false, isFlowPlaying: false, flowStepIndex: -1 });
        return;
      }
      const proj = get().projects.find((p) => p.id === get().activeProjectId);
      const active = getActiveSlotFromProject(proj, get().activeLayerIndex);
      const existing = active?.slot.flows?.find((f) => f.id === get().activeFlowId);
      const targetFlow = existing ?? active?.slot.flows?.[0] ?? null;
      set({
        simulating: true,
        activeFlowId: targetFlow?.id ?? null,
        flowStepIndex: targetFlow && targetFlow.steps.length > 0 ? 0 : -1,
        isFlowPlaying: false,
      });
      get().showToast(
        targetFlow ? `已启动链路演播：${targetFlow.name}` : '已启动全图拓扑脉冲校验'
      );
    },

    selectFlow(flowId) {
      const proj = get().projects.find((p) => p.id === get().activeProjectId);
      const active = getActiveSlotFromProject(proj, get().activeLayerIndex);
      const target = active?.slot.flows?.find((f) => f.id === flowId);
      set({
        activeFlowId: flowId,
        flowStepIndex: target && target.steps.length > 0 ? 0 : -1,
        isFlowPlaying: false,
      });
    },

    setFlowStepIndex(index) {
      set({
        simulating: true,
        flowStepIndex: index,
        isFlowPlaying: false,
      });
    },

    stepFlow(delta) {
      const proj = get().projects.find((p) => p.id === get().activeProjectId);
      const active = getActiveSlotFromProject(proj, get().activeLayerIndex);
      const flows = active?.slot.flows ?? [];
      const flow = flows.find((f) => f.id === get().activeFlowId) ?? flows[0];
      if (!flow || flow.steps.length === 0) return;
      const len = flow.steps.length;
      const curr = get().flowStepIndex;
      const nextIdx = curr < 0 ? 0 : (curr + delta + len) % len;
      set({ flowStepIndex: nextIdx });
    },

    toggleFlowAutoPlay() {
      set({ isFlowPlaying: !get().isFlowPlaying });
    },

    resetFlowStep() {
      set({ flowStepIndex: -1, isFlowPlaying: false });
    },

    stopSimulation() {
      set({ simulating: false, isFlowPlaying: false, flowStepIndex: -1, flowPickEdgeMode: false });
    },

    openFlowEditor() {
      set({ leftTab: 'flows' });
    },

    setFlowPickEdgeMode(active) {
      set({ flowPickEdgeMode: active, activeTool: active ? 'select' : get().activeTool });
      if (active) {
        get().showToast('已进入连线拾取模式：点击画布任意连线即可追加步骤');
      }
    },

    createFlow(name, description) {
      const { activeProjectId, activeLayerIndex, projects } = get();
      if (!activeProjectId) return null;
      const newFlowId = `flow_${Date.now().toString(36)}`;
      let resolvedName = '';
      const next = mutateActiveSlot(projects, activeProjectId, activeLayerIndex, (slot) => {
        const flows = slot.flows ? [...slot.flows] : [];
        resolvedName = (name || `推演链路 ${flows.length + 1}`).trim();
        flows.push({
          id: newFlowId,
          name: resolvedName,
          description: description?.trim() || undefined,
          steps: [],
        });
        slot.flows = flows;
        slot.dslSource = slot.dslSource
          ? syncFlowsInDsl(slot.dslSource, flows, slot.nodes)
          : serializeSlotToDsl(slot);
      });
      set({ projects: next, activeFlowId: newFlowId, flowStepIndex: -1, isFlowPlaying: false });
      pushHistoryForCurrent(next);
      void persist(next);
      get().showToast(`已新建推演链路「${resolvedName}」`);
      return newFlowId;
    },

    updateFlowMeta(flowId, patch) {
      const next = mutateActiveSlot(get().projects, get().activeProjectId, get().activeLayerIndex, (slot) => {
        const target = slot.flows?.find((f) => f.id === flowId);
        if (!target) return;
        if (patch.name !== undefined) target.name = patch.name;
        if (patch.description !== undefined) target.description = patch.description || undefined;
        slot.dslSource = slot.dslSource
          ? syncFlowsInDsl(slot.dslSource, slot.flows ?? [], slot.nodes)
          : serializeSlotToDsl(slot);
      });
      set({ projects: next });
      pushHistoryForCurrent(next);
      void persist(next);
    },

    deleteFlow(flowId) {
      let nextActiveId: string | null = null;
      const next = mutateActiveSlot(get().projects, get().activeProjectId, get().activeLayerIndex, (slot) => {
        const remaining = (slot.flows ?? []).filter((f) => f.id !== flowId);
        slot.flows = remaining;
        nextActiveId = remaining[0]?.id ?? null;
        slot.dslSource = slot.dslSource
          ? syncFlowsInDsl(slot.dslSource, remaining, slot.nodes)
          : serializeSlotToDsl(slot);
      });
      set({
        projects: next,
        activeFlowId: nextActiveId,
        flowStepIndex: -1,
        isFlowPlaying: false,
        flowPickEdgeMode: false,
      });
      pushHistoryForCurrent(next);
      void persist(next);
      get().showToast('已删除推演链路');
    },

    addFlowStep(flowId, step) {
      let addedIdx = 0;
      const next = mutateActiveSlot(get().projects, get().activeProjectId, get().activeLayerIndex, (slot) => {
        const flow = slot.flows?.find((f) => f.id === flowId);
        if (!flow) return;
        flow.steps.push({ ...step, order: flow.steps.length + 1 });
        addedIdx = flow.steps.length - 1;
        slot.dslSource = slot.dslSource
          ? syncFlowsInDsl(slot.dslSource, slot.flows ?? [], slot.nodes)
          : serializeSlotToDsl(slot);
      });
      set({ projects: next, simulating: true, activeFlowId: flowId, flowStepIndex: addedIdx, isFlowPlaying: false });
      pushHistoryForCurrent(next);
      void persist(next);
    },

    addFlowStepFromEdge(edgeId) {
      const proj = get().projects.find((p) => p.id === get().activeProjectId);
      const active = getActiveSlotFromProject(proj, get().activeLayerIndex);
      if (!active) return;
      const edge = active.slot.edges.find((e) => e.id === edgeId);
      if (!edge) return;

      let flowId =
        active.slot.flows?.find((f) => f.id === get().activeFlowId)?.id ??
        active.slot.flows?.[0]?.id ??
        null;
      if (!flowId) {
        flowId = get().createFlow('核心业务链路');
      }
      if (!flowId) return;

      const fromNode = active.slot.nodes.find((n) => n.id === edge.from);
      const toNode = active.slot.nodes.find((n) => n.id === edge.to);
      const defaultLabel =
        [edge.protocol, edge.label].filter(Boolean).join(' · ') ||
        `${fromNode?.title ?? edge.from} → ${toNode?.title ?? edge.to}`;

      get().addFlowStep(flowId, {
        from: edge.from,
        to: edge.to,
        edgeId: edge.id,
        label: defaultLabel,
      });
      get().showToast(`已追加步骤：${defaultLabel}`);
    },

    updateFlowStep(flowId, stepIndex, patch) {
      const next = mutateActiveSlot(get().projects, get().activeProjectId, get().activeLayerIndex, (slot) => {
        const flow = slot.flows?.find((f) => f.id === flowId);
        if (!flow || !flow.steps[stepIndex]) return;
        Object.assign(flow.steps[stepIndex], patch);
        slot.dslSource = slot.dslSource
          ? syncFlowsInDsl(slot.dslSource, slot.flows ?? [], slot.nodes)
          : serializeSlotToDsl(slot);
      });
      set({ projects: next });
      pushHistoryForCurrent(next);
      void persist(next);
    },

    moveFlowStep(flowId, fromIndex, toIndex) {
      if (fromIndex === toIndex) return;
      const next = mutateActiveSlot(get().projects, get().activeProjectId, get().activeLayerIndex, (slot) => {
        const flow = slot.flows?.find((f) => f.id === flowId);
        if (
          !flow ||
          fromIndex < 0 ||
          toIndex < 0 ||
          fromIndex >= flow.steps.length ||
          toIndex >= flow.steps.length
        ) {
          return;
        }
        const [moved] = flow.steps.splice(fromIndex, 1);
        flow.steps.splice(toIndex, 0, moved);
        flow.steps.forEach((s, i) => {
          s.order = i + 1;
        });
        slot.dslSource = slot.dslSource
          ? syncFlowsInDsl(slot.dslSource, slot.flows ?? [], slot.nodes)
          : serializeSlotToDsl(slot);
      });
      set({ projects: next, flowStepIndex: toIndex });
      pushHistoryForCurrent(next);
      void persist(next);
    },

    deleteFlowStep(flowId, stepIndex) {
      let nextStepIdx = -1;
      const next = mutateActiveSlot(get().projects, get().activeProjectId, get().activeLayerIndex, (slot) => {
        const flow = slot.flows?.find((f) => f.id === flowId);
        if (!flow || !flow.steps[stepIndex]) return;
        flow.steps.splice(stepIndex, 1);
        flow.steps.forEach((s, i) => {
          s.order = i + 1;
        });
        nextStepIdx = flow.steps.length > 0 ? Math.min(stepIndex, flow.steps.length - 1) : -1;
        slot.dslSource = slot.dslSource
          ? syncFlowsInDsl(slot.dslSource, slot.flows ?? [], slot.nodes)
          : serializeSlotToDsl(slot);
      });
      set({ projects: next, flowStepIndex: nextStepIdx });
      pushHistoryForCurrent(next);
      void persist(next);
    },
  };
});

export type { EdgeRoutingMode };
