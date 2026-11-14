/**
 * 镜片感知侧栏：推演器发现（"模型顶嘴"）+ 交互式反问卡片 + 架构失效推演 + ER 改列牵连。
 * 反问选项携带 applyPatch 补丁；选择即落地，模型据此停止追问（反问沉淀为 ADR）。
 */
import { columnImpact } from '../core/reasoners/er';
import type { Finding, FindingSeverity, QuestionOption } from '../core/reasoners/types';
import type { LensDef } from '../core/registry';
import { edgeDependency, type SimulationResult } from '../core/simulate';
import type { DependencyMode, Model } from '../core/types';

interface SidebarProps {
  model: Model;
  lens: LensDef;
  findings: Finding[];
  activeFinding: string | null;
  onSelectFinding: (id: string | null) => void;
  onAnswer: (option: QuestionOption) => void;
  selectedNode: string | null;
  selectedEdge: string | null;
  seeds: string[];
  result: SimulationResult | null;
  baseline: SimulationResult | null;
  onChangeMode: (edgeId: string, mode: DependencyMode) => void;
  onClearEdge: () => void;
}

const SEV_LABEL: Record<FindingSeverity, string> = {
  error: '错误',
  question: '反问',
  warning: '警告',
  info: '信息',
};

const MODE_INFO: Record<DependencyMode, { label: string; desc: string }> = {
  hard: { label: 'hard · 强依赖', desc: '无兜底：依赖失效则失效' },
  soft: { label: 'soft · 可降级', desc: '有兜底：依赖失效则降级' },
  async: { label: 'async · 异步', desc: '队列缓冲：依赖失效则降级（积压）' },
};
const MODES: DependencyMode[] = ['hard', 'soft', 'async'];

function name(model: Model, id: string): string {
  return model.nodes[id]?.name ?? id;
}

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

function FindingCard({
  finding,
  active,
  onSelect,
  onAnswer,
}: {
  finding: Finding;
  active: boolean;
  onSelect: () => void;
  onAnswer: (option: QuestionOption) => void;
}) {
  return (
    <li className={`dd-finding sev-${finding.severity}${active ? ' active' : ''}`}>
      <button className="dd-finding-head" onClick={onSelect}>
        <span className="dd-sev-chip">{SEV_LABEL[finding.severity]}</span>
        <strong>{finding.title}</strong>
      </button>
      <p className="dd-finding-detail">{finding.detail}</p>
      {finding.question && (
        <div className="dd-question">
          <div className="dd-question-prompt">{finding.question.prompt}</div>
          {finding.question.options.map((opt) => (
            <button key={opt.id} className="dd-option" onClick={() => onAnswer(opt)}>
              <span className="dd-option-label">{opt.label}</span>
              {opt.description && <span className="dd-option-desc">{opt.description}</span>}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

export function Sidebar({
  model,
  lens,
  findings,
  activeFinding,
  onSelectFinding,
  onAnswer,
  selectedNode,
  selectedEdge,
  seeds,
  result,
  baseline,
  onChangeMode,
  onClearEdge,
}: SidebarProps) {
  const edge = selectedEdge ? model.edges[selectedEdge] : null;
  const impacted = result ? Object.entries(result.states).filter(([id]) => !seeds.includes(id)) : [];
  const selectedField = selectedNode && model.nodes[selectedNode]?.type === 'Field' ? selectedNode : null;
  const impact = selectedField ? columnImpact(model, selectedField) : null;
  const errorCount = findings.filter((f) => f.severity === 'error').length;
  const questionCount = findings.filter((f) => f.severity === 'question').length;

  return (
    <aside className="dd-sidebar">
      <section className="dd-panel dd-lens-intro">
        <h3>
          {lens.label}镜片 <span className="dd-reasoner">{lens.reasoner.label}</span>
        </h3>
        <p className="dd-muted">{lens.description}</p>
      </section>

      <section className="dd-panel">
        <div className="dd-panel-head">
          <h3>模型顶嘴（{findings.length}）</h3>
          <span className="dd-finding-counts">
            {errorCount > 0 && <span className="dd-count sev-error">{errorCount} 错</span>}
            {questionCount > 0 && <span className="dd-count sev-question">{questionCount} 问</span>}
          </span>
        </div>
        {findings.length === 0 && <p className="dd-muted">这副镜片下模型没有发现问题。</p>}
        <ul className="dd-finding-list">
          {findings.map((f) => (
            <FindingCard
              key={f.id}
              finding={f}
              active={activeFinding === f.id}
              onSelect={() => onSelectFinding(activeFinding === f.id ? null : f.id)}
              onAnswer={onAnswer}
            />
          ))}
        </ul>
      </section>

      {selectedField && impact && (
        <section className="dd-panel">
          <h3>改列牵连：{name(model, selectedField)}</h3>
          {impact.edgeIds.length === 0 ? (
            <p className="dd-muted">没有外键引用此列，改动不牵连其他表。</p>
          ) : (
            <>
              <p className="dd-muted">改/删此列会波及以下外键与表：</p>
              <ul className="dd-impact-list">
                {impact.edgeIds.map((eid, i) => (
                  <li key={eid} className="dd-impact state-degraded">
                    <div className="dd-impact-head">
                      <strong>{name(model, impact.tableIds[i])}</strong>
                    </div>
                    <div className="dd-impact-path">
                      外键 {eid} · {model.edges[eid]?.attrs?.key}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

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
            <label key={mode} className={`dd-mode-option${edgeDependency(edge) === mode ? ' active' : ''}`}>
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
          <p className="dd-muted">改动立即生效；推演中会自动重演，并与首次改动前的基线对比。</p>
        </section>
      )}

      {lens.id === 'architecture' &&
        (result ? (
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
            <p>右键任意节点设为失效源，观察影响沿依赖边传播。</p>
            <p className="dd-muted">
              试试：右键「支付服务」→ 整条 hard 链染红；再点「订单→支付」边标签把 hard 改为 soft，见证爆炸半径收缩。
            </p>
          </section>
        ))}

      <section className="dd-panel">
        <h3>图例</h3>
        <div className="dd-legend">
          <span>
            <i className="dot sev-error" /> 错误
          </span>
          <span>
            <i className="dot sev-question" /> 反问
          </span>
          <span>
            <i className="dot sev-warning" /> 警告
          </span>
          <span>
            <i className="dot ok" /> 正常
          </span>
        </div>
      </section>
    </aside>
  );
}
