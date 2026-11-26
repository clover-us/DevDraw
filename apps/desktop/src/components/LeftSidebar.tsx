import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Blocks,
  Box,
  ChevronsLeft,
  Code2,
  Database,
  Eraser,
  GitBranch,
  GitCompareArrows,
  GripVertical,
  History,
  Layers,
  LayoutGrid,
  Link2,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Route,
  Search,
  Trash2,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import {
  findPrimitiveByKind,
  getPaletteConfigForTemplate,
  GROUP_CONTAINER_ITEM,
  REASONING_ANNOTATION_ITEMS,
  type PrimitiveItem,
  type SemanticColor,
} from '@devdraw/core';
import { ENTITY_ICON_MAP } from '@devdraw/canvas';
import { isTauriRuntime } from '../storage/adapter';
import {
  getActiveSlotFromProject,
  useWorkbenchStore,
  type GitCommitSummary,
  type LeftActivityTab,
} from '../store/useWorkbenchStore';
import { FlowEditorPanel } from './FlowEditorPanel';

const PALETTE_COLOR_MAP: Record<SemanticColor, { box: string; badge: string }> = {
  violet: { box: 'bg-violet-500/15 text-violet-300 border-violet-400/25', badge: 'bg-violet-500/15 text-violet-300' },
  sky: { box: 'bg-sky-500/15 text-sky-300 border-sky-400/25', badge: 'bg-sky-500/15 text-sky-300' },
  emerald: { box: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/25', badge: 'bg-emerald-500/15 text-emerald-300' },
  amber: { box: 'bg-amber-500/15 text-amber-300 border-amber-400/25', badge: 'bg-amber-500/15 text-amber-300' },
  rose: { box: 'bg-rose-500/15 text-rose-300 border-rose-400/25', badge: 'bg-rose-500/15 text-rose-300' },
  slate: { box: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/25', badge: 'bg-zinc-500/15 text-zinc-300' },
};

export const LeftSidebar: React.FC = () => {
  const {
    projects,
    activeProjectId,
    activeLayerIndex,
    leftTab,
    dslSplitOpen,
    styleModalOpen,
    selectedNodeId,
    toggleLeftTab,
    openStyleModal,
    addNodeFromPrimitive,
    selectLayer,
    selectSubCanvas,
    addSubCanvas,
    renameSubCanvas,
    deleteSubCanvas,
    setCrossRefModalOpen,
    selectNode,
    openNodeInspector,
    runAutoLayout,
    clearFreehandStrokes,
    createLayerVersion,
    restoreLayerVersion,
    deleteLayerVersion,
    diffBaseline,
    startDiffWithSnapshot,
    startDiffWithLayer,
    startDiffWithGitCommit,
    clearDiffBaseline,
  } = useWorkbenchStore();

  const [paletteQuery, setPaletteQuery] = useState('');
  const [hoveredItem, setHoveredItem] = useState<PrimitiveItem | null>(null);
  const [renamingSubKey, setRenamingSubKey] = useState<string | null>(null);
  const [subDraftName, setSubDraftName] = useState('');
  const [snapshotName, setSnapshotName] = useState('');
  const [gitCommits, setGitCommits] = useState<GitCommitSummary[]>([]);
  const [gitLoading, setGitLoading] = useState(false);

  const project = projects.find((p) => p.id === activeProjectId);
  const active = getActiveSlotFromProject(project, activeLayerIndex);

  const refreshGitCommits = useCallback(async () => {
    if (!project?.workspacePath || !isTauriRuntime()) {
      setGitCommits([]);
      return;
    }
    setGitLoading(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const list = await invoke<GitCommitSummary[]>('git_list_commits', {
        root: project.workspacePath,
        limit: 12,
      });
      setGitCommits(list);
    } catch {
      setGitCommits([]);
    } finally {
      setGitLoading(false);
    }
  }, [project?.workspacePath]);

  useEffect(() => {
    if (leftTab === 'versions' && project?.workspacePath) {
      void refreshGitCommits();
    }
  }, [leftTab, project?.workspacePath, refreshGitCommits]);

  const paletteConfig = useMemo(() => {
    if (!active) return null;
    return getPaletteConfigForTemplate(active.layer.template, active.slot.engine);
  }, [active]);

  if (!project || !active || !paletteConfig) return null;

  const q = paletteQuery.trim().toLowerCase();
  const matchItem = (it: PrimitiveItem) =>
    !q || it.label.toLowerCase().includes(q) || it.badge.toLowerCase().includes(q);

  const navItems: Array<{
    id: LeftActivityTab;
    title: string;
    icon: React.ComponentType<{ className?: string }>;
    activeColorClass: string;
  }> = [
    { id: 'palette', title: '实体原语库 (拖放组件)', icon: Blocks, activeColorClass: 'text-violet-400' },
    { id: 'layers', title: '推演层与实体大纲', icon: Layers, activeColorClass: 'text-sky-400' },
    { id: 'flows', title: '动态链路编排 (Step-by-step)', icon: Route, activeColorClass: 'text-emerald-400' },
    { id: 'dsl', title: '图码双向 .arch DSL (Ctrl+\\)', icon: Code2, activeColorClass: 'text-emerald-400' },
    { id: 'tools', title: 'ELK 自动布局与辅助', icon: Wand2, activeColorClass: 'text-amber-400' },
    { id: 'versions', title: '版本与快照管理', icon: History, activeColorClass: 'text-indigo-400' },
  ];

  const handleDragStart = (e: React.DragEvent, kind: string) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/x-devdraw-kind', kind);
    e.dataTransfer.setData('text/plain', kind);
  };

  return (
    <div className="flex h-full z-30 shrink-0 select-none">
      {/* 48px Permanent Activity Bar */}
      <nav className="w-12 h-full border-r bg-[var(--dd-bg-shell)] border-[var(--dd-border-subtle)] py-2.5 flex flex-col items-center justify-between shrink-0">
        <div className="flex flex-col items-center gap-1.5 w-full px-1.5">
          {navItems.map((nav) => {
            const Icon = nav.icon;
            const isActive = nav.id === 'dsl' ? dslSplitOpen : leftTab === nav.id;
            return (
              <button
                key={nav.id}
                type="button"
                onClick={() => toggleLeftTab(nav.id)}
                title={nav.title}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                  isActive
                    ? `${nav.activeColorClass} hover:bg-white/[0.06]`
                    : 'text-[var(--dd-text-secondary)] hover:text-[var(--dd-text-primary)] hover:bg-white/[0.05]'
                }`}
              >
                <Icon className="w-[18px] h-[18px]" />
              </button>
            );
          })}
        </div>

        <div className="flex flex-col items-center gap-1.5 w-full px-1.5">
          <button
            type="button"
            onClick={() => openStyleModal(selectedNodeId)}
            title="自定义实体样式（独立外观面板）"
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
              styleModalOpen
                ? 'text-fuchsia-400 hover:bg-white/[0.06]'
                : 'text-[var(--dd-text-secondary)] hover:text-[var(--dd-text-primary)] hover:bg-white/[0.05]'
            }`}
          >
            <Palette className="w-[18px] h-[18px]" />
          </button>
          <button
            type="button"
            onClick={() => toggleLeftTab(leftTab ? leftTab : 'palette')}
            title={leftTab ? '收起侧边功能页' : '展开侧边功能页'}
            className="w-9 h-9 rounded-xl text-[var(--dd-text-secondary)] hover:text-[var(--dd-text-primary)] hover:bg-white/[0.05] flex items-center justify-center transition-colors"
          >
            {leftTab ? <PanelLeftClose className="w-[18px] h-[18px]" /> : <PanelLeftOpen className="w-[18px] h-[18px]" />}
          </button>
        </div>
      </nav>

      {/* Expandable Drawer */}
      {leftTab && (
        <aside
          className={`relative h-full border-r bg-[var(--dd-bg-panel)] border-[var(--dd-border-subtle)] flex flex-col overflow-hidden shrink-0 ${
            leftTab === 'flows' ? 'w-72 xl:w-80' : 'w-64'
          }`}
        >
          {leftTab === 'flows' && <FlowEditorPanel />}
          {leftTab === 'palette' && (
            <div className="flex-1 flex flex-col min-h-0 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[11px] font-mono font-semibold uppercase tracking-wider truncate">
                    {paletteConfig.heading}
                  </span>
                  <span className="text-[9px] font-mono px-1 rounded bg-violet-500/15 text-violet-300 shrink-0">
                    拖放
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => toggleLeftTab('palette')}
                  className="p-1 rounded-md text-[var(--dd-text-secondary)] hover:bg-white/[0.08]"
                >
                  <ChevronsLeft className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="relative mb-2">
                <Search className="w-3 h-3 text-[var(--dd-text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={paletteQuery}
                  onChange={(e) => setPaletteQuery(e.target.value)}
                  placeholder="筛选实体原语..."
                  className="w-full h-7 pl-7 pr-2 rounded-lg bg-black/20 border border-[var(--dd-border-subtle)] focus:border-violet-400/50 focus:outline-none text-[11px]"
                />
              </div>

              <div className="flex-1 overflow-y-auto space-y-2.5 pr-0.5">
                {paletteConfig.groups.map((group, gIdx) => {
                  const items = group.items.filter(matchItem);
                  if (items.length === 0) return null;
                  return (
                    <div key={group.name ?? gIdx} className="space-y-1">
                      {group.name && (
                        <div className="px-1 flex items-center justify-between text-[10px]">
                          <span className="font-semibold text-violet-400">{group.name}</span>
                          <span className="font-mono text-[var(--dd-text-muted)]">{group.hint}</span>
                        </div>
                      )}
                      {items.map((item) => {
                        const kindOverride = project.kindStyles?.[item.kind];
                        const iconName = kindOverride?.icon || item.icon;
                        const colorKey = kindOverride?.color || item.defaultColor || 'violet';
                        const tone = PALETTE_COLOR_MAP[colorKey] ?? PALETTE_COLOR_MAP.violet;
                        const ItemIcon = ENTITY_ICON_MAP[iconName] || Box;
                        return (
                          <div
                            key={item.kind}
                            draggable
                            onDragStart={(e) => handleDragStart(e, item.kind)}
                            onMouseEnter={() => setHoveredItem(item)}
                            onMouseLeave={() => setHoveredItem(null)}
                            onClick={() =>
                              addNodeFromPrimitive(
                                item.kind,
                                180 + Math.round(Math.random() * 140),
                                120 + Math.round(Math.random() * 120)
                              )
                            }
                            className="group flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.07] border border-transparent hover:border-[var(--dd-border-subtle)] cursor-grab active:cursor-grabbing text-xs transition-colors"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <GripVertical className="w-3 h-3 text-[var(--dd-text-muted)] shrink-0 opacity-60 group-hover:opacity-100" />
                              <span
                                className={`w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 ${tone.box}`}
                              >
                                <ItemIcon className="w-3.5 h-3.5" />
                              </span>
                              <span className="truncate text-[11.5px]">{item.label}</span>
                            </div>
                            <span
                              className={`text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0 ${tone.badge}`}
                            >
                              {item.badge}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

                {/* Universal Reasoning Annotations & Group Boundary */}
                <div className="pt-2 border-t border-[var(--dd-border-subtle)] space-y-1">
                  <div className="px-1 flex items-center justify-between text-[10px] font-mono text-[var(--dd-text-muted)] uppercase">
                    <span>分组容器与研思标注</span>
                    <span>全层通用</span>
                  </div>
                  {[GROUP_CONTAINER_ITEM, ...REASONING_ANNOTATION_ITEMS].filter(matchItem).map((ann) => {
                    const tone = PALETTE_COLOR_MAP[ann.defaultColor] ?? PALETTE_COLOR_MAP.amber;
                    const AnnIcon = ENTITY_ICON_MAP[ann.icon] || Box;
                    return (
                      <div
                        key={ann.kind}
                        draggable
                        onDragStart={(e) => handleDragStart(e, ann.kind)}
                        onMouseEnter={() => setHoveredItem(ann)}
                        onMouseLeave={() => setHoveredItem(null)}
                        onClick={() => addNodeFromPrimitive(ann.kind, 220, 240)}
                        className="group flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg border border-dashed border-[var(--dd-border-subtle)] hover:border-amber-400/40 hover:bg-white/[0.05] cursor-grab text-xs transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <GripVertical className="w-3 h-3 text-[var(--dd-text-muted)] shrink-0 opacity-60 group-hover:opacity-100" />
                          <span
                            className={`w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 ${tone.box}`}
                          >
                            <AnnIcon className="w-3.5 h-3.5" />
                          </span>
                          <span className="truncate text-[11.5px]">{ann.label}</span>
                        </div>
                        <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0 ${tone.badge}`}>
                          {ann.badge}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Contextual Description Box */}
              <div className="mt-2.5 p-2.5 rounded-xl bg-white/[0.03] border border-[var(--dd-border-subtle)] text-[11px] text-[var(--dd-text-secondary)] shrink-0">
                <div className="font-medium text-[var(--dd-text-primary)] mb-0.5">
                  {hoveredItem ? hoveredItem.label : paletteConfig.tipTitle}
                </div>
                <p className="leading-relaxed line-clamp-3">
                  {hoveredItem ? hoveredItem.desc : paletteConfig.tipDesc}
                </p>
              </div>
            </div>
          )}

          {leftTab === 'layers' && (
            <div className="flex-1 flex flex-col min-h-0 p-3 space-y-3 overflow-y-auto">
              <div className="text-[11px] font-mono font-semibold uppercase tracking-wider">
                推演层与实体大纲
              </div>

              <div className="space-y-1">
                <div className="text-[10px] font-mono text-[var(--dd-text-muted)] uppercase">已启用推演层</div>
                {project.layers.map((l, idx) => {
                  const hasChildren = Boolean(l.children && l.children.length > 0);
                  const totalCount = hasChildren
                    ? l.children!.reduce((sum, c) => sum + c.nodes.length, 0)
                    : l.nodes.length;
                  const isCurrentLayer = idx === activeLayerIndex;
                  const activeSubIdx = l.activeChildIndex ?? 0;

                  return (
                    <div key={l.id} className="space-y-0.5">
                      <button
                        type="button"
                        onClick={() => selectLayer(idx)}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors ${
                          isCurrentLayer
                            ? 'bg-violet-500/20 text-violet-300 font-medium'
                            : 'hover:bg-white/[0.06]'
                        }`}
                      >
                        <span className="truncate">{l.name}</span>
                        <span className="text-[10px] font-mono opacity-75">{totalCount}</span>
                      </button>

                      {/* Nested engine sub-canvases (e.g. 关系库 / 缓存 under 数据建模) */}
                      {(hasChildren || l.template === '数据建模') && (
                        <div className="pl-3 ml-2 border-l border-[var(--dd-border-subtle)] space-y-0.5 pt-0.5">
                          {(l.children ?? []).map((sub, subIdx) => {
                            const isCurrentSub = isCurrentLayer && subIdx === activeSubIdx;
                            const SubIcon = sub.engine === 'redis' ? Zap : Database;
                            const subKey = `${l.id}:${sub.id}`;
                            const isEditingSub = renamingSubKey === subKey;
                            return (
                              <div
                                key={sub.id}
                                className={`group flex items-center justify-between gap-1 rounded-md px-2 py-1 text-[11px] transition-colors ${
                                  isCurrentSub
                                    ? 'bg-violet-500/15 text-violet-300 font-medium'
                                    : 'text-[var(--dd-text-secondary)] hover:bg-white/[0.05] hover:text-[var(--dd-text-primary)]'
                                }`}
                              >
                                {isEditingSub ? (
                                  <input
                                    autoFocus
                                    value={subDraftName}
                                    onChange={(e) => setSubDraftName(e.target.value)}
                                    onBlur={() => {
                                      if (subDraftName.trim()) {
                                        renameSubCanvas(idx, subIdx, subDraftName.trim());
                                      }
                                      setRenamingSubKey(null);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        if (subDraftName.trim()) {
                                          renameSubCanvas(idx, subIdx, subDraftName.trim());
                                        }
                                        setRenamingSubKey(null);
                                      }
                                      if (e.key === 'Escape') setRenamingSubKey(null);
                                    }}
                                    className="flex-1 min-w-0 px-1 py-0.5 rounded bg-black/30 border border-violet-400/60 outline-none text-[11px]"
                                  />
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (!isCurrentLayer) selectLayer(idx);
                                        selectSubCanvas(subIdx);
                                      }}
                                      onDoubleClick={() => {
                                        setRenamingSubKey(subKey);
                                        setSubDraftName(sub.name);
                                      }}
                                      className="flex-1 min-w-0 text-left flex items-center gap-1.5"
                                    >
                                      <SubIcon className="w-3 h-3 shrink-0 opacity-80" />
                                      <span className="truncate">{sub.name}</span>
                                    </button>
                                    <div className="flex items-center gap-0.5 shrink-0">
                                      <button
                                        type="button"
                                        title="重命名子画布"
                                        onClick={() => {
                                          setRenamingSubKey(subKey);
                                          setSubDraftName(sub.name);
                                        }}
                                        className="opacity-0 group-hover:opacity-80 hover:!opacity-100 p-0.5 rounded hover:bg-white/10"
                                      >
                                        <Pencil className="w-2.5 h-2.5" />
                                      </button>
                                      {(l.children?.length ?? 0) > 1 && (
                                        <button
                                          type="button"
                                          title="删除子画布"
                                          onClick={() => deleteSubCanvas(idx, subIdx)}
                                          className="opacity-0 group-hover:opacity-80 hover:!opacity-100 p-0.5 rounded hover:bg-rose-500/20 text-rose-400"
                                        >
                                          <Trash2 className="w-2.5 h-2.5" />
                                        </button>
                                      )}
                                      <span className="text-[10px] font-mono opacity-70 pl-0.5">
                                        {sub.nodes.length}
                                      </span>
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })}
                          <div className="flex items-center gap-1 pt-0.5">
                            <button
                              type="button"
                              onClick={() => addSubCanvas(idx, 'relational')}
                              className="flex-1 inline-flex items-center justify-center gap-1 px-1.5 py-1 rounded bg-white/[0.03] hover:bg-white/[0.08] text-[10px] text-[var(--dd-text-muted)] hover:text-sky-300 transition-colors"
                            >
                              <Plus className="w-2.5 h-2.5" />
                              <span>关系库</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => addSubCanvas(idx, 'redis')}
                              className="flex-1 inline-flex items-center justify-center gap-1 px-1.5 py-1 rounded bg-white/[0.03] hover:bg-white/[0.08] text-[10px] text-[var(--dd-text-muted)] hover:text-rose-300 transition-colors"
                            >
                              <Plus className="w-2.5 h-2.5" />
                              <span>缓存</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="pt-2 border-t border-[var(--dd-border-subtle)] flex-1 space-y-1">
                <div className="flex items-center justify-between gap-1 text-[10px] font-mono text-[var(--dd-text-muted)] uppercase">
                  <span className="truncate">
                    当前画布实体 ({active.slot.nodes.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setCrossRefModalOpen(true)}
                    title="从其他层引入只读引用锚点"
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-500/15 hover:bg-violet-500/25 text-violet-300 normal-case shrink-0"
                  >
                    <Link2 className="w-2.5 h-2.5" />
                    <span>跨层引用</span>
                  </button>
                </div>
                {active.slot.nodes.map((node) => {
                  const prim = findPrimitiveByKind(node.kind);
                  const iconName =
                    node.customStyle?.icon ??
                    project.kindStyles?.[node.kind]?.icon ??
                    node.icon ??
                    prim?.icon ??
                    '';
                  const NodeIcon = ENTITY_ICON_MAP[iconName] || Box;
                  return (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => selectNode(node.id)}
                      onDoubleClick={() => openNodeInspector(node.id)}
                      title="单击选中 · 双击打开详情抽屉"
                      className={`w-full text-left px-2 py-1.5 rounded-lg text-xs flex items-center justify-between gap-2 transition-colors ${
                        node.id === selectedNodeId ? 'bg-sky-500/20 text-sky-300' : 'hover:bg-white/[0.06]'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 min-w-0">
                        <NodeIcon className="w-3.5 h-3.5 shrink-0 opacity-75" />
                        <span className="truncate">{node.title}</span>
                      </span>
                      <span className="text-[9.5px] font-mono opacity-60 shrink-0">{node.tag}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {leftTab === 'tools' && (
            <div className="flex-1 p-3 space-y-2.5 overflow-y-auto">
              <div className="text-[11px] font-mono font-semibold uppercase tracking-wider">
                ELK 智能排版与辅助
              </div>

              <button
                type="button"
                onClick={() => void runAutoLayout(false)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-[var(--dd-border-subtle)] text-xs"
              >
                <span className="flex items-center gap-2">
                  <LayoutGrid className="w-3.5 h-3.5 text-violet-400" />
                  <span>ELK 全图分层布局</span>
                </span>
                <span className="text-[10px] font-mono text-[var(--dd-text-muted)]">Ctrl+L</span>
              </button>

              <button
                type="button"
                onClick={() => void runAutoLayout(true)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-[var(--dd-border-subtle)] text-xs"
              >
                <span className="flex items-center gap-2">
                  <Wand2 className="w-3.5 h-3.5 text-sky-400" />
                  <span>增量排版（保留锁定节点）</span>
                </span>
              </button>

              <button
                type="button"
                onClick={clearFreehandStrokes}
                disabled={(active.slot.freehand?.length ?? 0) === 0}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-[var(--dd-border-subtle)] text-xs disabled:opacity-40"
              >
                <span className="flex items-center gap-2">
                  <Eraser className="w-3.5 h-3.5 text-amber-400" />
                  <span>清除手绘草图笔迹</span>
                </span>
                <span className="text-[10px] font-mono text-[var(--dd-text-muted)]">
                  {active.slot.freehand?.length ?? 0}
                </span>
              </button>

              <div className="p-3 rounded-xl bg-white/[0.02] border border-[var(--dd-border-subtle)] text-[11px] text-[var(--dd-text-secondary)] space-y-1.5">
                <div className="font-medium text-[var(--dd-text-primary)]">常用快捷键</div>
                <div className="flex justify-between"><span>全局命令面板</span><span className="font-mono">Ctrl+K</span></div>
                <div className="flex justify-between"><span>新建下游 / 同级节点</span><span className="font-mono">Tab / Enter</span></div>
                <div className="flex justify-between"><span>全选 / 复制 / 粘贴</span><span className="font-mono">Ctrl+A / C / V</span></div>
                <div className="flex justify-between"><span>框选多选实体</span><span className="font-mono">Shift+拖拽</span></div>
                <div className="flex justify-between"><span>仅移动分组边框</span><span className="font-mono">Alt+拖拽分组</span></div>
                <div className="flex justify-between"><span>选择 / 连线 / 落绘</span><span className="font-mono">V / L / P</span></div>
                <div className="flex justify-between"><span>图码双向分屏</span><span className="font-mono">Ctrl+\</span></div>
                <div className="flex justify-between"><span>ELK 自动布局</span><span className="font-mono">Ctrl+L</span></div>
                <div className="flex justify-between"><span>应用设置</span><span className="font-mono">Ctrl+,</span></div>
                <div className="flex justify-between"><span>撤销 / 重做</span><span className="font-mono">Ctrl+Z / Y</span></div>
                <div className="flex justify-between"><span>删除选中元素</span><span className="font-mono">Del</span></div>
                <div className="flex justify-between"><span>链路演播推进</span><span className="font-mono">← / →</span></div>
              </div>
            </div>
          )}

          {leftTab === 'versions' && (
            <div className="flex-1 flex flex-col min-h-0 p-3 space-y-3 overflow-y-auto">
              {/* Active Diff Status Banner */}
              {diffBaseline && (
                <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-400/35 space-y-1.5 shrink-0">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="inline-flex items-center gap-1.5 text-amber-300 font-medium truncate">
                      <GitCompareArrows className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{diffBaseline.label}</span>
                    </span>
                    <button
                      type="button"
                      onClick={clearDiffBaseline}
                      title="退出对比模式"
                      className="p-0.5 rounded hover:bg-white/10 text-amber-200 shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="text-[10px] text-zinc-400 leading-relaxed">
                    绿框 = 新增 · 琥珀 = 变更 · 红色虚线 = 已移除
                  </div>
                </div>
              )}

              {/* Create Named Snapshot */}
              <div className="space-y-1.5 shrink-0">
                <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--dd-text-secondary)]">
                  命名版本快照
                </span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={snapshotName}
                    onChange={(e) => setSnapshotName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        createLayerVersion(snapshotName.trim() || undefined);
                        setSnapshotName('');
                      }
                    }}
                    placeholder="如：v1 单体方案 / v2 拆库"
                    className="flex-1 min-w-0 h-7 px-2 rounded-lg bg-black/20 border border-[var(--dd-border-subtle)] focus:border-violet-400 focus:outline-none text-[11px]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      createLayerVersion(snapshotName.trim() || undefined);
                      setSnapshotName('');
                    }}
                    className="inline-flex items-center gap-1 px-2.5 h-7 rounded-lg bg-violet-600/85 hover:bg-violet-500 text-white text-[11px] font-medium shrink-0 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    <span>保存</span>
                  </button>
                </div>
              </div>

              {/* Saved Snapshots List */}
              <div className="space-y-1.5">
                {(active.layer.versions ?? []).length === 0 ? (
                  <div className="py-5 px-3 rounded-xl border border-dashed border-[var(--dd-border-subtle)] text-center text-[11px] text-[var(--dd-text-muted)]">
                    暂无快照，保存一个基准快照后即可在画布上开启可视化 Diff 对比
                  </div>
                ) : (
                  (active.layer.versions ?? []).map((ver) => {
                    const isDiffing =
                      diffBaseline?.source === 'snapshot' && diffBaseline.sourceId === ver.id;
                    return (
                      <div
                        key={ver.id}
                        className={`p-2.5 rounded-xl border space-y-1.5 transition-colors ${
                          isDiffing
                            ? 'bg-amber-500/10 border-amber-400/45'
                            : 'bg-white/[0.03] border-[var(--dd-border-subtle)]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1.5 text-xs font-medium">
                          <span className="truncate">{ver.name}</span>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                isDiffing ? clearDiffBaseline() : startDiffWithSnapshot(ver.id)
                              }
                              title={isDiffing ? '退出对比' : '与当前画布可视化 Diff 对比'}
                              className={`p-1 rounded transition-colors ${
                                isDiffing
                                  ? 'bg-amber-500/25 text-amber-300'
                                  : 'hover:bg-amber-500/20 text-amber-400'
                              }`}
                            >
                              <GitCompareArrows className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => restoreLayerVersion(ver.id)}
                              title="恢复到此快照"
                              className="p-1 rounded hover:bg-violet-500/20 text-violet-300"
                            >
                              <RotateCcw className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteLayerVersion(ver.id)}
                              title="删除此快照"
                              className="p-1 rounded hover:bg-rose-500/20 text-zinc-500 hover:text-rose-400"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        <div className="text-[10px] font-mono text-[var(--dd-text-muted)]">
                          {ver.nodeCount} 实体 · {ver.edgeCount} 连线 ·{' '}
                          {new Date(ver.createdAt).toLocaleTimeString().slice(0, 5)}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Cross-Layer Scheme Diff */}
              {project.layers.length > 1 && (
                <div className="pt-2 border-t border-[var(--dd-border-subtle)] space-y-1.5">
                  <span className="text-[10.5px] font-mono font-semibold uppercase tracking-wider text-[var(--dd-text-muted)]">
                    跨层方案对比
                  </span>
                  <div className="space-y-1">
                    {project.layers.map((layer, idx) => {
                      if (idx === activeLayerIndex) return null;
                      const isDiffing =
                        diffBaseline?.source === 'layer' && diffBaseline.sourceId === layer.id;
                      return (
                        <button
                          key={layer.id}
                          type="button"
                          onClick={() =>
                            isDiffing ? clearDiffBaseline() : startDiffWithLayer(idx)
                          }
                          className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-[11px] transition-colors ${
                            isDiffing
                              ? 'bg-amber-500/15 border-amber-400/45 text-amber-200'
                              : 'bg-white/[0.02] hover:bg-white/[0.06] border-[var(--dd-border-subtle)] text-[var(--dd-text-secondary)]'
                          }`}
                        >
                          <span className="truncate">{layer.name}</span>
                          <span className="text-[10px] font-mono text-amber-400 shrink-0">
                            {isDiffing ? '对比中' : 'Diff'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Local Git Commit History Diff (Tauri Workspace) */}
              {project.workspacePath && isTauriRuntime() && (
                <div className="pt-2 border-t border-[var(--dd-border-subtle)] space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 text-[10.5px] font-mono font-semibold uppercase tracking-wider text-[var(--dd-text-muted)]">
                      <GitBranch className="w-3 h-3 text-emerald-400" />
                      Git 提交历史对比
                    </span>
                    <button
                      type="button"
                      onClick={() => void refreshGitCommits()}
                      disabled={gitLoading}
                      title="刷新 Git 提交历史"
                      className="p-1 rounded hover:bg-white/[0.08] text-zinc-400 hover:text-emerald-300"
                    >
                      <RefreshCw className={`w-3 h-3 ${gitLoading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  {gitCommits.length === 0 ? (
                    <div className="py-3 px-2.5 rounded-lg bg-white/[0.02] border border-[var(--dd-border-subtle)] text-[10.5px] text-[var(--dd-text-muted)]">
                      {gitLoading ? '正在读取 Git 历史...' : '当前本地工作区目录尚未初始化 Git 提交'}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {gitCommits.map((commit) => {
                        const isDiffing =
                          diffBaseline?.source === 'git' && diffBaseline.sourceId === commit.hash;
                        return (
                          <button
                            key={commit.hash}
                            type="button"
                            onClick={() =>
                              isDiffing
                                ? clearDiffBaseline()
                                : void startDiffWithGitCommit(
                                    commit.hash,
                                    `${commit.short_hash} ${commit.message.slice(0, 18)}`
                                  )
                            }
                            className={`w-full text-left p-2 rounded-lg border transition-colors space-y-0.5 ${
                              isDiffing
                                ? 'bg-amber-500/15 border-amber-400/45'
                                : 'bg-white/[0.02] hover:bg-white/[0.06] border-[var(--dd-border-subtle)]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1.5 text-[11px]">
                              <span className="font-mono text-emerald-300">{commit.short_hash}</span>
                              <span className="text-[9.5px] text-zinc-500 truncate">{commit.date}</span>
                            </div>
                            <div className="text-[11px] text-zinc-200 truncate">{commit.message}</div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </aside>
      )}
    </div>
  );
};
