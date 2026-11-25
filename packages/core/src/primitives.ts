import type {
  AnnotationKind,
  EntityNode,
  LayerTemplateName,
  SemanticColor,
  SubCanvasEngine,
} from './types';

export interface PrimitiveItem {
  kind: string;
  icon: string;
  colorClass: string;
  defaultColor: SemanticColor;
  label: string;
  badge: string;
  desc: string;
  engine?: SubCanvasEngine;
  isRef?: boolean;
  refKey?: string;
  meta?: string;
}

export interface PrimitiveGroup {
  name: string | null;
  hint?: string;
  engine?: SubCanvasEngine;
  items: PrimitiveItem[];
}

export interface LayerPaletteConfig {
  heading: string;
  tipTitle: string;
  tipDesc: string;
  groups: PrimitiveGroup[];
}

export const SUB_CANVAS_ENGINES: Array<{
  engine: SubCanvasEngine;
  name: string;
  icon: string;
  hint: string;
}> = [
  { engine: 'relational', name: '关系库', icon: 'table-2', hint: 'PostgreSQL / MySQL' },
  { engine: 'redis', name: '缓存', icon: 'zap', hint: 'Redis / Valkey' },
];

export const LAYER_TEMPLATES: Array<{
  name: LayerTemplateName;
  icon: string;
  accentClass: string;
  description: string;
}> = [
  {
    name: '空白项目',
    icon: 'file-plus-2',
    accentClass: 'text-violet-300',
    description: '无限点阵画布，自由草图与六类全量原语混合推演',
  },
  {
    name: '系统架构拓扑',
    icon: 'network',
    accentClass: 'text-sky-400',
    description: '内置网关、微服务、缓存、消息队列与 DB 节点套件',
  },
  {
    name: '数据建模',
    icon: 'database',
    accentClass: 'text-cyan-400',
    description: '关系库 ER 表结构、Redis 键空间与跨引擎引用锚点',
  },
  {
    name: '云原生部署拓扑',
    icon: 'server-cog',
    accentClass: 'text-indigo-400',
    description: 'K8s 集群、多可用区容灾、Mesh 与 GitOps 流水线',
  },
  {
    name: '状态机与时序',
    icon: 'git-branch',
    accentClass: 'text-emerald-400',
    description: 'FSM 状态流转、守卫条件、超时与异常补偿回滚',
  },
  {
    name: '算法与数据流',
    icon: 'workflow',
    accentClass: 'text-amber-400',
    description: 'DAG 算子管线、窗口聚合、向量检索与 Big-O 复杂度标注',
  },
  {
    name: '接口契约与领域边界',
    icon: 'blocks',
    accentClass: 'text-fuchsia-400',
    description: 'DDD 限界上下文、聚合根、领域事件与防腐层 (ACL)',
  },
];

