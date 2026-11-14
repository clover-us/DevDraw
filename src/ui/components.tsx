import {
  EdgeLabelRenderer,
  Handle,
  Position,
  getBezierPath,
  type EdgeProps,
  type NodeProps,
} from '@xyflow/react';
import type { DependencyMode, EdgeType, NodeState, NodeType } from '../core/types';

export interface DevDrawNodeData extends Record<string, unknown> {
  name: string;
  kind: NodeType;
  state: NodeState;
  isSeed: boolean;
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
};

export function DevDrawNode({ data }: NodeProps) {
  const d = data as DevDrawNodeData;
  return (
    <div className={`dd-node state-${d.state}${d.isSeed ? ' seed' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="dd-node-kind">{KIND_LABEL[d.kind]}</div>
      <div className="dd-node-name">{d.name}</div>
      {d.isSeed && <div className="dd-seed-badge">失效源</div>}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export interface DevDrawEdgeData extends Record<string, unknown> {
  edgeType: EdgeType;
  mode: DependencyMode;
  label?: string;
  impacted: boolean;
  onSelect: (edgeId: string) => void;
}

export function DevDrawEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected } = props;
  const d = data as DevDrawEdgeData;
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  const cls = `mode-${d.mode}${d.impacted ? ' impacted' : ''}${selected ? ' selected' : ''}`;
  return (
    <>
      {/* 可见边 */}
      <path id={id} d={path} fill="none" className={`dd-edge ${cls}`} />
      {/* 加宽的透明交互层，方便点击 */}
      <path d={path} fill="none" stroke="transparent" strokeWidth={20} style={{ cursor: 'pointer' }} />
      <EdgeLabelRenderer>
        <div
          className={`dd-edge-label ${cls}`}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          onClick={(event) => {
            event.stopPropagation();
            d.onSelect(id);
          }}
        >
          {d.label ? `${d.label} · ` : ''}
          {d.edgeType} · {d.mode}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
