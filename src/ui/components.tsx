/**
 * 镜片感知的节点 / 边渲染。一个模型多副镜片：同一组件按 kind / edgeType 切换形态。
 * 架构=失效着色；ER=表卡片（字段折进表内，不再游离）/外键基数；状态机=状态/迁移（缺服务标红）。
 */
import { useEffect, useRef, type ReactNode } from 'react';
import {
  EdgeLabelRenderer,
  Handle,
  Position,
  getBezierPath,
  type EdgeProps,
  type NodeProps,
} from '@xyflow/react';
import type { DependencyMode, EdgeType, NodeState, NodeType } from '../core/types';
import { DEFAULT_NODE_ICON } from '../core/components';
import { ER_ANCHOR_HANDLE, erFieldPort } from '../core/er';
import { longestVerticalMidpoint, routeFkPath, type CardRect } from '../core/er-route';
import { Glyph } from './glyphs';

/** 语义类型 → 兜底图标（节点无组件身份时）。 */
const KIND_GLYPH = DEFAULT_NODE_ICON;

/** 表卡片内的一行字段（从全模型 contains 边折叠而来）。 */
export interface FieldRow {
  id: string;
  name: string;
  dataType?: string;
  nullable?: boolean;
  keyRole?: string;
}

export interface DevDrawNodeData extends Record<string, unknown> {
  name: string;
  kind: NodeType;
  state: NodeState;
  isSeed: boolean;
  highlighted: boolean;
  selected: boolean;
  dataType?: string;
  nullable?: boolean;
  keyRole?: string;
  initial?: boolean;
  fieldCount?: number;
  detail?: string;
  /** 组件图标 glyph id（表现层，来自 node.attrs.icon 快照）。 */
  icon?: string;
  /** 组件名（如 Redis / Kafka），显示在类型行。 */
  componentLabel?: string;
  /** ER 表卡片：内部字段行。 */
  fields?: FieldRow[];
  /** ER 表卡片：被折叠起来的字段数（> 0 时底部显示「还有 N 列」）。 */
  hiddenFields?: number;
  /** 当前是否折叠（只显示键列）。 */
  folded?: boolean;
  /** 字段多到值得折叠时才给按钮。 */
  foldable?: boolean;
  onToggleFold?: (id: string) => void;
  selectedFieldId?: string | null;
  onFieldSelect?: (id: string) => void;
  onSelect: (id: string) => void;
  renaming?: boolean;
  onRename?: (id: string, name: string) => void;
  onRenameCancel?: () => void;
  /** ER 表卡片：正在原地改名的字段 id。 */
  renamingFieldId?: string | null;
  onFieldRenameStart?: (id: string) => void;
  onFieldRename?: (id: string, name: string) => void;
  onFieldRenameCancel?: () => void;
}

/**
 * 原地改名：双击后直接在原文字上编辑（同一个 span，字体/字号/颜色完全不变）。
 * 用 contentEditable 而非 input，避免输入框样式覆盖原字体；Enter 提交、Esc 取消、失焦提交。
 */
