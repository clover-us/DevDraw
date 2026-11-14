/**
 * ELK 自动布局 —— 把"几百个节点怎么排"从手写坐标变成算法。
 * 设计依据：docs/design/lens-model.md §10（镜片降维）、用户"真实表结构错综复杂怎么办"关切。
 * 纯异步函数：输入投影（节点+边），输出每节点坐标。布局只读语义，绝不改模型。
 *
 * ER 镜片走的是"字段级端口"：每张表把每个字段行报成 ELK 的 port，外键边连具体的
 * 父键行→子外键行。分层算法因此能看见"哪一行接哪一行"，据此决定表卡片的上下顺序，
 * 而不是只知道"这两张表有关系"——交叉少一半，走线也落得准。
 */
import type { ELK, ElkExtendedEdge, ElkNode, ElkPort } from 'elkjs/lib/elk.bundled.js';
import { erFieldPort, erFieldRows, fieldRowOffset, resolveFkLink, tableCardHeight, type ErField } from './er';
import type { LensId, Projection } from './registry';
import type { Model, NodeType } from './types';

// ELK 引擎约 1.4MB：懒加载成独立异步 chunk，主包保持精简，首次布局时才拉取。
let elkPromise: Promise<ELK> | null = null;
function getElk(): Promise<ELK> {
  if (!elkPromise) {
    elkPromise = import('elkjs/lib/elk.bundled.js').then((m) => new m.default());
  }
  return elkPromise;
}

/** 节点固定宽度（与 CSS width 一致，box-sizing:border-box）。长文本在固定宽内换行，不再横向撑开。 */
export const NODE_WIDTH: Record<NodeType, number> = {
  Service: 190,
  Database: 190,
  Queue: 190,
  Endpoint: 190,
  ExternalSystem: 190,
  Actor: 190,
  Table: 232,
  Field: 200,
  Lifecycle: 180,
  State: 160,
  Decision: 220,
  Assumption: 220,
  Note: 220,
};

const ARCH_TYPES = new Set<NodeType>(['Service', 'Database', 'Queue', 'Endpoint', 'ExternalSystem', 'Actor']);
const KNOWLEDGE_TYPES = new Set<NodeType>(['Decision', 'Assumption', 'Note']);

/** 近似文本像素宽：CJK≈1em，ASCII≈0.6em。仅供布局估算换行行数，非精确测量。 */
function textWidth(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of text) w += (ch.codePointAt(0) ?? 0) > 0x2e7f ? fontSize : fontSize * 0.6;
  return w;
}
function lineCount(text: string, contentWidth: number, fontSize: number): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(textWidth(text, fontSize) / contentWidth));
}

/** 节点估算高度：固定宽 + 文本换行行数 → ELK 预留正确竖向空间，长文本卡片不重叠。 */
export function nodeHeight(model: Model | undefined, id: string, type: NodeType, name: string): number {
  if (type === 'Table') return tableHeight(model, id);
  const attrs = model?.nodes[id]?.attrs;
  const detail = typeof attrs?.detail === 'string' ? attrs.detail : '';
  if (KNOWLEDGE_TYPES.has(type)) {
    const content = NODE_WIDTH[type] - 28; // padding 14×2
    const nameH = lineCount(name, content, 13) * 17 + 2;
    const detailH = detail ? lineCount(detail, content, 10) * 14.5 + 3 : 0;
    return Math.ceil(16 + 15 + nameH + detailH); // padding + kind 行 + 名 + 详情
  }
  if (ARCH_TYPES.has(type)) {
    const textW = NODE_WIDTH[type] - 28 - 38 - 10; // padding + glyph + gap
    const nameH = lineCount(name, textW, 13) * 17 + 1;
    return Math.ceil(Math.max(38, 13 + nameH) + 16);
  }
  if (type === 'State') {
    const content = NODE_WIDTH[type] - 36; // padding 18×2
    const initial = attrs?.initial === true;
    return Math.max(50, Math.ceil(lineCount(name, content, 13) * 17 + 20 + (initial ? 12 : 0)));
  }
  if (type === 'Field') return 32;
  return 56; // Lifecycle 等
}

/**
 * 每副镜片的主方向。
 * ER 沿外键父→子从左往右流水：表卡片是"高瘦"的（一列字段往下长），横排更省画布，
 * 也符合大家读 SQL 的习惯（被引用的表在左，引用它的表在右）。
 */
const DIRECTION: Record<LensId, string> = {
  architecture: 'RIGHT',
  er: 'RIGHT',
  'state-machine': 'RIGHT',
};

export type Positions = Record<string, { x: number; y: number }>;

/** 表卡片高度 = 表头 + 字段行（与 .dd-table-* 的 CSS 尺寸同源），让间距贴合真实卡片。 */
function tableHeight(model: Model | undefined, tableId: string): number {
  const base = 74;
  if (!model) return base;
  const count = Object.values(model.edges).filter(
    (e) => e.type === 'contains' && e.from === tableId && model.nodes[e.to]?.type === 'Field',
  ).length;
  return Math.max(base, tableCardHeight(count));
}

