import type { CanvasSlot, LayerDocument, LayerTemplateName, ProjectDocument } from './types';
import { serializeSlotToDsl } from './dsl/parser';

export function buildScenePresetForTemplate(template: LayerTemplateName): Omit<LayerDocument, 'id'> {
  if (template === '空白项目') {
    const slot: CanvasSlot = {
      id: 'slot-blank',
      name: '空白项目',
      nodes: [
        {
          id: 'n-start',
          dslId: 'start_idea',
          x: 120,
          y: 120,
          kind: 'service',
          icon: 'hexagon',
          tag: 'START · IDEA',
          title: '核心推演起点',
          note: '从左侧原语库拖入实体，或在源码面板中直接编写 .arch DSL。',
          color: 'violet',
        },
      ],
      edges: [],
      flows: [],
    };
    return { ...slot, template, dslSource: serializeSlotToDsl(slot) };
  }

  if (template === '数据建模') {
    const relationalSlot: CanvasSlot = {
      id: 'sub-relational',
      name: '关系库',
      engine: 'relational',
      nodes: [
        {
          id: 'er-1',
          dslId: 'users',
          x: 40,
          y: 40,
          kind: 'er_main',
          engine: 'relational',
          icon: 'table-2',
          tag: 'TABLE · InnoDB',
          title: 'users',
          note: '索引: idx_email_unique, idx_created_at',
          fields: [
            { key: 'PK', name: 'user_id', type: 'BIGINT', note: '雪花 ID 主键，与账号中心同源' },
            { key: 'UK', name: 'email', type: 'VARCHAR(128)', note: '登录邮箱，全局唯一' },
            { key: '', name: 'handle', type: 'VARCHAR(64)', note: '对外展示昵称' },
            { key: '', name: 'created_at', type: 'TIMESTAMP', note: 'UTC 注册时间' },
          ],
          color: 'violet',
        },
        {
          id: 'er-2',
          dslId: 'projects',
          x: 370,
          y: 40,
          kind: 'er_shard',
          engine: 'relational',
          icon: 'split',
          tag: 'SHARD · HASH',
          title: 'projects',
          note: '分片键: workspace_id · 软删除标记 deleted_at',
          fields: [
            { key: 'PK', name: 'project_id', type: 'BIGINT', note: '主键' },
            { key: 'FK', name: 'owner_id', type: 'BIGINT', note: '外键 → users.user_id' },
            { key: '', name: 'title', type: 'VARCHAR(255)', note: '项目名称' },
            { key: '', name: 'visibility', type: 'TINYINT', note: '0=私有 1=团队 2=公开' },
          ],
          color: 'sky',
        },
        {
          id: 'er-3',
          dslId: 'canvas_snapshots',
          x: 700,
          y: 40,
          kind: 'er_jsonb',
          engine: 'relational',
          icon: 'braces',
          tag: 'DOC · JSONB',
          title: 'canvas_snapshots',
          note: '支持版本回溯与 Zstd 增量压缩',
          fields: [
            { key: 'PK', name: 'snapshot_id', type: 'UUID', note: '快照主键' },
            { key: 'FK', name: 'project_id', type: 'BIGINT', note: '外键 → projects.project_id' },
            { key: '', name: 'layer_name', type: 'VARCHAR(64)', note: '推演层名称' },
            { key: '', name: 'dag_payload', type: 'JSONB', note: '完整拓扑快照' },
          ],
          color: 'emerald',
        },
      ],
      edges: [
        { id: 'er-e1', from: 'er-1', fromField: 'user_id', to: 'er-2', toField: 'owner_id', label: '1 : N', routing: 'orthogonal' },
        { id: 'er-e2', from: 'er-2', fromField: 'project_id', to: 'er-3', toField: 'project_id', label: '1 : N', routing: 'orthogonal' },
      ],
      flows: [],
    };
    relationalSlot.dslSource = serializeSlotToDsl(relationalSlot);

    const redisSlot: CanvasSlot = {
      id: 'sub-redis',
      name: '缓存',
      engine: 'redis',
      nodes: [
        {
          id: 'ref-users',
          dslId: 'ref_users',
          x: 40,
          y: 60,
          kind: 'store_ref',
          tag: 'REF · 关系库',
          title: 'users',
          note: '跨引擎只读引用锚点（双击跳转到关系库子画布）',
          color: 'slate',
          ref: { layerId: 'layer-data', subCanvasId: 'sub-relational', nodeId: 'er-1' },
        },
        {
          id: 'kv-1',
          dslId: 'user_profile_cache',
          x: 360,
          y: 40,
          kind: 'kv_hash',
          engine: 'redis',
          icon: 'layers',
          tag: 'HASH',
          title: 'user:profile:{id}',
          note: '缓存旁路：先读 Redis，未命中回源 users 表',
          color: 'rose',
          kv: { ttl: '7d', policy: 'allkeys-lru', size: '≈1.2KB' },
          fields: [
            { name: 'name', type: 'string', note: '来自 users.handle' },
            { name: 'email', type: 'string', note: '脱敏邮箱' },
            { name: 'avatar_url', type: 'string', note: '头像 CDN 地址' },
            { name: 'updated_at', type: 'unix-ts', note: '最后写入时间' },
          ],
        },
      ],
      edges: [
        { id: 'kv-e1', from: 'ref-users', to: 'kv-1', label: 'cache-aside', dashed: true, routing: 'bezier' },
      ],
      flows: [],
    };
    redisSlot.dslSource = serializeSlotToDsl(redisSlot);

    return {
      name: '数据建模',
      template,
      nodes: relationalSlot.nodes,
      edges: relationalSlot.edges,
      children: [relationalSlot, redisSlot],
      activeChildIndex: 0,
      dslSource: relationalSlot.dslSource,
    };
  }

  if (template === '云原生部署拓扑') {
    const slot: CanvasSlot = {
      id: 'slot-deploy',
      name: '云原生部署拓扑',
      nodes: [
        { id: 'dep-1', dslId: 'edge_waf', x: 40, y: 110, kind: 'dep_edge', tag: 'EDGE · ANYCAST', title: 'Global Edge & WAF LB', spec: 'BGP · TLS 1.3 · 10Gbps', note: '全球边缘接入、DDoS 清洗与多区域健康摘流。', color: 'violet' },
        { id: 'dep-2', dslId: 'k8s_zone_a', x: 360, y: 30, kind: 'dep_k8s', tag: 'K8S · ZONE-A', title: '生产集群可用区 A (Primary)', spec: 'Pod 4~32x · 8C16G', note: 'HPA 弹性扩缩容，ArgoCD GitOps 灰度发布。', color: 'sky' },
        { id: 'dep-3', dslId: 'k8s_zone_b', x: 360, y: 200, kind: 'dep_az', tag: 'K8S · ZONE-B', title: '容灾集群可用区 B (Standby)', spec: 'Pod 4~16x · Hot-Standby', note: '跨 AZ 零停机热备，秒级自动故障切换。', color: 'amber' },
        { id: 'dep-4', dslId: 'rds_multi_az', x: 690, y: 110, kind: 'dep_rds', tag: 'STATEFUL · RDS', title: '多活数据库与对象存储', spec: 'NVMe SSD · RPO = 0', note: '一主两从半同步复制 + 跨地域异地冷备。', color: 'emerald' },
      ],
      edges: [
        { id: 'dep-e1', from: 'dep-1', to: 'dep-2', label: '80% weight', protocol: 'HTTPS' },
        { id: 'dep-e2', from: 'dep-1', to: 'dep-3', label: '20% canary', protocol: 'HTTPS', dashed: true },
        { id: 'dep-e3', from: 'dep-2', to: 'dep-4', label: 'VPC peering', protocol: 'TCP' },
        { id: 'dep-e4', from: 'dep-3', to: 'dep-4', label: 'read replica', protocol: 'TCP', dashed: true },
      ],
      flows: [
        {
          id: 'canary_flow',
          name: '金丝雀灰度切流路径',
          steps: [
            { order: 1, from: 'dep-1', to: 'dep-3', label: '边缘按 20% 流量染色路由至可用区 B', latency: '4ms' },
            { order: 2, from: 'dep-3', to: 'dep-4', label: '灰度实例读取从库验证新版本兼容性', latency: '6ms' },
          ],
        },
      ],
    };
    return { ...slot, template, dslSource: serializeSlotToDsl(slot) };
  }

  if (template === '状态机与时序') {
    const slot: CanvasSlot = {
      id: 'slot-fsm',
      name: '状态机与时序',
      nodes: [
        { id: 'fsm-1', dslId: 'draft', x: 40, y: 110, kind: 'fsm_init', stateRole: 'initial', tag: 'INITIAL STATE', title: 'Draft · 待初始化', note: 'Entry: reset_context()', color: 'violet' },
        { id: 'fsm-2', dslId: 'simulating', x: 340, y: 30, kind: 'fsm_mid', stateRole: 'active', tag: 'ACTIVE STATE', title: 'Simulating · 推演中', note: 'Guard: dag_acyclic == true', color: 'sky' },
        { id: 'fsm-3', dslId: 'rollback', x: 340, y: 200, kind: 'fsm_error', stateRole: 'active', tag: 'COMPENSATE', title: 'Rollback · 异常回滚', note: 'Action: restore_snapshot()', color: 'amber' },
        { id: 'fsm-4', dslId: 'committed', x: 640, y: 110, kind: 'fsm_end', stateRole: 'terminal', tag: 'FINAL STATE', title: 'Committed · 已固化', note: 'Exit: emit_snapshot()', color: 'emerald' },
      ],
      edges: [
        { id: 'fsm-e1', from: 'fsm-1', to: 'fsm-2', label: 'dispatch()' },
        { id: 'fsm-e2', from: 'fsm-2', to: 'fsm-3', label: 'on_conflict', dashed: true },
        { id: 'fsm-e3', from: 'fsm-2', to: 'fsm-4', label: 'ack_commit' },
      ],
      flows: [
        {
          id: 'commit_flow',
          name: '正常提交状态流转',
          steps: [
            { order: 1, from: 'fsm-1', to: 'fsm-2', label: 'dispatch() 校验无环并进入推演态' },
            { order: 2, from: 'fsm-2', to: 'fsm-4', label: 'ack_commit 持久化不可变快照' },
          ],
        },
      ],
    };
    return { ...slot, template, dslSource: serializeSlotToDsl(slot) };
  }

  if (template === '算法与数据流') {
    const slot: CanvasSlot = {
      id: 'slot-dag',
      name: '算法与数据流',
      nodes: [
        { id: 'dag-1', dslId: 'parser', x: 40, y: 100, kind: 'dag_parser', complexity: 'O(N)', tag: 'STAGE 01 · PARSER', title: 'DSL 词法与 CST 解析器', note: '流式读取节点定义并保留精确字节偏移。', color: 'violet' },
        { id: 'dag-2', dslId: 'solver', x: 350, y: 100, kind: 'dag_transform', complexity: 'O(V + E)', tag: 'STAGE 02 · SOLVER', title: 'DAG 拓扑排序与环路检测', note: '计算层级顺序并识别循环依赖。', color: 'sky' },
        { id: 'dag-3', dslId: 'sink', x: 660, y: 100, kind: 'dag_sink', complexity: 'O(1)', tag: 'STAGE 03 · SINK', title: '增量差分快照落盘', note: '仅写入脏布局覆盖，保持 .arch 文本整洁。', color: 'emerald' },
      ],
      edges: [
        { id: 'dag-e1', from: 'dag-1', to: 'dag-2', label: 'CST Stream' },
        { id: 'dag-e2', from: 'dag-2', to: 'dag-3', label: 'Sorted DAG' },
      ],
      flows: [],
    };
    return { ...slot, template, dslSource: serializeSlotToDsl(slot) };
  }

  if (template === '接口契约与领域边界') {
    const slot: CanvasSlot = {
      id: 'slot-ddd',
      name: '接口契约与领域边界',
      nodes: [
        { id: 'ddd-1', dslId: 'iam_ctx', x: 60, y: 90, kind: 'ddd_core', tag: 'BOUNDED CONTEXT · IAM', title: '身份与权限限界上下文', aggregate: 'Aggregate: WorkspaceMember', note: '发布领域事件: MemberRoleChanged / TokenRevoked', color: 'violet' },
        { id: 'ddd-2', dslId: 'core_ctx', x: 410, y: 90, kind: 'ddd_support', tag: 'BOUNDED CONTEXT · CORE', title: '推演引擎核心域', aggregate: 'Aggregate: CanvasDocument', note: '通过防腐层 (ACL) 隔离外部权限模型。', color: 'sky' },
      ],
      edges: [
        { id: 'ddd-e1', from: 'ddd-1', to: 'ddd-2', label: 'Domain Event / ACL', dashed: true },
      ],
      flows: [],
    };
    return { ...slot, template, dslSource: serializeSlotToDsl(slot) };
  }

  // Default: 系统架构拓扑
  const archSlot: CanvasSlot = {
    id: 'slot-arch',
    name: '系统架构拓扑',
    nodes: [
      { id: 'n-1', dslId: 'api_gw', x: 40, y: 50, kind: 'ingress', icon: 'log-in', tag: 'Ingress · L7', tech: 'APISIX', title: 'API 边缘网关', note: '处理 TLS 终止、JWT 鉴权与令牌桶限流。', color: 'violet' },
      { id: 'n-2', dslId: 'order_svc', x: 350, y: 50, kind: 'service', icon: 'hexagon', tag: '业务服务', tech: 'Go / gRPC', title: '订单聚合服务', note: '负责核心下单编排、幂等键校验与状态机驱动。', color: 'sky' },
      { id: 'n-3', dslId: 'order_db', x: 660, y: 10, kind: 'db', icon: 'database', tag: 'PostgreSQL', tech: 'PG 16', title: 'PostgreSQL 主库', note: '按 user_id 哈希分片，承载订单主表与流水。', color: 'emerald', drillTarget: { layerId: 'layer-data' } },
      { id: 'n-4', dslId: 'inventory_svc', x: 660, y: 145, kind: 'service', icon: 'hexagon', tag: '业务服务', tech: 'Rust / gRPC', title: '库存履约服务', note: '预扣减库存并提供异常回滚补偿接口。', color: 'sky' },
      { id: 'n-5', dslId: 'ann_assumption', x: 660, y: 270, kind: 'assumption', icon: 'lightbulb', tag: '假设', title: '履约服务弱网降级前提', note: '库存履约超 300ms 时切异步预约队列，避免拖垮主下单链路。', color: 'amber', linkNodeId: 'n-4' },
      { id: 'n-6', dslId: 'ann_decision', x: 350, y: 185, kind: 'decision', icon: 'shield-check', tag: '决策', title: 'ADR-002：采用 gRPC + 幂等键', note: '第 2 跳采用强类型 gRPC 与客户端幂等 Token，P99 控制在 8ms 内。', color: 'emerald', linkNodeId: 'n-2' },
    ],
    edges: [
      { id: 'e-1', from: 'n-1', to: 'n-2', label: 'createOrder', protocol: 'gRPC', routing: 'bezier' },
      { id: 'e-2', from: 'n-2', to: 'n-3', label: 'insert snapshot', protocol: 'SQL', routing: 'bezier' },
      { id: 'e-3', from: 'n-2', to: 'n-4', label: 'reserveStock', protocol: 'gRPC', dashed: true, routing: 'bezier' },
    ],
    flows: [
      {
        id: 'checkout_main',
        name: '核心下单主链路',
        description: '验证鉴权、落库与库存预扣减的关键路径',
        steps: [
          { order: 1, from: 'n-1', to: 'n-2', edgeId: 'e-1', label: '网关完成 JWT 鉴权并转发 createOrder', latency: '8ms', rationale: '采用 gRPC + 幂等键防重' },
          { order: 2, from: 'n-2', to: 'n-3', edgeId: 'e-2', label: '事务写入订单快照（状态 = 待支付）', latency: '12ms', rationale: '按 user_id 分片保证单库事务' },
          { order: 3, from: 'n-2', to: 'n-4', edgeId: 'e-3', label: '异步触发库存预扣减与履约锁仓', latency: '15ms', parallel: true },
        ],
      },
    ],
  };

  return { ...archSlot, template, dslSource: serializeSlotToDsl(archSlot) };
}

