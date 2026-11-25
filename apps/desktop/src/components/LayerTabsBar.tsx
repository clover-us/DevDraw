import React, { useState } from 'react';
import { Layers, Plus } from 'lucide-react';
import { LAYER_TEMPLATES, type LayerTemplateName } from '@devdraw/core';
import { useWorkbenchStore } from '../store/useWorkbenchStore';

export const LayerTabsBar: React.FC = () => {
  const { projects, activeProjectId, activeLayerIndex, selectLayer, addLayer } = useWorkbenchStore();
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const project = projects.find((p) => p.id === activeProjectId);
  if (!project) return null;

  const handlePick = (tpl: LayerTemplateName) => {
    addLayer(tpl);
    setAddMenuOpen(false);
  };

  return (
    <div className="relative h-9 px-3 sm:px-4 flex items-center gap-2 border-b bg-[var(--dd-bg-panel)] border-[var(--dd-border-subtle)] z-20 shrink-0">
      <span className="hidden sm:flex items-center gap-1 pr-1 text-[10px] font-mono uppercase tracking-wider text-[var(--dd-text-muted)] shrink-0">
        <Layers className="w-3 h-3" />
        推演层
      </span>

      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {project.layers.map((layer, idx) => {
          const active = idx === activeLayerIndex;
          return (
            <button
              key={layer.id}
              type="button"
              onClick={() => selectLayer(idx)}
              className={`px-2.5 py-1 rounded-lg text-[11.5px] whitespace-nowrap transition-colors ${
                active
                  ? 'bg-violet-500/20 text-violet-300 font-medium border border-violet-400/35'
                  : 'text-[var(--dd-text-secondary)] hover:bg-white/[0.06] border border-transparent'
              }`}
            >
              {layer.name}
            </button>
          );
        })}
      </div>

      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setAddMenuOpen((v) => !v)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-[var(--dd-text-secondary)] hover:text-violet-400 hover:bg-white/[0.05] transition-colors"
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
      <span className="text-[11px] font-mono text-[var(--dd-text-muted)] hidden lg:inline shrink-0">
        共 {project.layers.length} 层画布
      </span>
    </div>
  );
};
