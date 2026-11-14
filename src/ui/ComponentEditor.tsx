/**
 * ComponentEditor —— 右侧抽屉：自定义组件 CRUD。
 * 定义名字 + 语义底座(baseType) + 分类 + 图标 + 说明，存进 model.components（git 友好）。
 * 图标从内置 glyph 库挑选；语义底座决定它参与哪副镜片、推演如何对待它。
 */
import { useEffect, useState, type ReactNode } from 'react';
import { COMPONENT_CATEGORIES } from '../core/components';
import { newComponentId } from '../core/id';
import { NODE_TYPES } from '../core/registry';
import type { ComponentDef, NodeType } from '../core/types';
import { GLYPH_LIST, Glyph } from './glyphs';
import { CloseIcon, PlusIcon, TrashIcon } from './icons';

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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setName(editing?.name ?? '');
    setBaseType(editing?.baseType ?? 'Service');
    setCategory(editing?.category ?? 'compute');
    setDescription(editing?.description ?? '');
    setIcon(editing?.icon ?? 'service');
  }, [editing]);

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('请给组件起个名字');
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

  return (
    <aside className="dd-drawer" aria-label="自定义组件编辑器">
      <div className="dd-drawer-head">
        <div className="dd-drawer-titles">
          <h2>{editing ? '编辑组件' : '新建自定义组件'}</h2>
          <span className="dd-drawer-sub">{editing ? editing.id : '存进项目 · 随 git 走'}</span>
        </div>
        <button className="dd-icon-btn" onClick={onClose} title="关闭抽屉" aria-label="关闭抽屉">
          <CloseIcon size={16} />
        </button>
      </div>

      <div className="dd-drawer-body">
        <section className="dd-drawer-section">
          <div className="dd-drawer-section-head">
            <h3>预览</h3>
          </div>
          <div className="dd-comp-preview">
            <span className="dd-comp-glyph">
              <Glyph id={icon} size={26} />
            </span>
            <span className="dd-comp-text">
              <span className="dd-comp-name">{name.trim() || '组件名称'}</span>
              <span className="dd-comp-desc">{description.trim() || '一句话说明'}</span>
            </span>
          </div>
        </section>

        <section className="dd-drawer-section">
          <div className="dd-drawer-section-head">
            <h3>基本信息</h3>
          </div>
          <label className="dd-field-label">名称</label>
          <input className="dd-input" autoFocus placeholder="如 ClickHouse / 内部网关" value={name} onChange={(e) => setName(e.target.value)} />

          <label className="dd-field-label">语义底座（决定参与哪副镜片、推演如何对待）</label>
          <select className="dd-input" value={baseType} onChange={(e) => setBaseType(e.target.value as NodeType)}>
            {BASE_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}（{t.id}）
              </option>
            ))}
          </select>

          <label className="dd-field-label">分类</label>
          <select className="dd-input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {COMPONENT_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>

          <label className="dd-field-label">说明</label>
          <input className="dd-input" placeholder="一句话描述这个组件" value={description} onChange={(e) => setDescription(e.target.value)} />
        </section>

        <section className="dd-drawer-section dd-grow">
          <div className="dd-drawer-section-head">
            <h3>图标（{GLYPH_LIST.length}）</h3>
          </div>
          <div className="dd-glyph-grid">
            {GLYPH_LIST.map((g) => (
              <button
                key={g.id}
                className={`dd-glyph-cell${icon === g.id ? ' selected' : ''}`}
                onClick={() => setIcon(g.id)}
                title={g.label}
                aria-pressed={icon === g.id}
              >
                <Glyph id={g.id} size={20} />
                <span className="dd-glyph-label">{g.label}</span>
              </button>
            ))}
          </div>
        </section>

        <button className="dd-primary dd-block" onClick={save}>
          <PlusIcon size={16} /> {editing ? '保存组件' : '创建组件'}
        </button>
        {editing && (
          <button className="dd-danger dd-block" onClick={() => onDelete(editing.id)}>
            <TrashIcon size={16} /> 删除组件
          </button>
        )}
        <p className="dd-hint-text">删除组件不会破坏已建模的节点——节点已把图标快照进自己的属性。</p>
        {error && <p className="dd-model-error">{error}</p>}
      </div>
    </aside>
  );
}

/** 复用抽屉外壳（与 EntityDrawer 同款样式）。 */
export function DrawerShell({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: ReactNode }) {
  return (
    <aside className="dd-drawer" aria-label="详情抽屉">
      <div className="dd-drawer-head">
        <div className="dd-drawer-titles">
          <h2>{title}</h2>
          <span className="dd-drawer-sub">{subtitle}</span>
        </div>
        <button className="dd-icon-btn" onClick={onClose} title="关闭抽屉" aria-label="关闭抽屉">
          <CloseIcon size={16} />
        </button>
      </div>
      <div className="dd-drawer-body">{children}</div>
    </aside>
  );
}