export function createDefaultProjects(): ProjectDocument[] {
  const now = Date.now();
  const archLayer = buildScenePresetForTemplate('系统架构拓扑');
  const dataLayer = buildScenePresetForTemplate('数据建模');
  const deployLayer = buildScenePresetForTemplate('云原生部署拓扑');
  const fsmLayer = buildScenePresetForTemplate('状态机与时序');
  const dagLayer = buildScenePresetForTemplate('算法与数据流');

  return [
    {
      id: 'p-1',
      title: '微服务网关与 RPC 架构',
      subtitle: '本地项目 · v1.2.0 · 3 层架构',
      meta: '系统架构拓扑 + 数据建模 + 云原生部署',
      category: 'personal',
      type: 'local',
      icon: 'network',
      updatedAt: now - 12 * 60 * 1000,
      layers: [
        { id: 'layer-arch', ...archLayer },
        { id: 'layer-data', ...dataLayer },
        { id: 'layer-deploy', ...deployLayer },
      ],
    },
    {
      id: 'p-2',
      title: '分布式状态机与 Raft 共识',
      subtitle: '本地项目 · v0.9.4 · 2 层架构',
      meta: '状态机与时序 + 算法与数据流',
      category: 'personal',
      type: 'local',
      icon: 'git-branch',
      updatedAt: now - 2 * 60 * 60 * 1000,
      layers: [
        { id: 'layer-fsm', ...fsmLayer },
        { id: 'layer-dag', ...dagLayer },
      ],
    },
    {
      id: 'p-3',
      title: '边缘计算节点冷启动调度链',
      subtitle: '归档项目 · v1.0.0',
      meta: '已归档快照 · 云原生部署拓扑',
      category: 'archived',
      type: 'local',
      icon: 'archive',
      updatedAt: now - 14 * 24 * 60 * 60 * 1000,
      layers: [{ id: 'layer-arch-archived', ...deployLayer }],
    },
  ];
}