/** 各镜片的 ELK 选项：ER 需要"按端口连边 + 正交走线"，其余保持原有的紧凑分层。 */
function layoutOptions(lens: LensId): Record<string, string> {
  const shared = {
    'elk.algorithm': 'layered',
    'elk.direction': DIRECTION[lens],
    'elk.padding': '[top=28,left=28,bottom=28,right=28]',
  };
  if (lens !== 'er') {
    return {
      ...shared,
      'elk.spacing.nodeNode': '36',
      'elk.layered.spacing.nodeNodeBetweenLayers': '96',
      'elk.layered.spacing.edgeNodeBetweenLayers': '28',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
    };
  }
  return {
    ...shared,
    // 外键线走正交折线：ER 图是"电路图"不是"关系网"，横平竖直才看得清谁接了谁。
    'elk.edgeRouting': 'ORTHOGONAL',
    'elk.spacing.nodeNode': '44',
    'elk.spacing.edgeNode': '24',
    'elk.spacing.edgeEdge': '18',
    'elk.layered.spacing.nodeNodeBetweenLayers': '112',
    'elk.layered.spacing.edgeNodeBetweenLayers': '30',
    'elk.layered.spacing.edgeEdgeBetweenLayers': '18',
    // 交叉最少的排序 + 让函数式层级尽量"直"（长边少弯）。
    'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
    'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
    'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
    // 同一层内保持模型里的出现顺序：用户新建的表不会莫名其妙跳到最上面。
    'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    'elk.layered.mergeEdges': 'false',
  };
}

/** 表卡片的字段端口：每个字段行左右各一个，边缘恰好落在卡片边框上（与 handle 的 CSS 对齐）。 */
function tablePorts(rows: ErField[]): ElkPort[] {
  const ports: ElkPort[] = [];
  rows.forEach((row, index) => {
    const y = fieldRowOffset(index);
    ports.push({
      id: erFieldPort('left', row.id),
      x: 0,
      y,
      width: 0,
      height: 0,
      layoutOptions: { 'elk.port.side': 'WEST', 'elk.port.index': String(index * 2) },
    });
    ports.push({
      id: erFieldPort('right', row.id),
      x: NODE_WIDTH.Table,
      y,
      width: 0,
      height: 0,
      layoutOptions: { 'elk.port.side': 'EAST', 'elk.port.index': String(index * 2 + 1) },
    });
  });
  return ports;
}

/**
 * ER 专享后处理：同层（同列）的卡片按原顺序重新贴紧，整列以全图中轴垂直居中。
 *
 * 为什么需要：ELK 的端口对齐（BRANDES_KOEPF）会为了让 `orders.id` 与 `payments.order_id`
 * 尽量水平共线而把整张卡片上下平移。单看一条线确实直，但三层累加后整图变成"斜着往下滑的
 * 阶梯"，列与列之间还留下大块空洞（截图里最明显的问题）。读 ER 图是"一列一列看"的：
 * 列对齐 + 每条边多一个折点，比参差的对角阶梯好读得多，也是 dbdiagram/DataGrip 这类工具的做法。
 */
function packColumns(positions: Positions, heights: Record<string, number>, gap: number): Positions {
  const columns = new Map<number, string[]>();
  for (const [id, p] of Object.entries(positions)) {
    const key = Math.round(p.x);
    const list = columns.get(key);
    if (list) list.push(id);
    else columns.set(key, [id]);
  }
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [id, p] of Object.entries(positions)) {
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y + (heights[id] ?? 0));
  }
  const center = (minY + maxY) / 2;
  const out: Positions = { ...positions };
  for (const ids of columns.values()) {
    // 列内顺序沿用 ELK 的（它已经按交叉最少排过），只改 y，不动 x。
    ids.sort((a, b) => positions[a].y - positions[b].y);
    const total = ids.reduce((sum, id) => sum + (heights[id] ?? 0), 0) + gap * (ids.length - 1);
    let y = center - total / 2;
    for (const id of ids) {
      out[id] = { x: positions[id].x, y: Math.round(y) };
      y += (heights[id] ?? 0) + gap;
    }
  }
  return out;
}

/** 对一副镜片的投影做分层自动布局，返回节点 id → 坐标。传入 model 时按文本/字段数估算节点高度。 */
export async function layoutProjection(projection: Projection, lens: LensId, model?: Model): Promise<Positions> {
  const erModel = lens === 'er' ? model : undefined;
  const rowCache = new Map<string, ErField[]>();
  const rowsOf = (tableId: string): ErField[] => {
    if (!erModel) return [];
    let rows = rowCache.get(tableId);
    if (!rows) {
      rows = erFieldRows(erModel, tableId);
      rowCache.set(tableId, rows);
    }
    return rows;
  };

  const heights: Record<string, number> = {};
  const children: ElkNode[] = Object.entries(projection.nodes).map(([id, n]) => {
    const height = nodeHeight(model, id, n.type, n.name);
    heights[id] = height;
    const node: ElkNode = { id, width: NODE_WIDTH[n.type], height };
    if (erModel && n.type === 'Table') {
      const rows = rowsOf(id);
      if (rows.length > 0) {
        // 行序固定：ELK 只在这些行的上/下沿之间调层级顺序，不重排字段（字段顺序是模型语义）。
        node.layoutOptions = { 'elk.portConstraints': 'FIXED_ORDER' };
        node.ports = tablePorts(rows);
      }
    }
    return node;
  });

  const edges: ElkExtendedEdge[] = Object.entries(projection.edges).map(([id, e]) => {
    const link = erModel ? resolveFkLink(e, rowsOf) : undefined;
    const fromField = link?.fromFieldId;
    const toField = link?.toFieldId;
    return {
      id,
      sources: [fromField ? erFieldPort('right', fromField) : e.from],
      targets: [toField ? erFieldPort('left', toField) : e.to],
    };
  });

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: layoutOptions(lens),
    children,
    edges,
  };

  const elk = await getElk();
  const result = await elk.layout(graph);
  const out: Positions = {};
  for (const child of result.children ?? []) {
    out[child.id] = { x: child.x ?? 0, y: child.y ?? 0 };
  }
  // ER：列对齐后处理（见 packColumns 注释）。其余镜片保持 ELK 原样。
  return lens === 'er' ? packColumns(out, heights, 44) : out;
}