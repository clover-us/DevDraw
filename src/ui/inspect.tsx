/**
 * 检查原语 —— 从旧 Sidebar 抽出的共享展示逻辑：
 * 严重度/依赖模式文案、影响路径渲染、爆炸半径指标、"模型顶嘴"发现卡片。
 * 被 NavPanel（发现面板）、EntityDrawer（相关发现）、SimulationPanel（推演）复用。
 */
import type { Finding, FindingSeverity, QuestionOption } from '../core/reasoners/types';
import type { SimulationResult } from '../core/simulate';
import type { DependencyMode, Model } from '../core/types';

export const SEV_LABEL: Record<FindingSeverity, string> = {
  error: '错误',
  question: '反问',
  warning: '警告',
  info: '信息',
};

export const MODE_INFO: Record<DependencyMode, { label: string; desc: string }> = {
  hard: { label: 'hard · 强依赖', desc: '无兜底：依赖失效则失效' },
  soft: { label: 'soft · 可降级', desc: '有兜底：依赖失效则降级' },
  async: { label: 'async · 异步', desc: '队列缓冲：依赖失效则降级（积压）' },
};
export const MODES: DependencyMode[] = ['hard', 'soft', 'async'];

export function nodeName(model: Model, id: string): string {
  return model.nodes[id]?.name ?? id;
}

/** 把某节点的失效传播路径拼成一句人话（模型在给你解释"为什么"）。 */
export function renderPath(model: Model, result: SimulationResult, id: string): string {
  const steps = result.paths[id] ?? [];
  if (steps.length === 0) return '失效源';
  let text = nodeName(model, steps[0].node);
  steps.forEach((step, i) => {
    const target = i + 1 < steps.length ? steps[i + 1].node : id;
    const edge = model.edges[step.edge];
    text += ` —${edge?.type ?? '?'}·${step.mode}→ ${nodeName(model, target)}`;
  });
  const fallbacks = steps
    .map((step) => model.edges[step.edge]?.attrs?.fallback)
    .filter((f): f is string => typeof f === 'string' && f.length > 0);
  if (fallbacks.length > 0) text += `（兜底：${fallbacks.join('；')}）`;
  return text;
}

export function Metric({ label, value, delta }: { label: string; value: number; delta: number | null }) {
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

/** "模型顶嘴"发现卡片：标题 + 一句解释 + 交互式反问选项（选择即落地为补丁）。 */
export function FindingCard({
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
