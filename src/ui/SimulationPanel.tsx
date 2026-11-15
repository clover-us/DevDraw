/**
 * SimulationPanel —— 左导航"推演"分区：交互式 what-if 失效推演。
 * 失效源控制（点选架构基础设施节点）→ 爆炸半径指标（含与基线的 Δ）→ 受影响节点 + 一句解释。
 * 与"发现"分区互补：发现 = 推演器静态诊断（SPOF/缺口/反问）；推演 = 你亲手设失效源看后果。
 */
import type { LensDef } from '../core/registry';
import { NODE_TYPES } from '../core/registry';
import type { SimulationResult } from '../core/simulate';
import type { Model } from '../core/types';
import { Metric, nodeName, renderPath } from './inspect';
import { CloseIcon, SimulationIcon } from './icons';

interface SimulationPanelProps {
  model: Model;
  lens: LensDef;
  seeds: string[];
  result: SimulationResult | null;
  baseline: SimulationResult | null;
  onToggleSeed: (id: string) => void;
  onClearScenario: () => void;
  onSelectNode: (id: string) => void;
  onClose: () => void;
}

const INFRA = new Set(['Service', 'Database', 'Queue', 'ExternalSystem']);

export function SimulationPanel({
  model,
  lens,
  seeds,
  result,
  baseline,
  onToggleSeed,
  onClearScenario,
  onSelectNode,
  onClose,
}: SimulationPanelProps) {
  const infraNodes = Object.entries(model.nodes).filter(([, n]) => INFRA.has(n.type));
  const br = result?.blastRadius;
  const baseBr = baseline?.blastRadius;
  const delta = (cur: number, base: number | undefined) => (base === undefined ? null : cur - base);
  const impacted = result ? Object.entries(result.states).filter(([id]) => !seeds.includes(id)) : [];

  return (
    <aside className="dd-navpanel section-simulation" aria-label="失效推演">
      <div className="dd-navpanel-head">
        <div>
          <h2>失效推演</h2>
          <span className="dd-navpanel-sub">架构镜片 · 失败传播 / 爆炸半径</span>
        </div>
        <button className="dd-icon-btn" onClick={onClose} title="收起面板" aria-label="收起面板">
          <CloseIcon size={16} />
        </button>
      </div>

      {lens.id !== 'architecture' && (
        <p className="dd-note">失效推演在<strong>架构镜片</strong>上进行：切到架构，选中节点点「模拟失效」，或直接点下方失效源。</p>
      )}

      <div className="dd-drawer-section">
        <div className="dd-drawer-section-head">
          <h3>失效源（{seeds.length}）</h3>
          {seeds.length > 0 && (
            <button className="dd-mini-btn" onClick={onClearScenario}>
              清除
            </button>
          )}
        </div>
        <div className="dd-seed-chips">
          {infraNodes.map(([id, n]) => {
            const on = seeds.includes(id);
            return (
              <button
                key={id}
                className={`dd-seed-chip${on ? ' on' : ''}`}
                onClick={() => onToggleSeed(id)}
                title={`${NODE_TYPES[n.type].label} · 点击${on ? '取消' : '设为'}失效源`}
                aria-pressed={on}
              >
                <span className="dd-seed-dot" />
                {n.name}
              </button>
            );
          })}
          {infraNodes.length === 0 && <p className="dd-empty">没有可设为失效源的基础设施节点。</p>}
        </div>
      </div>

      {result && br ? (
        <>
          <div className="dd-drawer-section">
            <div className="dd-drawer-section-head">
              <h3>爆炸半径</h3>
            </div>
            <div className="dd-metrics">
              <Metric label="失效" value={br.failed} delta={delta(br.failed, baseBr?.failed)} />
              <Metric label="降级" value={br.degraded} delta={delta(br.degraded, baseBr?.degraded)} />
              <Metric label="受影响入口" value={br.affectedEntries.length} delta={delta(br.affectedEntries.length, baseBr?.affectedEntries.length)} />
            </div>
            {baseline && (
              <p className="dd-hint-text">
                Δ 对比首次改依赖模式前的基线。<span className="dd-delta good">绿色</span>=收缩（更 resilient），
                <span className="dd-delta bad">红色</span>=扩大。改一条边的 hard/soft 就能看到权衡。
              </p>
            )}
          </div>

          <div className="dd-drawer-section dd-grow">
            <div className="dd-drawer-section-head">
              <h3>受影响节点（{impacted.length}）</h3>
            </div>
            <div className="dd-entity-scroll">
              {impacted.length === 0 && <p className="dd-empty">失效没有向外传播（被兜底吸收了）。</p>}
              <ul className="dd-impact-list">
                {impacted.map(([id, state]) => (
                  <li key={id} className={`dd-impact state-${state}`}>
                    <button className="dd-impact-head" onClick={() => onSelectNode(id)}>
                      <span className={`dd-state-dot state-${state}`} />
                      <strong>{nodeName(model, id)}</strong>
                      <span className="dd-impact-state">{state === 'failed' ? '失效' : '降级'}</span>
                    </button>
                    <div className="dd-impact-path">{renderPath(model, result, id)}</div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      ) : (
        <div className="dd-sim-empty">
          <SimulationIcon size={30} />
          <p>选一个失效源，模型立刻告诉你<strong>谁会跟着倒下、为什么</strong>。</p>
          <p className="dd-muted">也可以选中节点点「模拟失效」。改边的依赖模式（hard→soft）后，爆炸半径会收缩给你看。</p>
        </div>
      )}

      <div className="dd-legend">
        <span><i className="dd-dot state-failed" />失效</span>
        <span><i className="dd-dot state-degraded" />降级</span>
        <span><i className="dd-dot state-ok" />正常</span>
        <span><i className="dd-dot sev-question" />反问</span>
      </div>
    </aside>
  );
}
