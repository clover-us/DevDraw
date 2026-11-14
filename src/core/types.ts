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
  | 'Note'
  | 'Lifecycle'
  | 'State';

export type EdgeType =
  | 'calls'
  | 'reads'
  | 'writes'
  | 'publishes'
  | 'subscribes'
  | 'depends-on'
  | 'contains'
  | 'fk'
  | 'transition'
  | 'has-lifecycle'
  | 'encodes';

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
  /** ER：外键基数 */
  cardinality?: '1:1' | '1:N' | 'N:M';
  /** ER：外键列名 */
  key?: string;
  /** 状态机：触发事件 */
  event?: string;
  /** 状态机→架构：实现该迁移的服务（跨镜片属性引用，避免超图） */
  effectedBy?: string;
  /** 状态机：人工迁移（无服务实现，推演跳过 effectedBy 检查） */
  manual?: boolean;
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

/**
 * 组件定义 —— 类型注册表「是数据不是枚举」的显性化（docs/design/lens-model.md §4）。
 * 组件 = 语义底座(baseType) + 表现身份(icon/category/name)。语义类型保持稳定，
 * 推演器照跑；图标只是皮肤。内置组件在代码目录里，自定义组件存进 model.components，
 * 随项目走、git 友好。节点创建时把 icon 快照进 attrs.icon，删组件不破坏已有节点。
 */
export interface ComponentDef {
  id: string;
  name: string;
  /** 语义底座：决定参与哪副镜片、推演如何对待它（Redis 仍是 Database）。 */
  baseType: NodeType;
  /** 图标 glyph id（见 src/ui/glyphs.tsx）。 */
  icon: string;
  /** 分类 id（见 src/core/components.ts COMPONENT_CATEGORIES）。 */
  category: string;
  description?: string;
  /** 实例化时写入节点的默认属性。 */
  attrs?: Record<string, string | number | boolean>;
}

export interface Model {
  schemaVersion: 1;
  name: string;
  nodes: Record<string, ModelNode>;
  edges: Record<string, ModelEdge>;
  groups?: Record<string, ModelGroup>;
  /** 自定义组件目录（内置组件不入库）。 */
  components?: Record<string, ComponentDef>;
}