export const SYSTEM_ARCH_ITEMS: PrimitiveItem[] = [
  {
    kind: 'service',
    icon: 'hexagon',
    colorClass: 'text-sky-400',
    defaultColor: 'sky',
    label: '业务服务',
    badge: 'Service',
    desc: '无状态核心领域微服务节点，处理业务逻辑计算、RPC 编排与事务协调，支持水平扩缩容。',
  },
  {
    kind: 'ingress',
    icon: 'log-in',
    colorClass: 'text-sky-400',
    defaultColor: 'violet',
    label: 'Ingress 接入网关',
    badge: 'Ingress',
    desc: '系统南北向流量统一入口，负责 TLS 终止、协议转换、令牌桶限流与动态路由分发。',
  },
  {
    kind: 'db',
    icon: 'database',
    colorClass: 'text-sky-400',
    defaultColor: 'emerald',
    label: 'PostgreSQL 数据库',
    badge: 'DB',
    desc: '强一致关系型持久化存储引擎，提供 ACID 事务保障、MVCC 并发控制与主从高可用复制。',
  },
  {
    kind: 'bff',
    icon: 'smartphone',
    colorClass: 'text-indigo-400',
    defaultColor: 'violet',
    label: 'BFF 聚合服务层',
    badge: 'GraphQL',
    desc: '面向桌面端/移动端等特定终端的后端聚合服务，裁剪并组装多下游接口响应。',
  },
  {
    kind: 'worker',
    icon: 'cog',
    colorClass: 'text-sky-400',
    defaultColor: 'sky',
    label: '异步计算 Worker',
    badge: 'Job',
    desc: '后台异步任务与定时调度执行器，消费队列消息并执行幂等批处理或长耗时计算。',
  },
  {
    kind: 'cache',
    icon: 'zap',
    colorClass: 'text-amber-400',
    defaultColor: 'amber',
    label: 'Redis 分布式缓存',
    badge: 'Cache',
    desc: '亚毫秒级分布式内存键值缓存，用于热点数据旁路加速、分布式锁与高频计数器。',
  },
  {
    kind: 'queue',
    icon: 'layers',
    colorClass: 'text-orange-400',
    defaultColor: 'amber',
    label: '消息队列 (MQ)',
    badge: 'Kafka',
    desc: '消息队列 / 事件流中间件（Kafka、RabbitMQ、Pulsar 等），实现异步解耦与削峰填谷。',
  },
  {
    kind: 'auth',
    icon: 'key-round',
    colorClass: 'text-rose-400',
    defaultColor: 'rose',
    label: '统一鉴权中心',
    badge: 'IAM',
    desc: '集中式身份认证与访问控制服务，负责 OAuth2/OIDC 令牌签发与细粒度 RBAC 校验。',
  },
  {
    kind: 'external',
    icon: 'cloud',
    colorClass: 'text-zinc-300',
    defaultColor: 'slate',
    label: '第三方外部依赖',
    badge: '3rd',
    desc: '系统边界之外的第三方 SaaS、支付或大模型 API 依赖，需配置超时隔离、重试与熔断降级。',
  },
];

export const DATA_MODELING_RELATIONAL_ITEMS: PrimitiveItem[] = [
  { kind: 'er_main', icon: 'table-2', colorClass: 'text-violet-400', defaultColor: 'violet', engine: 'relational', label: '核心业务主表 (PK)', badge: 'InnoDB', desc: '承载核心领域实体与雪花/自增主键，支持强一致事务与聚簇索引查询。' },
  { kind: 'er_rel', icon: 'link', colorClass: 'text-sky-400', defaultColor: 'sky', engine: 'relational', label: '关联明细子表 (FK)', badge: '1:N', desc: '通过外键列关联主表主键，用于表达订单明细等一对多从属关系。' },
  { kind: 'er_junction', icon: 'git-merge', colorClass: 'text-indigo-400', defaultColor: 'violet', engine: 'relational', label: '多对多中间映射表', badge: 'N:M', desc: '采用双外键联合主键解耦多对多关联（如用户与角色、实体与标签）。' },
  { kind: 'er_dict', icon: 'list-tree', colorClass: 'text-emerald-400', defaultColor: 'emerald', engine: 'relational', label: '枚举配置字典表', badge: 'Config', desc: '低频变更的业务状态码、系统参数与多级分类字典表。' },
  { kind: 'er_audit', icon: 'history', colorClass: 'text-amber-400', defaultColor: 'amber', engine: 'relational', label: '审计与变更流水表', badge: 'Append', desc: '只追加写入（Append-Only）的不可变操作轨迹与状态变更快照记录表。' },
  { kind: 'er_timeseries', icon: 'activity', colorClass: 'text-cyan-400', defaultColor: 'sky', engine: 'relational', label: '时序指标宽表', badge: 'TSDB', desc: '按时间窗口分区的监控采样与吞吐延迟指标表。' },
  { kind: 'er_jsonb', icon: 'braces', colorClass: 'text-fuchsia-400', defaultColor: 'violet', engine: 'relational', label: '半结构化文档表', badge: 'JSONB', desc: '使用 JSONB 列与 GIN 倒排索引存储动态扩展属性或画布拓扑。' },
  { kind: 'er_view', icon: 'eye', colorClass: 'text-teal-400', defaultColor: 'emerald', engine: 'relational', label: '物化聚合视图', badge: 'M-View', desc: '预计算多表关联与分组统计结果的物化快照表。' },
  { kind: 'er_shard', icon: 'split', colorClass: 'text-rose-400', defaultColor: 'rose', engine: 'relational', label: '水平分库分表路由', badge: 'Shard', desc: '基于租户 ID 或用户 ID 哈希分片路由的分布式大表模型。' },
];

