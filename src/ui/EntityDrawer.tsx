/**
 * EntityDrawer —— 右侧抽屉：选中实体/边 → 详情 + 相关内容 + 上下文建模。
 * 取代旧"建模"表单：建模发生在语境里（选表加字段、选节点连线、选边改模式），
 * 新建实体走独立创建态。所有变更经 applyPatchChecked / applyPatchesChecked 守门。
 */
import { useEffect, useState, type ReactNode } from 'react';
import { componentCatalog, nodeComponent, nodeGlyph } from '../core/components';
import { newEdgeId, newNodeId } from '../core/id';
import { applyPatchChecked, applyPatchesChecked } from '../core/patch';
import { columnImpact } from '../core/reasoners/er';
import type { Finding, QuestionOption } from '../core/reasoners/types';
import { EDGE_TYPES, NODE_TYPES, type LensDef, type Projection } from '../core/registry';
import { edgeDependency, type SimulationResult } from '../core/simulate';
import type { ComponentDef, DependencyMode, EdgeType, Model, ModelNode, NodeType } from '../core/types';
import { GLYPH_LIST, Glyph } from './glyphs';
import { FindingCard, MODE_INFO, MODES, nodeName } from './inspect';
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon, LinkIcon, PlusIcon, SimulationIcon, TraceIcon, TrashIcon } from './icons';

interface EntityDrawerProps {
  model: Model;
  lens: LensDef;
  projection: Projection;
  selectedNode: string | null;
  selectedEdge: string | null;
  createMode: boolean;
  findings: Finding[];
  activeFinding: string | null;
  result: SimulationResult | null;
  onSelectNode: (id: string | null) => void;
  onSelectEdge: (id: string | null) => void;
  onSelectFinding: (id: string | null) => void;
  onAnswer: (option: QuestionOption) => void;
  onChange: (next: Model) => void;
  onChangeMode: (edgeId: string, mode: DependencyMode) => void;
  /** 当前失效源（架构镜片）：让抽屉里的「模拟失效」按钮显示选中态。 */
  seeds: string[];
  /** 推演入口可见化：不再只藏右键，选中节点就能直接模拟失效 / 追踪请求。 */
  onToggleSeed: (id: string) => void;
  onStartTrace: (id: string) => void;
  /** 抽屉钻取历史（浏览器式 back/forward）：从节点→相关边→另一端层层深入后能原路返回。 */
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onClose: () => void;
}

const NODE_TYPE_LIST = Object.values(NODE_TYPES);
const EDGE_TYPE_LIST = Object.values(EDGE_TYPES);

/** 这些架构实体可在抽屉里换组件身份 / 图标（语义底座不变）。 */
const APPEARANCE_TYPES = new Set<NodeType>(['Service', 'Database', 'Queue', 'Endpoint', 'ExternalSystem', 'Actor']);

/** 可作失效源的架构实体（与 App 的 SEEDABLE 一致）：抽屉里给它们可见的推演入口。 */
const SIM_TYPES = new Set<NodeType>(['Service', 'Database', 'Queue', 'Endpoint', 'ExternalSystem', 'Actor']);

