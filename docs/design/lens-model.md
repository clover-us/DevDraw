# 镜片模型与类型抽象（Lens Model & Type Abstraction）

> 状态：v0.3 草案，供讨论 · 2026-11-14（三镜片原型已建成并验证灵魂；新增 §10 规模化与可理解性、§11 demo 验证结论）
> 上游：[vision.md](../vision.md)（灵魂与路线）· 演进 [core-semantics.md](./core-semantics.md)（其扁平 schema 将被本文的类型注册表演进）
> 方法：自下而上、rule of three——先建三个具体案例（架构 / ER / 状态机），让抽象从对比中浮现，而非自上而下拍一个普适 schema。

---

## 1. 立场（已对齐）

- **灵魂**：把思考外化成一个会"顶嘴"的模型——推演替你检验思考、抓你没想到漏洞。爆炸半径收缩只是它顶嘴的第一种方式，不是灵魂本身。
- **一个模型，多副镜片（lens）**：ER / 架构 / 状态机 / 部署……不是三个模型，是**同一张语义图**的不同投影。护城河 = **推演穿镜而过**（改一处，全局横跨多种图）。
- **镜片是二维坐标系**，不是枚举列表：
  - 轴 A · kind（看哪个侧面）：结构 / 行为 / 流动 / 运行时。
  - 轴 B · zoom（看多细）：C4 式 Context→Container→Component→Code。
- **模型统一，推演器 plural**：每副镜片有自己的推理规则。绝不用一个万能 simulation 引擎套所有镜片。
- **抽象陷阱警戒**：类型必须携带意义（Database 与 Service 在失效面前行为不同）。万物皆通用 node+props 的"灵活"会杀死灵魂。

---

## 2. 三个 grounding 案例：同一个订单系统

### 2.1 架构镜片（已有 spike，形式化）

节点：`n_user`(Actor)、`n_gateway`(Service)、`n_order`(Service)、`n_payment`(Service)、`n_risk`(Service)、`n_order_db`(Database)、`n_events`(Queue)、`n_notify`(Service)。

边（依赖模式）：
- user→gateway `calls`；gateway→order `calls`
- order→payment `calls·hard`（latencyMs 120）
- order→risk `calls·soft`（兜底：事后人工审核）
- order→order_db `writes·hard`
- order→events `publishes·soft`（outbox）
- events→notify `subscribes·async`

**推演器**：失效传播（hard/soft/async + 单调状态格 + 可解释路径，已建、15 测试绿）。

### 2.2 ER 镜片（zoom 进 `n_order_db`）

```json
{
  "nodes": {
    "t_orders":      { "type": "Table", "name": "orders" },
    "f_orders_status":{ "type": "Field", "name": "status", "attrs": { "dataType": "enum" } },
    "t_order_items": { "type": "Table", "name": "order_items" },
    "t_payments":    { "type": "Table", "name": "payments" },
    "t_refunds":     { "type": "Table", "name": "refunds" }
  },
  "edges": {
    "e_orders_items":    { "from": "t_orders",   "to": "t_order_items", "type": "fk", "attrs": { "cardinality": "1:N", "key": "order_id" } },
    "e_orders_payments": { "from": "t_orders",   "to": "t_payments",    "type": "fk", "attrs": { "cardinality": "1:N", "key": "order_id" } },
    "e_payments_refunds":{ "from": "t_payments", "to": "t_refunds",     "type": "fk", "attrs": { "cardinality": "1:N", "key": "payment_id" } },
    "e_orders_status":   { "from": "t_orders",   "to": "f_orders_status","type": "contains" }
  }
}
```

**推演器**：模式影响——改/删一列牵连哪些表与查询；外键完整性；基数一致性。（与失效传播**完全不同**的一类推理。）

### 2.3 状态机镜片（`orders` 实体的生命周期）

引入 `Lifecycle` 容器节点作为跨镜片锚点，状态包含其中：