export const DATA_MODELING_REDIS_ITEMS: PrimitiveItem[] = [
  { kind: 'kv_hash', icon: 'layers', colorClass: 'text-rose-400', defaultColor: 'rose', engine: 'redis', label: 'Hash 用户档案键', badge: 'HASH', desc: 'Key 模板 user:profile:{id}，字段即 Hash Field，适合整体读写与局部更新。' },
  { kind: 'kv_string', icon: 'hash', colorClass: 'text-amber-400', defaultColor: 'amber', engine: 'redis', label: '计数器 / 限流令牌', badge: 'STRING', desc: 'INCR / EXPIRE 原子自增键，用于接口限流、阅读计数与分布式序号。' },
  { kind: 'kv_zset', icon: 'trophy', colorClass: 'text-fuchsia-400', defaultColor: 'violet', engine: 'redis', label: '排行榜有序集合', badge: 'ZSET', desc: '按 score 排序的 ZSET，支持 ZRANGE 分页与 ZINCRBY 实时更新榜单。' },
  { kind: 'kv_set', icon: 'tags', colorClass: 'text-violet-400', defaultColor: 'violet', engine: 'redis', label: '标签 / 去重集合', badge: 'SET', desc: '无重复集合，用于在线用户、标签归属与交集查询。' },
  { kind: 'kv_list', icon: 'list-ordered', colorClass: 'text-sky-400', defaultColor: 'sky', engine: 'redis', label: '轻量队列 / 时间线', badge: 'LIST', desc: 'LPUSH + BRPOP 实现轻量队列或时间线倒序读取。' },
  { kind: 'kv_stream', icon: 'radio', colorClass: 'text-emerald-400', defaultColor: 'emerald', engine: 'redis', label: '事件流消费者组', badge: 'STREAM', desc: '带消费组与 ACK 语义的 Stream，支持可回溯事件分发。' },
];

export const DEPLOYMENT_ITEMS: PrimitiveItem[] = [
  { kind: 'dep_edge', icon: 'globe', colorClass: 'text-violet-400', defaultColor: 'violet', label: '全球 CDN / WAF 边缘', badge: 'Anycast', desc: 'Anycast 全球边缘接入节点，提供就近静态加速、TLS 1.3 终止与 L7 WAF 防护。' },
  { kind: 'dep_lb', icon: 'split-square-horizontal', colorClass: 'text-sky-400', defaultColor: 'sky', label: 'L4/L7 负载均衡器', badge: 'ALB', desc: '跨可用区应用层/传输层负载均衡器，支持健康检查摘流与按权重灰度转发。' },
  { kind: 'dep_k8s', icon: 'server-cog', colorClass: 'text-indigo-400', defaultColor: 'sky', label: 'K8s 弹性计算集群', badge: 'HPA', desc: '承载无状态工作负载的 Kubernetes 集群，基于指标驱动 Pod 自动扩缩容。' },
  { kind: 'dep_mesh', icon: 'share-2', colorClass: 'text-cyan-400', defaultColor: 'sky', label: 'Service Mesh 边车', badge: 'Istio', desc: '基于 Envoy Sidecar 的服务网格，实现零信任 mTLS、熔断降级与流量染色。' },
  { kind: 'dep_az', icon: 'shield-check', colorClass: 'text-amber-400', defaultColor: 'amber', label: '多可用区容灾节点', badge: 'Multi-AZ', desc: '同城跨物理可用区热备部署单元，单机房故障时秒级自动切换。' },
  { kind: 'dep_rds', icon: 'hard-drive', colorClass: 'text-emerald-400', defaultColor: 'emerald', label: '高可用主从数据库', badge: 'RDS', desc: '托管式一主多从关系数据库集群，支持半同步复制（RPO=0）与时间点恢复。' },
  { kind: 'dep_redis', icon: 'zap', colorClass: 'text-rose-400', defaultColor: 'rose', label: '分布式内存缓存集群', badge: 'Redis', desc: '多分片高吞吐内存缓存集群，支持 Sentinel 哨兵故障转移与持久化。' },
  { kind: 'dep_oss', icon: 'archive', colorClass: 'text-teal-400', defaultColor: 'emerald', label: '对象存储与冷备桶', badge: 'S3/OSS', desc: '高可靠海量非结构化对象存储，用于归档日志、冷备快照与静态资源分发。' },
  { kind: 'dep_cicd', icon: 'rocket', colorClass: 'text-fuchsia-400', defaultColor: 'violet', label: 'ArgoCD GitOps 流水线', badge: 'CD', desc: '声明式 GitOps 持续交付引擎，结合指标自动执行金丝雀回滚。' },
  { kind: 'dep_obs', icon: 'radar', colorClass: 'text-lime-400', defaultColor: 'emerald', label: '可观测性监控探针', badge: 'OTel', desc: 'OpenTelemetry 全链路指标、分布式追踪与结构化日志采集探针。' },
];

