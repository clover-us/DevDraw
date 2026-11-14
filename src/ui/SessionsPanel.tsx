/**
 * SessionsPanel —— 推演会话（M1 收尾）：存档过的思考现场 + 当时 / 现在对账。
 *
 * 灵魂在这里兑现第三次：模型不只顶嘴，还把「当时你为什么这么判断」记下来，
 * 等你改完模型再回来，它告诉你这个判断今天还站不站得住。
 */
import type { Model } from '../core/types';
import { getLens, projectLens } from '../core/registry';
import { simulate } from '../core/simulate';
import { diffSession, type ReasoningSession, type SessionBlast } from '../core/session';
import { Metric } from './inspect';
import { CloseIcon, SessionsIcon, TrashIcon } from './icons';

interface SessionsPanelProps {
  model: Model;
  sessions: ReasoningSession[];
  activeId: string | null;
  /** 存档当前推演（当前镜片 + 当前场景 + 此刻结论）。 */
  onArchive: () => void;
  onOpen: (session: ReasoningSession) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 用当前模型重放存档的场景，得到「现在」的结论。 */
function currentOf(model: Model, session: ReasoningSession) {
  const lensDef = getLens(session.lens);
  const findings = lensDef.reasoner.run(model);
  let blast: SessionBlast | undefined;
  if (session.lens === 'architecture' && session.seeds.length > 0) {
    const projection = projectLens(model, lensDef);
    const result = simulate({ ...model, nodes: projection.nodes, edges: projection.edges }, session.seeds);
    blast = {
      failed: result.blastRadius.failed,
      degraded: result.blastRadius.degraded,
      affectedEntries: result.blastRadius.affectedEntries,
    };
  }
  return { findings, blast };
}

export function SessionsPanel({ model, sessions, activeId, onArchive, onOpen, onDelete, onClose }: SessionsPanelProps) {
  const active = sessions.find((s) => s.id === activeId) ?? null;
  const lensLabel = (id: ReasoningSession['lens']) => getLens(id).label;

  const diff = (() => {
    if (!active) return null;
    const now = currentOf(model, active);
    return diffSession(active, now);
  })();

  return (
    <aside className="dd-navpanel section-sessions">
      <div className="dd-navpanel-head">
        <div>
          <h2>会话</h2>
          <div className="dd-navpanel-sub">
            {sessions.length > 0 ? `${sessions.length} 个存档推演` : '还没有存档'} · 场景 + 当时的结论
          </div>
        </div>
        <button className="dd-icon-btn" onClick={onClose} aria-label="收起会话面板">
          <CloseIcon />
        </button>
      </div>

      <div className="dd-drawer-section">
        <button className="dd-primary dd-block" onClick={onArchive}>
          存档当前推演
        </button>
        <p className="dd-hint-text">
          存的是<b>场景</b>（谁失效）和<b>此刻的结论</b>，不是模型快照。以后模型改了，回来点开它，就能看出当时的判断今天还成不成立。
        </p>
      </div>

      {sessions.length === 0 ? (
        <div className="dd-sim-empty">
          <SessionsIcon size={26} />
          <p>先到「推演」里挑一个失效源，再回来存档——这样存下来的才是一次判断，而不是一张图。</p>
        </div>
      ) : (
        <div className="dd-entity-scroll">
          <ul className="dd-session-list">
            {sessions.map((s) => {
              const errs = s.findings.filter((f) => f.severity === 'error').length;
              const qs = s.findings.filter((f) => f.severity === 'question').length;
              return (
                <li key={s.id}>
                  <button
                    className={`dd-session-item${s.id === activeId ? ' active' : ''}`}
                    onClick={() => onOpen(s)}
                    aria-pressed={s.id === activeId}
                  >
                    <span className="dd-session-name">{s.name}</span>
                    <span className="dd-session-meta">
                      {lensLabel(s.lens)} · {formatTime(s.createdAt)}
                      {s.blast ? ` · 当时 ${s.blast.failed} 失效 / ${s.blast.degraded} 降级` : ''}
                      {errs > 0 ? ` · ${errs} 错误` : ''}
                      {qs > 0 ? ` · ${qs} 反问` : ''}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {active && diff && (
            <div className="dd-session-detail">
              <div className="dd-drawer-section-head">
                <h3>当时 → 现在</h3>
                <span className={`dd-drift ${driftTone(diff)}`}>{driftLabel(diff)}</span>
              </div>

              {diff.blast && active.blast ? (
                <div className="dd-metrics">
                  <Metric label="失效" value={active.blast.failed} delta={diff.blast.failed} />
                  <Metric label="降级" value={active.blast.degraded} delta={diff.blast.degraded} />
                  <Metric label="受影响入口" value={active.blast.affectedEntries.length} delta={diff.blast.entries} />
                </div>
              ) : (
                <div className="dd-metrics">
                  <Metric label="当时的发现" value={active.findings.length} delta={diff.added.length - diff.resolved.length} />
                  <Metric label="现在新增" value={diff.added.length} delta={null} />
                  <Metric label="已修掉" value={diff.resolved.length} delta={null} />
                </div>
              )}

              {diff.added.length > 0 && (
                <div className="dd-drift-list">
                  <div className="dd-drift-head">现在才顶的嘴</div>
                  {diff.added.slice(0, 6).map((f) => (
                    <div key={f.id} className={`dd-drift-row sev-${f.severity}`}>
                      {f.title}
                    </div>
                  ))}
                  {diff.added.length > 6 && <div className="dd-drift-more">还有 {diff.added.length - 6} 条</div>}
                </div>
              )}

              {diff.resolved.length > 0 && (
                <div className="dd-drift-list">
                  <div className="dd-drift-head">已经不再顶嘴</div>
                  {diff.resolved.slice(0, 6).map((f) => (
                    <div key={f.id} className="dd-drift-row resolved">
                      {f.title}
                    </div>
                  ))}
                </div>
              )}

              {diff.changed.length > 0 && (
                <div className="dd-drift-list">
                  <div className="dd-drift-head">严重度变了</div>
                  {diff.changed.slice(0, 6).map((c) => (
                    <div key={c.id} className="dd-drift-row">
                      {c.title}（{c.from} → {c.to}）
                    </div>
                  ))}
                </div>
              )}

              <div className="dd-session-actions">
                <button className="dd-primary" onClick={() => onOpen(active)}>
                  恢复这个场景
                </button>
                <button className="dd-icon-btn danger" onClick={() => onDelete(active.id)} aria-label={`删除 ${active.name}`}>
                  <TrashIcon />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

type Diff = NonNullable<ReturnType<typeof diffSession>>;

/** 结论变得更糟（多了错误 / 爆炸半径变大）还是变好。 */
function driftScore(d: Diff): number {
  const blast = d.blast ? Math.max(0, d.blast.failed) + Math.max(0, d.blast.degraded) : 0;
  return d.added.length + d.changed.length + blast;
}

function driftTone(d: Diff): string {
  if (driftScore(d) > 0) return 'worse';
  if (d.resolved.length > 0) return 'better';
  return 'same';
}

function driftLabel(d: Diff): string {
  const worse = driftScore(d);
  if (worse > 0) return `${worse} 处变差`;
  if (d.resolved.length > 0) return `${d.resolved.length} 处变好`;
  return '结论没变';
}