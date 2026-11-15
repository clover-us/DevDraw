/**
 * NodeEditor —— 右键「编辑…」打开的统一编辑弹窗。
 * 读 / 写分离：抽屉只读详情，所有写操作收进这一个入口，弹窗内用 tab 划分
 * 「详情」（名称 / 字段 / 连线 / 删除）与「外观」（组件身份 / 图标）。
 * 外观 tab 仅对可换身份的架构实体出现；其余类型只有详情。
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { applyPatchChecked } from '../core/patch';
import { componentCatalog, DEFAULT_NODE_ICON, nodeComponent, nodeGlyph } from '../core/components';
import { newEdgeId, newNodeId } from '../core/id';
import { connectableEdgeTypes, NODE_TYPES, type LensDef } from '../core/registry';
import { GLYPH_LIST } from './glyphs';
import type { EdgeType, Model, ModelNode } from '../core/types';
import { FieldEditor, NodePicker, Section, TableFieldsEditor } from './entity-fields';
import { Glyph } from './glyphs';
import { CloseIcon, PaletteIcon, SearchIcon } from './icons';

const APPEARANCE_TYPES = new Set(['Service', 'Database', 'Queue', 'Endpoint', 'ExternalSystem', 'Actor']);

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
  const [tab, setTab] = useState<'details' | 'appearance'>(hasAppearance ? initialTab : 'details');
  const [error, setError] = useState<string | null>(null);
  const [connectTarget, setConnectTarget] = useState('');
  const [connectType, setConnectType] = useState<EdgeType>(connectableEdgeTypes(lens.id)[0]?.id ?? 'calls');
  const [deleteArmed, setDeleteArmed] = useState(false);
  // 外观（本地草稿，应用才落模型）
  const [componentId, setComponentId] = useState(typeof node.attrs?.component === 'string' ? node.attrs.component : '');
  const [icon, setIcon] = useState(nodeGlyph(model, node));
  const [iconQuery, setIconQuery] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
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
  const q = iconQuery.trim().toLowerCase();
  const glyphs = q ? GLYPH_LIST.filter((g) => g.id.toLowerCase().includes(q) || g.label.toLowerCase().includes(q)) : GLYPH_LIST;
  const pickComponent = (comp?: { id: string; icon: string }) => {
    setComponentId(comp?.id ?? '');
    setIcon(comp?.icon ?? '');
  };
  const applyAppearance = () => {
    onChange(applyPatchChecked(model, { op: 'update-node', id: nodeId, attrs: { component: componentId, icon } }));
    onClose();
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
      <div className="dd-modal" role="dialog" aria-modal="true" aria-label={`编辑 ${node.name}`} ref={modalRef}>
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
          <div className="dd-modal-tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'details'} className={tab === 'details' ? 'active' : ''} onClick={() => setTab('details')}>
              详情
            </button>
            <button role="tab" aria-selected={tab === 'appearance'} className={tab === 'appearance' ? 'active' : ''} onClick={() => setTab('appearance')}>
              外观
            </button>
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
            </div>
            <p className="dd-modal-desc">{identity?.description ?? '按类型默认外观。'}</p>
            <p className="dd-modal-note">
              {tab === 'appearance'
                ? '外观是组件身份的快照：换身份会同步图标，也可单独直挑图标。'
                : '左侧为实时预览，编辑会即时反映在这里。'}
            </p>
          </div>

          {tab === 'details' ? (
            <div className="dd-modal-form dd-nodeeditor-details">
              <Section title="名称">
                <input className="dd-input" value={node.name} onChange={(e) => renameNode(e.target.value)} />
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
            <div className="dd-modal-form">
              <div className="dd-modal-fields">
                <div className="dd-modal-field">
                  <label className="dd-field-label">组件身份</label>
                  <select
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
                  <label className="dd-field-label">图标</label>
                  <div className="dd-modal-icon-search">
                    <SearchIcon size={14} />
                    <input placeholder="搜索图标…" value={iconQuery} onChange={(e) => setIconQuery(e.target.value)} />
                  </div>
                </div>
                <div className="dd-modal-icon-grid" role="listbox" aria-label="图标">
                  {glyphs.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      role="option"
                      aria-selected={icon === g.id}
                      className={`dd-glyph-cell${icon === g.id ? ' selected' : ''}`}
                      onClick={() => setIcon(g.id)}
                      title={g.label}
                    >
                      <Glyph id={g.id} size={20} />
                      <span className="dd-glyph-label">{g.label}</span>
                    </button>
                  ))}
                  {glyphs.length === 0 && <div className="dd-modal-icon-empty">没有匹配的图标</div>}
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
              <button className="dd-ghost" onClick={onClose}>
                取消
              </button>
              <button className="dd-primary" onClick={applyAppearance}>
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