```json
{
  "nodes": {
    "sm_order":     { "type": "Lifecycle", "name": "Order 生命周期" },
    "s_created":    { "type": "State", "name": "Created", "attrs": { "initial": true } },
    "s_awaiting":   { "type": "State", "name": "AwaitingPayment" },
    "s_paid":       { "type": "State", "name": "Paid" },
    "s_fulfilling": { "type": "State", "name": "Fulfilling" },
    "s_completed":  { "type": "State", "name": "Completed" },
    "s_cancelled":  { "type": "State", "name": "Cancelled" },
    "s_refunded":   { "type": "State", "name": "Refunded" }
  },
  "edges": {
    "tr_submit":   { "from": "s_created",  "to": "s_awaiting",  "type": "transition", "attrs": { "event": "submit_order" } },
    "tr_pay":      { "from": "s_awaiting", "to": "s_paid",      "type": "transition", "attrs": { "event": "payment_captured", "effectedBy": "n_payment" } },
    "tr_timeout":  { "from": "s_awaiting", "to": "s_cancelled", "type": "transition", "attrs": { "event": "payment_timeout" } },
    "tr_fulfill":  { "from": "s_paid",     "to": "s_fulfilling","type": "transition", "attrs": { "event": "start_fulfillment", "effectedBy": "n_fulfillment" } },
    "tr_deliver":  { "from": "s_fulfilling","to": "s_completed","type": "transition", "attrs": { "event": "delivery_confirmed", "effectedBy": "n_fulfillment" } },
    "tr_refund_paid":     { "from": "s_paid",      "to": "s_refunded", "type": "transition", "attrs": { "event": "refund_before_ship" } },
    "tr_refund_completed":{ "from": "s_completed", "to": "s_refunded", "type": "transition", "attrs": { "event": "post_delivery_return" } }
  }
}
```

**推演器**：生命周期验证——不可达状态、死锁（非终态却无出边）、非法迁移（违反不变量）、缺失迁移提示。终态由"无出边"自动推导（此例 Cancelled / Refunded 为终态）。

---

## 3. 跨镜片边：同一个「Order」贯穿三副镜片

把三副镜片连进**同一张图**的胶水边：

```json
{
  "e_db_orders":        { "from": "n_order_db", "to": "t_orders",   "type": "contains" },
  "e_order_reads":      { "from": "n_order",    "to": "t_orders",   "type": "reads" },
  "e_order_writes":     { "from": "n_order",    "to": "t_orders",   "type": "writes" },
  "e_payment_writes":   { "from": "n_payment",  "to": "t_payments", "type": "writes" },
  "e_orders_lifecycle": { "from": "t_orders",   "to": "sm_order",   "type": "has-lifecycle" },
  "e_status_encodes":   { "from": "f_orders_status", "to": "sm_order", "type": "encodes" }
}
```

外加**边→节点的跨镜片引用**（存为属性，避免超图）：`tr_pay.effectedBy = n_payment`、`tr_fulfill.effectedBy = n_fulfillment`。

**「Order」这个领域实体没有独立节点**——它从跨镜片连通簇里**浮现**：`订单服务 —reads/writes→ orders 表 —has-lifecycle→ Order 生命周期`，`orders.status —encodes→ 生命周期`。一个名词，三副镜片各看一面。

### 3.1 杀手级演示：模型跨镜片顶嘴

注意 `tr_fulfill` / `tr_deliver` 引用了 `n_fulfillment`——**但架构镜片里根本没有履约服务**。推演器立刻抓到一个思考漏洞：

> 「你的订单生命周期假设了一个『履约』能力（start_fulfillment / delivery_confirmed），但你的架构没有提供任何服务来实现它。Order 会永远卡在 Paid。」

这正是灵魂——**不是画得好看，是想得对**。单看任何一副镜片都发现不了；只有推演穿镜而过才抓得到。其它现成发现：
- 缺失迁移提示：「Paid 没有直接取消路径——已支付订单不可取消，是有意吗？」
- 非法迁移不变量：声明「Refunded 必须终态」→ 验证其无出边。