export const FSM_ITEMS: PrimitiveItem[] = [
  { kind: 'fsm_init', icon: 'play-circle', colorClass: 'text-violet-400', defaultColor: 'violet', label: '初始状态节点', badge: 'Initial', desc: '状态机实例创建后的唯一入口起点，负责初始化上下文变量与前置校验。' },
  { kind: 'fsm_mid', icon: 'circle-dot', colorClass: 'text-amber-400', defaultColor: 'sky', label: '常规业务状态', badge: 'State', desc: '生命周期中的稳态停留节点，等待外部事件驱动或执行内部异步动作。' },
  { kind: 'fsm_sub', icon: 'layers', colorClass: 'text-sky-400', defaultColor: 'sky', label: '复合嵌套子状态机', badge: 'Sub-FSM', desc: '封装独立内部流转逻辑的层级子状态机，用于收拢复杂子流程。' },
  { kind: 'fsm_fork', icon: 'git-fork', colorClass: 'text-indigo-400', defaultColor: 'violet', label: '并行分叉 / 汇合点', badge: 'Fork', desc: '将单条执行流拆分为多个并发子状态分支，并在完成后同步汇合。' },
  { kind: 'fsm_choice', icon: 'help-circle', colorClass: 'text-cyan-400', defaultColor: 'sky', label: '守卫条件分支判断', badge: 'Guard', desc: '根据布尔守卫表达式动态评估上下文，路由至不同后续状态。' },
  { kind: 'fsm_timer', icon: 'clock', colorClass: 'text-orange-400', defaultColor: 'amber', label: '超时触发器状态', badge: 'Timeout', desc: '绑定 TTL 定时器的等待状态，超时未收到确认信号时自动触发兜底转移。' },
  { kind: 'fsm_error', icon: 'alert-triangle', colorClass: 'text-rose-400', defaultColor: 'amber', label: '异常回滚 / 补偿态', badge: 'Rollback', desc: '业务执行失败或冲突时进入的补偿处理节点，负责释放资源与恢复快照。' },
  { kind: 'fsm_end', icon: 'check-circle-2', colorClass: 'text-emerald-400', defaultColor: 'emerald', label: '正常终止归档态', badge: 'Final', desc: '生命周期完结的不可变终态，触发归档持久化并对外广播完成事件。' },
];

