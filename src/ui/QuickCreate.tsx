/**
 * 双击空白画布 → 就地新建。
 *
 * 把「加一个节点」从 4 步（左栏 → 组件库 → 搜索 → 点）压到 2 步（双击 → 回车）。
 * 心流断在建模这一步是最贵的，所以这个面板只做一件事：在鼠标处搜索并落下。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { componentCatalog } from '../core/components';
import { NODE_TYPES, type LensDef } from '../core/registry';
import type { ComponentDef, Model, NodeType } from '../core/types';
import { Glyph } from './glyphs';

/** 画布里不该凭空长出来的类型：字段必须挂在表里（否则 ER 又回到"字段游离"）。 */
const NOT_STANDALONE: NodeType[] = ['Field'];

interface Item {
  key: string;
  label: string;
  hint: string;
  glyph: string;
  comp?: ComponentDef;
  type?: NodeType;
}

interface Props {
  model: Model;
  lens: LensDef;
  /** 视口坐标（弹层定位）。 */
  x: number;
  y: number;
  onPickComponent: (comp: ComponentDef) => void;
  onPickType: (type: NodeType) => void;
  onCancel: () => void;
}

export function QuickCreate({ model, lens, x, y, onPickComponent, onPickType, onCancel }: Props) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const all = useMemo<Item[]>(() => {
    const catalog = componentCatalog(model).filter((c) => lens.nodeTypes.includes(c.baseType));
    const covered = new Set(catalog.map((c) => c.baseType));
    const comps: Item[] = catalog.map((comp) => ({
      key: `c:${comp.id}`,
      label: comp.name,
      hint: NODE_TYPES[comp.baseType].label,
      glyph: comp.icon,
      comp,
    }));
    // 该镜片里没有对应组件的类型（ER 的表、状态机的状态）也得能建，否则"就地新建"是残的。
    const bare: Item[] = lens.nodeTypes
      .filter((t) => !NOT_STANDALONE.includes(t) && !covered.has(t))
      .map((type) => ({
        key: `t:${type}`,
        label: `空白 ${NODE_TYPES[type].label}`,
        hint: '无组件 · 建完直接改名',
        glyph: 'component',
        type,
      }));
    return [...comps, ...bare];
  }, [model, lens]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((i) => `${i.label} ${i.hint}`.toLowerCase().includes(q));
  }, [all, query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  const pick = (item: Item | undefined) => {
    if (!item) return;
    if (item.comp) onPickComponent(item.comp);
    else if (item.type) onPickType(item.type);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        pick(filtered[cursor]);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // pick 依赖 filtered/cursor，直接跟着重建最省心
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, cursor, onCancel]);

  // 键盘移动选中项时保持可见
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${cursor}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const W = 300;
  const H = 336;
  const left = Math.min(x, window.innerWidth - W - 12);
  const top = Math.min(y, window.innerHeight - H - 12);

  return (
    <>
      <div className="dd-popover-overlay" onMouseDown={onCancel} />
      <div className="dd-popover dd-quick-create" style={{ left, top, width: W }} role="dialog" aria-label="就地新建">
        <input
          ref={inputRef}
          className="dd-quick-input"
          placeholder="搜组件或类型，回车创建"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="dd-quick-list" ref={listRef}>
          {filtered.length === 0 && <div className="dd-quick-empty">这副镜片里没有匹配的组件</div>}
          {filtered.map((item, idx) => (
            <button
              key={item.key}
              type="button"
              data-idx={idx}
              className={`dd-quick-item${idx === cursor ? ' on' : ''}`}
              onMouseEnter={() => setCursor(idx)}
              onClick={() => pick(item)}
            >
              <span className="dd-quick-glyph">
                <Glyph id={item.glyph} size={16} />
              </span>
              <span className="dd-quick-text">
                <span className="dd-quick-label">{item.label}</span>
                <span className="dd-quick-hint">{item.hint}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="dd-quick-foot">
          <span>↑↓ 选 · 回车建</span>
          <span>Esc 取消</span>
        </div>
      </div>
    </>
  );
}