---

## 4. 浮现的抽象

### 4.1 公共底座（所有镜片共享）

```ts
Node { id: slug; type: TypeId; name: string; attrs: Record<string, unknown>; provenance: 'human'|'ai'|'code-import' }
Edge { id: slug; from: NodeId; to: NodeId; type: EdgeTypeId; attrs: Record<string, unknown> }
Model { schemaVersion: number; name: string; nodes: Record<id, Node>; edges: Record<id, Edge> }
```

**一张图，装下所有镜片。** 跨镜片边就是普通边，只是两端类型属于不同镜片。

### 4.2 类型注册表（数据，不是枚举）

每个类型声明：**镜片归属** + 属性软 schema + 可参与的边类型。推演语义不写在类型里，由镜片推演器按类型分派。

```ts
TypeDef { id: 'Table'; lenses: ['er']; attrs?: SoftSchema; edges?: { asSource: EdgeTypeId[]; asTarget: EdgeTypeId[] } }
// Service → ['architecture']；Table/Field → ['er']；State/Lifecycle → ['state-machine']
// Database → ['architecture']，且经 contains 桥接到 er（zoom 锚点）
```

### 4.3 镜片注册表（开放、可插拔）

```ts
LensDef {
  id: 'architecture' | 'er' | 'state-machine' | ...;
  nodeTypes: TypeId[]; edgeTypes: EdgeTypeId[];   // 投影：显示哪些类型
  layout: 'elk-layered' | 'elk-force' | ...;
  reasoner: Reasoner;                              // 插件：对该投影推理
}
```

- architecture → `failurePropagation`（已建）
- er → `schemaImpact`
- state-machine → `lifecycleVerification`

**加一副新镜片 = 注册一个 LensDef + 一个推演器，不动底座。** 这是"勘探全景"换来的可扩展性。

### 4.4 跨镜片边分类

| 边类型 | 连接 | 作用 |
|---|---|---|
| `contains` | Database→Table；Table→Field；Lifecycle→State | zoom 锚点 / 组成 |
| `reads`/`writes` | Service→Table | 架构 ↔ ER |
| `has-lifecycle` | Table→Lifecycle | ER ↔ 状态机 |
| `encodes` | Field→Lifecycle | 字段是状态的物理编码 |
| `effectedBy`（属性引用） | Transition→Service | 状态机 ↔ 架构 |

---

## 5. 设计决策与冷水

1. **推演器 plural，模型 unified**（已对齐）。跨镜片推演 = 多个推演器经共享图**组合**，不是万能引擎。
2. **领域实体 v1 不设独立元节点**（避免抽象陷阱）。Order 从跨镜片连通簇浮现；若日后需要显式 Subject 节点再加，届时已有具体案例支撑。
3. **跨镜片连接两种机制**：节点→节点用边；边→节点（如 transition→service）用属性引用，避免超图复杂性。
4. **类型/镜片注册表皆数据驱动、开放**（延续 vision 决策），类型携带镜片归属。
5. **冷水·范围**：全景是勘探，不是施工清单。v1 只建架构 + ER + 状态机三镜片；部署/数据流/模块依赖等留注册表缝，不实现。

---

## 6. 对现有 spike 的影响 + 下一步

- spike 的扁平 `NodeType`/`EdgeType` 枚举 → 演进为**类型注册表 + 镜片注册表**。
- spike 的 `simulate()` → 成为 **architecture 镜片的推演器插件**（语义不变，归位）。
- `applyPatch` 唯一变更咽喉点、overlay 不改模型、稳定 slug id——**全部保留**，跨镜片同样适用。

下一步（待本文对齐后）：
1. 定稿本文 → 落 actual `model.json`（一个文件含三镜片 + 跨镜片边）。
2. 重构 spike 类型系统为注册表；新增 ER / 状态机镜片与各自推演器。
3. 演示 §3.1 的跨镜片顶嘴（履约缺口）——这是比单图爆炸半径更硬的灵魂验证。