export const DAG_ITEMS: PrimitiveItem[] = [
  { kind: 'dag_source', icon: 'arrow-right-circle', colorClass: 'text-violet-400', defaultColor: 'violet', label: '流式数据源接入算子', badge: 'O(N)', desc: '支持背压感知的分片数据读取源，持续向下游发射结构化事件流。' },
  { kind: 'dag_parser', icon: 'file-code', colorClass: 'text-cyan-400', defaultColor: 'sky', label: 'AST / 词法解析算子', badge: 'O(N)', desc: '线性时间复杂度的零拷贝反序列化与语法树构建算子。' },
  { kind: 'dag_filter', icon: 'filter', colorClass: 'text-teal-400', defaultColor: 'emerald', label: '布隆过滤与去重算子', badge: 'O(1)', desc: '基于布隆过滤器与滑动去重窗口的常数级判重算子。' },
  { kind: 'dag_transform', icon: 'cpu', colorClass: 'text-sky-400', defaultColor: 'sky', label: '归并排序转换算子', badge: 'O(NlogN)', desc: '执行向量化特征转换、局部有序排序与多路归并的计算节点。' },
  { kind: 'dag_window', icon: 'hourglass', colorClass: 'text-amber-400', defaultColor: 'amber', label: '滑动时间窗口聚合', badge: 'Window', desc: '支持 Watermark 乱序容忍的滚动/滑动时间窗口聚合算子。' },
  { kind: 'dag_join', icon: 'merge', colorClass: 'text-indigo-400', defaultColor: 'violet', label: '双流哈希连接算子', badge: 'HashJoin', desc: '基于状态后端哈希表的双流实时等值连接算子。' },
  { kind: 'dag_ml', icon: 'sparkles', colorClass: 'text-fuchsia-400', defaultColor: 'violet', label: '向量检索与推理算子', badge: 'ANN', desc: '基于 HNSW 图索引的近似最近邻检索与在线模型打分推理节点。' },
  { kind: 'dag_sink', icon: 'database-zap', colorClass: 'text-emerald-400', defaultColor: 'emerald', label: '增量差分落盘算子', badge: 'O(1)', desc: '支持两阶段提交与幂等写入的终端落盘算子。' },
];

export const DDD_ITEMS: PrimitiveItem[] = [
  { kind: 'ddd_core', icon: 'boxes', colorClass: 'text-violet-400', defaultColor: 'violet', label: '核心业务限界上下文', badge: 'Core', desc: '系统最核心的差异化业务能力边界，维护独立通用语言与领域模型。' },
  { kind: 'ddd_support', icon: 'blocks', colorClass: 'text-sky-400', defaultColor: 'sky', label: '支撑子域上下文', badge: 'Support', desc: '围绕核心域提供定制化辅助业务能力的限界上下文。' },
  { kind: 'ddd_generic', icon: 'package', colorClass: 'text-zinc-300', defaultColor: 'slate', label: '通用基础设施子域', badge: 'Generic', desc: '如消息通知、文件存储等标准化通用能力边界。' },
  { kind: 'ddd_agg', icon: 'crown', colorClass: 'text-amber-400', defaultColor: 'amber', label: '领域聚合根实体', badge: 'Root', desc: '聚合内部一致性边界的唯一对外访问入口，封装业务不变量校验。' },
  { kind: 'ddd_event', icon: 'bell-ring', colorClass: 'text-emerald-400', defaultColor: 'emerald', label: '领域事件总线契约', badge: 'Event', desc: '以过去式命名的不可变领域事实，用于解耦跨上下文最终一致协作。' },
  { kind: 'ddd_acl', icon: 'shield-alert', colorClass: 'text-rose-400', defaultColor: 'rose', label: '外部系统防腐层', badge: 'ACL', desc: '在上下游边界建立适配器与模型转换层，防止外部遗留模型污染核心域。' },
  { kind: 'ddd_ohs', icon: 'door-open', colorClass: 'text-cyan-400', defaultColor: 'sky', label: '开放主机服务接口', badge: 'OHS', desc: '为多个下游消费者提供统一标准化协议的公开服务契约接口。' },
  { kind: 'ddd_saga', icon: 'repeat', colorClass: 'text-indigo-400', defaultColor: 'violet', label: '跨上下文 Saga 协调器', badge: 'Saga', desc: '编排跨多个限界上下文的长事务执行序列与逆向补偿。' },
];

