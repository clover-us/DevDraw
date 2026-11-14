/**
 * 镜片感知的节点 / 边渲染。一个模型多副镜片：同一组件按 kind / edgeType 切换形态。
 * 架构=失效着色；ER=表/字段/外键基数；状态机=状态/迁移（缺服务标红）。
 */
import type { ReactNode } from 'react';
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
  highlighted: boolean;
  selected: boolean;
  dataType?: string;
  nullable?: boolean;
  keyRole?: string;
  initial?: boolean;
  fieldCount?: number;
  detail?: string;
  onSelect: (id: string) => void;
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

  let body: ReactNode;
  if (d.kind === 'Field') {
    body = (
      <>
        {d.keyRole && <span className={`dd-key dd-key-${d.keyRole.toLowerCase()}`}>{d.keyRole}</span>}
        <span className="dd-field-name">{d.name}</span>
        <span className="dd-field-type">{d.dataType}</span>
        {d.nullable && <span className="dd-nullable" title="可空">?</span>}
      </>
    );
  } else if (d.kind === 'Table') {
    body = (
      <>
        <div className="dd-node-kind">表</div>
        <div className="dd-node-name">{d.name}</div>
        <div className="dd-table-count">{d.fieldCount ?? 0} 列</div>
      </>
    );
  } else if (d.kind === 'State') {
    body = (
      <>
        <div className="dd-node-name">{d.name}</div>
        {d.initial && <div className="dd-initial-badge">初始</div>}
      </>
    );
  } else if (d.kind === 'Decision' || d.kind === 'Assumption' || d.kind === 'Note') {
    body = (
      <>
        <div className="dd-node-kind">{KIND_LABEL[d.kind]}</div>
        <div className="dd-node-name">{d.name}</div>
        {d.detail && <div className="dd-knowledge-detail">{d.detail}</div>}
      </>
    );
  } else {
    body = (
      <>
        <div className="dd-node-kind">{KIND_LABEL[d.kind]}</div>
        <div className="dd-node-name">{d.name}</div>
        {d.isSeed && <div className="dd-seed-badge">失效源</div>}
      </>
    );
  }

  return (
    <div className={cls} onClick={() => d.onSelect(id)}>
      <Handle type="target" position={Position.Left} />
      {body}
      <Handle type="source" position={Position.Right} />
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
  onSelect: (edgeId: string) => void;
}

const HIDDEN_EDGES = new Set<EdgeType>(['contains', 'has-lifecycle', 'encodes']);

export function DevDrawEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected } = props;
  const d = data as DevDrawEdgeData;
  if (HIDDEN_EDGES.has(d.edgeType)) return null;

  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  let cls: string;
  let text: string;
  if (d.edgeType === 'fk') {
    cls = `edge-fk${d.cardinality === 'N:M' ? ' nm-error' : ''}`;
    text = `${d.cardinality ?? ''}${d.keyCol ? ` · ${d.keyCol}` : ''}`;
  } else if (d.edgeType === 'transition') {
    cls = `edge-transition${d.missingService ? ' missing-service' : ''}`;
    text = `${d.event ?? 'transition'}${d.missingService ? ' ⚠ 缺服务' : ''}`;
  } else {
    cls = `mode-${d.mode}`;
    text = `${d.label ? `${d.label} · ` : ''}${d.edgeType} · ${d.mode}`;
  }
  cls += `${d.impacted ? ' impacted' : ''}${d.highlighted ? ' highlighted' : ''}${selected ? ' selected' : ''}`;

  return (
    <>
      <path id={id} d={path} fill="none" className={`dd-edge ${cls}`} />
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
          {text}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
