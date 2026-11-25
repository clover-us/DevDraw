import React, { useMemo, useState } from 'react';
import { Box, Check, Link2, Search, X } from 'lucide-react';
import {
  findPrimitiveByKind,
  getAnnotationKind,
  type CrossLayerRef,
  type EntityNode,
} from '@devdraw/core';
import { ENTITY_ICON_MAP } from '@devdraw/canvas';
import { getActiveSlotFromProject, useWorkbenchStore } from '../store/useWorkbenchStore';

interface CandidateGroup {
  groupKey: string;
  label: string;
  layerId: string;
  subCanvasId?: string;
  nodes: EntityNode[];
}

export const CrossLayerRefModal: React.FC = () => {
  const {
    projects,
    activeProjectId,
    activeLayerIndex,
    crossRefModalOpen,
    setCrossRefModalOpen,
    addCrossLayerRefNode,
  } = useWorkbenchStore();

  const [query, setQuery] = useState('');
  const [selectedGroupKey, setSelectedGroupKey] = useState<string>('all');

  const project = projects.find((p) => p.id === activeProjectId);
  const active = getActiveSlotFromProject(project, activeLayerIndex);

  const existingRefKeys = useMemo(() => {
    const set = new Set<string>();
    if (!active) return set;
    for (const n of active.slot.nodes) {
      if (n.ref) {
        set.add(`${n.ref.layerId}|${n.ref.subCanvasId ?? ''}|${n.ref.nodeId}`);
      }
    }
    return set;
  }, [active]);

  const groups = useMemo<CandidateGroup[]>(() => {
    if (!project || !active) return [];
    const currentLayerId = active.layer.id;
    const currentSubId =
      active.layer.children && active.layer.children.length > 0 ? active.slot.id : undefined;

    const list: CandidateGroup[] = [];
    for (const layer of project.layers) {
      if (layer.children && layer.children.length > 0) {
        for (const sub of layer.children) {
          if (layer.id === currentLayerId && sub.id === currentSubId) continue;
          const eligible = sub.nodes.filter((n) => !getAnnotationKind(n) && n.kind !== 'store_ref' && !n.ref);
          if (eligible.length > 0) {
            list.push({
              groupKey: `${layer.id}::${sub.id}`,
              label: `${layer.name} / ${sub.name}`,
              layerId: layer.id,
              subCanvasId: sub.id,
              nodes: eligible,
            });
          }
        }
      } else {
        if (layer.id === currentLayerId) continue;
        const eligible = layer.nodes.filter((n) => !getAnnotationKind(n) && n.kind !== 'store_ref' && !n.ref);
        if (eligible.length > 0) {
          list.push({
            groupKey: layer.id,
            label: layer.name,
            layerId: layer.id,
            nodes: eligible,
          });
        }
      }
    }
    return list;
  }, [project, active]);

  if (!crossRefModalOpen || !project || !active) return null;

  const q = query.trim().toLowerCase();
  const visibleGroups = groups
    .filter((g) => selectedGroupKey === 'all' || g.groupKey === selectedGroupKey)
    .map((g) => ({
      ...g,
      nodes: g.nodes.filter(
        (n) =>
          !q ||
          n.title.toLowerCase().includes(q) ||
          n.tag.toLowerCase().includes(q) ||
          (n.tech ?? '').toLowerCase().includes(q) ||
          (n.dslId ?? '').toLowerCase().includes(q)
      ),
    }))
    .filter((g) => g.nodes.length > 0);

  const handleInsert = (ref: CrossLayerRef) => {
    addCrossLayerRefNode(ref);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={() => setCrossRefModalOpen(false)}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-[#1b1624] border border-white/10 text-zinc-100 shadow-2xl overflow-hidden flex flex-col max-h-[82vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-300">
              <Link2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">引入跨层只读引用锚点</h3>
              <p className="text-[11px] text-zinc-400">
                向「{active.slot.name}」引入其他层实体：支持连线、双击下钻跳转，且随源实体改名自动同步
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCrossRefModalOpen(false)}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pt-3.5 pb-2 space-y-2.5 shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索实体名称、标签、技术栈或 DSL ID..."
              className="w-full h-9 pl-9 pr-3 rounded-xl bg-[#110e17] border border-white/10 focus:border-violet-400/60 focus:outline-none text-xs text-zinc-100 placeholder-zinc-500"
            />
          </div>

          {groups.length > 1 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setSelectedGroupKey('all')}
                className={`px-2.5 py-1 rounded-lg text-[11px] transition-colors ${
                  selectedGroupKey === 'all'
                    ? 'bg-violet-600 text-white font-medium'
                    : 'bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300'
                }`}
              >
                全部来源 ({groups.reduce((s, g) => s + g.nodes.length, 0)})
              </button>
              {groups.map((g) => (
                <button
                  key={g.groupKey}
                  type="button"
                  onClick={() => setSelectedGroupKey(g.groupKey)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] transition-colors ${
                    selectedGroupKey === g.groupKey
                      ? 'bg-violet-600 text-white font-medium'
                      : 'bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300'
                  }`}
                >
                  {g.label} ({g.nodes.length})
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4">
          {visibleGroups.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-500">
              {groups.length === 0
                ? '其他推演层或子画布暂无可引用的实体，请先添加其他层实体。'
                : '没有匹配搜索条件的实体'}
            </div>
          ) : (
            visibleGroups.map((group) => (
              <div key={group.groupKey} className="space-y-1.5">
                <div className="text-[10.5px] font-mono text-violet-300/90 uppercase tracking-wider px-1">
                  {group.label}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {group.nodes.map((node) => {
                    const refKey = `${group.layerId}|${group.subCanvasId ?? ''}|${node.id}`;
                    const alreadyAdded = existingRefKeys.has(refKey);
                    const prim = findPrimitiveByKind(node.kind);
                    const Icon = ENTITY_ICON_MAP[node.icon || prim?.icon || ''] || Box;

                    return (
                      <div
                        key={node.id}
                        className="flex items-center justify-between gap-2.5 p-2.5 rounded-xl bg-[#14101c] border border-white/[0.07] hover:border-violet-400/35 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded-lg bg-white/[0.05] border border-white/10 flex items-center justify-center text-zinc-300 shrink-0">
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-zinc-100 truncate">
                              {node.title}
                            </div>
                            <div className="text-[10px] font-mono text-zinc-500 truncate">
                              {node.tag}
                              {node.tech ? ` · ${node.tech}` : ''}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            handleInsert({
                              layerId: group.layerId,
                              subCanvasId: group.subCanvasId,
                              nodeId: node.id,
                            })
                          }
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors ${
                            alreadyAdded
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              : 'bg-violet-600 hover:bg-violet-500 text-white'
                          }`}
                        >
                          {alreadyAdded ? (
                            <span className="inline-flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              已引入
                            </span>
                          ) : (
                            '引入'
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="px-5 py-3 bg-[#15111d] border-t border-white/[0.06] flex items-center justify-between text-[11px] text-zinc-400 shrink-0">
          <span>可连续引入多个实体，完成后关闭即可</span>
          <button
            type="button"
            onClick={() => setCrossRefModalOpen(false)}
            className="px-4 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-zinc-100 text-xs font-medium"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};
