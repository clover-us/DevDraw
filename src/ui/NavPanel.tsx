/**
 * NavPanel —— 左侧导航展开面板（默认随导航收起而隐藏）。
 * 实体模式：按类型分组的实体浏览器（搜索 + 新建），点实体 → 右侧抽屉。
 * 发现模式："模型顶嘴"列表（推演器发现 + 交互式反问），灵魂所在。
 */
import { useMemo, useState } from 'react';
import type { Finding, QuestionOption } from '../core/reasoners/types';
import { NODE_TYPES, type LensDef, type Projection } from '../core/registry';
import type { Model } from '../core/types';
import { FindingCard } from './inspect';
import { CloseIcon, PlusIcon, SearchIcon } from './icons';

interface NavPanelProps {
  section: 'entities' | 'findings';
  lens: LensDef;
  model: Model;
  projection: Projection;
  findings: Finding[];
  activeFinding: string | null;
  selectedNode: string | null;
  onSelectFinding: (id: string | null) => void;
  onAnswer: (option: QuestionOption) => void;
  onSelectNode: (id: string) => void;
  onCreate: () => void;
  onClose: () => void;
}

const TYPE_ORDER = Object.keys(NODE_TYPES) as Array<keyof typeof NODE_TYPES>;

function fieldCount(model: Model, tableId: string): number {
  return Object.values(model.edges).filter(
    (e) => e.type === 'contains' && e.from === tableId && model.nodes[e.to]?.type === 'Field',
  ).length;
}

export function NavPanel({
  section,
  lens,
  model,
  projection,
  findings,
  activeFinding,
  selectedNode,
  onSelectFinding,
  onAnswer,
  onSelectNode,
  onCreate,
  onClose,
}: NavPanelProps) {
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byType = new Map<string, Array<[string, string]>>();
    for (const [id, n] of Object.entries(projection.nodes)) {
      if (q && !n.name.toLowerCase().includes(q) && !id.toLowerCase().includes(q)) continue;
      const list = byType.get(n.type) ?? [];
      list.push([id, n.name]);
      byType.set(n.type, list);
    }
    return TYPE_ORDER.filter((t) => byType.has(t)).map((t) => ({ type: t, items: byType.get(t)! }));
  }, [projection, query]);

  const total = Object.keys(projection.nodes).length;
  const errorCount = findings.filter((f) => f.severity === 'error').length;
  const questionCount = findings.filter((f) => f.severity === 'question').length;

  return (
    <aside className={`dd-navpanel section-${section}`} aria-label={section === 'entities' ? '实体浏览' : '模型发现'}>
      {section === 'entities' ? (
        <>
          <div className="dd-navpanel-head">
            <div>
              <h2>{lens.label} · 实体</h2>
              <span className="dd-navpanel-sub">{total} 个实体 · 点击查看详情</span>
            </div>
            <button className="dd-icon-btn" onClick={onClose} title="收起面板" aria-label="收起面板">
              <CloseIcon size={16} />
            </button>
          </div>

          <button className="dd-create-btn" onClick={onCreate}>
            <PlusIcon size={16} /> 新建实体
          </button>

          <div className="dd-search">
            <SearchIcon size={15} />
            <input
              placeholder="搜索实体…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="搜索实体"
            />
          </div>

          <div className="dd-entity-scroll">
            {groups.length === 0 && <p className="dd-empty">没有匹配的实体。</p>}
            {groups.map((g) => (
              <div key={g.type} className="dd-entity-group">
                <div className="dd-entity-group-head">
                  <span className={`dd-kind-dot kind-${g.type.toLowerCase()}`} />
                  {NODE_TYPES[g.type].label}
                  <span className="dd-entity-group-count">{g.items.length}</span>
                </div>
                {g.items.map(([id, name]) => (
                  <button
                    key={id}
                    className={`dd-entity-row${selectedNode === id ? ' selected' : ''}`}
                    onClick={() => onSelectNode(id)}
                  >
                    <span className="dd-entity-name">{name}</span>
                    {model.nodes[id]?.type === 'Table' && (
                      <span className="dd-entity-meta">{fieldCount(model, id)} 列</span>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="dd-navpanel-head">
            <div>
              <h2>模型顶嘴</h2>
              <span className="dd-navpanel-sub">
                {lens.label}镜片 · {lens.reasoner.label}
              </span>
            </div>
            <button className="dd-icon-btn" onClick={onClose} title="收起面板" aria-label="收起面板">
              <CloseIcon size={16} />
            </button>
          </div>

          <div className="dd-finding-counts dd-navpanel-counts">
            {errorCount > 0 && <span className="dd-count sev-error">{errorCount} 错</span>}
            {questionCount > 0 && <span className="dd-count sev-question">{questionCount} 问</span>}
            {errorCount === 0 && questionCount === 0 && <span className="dd-count sev-ok">没有待处理问题</span>}
          </div>

          <p className="dd-navpanel-desc">{lens.description}</p>

          <div className="dd-entity-scroll">
            {findings.length === 0 && <p className="dd-empty">这副镜片下模型没有发现问题。</p>}
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
          </div>
        </>
      )}
    </aside>
  );
}
