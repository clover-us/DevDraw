/**
 * ER 列式排版：ELK 只负责"谁在哪一列"，这一层负责"列里谁在上、整列怎么对齐"。
 *
 * 为什么 ELK 之后还要排一次：分层算法关心的是"边少交叉"，它对节点坐标只有软约束。
 * 端口对齐（BRANDES_KOEPF）为了让 `orders.id` 与 `payments.order_id` 共线，会把整张卡片
 * 上下平移；三层累加整图就成了斜着下滑的阶梯，列与列之间还留下大块空洞。
 *
 * 这里做两件事，都是纯函数、可单测：
 * 1. **列内排序**：按"相邻列里邻居的中位高度"排（barycenter）。被引用的表因此总往父表那一侧
 *    靠，边更短、交叉更少；邻居信息缺失时退化成"被引用次数多的在上"，再退化成模型顺序。
 * 2. **列内贴紧 + 整列垂直居中**：只动 y 不动 x。代价是每条边多一个折点，但"一列一列读"
 *    的 ER 图本来就该是列齐的（dbdiagram / DataGrip 同做法）。
 */
export type Positions = Record<string, { x: number; y: number }>;

export interface ArrangeEdge {
  from: string;
  to: string;
}

/** 同一列 = x 四舍五入后相等（ELK 给同层节点同一个 x）。 */
export function columnKey(x: number): number {
  return Math.round(x);
}

/**
 * 列间距容差：ELK 偶尔会把同一层的两张卡排成 x 差十几像素（端口/宽度不同的副作用），
 * 用"四舍五入相等"去分列就会把它们当成两列，各自竖排、互相压住。这里按容差聚类：
 * 相邻列的真实间距至少是一张卡宽 + 层间距（≥ 340），48px 以内一定是同一列。
 */
export const COLUMN_TOLERANCE = 48;

