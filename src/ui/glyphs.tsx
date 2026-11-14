/**
 * 组件图标库 —— 高辨识度内联 SVG glyph（无外部依赖、离线、无版权顾虑）。
 * 风格统一：24×24 viewBox、1.7px 描边、继承 currentColor，光暗双主题自动适配。
 * 这些是「分类/技术风格化图标」而非官方品牌 logo：一眼认出容器/编排/缓存/消息队列…，
 * 真实品牌 logo 包作为后续增量。glyph id 是稳定字符串，存进 node.attrs.icon 与组件定义。
 */
import type { ComponentType, SVGProps } from 'react';

export type GlyphProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 20, ...rest }: GlyphProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    ...rest,
  };
}

/* ── 计算 ─────────────────────────────────────────────── */

/** 通用服务：六边形网格节点。 */
export function ServiceGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** 容器：堆叠的集装箱 + 波浪基线（Docker 意象）。 */
export function ContainerGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <rect x="4" y="9" width="4" height="3.4" rx="0.5" />
      <rect x="9" y="9" width="4" height="3.4" rx="0.5" />
      <rect x="14" y="9" width="4" height="3.4" rx="0.5" />
      <rect x="9" y="5" width="4" height="3.4" rx="0.5" />
      <path d="M2.5 15.5c2 2.4 5 3.5 9.5 3.5s7.5-1.1 9.5-3.5c-1.6.6-3.2.8-4.8.6" />
    </svg>
  );
}

/** 编排：船舵（Kubernetes 意象）。 */
export function OrchestrationGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="8.2" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.8V9M12 15v5.2M3.8 12H9M15 12h5.2M6.2 6.2l3.6 3.6M14.2 14.2l3.6 3.6M17.8 6.2l-3.6 3.6M9.8 14.2l-3.6 3.6" />
    </svg>
  );
}

/** 函数计算：λ。 */
export function FunctionGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <path d="M8 4h2.2L15 20h2.5" />
      <path d="M13.2 9.5L7 20" />
    </svg>
  );
}

/** 服务器机架。 */
export function ServerGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <rect x="4" y="3.5" width="16" height="7" rx="1.5" />
      <rect x="4" y="13.5" width="16" height="7" rx="1.5" />
      <path d="M7.5 7h.01M7.5 17h.01M11 7h5M11 17h5" />
    </svg>
  );
}

/** 角色 / 用户。 */
export function ActorGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}

/** 终端客户端：浏览器窗口。 */
export function ClientGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="M3 9h18M6 6.8h.01M8.6 6.8h.01" />
    </svg>
  );
}

/* ── 网关与流量 ───────────────────────────────────────── */

/** 端点：地球。 */
export function EndpointGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.6 2.3 2.6 14.7 0 17M12 3.5c-2.6 2.3-2.6 14.7 0 17" />
    </svg>
  );
}

/** API 网关：门 + 穿行箭头。 */
export function GatewayGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <path d="M5 20V6.5a7 7 0 0 1 14 0V20" />
      <path d="M3 20h18" />
      <path d="M9 13h6M13 10.5l2.5 2.5-2.5 2.5" />
    </svg>
  );
}

/** Ingress：入口门 + 向内箭头。 */
export function IngressGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <path d="M13 4h6a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-6" />
      <path d="M3 12h10M10 8.5l3.5 3.5-3.5 3.5" />
    </svg>
  );
}

/** 负载均衡：一分三。 */
export function LoadBalancerGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <circle cx="4.5" cy="12" r="1.8" />
      <circle cx="19" cy="5.5" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
      <circle cx="19" cy="18.5" r="1.8" />
      <path d="M6.3 12H11m0 0l6-6.2M11 12h6.2M11 12l6 6.2" />
    </svg>
  );
}

/** CDN：地球 + 分发节点。 */
export function CdnGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="5" />
      <path d="M7 12h10M12 7c1.8 1.6 1.8 8.4 0 10M12 7c-1.8 1.6-1.8 8.4 0 10" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2" />
    </svg>
  );
}

/** 防火墙：砖墙。 */
export function FirewallGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <rect x="3.5" y="5" width="17" height="14" rx="1.5" />
      <path d="M3.5 9.7h17M3.5 14.3h17M9 5v4.7M15 9.7v4.6M9 14.3V19" />
    </svg>
  );
}

