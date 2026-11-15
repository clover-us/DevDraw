/**
 * EntityDrawer —— 右侧「只读详情」抽屉。
 * 读 / 写分离：点击实体 / 关系只展示详情与推演入口；所有写操作收进右键
 * 「编辑…」弹窗（NodeEditor / EdgeEditor）。创建态仍留在抽屉（新建是独立流程）。
 * 保留：推演一下（模拟失效 / 追踪请求）、相关关系导航、模型顶嘴、back/forward。
 */
import { useEffect, useState, type ReactNode } from 'react';
import { categoryLabel, nodeComponent, nodeGlyph } from '../core/components';
import { EDGE_TYPES, NODE_TYPES, type LensDef } from '../core/registry';
import type { Finding, QuestionOption } from '../core/reasoners/types';
import { edgeDependency } from '../core/simulate';
import type { Model, ModelNode, NodeType } from '../core/types';
import { FieldView, Section, TableFieldsView } from './entity-fields';
import { Glyph } from './glyphs';
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, SimulationIcon, TraceIcon } from './icons';
import { FindingCard, MODE_INFO, nodeName } from './inspect';

interface Props {
  model: Model;
  lens: LensDef;
  findings: Finding[];
  selectedNode: string | null;
  selectedEdge: string | null;
  createMode: boolean;
  onCreate: (type: NodeType, name: string) => void;
  onSelectNode: (id: string | null) => void;
  onSelectEdge: (id: string | null) => void;
  onSelectFinding: (id: string | null) => void;
  onAnswer: (option: QuestionOption) => void;
  seeds: string[];
  onToggleSeed: (id: string) => void;
  onStartTrace: (id: string) => void;
  onClose: () => void;
  canBack?: boolean;
  canForward?: boolean;
  onBack?: () => void;
  onForward?: () => void;
}

const SIM_TYPES = new Set<NodeType>(['Service', 'Database', 'Queue', 'Endpoint', 'ExternalSystem', 'Actor']);
const APPEARANCE_TYPES = new Set<NodeType>(['Service', 'Database', 'Queue', 'Endpoint', 'ExternalSystem', 'Actor']);