---

## 7. 决策记录（已对齐）

1. **灵魂演示确认**：§3.1「履约缺口」跨镜片发现 = 用户心中"模型顶嘴"该有的样子。作为比单图爆炸半径更硬的灵魂验证。
2. **第四镜片（部署/冗余）稍后**：v1 只建架构 + ER + 状态机；部署留注册表缝，不实现。
3. **ER 推演器含基数一致性**：v1 范围见 §8。
4. **状态机含交互式反问**：能力分解见 §9；AI 可选（决策④），手动决策卡片为降级路径。

---

## 8. ER 推演器 · 基数一致性 v1 范围

基数 = 关联数量（1:1 / 1:N / N:M）+ 可选性（min 0 或 1）。一致性 = 声明的基数 vs 实际结构（外键位置/中间表/可空）是否对得上。三条确定性结构检查（零 AI）：

1. **外键位置 vs 基数**：1:N 的外键必须在"多"方。`orders 1—N payments` ⇒ `order_id` 必在 payments；若放进 orders → 顶嘴"每个订单只能存一个 payment_id，表达不了一对多"。
2. **N:M 必须有中间表**：`orders N:M products` 直连非法（单外键只能 1:N）→ 顶嘴"需中间表；order_items 即 orders↔products 的中间表，建议改为 orders 1—N order_items N—1 products"。
3. **可选性 / 孤儿**：`order_items.order_id` 可空 ⇒ 允许"无订单的订单项" → 反问"是否有意？"。

另含基础项：改列/删列的牵连分析、外键完整性。
**留后**：跨镜片基数张力（ER `orders 1—N payments` vs 生命周期"仅一笔成功支付"）属跨镜片推理，后续。

---

## 9. 交互式反问 · 能力分解（AI 可选）

误解澄清：**"模型会问聪明问题" ≠ 需要 AI**。四层，前三层零 AI：

1. **缺口检测（确定性图算法）**：可达性（Paid 能否到 Cancelled）、类比检测（兄弟状态 AwaitingPayment 可取消而 Paid 不可）、终态不可达、缺错误/超时路径。与生命周期推演器同族，纯 TS 可单测。
2. **问题成为一等公民**：复用现有 `Assumption` / `Decision` 节点类型。缺口 → `Assumption`（"Paid 不可取消——待确认"）→ 用户回答 → 升格 `Decision`（ADR）+ `applyPatch` 加迁移。**把 M1 推演与 M2 知识/ADR 缝合**；反问沉淀为决策记录。
3. **决策 UI（手动降级路径）**：缺口渲染为决策卡片 + 选项（如 [允许已支付取消并退款] / [维持不可取消] / [待定]），点选即 `applyPatch`。无 AI 全功能可用（决策④）。
4. **AI 增味（可选，M3）**：provider 无关适配器，生成更贴上下文的问题、给建议、讲权衡；手动模板为 fallback。

**可行性**：1–3 层全部复用已规划能力（确定性推演器 + applyPatch + Decision/Assumption 节点），无新根本能力。
**真正难点 = 缺口规则策展**：只问结构显著的缺口（兄弟有它没有/终态不可达/缺错误路径），不问"Created 该不该有自环"之类噪音。是设计功夫，非 AI 功夫。
**灵魂升华**：模型不只抓洞，还把洞变成记录的决策——思考工具把推理积累成 ADR。

---

## 10. 规模化与可理解性（开发阶段设计约束）

> 来源：demo 验证后用户提出的真问题——"几百张表、关联错综复杂怎么办？架构/状态机同样会乱。完全不懂系统看不懂怎么办？"
> 立场：**UI/视觉/布局是开发阶段的债，推迟零风险；但规模化的"语义"会反噬架构，必须现在确认方向。** 本节记录方向，不写实现。

### 10.1 区分两类问题