export const REASONING_ANNOTATION_ITEMS: PrimitiveItem[] = [
  {
    kind: 'assumption',
    icon: 'lightbulb',
    colorClass: 'text-amber-300',
    defaultColor: 'amber',
    label: '推演假设',
    badge: 'Assumption',
    desc: '虚线标注卡：记录尚未验证的前置条件与能力边界，支持绑定实体跟随布局。',
  },
  {
    kind: 'decision',
    icon: 'shield-check',
    colorClass: 'text-emerald-300',
    defaultColor: 'emerald',
    label: '决策记录',
    badge: 'Decision',
    desc: '虚线标注卡：记录技术选型的理由、权衡与代价（轻量 ADR）。',
  },
  {
    kind: 'note',
    icon: 'file-text',
    colorClass: 'text-zinc-300',
    defaultColor: 'slate',
    label: '架构笔记',
    badge: 'Note',
    desc: '虚线标注卡：记录自由推演思路、接口备忘或待办事项。',
  },
];

export const GROUP_CONTAINER_ITEM: PrimitiveItem = {
  kind: 'group',
  icon: 'layers',
  colorClass: 'text-violet-300',
  defaultColor: 'violet',
  label: '分组容器 / 边界',
  badge: 'Group / VPC',
  desc: '半透明架构分组边界框（VPC / 可用区 / 限界上下文），可拖拽调整尺寸并框选包裹多个实体。',
};

export const ALL_PRIMITIVES: PrimitiveItem[] = [
  ...SYSTEM_ARCH_ITEMS,
  ...DATA_MODELING_RELATIONAL_ITEMS,
  ...DATA_MODELING_REDIS_ITEMS,
  ...DEPLOYMENT_ITEMS,
  ...FSM_ITEMS,
  ...DAG_ITEMS,
  ...DDD_ITEMS,
  ...REASONING_ANNOTATION_ITEMS,
  GROUP_CONTAINER_ITEM,
];

export function isGroupEntity(node: Pick<EntityNode, 'kind'> | null | undefined): boolean {
  return Boolean(node && node.kind === 'group');
}

export function findPrimitiveByKind(kind: string): PrimitiveItem | undefined {
  if (kind === 'er_table') return DATA_MODELING_RELATIONAL_ITEMS[0];
  if (kind === 'store_kv') return DATA_MODELING_REDIS_ITEMS[0];
  if (kind === 'ddd_context') return DDD_ITEMS[0];
  if (kind === 'fsm_state') return FSM_ITEMS[1];
  if (kind === 'pipeline_stage') return DAG_ITEMS[3];
  return ALL_PRIMITIVES.find((p) => p.kind === kind);
}

export function getAnnotationKind(node: Pick<EntityNode, 'kind' | 'tag'> | null | undefined): AnnotationKind | null {
  if (!node) return null;
  if (!['annotation', 'assumption', 'decision', 'note'].includes(node.kind)) return null;
  const t = node.tag || '';
  if (/决策|adr|decision/i.test(t) || node.kind === 'decision') return 'decision';
  if (/笔记|note/i.test(t) || node.kind === 'note') return 'note';
  return 'assumption';
}

export function isCollapsibleEntity(node: Pick<EntityNode, 'kind' | 'fields'> | null | undefined): boolean {
  if (!node) return false;
  return (
    node.kind === 'er_table' ||
    node.kind === 'store_kv' ||
    node.kind.startsWith('er_') ||
    node.kind.startsWith('kv_')
  );
}

