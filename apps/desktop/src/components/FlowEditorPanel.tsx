import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronsLeft,
  Clock,
  GitBranch,
  MousePointerClick,
  Play,
  Plus,
  Route,
  Square,
  Trash2,
} from 'lucide-react';
import { getAnnotationKind } from '@devdraw/core';
import { getActiveSlotFromProject, useWorkbenchStore } from '../store/useWorkbenchStore';

export const FlowEditorPanel: React.FC = () => {
  const {
    projects,
    activeProjectId,
    activeLayerIndex,
    simulating,
    activeFlowId,
    flowStepIndex,
    flowPickEdgeMode,
    toggleLeftTab,
    toggleSimulation,
    selectFlow,
    setFlowStepIndex,
    setFlowPickEdgeMode,
    createFlow,
    updateFlowMeta,
    deleteFlow,
    addFlowStep,
    updateFlowStep,
    moveFlowStep,
    deleteFlowStep,
  } = useWorkbenchStore();

  const [dragStepIdx, setDragStepIdx] = useState<number | null>(null);

  const project = projects.find((p) => p.id === activeProjectId);
  const active = getActiveSlotFromProject(project, activeLayerIndex);
  if (!project || !active) return null;

  const flows = active.slot.flows ?? [];
  const activeFlow = flows.find((f) => f.id === activeFlowId) ?? flows[0] ?? null;
  const selectableNodes = active.slot.nodes.filter((n) => !getAnnotationKind(n));

  const handleAddManualStep = () => {
    let flowId: string | null = activeFlow?.id ?? null;
    if (!flowId) {
      flowId = createFlow('核心业务链路');
    }
    if (!flowId) return;

    const firstEdge = active.slot.edges[0];
    const fromId = firstEdge?.from ?? selectableNodes[0]?.id ?? '';
    const toId = firstEdge?.to ?? selectableNodes[1]?.id ?? selectableNodes[0]?.id ?? '';
    if (!fromId || !toId) return;

    addFlowStep(flowId, {
      from: fromId,
      to: toId,
      label: firstEdge?.label || '调用处理',
    });
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 p-3 space-y-3 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Route className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="text-[11px] font-mono font-semibold uppercase tracking-wider truncate">
            动态链路编排 ({flows.length})
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => createFlow()}
            title="新建一条动态推演链路"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-[10.5px] font-medium transition-colors"
          >
            <Plus className="w-3 h-3" />
            <span>新建</span>
          </button>
          <button
            type="button"
            onClick={() => toggleLeftTab('flows')}
            className="p-1 rounded-md text-[var(--dd-text-secondary)] hover:bg-white/[0.08]"
          >
            <ChevronsLeft className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Flow Selector Pills */}
      {flows.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5 shrink-0">
          {flows.map((f) => {
            const isCurrent = f.id === activeFlow?.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => selectFlow(f.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] whitespace-nowrap transition-colors shrink-0 ${
                  isCurrent
                    ? 'bg-emerald-500/20 border border-emerald-400/45 text-emerald-300 font-medium'
                    : 'bg-white/[0.03] hover:bg-white/[0.08] border border-transparent text-[var(--dd-text-secondary)]'
                }`}
              >
                {f.name} ({f.steps.length})
              </button>
            );
          })}
        </div>
      )}

      {!activeFlow ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-3 space-y-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/12 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
            <Route className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <div className="text-xs font-medium text-[var(--dd-text-primary)]">
              尚未编排动态推演链路
            </div>
            <p className="text-[11px] text-[var(--dd-text-muted)] leading-relaxed">
              将架构拓扑中的关键请求按 Step 1..N 串联，演示调用路径、耗时预算与架构决策依据。
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              createFlow('核心请求主链路');
              setFlowPickEdgeMode(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新建链路并点选连线</span>
          </button>
        </div>
      ) : (
        <>
          {/* Active Flow Metadata */}
          <div className="p-2.5 rounded-xl bg-white/[0.03] border border-[var(--dd-border-subtle)] space-y-2 shrink-0">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={activeFlow.name}
                onChange={(e) => updateFlowMeta(activeFlow.id, { name: e.target.value })}
                placeholder="链路名称..."
                className="flex-1 min-w-0 h-7 px-2 rounded-lg bg-black/20 border border-[var(--dd-border-subtle)] focus:border-emerald-400/60 focus:outline-none text-xs font-medium"
              />
              <button
                type="button"
                onClick={() => deleteFlow(activeFlow.id)}
                title="删除当前链路"
                className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/15 transition-colors shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <input
              type="text"
              value={activeFlow.description ?? ''}
              onChange={(e) => updateFlowMeta(activeFlow.id, { description: e.target.value })}
              placeholder="链路场景描述（可选）..."
              className="w-full h-7 px-2 rounded-lg bg-black/20 border border-[var(--dd-border-subtle)] focus:border-violet-400/60 focus:outline-none text-[11px] text-[var(--dd-text-secondary)]"
            />

            {/* Quick Action Bar: Play + Pick Edge from Canvas */}
            <div className="grid grid-cols-2 gap-1.5 pt-0.5">
              <button
                type="button"
                onClick={toggleSimulation}
                disabled={activeFlow.steps.length === 0}
                className={`h-7 inline-flex items-center justify-center gap-1.5 rounded-lg border text-[11px] font-medium disabled:opacity-40 transition-colors ${
                  simulating
                    ? 'bg-emerald-500/25 border-emerald-400/50 text-emerald-300'
                    : 'bg-emerald-500/12 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                }`}
              >
                {simulating ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                <span>{simulating ? '停止演播' : '演播预览'}</span>
              </button>

              <button
                type="button"
                onClick={() => setFlowPickEdgeMode(!flowPickEdgeMode)}
                disabled={active.slot.edges.length === 0}
                title="开启后点击画布上任意连线即可自动追加为下一步"
                className={`h-7 inline-flex items-center justify-center gap-1.5 rounded-lg border text-[11px] font-medium disabled:opacity-40 transition-colors ${
                  flowPickEdgeMode
                    ? 'bg-violet-600 border-violet-400 text-white shadow-sm'
                    : 'bg-white/[0.04] hover:bg-white/[0.09] border-[var(--dd-border-subtle)] text-[var(--dd-text-secondary)]'
                }`}
              >
                <MousePointerClick className="w-3 h-3" />
                <span>{flowPickEdgeMode ? '停止拾取' : '点选连线'}</span>
              </button>
            </div>
          </div>

          {/* Step List */}
          <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-0.5">
            {activeFlow.steps.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-[var(--dd-border-subtle)] text-center text-[11px] text-[var(--dd-text-muted)] space-y-2">
                <p>暂无链路步骤。点击上方「点选连线」后在画布上点击连线，或点击下方手动添加步骤。</p>
              </div>
            ) : (
              activeFlow.steps.map((step, idx) => {
                const isActivePreview = simulating && flowStepIndex === idx;
                return (
                  <div
                    key={`${idx}-${step.from}-${step.to}`}
                    draggable
                    onDragStart={() => setDragStepIdx(idx)}
                    onDragOver={(e) => {
                      if (dragStepIdx === null) return;
                      e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragStepIdx !== null && dragStepIdx !== idx) {
                        moveFlowStep(activeFlow.id, dragStepIdx, idx);
                      }
                      setDragStepIdx(null);
                    }}
                    onDragEnd={() => setDragStepIdx(null)}
                    onClick={() => setFlowStepIndex(idx)}
                    className={`p-2.5 rounded-xl border space-y-2 cursor-pointer transition-all ${
                      isActivePreview
                        ? 'bg-emerald-500/10 border-emerald-400/55 shadow-[0_0_0_1px_rgba(52,211,153,0.2)]'
                        : 'bg-white/[0.02] hover:bg-white/[0.04] border-[var(--dd-border-subtle)]'
                    }`}
                  >
                    {/* Step Header: Order + Reorder + Delete */}
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded-md bg-violet-500/20 text-violet-300 font-mono text-[10px] font-semibold">
                          #{idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateFlowStep(activeFlow.id, idx, { parallel: !step.parallel });
                          }}
                          title="标记是否与前一步并行执行"
                          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] border transition-colors ${
                            step.parallel
                              ? 'bg-sky-500/20 border-sky-400/45 text-sky-300'
                              : 'bg-transparent border-transparent text-[var(--dd-text-muted)] hover:bg-white/[0.06]'
                          }`}
                        >
                          <GitBranch className="w-2.5 h-2.5" />
                          <span>并行</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => moveFlowStep(activeFlow.id, idx, idx - 1)}
                          title="上移一步"
                          className="p-1 rounded hover:bg-white/10 disabled:opacity-30 text-[var(--dd-text-secondary)]"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === activeFlow.steps.length - 1}
                          onClick={() => moveFlowStep(activeFlow.id, idx, idx + 1)}
                          title="下移一步"
                          className="p-1 rounded hover:bg-white/10 disabled:opacity-30 text-[var(--dd-text-secondary)]"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteFlowStep(activeFlow.id, idx)}
                          title="删除步骤"
                          className="p-1 rounded hover:bg-rose-500/20 text-zinc-500 hover:text-rose-400"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* From -> To Node Selectors */}
                    <div
                      className="grid grid-cols-[1fr_auto_1fr] items-center gap-1 text-[11px]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <select
                        value={step.from}
                        onChange={(e) => updateFlowStep(activeFlow.id, idx, { from: e.target.value })}
                        className="h-7 px-1.5 rounded-md bg-black/25 border border-[var(--dd-border-subtle)] outline-none min-w-0"
                      >
                        {selectableNodes.map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.title}
                          </option>
                        ))}
                      </select>
                      <span className="text-violet-400 font-mono text-[10px]">→</span>
                      <select
                        value={step.to}
                        onChange={(e) => updateFlowStep(activeFlow.id, idx, { to: e.target.value })}
                        className="h-7 px-1.5 rounded-md bg-black/25 border border-[var(--dd-border-subtle)] outline-none min-w-0"
                      >
                        {selectableNodes.map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Label + Latency */}
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={step.label}
                        onChange={(e) => updateFlowStep(activeFlow.id, idx, { label: e.target.value })}
                        placeholder="步骤动作说明..."
                        className="flex-1 min-w-0 h-7 px-2 rounded-md bg-black/25 border border-[var(--dd-border-subtle)] focus:border-emerald-400/60 focus:outline-none text-[11px]"
                      />
                      <div className="relative w-[72px] shrink-0">
                        <Clock className="w-2.5 h-2.5 text-emerald-400/70 absolute left-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={step.latency ?? ''}
                          onChange={(e) =>
                            updateFlowStep(activeFlow.id, idx, { latency: e.target.value || undefined })
                          }
                          placeholder="12ms"
                          className="w-full h-7 pl-5 pr-1.5 rounded-md bg-black/25 border border-[var(--dd-border-subtle)] focus:border-emerald-400/60 focus:outline-none text-[10.5px] font-mono"
                        />
                      </div>
                    </div>

                    {/* Rationale */}
                    <input
                      type="text"
                      value={step.rationale ?? ''}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        updateFlowStep(activeFlow.id, idx, { rationale: e.target.value || undefined })
                      }
                      placeholder="决策依据 / 推演说明（演播时展示）..."
                      className="w-full h-7 px-2 rounded-md bg-black/20 border border-[var(--dd-border-subtle)] focus:border-violet-400/60 focus:outline-none text-[10.5px] text-[var(--dd-text-secondary)]"
                    />
                  </div>
                );
              })
            )}
          </div>

          {/* Add Manual Step Footer */}
          <button
            type="button"
            disabled={selectableNodes.length === 0}
            onClick={handleAddManualStep}
            className="w-full h-8 inline-flex items-center justify-center gap-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] disabled:opacity-40 border border-dashed border-[var(--dd-border-strong)] text-xs text-[var(--dd-text-secondary)] hover:text-emerald-300 transition-colors shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>手动添加一步</span>
          </button>
        </>
      )}
    </div>
  );
};