/** 外部系统：云 + 外联。 */
export function ExternalGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <path d="M7 17a4.5 4.5 0 0 1-.4-9A6 6 0 0 1 18 9.3 3.8 3.8 0 0 1 17.5 17z" />
      <path d="M12 13v6M9.5 16.5L12 19l2.5-2.5" />
    </svg>
  );
}

/* ── 数据存储 ─────────────────────────────────────────── */

/** 通用数据库：圆柱。 */
export function DatabaseGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <ellipse cx="12" cy="5.5" rx="7.5" ry="3" />
      <path d="M4.5 5.5v13c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-13" />
      <path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3" />
    </svg>
  );
}

/** 关系库：圆柱 + 表格。 */
export function RelationalDbGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <ellipse cx="12" cy="5" rx="7" ry="2.6" />
      <path d="M5 5v6.5M19 5v6.5" />
      <rect x="6.5" y="12.5" width="11" height="8" rx="1" />
      <path d="M6.5 16h11M12 12.5v8" />
    </svg>
  );
}

/** 文档库：圆柱 + 文档页。 */
export function DocumentDbGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <ellipse cx="10" cy="5" rx="6.5" ry="2.5" />
      <path d="M3.5 5v12c0 1.4 2.9 2.5 6.5 2.5" />
      <path d="M16.5 5v3" />
      <path d="M14 11h4l2.5 2.5V20a1 1 0 0 1-1 1H14a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z" />
      <path d="M15.5 15h3M15.5 17.5h3" />
    </svg>
  );
}

/** 缓存：闪电 + 层叠。 */
export function CacheGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <path d="M13 2.5L5.5 13H11l-1 8.5L18 10.5h-5.5z" />
    </svg>
  );
}

/** 搜索：放大镜 + 索引。 */
export function SearchGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20.5 20.5l-5-5" />
      <path d="M7.5 9h6M7.5 12h4" />
    </svg>
  );
}

/** 对象存储：桶。 */
export function ObjectStorageGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <path d="M4 6h16l-1.6 13.2a1.5 1.5 0 0 1-1.5 1.3H7.1a1.5 1.5 0 0 1-1.5-1.3z" />
      <path d="M3 6h18M8.5 3.5h7" />
      <path d="M9.5 10.5l1 6M14.5 10.5l-1 6" />
    </svg>
  );
}

/** 图数据库：互联节点。 */
export function GraphDbGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <circle cx="6" cy="6" r="2.4" />
      <circle cx="18" cy="7" r="2.4" />
      <circle cx="12" cy="18" r="2.4" />
      <path d="M8 7l7.6-.8M7.3 8l3.4 7.8M16.8 9l-3.4 6.8" />
    </svg>
  );
}

/* ── 消息与流 ─────────────────────────────────────────── */

/** 消息队列：管道 + 排队块。 */
export function QueueGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <path d="M3 8h18M3 16h18" />
      <rect x="5" y="10" width="3.4" height="4" rx="0.6" />
      <rect x="10.3" y="10" width="3.4" height="4" rx="0.6" />
      <rect x="15.6" y="10" width="3.4" height="4" rx="0.6" />
    </svg>
  );
}

/** 事件流：流动波 + 箭头（Kafka 意象）。 */
export function StreamGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <circle cx="5" cy="6" r="2" />
      <circle cx="5" cy="18" r="2" />
      <circle cx="19" cy="12" r="2" />
      <path d="M7 6c5 0 5 6 10 6M7 18c5 0 5-6 10-6" />
    </svg>
  );
}

/** 事件总线：总线 + 抽头。 */
export function EventBusGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <path d="M3 12h18" />
      <path d="M7 12V6M12 12v6M17 12V6" />
      <circle cx="7" cy="5" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
      <circle cx="17" cy="5" r="1.6" />
    </svg>
  );
}

/* ── 可观测 ───────────────────────────────────────────── */

/** 监控：仪表盘指针。 */
export function MonitoringGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <path d="M4 17a8 8 0 1 1 16 0" />
      <path d="M12 17l4-5" />
      <circle cx="12" cy="17" r="1.4" fill="currentColor" stroke="none" />
      <path d="M3 20h18" />
    </svg>
  );
}

/** 仪表盘：图表面板。 */
export function DashboardGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 16v-3M11 16v-6M15 16v-4M18 16v-7" />
    </svg>
  );
}

