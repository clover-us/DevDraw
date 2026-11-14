import { edgeDependency, type SimulationResult } from '../core/simulate';
import type { DependencyMode, Model } from '../core/types';

interface SidebarProps {
  model: Model;
  seeds: string[];
  result: SimulationResult | null;
  baseline: SimulationResult | null;
  selectedEdge: string | null;
  onChangeMode: (edgeId: string, mode: DependencyMode) => void;
  onClearEdge: () => void;
}

const MODE_INFO: Record<DependencyMode, { label: string; desc: string }> = {
  hard: { label: 'hard · 强依赖', desc: '无兜底：依赖失效则失效' },
  soft: { label: 'soft · 可降级', desc: '有兜底：依赖失效则降级' },
  async: { label: 'async · 异步', desc: '队列缓冲：依赖失效则降级（积压）' },
};

const MODES: DependencyMode[] = ['hard', 'soft', 'async'];

function name(model: Model, id: string): string {
  return model.nodes[id]?.name ?? id;
}

/** 把传播路径渲染成一句话：支付服务 —calls·hard→ 订单服务 —calls·hard→ API 网关 */
function renderPath(model: Model, result: SimulationResult, id: string): string {
  const steps = result.paths[id] ?? [];
  if (steps.length === 0) return '失效源';
  let text = name(model, steps[0].node);
  steps.forEach((step, i) => {
    const target = i + 1 < steps.length ? steps[i + 1].node : id;
    const edge = model.edges[step.edge];
    text += ` —${edge?.type ?? '?'}·${step.mode}→ ${name(model, target)}`;
  });
  const fallbacks = steps
    .map((step) => model.edges[step.edge]?.attrs?.fallback)
    .filter((f): f is string => typeof f === 'string' && f.length > 0);
  if (fallbacks.length > 0) text += `（兜底：${fallbacks.join('；')}）`;
  return text;
}

function Metric({ label, value, delta }: { label: string; value: number; delta: number | null }) {
  return (
    <div className="dd-metric">
      <div className="dd-metric-value">
        {value}
        {delta !== null && delta !== 0 && (
          <span className={`dd-delta ${delta < 0 ? 'good' : 'bad'}`}>{delta > 0 ? `+${delta}` : delta}</span>
        )}
      </div>
      <div className="dd-metric-label">{label}</div>
    </div>
  );
}

export function Sidebar({
  model,
  seeds,
  result,
  baseline,
  selectedEdge,
  onChangeMode,
  onClearEdge,
}: SidebarProps) {
  const edge = selectedEdge ? model.edges[selectedEdge] : null;
  const impacted = result
    ? Object.entries(result.states).filter(([id]) => !seeds.includes(id))
    : [];

  return (
    <aside className="dd-sidebar">
      {edge && selectedEdge && (
        <section className="dd-panel">
          <div className="dd-panel-head">
            <h3>依赖模式</h3>
            <button className="dd-link" onClick={onClearEdge}>
              关闭
            </button>
          </div>
          <p className="dd-edge-title">
            {name(model, edge.from)} → {name(model, edge.to)}
          </p>
          <p className="dd-muted">
            {edge.type}
            {edge.attrs?.fallback ? ` · 兜底：${edge.attrs.fallback}` : ''}
          </p>
          {MODES.map((mode) => (
            <label
              key={mode}
              className={`dd-mode-option${edgeDependency(edge) === mode ? ' active' : ''}`}
            >
              <input
                type="radio"
                name={`dep-mode-${selectedEdge}`}
                checked={edgeDependency(edge) === mode}
                onChange={() => onChangeMode(selectedEdge, mode)}
              />
              <span>
                <strong>{MODE_INFO[mode].label}</strong>
                <br />
                <span className="dd-muted">{MODE_INFO[mode].desc}</span>
              </span>
            </label>
          ))}
          {edgeDependency(edge) === 'soft' && !edge.attrs?.fallback && (
            <p className="dd-warn">soft 模式建议填写兜底说明（spike 暂不支持编辑 fallback 文本）。</p>
          )}
          <p className="dd-muted">改动立即生效；推演中会自动重演，并与首次改动前的基线对比。</p>
        </section>
      )}

      {result ? (
        <>
          <section className="dd-panel">
            <h3>爆炸半径</h3>
            <div className="dd-metrics">
              <Metric
                label="失效"
                value={result.blastRadius.failed}
                delta={baseline ? result.blastRadius.failed - baseline.blastRadius.failed : null}
              />
              <Metric
                label="降级"
                value={result.blastRadius.degraded}
                delta={baseline ? result.blastRadius.degraded - baseline.blastRadius.degraded : null}
              />
              <Metric
                label="受影响入口"
                value={result.blastRadius.affectedEntries.length}
                delta={
                  baseline
                    ? result.blastRadius.affectedEntries.length - baseline.blastRadius.affectedEntries.length
                    : null
                }
              />
            </div>
            {result.blastRadius.affectedEntries.length > 0 && (
              <p className="dd-muted">
                受影响入口：{result.blastRadius.affectedEntries.map((id) => name(model, id)).join('、')}
              </p>
            )}
            {baseline && <p className="dd-muted">Δ 对比基线 = 首次改边前的推演结果</p>}
            <p className="dd-muted">失效源：{seeds.map((id) => name(model, id)).join('、')}</p>
          </section>
          <section className="dd-panel">
            <h3>影响路径（{impacted.length}）</h3>
            {impacted.length === 0 && <p className="dd-muted">无旁路影响——失效被完全隔离。</p>}
            <ul className="dd-impact-list">
              {impacted.map(([id, state]) => (
                <li key={id} className={`dd-impact state-${state}`}>
                  <div className="dd-impact-head">
                    <span className="dd-state-chip">{state === 'failed' ? '失效' : '降级'}</span>
                    <strong>{name(model, id)}</strong>
                  </div>
                  <div className="dd-impact-path">{renderPath(model, result, id)}</div>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <section className="dd-panel">
          <h3>开始推演</h3>
          <p>右键任意节点，将其设为失效源，观察影响沿依赖边传播。</p>
          <p className="dd-muted">
            试试：右键「支付服务」→ 整条 hard 链染红；再点击「订单→支付」的边标签，把 hard 改为
            soft，见证爆炸半径收缩。
          </p>
        </section>
      )}

      <section className="dd-panel">
        <h3>图例</h3>
        <div className="dd-legend">
          <span>
            <i className="dot ok" /> 正常
          </span>
          <span>
            <i className="dot degraded" /> 降级
          </span>
          <span>
            <i className="dot failed" /> 失效
          </span>
        </div>
        <div className="dd-legend">
          <span>
            <i className="line hard" /> hard
          </span>
          <span>
            <i className="line soft" /> soft
          </span>
          <span>
            <i className="line async" /> async
          </span>
        </div>
      </section>
    </aside>
  );
}