function InlineName({
  name,
  renaming,
  className,
  ariaLabel,
  onRename,
  onCancel,
}: {
  name: string;
  renaming?: boolean;
  className?: string;
  ariaLabel: string;
  onRename?: (name: string) => void;
  onCancel?: () => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (renaming) {
      cancelRef.current = false;
      el.textContent = name;
      // 刚建出来的节点还挂在 React Flow 的测量/布局流水线上，这一刻的 focus 会落在
      // 一个尚未接进文档的 span 上（于是静默失败）。所以重试到真正聚焦为止。
      let tries = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const grab = () => {
        const node = ref.current;
        if (!node) return;
        node.focus();
        if (document.activeElement !== node) return;
        const range = document.createRange();
        range.selectNodeContents(node);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        if (timer) clearTimeout(timer);
        timer = undefined;
      };
      grab();
      const retry = () => {
        if (document.activeElement === ref.current) return;
        grab();
        if (document.activeElement !== ref.current && tries++ < 20) timer = setTimeout(retry, 30);
      };
      if (document.activeElement !== el) timer = setTimeout(retry, 30);
      return () => {
        if (timer) clearTimeout(timer);
      };
    }
    if (el.textContent !== name) {
      // 退出编辑：把 DOM 拉回模型值（取消时可能残留输入）。
      el.textContent = name;
    }
    // 仅在进入/退出编辑时同步；编辑期间 name 不变，避免覆盖用户输入。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renaming]);

  return (
    <span
      ref={ref}
      className={`${className ?? ''}${renaming ? ' dd-editing nodrag nowheel' : ''}`}
      contentEditable={renaming}
      suppressContentEditableWarning
      role={renaming ? 'textbox' : undefined}
      aria-label={renaming ? ariaLabel : undefined}
      onClick={(e) => {
        if (renaming) e.stopPropagation();
      }}
      onDoubleClick={(e) => {
        if (renaming) e.stopPropagation();
      }}
      onKeyDown={(e) => {
        if (!renaming) return;
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancelRef.current = true;
          e.currentTarget.textContent = name;
          onCancel?.();
        }
      }}
      onPaste={(e) => {
        if (!renaming) return;
        e.preventDefault();
        document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
      }}
      onBlur={(e) => {
        if (!renaming) return;
        if (cancelRef.current) {
          cancelRef.current = false;
          return;
        }
        onRename?.(e.currentTarget.textContent ?? '');
      }}
    >
      {name}
    </span>
  );
}

const KIND_LABEL: Record<NodeType, string> = {
  Service: '服务',
  Database: '数据库',
  Table: '表',
  Field: '字段',
  Queue: '队列',
  Endpoint: '端点',
  ExternalSystem: '外部系统',
  Actor: '角色',
  Decision: '决策',
  Assumption: '假设',
  Note: '笔记',
  Lifecycle: '生命周期',
  State: '状态',
};

