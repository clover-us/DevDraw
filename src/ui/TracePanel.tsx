/**
 * TracePanel —— 左导航"追踪"分区：交互式请求追踪。
 * 设计依据 docs/design/core-semantics.md §2.3：
 * 手动步进为主——每一跳由用户在当前节点的出边中选择，边上的 when 分支 / 延迟 /
 * 依赖模式标注辅助判断；自动枚举的简单路径只是建议，不替用户走。
 * 每跳注解可存进会话（§2.6 重放对账），也可一键沉淀为 Decision / Assumption 节点。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { LensDef } from '../core/registry';
import { NODE_TYPES } from '../core/registry';
import { EDGE_TYPES } from '../core/registry/edgeTypes';
import {
  currentNode,
  enumerateTracePaths,
  traceBottleneck,
  traceLatency,
  traceOptions,
  type TraceScenario,
} from '../core/trace';
import type { Model } from '../core/types';
import { Metric, nodeName } from './inspect';
import { CloseIcon, TraceIcon } from './icons';

interface TracePanelProps {
  model: Model;
  lens: LensDef;
  trace: TraceScenario | null;
  onStart: (entry: string) => void;
  onStep: (edgeId: string) => void;
  /** 沿建议路径整条走（当前走法若是它的前缀则接着走，否则从入口重走）。 */
  onWalkPath: (edgeIds: string[]) => void;
  onUndo: () => void;
  onClear: () => void;
  onAnnotate: (index: number, note: string) => void;
  onRecord: (index: number, kind: 'Decision' | 'Assumption') => void;
  onArchive: () => void;
  onSelectNode: (id: string) => void;
  onClose: () => void;
}

/** 入口候选：只有 Actor / Endpoint——请求从"谁"或"哪个接口"发起（§2.3）。 */
const ENTRY_TYPES = new Set(['Actor', 'Endpoint']);

/**
 * 每跳注解输入：本地草稿，失焦 / Enter 提交，Esc 取消。
 * 不在每次按键时写模型视图——注解是"想清楚了再落"的判断，不是逐字录屏。
 */
function HopNote({ note, onCommit }: { note?: string; onCommit: (note: string) => void }) {
  const [draft, setDraft] = useState(note ?? '');
  const cancelRef = useRef(false);
  useEffect(() => setDraft(note ?? ''), [note]);
  return (
    <input
      className="dd-trace-note-input"
      value={draft}
      placeholder="注解：如「这里是瓶颈」"
      aria-label="这一跳的注解"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (cancelRef.current) {
          cancelRef.current = false;
          setDraft(note ?? '');
          return;
        }
        if (draft.trim() !== (note ?? '')) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          cancelRef.current = true;
          e.currentTarget.blur();
        }
      }}
    />
  );
}