export function EntityDrawer(props: Props) {
  const { model, lens, findings, selectedNode, selectedEdge, createMode } = props;
  const [createType, setCreateType] = useState<NodeType>(lens.nodeTypes[0] ?? 'Service');
  const [createName, setCreateName] = useState('');
  const nav = { canBack: props.canBack, canForward: props.canForward, onBack: props.onBack, onForward: props.onForward };

  // 换镜片时把创建态重置到该镜片的首个可建类型（架构=服务 / ER=表 / 状态机=状态）。
  useEffect(() => {
    setCreateType(lens.nodeTypes[0] ?? 'Service');
    setCreateName('');
  }, [lens.id, lens.nodeTypes]);

  // ---- 创建态（新建是独立流程，保留在抽屉） ----
  if (createMode) {
    const types = lens.nodeTypes;
    return (
      <DrawerShell title="新建实体" sub={lens.label} onClose={props.onClose} {...nav}>
        <Section title="类型">
          <select className="dd-input" value={createType} onChange={(e) => setCreateType(e.target.value as NodeType)}>
            {types.map((t) => (
              <option key={t} value={t}>
                {NODE_TYPES[t].label}
              </option>
            ))}
          </select>
        </Section>
        <Section title="名称">
          <input
            className="dd-input"
            autoFocus
            value={createName}
            placeholder="给它起个名字"
            onChange={(e) => setCreateName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && createName.trim()) props.onCreate(createType, createName.trim());
            }}
          />
        </Section>
        <button
          className="dd-primary dd-block"
          disabled={!createName.trim()}
          onClick={() => props.onCreate(createType, createName.trim())}
        >
          创建
        </button>
      </DrawerShell>
    );
  }

  // ---- 关系：只读详情 ----
  if (selectedEdge) {
    const edge = model.edges[selectedEdge];
    if (!edge) return null;
    const mode = edgeDependency(edge);
    const isRequestEdge = ['calls', 'reads', 'writes', 'publishes', 'subscribes'].includes(edge.type);
    return (
      <DrawerShell
        title="关系"
        sub={`${EDGE_TYPES[edge.type].label} · ${nodeName(model, edge.from)} → ${nodeName(model, edge.to)}`}
        onClose={props.onClose}
        {...nav}
      >
        <Section title="标签">
          <p className="dd-readonly-value">{edge.label || EDGE_TYPES[edge.type].label}</p>
        </Section>
        {lens.id === 'architecture' && isRequestEdge && (
          <Section title="依赖模式">
            <p className="dd-readonly-value">{MODE_INFO[mode].label}</p>
            <p className="dd-hint-text">{MODE_INFO[mode].desc}</p>
            {mode === 'soft' && typeof edge.attrs?.fallback === 'string' && edge.attrs.fallback && (
              <p className="dd-hint-text">兜底：{edge.attrs.fallback}</p>
            )}
          </Section>
        )}
        {lens.id === 'er' && edge.type === 'fk' && (
          <Section title="外键">
            <dl className="dd-comp-meta">
              <div>
                <dt>基数</dt>
                <dd>{typeof edge.attrs?.cardinality === 'string' ? edge.attrs.cardinality : '1:N'}</dd>
              </div>
              <div>
                <dt>外键列</dt>
                <dd>{typeof edge.attrs?.key === 'string' && edge.attrs.key ? edge.attrs.key : '—'}</dd>
              </div>
            </dl>
          </Section>
        )}
        {lens.id === 'state-machine' && edge.type === 'transition' && (
          <Section title="状态迁移">
            <dl className="dd-comp-meta">
              <div>
                <dt>触发事件</dt>
                <dd>{typeof edge.attrs?.event === 'string' && edge.attrs.event ? edge.attrs.event : '—'}</dd>
              </div>
              <div>
                <dt>由谁触发</dt>
                <dd>{typeof edge.attrs?.effectedBy === 'string' && edge.attrs.effectedBy ? edge.attrs.effectedBy : '—'}</dd>
              </div>
              <div>
                <dt>人工操作</dt>
                <dd>{edge.attrs?.manual === true ? '是' : '否'}</dd>
              </div>
            </dl>
          </Section>
        )}
        <p className="dd-hint-text">右键这条关系可以编辑。</p>
      </DrawerShell>
    );
  }

  // ---- 实体：只读详情 ----
  if (selectedNode) {
    const node = model.nodes[selectedNode];
    if (!node) return null;
    const id = selectedNode;
    const incident = Object.entries(model.edges).filter(([, e]) => e.from === id || e.to === id);
    const relatedFindings = findings.filter((f) => f.nodeIds?.includes(id) || f.edgeIds?.some((eid) => incident.some(([iid]) => iid === eid)));
    const isSeed = props.seeds.includes(id);

    return (
      <DrawerShell title={node.name} sub={NODE_TYPES[node.type].label} onClose={props.onClose} {...nav}>
        {lens.id === 'architecture' && SIM_TYPES.has(node.type) && (
          <Section title="推演一下">
            <div className="dd-drawer-reason">
              <button className={`dd-reason-btn${isSeed ? ' on' : ''}`} onClick={() => props.onToggleSeed(id)}>
                <SimulationIcon size={15} />
                {isSeed ? '已设为失效源' : '模拟失效'}
              </button>
              {(node.type === 'Actor' || node.type === 'Endpoint') && (
                <button className="dd-reason-btn" onClick={() => props.onStartTrace(id)}>
                  <TraceIcon size={15} />
                  追踪请求
                </button>
              )}
            </div>
            <p className="dd-hint-text">思考是建模的质检：点死它，看模型哪里会顶嘴。</p>
          </Section>
        )}

        {APPEARANCE_TYPES.has(node.type) && <ComponentDetails model={model} node={node} />}

        {(node.type === 'Table' || (node.type === 'RedisKey' && node.attrs?.structure === 'hash')) && (
          <TableFieldsView model={model} tableId={id} onSelectField={props.onSelectNode} />
        )}
        {node.type === 'Field' && <FieldView model={model} fieldId={id} onSelectNode={props.onSelectNode} />}
        {node.type === 'State' && (
          <Section title="状态">
            <p className="dd-readonly-value">{node.attrs?.initial === true ? '状态机的起点' : '普通状态'}</p>
          </Section>
        )}
        {(node.type === 'Decision' || node.type === 'Assumption' || node.type === 'Note') && (
          <Section title="内容">
            <p className="dd-readonly-value dd-readonly-pre">
              {typeof node.attrs?.detail === 'string' && node.attrs.detail ? node.attrs.detail : '（暂无内容）'}
            </p>
            {typeof node.attrs?.about === 'string' && model.nodes[node.attrs.about] && (
              <p className="dd-hint-text">
                关于：
                <button className="dd-inline-link" onClick={() => props.onSelectNode(node.attrs!.about as string)}>
                  {nodeName(model, node.attrs.about as string)}
                </button>
              </p>
            )}
          </Section>
        )}

        <Section title={`相关关系（${incident.length}）`}>
          <ul className="dd-field-list">
            {incident.map(([eid, e]) => (
              <li key={eid}>
                <button className="dd-field-item" onClick={() => props.onSelectEdge(eid)}>
                  <span className="dd-field-name">
                    {e.from === id ? '→ ' : '← '}
                    {nodeName(model, e.from === id ? e.to : e.from)}
                  </span>
                  <span className="dd-field-type">{EDGE_TYPES[e.type].label}</span>
                </button>
              </li>
            ))}
            {incident.length === 0 && <li className="dd-empty">还没有连线。右键实体可编辑、添加连线。</li>}
          </ul>
        </Section>

        {relatedFindings.length > 0 && (
          <Section title={`模型顶嘴（${relatedFindings.length}）`}>
            <ul className="dd-finding-list">
              {relatedFindings.map((f) => (
                <FindingCard key={f.id} finding={f} active={false} onSelect={() => props.onSelectFinding(f.id)} onAnswer={props.onAnswer} />
              ))}
            </ul>
          </Section>
        )}
        <p className="dd-hint-text">右键这个实体可以编辑详情与外观。</p>
      </DrawerShell>
    );
  }

  return null;
}