export function DevDrawNode({ id, data }: NodeProps) {
  const d = data as DevDrawNodeData;
  const cls = [
    'dd-node',
    `kind-${d.kind.toLowerCase()}`,
    `state-${d.state}`,
    d.isSeed ? 'seed' : '',
    d.highlighted ? 'highlighted' : '',
    d.selected ? 'selected' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const renameNode = (name: string) => d.onRename?.(id, name);

  let body: ReactNode;
  if (d.kind === 'Table') {
    const fields = d.fields ?? [];
    body = (
      <>
        <div className="dd-table-head">
          <span className="dd-table-glyph">
            <Glyph id={d.icon ?? 'table'} size={16} />
          </span>
          <InlineName
            className="dd-node-name"
            name={d.name}
            renaming={d.renaming}
            ariaLabel="重命名表"
            onRename={renameNode}
            onCancel={d.onRenameCancel}
          />
          <span className="dd-table-count">{d.fieldCount ?? fields.length} 列</span>
          {d.foldable && (
            <button
              type="button"
              className={`dd-table-fold nodrag${d.folded ? ' is-folded' : ''}`}
              title={d.folded ? `展开全部 ${d.fieldCount ?? ''} 列` : '折叠：只显示键列'}
              aria-label={d.folded ? '展开字段' : '折叠字段'}
              onClick={(e) => {
                e.stopPropagation();
                d.onToggleFold?.(id);
              }}
            >
              {d.folded ? '＋' : '－'}
            </button>
          )}
        </div>
        <div className="dd-table-fields">
          {fields.length === 0 && <div className="dd-table-empty">无字段 · 在右侧抽屉添加</div>}
          {fields.map((f) => (
            <div
              key={f.id}
              className={`dd-field-row${d.selectedFieldId === f.id ? ' selected' : ''}${f.keyRole ? ' is-key' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                // 从字段行上的圆点拖线出去会以 click 收尾，别顺手把这一行选中。
                if ((e.target as HTMLElement).closest('.react-flow__handle')) return;
                d.onFieldSelect?.(f.id);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                d.onFieldRenameStart?.(f.id);
              }}
              title="单击查看详情 · 双击改名 · 拖右侧圆点连外键"
            >
              {/* 字段级连线：每个字段行左右各一个锚点，外键线因此能落在"某一列"上。 */}
              <Handle id={erFieldPort('left', f.id)} type="target" position={Position.Left} className="dd-row-handle" />
              {f.keyRole ? (
                <span className={`dd-key dd-key-${f.keyRole.toLowerCase()}`}>{f.keyRole}</span>
              ) : (
                <span className="dd-key-spacer" />
              )}
              <InlineName
                className="dd-field-name"
                name={f.name}
                renaming={d.renamingFieldId === f.id}
                ariaLabel="重命名字段"
                onRename={(name) => d.onFieldRename?.(f.id, name)}
                onCancel={d.onFieldRenameCancel}
              />
              <span className="dd-field-type">{f.dataType}</span>
              {f.nullable && (
                <span className="dd-nullable" title="可空">
                  ?
                </span>
              )}
              <Handle id={erFieldPort('right', f.id)} type="source" position={Position.Right} className="dd-row-handle" />
            </div>
          ))}
          {d.hiddenFields ? (
            <div className="dd-table-more" title={`还有 ${d.hiddenFields} 列，点表头的 ＋ 展开`}>
              还有 {d.hiddenFields} 列
            </div>
          ) : null}
        </div>
      </>
    );
  } else if (d.kind === 'Field') {
    body = (
      <>
        {d.keyRole && <span className={`dd-key dd-key-${d.keyRole.toLowerCase()}`}>{d.keyRole}</span>}
        <InlineName
          className="dd-field-name"
          name={d.name}
          renaming={d.renaming}
          ariaLabel="重命名字段"
          onRename={renameNode}
          onCancel={d.onRenameCancel}
        />
        <span className="dd-field-type">{d.dataType}</span>
        {d.nullable && <span className="dd-nullable" title="可空">?</span>}
      </>
    );
  } else if (d.kind === 'State') {
    body = (
      <>
        <InlineName
          className="dd-node-name"
          name={d.name}
          renaming={d.renaming}
          ariaLabel="重命名状态"
          onRename={renameNode}
          onCancel={d.onRenameCancel}
        />
        {d.initial && <div className="dd-initial-badge">初始</div>}
      </>
    );
  } else if (d.kind === 'Decision' || d.kind === 'Assumption' || d.kind === 'Note') {
    body = (
      <>
        <div className="dd-node-kind">
          <Glyph id={d.icon ?? KIND_GLYPH[d.kind]} size={13} />
          {KIND_LABEL[d.kind]}
        </div>
        <InlineName
          className="dd-node-name"
          name={d.name}
          renaming={d.renaming}
          ariaLabel="重命名"
          onRename={renameNode}
          onCancel={d.onRenameCancel}
        />
        {d.detail && <div className="dd-knowledge-detail">{d.detail}</div>}
      </>
    );
  } else {
    body = (
      <div className="dd-node-arch-row">
        <span className="dd-node-glyph">
          <Glyph id={d.icon ?? KIND_GLYPH[d.kind]} size={22} />
        </span>
        <span className="dd-node-arch-text">
          <span className="dd-node-kind">
            {KIND_LABEL[d.kind]}
            {d.componentLabel ? ` · ${d.componentLabel}` : ''}
          </span>
          <InlineName
            className="dd-node-name"
            name={d.name}
            renaming={d.renaming}
            ariaLabel="重命名节点"
            onRename={renameNode}
            onCancel={d.onRenameCancel}
          />
        </span>
        {d.isSeed && <span className="dd-seed-badge">失效源</span>}
      </div>
    );
  }

  return (
    <div className={cls} onClick={() => d.onSelect(id)}>
      {/*
        表卡片用字段级锚点（上面每行左右各一个），这里的卡片级锚点留着兜底：
        外键列在模型里对不上字段时（例如 N:M 缺中间表），线仍然要有地方落。
        显式给 id，别让 React Flow 按 DOM 顺序把边接到第一行字段上。
      */}
      <Handle
        id={d.kind === 'Table' ? ER_ANCHOR_HANDLE.left : undefined}
        type="target"
        position={Position.Left}
        className={d.kind === 'Table' ? 'dd-anchor-handle' : undefined}
      />
      {body}
      <Handle
        id={d.kind === 'Table' ? ER_ANCHOR_HANDLE.right : undefined}
        type="source"
        position={Position.Right}
        className={d.kind === 'Table' ? 'dd-anchor-handle' : undefined}
      />
    </div>
  );
}

export interface DevDrawEdgeData extends Record<string, unknown> {
  edgeType: EdgeType;
  mode: DependencyMode;
  label?: string;
  impacted: boolean;
  highlighted: boolean;
  cardinality?: string;
  keyCol?: string;
  event?: string;
  missingService?: boolean;
  /** 两端都锚在字段行上：正交走线 + 两端基数标记（1 / N），中段不再压字。 */
  fieldLevel?: boolean;
  /** 同一源字段散出的第几条线：错开竖段，同源的几条外键不会叠成一根。 */
  lane?: number;
  laneCount?: number;
  /** 两端基数标记要不要画：多条线挤同一个字段行时只留一个 1、一个 N。 */
  showSourceTag?: boolean;
  showTargetTag?: boolean;
  /** ER 镜片的外键统一走正交折线（相邻列一段竖段，跨列长边绕开中间列）。 */
  ortho?: boolean;
  /** 本镜片所有卡片的包围盒：正交走线靠它判断会不会横穿别家卡片。 */
  cards?: CardRect[];
  /** 顶部通道的 y（所有卡片之上）：跨列长边绕不开中间列时改走这里。 */
  topY?: number;
  onSelect: (edgeId: string) => void;
}

const HIDDEN_EDGES = new Set<EdgeType>(['contains', 'has-lifecycle', 'encodes']);

interface Pt {
  x: number;
  y: number;
}

/**
 * 正交折线 + 圆角。ER 图更像电路图：横平竖直才追得住线；
 * 贝塞尔在表卡片之间会甩出大弧，弧线从谁身上穿过全看运气。
 */
function orthoPath(points: Pt[], radius = 9): string {
  const first = points[0];
  if (!first) return '';
  let d = `M ${first.x} ${first.y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const outLen = Math.hypot(next.x - cur.x, next.y - cur.y);
    if (inLen < 0.5 || outLen < 0.5) continue;
    const r = Math.min(radius, inLen / 2, outLen / 2);
    const ax = cur.x - ((cur.x - prev.x) / inLen) * r;
    const ay = cur.y - ((cur.y - prev.y) / inLen) * r;
    const bx = cur.x + ((next.x - cur.x) / outLen) * r;
    const by = cur.y + ((next.y - cur.y) / outLen) * r;
    d += ` L ${ax} ${ay} Q ${cur.x} ${cur.y} ${bx} ${by}`;
  }
  const last = points[points.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}

/** 标签牌大致宽度：中文按 10px、拉丁按 6.2px 估（只用来判断会不会压到卡片）。 */
function labelWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += /[\u3000-\u9fff]/.test(ch) ? 10 : 6.2;
  return w + 10;
}

/**
 * 外键走线规则在 core/er-route.ts（纯函数，可单测）：出门 → 列间车道 → 落到目标行 → 进线，
 * 跨列长边遇上中间列的卡片就绕开。这里只负责把它画成圆角折线。
 */
export function DevDrawEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected } = props;
  const d = data as DevDrawEdgeData;
  if (HIDDEN_EDGES.has(d.edgeType)) return null;

  const fieldLevel = d.edgeType === 'fk' && d.fieldLevel === true;
  const lane = d.lane ?? 0;
  const laneCount = d.laneCount ?? 1;
  // ER 的外键一律正交：字段级的两端直接贴行，锚不上字段的（如 N:M 缺中间表）也得横平竖直，
  // 否则一条斜的贝塞尔会从别的表卡片和车道上横穿过去，比没连字段还乱。
  const ortho = d.edgeType === 'fk' && d.ortho === true;
  const points = ortho
    ? routeFkPath({ sx: sourceX, sy: sourceY, tx: targetX, ty: targetY, lane, laneCount, cards: d.cards, topY: d.topY })
    : null;

  let path: string;
  let tagX: number;
  let tagY: number;
  let tagOrigin: 'center' | 'left' | 'right' = 'center';
  if (points) {
    path = orthoPath(points);
    if (fieldLevel) {
      tagX = sourceX;
      tagY = sourceY;
    } else {
      // 卡片级外键：标签挂最长竖段旁边（列间空地），不压线也不压卡片。
      // 只写基数 —— 列名放不进两列之间的过道，而且这种边本来就没解析到具体列（见 title）。
      const mid = longestVerticalMidpoint(points);
      const label = d.cardinality ?? 'FK';
      const width = labelWidth(label);
      const collides = (d.cards ?? []).some(
        (c) => mid.y > c.top - 10 && mid.y < c.bottom + 10 && c.left < mid.x + 8 + width && c.right > mid.x,
      );
      tagX = collides ? mid.x - 8 : mid.x + 8;
      tagY = mid.y;
      tagOrigin = collides ? 'right' : 'left';
    }
  } else {
    [path] = getBezierPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
    });
    // 标签放在哪：规则同正交线的思路 —— 落在两卡之间的空地上，再沿法线抬离连线一小段。
    // 方向固定取左法线，水平边于是标签在上、竖直边在右，相邻边不会互相叠。
    const t = 0.5;
    const bx = sourceX + (targetX - sourceX) * t;
    const by = sourceY + (targetY - sourceY) * t;
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const len = Math.hypot(dx, dy) || 1;
    const gap = 13;
    tagX = bx + (dy / len) * gap;
    tagY = by - (dx / len) * gap;
  }

  let cls: string;
  // 标签只留一句话：依赖模式靠线型与颜色表达，不再挤进标签文字里。
  let text: string;
  if (d.edgeType === 'fk') {
    cls = `edge-fk${d.cardinality === 'N:M' ? ' nm-error' : ''}`;
    // 字段级外键的文字标签不画（基数拆成两端小标记）；卡片级只写基数，列名挂 title。
    text = fieldLevel ? '' : (d.cardinality ?? 'FK');
  } else if (d.edgeType === 'transition') {
    cls = `edge-transition${d.missingService ? ' missing-service' : ''}`;
    text = `${d.event ?? 'transition'}${d.missingService ? ' ⚠ 缺服务' : ''}`;
  } else {
    cls = `mode-${d.mode}`;
    text = d.label || d.edgeType;
  }
  cls += `${d.impacted ? ' impacted' : ''}${d.highlighted ? ' highlighted' : ''}${selected ? ' selected' : ''}`;

  // 字段级外键：基数拆成两端的小标记，紧贴各自那根线出门/进门的拐角。
  // 同源多条线按 lane 往右错开，标记不会叠在一起。
  const [leftCard, rightCard] = (d.cardinality ?? '1:N').split(':');

  return (
    <>
      <path id={id} d={path} fill="none" className={`dd-edge ${cls}`} />
      <path d={path} fill="none" stroke="transparent" strokeWidth={20} style={{ cursor: 'pointer' }} />
      <EdgeLabelRenderer>
        {fieldLevel ? (
          <>
            {d.showSourceTag === false ? null : (
              <div
                className={`dd-edge-card ${cls}`}
                style={{
                  transform: `translate(-50%, -50%) translate(${sourceX + 10 + lane * 15}px, ${sourceY - 10}px)`,
                }}
              >
                {leftCard}
              </div>
            )}
            {d.showTargetTag === false ? null : (
              <div
                className={`dd-edge-card ${cls}`}
                style={{
                  transform: `translate(-50%, -50%) translate(${targetX - 10 - lane * 15}px, ${targetY - 10}px)`,
                }}
              >
                {rightCard}
              </div>
            )}
          </>
        ) : (
          <div
            className={`dd-edge-label ${cls}`}
            title={d.edgeType === 'fk' && d.keyCol ? `${d.cardinality ?? ''} · ${d.keyCol}` : undefined}
            style={{
              transform:
                tagOrigin === 'left'
                  ? `translate(0, -50%) translate(${tagX}px, ${tagY}px)`
                  : tagOrigin === 'right'
                    ? `translate(-100%, -50%) translate(${tagX}px, ${tagY}px)`
                    : `translate(-50%, -50%) translate(${tagX}px, ${tagY}px)`,
            }}
            onClick={(event) => {
              event.stopPropagation();
              d.onSelect(id);
            }}
          >
            {text}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}
