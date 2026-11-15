/**
 * ComponentLibrary —— 左导航"组件库"分区：高辨识度组件目录。
 * 按类别分组，点一下添加到画布中心，或拖拽到画布任意位置。支持自定义组件（CRUD，存模型）。
 * 只显示与当前镜片语义底座匹配的组件（架构镜片看不到 Table 组件，反之亦然）。
 */
import { useEffect, useMemo, useState } from 'react';
import { COMPONENT_CATEGORIES, componentCatalog } from '../core/components';
import type { LensDef } from '../core/registry';
import type { ComponentDef, Model } from '../core/types';
import { Glyph } from './glyphs';
import { CloseIcon, ComponentIcon, PencilIcon, PlusIcon, SearchIcon, TrashIcon } from './icons';

/** 拖拽载荷 MIME：App.onDrop 据此识别组件。 */
export const COMPONENT_MIME = 'application/devdraw-component';

interface ComponentLibraryProps {
  model: Model;
  lens: LensDef;
  onAdd: (comp: ComponentDef) => void;
  onCreateCustom: () => void;
  onEditCustom: (comp: ComponentDef) => void;
  onDeleteCustom: (id: string) => void;
  onClose: () => void;
}

export function ComponentLibrary({
  model,
  lens,
  onAdd,
  onCreateCustom,
  onEditCustom,
  onDeleteCustom,
  onClose,
}: ComponentLibraryProps) {
  const [query, setQuery] = useState('');
  // 删除自定义组件两步确认：先上膛（图标变红呼吸），再点一次才真删，3s 不点自动解除。
  // 与抽屉删除 / 重置示例同一套语言，破坏性动作不再一键直达。
  const [armedDelete, setArmedDelete] = useState<string | null>(null);
  useEffect(() => {
    if (!armedDelete) return;
    const t = window.setTimeout(() => setArmedDelete(null), 3000);
    return () => window.clearTimeout(t);
  }, [armedDelete]);
  const customIds = useMemo(() => new Set(Object.keys(model.components ?? {})), [model.components]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return componentCatalog(model).filter((c) => {
      if (!lens.nodeTypes.includes(c.baseType)) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.description ?? '').toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q)
      );
    });
  }, [model, lens, query]);

  const custom = filtered.filter((c) => customIds.has(c.id));
  const groups = COMPONENT_CATEGORIES.map((cat) => ({
    cat,
    items: filtered.filter((c) => c.category === cat.id && !customIds.has(c.id)),
  })).filter((g) => g.items.length > 0);

  const dragProps = (comp: ComponentDef) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(COMPONENT_MIME, comp.id);
      e.dataTransfer.effectAllowed = 'copy';
    },
  });

  return (
    <aside className="dd-navpanel section-library" aria-label="组件库">
      <div className="dd-navpanel-head">
        <div>
          <h2>组件库</h2>
          <span className="dd-navpanel-sub">{lens.label}镜片 · 点添加 / 拖入画布</span>
        </div>
        <button className="dd-icon-btn" onClick={onClose} title="收起面板" aria-label="收起面板">
          <CloseIcon size={16} />
        </button>
      </div>

      <button className="dd-create-btn" onClick={onCreateCustom}>
        <PlusIcon size={16} /> 新建自定义组件
      </button>

      <div className="dd-search">
        <SearchIcon size={15} />
        <input
          placeholder="搜索组件（Redis / 网关 / 缓存…）"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="搜索组件"
        />
      </div>

      <div className="dd-entity-scroll">
        {filtered.length === 0 && <p className="dd-empty">没有匹配的组件。试试别的关键词，或新建自定义组件。</p>}

        {custom.length > 0 && (
          <div className="dd-entity-group">
            <div className="dd-entity-group-head">
              <ComponentIcon size={14} />
              我的组件
              <span className="dd-entity-group-count">{custom.length}</span>
            </div>
            {custom.map((c) => (
              <div key={c.id} className="dd-comp-item custom" {...dragProps(c)} title={`${c.description ?? c.name} · 点击添加 / 拖入画布`}>
                <button className="dd-comp-main" onClick={() => onAdd(c)}>
                  <span className="dd-comp-glyph">
                    <Glyph id={c.icon} size={22} />
                  </span>
                  <span className="dd-comp-text">
                    <span className="dd-comp-name">{c.name}</span>
                    <span className="dd-comp-desc">{c.description ?? '自定义组件'}</span>
                  </span>
                </button>
                <span className="dd-comp-actions">
                  <button className="dd-icon-btn" onClick={() => onEditCustom(c)} title="编辑组件" aria-label={`编辑 ${c.name}`}>
                    <PencilIcon size={14} />
                  </button>
                  <button
                    className={`dd-icon-btn danger${armedDelete === c.id ? ' armed' : ''}`}
                    onClick={() => (armedDelete === c.id ? onDeleteCustom(c.id) : setArmedDelete(c.id))}
                    title={armedDelete === c.id ? '再点一次确认删除' : '删除组件'}
                    aria-label={armedDelete === c.id ? `确认删除 ${c.name}` : `删除 ${c.name}`}
                  >
                    <TrashIcon size={14} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}

        {groups.map((g) => (
          <div key={g.cat.id} className="dd-entity-group">
            <div className="dd-entity-group-head">
              {g.cat.label}
              <span className="dd-entity-group-count">{g.items.length}</span>
            </div>
            {g.items.map((c) => (
              <button key={c.id} className="dd-comp-item" {...dragProps(c)} onClick={() => onAdd(c)} title={`${c.description ?? c.name} · 点击添加 / 拖入画布`}>
                <span className="dd-comp-glyph">
                  <Glyph id={c.icon} size={22} />
                </span>
                <span className="dd-comp-text">
                  <span className="dd-comp-name">{c.name}</span>
                  <span className="dd-comp-desc">{c.description ?? ''}</span>
                </span>
                <span className="dd-comp-add">
                  <PlusIcon size={14} />
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>

      <p className="dd-library-foot">语义底座稳定，图标只是皮肤——Redis 仍按 Database 参与推演。</p>
    </aside>
  );
}