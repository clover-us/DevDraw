/** DevDraw 语义模型类型 —— 纯数据，无 UI 依赖。详见 docs/design/core-semantics.md §1。 */

export type NodeType =
  | 'Service'
  | 'Database'
  | 'Table'
  | 'Field'
  | 'Queue'
  | 'Endpoint'
  | 'ExternalSystem'
  | 'Actor'
  | 'Decision'
  | 'Assumption'
  | 'Note';

export type EdgeType =
  | 'calls'
  | 'reads'
  | 'writes'
  | 'publishes'
  | 'subscribes'
  | 'depends-on'
  | 'contains';

/** 依赖模式：推演语义的核心。hard=无兜底强依赖；soft=有降级兜底；async=异步缓冲。 */
export type DependencyMode = 'hard' | 'soft' | 'async';

/** 节点状态格：ok < degraded < failed，传播只升不降。 */
export type NodeState = 'ok' | 'degraded' | 'failed';

export interface ModelNode {
  type: NodeType;
  name: string;
  attrs?: Record<string, string | number | boolean>;
  tags?: string[];
  provenance?: { by: 'human' | 'ai' | 'code-import'; at?: string };
}

export interface EdgeAttrs {
  dependency?: DependencyMode;
  fallback?: string;
  latencyMs?: number;
  protocol?: string;
  when?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface ModelEdge {
  type: EdgeType;
  from: string;
  to: string;
  label?: string;
  attrs?: EdgeAttrs;
}

export interface ModelGroup {
  name: string;
  members: string[];
}

export interface Model {
  schemaVersion: 1;
  name: string;
  nodes: Record<string, ModelNode>;
  edges: Record<string, ModelEdge>;
  groups?: Record<string, ModelGroup>;
}
