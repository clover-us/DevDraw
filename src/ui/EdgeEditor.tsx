/**
 * EdgeEditor —— 右键关系「编辑关系…」打开的编辑弹窗。
 * 与 NodeEditor 同一套弹窗语言；抽屉里的关系视图改为只读。
 * 依赖模式 / 外键基数 / 状态迁移等写操作都收在这里。
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { applyPatchChecked } from '../core/patch';
import { edgeDependency } from '../core/simulate';
import { EDGE_TYPES, type LensDef } from '../core/registry';
import type { DependencyMode, EdgeAttrs, Model, ModelEdge } from '../core/types';
import { Section } from './entity-fields';
import { nodeName } from './inspect';
import { CloseIcon } from './icons';

interface Props {
  model: Model;
  edge: ModelEdge;
  edgeId: string;
  lens: LensDef;
  onChange: (m: Model) => void;
  onChangeMode: (edgeId: string, mode: DependencyMode) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function EdgeEditor({ model, edge, edgeId, lens, onChange, onChangeMode, onDelete, onClose }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);
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

  const updateEdge = (attrs: Partial<EdgeAttrs>, label?: string) => {
    try {
      onChange(applyPatchChecked(model, { op: 'update-edge', id: edgeId, attrs, label }));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const isArch = lens.id === 'architecture';
  const isRequestEdge = ['calls', 'reads', 'writes', 'publishes', 'subscribes'].includes(edge.type);
  const mode = edgeDependency(edge);

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
      <div className="dd-modal dd-modal-narrow" role="dialog" aria-modal="true" aria-label="编辑关系" ref={modalRef}>
        <div className="dd-modal-head">
          <div className="dd-modal-titles">
            <h2>编辑关系</h2>
            <span className="dd-modal-sub">
              {EDGE_TYPES[edge.type].label} · {nodeName(model, edge.from)} → {nodeName(model, edge.to)}
            </span>
          </div>
          <button className="dd-icon-btn" onClick={onClose} title="关闭（Esc）" aria-label="关闭">
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="dd-modal-body dd-edgeeditor-body">
          <div className="dd-modal-form">
            <Section title="标签">
              <input
                className="dd-input"
                value={edge.label ?? ''}
                placeholder={EDGE_TYPES[edge.type].label}
                onChange={(e) => updateEdge(edge.attrs ?? {}, e.target.value)}
              />
            </Section>

            {isArch && isRequestEdge && (
              <Section title="依赖模式">
                <div className="dd-mode-row">
                  {(['hard', 'soft', 'async'] as DependencyMode[]).map((m) => (
                    <label key={m} className={`dd-mode${mode === m ? ' on' : ''}`}>
                      <input type="radio" name="edge-mode" checked={mode === m} onChange={() => onChangeMode(edgeId, m)} />
                      {m === 'hard' ? '强依赖' : m === 'soft' ? '可降级' : '异步'}
                    </label>
                  ))}
                </div>
                {mode === 'soft' && (
                  <>
                    <label className="dd-field-label">兜底说明</label>
                    <input
                      className="dd-input"
                      value={typeof edge.attrs?.fallback === 'string' ? edge.attrs.fallback : ''}
                      placeholder="失效时的兜底，如：读本地缓存"
                      onChange={(e) => updateEdge({ ...edge.attrs, fallback: e.target.value })}
                    />
                  </>
                )}
              </Section>
            )}

            {lens.id === 'er' && edge.type === 'fk' && (
              <Section title="外键">
                <label className="dd-field-label">基数</label>
                <select
                  className="dd-input"
                  value={edge.attrs?.cardinality ?? '1:N'}
                  onChange={(e) => updateEdge({ ...edge.attrs, cardinality: e.target.value as '1:1' | '1:N' | 'N:M' })}
                >
                  <option value="1:1">1:1（一对一）</option>
                  <option value="1:N">1:N（一对多）</option>
                  <option value="N:M">N:M（多对多，需中间表）</option>
                </select>
                <label className="dd-field-label">外键列</label>
                <input
                  className="dd-input"
                  value={typeof edge.attrs?.key === 'string' ? edge.attrs.key : ''}
                  placeholder="如 order_id"
                  onChange={(e) => updateEdge({ ...edge.attrs, key: e.target.value })}
                />
              </Section>
            )}

            {lens.id === 'state-machine' && edge.type === 'transition' && (
              <Section title="状态迁移">
                <label className="dd-field-label">触发事件</label>
                <input
                  className="dd-input"
                  value={typeof edge.attrs?.event === 'string' ? edge.attrs.event : ''}
                  onChange={(e) => updateEdge({ ...edge.attrs, event: e.target.value })}
                />
                <label className="dd-field-label">由谁触发</label>
                <input
                  className="dd-input"
                  value={typeof edge.attrs?.effectedBy === 'string' ? edge.attrs.effectedBy : ''}
                  onChange={(e) => updateEdge({ ...edge.attrs, effectedBy: e.target.value })}
                />
                <label className="dd-toggle">
                  <input
                    type="checkbox"
                    checked={edge.attrs?.manual === true}
                    onChange={(e) => updateEdge({ ...edge.attrs, manual: e.target.checked })}
                  />
                  人工操作
                </label>
              </Section>
            )}

            {error && <p className="dd-error">{error}</p>}
          </div>
        </div>

        <div className="dd-modal-foot">
          <button
            className={`dd-danger${deleteArmed ? ' armed' : ''}`}
            onClick={() => (deleteArmed ? onDelete(edgeId) : setDeleteArmed(true))}
          >
            {deleteArmed ? '确认删除？再点一次' : '删除关系'}
          </button>
          <span className="dd-modal-foot-spacer" />
          <button className="dd-primary" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