export function TracePanel({
  model,
  lens,
  trace,
  onStart,
  onStep,
  onWalkPath,
  onUndo,
  onClear,
  onAnnotate,
  onRecord,
  onArchive,
  onSelectNode,
  onClose,
}: TracePanelProps) {
  const entries = Object.entries(model.nodes).filter(([, n]) => ENTRY_TYPES.has(n.type));
  const options = useMemo(() => (trace ? traceOptions(model, trace) : []), [model, trace]);
  const paths = useMemo(() => (trace ? enumerateTracePaths(model, trace.entry) : []), [model, trace]);
  const latency = trace ? traceLatency(model, trace) : 0;
  const bottleneck = trace ? traceBottleneck(model, trace) : null;
  const current = trace ? currentNode(trace) : null;

  return (
    <aside className="dd-navpanel section-trace" aria-label="请求追踪">
      <div className="dd-navpanel-head">
        <div>
          <h2>请求追踪</h2>
          <span className="dd-navpanel-sub">架构镜片 · 沿调用链一步步走</span>
        </div>
        <button className="dd-icon-btn" onClick={onClose} title="收起面板" aria-label="收起面板">
          <CloseIcon size={16} />
        </button>
      </div>

      <div className="dd-entity-scroll">
        {lens.id !== 'architecture' && (
          <p className="dd-note">请求追踪在<strong>架构镜片</strong>上进行：切到架构，右键角色/端点选「追踪请求」，或直接点下方入口。</p>
        )}

        <div className="dd-drawer-section">
          <div className="dd-drawer-section-head">
            <h3>入口</h3>
            {trace && (
              <button className="dd-mini-btn" onClick={onClear}>
                清除
              </button>
            )}
          </div>
          <div className="dd-seed-chips">
            {entries.map(([id, n]) => {
              const on = trace?.entry === id;
              return (
                <button
                  key={id}
                  className={`dd-seed-chip${on ? ' on' : ''}`}
                  onClick={() => onStart(id)}
                  title={`${NODE_TYPES[n.type].label} · 从它发起一个请求`}
                  aria-pressed={on}
                >
                  <span className="dd-seed-dot" />
                  {n.name}
                </button>
              );
            })}
            {entries.length === 0 && <p className="dd-empty">没有角色 / 端点节点——请求总得从谁发起。</p>}
          </div>
        </div>

        {trace ? (
          <>
            <div className="dd-drawer-section">
              <div className="dd-metrics">
                <Metric label="已走跳数" value={trace.hops.length} delta={null} />
                <Metric label="累计延迟 (ms)" value={latency} delta={null} />
              </div>
              {bottleneck && (
                <p className="dd-hint-text">
                  最慢一跳：<b>{nodeName(model, bottleneck.hop.from)} → {nodeName(model, bottleneck.hop.to)}</b>
                  （{bottleneck.latencyMs}ms，第 {bottleneck.index + 1} 跳）。延迟未标注的边按 0 计。
                </p>
              )}
            </div>

            <div className="dd-drawer-section">
              <div className="dd-drawer-section-head">
                <h3>下一跳</h3>
                <button className="dd-mini-btn" onClick={onUndo} disabled={trace.hops.length === 0}>
                  退一步
                </button>
              </div>
              <button className="dd-trace-current" onClick={() => current && onSelectNode(current)} title="在画布上查看当前节点">
                <span className="dd-trace-current-dot" />
                当前：<b>{current ? nodeName(model, current) : '—'}</b>
              </button>
              {options.length > 0 ? (
                <ul className="dd-trace-options">
                  {options.map((opt) => (
                    <li key={opt.edgeId}>
                      <button className="dd-trace-option" onClick={() => onStep(opt.edgeId)}>
                        <span className="dd-trace-option-head">
                          <span className="dd-trace-edge-type">{EDGE_TYPES[opt.edgeType].label}</span>
                          <b>{opt.toName}</b>
                          {opt.revisits && <span className="dd-trace-chip revisit">已走过</span>}
                        </span>
                        <span className="dd-trace-option-meta">
                          {opt.label && <span className="dd-trace-chip">{opt.label}</span>}
                          {opt.when && <span className="dd-trace-chip when">当 {opt.when}</span>}
                          {opt.latencyMs !== undefined && <span className="dd-trace-chip lat">{opt.latencyMs}ms</span>}
                          <span className={`dd-trace-chip mode-${opt.dependency}`}>{opt.dependency}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="dd-empty">这里没有请求出边了——这一跳到此为止。</p>
              )}
            </div>

            {trace.hops.length > 0 && (
              <div className="dd-drawer-section">
                <div className="dd-drawer-section-head">
                  <h3>已走的路（{trace.hops.length}）</h3>
                </div>
                <ol className="dd-trace-hops">
                  {trace.hops.map((hop, i) => {
                    const edge = model.edges[hop.edgeId];
                    return (
                      <li key={`${hop.edgeId}-${i}`} className="dd-trace-hop">
                        <div className="dd-trace-hop-head">
                          <span className="dd-trace-step">{i + 1}</span>
                          <button className="dd-trace-hop-route" onClick={() => onSelectNode(hop.to)} title="在画布上查看">
                            {nodeName(model, hop.from)} → <b>{nodeName(model, hop.to)}</b>
                          </button>
                          {typeof edge?.attrs?.latencyMs === 'number' && (
                            <span className="dd-trace-chip lat">{edge.attrs.latencyMs}ms</span>
                          )}
                        </div>
                        <HopNote note={hop.note} onCommit={(note) => onAnnotate(i, note)} />
                        <div className="dd-trace-hop-actions">
                          <button className="dd-mini-btn" onClick={() => onRecord(i, 'Decision')} title="把这一跳的判断沉淀为决策节点">
                            记为决策
                          </button>
                          <button className="dd-mini-btn" onClick={() => onRecord(i, 'Assumption')} title="把这一跳的注解沉淀为假设节点">
                            记为假设
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}

            {paths.length > 0 && (
              <div className="dd-drawer-section">
                <div className="dd-drawer-section-head">
                  <h3>建议路径（{paths.length}）</h3>
                </div>
                <p className="dd-hint-text">自动枚举的简单路径（不重复节点），只作建议——分支怎么选仍由你决定。</p>
                <div className="dd-trace-paths">
                  {paths.map((edgeIds, i) => {
                    const names = [
                      nodeName(model, trace.entry),
                      ...edgeIds.map((id) => nodeName(model, model.edges[id]?.to ?? '')),
                    ];
                    const ms = edgeIds.reduce((s, id) => s + (Number(model.edges[id]?.attrs?.latencyMs) || 0), 0);
                    return (
                      <button key={i} className="dd-trace-path" onClick={() => onWalkPath(edgeIds)} title="沿这条路径走一遍">
                        <span className="dd-trace-path-chain">{names.join(' → ')}</span>
                        <span className="dd-trace-path-meta">
                          {edgeIds.length} 跳{ms > 0 ? ` · ${ms}ms` : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="dd-drawer-section">
              <button className="dd-primary dd-block" onClick={onArchive} disabled={trace.hops.length === 0}>
                存档这次追踪
              </button>
              <p className="dd-hint-text">
                存的是<b>走法</b>（入口 + 每跳 + 注解）和<b>此刻的延迟</b>。模型改了之后回来点开它，就能看出这条请求今天还走不走得通。
              </p>
            </div>
          </>
        ) : (
          <div className="dd-sim-empty">
            <TraceIcon size={30} />
            <p>选一个入口，<strong>一步步</strong>看一个请求穿过架构：每一跳的分支、延迟、依赖模式都摆在眼前。</p>
            <p className="dd-muted">也可以直接在架构画布上右键角色 / 端点。走到瓶颈处写句注解，存进会话，改天回来对账。</p>
          </div>
        )}
      </div>
    </aside>
  );
}