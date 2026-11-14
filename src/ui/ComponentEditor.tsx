/**
 * ComponentEditor —— 居中弹窗：自定义组件 CRUD。
 * 左侧「迷你画布」实时预览组件作为节点卡片的样子，右侧表单（名称/语义底座/分类/说明 + 可搜索图标库）。
 * 定义存进 model.components（git 友好）；语义底座(baseType)决定参与哪副镜片、推演如何对待它。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { COMPONENT_CATEGORIES, categoryLabel } from '../core/components';
import { newComponentId } from '../core/id';
import { NODE_TYPES, LENSES } from '../core/registry';
import type { ComponentDef, NodeType } from '../core/types';
import { GLYPH_LIST, Glyph } from './glyphs';
import { CloseIcon, PlusIcon, SearchIcon, TrashIcon } from './icons';

interface ComponentEditorProps {
  editing: ComponentDef | null;
  onSave: (comp: ComponentDef) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const BASE_TYPES = Object.values(NODE_TYPES);

export function ComponentEditor({ editing, onSave, onDelete, onClose }: ComponentEditorProps) {
  const [name, setName] = useState('');
  const [baseType, setBaseType] = useState<NodeType>('Service');
  const [category, setCategory] = useState('compute');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('service');
  const [iconQuery, setIconQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setError(null);
    setIconQuery('');
    setName(editing?.name ?? '');
    setBaseType(editing?.baseType ?? 'Service');
    setCategory(editing?.category ?? 'compute');
    setDescription(editing?.description ?? '');
    setIcon(editing?.icon ?? 'service');
  }, [editing]);

  // 打开即聚焦名称；锁定背景滚动；卸载还原。
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => nameRef.current?.focus(), 40);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(t);
    };
  }, []);

  const filteredGlyphs = useMemo(() => {
    const q = iconQuery.trim().toLowerCase();
    if (!q) return GLYPH_LIST;
    return GLYPH_LIST.filter((g) => g.label.toLowerCase().includes(q) || g.id.toLowerCase().includes(q));
  }, [iconQuery]);

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('请给组件起个名字');
      nameRef.current?.focus();
      return;
    }
    const comp: ComponentDef = {
      id: editing?.id ?? newComponentId(),
      name: trimmed,
      baseType,
      icon,
      category,
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(editing?.attrs ? { attrs: editing.attrs } : {}),
    };
    onSave(comp);
  };

  // Esc 关闭 + Tab 焦点圈在弹窗内。
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key === 'Tab' && modalRef.current) {
      const focusables = modalRef.current.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !modalRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const baseLabel = NODE_TYPES[baseType].label;

  return createPortal(
    <div className="dd-modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()} onKeyDown={onKeyDown}>
      <div className="dd-modal" role="dialog" aria-modal="true" aria-labelledby="dd-comp-modal-title" ref={modalRef}>
        <header className="dd-modal-head">
          <span className="dd-modal-head-glyph">
            <Glyph id={icon} size={20} />
          </span>
          <div className="dd-modal-titles">
            <h2 id="dd-comp-modal-title">{editing ? '编辑组件' : '新建自定义组件'}</h2>
            <span className="dd-modal-sub">{editing ? editing.id : '存进项目 · 随 git 走 · 不破坏推演'}</span>
          </div>
          <button className="dd-icon-btn" onClick={onClose} title="关闭 (Esc)" aria-label="关闭弹窗">
            <CloseIcon size={16} />
          </button>
        </header>

        <div className="dd-modal-body">
          {/* 左：迷你画布实时预览 */}
          <aside className="dd-modal-preview">
            <span className="dd-modal-preview-label">画布预览</span>
            <div className="dd-modal-canvas">
              <div className="dd-modal-preview-card">
                <span className="dd-node-glyph">
                  <Glyph id={icon} size={22} />
                </span>
                <span className="dd-node-arch-text">
                  <span className="dd-node-kind">{baseLabel}</span>
                  <span className="dd-node-name">{name.trim() || '组件名称'}</span>
                </span>
              </div>
            </div>
            <div className="dd-modal-meta">
              <span className="dd-modal-badge">{baseLabel} · 语义底座</span>
              <span className="dd-modal-badge alt">{categoryLabel(category)}</span>
            </div>
            <span className="dd-modal-preview-label">参与镜片</span>
            <div className="dd-modal-meta">
              {LENSES.map((l) => {
                const on = l.nodeTypes.includes(baseType);
                return (
                  <span key={l.id} className={`dd-modal-lens${on ? ' on' : ''}`} title={l.description}>
                    {l.label}
                  </span>
                );
              })}
            </div>
            {description.trim() && <p className="dd-modal-desc">{description.trim()}</p>}
            <p className="dd-modal-note">
              语义底座决定它参与哪副镜片、推演如何对待它；图标只是皮肤。删除组件不会破坏已建模的节点——节点已把图标快照进自己的属性。
            </p>
          </aside>

          {/* 右：表单 + 图标库 */}
          <div className="dd-modal-form">
            <div className="dd-modal-fields">
              <div className="dd-modal-field">
                <label className="dd-field-label" htmlFor="dd-comp-name">名称</label>
                <input
                  id="dd-comp-name"
                  ref={nameRef}
                  className="dd-input"
                  placeholder="如 ClickHouse / 内部网关"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && save()}
                />
              </div>
              <div className="dd-modal-field-row">
                <div className="dd-modal-field">
                  <label className="dd-field-label" htmlFor="dd-comp-base">语义底座</label>
                  <select id="dd-comp-base" className="dd-input" value={baseType} onChange={(e) => setBaseType(e.target.value as NodeType)}>
                    {BASE_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>{t.label}（{t.id}）</option>
                    ))}
                  </select>
                </div>
                <div className="dd-modal-field">
                  <label className="dd-field-label" htmlFor="dd-comp-cat">分类</label>
                  <select id="dd-comp-cat" className="dd-input" value={category} onChange={(e) => setCategory(e.target.value)}>
                    {COMPONENT_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="dd-modal-field">
                <label className="dd-field-label" htmlFor="dd-comp-desc">说明（可选）</label>
                <input
                  id="dd-comp-desc"
                  className="dd-input"
                  placeholder="一句话描述这个组件"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>

            <div className="dd-modal-icons">
              <div className="dd-modal-icons-head">
                <span className="dd-field-label">图标（{filteredGlyphs.length}/{GLYPH_LIST.length}）</span>
                <span className="dd-modal-icon-search">
                  <SearchIcon size={14} />
                  <input
                    className="dd-input"
                    placeholder="搜索图标…"
                    value={iconQuery}
                    onChange={(e) => setIconQuery(e.target.value)}
                    aria-label="搜索图标"
                  />
                </span>
              </div>
              <div className="dd-modal-icon-grid" role="listbox" aria-label="组件图标">
                {filteredGlyphs.map((g) => (
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
                {filteredGlyphs.length === 0 && <p className="dd-modal-icon-empty">没有匹配的图标，换个关键词试试。</p>}
              </div>
            </div>
          </div>
        </div>

        <footer className="dd-modal-foot">
          {editing ? (
            <button className="dd-danger" onClick={() => onDelete(editing.id)}>
              <TrashIcon size={15} /> 删除组件
            </button>
          ) : (
            <span className="dd-modal-foot-hint">创建后可在组件库「我的组件」里随时编辑</span>
          )}
          <span className="dd-modal-foot-spacer" />
          {error && <span className="dd-modal-error" role="alert">{error}</span>}
          <button className="dd-ghost" onClick={onClose}>取消</button>
          <button className="dd-primary" onClick={save}>
            <PlusIcon size={16} /> {editing ? '保存组件' : '创建组件'}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
