import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Box,
  ChevronRight,
  Copy,
  CornerDownRight,
  Eraser,
  FileText,
  GitCommitHorizontal,
  LayoutGrid,
  Lightbulb,
  Maximize2,
  Moon,
  Palette,
  Pin,
  Plus,
  Redo2,
  RotateCcw,
  ShieldCheck,
  Spline,
  Sun,
  Tag,
  Trash2,
  Undo2,
  Unlink,
} from 'lucide-react';
import {
  findPrimitiveByKind,
  getPaletteConfigForTemplate,
  type EntityNode,
  type LayerTemplateName,
  type PrimitiveItem,
  type RelationEdge,
  type SubCanvasEngine,
} from '@devdraw/core';
import { ENTITY_ICON_MAP } from '../nodes/DevDrawNode';

export type ContextMenuTarget =
  | { type: 'pane'; clientX: number; clientY: number; worldX: number; worldY: number }
  | { type: 'node'; clientX: number; clientY: number; node: EntityNode }
  | { type: 'edge'; clientX: number; clientY: number; edge: RelationEdge };

export interface CanvasContextMenuProps {
  target: ContextMenuTarget | null;
  theme: 'dark' | 'light';
  layerName: string;
  layerTemplate: LayerTemplateName;
  subCanvasEngine?: SubCanvasEngine;
  recentKinds: string[];
  canUndo: boolean;
  canRedo: boolean;
  hasFreehand: boolean;
  compactMode: boolean;
  showCompactToggle: boolean;
  onClose: () => void;
  // Pane actions
  onInsertEntity: (kind: string, worldX: number, worldY: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onAutoLayout: () => void;
  onFitView: () => void;
  onToggleCompactMode: () => void;
  onToggleTheme: () => void;
  onClearFreehand: () => void;
  // Node actions
  onInspectNode: (nodeId: string) => void;
  onCustomizeNodeStyle: (nodeId: string) => void;
  onCreateChildNode?: (nodeId: string) => void;
  onCreateSiblingNode?: (nodeId: string) => void;
  onStartConnectFromNode: (nodeId: string) => void;
  onDuplicateNode: (nodeId: string) => void;
  onToggleNodePinned: (nodeId: string) => void;
  onDisconnectNode: (nodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  // Edge actions
  onInspectEdge: (edgeId: string) => void;
  onEditEdgeLabel: (edgeId: string) => void;
  onToggleEdgeDashed: (edgeId: string) => void;
  onToggleEdgeRouting: (edgeId: string) => void;
  onReverseEdge: (edgeId: string) => void;
  onResetEdgeWaypoints: (edgeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
}

const MENU_WIDTH = 224;
const SUBMENU_WIDTH = 240;

export const CanvasContextMenu: React.FC<CanvasContextMenuProps> = ({
  target,
  theme,
  layerName,
  layerTemplate,
  subCanvasEngine,
  recentKinds,
  canUndo,
  canRedo,
  hasFreehand,
  compactMode,
  showCompactToggle,
  onClose,
  onInsertEntity,
  onUndo,
  onRedo,
  onAutoLayout,
  onFitView,
  onToggleCompactMode,
  onToggleTheme,
  onClearFreehand,
  onInspectNode,
  onCustomizeNodeStyle,
  onCreateChildNode,
  onCreateSiblingNode,
  onStartConnectFromNode,
  onDuplicateNode,
  onToggleNodePinned,
  onDisconnectNode,
  onDeleteNode,
  onInspectEdge,
  onEditEdgeLabel,
  onToggleEdgeDashed,
  onToggleEdgeRouting,
  onReverseEdge,
  onResetEdgeWaypoints,
  onDeleteEdge,
}) => {
  const [entitySubOpen, setEntitySubOpen] = useState(false);
  const [hoveredGroupIdx, setHoveredGroupIdx] = useState<number | null>(null);

  // Reset submenu state every time the context menu opens, moves, or closes
  useEffect(() => {
    setEntitySubOpen(false);
    setHoveredGroupIdx(null);
  }, [target]);

  const paletteGroups = useMemo(() => {
    const cfg = getPaletteConfigForTemplate(layerTemplate, subCanvasEngine);
    return cfg.groups.map((g) => ({
      name: g.name || '本层实体',
      items: g.items,
    }));
  }, [layerTemplate, subCanvasEngine]);

  const recentItems: PrimitiveItem[] = useMemo(
    () =>
      recentKinds
        .map((k) => findPrimitiveByKind(k))
        .filter((it): it is PrimitiveItem => Boolean(it))
        .slice(0, 5),
    [recentKinds]
  );

  if (!target) return null;

  const isLight = theme === 'light';
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;

  const estimatedHeight = target.type === 'pane' ? 350 : 250;
  const menuLeft = Math.max(8, Math.min(target.clientX, vw - MENU_WIDTH - 8));
  const menuTop = Math.max(8, Math.min(target.clientY, vh - estimatedHeight - 8));

  // Level-2 flyout opens to the right, or flips left if near viewport right edge
  const subLeft =
    menuLeft + MENU_WIDTH + SUBMENU_WIDTH + 12 < vw
      ? menuLeft + MENU_WIDTH + 4
      : Math.max(8, menuLeft - SUBMENU_WIDTH - 4);
  const subTop = Math.max(8, Math.min(menuTop + 26, vh - 360));

  // Level-3 flyout opens beside Level-2
  const groupLeft =
    subLeft + SUBMENU_WIDTH + SUBMENU_WIDTH + 12 < vw
      ? subLeft + SUBMENU_WIDTH + 4
      : Math.max(8, subLeft - SUBMENU_WIDTH - 4);
  const groupTop = Math.max(8, Math.min(subTop + 40, vh - 340));

  const panelClass = isLight
    ? 'bg-white/[0.98] border-slate-200/90 text-slate-800 shadow-[0_20px_50px_rgba(15,23,42,0.18)]'
    : 'bg-[#1b1625]/[0.97] border-white/15 text-zinc-200 shadow-[0_20px_50px_rgba(0,0,0,0.88)]';

  const rowClass = isLight
    ? 'w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 text-left transition-colors'
    : 'w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.08] text-left transition-colors';

  const dividerClass = isLight ? 'my-1 border-t border-slate-200/80' : 'my-1 border-t border-white/[0.08]';

  const handleInsert = (kind: string) => {
    if (target.type !== 'pane') return;
    onInsertEntity(kind, target.worldX, target.worldY);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {/* Level 1: Primary Context Menu */}
      <div
        style={{ left: menuLeft, top: menuTop, width: MENU_WIDTH }}
        className={`fixed rounded-xl border backdrop-blur-xl py-1.5 px-1.5 text-xs select-none ${panelClass}`}
      >
        {target.type === 'pane' && (
          <div className="space-y-0.5">
            <div className="px-2.5 py-1 flex items-center justify-between gap-2 text-[10px] font-mono text-zinc-500">
              <span className="uppercase truncate">画布 · {layerName}</span>
              <span className="shrink-0">
                {target.worldX},{target.worldY}
              </span>
            </div>

            <button
              type="button"
              onMouseEnter={() => setEntitySubOpen(true)}
              onClick={() => setEntitySubOpen((v) => !v)}
              className={rowClass}
            >
              <span className="flex items-center gap-2">
                <Box className="w-3.5 h-3.5 text-sky-400" />
                <span>在此处添加实体</span>
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
            </button>

            <button
              type="button"
              onMouseEnter={() => {
                setEntitySubOpen(false);
                setHoveredGroupIdx(null);
              }}
              onClick={() => handleInsert('assumption')}
              className={rowClass}
            >
              <span className="flex items-center gap-2">
                <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                <span>添加推演假设</span>
              </span>
              <span className="text-[10px] font-mono text-zinc-500">A</span>
            </button>

            <button
              type="button"
              onMouseEnter={() => {
                setEntitySubOpen(false);
                setHoveredGroupIdx(null);
              }}
              onClick={() => handleInsert('decision')}
              className={rowClass}
            >
              <span className="flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>添加决策记录 (ADR)</span>
              </span>
              <span className="text-[10px] font-mono text-zinc-500">D</span>
            </button>

            <button
              type="button"
              onMouseEnter={() => {
                setEntitySubOpen(false);
                setHoveredGroupIdx(null);
              }}
              onClick={() => handleInsert('note')}
              className={rowClass}
            >
              <span className="flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-zinc-400" />
                <span>添加架构笔记</span>
              </span>
              <span className="text-[10px] font-mono text-zinc-500">T</span>
            </button>

            <div className={dividerClass} />

            <button
              type="button"
              disabled={!canUndo}
              onMouseEnter={() => {
                setEntitySubOpen(false);
                setHoveredGroupIdx(null);
              }}
              onClick={() => {
                onUndo();
                onClose();
              }}
              className={`${rowClass} disabled:opacity-35 disabled:pointer-events-none`}
            >
              <span className="flex items-center gap-2">
                <Undo2 className="w-3.5 h-3.5 text-zinc-400" />
                <span>撤销上一步</span>
              </span>
              <span className="text-[10px] font-mono text-zinc-500">Ctrl+Z</span>
            </button>

            <button
              type="button"
              disabled={!canRedo}
              onMouseEnter={() => {
                setEntitySubOpen(false);
                setHoveredGroupIdx(null);
              }}
              onClick={() => {
                onRedo();
                onClose();
              }}
              className={`${rowClass} disabled:opacity-35 disabled:pointer-events-none`}
            >
              <span className="flex items-center gap-2">
                <Redo2 className="w-3.5 h-3.5 text-zinc-400" />
                <span>重做操作</span>
              </span>
              <span className="text-[10px] font-mono text-zinc-500">Ctrl+Y</span>
            </button>

            <div className={dividerClass} />

            <button
              type="button"
              onMouseEnter={() => {
                setEntitySubOpen(false);
                setHoveredGroupIdx(null);
              }}
              onClick={() => {
                onAutoLayout();
                onClose();
              }}
              className={rowClass}
            >
              <span className="flex items-center gap-2">
                <LayoutGrid className="w-3.5 h-3.5 text-violet-400" />
                <span>ELK 一键自动布局</span>
              </span>
              <span className="text-[10px] font-mono text-zinc-500">Ctrl+L</span>
            </button>

            <button
              type="button"
              onMouseEnter={() => {
                setEntitySubOpen(false);
                setHoveredGroupIdx(null);
              }}
              onClick={() => {
                onFitView();
                onClose();
              }}
              className={rowClass}
            >
              <span className="flex items-center gap-2">
                <Maximize2 className="w-3.5 h-3.5 text-sky-400" />
                <span>适配全图到视口</span>
              </span>
            </button>

            {showCompactToggle && (
              <button
                type="button"
                onMouseEnter={() => {
                  setEntitySubOpen(false);
                  setHoveredGroupIdx(null);
                }}
                onClick={() => {
                  onToggleCompactMode();
                  onClose();
                }}
                className={rowClass}
              >
                <span className="flex items-center gap-2">
                  <LayoutGrid className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{compactMode ? '切换为完整卡片模式' : '切换为精简卡片模式'}</span>
                </span>
              </button>
            )}

            <button
              type="button"
              onMouseEnter={() => {
                setEntitySubOpen(false);
                setHoveredGroupIdx(null);
              }}
              onClick={() => {
                onToggleTheme();
                onClose();
              }}
              className={rowClass}
            >
              <span className="flex items-center gap-2">
                {isLight ? (
                  <Moon className="w-3.5 h-3.5 text-indigo-500" />
                ) : (
                  <Sun className="w-3.5 h-3.5 text-amber-300" />
                )}
                <span>{isLight ? '切换到暗夜画布' : '切换到晴昼画布'}</span>
              </span>
            </button>

            <button
              type="button"
              disabled={!hasFreehand}
              onMouseEnter={() => {
                setEntitySubOpen(false);
                setHoveredGroupIdx(null);
              }}
              onClick={() => {
                onClearFreehand();
                onClose();
              }}
              className={`${rowClass} disabled:opacity-35 disabled:pointer-events-none`}
            >
              <span className="flex items-center gap-2">
                <Eraser className="w-3.5 h-3.5 text-zinc-400" />
                <span>清除手绘草图笔迹</span>
              </span>
            </button>
          </div>
        )}

        {target.type === 'node' && (
          <div className="space-y-0.5">
            <div className="px-2.5 py-1 text-[10px] font-mono text-zinc-500 uppercase truncate">
              实体 · {target.node.title}
            </div>

            <button
              type="button"
              onClick={() => {
                onInspectNode(target.node.id);
                onClose();
              }}
              className={rowClass}
            >
              <span className="flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-violet-300" />
                <span>打开实体详情抽屉</span>
              </span>
              <span className="text-[10px] font-mono text-zinc-500">双击</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onCustomizeNodeStyle(target.node.id);
                onClose();
              }}
              className={rowClass}
            >
              <span className="flex items-center gap-2">
                <Palette className="w-3.5 h-3.5 text-fuchsia-400" />
                <span>自定义实体样式...</span>
              </span>
            </button>

            {onCreateChildNode && (
              <button
                type="button"
                onClick={() => {
                  onCreateChildNode(target.node.id);
                  onClose();
                }}
                className={rowClass}
              >
                <span className="flex items-center gap-2">
                  <CornerDownRight className="w-3.5 h-3.5 text-emerald-400" />
                  <span>新建下游子节点</span>
                </span>
                <span className="text-[10px] font-mono text-zinc-500">Tab</span>
              </button>
            )}

            {onCreateSiblingNode && (
              <button
                type="button"
                onClick={() => {
                  onCreateSiblingNode(target.node.id);
                  onClose();
                }}
                className={rowClass}
              >
                <span className="flex items-center gap-2">
                  <Plus className="w-3.5 h-3.5 text-sky-400" />
                  <span>新建同级节点</span>
                </span>
                <span className="text-[10px] font-mono text-zinc-500">Enter</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                onStartConnectFromNode(target.node.id);
                onClose();
              }}
              className={rowClass}
            >
              <span className="flex items-center gap-2">
                <GitCommitHorizontal className="w-3.5 h-3.5 text-violet-400" />
                <span>从此处发起连线</span>
              </span>
              <span className="text-[10px] font-mono text-zinc-500">L</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onDuplicateNode(target.node.id);
                onClose();
              }}
              className={rowClass}
            >
              <span className="flex items-center gap-2">
                <Copy className="w-3.5 h-3.5 text-sky-400" />
                <span>复制实体副本</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                onToggleNodePinned(target.node.id);
                onClose();
              }}
              className={rowClass}
            >
              <span className="flex items-center gap-2">
                <Pin className="w-3.5 h-3.5 text-violet-400" />
                <span>{target.node.pinned ? '解除坐标锁定' : '锁定坐标 (Pinned)'}</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                onDisconnectNode(target.node.id);
                onClose();
              }}
              className={rowClass}
            >
              <span className="flex items-center gap-2">
                <Unlink className="w-3.5 h-3.5 text-amber-400" />
                <span>断开所有关联连线</span>
              </span>
            </button>

            <div className={dividerClass} />

            <button
              type="button"
              onClick={() => {
                onDeleteNode(target.node.id);
                onClose();
              }}
              className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg hover:bg-rose-500/15 text-rose-400 text-left transition-colors"
            >
              <span className="flex items-center gap-2">
                <Trash2 className="w-3.5 h-3.5" />
                <span>删除此实体</span>
              </span>
              <span className="text-[10px] font-mono opacity-75">Del</span>
            </button>
          </div>
        )}

        {target.type === 'edge' && (
          <div className="space-y-0.5">
            <div className="px-2.5 py-1 text-[10px] font-mono text-zinc-500 uppercase truncate">
              连线 · {target.edge.label || '未命名关系'}
            </div>

            <button
              type="button"
              onClick={() => {
                onInspectEdge(target.edge.id);
                onClose();
              }}
              className={rowClass}
            >
              <span className="flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-sky-300" />
                <span>打开连线详情抽屉</span>
              </span>
              <span className="text-[10px] font-mono text-zinc-500">双击</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onEditEdgeLabel(target.edge.id);
                onClose();
              }}
              className={rowClass}
            >
              <span className="flex items-center gap-2">
                <Tag className="w-3.5 h-3.5 text-sky-400" />
                <span>就地编辑关系标签</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                onToggleEdgeDashed(target.edge.id);
                onClose();
              }}
              className={rowClass}
            >
              <span className="flex items-center gap-2">
                <GitCommitHorizontal className="w-3.5 h-3.5 text-amber-400" />
                <span>{target.edge.dashed ? '切换为实线同步' : '切换为虚线异步'}</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                onToggleEdgeRouting(target.edge.id);
                onClose();
              }}
              className={rowClass}
            >
              <span className="flex items-center gap-2">
                <Spline className="w-3.5 h-3.5 text-violet-400" />
                <span>
                  {target.edge.routing === 'orthogonal' ? '切换为贝塞尔曲线' : '切换为正交折线'}
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                onReverseEdge(target.edge.id);
                onClose();
              }}
              className={rowClass}
            >
              <span className="flex items-center gap-2">
                <ArrowLeftRight className="w-3.5 h-3.5 text-zinc-400" />
                <span>反转连线方向</span>
              </span>
            </button>

            {target.edge.waypoints && target.edge.waypoints.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  onResetEdgeWaypoints(target.edge.id);
                  onClose();
                }}
                className={rowClass}
              >
                <span className="flex items-center gap-2">
                  <RotateCcw className="w-3.5 h-3.5 text-zinc-400" />
                  <span>重置折线拐点</span>
                </span>
              </button>
            )}

            <div className={dividerClass} />

            <button
              type="button"
              onClick={() => {
                onDeleteEdge(target.edge.id);
                onClose();
              }}
              className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg hover:bg-rose-500/15 text-rose-400 text-left transition-colors"
            >
              <span className="flex items-center gap-2">
                <Trash2 className="w-3.5 h-3.5" />
                <span>删除此连线</span>
              </span>
              <span className="text-[10px] font-mono opacity-75">Del</span>
            </button>
          </div>
        )}
      </div>

      {/* Level 2: Entity Picker Flyout (Recent + Current Layer / Multi-group index) */}
      {target.type === 'pane' && entitySubOpen && (
        <div
          style={{ left: subLeft, top: subTop, width: SUBMENU_WIDTH }}
          className={`fixed rounded-xl border backdrop-blur-xl p-1.5 max-h-[360px] overflow-y-auto text-xs select-none ${panelClass}`}
        >
          <div className="px-2 pt-0.5 pb-1 flex items-center justify-between text-[9.5px] font-mono text-violet-400 uppercase">
            <span>最近使用 · 本项目</span>
            <span className="text-zinc-500">{recentItems.length}/5</span>
          </div>

          {recentItems.length > 0 ? (
            recentItems.map((it) => {
              const Icon = ENTITY_ICON_MAP[it.icon] || Box;
              return (
                <button
                  key={`recent-${it.kind}`}
                  type="button"
                  onMouseEnter={() => setHoveredGroupIdx(null)}
                  onClick={() => handleInsert(it.kind)}
                  className={rowClass}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${it.colorClass}`} />
                    <span className="truncate">{it.label}</span>
                  </span>
                  <span className="text-[9.5px] font-mono text-zinc-500 shrink-0">{it.badge}</span>
                </button>
              );
            })
          ) : (
            <div className="px-2 pb-1.5 text-[10.5px] text-zinc-500">
              从下方选择实体后自动记录常用原语
            </div>
          )}

          <div className={dividerClass} />

          {paletteGroups.length > 1 ? (
            <>
              <div className="px-2 pb-1 text-[9.5px] font-mono text-zinc-500 uppercase flex items-center justify-between">
                <span>实体类型 · {paletteGroups.length}</span>
                <span>→ 悬停展开</span>
              </div>
              {paletteGroups.map((g, gi) => (
                <button
                  key={g.name}
                  type="button"
                  onMouseEnter={() => setHoveredGroupIdx(gi)}
                  onClick={() => setHoveredGroupIdx(gi)}
                  className={`${rowClass} ${hoveredGroupIdx === gi ? 'bg-violet-500/15 text-violet-300' : ''}`}
                >
                  <span className="truncate">{g.name}</span>
                  <span className="flex items-center gap-1 text-[9.5px] font-mono text-zinc-500 shrink-0">
                    <span>{g.items.length}</span>
                    <ChevronRight className="w-3 h-3" />
                  </span>
                </button>
              ))}
            </>
          ) : (
            <>
              <div className="px-2 pb-1 text-[9.5px] font-mono text-zinc-500 uppercase">
                {paletteGroups[0]?.name} · {paletteGroups[0]?.items.length ?? 0}
              </div>
              {(paletteGroups[0]?.items ?? []).map((it) => {
                const Icon = ENTITY_ICON_MAP[it.icon] || Box;
                return (
                  <button
                    key={it.kind}
                    type="button"
                    onClick={() => handleInsert(it.kind)}
                    className={rowClass}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Icon className={`w-3.5 h-3.5 shrink-0 ${it.colorClass}`} />
                      <span className="truncate">{it.label}</span>
                    </span>
                    <span className="text-[9.5px] font-mono text-zinc-500 shrink-0">{it.badge}</span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* Level 3: Specific Group Entities Flyout (for multi-group layers like 空白项目) */}
      {target.type === 'pane' &&
        entitySubOpen &&
        hoveredGroupIdx !== null &&
        paletteGroups[hoveredGroupIdx] && (
          <div
            style={{ left: groupLeft, top: groupTop, width: SUBMENU_WIDTH }}
            className={`fixed rounded-xl border backdrop-blur-xl p-1.5 max-h-[340px] overflow-y-auto text-xs select-none ${panelClass}`}
          >
            <div className="px-2 pb-1 flex items-center justify-between text-[9.5px] font-mono text-violet-400 uppercase">
              <span className="truncate">{paletteGroups[hoveredGroupIdx].name}</span>
              <span className="text-zinc-500">{paletteGroups[hoveredGroupIdx].items.length}</span>
            </div>
            {paletteGroups[hoveredGroupIdx].items.map((it) => {
              const Icon = ENTITY_ICON_MAP[it.icon] || Box;
              return (
                <button
                  key={it.kind}
                  type="button"
                  onClick={() => handleInsert(it.kind)}
                  className={rowClass}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${it.colorClass}`} />
                    <span className="truncate">{it.label}</span>
                  </span>
                  <span className="text-[9.5px] font-mono text-zinc-500 shrink-0">{it.badge}</span>
                </button>
              );
            })}
          </div>
        )}
    </div>
  );
};
