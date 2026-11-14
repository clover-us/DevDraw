/**
 * ELK 自动布局 —— 把"几百个节点怎么排"从手写坐标变成算法。
 * 设计依据：docs/design/lens-model.md §10（镜片降维）、用户"真实表结构错综复杂怎么办"关切。
 * 纯异步函数：输入投影（节点+边），输出每节点坐标。布局只读语义，绝不改模型。
 * ER 镜片字段已折进表卡片：传入全模型时按字段数估算表卡片高度，让间距贴合真实渲染。
 */
import type { ELK, ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk.bundled.js';
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
const NODE_WIDTH: Record<NodeType, number> = {
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
function nodeHeight(model: Model | undefined, id: string, type: NodeType, name: string): number {
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

/** 每副镜片的主方向：架构/状态机左→右流，ER 父表在上子表在下（沿外键方向分层）。 */
const DIRECTION: Record<LensId, string> = {
  architecture: 'RIGHT',
  er: 'DOWN',
  'state-machine': 'RIGHT',
};

export type Positions = Record<string, { x: number; y: number }>;

/** 表卡片高度 ≈ 表头 + 字段行（与 CSS 渲染近似），让 ELK 间距贴合真实卡片。 */
function tableHeight(model: Model | undefined, tableId: string): number {
  const base = 74;
  if (!model) return base;
  const count = Object.values(model.edges).filter(
    (e) => e.type === 'contains' && e.from === tableId && model.nodes[e.to]?.type === 'Field',
  ).length;
  return Math.max(base, 48 + count * 27);
}

/** 对一副镜片的投影做分层自动布局，返回节点 id → 坐标。传入 model 时按文本/字段数估算节点高度。 */
export async function layoutProjection(projection: Projection, lens: LensId, model?: Model): Promise<Positions> {
  const children: ElkNode[] = Object.entries(projection.nodes).map(([id, n]) => ({
    id,
    width: NODE_WIDTH[n.type],
    height: nodeHeight(model, id, n.type, n.name),
  }));
  const edges: ElkExtendedEdge[] = Object.entries(projection.edges).map(([id, e]) => ({
    id,
    sources: [e.from],
    targets: [e.to],
  }));

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': DIRECTION[lens],
      'elk.spacing.nodeNode': '36',
      'elk.layered.spacing.nodeNodeBetweenLayers': '72',
      'elk.layered.spacing.edgeNodeBetweenLayers': '28',
      'elk.padding': '[top=24,left=24,bottom=24,right=24]',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
    },
    children,
    edges,
  };

  const elk = await getElk();
  const result = await elk.layout(graph);
  const out: Positions = {};
  for (const child of result.children ?? []) {
    out[child.id] = { x: child.x ?? 0, y: child.y ?? 0 };
  }
  return out;
}
