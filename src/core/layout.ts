/**
 * ELK 自动布局 —— 把"几百个节点怎么排"从手写坐标变成算法。
 * 设计依据：docs/design/lens-model.md §10（镜片降维）、用户"真实表结构错综复杂怎么办"关切。
 * 纯异步函数：输入投影（节点+边），输出每节点坐标。布局只读语义，绝不改模型。
 * 用投影内的全部边（含画布隐藏的 contains）做布局 → ER 字段自然聚在所属表下方。
 */
import type { ELK, ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk.bundled.js';
import type { LensId, Projection } from './registry';
import type { NodeType } from './types';

// ELK 引擎约 1.4MB：懒加载成独立异步 chunk，主包保持精简，首次布局时才拉取。
let elkPromise: Promise<ELK> | null = null;
function getElk(): Promise<ELK> {
  if (!elkPromise) {
    elkPromise = import('elkjs/lib/elk.bundled.js').then((m) => new m.default());
  }
  return elkPromise;
}

/** 节点估算尺寸（与 CSS 渲染尺寸近似，供 ELK 计算间距）。 */
const NODE_SIZE: Record<NodeType, { width: number; height: number }> = {
  Service: { width: 160, height: 56 },
  Database: { width: 160, height: 56 },
  Queue: { width: 160, height: 56 },
  Endpoint: { width: 160, height: 56 },
  ExternalSystem: { width: 170, height: 56 },
  Actor: { width: 150, height: 56 },
  Table: { width: 200, height: 70 },
  Field: { width: 200, height: 32 },
  Lifecycle: { width: 180, height: 56 },
  State: { width: 150, height: 50 },
  Decision: { width: 180, height: 72 },
  Assumption: { width: 180, height: 72 },
  Note: { width: 180, height: 72 },
};

/** 每副镜片的主方向：架构/状态机左→右流，ER 表在上字段在下。 */
const DIRECTION: Record<LensId, string> = {
  architecture: 'RIGHT',
  er: 'DOWN',
  'state-machine': 'RIGHT',
};

export type Positions = Record<string, { x: number; y: number }>;

/** 对一副镜片的投影做分层自动布局，返回节点 id → 坐标。 */
export async function layoutProjection(projection: Projection, lens: LensId): Promise<Positions> {
  const children: ElkNode[] = Object.entries(projection.nodes).map(([id, n]) => ({
    id,
    width: NODE_SIZE[n.type].width,
    height: NODE_SIZE[n.type].height,
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
