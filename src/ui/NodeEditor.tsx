/**
 * NodeEditor —— 右键「编辑…」打开的统一编辑弹窗。
 * 读 / 写分离：抽屉只读详情，所有写操作收进这一个入口。弹窗内按节点类型
 * 动态拆成多个子页面（tab）：
 *   详情 —— 名称 / 笔记内容 / 添加连线 / 删除；
 *   属性 —— 实体级属性（注册表软 schema 驱动），字段节点则为字段属性编辑器；
 *   字段 —— 仅表：左侧预览行即字段导航（点行切换），右栏直接是分组字段属性表单；
 *   外观 —— 仅可换身份的架构实体：组件身份 / 图标。
 * 外观是本地草稿：预览实时看草稿，「应用外观」才落模型；未应用时 tab 上亮小黄点。
 * 其余子页面实时写模型；footer 随子页面切换（删除/完成 vs 还原/取消/应用外观）。
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { applyPatchChecked } from '../core/patch';
import { componentCatalog, DEFAULT_NODE_ICON, nodeComponent, nodeGlyph } from '../core/components';
import { erFieldRows } from '../core/er';
import { lifecycleOfState } from '../core/lifecycle';
import { newEdgeId, newNodeId } from '../core/id';
import { connectableEdgeTypes, NODE_TYPES, type LensDef } from '../core/registry';
import { GLYPH_LIST } from './glyphs';
import type { EdgeType, Model, ModelNode } from '../core/types';
import { AttrsEditor, FieldEditor, NodePicker, Section } from './entity-fields';
import { Glyph } from './glyphs';
import { CloseIcon, EntitiesIcon, PaletteIcon, PlusIcon, SearchIcon } from './icons';

const APPEARANCE_TYPES = new Set(['Service', 'Database', 'Queue', 'Endpoint', 'ExternalSystem', 'Actor']);

type TabId = 'details' | 'attrs' | 'fields' | 'appearance';
const TAB_LABEL: Record<TabId, string> = { details: '详情', attrs: '属性', fields: '字段', appearance: '外观' };

interface Props {
  model: Model;
  node: ModelNode;
  nodeId: string;
  lens: LensDef;
  nodes: Array<[string, ModelNode]>;
  onChange: (m: Model) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  initialTab?: 'details' | 'appearance';
}

export function NodeEditor({ model, node, nodeId, lens, nodes, onChange, onDelete, onClose, initialTab = 'details' }: Props) {
  const hasAppearance = APPEARANCE_TYPES.has(node.type);
  // 子页面按类型动态组合：有属性 schema（或字段编辑器）才有「属性」，表才有「字段」。
  const hasAttrs = node.type === 'Field' || Boolean(NODE_TYPES[node.type].attrs);
  const hasFields = node.type === 'Table';
  const tabs: TabId[] = ['details'];
  if (hasAttrs) tabs.push('attrs');
  if (hasFields) tabs.push('fields');
  if (hasAppearance) tabs.push('appearance');
  const tabsKey = tabs.join('|');
  const [tab, setTab] = useState<TabId>(tabs.includes(initialTab) ? initialTab : 'details');
  const [error, setError] = useState<string | null>(null);
  const [connectTarget, setConnectTarget] = useState('');
  const [connectType, setConnectType] = useState<EdgeType>(connectableEdgeTypes(lens.id)[0]?.id ?? 'calls');
  const [deleteArmed, setDeleteArmed] = useState(false);
  // 表当前选中的字段：左侧预览行点选切换，右栏直接编辑其属性。
  const [fieldId, setFieldId] = useState<string | null>(null);
  const [focusNameTick, setFocusNameTick] = useState(0);
  const [fieldDeleteArmed, setFieldDeleteArmed] = useState(false);
  // 外观（本地草稿，应用才落模型）
  const [componentId, setComponentId] = useState(typeof node.attrs?.component === 'string' ? node.attrs.component : '');
  const [icon, setIcon] = useState(nodeGlyph(model, node));
  const [iconQuery, setIconQuery] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const tablistRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({ details: null, attrs: null, fields: null, appearance: null });

  // tab 下划线滑条：量活跃 tab 的位置，切换 / 尺寸变化时滑动。
  const [ink, setInk] = useState({ left: 0, width: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      const el = tabRefs.current[tab];
      if (el) setInk({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (tablistRef.current) ro.observe(tablistRef.current);
    return () => ro.disconnect();
  }, [tab, tabsKey]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  // 打开即聚焦：详情落在名称输入框，其余子页面落在活跃 tab（键盘可直接操作）。
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (tab === 'details') nameRef.current?.focus();
      else tabRefs.current[tab]?.focus();
    }, 40);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!deleteArmed) return;
    const t = window.setTimeout(() => setDeleteArmed(false), 3000);
    return () => window.clearTimeout(t);
  }, [deleteArmed]);
  // 字段子页面：右栏直接是属性表单，进入即选中第一列；选中列失效时自动落回第一列。
  useEffect(() => {
    if (tab !== 'fields') return;
    if (fieldId && model.nodes[fieldId]) return;
    const rows = erFieldRows(model, nodeId);
    setFieldId(rows[0]?.id ?? null);
  }, [tab, fieldId, model, nodeId]);
  useEffect(() => {
    if (!fieldDeleteArmed) return;
    const t = window.setTimeout(() => setFieldDeleteArmed(false), 3000);
    return () => window.clearTimeout(t);
  }, [fieldDeleteArmed]);
  // 换选另一列时解除「确认删除」武装，避免误删新选中的列。
  useEffect(() => setFieldDeleteArmed(false), [fieldId]);

  const tryChange = (fn: () => string | null) => setError(fn());
  const updateNode = (id: string, attrs: Record<string, string | number | boolean>) =>
    tryChange(() => {
      onChange(applyPatchChecked(model, { op: 'update-node', id, attrs }));
      return null;
    });
  const renameNode = (name: string) =>
    tryChange(() => {
      onChange(applyPatchChecked(model, { op: 'update-node', id: nodeId, name }));
      return null;
    });
  // 添加字段：自动起不重名的 field_n，选中并聚焦名称，落笔即可改名。
  const addField = () =>
    tryChange(() => {
      const rows = erFieldRows(model, nodeId);
      const names = new Set(rows.map((r) => r.name));
      let n = rows.length + 1;
      while (names.has(`field_${n}`)) n += 1;
      const fid = newNodeId('Field');
      let m = applyPatchChecked(model, { op: 'add-node', id: fid, node: { type: 'Field', name: `field_${n}`, attrs: { dataType: 'varchar' } } });
      m = applyPatchChecked(m, { op: 'add-edge', id: newEdgeId('contains'), edge: { type: 'contains', from: nodeId, to: fid } });
      onChange(m);
      setFieldId(fid);
      setFocusNameTick((t) => t + 1);
      return null;
    });
  const renameField = (fid: string, name: string) =>
    tryChange(() => {
      onChange(applyPatchChecked(model, { op: 'update-node', id: fid, name }));
      return null;
    });
  const deleteField = (fid: string) =>
    tryChange(() => {
      const rows = erFieldRows(model, nodeId);
      const idx = rows.findIndex((r) => r.id === fid);
      const next = rows[idx + 1] ?? rows[idx - 1];
      onChange(applyPatchChecked(model, { op: 'remove-node', id: fid }));
      setFieldId(next && next.id !== fid ? next.id : null);
      setFieldDeleteArmed(false);
      return null;
    });
  const addConnection = () => {
    if (!connectTarget) return;
    tryChange(() => {
      onChange(applyPatchChecked(model, { op: 'add-edge', id: newEdgeId(connectType), edge: { type: connectType, from: nodeId, to: connectTarget } }));
      setConnectTarget('');
      return null;
    });
  };

  // 状态机归属：State 经 contains 挂在 Lifecycle 下，Table 经 has-lifecycle 指向 Lifecycle。
  const lifecycleEntries = Object.entries(model.nodes).filter(([, n]) => n.type === 'Lifecycle');
  const stateLcId = node.type === 'State' ? lifecycleOfState(model, nodeId) ?? '' : '';
  const tableLcId =
    node.type === 'Table' ? Object.values(model.edges).find((e) => e.type === 'has-lifecycle' && e.from === nodeId)?.to ?? '' : '';
  // 换挂生命周期：先拆旧边再挂新边；空值 = 解除归属。
  const setLifecycleLink = (kind: 'state' | 'table', lcId: string) =>
    tryChange(() => {
      let m = model;
      if (kind === 'state') {
        for (const [eid, e] of Object.entries(model.edges)) {
          if (e.type === 'contains' && e.to === nodeId && model.nodes[e.from]?.type === 'Lifecycle')
            m = applyPatchChecked(m, { op: 'remove-edge', id: eid });
        }
        if (lcId) m = applyPatchChecked(m, { op: 'add-edge', id: newEdgeId('contains'), edge: { type: 'contains', from: lcId, to: nodeId } });
      } else {
        for (const [eid, e] of Object.entries(model.edges)) {
          if (e.type === 'has-lifecycle' && e.from === nodeId) m = applyPatchChecked(m, { op: 'remove-edge', id: eid });
        }
        if (lcId) m = applyPatchChecked(m, { op: 'add-edge', id: newEdgeId('has-lifecycle'), edge: { type: 'has-lifecycle', from: nodeId, to: lcId } });
      }
      onChange(m);
      return null;
    });

  const options = componentCatalog(model).filter((c) => c.baseType === node.type);
  const selected = options.find((c) => c.id === componentId);
  const previewGlyph = icon || selected?.icon || DEFAULT_NODE_ICON[node.type];
  // 左侧预览所有子页面共用：详情/属性/字段看「已落模型」的样子，外观看「草稿」的样子。
  const displayGlyph = tab === 'appearance' ? previewGlyph : nodeGlyph(model, node);
  const identity = tab === 'appearance' ? selected : nodeComponent(model, node);
  // 草稿与已落模型的差异：驱动「应用外观」可用性、tab 黄点、预览草稿徽标。
  const savedComponent = typeof node.attrs?.component === 'string' ? node.attrs.component : '';
  const savedIcon = nodeGlyph(model, node);
  const dirty = componentId !== savedComponent || icon !== savedIcon;
  const resetDraft = () => {
    setComponentId(savedComponent);
    setIcon(savedIcon);
  };
  const q = iconQuery.trim().toLowerCase();
  const glyphs = q ? GLYPH_LIST.filter((g) => g.id.toLowerCase().includes(q) || g.label.toLowerCase().includes(q)) : GLYPH_LIST;
  // 网格 roving tabindex：选中格可 Tab 进入；选中格被搜掉时落在第一格。
  const gridEntryIcon = glyphs.some((g) => g.id === icon) ? icon : glyphs[0]?.id;
  const pickComponent = (comp?: { id: string; icon: string }) => {
    setComponentId(comp?.id ?? '');
    setIcon(comp?.icon ?? '');
  };
  const applyAppearance = () => {
    onChange(applyPatchChecked(model, { op: 'update-node', id: nodeId, attrs: { component: componentId, icon } }));
    onClose();
  };
  const clearSearch = () => {
    setIconQuery('');
    searchRef.current?.focus();
  };

  // tab 键盘：左右 / Home / End 切换并跟随焦点（roving tabindex）。
  const onTabKeyDown = (e: React.KeyboardEvent) => {
    const idx = tabs.indexOf(tab);
    let next: TabId | null = null;
    if (e.key === 'ArrowRight') next = tabs[(idx + 1) % tabs.length];
    else if (e.key === 'ArrowLeft') next = tabs[(idx - 1 + tabs.length) % tabs.length];
    else if (e.key === 'Home') next = tabs[0];
    else if (e.key === 'End') next = tabs[tabs.length - 1];
    if (next) {
      e.preventDefault();
      setTab(next);
      tabRefs.current[next]?.focus();
    }
  };
  // 图标网格键盘：方向键按实际列数走格，Home / End 首尾。
  const onGridKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const cells = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('.dd-glyph-cell'));
    const i = cells.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    const cols = getComputedStyle(e.currentTarget).gridTemplateColumns.split(' ').length;
    let j = i;
    if (e.key === 'ArrowRight') j = Math.min(i + 1, cells.length - 1);
    else if (e.key === 'ArrowLeft') j = Math.max(i - 1, 0);
    else if (e.key === 'ArrowDown') j = Math.min(i + cols, cells.length - 1);
    else if (e.key === 'ArrowUp') j = Math.max(i - cols, 0);
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = cells.length - 1;
    cells[j]?.focus();
  };

  const allowed = connectableEdgeTypes(lens.id);
  const targets = nodes.filter(([id]) => id !== nodeId);
  // 表的实时预览行：直接读模型，编辑字段 / 备注 / 类型即时反映在左侧迷你表卡；
  // 预览行同时是字段导航：点哪行，右栏就编辑哪列。
  const previewRows = node.type === 'Table' ? erFieldRows(model, nodeId) : [];
  const selRow = previewRows.find((r) => r.id === fieldId);
  const tableComment = typeof node.attrs?.comment === 'string' && node.attrs.comment ? node.attrs.comment : '';

  return createPortal(
    <div
      className="dd-modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
        if (e.key === 'Tab' && modalRef.current) {
          const focusables = modalRef.current.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex]');
          if (focusables.length === 0) return;
          const first = focusables[0];
          const last = focusables[focusables.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }}
    >
      <div className={`dd-modal${tabs.length > 1 ? ' dd-modal-tall' : ''}`} role="dialog" aria-modal="true" aria-label={`编辑 ${node.name}`} ref={modalRef}>
        <div className="dd-modal-head">
          <span className="dd-modal-head-glyph">
            <Glyph id={displayGlyph} size={26} />
          </span>
          <div className="dd-modal-titles">
            <h2>编辑实体</h2>
            <span className="dd-modal-sub">
              {node.name} · {NODE_TYPES[node.type].label}
            </span>
          </div>
          <button className="dd-icon-btn" onClick={onClose} title="关闭（Esc）" aria-label="关闭">
            <CloseIcon size={18} />
          </button>
        </div>

        {tabs.length > 1 && (
          <div className="dd-modal-tabs" role="tablist" aria-label="编辑内容" ref={tablistRef} onKeyDown={onTabKeyDown}>
            {tabs.map((t) => (
              <button
                key={t}
                id={`dd-node-tab-${t}`}
                role="tab"
                aria-selected={tab === t}
                aria-controls={`dd-node-panel-${t}`}
                tabIndex={tab === t ? 0 : -1}
                className={tab === t ? 'active' : ''}
                title={t === 'appearance' && dirty ? '有未应用的外观改动' : undefined}
                ref={(el) => {
                  tabRefs.current[t] = el;
                }}
                onClick={() => setTab(t)}
              >
                {t === 'details' && <EntitiesIcon size={14} />}
                {t === 'attrs' && <Glyph id="config" size={14} />}
                {t === 'fields' && <Glyph id="table" size={14} />}
                {t === 'appearance' && <PaletteIcon size={14} />}
                {TAB_LABEL[t]}
                {t === 'fields' && <span className="dd-tab-count">{previewRows.length}</span>}
                {t === 'appearance' && dirty && <span className="dd-tab-dot" aria-label="有未应用的外观改动" />}
              </button>
            ))}
            <span className="dd-modal-tabs-ink" style={{ left: ink.left, width: ink.width }} aria-hidden="true" />
          </div>
        )}

        <div className="dd-modal-body">
          <div className="dd-modal-preview">
            <div className="dd-modal-preview-label">预览</div>
            <div className="dd-modal-canvas">
              {node.type === 'Table' ? (
                <div className="dd-modal-preview-table" aria-label="表卡片预览">
                  <div className="dd-table-head">
                    <span className="dd-table-glyph">
                      <Glyph id={displayGlyph} size={16} />
                    </span>
                    <span className="dd-node-name">{node.name}</span>
                    <span className="dd-table-count">{previewRows.length} 列</span>
                  </div>
                  <div className="dd-table-fields">
                    {previewRows.length === 0 && <div className="dd-table-empty">无字段 · 在右侧添加</div>}
                    {previewRows.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        className={`dd-field-row dd-preview-row${fieldId === f.id ? ' selected' : ''}${f.keyRole ? ' is-key' : ''}`}
                        onClick={() => {
                          setFieldId(f.id);
                          if (tab !== 'fields') setTab('fields');
                        }}
                        aria-pressed={fieldId === f.id}
                        title={`编辑字段 ${f.name}`}
                      >
                        <span className="dd-field-name">{f.name}</span>
                        {f.keyRole ? (
                          <span className={`dd-key dd-key-${f.keyRole.toLowerCase()}`}>{f.keyRole}</span>
                        ) : (
                          <span className="dd-key-spacer" aria-hidden="true" />
                        )}
                        <span className="dd-field-comment" title={f.comment || undefined}>
                          {f.comment}
                        </span>
                        <span className="dd-field-type-cell">
                          <span className="dd-field-type">{f.dataType}</span>
                          {f.nullable && (
                            <span className="dd-nullable" title="可空">
                              ?
                            </span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="dd-modal-preview-card">
                  <span className="dd-node-glyph">
                    <Glyph id={displayGlyph} size={22} />
                  </span>
                  <span className="dd-node-arch-text">
                    <span className="dd-node-kind">{identity?.name ?? NODE_TYPES[node.type].label}</span>
                    <span className="dd-node-name">{node.name}</span>
                  </span>
                </div>
              )}
            </div>
            <div className="dd-modal-meta">
              <span className="dd-modal-badge">{NODE_TYPES[node.type].label}</span>
              {identity && <span className="dd-modal-badge alt">{identity.name}</span>}
              {tab === 'appearance' && dirty && <span className="dd-modal-badge draft">草稿 · 未应用</span>}
            </div>
            <p className="dd-modal-desc">{tableComment || identity?.description || '按类型默认外观。'}</p>
            <p className="dd-modal-note">
              {tab === 'appearance'
                ? '外观是组件身份的快照：换身份会同步图标，也可单独直挑图标。'
                : node.type === 'Table' && tab === 'fields'
                  ? '点击预览行切换字段，右侧编辑即时同步到画布。'
                  : '左侧为实时预览，编辑会即时反映在这里。'}
            </p>
          </div>

          {tab === 'details' && (
            <div className="dd-modal-form dd-nodeeditor-pane" role="tabpanel" id="dd-node-panel-details" aria-labelledby="dd-node-tab-details">
              <Section title="名称">
                <input ref={nameRef} className="dd-input" value={node.name} onChange={(e) => renameNode(e.target.value)} />
              </Section>

              {node.type === 'Note' && (
                <Section title="内容">
                  <textarea
                    className="dd-input dd-textarea"
                    rows={4}
                    value={typeof node.attrs?.detail === 'string' ? node.attrs.detail : ''}
                    onChange={(e) => updateNode(nodeId, { detail: e.target.value })}
                  />
                </Section>
              )}

              {/* 生命周期是锚点：它的连线（contains / has-lifecycle）由状态和表的属性页管理，这里不给手画入口。 */}
              {node.type !== 'Lifecycle' && (
                <Section title="添加连线">
                  <div className="dd-connect-row">
                    <select className="dd-input" value={connectType} onChange={(e) => setConnectType(e.target.value as EdgeType)}>
                      {allowed.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <NodePicker model={model} nodes={targets} value={connectTarget} onChange={setConnectTarget} placeholder="选择终点实体…" />
                    <button className="dd-primary dd-connect-btn" onClick={addConnection} disabled={!connectTarget}>
                      连接
                    </button>
                  </div>
                </Section>
              )}

              {error && <p className="dd-error">{error}</p>}
            </div>
          )}

          {tab === 'attrs' && (
            <div className="dd-modal-form dd-nodeeditor-pane" role="tabpanel" id="dd-node-panel-attrs" aria-labelledby="dd-node-tab-attrs">
              {node.type === 'Field' ? (
                <FieldEditor model={model} fieldId={nodeId} onSelectNode={() => {}} updateNode={updateNode} />
              ) : (
                <>
                  {node.type === 'State' && (
                    <Section title="归属生命周期">
                      <div className="dd-connect-row">
                        <NodePicker
                          model={model}
                          nodes={lifecycleEntries}
                          value={stateLcId}
                          onChange={(id) => setLifecycleLink('state', id)}
                          placeholder="选择生命周期…"
                        />
                        {stateLcId && (
                          <button className="dd-mini-btn" onClick={() => setLifecycleLink('state', '')}>
                            解除
                          </button>
                        )}
                      </div>
                      <p className="dd-modal-note">状态机镜片按生命周期分scope；没挂机器的状态在「未归属」里。</p>
                    </Section>
                  )}
                  <AttrsEditor model={model} nodeId={nodeId} updateNode={updateNode} />
                  {node.type === 'Table' && (
                    <Section title="生命周期">
                      <div className="dd-connect-row">
                        <NodePicker
                          model={model}
                          nodes={lifecycleEntries}
                          value={tableLcId}
                          onChange={(id) => setLifecycleLink('table', id)}
                          placeholder="选择生命周期…"
                        />
                        {tableLcId && (
                          <button className="dd-mini-btn" onClick={() => setLifecycleLink('table', '')}>
                            解除
                          </button>
                        )}
                      </div>
                      <p className="dd-modal-note">挂上后，状态机 scope 条会显示这张表作为来源。</p>
                    </Section>
                  )}
                </>
              )}
              {error && <p className="dd-error">{error}</p>}
            </div>
          )}

          {tab === 'fields' && (
            <div className="dd-modal-form dd-nodeeditor-pane" role="tabpanel" id="dd-node-panel-fields" aria-labelledby="dd-node-tab-fields">
              <div className="dd-fields-bar">
                {selRow ? (
                  <span className="dd-fields-bar-id">
                    {selRow.keyRole && <span className={`dd-key dd-key-${selRow.keyRole.toLowerCase()}`}>{selRow.keyRole}</span>}
                    <strong>{selRow.name}</strong>
                    <span className="dd-fields-bar-type">{selRow.dataType}</span>
                  </span>
                ) : (
                  <span className="dd-fields-bar-title">字段属性</span>
                )}
                <span className="dd-fields-bar-spacer" />
                <button className="dd-mini-btn dd-fields-add" onClick={addField} title="添加字段并立即编辑">
                  <PlusIcon size={12} />
                  添加字段
                </button>
                {selRow && (
                  <button
                    className={`dd-mini-btn dd-danger${fieldDeleteArmed ? ' armed' : ''}`}
                    onClick={() => (fieldDeleteArmed ? deleteField(selRow.id) : setFieldDeleteArmed(true))}
                  >
                    {fieldDeleteArmed ? '确认删除？' : '删除字段'}
                  </button>
                )}
              </div>
              {/* 窄屏隐藏预览时的字段切换兜底：与预览行同一份选中态。 */}
              <select
                className="dd-input dd-fields-switch"
                aria-label="切换字段"
                value={fieldId ?? ''}
                onChange={(e) => setFieldId(e.target.value)}
              >
                {previewRows.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.keyRole ? `（${r.keyRole}）` : ''}
                  </option>
                ))}
              </select>
              {selRow && fieldId ? (
                <FieldEditor
                  model={model}
                  fieldId={fieldId}
                  onSelectNode={() => {}}
                  updateNode={updateNode}
                  onRename={(name) => renameField(fieldId, name)}
                  showTableLink={false}
                  focusNameTick={focusNameTick}
                />
              ) : (
                <div className="dd-fields-empty">
                  <Glyph id="table" size={24} />
                  <p>这张表还没有字段，添加第一列开始建模。</p>
                  <button className="dd-primary" onClick={addField}>
                    <PlusIcon size={14} />
                    添加第一个字段
                  </button>
                </div>
              )}
              {error && <p className="dd-error">{error}</p>}
            </div>
          )}

          {tab === 'appearance' && (
            <div className="dd-modal-form" role="tabpanel" id="dd-node-panel-appearance" aria-labelledby="dd-node-tab-appearance">
              <div className="dd-modal-fields">
                <div className="dd-modal-field">
                  <label className="dd-field-label" htmlFor="dd-node-component">组件身份</label>
                  <select
                    id="dd-node-component"
                    className="dd-input"
                    value={componentId}
                    onChange={(e) => pickComponent(options.find((c) => c.id === e.target.value))}
                  >
                    <option value="">按类型默认</option>
                    {options.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="dd-modal-icons">
                <div className="dd-modal-icons-head">
                  <span className="dd-field-label">图标（{glyphs.length}/{GLYPH_LIST.length}）</span>
                  <div className="dd-modal-icon-search">
                    <SearchIcon size={14} />
                    <input
                      ref={searchRef}
                      type="text"
                      placeholder="搜索图标…"
                      value={iconQuery}
                      onChange={(e) => setIconQuery(e.target.value)}
                      onKeyDown={(e) => {
                        // 有词时 Esc 先清搜索，不关弹窗；空词时 Esc 照常关闭。
                        if (e.key === 'Escape' && iconQuery) {
                          e.stopPropagation();
                          setIconQuery('');
                        }
                      }}
                      aria-label="搜索图标"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    {iconQuery && (
                      <button className="dd-search-clear" onClick={clearSearch} title="清除搜索" aria-label="清除搜索">
                        <CloseIcon size={12} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="dd-modal-icon-grid" role="listbox" aria-label="图标" onKeyDown={onGridKeyDown}>
                  {glyphs.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      role="option"
                      aria-selected={icon === g.id}
                      tabIndex={g.id === gridEntryIcon ? 0 : -1}
                      className={`dd-glyph-cell${icon === g.id ? ' selected' : ''}`}
                      onClick={() => setIcon(g.id)}
                      title={g.label}
                    >
                      <Glyph id={g.id} size={20} />
                      <span className="dd-glyph-label">{g.label}</span>
                    </button>
                  ))}
                  {glyphs.length === 0 && (
                    <div className="dd-modal-icon-empty">
                      <span>没有匹配「{iconQuery.trim()}」的图标</span>
                      <button className="dd-mini-btn" onClick={clearSearch}>
                        清除搜索
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="dd-modal-foot">
          {tab === 'appearance' ? (
            <>
              <span className="dd-modal-foot-hint">外观只改身份与图标，语义底座不变，推演照算。</span>
              <span className="dd-modal-foot-spacer" />
              {dirty && (
                <button className="dd-ghost" onClick={resetDraft} title="放弃草稿，恢复已应用的外观">
                  还原
                </button>
              )}
              <button className="dd-ghost" onClick={onClose}>
                取消
              </button>
              <button
                className="dd-primary"
                onClick={applyAppearance}
                disabled={!dirty}
                title={dirty ? '把草稿写进节点属性' : '当前没有未应用的改动'}
              >
                <PaletteIcon size={16} />
                应用外观
              </button>
            </>
          ) : (
            <>
              {tab === 'details' ? (
                <button
                  className={`dd-danger${deleteArmed ? ' armed' : ''}`}
                  onClick={() => (deleteArmed ? onDelete(nodeId) : setDeleteArmed(true))}
                >
                  {deleteArmed ? '确认删除？再点一次' : '删除实体'}
                </button>
              ) : (
                <span className="dd-modal-foot-hint">改动实时写入模型，画布、预览与推演即时同步。</span>
              )}
              <span className="dd-modal-foot-spacer" />
              <button className="dd-primary" onClick={onClose}>
                完成
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}