export function groupColumns(positions: Positions, tolerance = COLUMN_TOLERANCE): Map<number, string[]> {
  const xs = [...new Set(Object.values(positions).map((p) => p.x))].sort((a, b) => a - b);
  const anchorOf = new Map<number, number>();
  let anchor = xs[0];
  for (const x of xs) {
    if (x - anchor > tolerance) anchor = x;
    anchorOf.set(x, Math.round(anchor));
  }
  const columns = new Map<number, string[]>();
  for (const [id, p] of Object.entries(positions)) {
    const key = anchorOf.get(p.x) ?? columnKey(p.x);
    const list = columns.get(key);
    if (list) list.push(id);
    else columns.set(key, [id]);
  }
  return columns;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 一列内部的堆叠：从上往下按 gap 贴紧，整列以 center 为中轴。返回 id → y。 */
function stackColumn(
  order: string[],
  heights: Record<string, number>,
  gap: number,
  center: number,
): Record<string, number> {
  const total = order.reduce((sum, id) => sum + (heights[id] ?? 0), 0) + gap * Math.max(0, order.length - 1);
  let y = center - total / 2;
  const out: Record<string, number> = {};
  for (const id of order) {
    out[id] = Math.round(y);
    y += (heights[id] ?? 0) + gap;
  }
  return out;
}

/**
 * 列内排序 + 贴紧 + 垂直居中。x 一律不动（列的位置由 ELK 的分层决定）。
 * `sweeps` 是"从左往右、从右往左"的排序轮数：两轮就够收敛，给默认 2。
 */
export function arrangeColumns(
  positions: Positions,
  heights: Record<string, number>,
  edges: ArrangeEdge[],
  gap: number,
  sweeps = 2,
): Positions {
  const ids = Object.keys(positions);
  if (ids.length === 0) return positions;

  const columns = groupColumns(positions);
  const columnKeys = [...columns.keys()].sort((a, b) => a - b);
  // 每张卡属于哪一列：聚类结果（容差内的 x 视作同一列），后面排序、贴紧、对齐都用它。
  const colOf = new Map<string, number>();
  for (const [key, list] of columns) for (const id of list) colOf.set(id, key);

  // 邻居表（无向）：排序只看"对面那一列"的邻居落在什么高度。
  const neighbors = new Map<string, string[]>();
  for (const id of ids) neighbors.set(id, []);
  for (const e of edges) {
    if (!neighbors.has(e.from) || !neighbors.has(e.to) || e.from === e.to) continue;
    neighbors.get(e.from)!.push(e.to);
    neighbors.get(e.to)!.push(e.from);
  }
  // 被引用次数：邻居缺席时的兜底排序键（父表在上）。
  const inbound = new Map<string, number>();
  for (const id of ids) inbound.set(id, 0);
  for (const e of edges) if (inbound.has(e.to) && e.from !== e.to) inbound.set(e.to, inbound.get(e.to)! + 1);

  // 初始顺序：ELK 给的 y（它已经按交叉最少排过）。
  const order = new Map<number, string[]>();
  for (const key of columnKeys) {
    const list = [...columns.get(key)!].sort((a, b) => positions[a].y - positions[b].y || a.localeCompare(b));
    order.set(key, list);
  }

  const heightOf = (id: string) => heights[id] ?? 0;
  const modelIndex = new Map<string, number>(ids.map((id, i) => [id, i]));

  let current = { ...positions };
  const totalMinY = Math.min(...ids.map((id) => positions[id].y));
  const totalMaxY = Math.max(...ids.map((id) => positions[id].y + heightOf(id)));
  const center = (totalMinY + totalMaxY) / 2;

  for (let sweep = 0; sweep < sweeps; sweep++) {
    const forward = sweep % 2 === 0;
    const seq = forward ? columnKeys : [...columnKeys].reverse();
    for (const key of seq) {
      const list = order.get(key)!;
      const desired = new Map<string, number>();
      for (const id of list) {
        const otherCols = (neighbors.get(id) ?? []).filter((n) => colOf.get(n) !== key);
        if (otherCols.length > 0) {
          desired.set(id, median(otherCols.map((n) => current[n].y + heightOf(n) / 2)));
        } else {
          desired.set(id, current[id].y + heightOf(id) / 2);
        }
      }
      list.sort((a, b) => {
        const d = desired.get(a)! - desired.get(b)!;
        if (Math.abs(d) > 0.5) return d;
        const ref = (inbound.get(b) ?? 0) - (inbound.get(a) ?? 0);
        if (ref !== 0) return ref;
        return (modelIndex.get(a) ?? 0) - (modelIndex.get(b) ?? 0);
      });
      const stacked = stackColumn(list, heights, gap, center);
      for (const id of list) current[id] = { x: current[id].x, y: stacked[id] };
    }
  }

  const out: Positions = {};
  // x 统一对齐到列的锚点：同层两张卡的 x 差十几像素是 ELK 的副作用，对齐后列才真的齐。
  for (const id of ids) out[id] = { x: colOf.get(id) ?? columnKey(positions[id].x), y: current[id].y };
  return out;
}

export interface ReflowEntry {
  id: string;
  y: number;
  height: number;
}

/**
 * 游离节点（没有任何连线的卡）单独成区：排在主图右侧，按列竖排。
 *
 * 为什么不能交给 ELK：分层算法对"没有边的节点"没有约束，它们会被塞进任意一层的空隙里，
 * 于是空表、游离笔记就压在别的卡片上（实测 4 处重叠）。而 ER 图里"还没连上的表"恰恰是
 * 最需要被看见的东西——它得有个固定的落脚处，而不是随机漂在图上。
 *
 * 规则：主图最右边界 + `gap` 起，每列最多 `perColumn` 张，列宽取该列最宽的卡，列间 `gap`。
 * 纵向从主图顶边开始排，不参与主图的垂直居中（否则主图一长，游离区就被推到画布外）。
 */
export function placeIsolated(
  isolated: string[],
  widths: Record<string, number>,
  heights: Record<string, number>,
  mainRight: number,
  mainTop: number,
  gap: number,
  perColumn = 4,
): Positions {
  const out: Positions = {};
  if (isolated.length === 0) return out;
  let x = mainRight + gap;
  for (let start = 0; start < isolated.length; start += perColumn) {
    const column = isolated.slice(start, start + perColumn);
    const width = Math.max(...column.map((id) => widths[id] ?? 0));
    let y = mainTop;
    for (const id of column) {
      out[id] = { x: Math.round(x), y: Math.round(y) };
      y += (heights[id] ?? 0) + gap;
    }
    x += width + gap;
  }
  return out;
}

/**
 * 拖完一张卡之后，把它所在的这一列重新贴紧（只在这一列内部动）。
 *
 * `pinned` 是刚被拖动的卡：它必须停在用户放下的地方，其余卡往上/往下让位——
 * 拖拽是明确的人工意图，布局只能服从，不能把它"弹回去"。
 */
export function reflowColumn(entries: ReflowEntry[], gap: number, pinned?: { id: string; y: number }): Record<string, number> {
  if (entries.length === 0) return {};
  const list = entries
    .map((e) => (pinned && e.id === pinned.id ? { ...e, y: pinned.y } : e))
    .sort((a, b) => a.y - b.y || a.id.localeCompare(b.id));
  const out: Record<string, number> = {};
  let cursor = Math.min(...list.map((e) => e.y));
  for (const e of list) {
    const y = Math.max(cursor, Math.round(e.y));
    out[e.id] = y;
    cursor = y + e.height + gap;
  }
  return out;
}

/**
 * 折叠/展开之后：只在"这一列"里重码，锚点是刚被点的那张卡。
 *
 * 为什么不整图重排：折叠是"我点的那张卡变小了"，不是"整个图重画一遍"。
 * 整图重排（连垂直居中一起算）会让其他列的卡都跟着挪几十像素，看起来像是
 * "我点的没动、别人全动了"。这里只让锚点下方那几张往上补位，其余原封不动。
 *
 * 锚点自己的顶边保持不动——鼠标还停在那个 ＋/－ 上，卡在手指底下跳会很怪；
 * 变的是它的底边，以及下面那几张的顶边。
 */
export function packAround(entries: ReflowEntry[], gap: number, anchorId: string, anchorY: number): Record<string, number> {
  const anchor = entries.find((e) => e.id === anchorId);
  if (!anchor) return {};
  const out: Record<string, number> = {};
  const above = entries.filter((e) => e.id !== anchorId && e.y < anchorY).sort((a, b) => a.y - b.y);
  const below = entries.filter((e) => e.id !== anchorId && e.y >= anchorY).sort((a, b) => a.y - b.y);
  for (const e of above) out[e.id] = e.y;
  let cursor = Math.round(anchorY);
  out[anchorId] = cursor;
  cursor += anchor.height + gap;
  for (const e of below) {
    out[e.id] = cursor;
    cursor += e.height + gap;
  }
  return out;
}