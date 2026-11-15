/**
 * 双击空白画布 → 就地新建。
 *
 * 把「加一个节点」从 4 步（左栏 → 组件库 → 搜索 → 点）压到 2 步（双击 → 回车）。
 * 心流断在建模这一步是最贵的，所以这个面板只做一件事：在鼠标处搜索并落下。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { componentCatalog, DEFAULT_NODE_ICON } from '../core/components';
import { ER_STRUCTURE_TYPES } from '../core/er';
import { NODE_TYPES, type LensDef } from '../core/registry';
import type { ComponentDef, Model, NodeType } from '../core/types';
import { Glyph } from './glyphs';

/** 画布里不该凭空长出来的类型：字段必须挂在表里（否则 ER 又回到"字段游离"）。 */
const NOT_STANDALONE: NodeType[] = ['Field'];
/** 「必须有个归属」的结构卡：表/键挂在库下，状态挂在生命周期下。 */
const SCOPED_TYPES = new Set<NodeType>([...ER_STRUCTURE_TYPES, 'State']);

/** 「在某个库/生命周期下新建」的候选：按 scope 条里的实体展开。 */
export interface QuickTarget {
  parentId: string;
  parentName: string;
  type: NodeType;
  hint: string;
}

interface Item {
  key: string;
  label: string;
  hint: string;
  glyph: string;
  comp?: ComponentDef;
  type?: NodeType;
  target?: QuickTarget;
}

interface Props {
  model: Model;
  lens: LensDef;
  /** 视口坐标（弹层定位）。 */
  x: number;
  y: number;
  /**
   * 当前 scope 允许新建的结构类型：Redis 库里只给键，关系库只给表。
   * `undefined` = 不限制；`[]` = 这个 scope 里不能直接建结构（必须先在候选里选归属）。
   */
  allowStructures?: NodeType[];
  /** scope 是「全部」时：结构卡必须先选归属库/生命周期，这里逐条列出来。 */
  targets?: QuickTarget[];
  emptyHint?: string;
  onPickComponent: (comp: ComponentDef) => void;
  onPickType: (type: NodeType) => void;
  onPickTarget: (type: NodeType, parentId: string) => void;
  onCancel: () => void;
}

export function QuickCreate({ model, lens, x, y, allowStructures, targets, emptyHint, onPickComponent, onPickType, onPickTarget, onCancel }: Props) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const all = useMemo<Item[]>(() => {
    // 结构卡是否允许「裸建」（不选归属）：不允许时它们只出现在 targets 里。
    const structureOk = (t: NodeType) => !SCOPED_TYPES.has(t) || allowStructures === undefined || allowStructures.includes(t);
    const catalog = componentCatalog(model).filter((c) => lens.nodeTypes.includes(c.baseType) && structureOk(c.baseType));
    const covered = new Set(catalog.map((c) => c.baseType));
    const comps: Item[] = catalog.map((comp) => ({
      key: `c:${comp.id}`,
      label: comp.name,
      hint: NODE_TYPES[comp.baseType].label,
      glyph: comp.icon,
      comp,
    }));
    // 该镜片里没有对应组件的类型（ER 的表、状态机的状态）也得能建，否则"就地新建"是残的。
    // createTypes 是可建但不投影的锚点（生命周期）：建完进编辑器起名，画布上以 scope 条呈现。
    const bare: Item[] = [...lens.nodeTypes, ...(lens.createTypes ?? [])]
      .filter((t) => !NOT_STANDALONE.includes(t) && !covered.has(t) && structureOk(t))
      .map((type) => ({
        key: `t:${type}`,
        label: `空白 ${NODE_TYPES[type].label}`,
        hint: lens.createTypes?.includes(type) ? '无组件 · 建完进编辑器起名' : '无组件 · 建完直接改名',
        glyph: DEFAULT_NODE_ICON[type] ?? 'component',
        type,
      }));
    // 先给「建在哪个库下」：在「全部」视图里双击，用户想要的多半就是这件事。
    const scoped: Item[] = (targets ?? []).map((t) => ({
      key: `p:${t.parentId}:${t.type}`,
      label: `在「${t.parentName}」下新建${NODE_TYPES[t.type].label}`,
      hint: `${t.hint} · 归属 ${t.parentName}`,
      glyph: DEFAULT_NODE_ICON[t.type] ?? 'component',
      target: t,
    }));
    return [...scoped, ...comps, ...bare];
  }, [model, lens, allowStructures, targets]);

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
    if (item.target) onPickTarget(item.target.type, item.target.parentId);
    else if (item.comp) onPickComponent(item.comp);
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
          {filtered.length === 0 && <div className="dd-quick-empty">{emptyHint ?? '这副镜片里没有匹配的组件'}</div>}
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