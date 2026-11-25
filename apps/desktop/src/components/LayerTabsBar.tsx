import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  Layers,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { LAYER_TEMPLATES, type LayerTemplateName } from '@devdraw/core';
import { useWorkbenchStore } from '../store/useWorkbenchStore';

export const LayerTabsBar: React.FC = () => {
  const {
    projects,
    activeProjectId,
    activeLayerIndex,
    selectLayer,
    addLayer,
    renameLayer,
    duplicateLayer,
    deleteLayer,
    reorderLayers,
    setCrossRefModalOpen,
  } = useWorkbenchStore();

  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [menuLayerIdx, setMenuLayerIdx] = useState<number | null>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [renamingIdx, setRenamingIdx] = useState<number | null>(null);
  const [draftName, setDraftName] = useState('');
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onGlobalClick = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setAddMenuOpen(false);
        setMenuLayerIdx(null);
        setMenuPos(null);
      }
    };
    window.addEventListener('mousedown', onGlobalClick);
    return () => window.removeEventListener('mousedown', onGlobalClick);
  }, []);

  const project = projects.find((p) => p.id === activeProjectId);
  if (!project) return null;

  const totalSlots = project.layers.reduce(
    (sum, l) => sum + (l.children && l.children.length > 0 ? l.children.length : 1),
    0
  );

  const handlePick = (tpl: LayerTemplateName) => {
    addLayer(tpl);
    setAddMenuOpen(false);
  };

  const startRename = (idx: number) => {
    const target = project.layers[idx];
    if (!target) return;
    setRenamingIdx(idx);
    setDraftName(target.name);
    setMenuLayerIdx(null);
    setMenuPos(null);
  };

  const commitRename = () => {
    if (renamingIdx !== null && draftName.trim()) {
      renameLayer(renamingIdx, draftName.trim());
    }
    setRenamingIdx(null);
  };

  const openTabMenu = (e: React.MouseEvent, idx: number) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setAddMenuOpen(false);
    setMenuLayerIdx(idx);
    setMenuPos({ x: rect.left, y: rect.bottom + 4 });
  };

  return (
    <div
      ref={barRef}
      className="relative h-9 px-3 sm:px-4 flex items-center gap-2 border-b bg-[var(--dd-bg-panel)] border-[var(--dd-border-subtle)] z-20 shrink-0 select-none"
    >
      <span className="hidden sm:flex items-center gap-1 pr-1 text-[10px] font-mono uppercase tracking-wider text-[var(--dd-text-muted)] shrink-0">
        <Layers className="w-3 h-3" />
        推演层
      </span>

      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
        {project.layers.map((layer, idx) => {
          const active = idx === activeLayerIndex;
          const isRenaming = renamingIdx === idx;
          const isDropTarget = dragOverIdx === idx && dragFromIdx !== null && dragFromIdx !== idx;

          return (
            <div
              key={layer.id}
              draggable={!isRenaming}
              onDragStart={(e) => {
                setDragFromIdx(idx);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(idx));
              }}
              onDragOver={(e) => {
                if (dragFromIdx === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setDragOverIdx(idx);
              }}
              onDragLeave={() => {
                if (dragOverIdx === idx) setDragOverIdx(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFromIdx !== null && dragFromIdx !== idx) {
                  reorderLayers(dragFromIdx, idx);
                }
                setDragFromIdx(null);
                setDragOverIdx(null);
              }}
              onDragEnd={() => {
                setDragFromIdx(null);
                setDragOverIdx(null);
              }}
              onContextMenu={(e) => openTabMenu(e, idx)}
              className={`group relative flex items-center gap-1 rounded-lg transition-all shrink-0 ${
                isDropTarget ? 'ring-2 ring-violet-400/80' : ''
              } ${
                active
                  ? 'bg-violet-500/20 text-violet-300 font-medium border border-violet-400/35'
                  : 'text-[var(--dd-text-secondary)] hover:bg-white/[0.06] border border-transparent'
              }`}
            >
              {isRenaming ? (
                <input
                  autoFocus
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setRenamingIdx(null);
                  }}
                  className="px-2 py-0.5 text-[11.5px] bg-black/30 rounded-md outline-none border border-violet-400/70 text-[var(--dd-text-primary)] w-28"
                />
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => selectLayer(idx)}
                    onDoubleClick={() => startRename(idx)}
                    title="单击切换 · 双击重命名 · 拖拽调序 · 右键更多操作"
                    className="pl-2.5 pr-1 py-1 text-[11.5px] whitespace-nowrap"
                  >
                    {layer.name}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => openTabMenu(e, idx)}
                    title="推演层管理菜单"
                    className={`pr-1.5 py-1 rounded-r-lg transition-opacity ${
                      active ? 'opacity-70 hover:opacity-100' : 'opacity-0 group-hover:opacity-75 hover:!opacity-100'
                    }`}
                  >
                    <MoreHorizontal className="w-3 h-3" />
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => {
            setMenuLayerIdx(null);
            setAddMenuOpen((v) => !v);
          }}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-[var(--dd-text-secondary)] hover:text-violet-400 hover:bg-white/[0.05] whitespace-nowrap transition-colors"
        >
          <Plus className="w-3 h-3" />
          <span>添加层</span>
        </button>

        {addMenuOpen && (
          <div className="absolute left-0 top-full mt-1.5 w-52 rounded-xl bg-[var(--dd-bg-elevated)] border border-[var(--dd-border-strong)] shadow-2xl p-1 z-50 text-xs">
            {LAYER_TEMPLATES.map((tpl) => (
              <button
                key={tpl.name}
                type="button"
                onClick={() => handlePick(tpl.name)}
                className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-violet-500/15 transition-colors flex items-center justify-between"
              >
                <span>{tpl.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1" />

      {totalSlots > 1 && (
        <button
          type="button"
          onClick={() => setCrossRefModalOpen(true)}
          title="从其他推演层或子画布引入只读引用锚点（支持连线与双击下钻）"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-violet-500/15 border border-[var(--dd-border-subtle)] hover:border-violet-400/40 text-[11px] text-[var(--dd-text-secondary)] hover:text-violet-300 whitespace-nowrap shrink-0 transition-colors"
        >
          <Link2 className="w-3 h-3 text-violet-400 shrink-0" />
          <span>引入跨层引用</span>
        </button>
      )}

      <span className="text-[11px] font-mono text-[var(--dd-text-muted)] hidden lg:inline shrink-0 whitespace-nowrap">
        共 {project.layers.length} 层
      </span>

      {/* Floating Tab Context Menu */}
      {menuLayerIdx !== null && menuPos && (
        <div
          style={{ left: Math.max(8, Math.min(menuPos.x, window.innerWidth - 180)), top: menuPos.y }}
          className="fixed w-44 rounded-xl bg-[var(--dd-bg-elevated)] border border-[var(--dd-border-strong)] shadow-2xl p-1 z-50 text-xs"
        >
          <button
            type="button"
            onClick={() => startRename(menuLayerIdx)}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.08] text-left"
          >
            <Pencil className="w-3.5 h-3.5 text-violet-400" />
            <span>重命名推演层</span>
          </button>
          <button
            type="button"
            onClick={() => {
              duplicateLayer(menuLayerIdx);
              setMenuLayerIdx(null);
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.08] text-left"
          >
            <Copy className="w-3.5 h-3.5 text-sky-400" />
            <span>复制推演层</span>
          </button>
          <div className="my-1 border-t border-[var(--dd-border-subtle)]" />
          <button
            type="button"
            disabled={menuLayerIdx <= 0}
            onClick={() => {
              reorderLayers(menuLayerIdx, menuLayerIdx - 1);
              setMenuLayerIdx(null);
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.08] disabled:opacity-35 text-left"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[var(--dd-text-secondary)]" />
            <span>向左移动</span>
          </button>
          <button
            type="button"
            disabled={menuLayerIdx >= project.layers.length - 1}
            onClick={() => {
              reorderLayers(menuLayerIdx, menuLayerIdx + 1);
              setMenuLayerIdx(null);
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.08] disabled:opacity-35 text-left"
          >
            <ArrowRight className="w-3.5 h-3.5 text-[var(--dd-text-secondary)]" />
            <span>向右移动</span>
          </button>
          <div className="my-1 border-t border-[var(--dd-border-subtle)]" />
          <button
            type="button"
            disabled={project.layers.length <= 1}
            onClick={() => {
              deleteLayer(menuLayerIdx);
              setMenuLayerIdx(null);
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-rose-500/15 disabled:opacity-35 text-rose-400 text-left"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>删除推演层</span>
          </button>
        </div>
      )}
    </div>
  );
};
