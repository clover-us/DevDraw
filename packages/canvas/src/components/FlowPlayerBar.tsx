import React from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, Sparkles, X } from 'lucide-react';
import type { FlowScript } from '@devdraw/core';

export interface FlowPlayerBarProps {
  flows: FlowScript[];
  activeFlowId: string | null;
  stepIndex: number;
  isPlaying: boolean;
  theme: 'dark' | 'light';
  onSelectFlow: (flowId: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onTogglePlay: () => void;
  onReset: () => void;
  onClose: () => void;
}

export const FlowPlayerBar: React.FC<FlowPlayerBarProps> = ({
  flows,
  activeFlowId,
  stepIndex,
  isPlaying,
  theme,
  onSelectFlow,
  onPrev,
  onNext,
  onTogglePlay,
  onReset,
  onClose,
}) => {
  const isLight = theme === 'light';
  const activeFlow = flows.find((f) => f.id === activeFlowId) ?? flows[0];
  if (!activeFlow) return null;

  const currentStep = stepIndex >= 0 ? activeFlow.steps[stepIndex] : null;

  return (
    <div
      className={`pointer-events-auto flex flex-col gap-1.5 max-w-[680px] rounded-2xl border px-3.5 py-2.5 backdrop-blur-xl shadow-2xl ${
        isLight
          ? 'bg-white/95 border-slate-200 text-slate-800'
          : 'bg-[#171220]/94 border-violet-400/30 text-zinc-100'
      }`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-emerald-400 shrink-0">
          <Sparkles className="w-3.5 h-3.5" />
          动态链路推演
        </span>

        {flows.length > 1 ? (
          <select
            value={activeFlow.id}
            onChange={(e) => onSelectFlow(e.target.value)}
            className={`h-6 px-2 rounded-lg text-[11px] border outline-none ${
              isLight
                ? 'bg-slate-50 border-slate-200 text-slate-800'
                : 'bg-white/[0.06] border-white/10 text-zinc-200'
            }`}
          >
            {flows.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-xs font-medium">{activeFlow.name}</span>
        )}

        <div className="flex-1" />

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPrev}
            title="上一步 (←)"
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onTogglePlay}
            title={isPlaying ? '暂停自动演播' : '自动播放链路'}
            className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={onNext}
            title="下一步 (→)"
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onReset}
            title="恢复全图高亮"
            className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="退出推演模式"
            className="p-1.5 rounded-lg hover:bg-rose-500/20 text-zinc-400 hover:text-rose-300 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Step Description */}
      <div className="flex items-center justify-between gap-3 text-xs pt-0.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="px-1.5 py-0.5 rounded-md bg-violet-500/20 text-violet-300 font-mono text-[10px] shrink-0">
            {currentStep ? `Step ${stepIndex + 1} / ${activeFlow.steps.length}` : `全图脉冲 · ${activeFlow.steps.length} 步`}
          </span>
          <span className="truncate">
            {currentStep ? currentStep.label : activeFlow.description || '点击「下一步」逐步高亮请求路径与决策依据'}
          </span>
        </div>
        {currentStep?.latency && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 shrink-0">
            {currentStep.latency}
          </span>
        )}
      </div>

      {currentStep?.rationale && (
        <div className="text-[11px] text-zinc-400 border-t border-white/[0.06] pt-1.5">
          决策依据：{currentStep.rationale}
        </div>
      )}
    </div>
  );
};