| 问题 | 性质 | 何时处理 |
|---|---|---|
| ER 实体不好看、字段几十上百、关联错综复杂 | 纯 UI/UX（布局 + 渐进披露） | 开发阶段，不动地基 |
| 架构/状态机节点多了会乱 | 同上 | 开发阶段 |
| 不懂系统看不懂 | **接近灵魂**：模型自解释（见 §10.3） | 贯穿 M1–M3 |
| 推演器在大规模下还有没有意义 | **架构问题**（见 §10.2） | 现在确认方向，开发时局部优化 |

### 10.2 规模化的真正考验：推演还顶不顶得动嘴

不是"画得下"，而是"推演在大规模下仍有意义"。两个具体风险与对策（地基已留路，无需现在写代码）：

1. **O(N²) 陷阱**：现 SPOF 推演器对每节点跑一次全图 simulate，8 节点可行、800 节点卡死。
   → **推演按需、局部化**：点到哪/改到哪才算哪的邻域。`applyPatch` 唯一咽喉点 + 不可变模型天生支持**增量重算**（只重算受影响子图）。
2. **反问噪音**：全量扫描缺口，几百条迁移会一次甩 200 个反问——那不是顶嘴，是噪音，灵魂死掉。
   → **反问排序 + 收敛**：缺口规则策展（§9，只问结构显著的洞）+ 按严重度/影响面排序 + 一次只顶最痛的一下。这是推演器策略，非 UI。
3. **镜片即降维武器**：几百张表不会同时砸给用户——ER 镜片可按模块/聚合再切子镜片（zoom 轴，C4 式），一次只看一个上下文。**一个模型多副镜片**这个决定恰为规模化准备。

**结论**：统一模型 + 可插拔推演器 + applyPatch 咽喉点 + 镜片投影，已为规模化留好路。开发阶段 O(N²)→增量、反问加排序，皆局部优化，不推翻架构。

### 10.3 "看不懂系统" = 模型自解释（核心，非 onboarding 功能）

新人看不懂系统，本质是**脑子里没有模型**。DevDraw 的解法不是新手引导弹窗，而是让模型自己会解释：
- **镜片**让他一次只看一个视角，不被全貌淹没；
- **推演器**主动指出哪里有问题、为什么（履约缺口那条 error 就是在替不懂系统的人指出"这里断了"）；
- **反问 + ADR** 把隐含设计决策显性化（"为什么 Paid 不能取消？"答案沉淀在模型里）。

现状雏形：每条 finding 已带 `title + detail`（一句话人话解释）。延伸：M3 AI 质询生成更贴上下文的解释。**可理解性是灵魂的延伸，不是待办 UI。**

---

## 11. demo 验证结论（2026-11-14，原型 bc82c7e）

**使命达成**：用户亲手点出履约缺口后确认"心里咯噔一下，这就是我想要的感觉"。灵魂（模型跨镜片顶嘴）验证通过。

**已验证**：
- 抽象从三案例浮现（rule of three）：公共底座 `Node/Edge/Model` 不变，新类型/边是"加数据"非"改引擎"。
- 护城河成立：模型统一 + 推演器 plural + 推理穿镜而过（状态机读架构节点抓履约缺口；架构 SPOF 读全模型）。
- 反问→ADR 回路零 AI 可用：确定性检测 + applyPatch 落地 + hasRecord 抑制重复追问。
- 27/27 测试绿；tsc + vite build 通过。

**关键修正**：失效传播只沿运行时依赖（calls/reads/writes/publishes/subscribes/depends-on/contains），结构边（fk/transition/has-lifecycle/encodes）不承载失效（PROPAGATING_EDGES 白名单）。

**刻意不做（原型级）**：无持久化（刷新重置）、手写坐标无自动布局、无自由建模 UX。这些归 M0/M1 开发阶段。

**节奏决定**：demo 阶段到此画句号，不再打磨视觉（边际收益递减、耗心气）。UI/视觉/建模 UX 留到开发阶段专门做一轮"交互与视觉设计"，由真实复杂度驱动，避免现在空想过度设计。