export function getPaletteConfigForTemplate(
  template: LayerTemplateName,
  subCanvasEngine?: SubCanvasEngine
): LayerPaletteConfig {
  if (template === '数据建模') {
    const groups: PrimitiveGroup[] =
      subCanvasEngine === 'redis'
        ? [{ name: '缓存键空间', hint: 'Redis / Valkey', engine: 'redis', items: DATA_MODELING_REDIS_ITEMS }]
        : subCanvasEngine === 'relational'
          ? [{ name: '关系库', hint: 'PostgreSQL / MySQL', engine: 'relational', items: DATA_MODELING_RELATIONAL_ITEMS }]
          : [
              { name: '关系库', hint: 'PostgreSQL / MySQL', engine: 'relational', items: DATA_MODELING_RELATIONAL_ITEMS },
              { name: '缓存键空间', hint: 'Redis / Valkey', engine: 'redis', items: DATA_MODELING_REDIS_ITEMS },
            ];
    const total = groups.reduce((s, g) => s + g.items.length, 0);
    return {
      heading: `数据建模原语 (${total})`,
      tipTitle: '字段级表关联与三档密度',
      tipDesc: '支持主键 (PK)、外键 (FK) 与 Redis 键空间，可在底部栏一键切换收起 / 完整 / 仅关联字段。',
      groups,
    };
  }

  if (template === '云原生部署拓扑') {
    return {
      heading: `云原生部署原语 (${DEPLOYMENT_ITEMS.length})`,
      tipTitle: '部署拓扑特点',
      tipDesc: '突出硬件配额、Pod 副本弹性策略、可用区隔离 (AZ) 与零信任网格。',
      groups: [{ name: null, items: DEPLOYMENT_ITEMS }],
    };
  }

  if (template === '状态机与时序') {
    return {
      heading: `FSM 状态时序原语 (${FSM_ITEMS.length})`,
      tipTitle: '状态流转特点',
      tipDesc: '区分初始态、常规态、守卫条件分支、超时与异常补偿回滚态。',
      groups: [{ name: null, items: FSM_ITEMS }],
    };
  }

  if (template === '算法与数据流') {
    return {
      heading: `DAG 计算管线原语 (${DAG_ITEMS.length})`,
      tipTitle: '算子管线特点',
      tipDesc: '强调流批处理语义、时间窗口、向量检索与 Big-O 复杂度标注。',
      groups: [{ name: null, items: DAG_ITEMS }],
    };
  }

  if (template === '接口契约与领域边界') {
    return {
      heading: `DDD 领域建模原语 (${DDD_ITEMS.length})`,
      tipTitle: '限界上下文特点',
      tipDesc: '以清晰边界隔离领域模型，明确聚合根、领域事件、防腐层 (ACL) 与 Saga。',
      groups: [{ name: null, items: DDD_ITEMS }],
    };
  }

  if (template === '空白项目') {
    const groups: PrimitiveGroup[] = [
      { name: '系统架构', hint: '服务 · 网关 · 存储', items: SYSTEM_ARCH_ITEMS },
      { name: '数据建模（ER/KV）', hint: '表 · 字段 · 键空间', items: [...DATA_MODELING_RELATIONAL_ITEMS, ...DATA_MODELING_REDIS_ITEMS] },
      { name: '云原生部署', hint: 'CDN · K8s · Multi-AZ', items: DEPLOYMENT_ITEMS },
      { name: '状态机与时序', hint: '初始态 · 分支 · 终态', items: FSM_ITEMS },
      { name: '算法与数据流', hint: '算子 · 窗口 · Big-O', items: DAG_ITEMS },
      { name: 'DDD 领域边界', hint: '上下文 · 聚合根 · ACL', items: DDD_ITEMS },
    ];
    const total = groups.reduce((s, g) => s + g.items.length, 0);
    return {
      heading: `全部实体原语 (${total})`,
      tipTitle: '全量实体库 · 六类建模语法',
      tipDesc: '自由混合摆放六类建模实体，随时搭配研思推演标注与动态链路。',
      groups,
    };
  }

  return {
    heading: `系统架构实体 (${SYSTEM_ARCH_ITEMS.length})`,
    tipTitle: '实体与研思标注分离',
    tipDesc: '上方为确定性系统架构实体，下方为跨层通用的研思推演标注（假设、决策、笔记）。',
    groups: [{ name: null, items: SYSTEM_ARCH_ITEMS }],
  };
}