function fieldsOf(model: Model, tableId: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const e of Object.values(model.edges)) {
    if (e.type === 'contains' && e.from === tableId && model.nodes[e.to]?.type === 'Field') out.push([e.to, model.nodes[e.to].name]);
  }
  return out;
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="dd-drawer-section">
      <div className="dd-drawer-section-head">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EntityDrawer(props: EntityDrawerProps) {
  const { model, lens, projection, selectedNode, selectedEdge, createMode, findings, activeFinding, result } = props;
  // 钻取历史按钮：三种视图（创建/边/实体）共用，从任何一层都能原路返回。
  const nav = { canBack: props.canBack, canForward: props.canForward, onBack: props.onBack, onForward: props.onForward };
  const [error, setError] = useState<string | null>(null);
  const [createType, setCreateType] = useState<NodeType>(lens.nodeTypes[0] ?? 'Service');
  const [createName, setCreateName] = useState('');
  const [connectTarget, setConnectTarget] = useState('');
  const [connectType, setConnectType] = useState<EdgeType>('calls');
  const [fieldName, setFieldName] = useState('');
  const [fieldType, setFieldType] = useState('varchar');
  // 删除是破坏性操作（删节点还会级联删边）——两步确认：先点一下「上膛」，3 秒内再点才真删。
  // 与 header「重置示例」同一套心智，不弹模态打断心流。
  const [deleteArmed, setDeleteArmed] = useState(false);
  useEffect(() => {
    if (!deleteArmed) return;
    const t = window.setTimeout(() => setDeleteArmed(false), 3000);
    return () => window.clearTimeout(t);
  }, [deleteArmed]);

  // 选择切换时重置表单与错误。
  useEffect(() => {
    setError(null);
    setConnectTarget('');
    setFieldName('');
    setFieldType('varchar');
    setCreateName('');
    setDeleteArmed(false);
    setCreateType(lens.nodeTypes[0] ?? 'Service');
    setConnectType(lens.id === 'er' ? 'fk' : lens.id === 'state-machine' ? 'transition' : 'calls');
  }, [selectedNode, selectedEdge, createMode, lens]);

  const node = selectedNode ? model.nodes[selectedNode] : null;
  const edge = selectedEdge ? model.edges[selectedEdge] : null;
  if (!createMode && !node && !edge) return null;

  const tryChange = (fn: () => Model) => {
    try {
      props.onChange(fn());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const updateNode = (id: string, attrs: Record<string, string | number | boolean>) =>
    tryChange(() => applyPatchChecked(model, { op: 'update-node', id, attrs }));
  const renameNode = (id: string, name: string) =>
    tryChange(() => applyPatchChecked(model, { op: 'update-node', id, name }));
  const updateEdge = (id: string, attrs: Record<string, string | number | boolean>) =>
    tryChange(() => applyPatchChecked(model, { op: 'update-edge', id, attrs }));

  const allowedNodeTypes = NODE_TYPE_LIST.filter((t) => lens.nodeTypes.includes(t.id));
  const allowedEdgeTypes = EDGE_TYPE_LIST.filter((t) => t.lenses.includes(lens.id));
  const services = Object.entries(model.nodes).filter(([, n]) => n.type === 'Service');

  /* ---------- 创建态 ---------- */
  if (createMode) {
    const create = () => {
      const name = createName.trim() || `新${NODE_TYPES[createType].label}`;
      const id = newNodeId(createType);
      tryChange(() => applyPatchChecked(model, { op: 'add-node', id, node: { type: createType, name, provenance: { by: 'human' } } }));
      props.onSelectNode(id);
    };
    return (
      <DrawerShell title="新建实体" subtitle={`${lens.label}镜片`} onClose={props.onClose} {...nav}>
        <Section title="类型与名称">
          <label className="dd-field-label">实体类型</label>
          <select className="dd-input" value={createType} onChange={(e) => setCreateType(e.target.value as NodeType)}>
            {allowedNodeTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}（{t.id}）
              </option>
            ))}
          </select>
          <label className="dd-field-label">名称</label>
          <input
            className="dd-input"
            autoFocus
            placeholder="名称可重复，id 自动唯一"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
          />
          <button className="dd-primary dd-block" onClick={create}>
            <PlusIcon size={16} /> 创建实体
          </button>
          <p className="dd-hint-text">创建后自动选中，可在此继续添加字段 / 连线。也可在画布上从节点圆点拖出连线。</p>
        </Section>
        {error && <p className="dd-model-error">{error}</p>}
      </DrawerShell>
    );
  }

  /* ---------- 边详情 ---------- */
  if (edge && selectedEdge) {
    const isDependency = ['calls', 'reads', 'writes', 'publishes', 'subscribes', 'depends-on'].includes(edge.type);
    const removeEdge = () => {
      tryChange(() => applyPatchChecked(model, { op: 'remove-edge', id: selectedEdge }));
      props.onSelectEdge(null);
    };
    return (
      <DrawerShell
        title="关系详情"
        subtitle={`${nodeName(model, edge.from)} → ${nodeName(model, edge.to)}`}
        onClose={props.onClose}
        {...nav}
      >
        <Section title={`${EDGE_TYPES[edge.type].label}（${edge.type}）`}>
          <div className="dd-edge-endpoints">
            <button className="dd-endpoint" onClick={() => props.onSelectNode(edge.from)}>
              {nodeName(model, edge.from)}
            </button>
            <ArrowRightIcon size={16} />
            <button className="dd-endpoint" onClick={() => props.onSelectNode(edge.to)}>
              {nodeName(model, edge.to)}
            </button>
          </div>
          <label className="dd-field-label">标签</label>
          <input
            className="dd-input"
            placeholder="可选标签"
            value={edge.label ?? ''}
            onChange={(e) => tryChange(() => applyPatchChecked(model, { op: 'update-edge', id: selectedEdge, attrs: {}, label: e.target.value }))}
          />
        </Section>

        {isDependency && (
          <Section title="依赖模式">
            {MODES.map((mode) => (
              <label key={mode} className={`dd-mode-option${edgeDependency(edge) === mode ? ' active' : ''}`}>
                <input
                  type="radio"
                  name={`dep-${selectedEdge}`}
                  checked={edgeDependency(edge) === mode}
                  onChange={() => props.onChangeMode(selectedEdge, mode)}
                />
                <span>
                  <strong>{MODE_INFO[mode].label}</strong>
                  <br />
                  <span className="dd-muted">{MODE_INFO[mode].desc}</span>
                </span>
              </label>
            ))}
            {edgeDependency(edge) === 'soft' && (
              <>
                <label className="dd-field-label">兜底说明（为何能降级）</label>
                <input
                  className="dd-input"
                  placeholder="如：事后人工审核 / outbox 重试"
                  value={edge.attrs?.fallback ?? ''}
                  onChange={(e) => updateEdge(selectedEdge, { fallback: e.target.value })}
                />
              </>
            )}
            {result && <p className="dd-hint-text">改动立即重演，并与首次改动前的基线对比（见画布推演面板）。</p>}
          </Section>
        )}

        {edge.type === 'fk' && (
          <Section title="外键基数">
            <label className="dd-field-label">基数</label>
            <select
              className="dd-input"
              value={edge.attrs?.cardinality ?? '1:N'}
              onChange={(e) => updateEdge(selectedEdge, { cardinality: e.target.value })}
            >
              <option value="1:1">1:1（一对一）</option>
              <option value="1:N">1:N（一对多）</option>
              <option value="N:M">N:M（多对多，需中间表）</option>
            </select>
            <label className="dd-field-label">外键列（落在"多"方表）</label>
            <input
              className="dd-input"
              placeholder="如 order_id"
              value={edge.attrs?.key ?? ''}
              onChange={(e) => updateEdge(selectedEdge, { key: e.target.value })}
            />
          </Section>
        )}

        {edge.type === 'transition' && (
          <Section title="迁移属性">
            <label className="dd-field-label">触发事件</label>
            <input
              className="dd-input"
              placeholder="如 pay / fulfill"
              value={edge.attrs?.event ?? ''}
              onChange={(e) => updateEdge(selectedEdge, { event: e.target.value })}
            />
            <label className="dd-field-label">实现服务（跨镜片引用）</label>
            <select
              className="dd-input"
              value={edge.attrs?.effectedBy ?? ''}
              onChange={(e) => updateEdge(selectedEdge, { effectedBy: e.target.value })}
            >
              <option value="">（未指定）</option>
              {services.map(([id, n]) => (
                <option key={id} value={id}>
                  {n.name}
                </option>
              ))}
            </select>
            <label className="dd-toggle">
              <input
                type="checkbox"
                checked={edge.attrs?.manual === true}
                onChange={(e) => updateEdge(selectedEdge, { manual: e.target.checked })}
              />
              人工迁移（无服务实现，推演跳过缺口检查）
            </label>
          </Section>
        )}

        <button
          className={`dd-danger dd-block${deleteArmed ? ' armed' : ''}`}
          onClick={() => (deleteArmed ? removeEdge() : setDeleteArmed(true))}
        >
          <TrashIcon size={16} /> {deleteArmed ? '确认删除？再点一次' : '删除关系'}
        </button>
        {error && <p className="dd-model-error">{error}</p>}
      </DrawerShell>
    );
  }

  /* ---------- 实体详情 ---------- */
  if (node && selectedNode) {
    const id = selectedNode;
    const incident = Object.entries(model.edges).filter(([, e]) => e.from === id || e.to === id);
    const relatedFindings = findings.filter((f) => f.nodeIds?.includes(id));
    const removeNode = () => {
      tryChange(() => applyPatchChecked(model, { op: 'remove-node', id }));
      props.onSelectNode(null);
    };
    const addConnection = () => {
      if (!connectTarget || connectTarget === id) {
        setError('请选择一个不同的终点');
        return;
      }
      const eid = newEdgeId(connectType);
      const attrs = connectType === 'fk' ? { cardinality: '1:N' as const } : undefined;
      tryChange(() => applyPatchChecked(model, { op: 'add-edge', id: eid, edge: { type: connectType, from: id, to: connectTarget, attrs } }));
      props.onSelectEdge(eid);
    };

    return (
      <DrawerShell title={node.name} subtitle={NODE_TYPES[node.type].label} onClose={props.onClose} {...nav}>
        <Section title="名称">
          <input className="dd-input" value={node.name} onChange={(e) => renameNode(id, e.target.value)} />
        </Section>

        {lens.id === 'architecture' && SIM_TYPES.has(node.type) && (
          <Section title="推演一下">
            <div className="dd-drawer-reason">
              <button
                className={`dd-reason-btn${props.seeds.includes(id) ? ' on' : ''}`}
                onClick={() => props.onToggleSeed(id)}
                title="把它设为失效源，看谁跟着挂"
              >
                <SimulationIcon size={14} />
                {props.seeds.includes(id) ? '已设为失效源' : '模拟失效'}
              </button>
              {(node.type === 'Actor' || node.type === 'Endpoint') && (
                <button className="dd-reason-btn" onClick={() => props.onStartTrace(id)} title="从它出发，一步步走一遍请求">
                  <TraceIcon size={14} />
                  追踪请求
                </button>
              )}
            </div>
            <p className="dd-hint-text">思考是建模的质检：点死它看爆炸半径，或走一遍请求看分支与延迟。</p>
          </Section>
        )}

        {APPEARANCE_TYPES.has(node.type) && (
          <ComponentAppearance model={model} node={node} nodeId={id} updateNode={updateNode} />
        )}

        {node.type === 'Table' && (
          <TableFields
            model={model}
            tableId={id}
            fieldName={fieldName}
            fieldType={fieldType}
            setFieldName={setFieldName}
            setFieldType={setFieldType}
            onSelectField={props.onSelectNode}
            onAdd={() => {
              const name = fieldName.trim() || 'new_field';
              const fid = newNodeId('Field');
              const eid = newEdgeId('contains');
              tryChange(() =>
                applyPatchesChecked(model, [
                  { op: 'add-node', id: fid, node: { type: 'Field', name, attrs: { dataType: fieldType || 'varchar' }, provenance: { by: 'human' } } },
                  { op: 'add-edge', id: eid, edge: { type: 'contains', from: id, to: fid } },
                ]),
              );
              setFieldName('');
              props.onSelectNode(fid);
            }}
          />
        )}

        {node.type === 'Field' && (
          <FieldEditor model={model} fieldId={id} onSelectNode={props.onSelectNode} updateNode={updateNode} />
        )}

        {node.type === 'State' && (
          <Section title="状态属性">
            <label className="dd-toggle">
              <input
                type="checkbox"
                checked={node.attrs?.initial === true}
                onChange={(e) => updateNode(id, { initial: e.target.checked })}
              />
              初始状态（生命周期入口）
            </label>
          </Section>
        )}

        {(node.type === 'Decision' || node.type === 'Assumption' || node.type === 'Note') && (
          <Section title="内容">
            <textarea
              className="dd-input dd-textarea"
              placeholder="写下这条决策 / 假设 / 笔记的详情…"
              value={typeof node.attrs?.detail === 'string' ? node.attrs.detail : ''}
              onChange={(e) => updateNode(id, { detail: e.target.value })}
            />
            {typeof node.attrs?.about === 'string' && (
              <p className="dd-hint-text">
                关联：
                <button className="dd-inline-link" onClick={() => props.onSelectNode(node.attrs!.about as string)}>
                  {nodeName(model, node.attrs!.about as string)}
                </button>
              </p>
            )}
          </Section>
        )}

        <Section
          title="添加连线"
          action={<LinkIcon size={15} />}
        >
          <div className="dd-connect-row">
            <select className="dd-input" value={connectType} onChange={(e) => setConnectType(e.target.value as EdgeType)}>
              {allowedEdgeTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <ArrowRightIcon size={16} />
            <NodePicker
              model={model}
              nodes={Object.entries(projection.nodes).filter(([nid]) => nid !== id)}
              value={connectTarget}
              onChange={setConnectTarget}
              placeholder="搜索终点实体…"
            />
          </div>
          <button className="dd-block" onClick={addConnection}>
            <PlusIcon size={16} /> 连接
          </button>
        </Section>

        {incident.length > 0 && (
          <Section title={`相关关系（${incident.length}）`}>
            <ul className="dd-relation-list">
              {incident.map(([eid, e]) => {
                const outgoing = e.from === id;
                const other = outgoing ? e.to : e.from;
                return (
                  <li key={eid}>
                    <button className="dd-relation" onClick={() => props.onSelectEdge(eid)}>
                      <span className={`dd-relation-dir${outgoing ? ' out' : ' in'}`}>{outgoing ? '→' : '←'}</span>
                      <span className="dd-relation-name">{nodeName(model, other)}</span>
                      <span className="dd-relation-type">{EDGE_TYPES[e.type].label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        {relatedFindings.length > 0 && (
          <Section title={`模型对此实体的顶嘴（${relatedFindings.length}）`}>
            <ul className="dd-finding-list">
              {relatedFindings.map((f) => (
                <FindingCard
                  key={f.id}
                  finding={f}
                  active={activeFinding === f.id}
                  onSelect={() => props.onSelectFinding(activeFinding === f.id ? null : f.id)}
                  onAnswer={props.onAnswer}
                />
              ))}
            </ul>
          </Section>
        )}

        <button
          className={`dd-danger dd-block${deleteArmed ? ' armed' : ''}`}
          onClick={() => (deleteArmed ? removeNode() : setDeleteArmed(true))}
        >
          <TrashIcon size={16} /> {deleteArmed ? '确认删除？连同连线一起，再点一次' : '删除实体'}
        </button>
        {error && <p className="dd-model-error">{error}</p>}
      </DrawerShell>
    );
  }

  return null;
}

function DrawerShell({
  title,
  subtitle,
  onClose,
  canBack,
  canForward,
  onBack,
  onForward,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  canBack?: boolean;
  canForward?: boolean;
  onBack?: () => void;
  onForward?: () => void;
  children: ReactNode;
}) {
  return (
    <aside className="dd-drawer" aria-label="实体详情抽屉">
      <div className="dd-drawer-head">
        {(onBack || onForward) && (
          <div className="dd-drawer-nav" role="group" aria-label="抽屉导航">
            <button className="dd-icon-btn" onClick={onBack} disabled={!canBack} title="返回上一个（Alt+←）" aria-label="返回上一个">
              <ChevronLeftIcon size={16} />
            </button>
            <button className="dd-icon-btn" onClick={onForward} disabled={!canForward} title="前进（Alt+→）" aria-label="前进">
              <ChevronRightIcon size={16} />
            </button>
          </div>
        )}
        <div className="dd-drawer-titles">
          <h2>{title}</h2>
          <span className="dd-drawer-sub">{subtitle}</span>
        </div>
        <button className="dd-icon-btn" onClick={onClose} title="关闭抽屉（Esc）" aria-label="关闭抽屉">
          <CloseIcon size={16} />
        </button>
      </div>
      <div className="dd-drawer-body">{children}</div>
    </aside>
  );
}

/**
 * 可搜索的终点选择器：取代扁平 <select>。实体一多，纯名字下拉既难找又可能重名歧义；
 * 这里带类型图标 + 类型标签 + 即时过滤，选中前就能确认「连到的是哪一个」。
 */
function NodePicker({
  model,
  nodes,
  value,
  onChange,
  placeholder,
}: {
  model: Model;
  nodes: Array<[string, ModelNode]>;
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selectedName = value ? model.nodes[value]?.name ?? '' : '';
  const q = query.trim().toLowerCase();
  const matches = q ? nodes.filter(([, n]) => n.name.toLowerCase().includes(q)) : nodes;
  return (
    <div className="dd-nodepicker">
      <input
        className="dd-input"
        placeholder={placeholder}
        value={open ? query : selectedName}
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        onChange={(e) => {
          setOpen(true);
          setQuery(e.target.value);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        role="combobox"
        aria-expanded={open}
        aria-label={placeholder}
      />
      {open && (
        <div className="dd-nodepicker-list" role="listbox">
          {matches.length === 0 && <div className="dd-nodepicker-empty">没有匹配的实体</div>}
          {matches.map(([nid, n]) => (
            <button
              key={nid}
              type="button"
              role="option"
              aria-selected={nid === value}
              className={`dd-nodepicker-item${nid === value ? ' selected' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(nid);
                setOpen(false);
                setQuery('');
              }}
            >
              <Glyph id={nodeGlyph(model, n)} size={16} />
              <span className="dd-nodepicker-name">{n.name}</span>
              <span className="dd-nodepicker-type">{NODE_TYPES[n.type].label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TableFields({
  model,
  tableId,
  fieldName,
  fieldType,
  setFieldName,
  setFieldType,
  onSelectField,
  onAdd,
}: {
  model: Model;
  tableId: string;
  fieldName: string;
  fieldType: string;
  setFieldName: (v: string) => void;
  setFieldType: (v: string) => void;
  onSelectField: (id: string) => void;
  onAdd: () => void;
}) {
  const fields = fieldsOf(model, tableId);
  return (
    <Section title={`字段（${fields.length}）`}>
      <ul className="dd-field-list">
        {fields.map(([fid, name]) => {
          const f = model.nodes[fid];
          return (
            <li key={fid}>
              <button className="dd-field-item" onClick={() => onSelectField(fid)}>
                {typeof f.attrs?.key === 'string' && (
                  <span className={`dd-key dd-key-${f.attrs.key.toLowerCase()}`}>{f.attrs.key}</span>
                )}
                <span className="dd-field-name">{name}</span>
                <span className="dd-field-type">{typeof f.attrs?.dataType === 'string' ? f.attrs.dataType : ''}</span>
                {f.attrs?.nullable === true && <span className="dd-nullable" title="可空">?</span>}
              </button>
            </li>
          );
        })}
        {fields.length === 0 && <li className="dd-empty">还没有字段。</li>}
      </ul>
      <div className="dd-connect-row">
        <input
          className="dd-input"
          placeholder="字段名"
          value={fieldName}
          onChange={(e) => setFieldName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onAdd()}
        />
        <input
          className="dd-input dd-input-narrow"
          placeholder="类型"
          value={fieldType}
          onChange={(e) => setFieldType(e.target.value)}
        />
        <button className="dd-icon-add" onClick={onAdd} title="添加字段">
          <PlusIcon size={16} />
        </button>
      </div>
    </Section>
  );
}

function FieldEditor({
  model,
  fieldId,
  onSelectNode,
  updateNode,
}: {
  model: Model;
  fieldId: string;
  onSelectNode: (id: string) => void;
  updateNode: (id: string, attrs: Record<string, string | number | boolean>) => void;
}) {
  const f = model.nodes[fieldId];
  const owner = Object.values(model.edges).find((e) => e.type === 'contains' && e.to === fieldId)?.from;
  const impact = columnImpact(model, fieldId);
  return (
    <>
      <Section title="字段属性">
        {owner && (
          <p className="dd-hint-text">
            所属表：
            <button className="dd-inline-link" onClick={() => onSelectNode(owner)}>
              {nodeName(model, owner)}
            </button>
          </p>
        )}
        <label className="dd-field-label">数据类型</label>
        <input
          className="dd-input"
          value={typeof f.attrs?.dataType === 'string' ? f.attrs.dataType : ''}
          onChange={(e) => updateNode(fieldId, { dataType: e.target.value })}
        />
        <label className="dd-field-label">键角色</label>
        <select
          className="dd-input"
          value={typeof f.attrs?.key === 'string' ? f.attrs.key : ''}
          onChange={(e) => updateNode(fieldId, { key: e.target.value })}
        >
          <option value="">普通列</option>
          <option value="PK">PK（主键）</option>
          <option value="FK">FK（外键）</option>
        </select>
        <label className="dd-toggle">
          <input
            type="checkbox"
            checked={f.attrs?.nullable === true}
            onChange={(e) => updateNode(fieldId, { nullable: e.target.checked })}
          />
          可空（NULL）
        </label>
      </Section>
      <Section title="改列牵连">
        {impact.edgeIds.length === 0 ? (
          <p className="dd-muted">没有外键引用此列，改动不牵连其他表。</p>
        ) : (
          <>
            <p className="dd-muted">改 / 删此列会波及以下外键与表：</p>
            <ul className="dd-impact-list">
              {impact.edgeIds.map((eid, i) => (
                <li key={eid} className="dd-impact state-degraded">
                  <div className="dd-impact-head">
                    <strong>{nodeName(model, impact.tableIds[i])}</strong>
                  </div>
                  <div className="dd-impact-path">
                    外键 {eid} · {model.edges[eid]?.attrs?.key}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>
    </>
  );
}

/** 组件外观：换组件身份（语义底座不变）或直接挑图标。改动写进 node.attrs，推演照算。 */
function ComponentAppearance({
  model,
  node,
  nodeId,
  updateNode,
}: {
  model: Model;
  node: ModelNode;
  nodeId: string;
  updateNode: (id: string, attrs: Record<string, string | number | boolean>) => void;
}) {
  const current = nodeComponent(model, node);
  const glyph = nodeGlyph(model, node);
  const options = componentCatalog(model).filter((c) => c.baseType === node.type);
  const componentId = typeof node.attrs?.component === 'string' ? node.attrs.component : '';

  const pickComponent = (comp: ComponentDef | undefined) => {
    if (!comp) updateNode(nodeId, { component: '', icon: '' });
    else updateNode(nodeId, { component: comp.id, icon: comp.icon });
  };

  return (
    <Section title="组件外观">
      <div className="dd-comp-preview">
        <span className="dd-comp-glyph">
          <Glyph id={glyph} size={26} />
        </span>
        <span className="dd-comp-text">
          <span className="dd-comp-name">{current?.name ?? NODE_TYPES[node.type].label}</span>
          <span className="dd-comp-desc">{current?.description ?? '按语义类型显示默认图标'}</span>
        </span>
      </div>
      <label className="dd-field-label">组件身份（不改语义底座，推演照算）</label>
      <select
        className="dd-input"
        value={componentId}
        onChange={(e) => pickComponent(options.find((c) => c.id === e.target.value))}
      >
        <option value="">按语义类型（默认图标）</option>
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <label className="dd-field-label">或直挑图标</label>
      <div className="dd-glyph-grid dd-glyph-grid-sm">
        {GLYPH_LIST.map((g) => (
          <button
            key={g.id}
            className={`dd-glyph-cell${glyph === g.id ? ' selected' : ''}`}
            onClick={() => updateNode(nodeId, { icon: g.id })}
            title={g.label}
            aria-pressed={glyph === g.id}
          >
            <Glyph id={g.id} size={18} />
          </button>
        ))}
      </div>
    </Section>
  );
}