/** 链路追踪：瀑布 span。 */
export function TracingGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <path d="M4 5h12" />
      <path d="M7 10h13" />
      <path d="M10 15h8" />
      <path d="M13 20h5" />
      <circle cx="4" cy="5" r="0.6" fill="currentColor" />
    </svg>
  );
}

/** 日志：文档 + 行。 */
export function LoggingGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14.5 3v4.5H19" />
      <path d="M8 12h8M8 15.5h8M8 8.5h3" />
    </svg>
  );
}

/** 告警：铃。 */
export function AlertGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <path d="M18 9a6 6 0 1 0-12 0c0 6-2.5 7-2.5 7h17S18 15 18 9z" />
      <path d="M10.3 20a2 2 0 0 0 3.4 0" />
    </svg>
  );
}

/* ── 基础设施 ─────────────────────────────────────────── */

/** 注册中心：罗盘目录。 */
export function RegistryGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M15.5 8.5l-2 5-5 2 2-5z" />
    </svg>
  );
}

/** 配置中心：滑杆。 */
export function ConfigGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <path d="M4 7h16M4 12h16M4 17h16" />
      <circle cx="9" cy="7" r="2" fill="var(--panel, #fff)" />
      <circle cx="15" cy="12" r="2" fill="var(--panel, #fff)" />
      <circle cx="8" cy="17" r="2" fill="var(--panel, #fff)" />
    </svg>
  );
}

/** 熔断限流：盾 + 闪电。 */
export function CircuitBreakerGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 2.5l8 3v6c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10v-6z" />
      <path d="M12.5 7l-3 5h3l-1 5 3.5-5.5h-3z" />
    </svg>
  );
}

/** 分布式事务：循环箭头。 */
export function TransactionGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3L20 9" />
      <path d="M20 4v5h-5" />
      <path d="M19.5 12a7.5 7.5 0 0 1-12.8 5.3L4 15" />
      <path d="M4 20v-5h5" />
    </svg>
  );
}

/** 调度中心：时钟。 */
export function SchedulerGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

/** DNS：路牌。 */
export function DnsGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 3v18" />
      <path d="M5 5h11l2.5 2.5L16 10H5z" />
      <path d="M19 13H8l-2.5 2.5L8 18h11z" />
    </svg>
  );
}

/** 密钥 / 凭证：锁。 */
export function SecretGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
      <path d="M12 14.5v2.5" />
    </svg>
  );
}

/* ── ER / 状态机 / 知识（语义类型兜底图标） ─────────────── */

/** 表。 */
export function TableGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <rect x="3.5" y="4" width="17" height="16" rx="2" />
      <path d="M3.5 9h17M9 9v11" />
    </svg>
  );
}

/** 字段：标签。 */
export function FieldGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <path d="M3.5 7a2 2 0 0 1 2-2h6l9 7-7 7-9-9z" />
      <circle cx="8" cy="9.5" r="1.2" />
    </svg>
  );
}

/** 生命周期：循环。 */
export function LifecycleGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <path d="M20 12a8 8 0 1 1-2.3-5.6" />
      <path d="M20 3.5V8h-4.5" />
    </svg>
  );
}

/** 状态：节点。 */
export function StateGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** 决策：菱形。 */
export function DecisionGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 3l9 9-9 9-9-9z" />
      <path d="M12 8v4M12 15h.01" />
    </svg>
  );
}

/** 假设：灯泡。 */
export function AssumptionGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 1 3.5 10.9c-.6.5-.5 1.1-.5 2.1h-6c0-1 .1-1.6-.5-2.1A6 6 0 0 1 12 3z" />
    </svg>
  );
}

/** 笔记：便签。 */
export function NoteGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <path d="M5 4h14a1 1 0 0 1 1 1v10l-5 5H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <path d="M15 20v-5h5M8 9h8M8 12.5h5" />
    </svg>
  );
}

