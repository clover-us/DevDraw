import React, { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  Box,
  Code2,
  CornerDownLeft,
  Download,
  Group,
  Layers,
  LayoutGrid,
  Link2,
  Moon,
  Plus,
  Route,
  Search,
  Share,
  Sun,
  Wand2,
} from 'lucide-react';
import { ALL_PRIMITIVES, findPrimitiveByKind } from '@devdraw/core';
import { ENTITY_ICON_MAP } from '@devdraw/canvas';
import { getActiveSlotFromProject, useWorkbenchStore } from '../store/useWorkbenchStore';

interface CommandItem {
  id: string;
  category: '当前画布实体' | '跨层实体跳转' | '推演层切换' | '快捷操作' | '插入原语';
  title: string;
  subtitle?: string;
  shortcut?: string;
  icon: React.ComponentType<{ className?: string }>;
  keywords: string;
  run: () => void;
}

export const CommandPalette: React.FC = () => {
  const {
    projects,
    activeProjectId,
    activeLayerIndex,
    theme,
    commandPaletteOpen,
    setCommandPaletteOpen,
    focusNode,
    selectLayer,
    selectSubCanvas,
    addNodeFromPrimitive,
    runAutoLayout,
    toggleDslSplit,
    openFlowEditor,
    setCrossRefModalOpen,
    setImportModalOpen,
    setExportModalOpen,
    copyAiPromptContext,
    toggleTheme,
  } = useWorkbenchStore();

  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);

  const project = projects.find((p) => p.id === activeProjectId);
  const active = getActiveSlotFromProject(project, activeLayerIndex);

  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('');
      setActiveIdx(0);
    }
  }, [commandPaletteOpen]);

  const items = useMemo<CommandItem[]>(() => {
    if (!project || !active) return [];
    const list: CommandItem[] = [];

    // 1. Current canvas entities (jump & center viewport)
    for (const n of active.slot.nodes) {
      const prim = findPrimitiveByKind(n.kind);
      const Icon = ENTITY_ICON_MAP[n.icon || prim?.icon || ''] || Box;
      list.push({
        id: `cur-node-${n.id}`,
        category: '当前画布实体',
        title: n.title,
        subtitle: `${n.tag}${n.tech ? ` · ${n.tech}` : ''}`,
        icon: Icon,
        keywords: `${n.title} ${n.tag} ${n.tech ?? ''} ${n.dslId ?? ''} ${n.note}`,
        run: () => focusNode(n.id),
      });
    }

    // 2. Quick workbench actions
    list.push(
      {
        id: 'act-layout-full',
        category: '快捷操作',
        title: 'ELK 全图自动布局',
        subtitle: '按拓扑分层正交重排当前画布',
        shortcut: 'Ctrl+L',
        icon: LayoutGrid,
        keywords: 'elk layout auto 布局 排版 自动',
        run: () => void runAutoLayout(false),
      },
      {
        id: 'act-layout-inc',
        category: '快捷操作',
        title: 'ELK 增量排版（保留锁定节点）',
        subtitle: '仅重排未锁定实体',
        icon: Wand2,
        keywords: 'elk incremental pinned 增量 布局',
        run: () => void runAutoLayout(true),
      },
      {
        id: 'act-add-group',
        category: '快捷操作',
        title: '插入分组容器 / 边界框 (VPC / 限界上下文)',
        subtitle: '可拖拽缩放的半透明架构分组框',
        icon: Group,
        keywords: 'group vpc boundary 分组 容器 边界',
        run: () => addNodeFromPrimitive('group', 160, 120),
      },
      {
        id: 'act-dsl',
        category: '快捷操作',
        title: '切换 .arch DSL 源码分屏',
        shortcut: 'Ctrl+\\',
        icon: Code2,
        keywords: 'dsl arch code 源码 分屏 编辑器',
        run: () => toggleDslSplit(),
      },
      {
        id: 'act-flow',
        category: '快捷操作',
        title: '打开动态链路编排面板',
        subtitle: '可视化新建、点选连线与编排 Flow 步骤',
        icon: Route,
        keywords: 'flow step playback 链路 演播 编排',
        run: () => openFlowEditor(),
      },
      {
        id: 'act-cross-ref',
        category: '快捷操作',
        title: '引入跨层只读引用锚点',
        subtitle: '从其他推演层或子画布引入引用节点',
        icon: Link2,
        keywords: 'ref cross layer 跨层 引用 下钻',
        run: () => setCrossRefModalOpen(true),
      },
      {
        id: 'act-ai-prompt',
        category: '快捷操作',
        title: '复制 AI 推演上下文 (.arch 语法 + 当前源码)',
        subtitle: '发给 ChatGPT / Claude / Gemini 评审或扩展架构',
        icon: Bot,
        keywords: 'ai llm prompt context chatgpt claude gemini 复制 上下文',
        run: () => void copyAiPromptContext(),
      },
      {
        id: 'act-import',
        category: '快捷操作',
        title: '导入 SQL DDL / Mermaid / DevDraw JSON',
        icon: Download,
        keywords: 'import sql ddl mermaid json 导入 建表',
        run: () => setImportModalOpen(true),
      },
      {
        id: 'act-export',
        category: '快捷操作',
        title: '导出 SVG / PNG / Markdown ADR / Mermaid',
        icon: Share,
        keywords: 'export svg png markdown adr mermaid html 导出',
        run: () => setExportModalOpen(true),
      },
      {
        id: 'act-theme',
        category: '快捷操作',
        title: theme === 'dark' ? '切换至晴昼白板画布' : '切换至暗夜紫墨画布',
        icon: theme === 'dark' ? Sun : Moon,
        keywords: 'theme dark light 主题 暗夜 晴昼',
        run: () => toggleTheme(),
      }
    );

    // 3. Switch layers
    project.layers.forEach((layer, idx) => {
      if (idx === activeLayerIndex) return;
      list.push({
        id: `layer-${layer.id}`,
        category: '推演层切换',
        title: `切换到「${layer.name}」`,
        subtitle: layer.template,
        icon: Layers,
        keywords: `layer 推演层 ${layer.name} ${layer.template}`,
        run: () => selectLayer(idx),
      });
    });

    // 4. Cross-layer entities
    project.layers.forEach((layer, layerIdx) => {
      const slots = layer.children && layer.children.length > 0 ? layer.children : [layer];
      slots.forEach((slot, subIdx) => {
        if (layerIdx === activeLayerIndex && slot.id === active.slot.id) return;
        for (const n of slot.nodes) {
          const prim = findPrimitiveByKind(n.kind);
          const Icon = ENTITY_ICON_MAP[n.icon || prim?.icon || ''] || Box;
          const loc = layer.children?.length ? `${layer.name} / ${slot.name}` : layer.name;
          list.push({
            id: `other-node-${layer.id}-${slot.id}-${n.id}`,
            category: '跨层实体跳转',
            title: n.title,
            subtitle: `${loc} · ${n.tag}`,
            icon: Icon,
            keywords: `${n.title} ${n.tag} ${loc} ${n.dslId ?? ''}`,
            run: () => {
              selectLayer(layerIdx);
              if (layer.children && layer.children.length > 0) {
                selectSubCanvas(subIdx);
              }
              setTimeout(() => focusNode(n.id), 40);
            },
          });
        }
      });
    });

    // 5. Insert any primitive
    for (const prim of ALL_PRIMITIVES) {
      const Icon = ENTITY_ICON_MAP[prim.icon] || Plus;
      list.push({
        id: `prim-${prim.kind}`,
        category: '插入原语',
        title: `插入 ${prim.label}`,
        subtitle: `${prim.badge} · ${prim.kind}`,
        icon: Icon,
        keywords: `add insert 插入 ${prim.label} ${prim.badge} ${prim.kind}`,
        run: () =>
          addNodeFromPrimitive(
            prim.kind,
            200 + Math.round(Math.random() * 140),
            140 + Math.round(Math.random() * 120)
          ),
      });
    }

    return list;
  }, [
    project,
    active,
    activeLayerIndex,
    theme,
    focusNode,
    selectLayer,
    selectSubCanvas,
    addNodeFromPrimitive,
    runAutoLayout,
    toggleDslSplit,
    openFlowEditor,
    setCrossRefModalOpen,
    setImportModalOpen,
    setExportModalOpen,
    copyAiPromptContext,
    toggleTheme,
  ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 18);
    return items.filter((it) => it.keywords.toLowerCase().includes(q)).slice(0, 24);
  }, [items, query]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  if (!commandPaletteOpen || !project || !active) return null;

  const runSelected = (item: CommandItem | undefined) => {
    if (!item) return;
    setCommandPaletteOpen(false);
    item.run();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4 bg-black/65 backdrop-blur-sm"
      onClick={() => setCommandPaletteOpen(false)}
    >
      <div
        className="w-full max-w-xl rounded-2xl bg-[#1b1625] border border-white/15 shadow-2xl overflow-hidden flex flex-col text-zinc-100"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            setCommandPaletteOpen(false);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIdx((prev) => (filtered.length > 0 ? (prev + 1) % filtered.length : 0));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIdx((prev) =>
              filtered.length > 0 ? (prev - 1 + filtered.length) % filtered.length : 0
            );
          } else if (e.key === 'Enter') {
            e.preventDefault();
            runSelected(filtered[activeIdx]);
          }
        }}
      >
        <div className="px-4 h-12 border-b border-white/[0.08] flex items-center gap-2.5">
          <Search className="w-4 h-4 text-violet-400 shrink-0" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索定位实体、切换推演层、执行命令或插入原语..."
            className="flex-1 bg-transparent text-sm text-white placeholder-zinc-500 outline-none"
          />
          <kbd className="px-1.5 py-0.5 rounded bg-white/[0.07] text-[10px] font-mono text-zinc-400">
            ESC
          </kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-2 space-y-0.5">
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-xs text-zinc-500">没有匹配的实体或命令</div>
          ) : (
            filtered.map((item, idx) => {
              const Icon = item.icon;
              const isHighlighted = idx === activeIdx;
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setActiveIdx(idx)}
                  onClick={() => runSelected(item)}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-left transition-colors ${
                    isHighlighted ? 'bg-violet-600/25 text-white' : 'text-zinc-300 hover:bg-white/[0.05]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        isHighlighted
                          ? 'bg-violet-500/30 text-violet-200'
                          : 'bg-white/[0.05] text-zinc-400'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">{item.title}</div>
                      {item.subtitle && (
                        <div className="text-[10.5px] font-mono text-zinc-400 truncate">
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.05] text-zinc-400">
                      {item.category}
                    </span>
                    {item.shortcut ? (
                      <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.08] text-zinc-300">
                        {item.shortcut}
                      </kbd>
                    ) : isHighlighted ? (
                      <CornerDownLeft className="w-3 h-3 text-violet-300" />
                    ) : null}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="px-4 py-2 border-t border-white/[0.06] bg-[#14101d] flex items-center justify-between text-[10.5px] font-mono text-zinc-500">
          <span>↑↓ 选择 · Enter 执行 · Shift+拖拽画布可框选多选</span>
          <span>Ctrl+K</span>
        </div>
      </div>
    </div>
  );
};
