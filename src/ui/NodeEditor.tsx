/**
 * NodeEditor —— 右键「编辑…」打开的统一编辑弹窗。
 * 读 / 写分离：抽屉只读详情，所有写操作收进这一个入口，弹窗内用 tab 划分
 * 「详情」（名称 / 字段 / 连线 / 删除）与「外观」（组件身份 / 图标）。
 * 外观 tab 仅对可换身份的架构实体出现；其余类型只有详情。
 * 外观是本地草稿：预览实时看草稿，「应用外观」才落模型；未应用时 tab 上亮小黄点。
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { applyPatchChecked } from '../core/patch';
import { componentCatalog, DEFAULT_NODE_ICON, nodeComponent, nodeGlyph } from '../core/components';
import { newEdgeId, newNodeId } from '../core/id';
import { connectableEdgeTypes, NODE_TYPES, type LensDef } from '../core/registry';
import { GLYPH_LIST } from './glyphs';
import type { EdgeType, Model, ModelNode } from '../core/types';
import { FieldEditor, NodePicker, Section, TableFieldsEditor } from './entity-fields';
import { Glyph } from './glyphs';
import { CloseIcon, EntitiesIcon, PaletteIcon, SearchIcon } from './icons';

const APPEARANCE_TYPES = new Set(['Service', 'Database', 'Queue', 'Endpoint', 'ExternalSystem', 'Actor']);

type TabId = 'details' | 'appearance';
const TAB_ORDER: TabId[] = ['details', 'appearance'];

interface Props {
  model: Model;
  node: ModelNode;
  nodeId: string;
  lens: LensDef;
  nodes: Array<[string, ModelNode]>;
  onChange: (m: Model) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  initialTab?: TabId;
}

export function NodeEditor({ model, node, nodeId, lens, nodes, onChange, onDelete, onClose, initialTab = 'details' }: Props) {
  const hasAppearance = APPEARANCE_TYPES.has(node.type);
  const [tab, setTab] = useState<TabId>(hasAppearance ? initialTab : 'details');
  const [error, setError] = useState<string | null>(null);
  const [connectTarget, setConnectTarget] = useState('');
  const [connectType, setConnectType] = useState<EdgeType>(connectableEdgeTypes(lens.id)[0]?.id ?? 'calls');
  const [deleteArmed, setDeleteArmed] = useState(false);
  // 外观（本地草稿，应用才落模型）
  const [componentId, setComponentId] = useState(typeof node.attrs?.component === 'string' ? node.attrs.component : '');
  const [icon, setIcon] = useState(nodeGlyph(model, node));
  const [iconQuery, setIconQuery] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const tablistRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({ details: null, appearance: null });

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
  }, [tab, hasAppearance]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  // 打开即聚焦：详情落在名称输入框，外观落在活跃 tab（键盘可直接操作）。
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
  const addField = (name: string, dataType: string) =>
    tryChange(() => {
      const fid = newNodeId('Field');
      let m = applyPatchChecked(model, { op: 'add-node', id: fid, node: { type: 'Field', name, attrs: { dataType } } });
      m = applyPatchChecked(m, { op: 'add-edge', id: newEdgeId('contains'), edge: { type: 'contains', from: nodeId, to: fid } });
      onChange(m);
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

  const options = componentCatalog(model).filter((c) => c.baseType === node.type);
  const selected = options.find((c) => c.id === componentId);
  const previewGlyph = icon || selected?.icon || DEFAULT_NODE_ICON[node.type];
  // 左侧预览两个 tab 共用：详情看「已落模型」的样子，外观看「草稿」的样子。
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
    const idx = TAB_ORDER.indexOf(tab);
    let next: TabId | null = null;
    if (e.key === 'ArrowRight') next = TAB_ORDER[(idx + 1) % TAB_ORDER.length];
    else if (e.key === 'ArrowLeft') next = TAB_ORDER[(idx - 1 + TAB_ORDER.length) % TAB_ORDER.length];
    else if (e.key === 'Home') next = TAB_ORDER[0];
    else if (e.key === 'End') next = TAB_ORDER[TAB_ORDER.length - 1];
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
      <div className={`dd-modal${hasAppearance ? ' dd-modal-tall' : ''}`} role="dialog" aria-modal="true" aria-label={`编辑 ${node.name}`} ref={modalRef}>
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

        {hasAppearance && (
          <div className="dd-modal-tabs" role="tablist" aria-label="编辑内容" ref={tablistRef} onKeyDown={onTabKeyDown}>
            <button
              id="dd-node-tab-details"
              role="tab"
              aria-selected={tab === 'details'}
              aria-controls="dd-node-panel-details"
              tabIndex={tab === 'details' ? 0 : -1}
              className={tab === 'details' ? 'active' : ''}
              ref={(el) => {
                tabRefs.current.details = el;
              }}
              onClick={() => setTab('details')}
            >
              <EntitiesIcon size={14} />
              详情
            </button>
            <button
              id="dd-node-tab-appearance"
              role="tab"
              aria-selected={tab === 'appearance'}
              aria-controls="dd-node-panel-appearance"
              tabIndex={tab === 'appearance' ? 0 : -1}
              className={tab === 'appearance' ? 'active' : ''}
              title={dirty ? '有未应用的外观改动' : undefined}
              ref={(el) => {
                tabRefs.current.appearance = el;
              }}
              onClick={() => setTab('appearance')}
            >
              <PaletteIcon size={14} />
              外观
              {dirty && <span className="dd-tab-dot" aria-label="有未应用的外观改动" />}
            </button>
            <span className="dd-modal-tabs-ink" style={{ left: ink.left, width: ink.width }} aria-hidden="true" />
          </div>
        )}

        <div className="dd-modal-body">
          <div className="dd-modal-preview">
            <div className="dd-modal-preview-label">预览</div>
            <div className="dd-modal-canvas">
              <div className="dd-modal-preview-card">
                <span className="dd-node-glyph">
                  <Glyph id={displayGlyph} size={22} />
                </span>
                <span className="dd-node-arch-text">
                  <span className="dd-node-kind">{NODE_TYPES[node.type].label}</span>
                  <span className="dd-node-name">{node.name}</span>
                </span>
              </div>
            </div>
            <div className="dd-modal-meta">
              <span className="dd-modal-badge">{NODE_TYPES[node.type].label}</span>
              {identity && <span className="dd-modal-badge alt">{identity.name}</span>}
              {tab === 'appearance' && dirty && <span className="dd-modal-badge draft">草稿 · 未应用</span>}
            </div>
            <p className="dd-modal-desc">{identity?.description ?? '按类型默认外观。'}</p>
            <p className="dd-modal-note">
              {tab === 'appearance'
                ? '外观是组件身份的快照：换身份会同步图标，也可单独直挑图标。'
                : '左侧为实时预览，编辑会即时反映在这里。'}
            </p>
          </div>

          {tab === 'details' ? (
            <div className="dd-modal-form dd-nodeeditor-details" role="tabpanel" id="dd-node-panel-details" aria-labelledby="dd-node-tab-details">
              <Section title="名称">
                <input ref={nameRef} className="dd-input" value={node.name} onChange={(e) => renameNode(e.target.value)} />
              </Section>

              {node.type === 'Table' && (
                <TableFieldsEditor model={model} tableId={nodeId} onSelectField={() => {}} onAdd={addField} />
              )}
              {node.type === 'Field' && <FieldEditor model={model} fieldId={nodeId} onSelectNode={() => {}} updateNode={updateNode} />}
              {node.type === 'State' && (
                <Section title="初始状态">
                  <label className="dd-toggle">
                    <input
                      type="checkbox"
                      checked={node.attrs?.initial === true}
                      onChange={(e) => updateNode(nodeId, { initial: e.target.checked })}
                    />
                    作为状态机的起点
                  </label>
                </Section>
              )}
              {(node.type === 'Decision' || node.type === 'Assumption' || node.type === 'Note') && (
                <Section title="内容">
                  <textarea
                    className="dd-input dd-textarea"
                    rows={4}
                    value={typeof node.attrs?.detail === 'string' ? node.attrs.detail : ''}
                    onChange={(e) => updateNode(nodeId, { detail: e.target.value })}
                  />
                </Section>
              )}

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

              {error && <p className="dd-error">{error}</p>}
            </div>
          ) : (
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
          {tab === 'details' ? (
            <>
              <button
                className={`dd-danger${deleteArmed ? ' armed' : ''}`}
                onClick={() => (deleteArmed ? onDelete(nodeId) : setDeleteArmed(true))}
              >
                {deleteArmed ? '确认删除？再点一次' : '删除实体'}
              </button>
              <span className="dd-modal-foot-spacer" />
              <button className="dd-primary" onClick={onClose}>
                完成
              </button>
            </>
          ) : (
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
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