/** 未知 / 自定义兜底：拼图块。 */
export function ComponentGlyph(p: GlyphProps) {
  return (
    <svg {...base(p)}>
      <path d="M10 4.5a1.5 1.5 0 0 1 3 0V6h3a1 1 0 0 1 1 1v3h1.5a1.5 1.5 0 0 1 0 3H17v3a1 1 0 0 1-1 1h-3v-1.5a1.5 1.5 0 0 0-3 0V18H7a1 1 0 0 1-1-1v-3H4.5a1.5 1.5 0 0 1 0-3H6V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

/** glyph id → 组件。未知 id 回退到拼图块，永不渲染空白。 */
export const GLYPHS: Record<string, ComponentType<GlyphProps>> = {
  service: ServiceGlyph,
  container: ContainerGlyph,
  orchestration: OrchestrationGlyph,
  function: FunctionGlyph,
  server: ServerGlyph,
  actor: ActorGlyph,
  client: ClientGlyph,
  endpoint: EndpointGlyph,
  gateway: GatewayGlyph,
  ingress: IngressGlyph,
  loadbalancer: LoadBalancerGlyph,
  cdn: CdnGlyph,
  firewall: FirewallGlyph,
  external: ExternalGlyph,
  database: DatabaseGlyph,
  'relational-db': RelationalDbGlyph,
  'document-db': DocumentDbGlyph,
  cache: CacheGlyph,
  search: SearchGlyph,
  'object-storage': ObjectStorageGlyph,
  'graph-db': GraphDbGlyph,
  queue: QueueGlyph,
  stream: StreamGlyph,
  'event-bus': EventBusGlyph,
  monitoring: MonitoringGlyph,
  dashboard: DashboardGlyph,
  tracing: TracingGlyph,
  logging: LoggingGlyph,
  alert: AlertGlyph,
  registry: RegistryGlyph,
  config: ConfigGlyph,
  'circuit-breaker': CircuitBreakerGlyph,
  transaction: TransactionGlyph,
  scheduler: SchedulerGlyph,
  dns: DnsGlyph,
  secret: SecretGlyph,
  table: TableGlyph,
  field: FieldGlyph,
  lifecycle: LifecycleGlyph,
  state: StateGlyph,
  decision: DecisionGlyph,
  assumption: AssumptionGlyph,
  note: NoteGlyph,
  component: ComponentGlyph,
};

/** 图标选择器用的有序清单（id + 中文标签）。 */
export const GLYPH_LIST: { id: string; label: string }[] = [
  { id: 'service', label: '服务' },
  { id: 'container', label: '容器' },
  { id: 'orchestration', label: '编排' },
  { id: 'function', label: '函数' },
  { id: 'server', label: '服务器' },
  { id: 'actor', label: '角色' },
  { id: 'client', label: '客户端' },
  { id: 'endpoint', label: '端点' },
  { id: 'gateway', label: '网关' },
  { id: 'ingress', label: '入口' },
  { id: 'loadbalancer', label: '负载均衡' },
  { id: 'cdn', label: 'CDN' },
  { id: 'firewall', label: '防火墙' },
  { id: 'external', label: '外部系统' },
  { id: 'database', label: '数据库' },
  { id: 'relational-db', label: '关系库' },
  { id: 'document-db', label: '文档库' },
  { id: 'cache', label: '缓存' },
  { id: 'search', label: '搜索' },
  { id: 'object-storage', label: '对象存储' },
  { id: 'graph-db', label: '图库' },
  { id: 'queue', label: '队列' },
  { id: 'stream', label: '事件流' },
  { id: 'event-bus', label: '事件总线' },
  { id: 'monitoring', label: '监控' },
  { id: 'dashboard', label: '仪表盘' },
  { id: 'tracing', label: '链路追踪' },
  { id: 'logging', label: '日志' },
  { id: 'alert', label: '告警' },
  { id: 'registry', label: '注册中心' },
  { id: 'config', label: '配置' },
  { id: 'circuit-breaker', label: '熔断限流' },
  { id: 'transaction', label: '分布式事务' },
  { id: 'scheduler', label: '调度' },
  { id: 'dns', label: 'DNS' },
  { id: 'secret', label: '密钥' },
  { id: 'table', label: '表' },
  { id: 'field', label: '字段' },
  { id: 'lifecycle', label: '生命周期' },
  { id: 'state', label: '状态' },
  { id: 'decision', label: '决策' },
  { id: 'assumption', label: '假设' },
  { id: 'note', label: '笔记' },
  { id: 'component', label: '通用组件' },
];

/** 渲染任意 glyph id（带回退）。 */
export function Glyph({ id, ...rest }: GlyphProps & { id: string }) {
  const C = GLYPHS[id] ?? ComponentGlyph;
  return <C {...rest} />;
}