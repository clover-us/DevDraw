/**
 * AppearanceEditor —— 居中弹窗：编辑「这个节点」的组件外观（身份 + 图标）。
 * 与 ComponentEditor（自定义组件 CRUD）同一套弹窗语言，但编辑对象是节点实例而非组件定义：
 * 换组件身份 / 直挑图标，写进 node.attrs.component / icon 快照——语义底座(baseType)不变，推演照算。
 * 入口：右键节点「编辑外观…」，或抽屉「组件详情」里的编辑按钮。外观编辑从抽屉里搬出来，
 * 抽屉只留只读详情，建模心流不被一大片图标网格打断。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { categoryLabel, componentCatalog, DEFAULT_NODE_ICON, nodeGlyph, resolveComponent } from '../core/components';
import { NODE_TYPES } from '../core/registry';
import type { ComponentDef, Model, ModelNode } from '../core/types';
import { GLYPH_LIST, Glyph } from './glyphs';
import { CloseIcon, PaletteIcon, SearchIcon } from './icons';

interface AppearanceEditorProps {
  model: Model;
  node: ModelNode;
  onApply: (attrs: { component: string; icon: string }) => void;
  onClose: () => void;
}

export function AppearanceEditor({ model, node, onApply, onClose }: AppearanceEditorProps) {
  const [componentId, setComponentId] = useState(typeof node.attrs?.component === 'string' ? node.attrs.component : '');
  const [icon, setIcon] = useState(() => nodeGlyph(model, node));
  const [iconQuery, setIconQuery] = useState('');

  const modalRef = useRef<HTMLDivElement>(null);

  // 打开即锁定背景滚动；卸载还原。
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  const options = useMemo(() => componentCatalog(model).filter((c) => c.baseType === node.type), [model, node.type]);
  const selected = resolveComponent(model, componentId || undefined);
  // 预览即所见即所得：直挑图标 > 组件图标 > 语义类型兜底。
  const previewGlyph = icon || selected?.icon || DEFAULT_NODE_ICON[node.type] || 'component';
  const baseLabel = NODE_TYPES[node.type].label;

  const filteredGlyphs = useMemo(() => {
    const q = iconQuery.trim().toLowerCase();
    if (!q) return GLYPH_LIST;
    return GLYPH_LIST.filter((g) => g.label.toLowerCase().includes(q) || g.id.toLowerCase().includes(q));
  }, [iconQuery]);

  const pickComponent = (comp: ComponentDef | undefined) => {
    if (!comp) {
      setComponentId('');
      setIcon('');
    } else {
      setComponentId(comp.id);
      setIcon(comp.icon);
    }
  };

  const apply = () => onApply({ component: componentId, icon });

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

  return createPortal(
    <div className="dd-modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()} onKeyDown={onKeyDown}>
      <div className="dd-modal" role="dialog" aria-modal="true" aria-labelledby="dd-appearance-modal-title" ref={modalRef}>
        <header className="dd-modal-head">
          <span className="dd-modal-head-glyph">
            <Glyph id={previewGlyph} size={20} />
          </span>
          <div className="dd-modal-titles">
            <h2 id="dd-appearance-modal-title">编辑外观</h2>
            <span className="dd-modal-sub">{node.name} · 换身份 / 图标，不改语义底座</span>
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
                  <Glyph id={previewGlyph} size={22} />
                </span>
                <span className="dd-node-arch-text">
                  <span className="dd-node-kind">{baseLabel}</span>
                  <span className="dd-node-name">{node.name}</span>
                </span>
              </div>
            </div>
            <div className="dd-modal-meta">
              <span className="dd-modal-badge">{baseLabel} · 语义底座</span>
              <span className="dd-modal-badge alt">{selected ? categoryLabel(selected.category) : '默认图标'}</span>
            </div>
            {selected?.description && <p className="dd-modal-desc">{selected.description}</p>}
            <p className="dd-modal-note">
              语义底座决定它参与哪副镜片、推演如何对待它；图标只是皮肤。换身份 / 图标不会改变失效模拟与请求追踪的结论。
            </p>
          </aside>

          {/* 右：身份选择 + 图标库 */}
          <div className="dd-modal-form">
            <div className="dd-modal-fields">
              <div className="dd-modal-field">
                <label className="dd-field-label" htmlFor="dd-appearance-comp">组件身份（不改语义底座，推演照算）</label>
                <select
                  id="dd-appearance-comp"
                  className="dd-input"
                  value={componentId}
                  onChange={(e) => pickComponent(options.find((c) => c.id === e.target.value))}
                >
                  <option value="">按语义类型（默认图标）</option>
                  {options.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="dd-modal-icons">
              <div className="dd-modal-icons-head">
                <span className="dd-field-label">或直挑图标（{filteredGlyphs.length}/{GLYPH_LIST.length}）</span>
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
              <div className="dd-modal-icon-grid" role="listbox" aria-label="节点图标">
                {filteredGlyphs.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    role="option"
                    aria-selected={previewGlyph === g.id}
                    className={`dd-glyph-cell${previewGlyph === g.id ? ' selected' : ''}`}
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
          <span className="dd-modal-foot-hint">应用后写入节点属性，随项目走 · 随 git 走</span>
          <span className="dd-modal-foot-spacer" />
          <button className="dd-ghost" onClick={onClose}>取消</button>
          <button className="dd-primary" onClick={apply}>
            <PaletteIcon size={16} /> 应用外观
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
