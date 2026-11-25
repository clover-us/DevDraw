export type LayerTemplateName =
  | '空白项目'
  | '系统架构拓扑'
  | '数据建模'
  | '云原生部署拓扑'
  | '状态机与时序'
  | '算法与数据流'
  | '接口契约与领域边界';

export type SemanticColor = 'violet' | 'sky' | 'emerald' | 'amber' | 'rose' | 'slate';

export interface EntityVisualStyle {
  color?: SemanticColor;
  borderStyle?: 'solid' | 'dashed' | 'none';
  radius?: 'md' | 'xl' | '2xl';
  accentBar?: 'none' | 'left' | 'top';
  icon?: string;
  iconStyle?: 'filled' | 'outline' | 'plain' | 'hidden';
}

export type EntityStatus = 'active' | 'planned' | 'deprecated';

export type CanvasExpandMode = 'full' | 'related';

export type CanvasViewDensity = 'collapsed' | 'full' | 'related';

export type EdgeRoutingMode = 'bezier' | 'orthogonal';

export type PortSide = 'top' | 'right' | 'bottom' | 'left';

export type CanvasToolMode = 'select' | 'connect' | 'draw';

export type SubCanvasEngine = 'relational' | 'redis';

export type AnnotationKind = 'assumption' | 'decision' | 'note';

export interface ErField {
  key?: 'PK' | 'FK' | 'UK' | '';
  name: string;
  type: string;
  note?: string;
}

export interface KvMeta {
  ttl?: string;
  policy?: string;
  size?: string;
}

export interface NodeLinks {
  repo?: string;
  docs?: string;
  adr?: string;
  dashboard?: string;
}

export interface CrossLayerRef {
  layerId: string;
  subCanvasId?: string;
  nodeId: string;
}

export interface DrillTarget {
  layerId: string;
  subCanvasId?: string;
}

export interface EntityNode {
  id: string;
  /** Stable identifier used in .arch DSL and cross-layer references */
  dslId?: string;
  kind: string;
  title: string;
  tag: string;
  summary?: string;
  note: string;
  color: SemanticColor;
  icon?: string;
  tech?: string;
  status?: EntityStatus;
  owner?: string;
  tags?: string[];
  links?: NodeLinks;
  meta?: Record<string, string>;

  // Geometry (synced with .arch-layout.json)
  x: number;
  y: number;
  w?: number;
  h?: number;
  pinned?: boolean;

  // Data Modeling (ER & Redis KV)
  engine?: SubCanvasEngine;
  fields?: ErField[];
  kv?: KvMeta;
  collapsed?: boolean;

  // Deployment / DDD / FSM / DAG specific fields
  spec?: string;
  aggregate?: string;
  stateRole?: 'initial' | 'active' | 'terminal';
  complexity?: string;

  // Reasoning Annotation link to target entity
  linkNodeId?: string | null;

  // Cross-layer read-only anchor & drill-down navigation
  ref?: CrossLayerRef;
  drillTarget?: DrillTarget;

  /** Independent visual style override (kept decoupled from semantic inspector) */
  customStyle?: EntityVisualStyle;
}

export interface EdgeWaypoint {
  x: number;
  y: number;
}

export interface EdgeResilience {
  timeout?: string;
  retry?: number;
  circuitBreaker?: boolean;
}

export interface RelationEdge {
  id: string;
  from: string;
  to: string;
  fromField?: string;
  toField?: string;
  sourcePort?: PortSide;
  targetPort?: PortSide;
  label: string;
  protocol?: string;
  dashed?: boolean;
  routing?: EdgeRoutingMode;
  curveOffsetX?: number;
  curveOffsetY?: number;
  waypoints?: EdgeWaypoint[];
  resilience?: EdgeResilience;
}

export interface FlowStep {
  order: number;
  from: string;
  to: string;
  edgeId?: string;
  label: string;
  rationale?: string;
  latency?: string;
  parallel?: boolean;
}

export interface FlowScript {
  id: string;
  name: string;
  description?: string;
  steps: FlowStep[];
}

export interface FreehandStroke {
  id: string;
  points: Array<{ x: number; y: number }>;
  color: string;
  width: number;
}

export interface CanvasSlot {
  id: string;
  name: string;
  engine?: SubCanvasEngine;
  nodes: EntityNode[];
  edges: RelationEdge[];
  flows?: FlowScript[];
  freehand?: FreehandStroke[];
  refOrder?: string[];
  /** Optional raw .arch DSL source preserved for lossless roundtrip */
  dslSource?: string;
}