function DrawerShell({
  title,
  sub,
  onClose,
  children,
  canBack,
  canForward,
  onBack,
  onForward,
}: {
  title: string;
  sub: string;
  onClose: () => void;
  children: ReactNode;
  canBack?: boolean;
  canForward?: boolean;
  onBack?: () => void;
  onForward?: () => void;
}) {
  return (
    <aside className="dd-drawer">
      <div className="dd-drawer-head">
        <div className="dd-drawer-nav">
          <button className="dd-icon-btn" onClick={onBack} disabled={!canBack} title="返回（Alt+←）" aria-label="返回">
            <ChevronLeftIcon size={16} />
          </button>
          <button className="dd-icon-btn" onClick={onForward} disabled={!canForward} title="前进（Alt+→）" aria-label="前进">
            <ChevronRightIcon size={16} />
          </button>
        </div>
        <div className="dd-drawer-titles">
          <h2>{title}</h2>
          <span className="dd-drawer-sub">{sub}</span>
        </div>
        <button className="dd-icon-btn" onClick={onClose} title="关闭（Esc）" aria-label="关闭">
          <CloseIcon size={18} />
        </button>
      </div>
      <div className="dd-drawer-body">{children}</div>
    </aside>
  );
}

/** 只读：组件身份 / 图标 / 分类。编辑入口在右键「编辑…」弹窗的外观 tab。 */
function ComponentDetails({ model, node }: { model: Model; node: ModelNode }) {
  const comp = nodeComponent(model, node);
  return (
    <Section title="组件详情">
      <div className="dd-comp-preview">
        <span className="dd-comp-glyph">
          <Glyph id={nodeGlyph(model, node)} size={22} />
        </span>
        <div className="dd-comp-preview-text">
          <strong>{node.name}</strong>
          <span>{comp ? comp.name : NODE_TYPES[node.type].label}</span>
        </div>
      </div>
      <dl className="dd-comp-meta">
        <div>
          <dt>语义底座</dt>
          <dd>{NODE_TYPES[node.type].label}</dd>
        </div>
        <div>
          <dt>组件身份</dt>
          <dd>{comp ? comp.name : '按类型默认'}</dd>
        </div>
        <div>
          <dt>分类</dt>
          <dd>{comp ? categoryLabel(comp.category) : '—'}</dd>
        </div>
      </dl>
      <p className="dd-hint-text">右键「编辑…」→ 外观，可换组件身份与图标。</p>
    </Section>
  );
}