export interface LayerVersionSnapshot {
  id: string;
  name: string;
  createdAt: number;
  nodeCount: number;
  edgeCount: number;
  snapshot: Omit<CanvasSlot, 'dslSource'>;
}

export interface LayerDocument extends CanvasSlot {
  template: LayerTemplateName;
  /** Container layers (e.g. 数据建模) own engine-scoped sub-canvases */
  children?: CanvasSlot[];
  activeChildIndex?: number;
  versions?: LayerVersionSnapshot[];
}

export interface ProjectVersionSnapshot {
  id: string;
  name: string;
  createdAt: number;
  layerCount: number;
  layers: LayerDocument[];
}

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

export interface ViewLayoutOverride {
  viewport?: ViewportState;
  nodes: Record<
    string,
    {
      x: number;
      y: number;
      w?: number;
      h?: number;
      pinned?: boolean;
      collapsed?: boolean;
      customStyle?: EntityVisualStyle;
    }
  >;
  edges: Record<
    string,
    {
      sourcePort?: PortSide;
      targetPort?: PortSide;
      curveOffsetX?: number;
      curveOffsetY?: number;
      waypoints?: EdgeWaypoint[];
      routing?: EdgeRoutingMode;
    }
  >;
  freehand?: FreehandStroke[];
}

/** Stored separately in .arch-layout.json to keep .arch Git diffs clean */
export interface LayoutDocument {
  schemaVersion: 1;
  views: Record<string, ViewLayoutOverride>;
}

export type ProjectCategory = 'personal' | 'team' | 'archived';

export interface AppSettings {
  autoCheckUpdates: boolean;
  updateChannel: 'stable' | 'prerelease';
  defaultLayoutDirection: 'RIGHT' | 'DOWN';
  defaultEdgeRouting: EdgeRoutingMode;
  autoReloadWorkspace: boolean;
  workspaceSyncDelayMs: 240 | 600 | 1200;
  dslCursorSync: boolean;
  flowAutoPlayIntervalMs: 1000 | 1600 | 2500 | 3500;
  lastUpdateCheckAt?: number;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  autoCheckUpdates: true,
  updateChannel: 'stable',
  defaultLayoutDirection: 'RIGHT',
  defaultEdgeRouting: 'bezier',
  autoReloadWorkspace: true,
  workspaceSyncDelayMs: 240,
  dslCursorSync: true,
  flowAutoPlayIntervalMs: 1600,
};

export interface ProjectDocument {
  id: string;
  title: string;
  subtitle: string;
  meta: string;
  category: ProjectCategory;
  type: 'local' | 'cloud';
  icon: string;
  badgeText?: string;
  /** Optional local folder path when backed by Tauri filesystem */
  workspacePath?: string;
  layers: LayerDocument[];
  layout?: LayoutDocument;
  /** Project-level default visual style overrides per entity kind */
  kindStyles?: Record<string, EntityVisualStyle>;
  projectVersions?: ProjectVersionSnapshot[];
  updatedAt: number;
}

export interface StorageAdapter {
  readonly mode: 'tauri-fs' | 'local-storage';
  loadProjects(): Promise<ProjectDocument[]>;
  saveProjects(projects: ProjectDocument[]): Promise<boolean>;
  loadTheme(): Promise<'dark' | 'light'>;
  saveTheme(theme: 'dark' | 'light'): Promise<void>;
  loadSettings?(): Promise<AppSettings>;
  saveSettings?(settings: AppSettings): Promise<void>;
  exportWorkspaceDirectory?(project: ProjectDocument, rootDir: string): Promise<void>;
  openWorkspaceDirectory?(): Promise<{
    project: ProjectDocument;
    diagnostics: Array<{ file: string; line: number; message: string; severity: 'error' | 'warning' }>;
  } | null>;
  bindWorkspaceDirectory?(project: ProjectDocument): Promise<string | null>;
  reloadWorkspaceDirectory?(project: ProjectDocument): Promise<{
    project: ProjectDocument;
    diagnostics: Array<{ file: string; line: number; message: string; severity: 'error' | 'warning' }>;
  } | null>;
  syncWorkspaceDirectory?(project: ProjectDocument): Promise<boolean>;
  watchWorkspaceDirectory?(
    project: ProjectDocument,
    onExternalChange: () => void
  ): Promise<() => void>;
  unbindWorkspaceDirectory?(projectId: string): void;
  hasWorkspaceBinding?(project: ProjectDocument): boolean;
}
