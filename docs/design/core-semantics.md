# DevDraw 核心语义设计 v0.3

> 配套 [../vision.md](../vision.md)。本文把构思中的开放问题落成可评审的具体设计：语义模型、推演语义、知识引用、思路图谱。
> 状态：作者已确认（2026-11-14）——**v1 严格语义**（思路图谱后置 v2+）；模拟 = 可达性 + 依赖模式，纯手工标注；项目先私有。剩余开放问题见 §6。
>
> **v0.3（2026-11-15）**：§1.3 与 §2.6 按已落地代码重写——推演会话从"存快照"改为**存场景 + 当时的结论，在今天的模型上重放**；新增场景（`seeds`）归属视图、会话对账（drift）语义与一条必须写死的陷阱（"消失的单点故障"可能是被孤立死的节点）。

## 1. 语义模型（model.json）

### 1.1 示例（贯穿全文的 running example）

```jsonc
{
  "schemaVersion": 1,
  "name": "订单系统",
  "nodes": {
    "n_gateway":   { "type": "Service", "name": "API 网关", "attrs": { "replicas": 2 } },
    "n_order":     { "type": "Service", "name": "订单服务", "attrs": { "tech": "Go", "criticality": "high" } },
    "n_payment":   { "type": "Service", "name": "支付服务", "attrs": { "replicas": 3 } },
    "n_risk":      { "type": "Service", "name": "风控服务" },
    "n_order_db":  { "type": "Database", "name": "订单库" },
    "n_events":    { "type": "Queue", "name": "订单事件队列" },
    "n_notify":    { "type": "Service", "name": "通知服务" }
  },
  "edges": {
    "e_gw_order":    { "type": "calls", "from": "n_gateway", "to": "n_order", "attrs": { "protocol": "HTTP", "latencyMs": 8 } },
    "e_order_pay":   { "type": "calls", "from": "n_order", "to": "n_payment", "attrs": { "dependency": "hard", "latencyMs": 120 } },
    "e_order_risk":  { "type": "calls", "from": "n_order", "to": "n_risk", "attrs": { "dependency": "soft", "fallback": "降级为事后人工审核" } },
    "e_order_db":    { "type": "writes", "from": "n_order", "to": "n_order_db" },
    "e_order_evt":   { "type": "publishes", "from": "n_order", "to": "n_events", "attrs": { "dependency": "soft", "fallback": "本地 outbox 暂存" } },
    "e_evt_notify":  { "type": "subscribes", "from": "n_notify", "to": "n_events" }
  },
  "groups": {
    "g_trade": { "name": "交易域", "members": ["n_order", "n_payment", "n_risk", "n_order_db"] }
  }
}
```

### 1.2 结构决策（已定，技术性强，异议请提）

| 决策 | 选择 | 理由 |
|---|---|---|
| 节点/边容器 | **id → 对象 的 map**，不用数组 | patch 按 id 定位，无数组位移；git diff 稳定；CRDT 友好 |
| id | **不可变 slug**（`n_order`），创建时由名称生成 + 冲突后缀 | 可读、可被笔记引用；改名不改 id，引用永不断 |
| 类型系统 | **类型注册表是数据不是枚举**：内置类型 + 用户自定义类型 | 每个类型声明：渲染提示、建议属性、边的默认依赖模式（见 §2）；用户可加 `Cache`、`CDN` 等 |
| 属性 | 自由键值 + 按类型的**软校验**（警告不阻塞） | 思考工具不应被 schema 卡住；结构化 attrs 为日后导入留口 |
| 布局位置 | **存 views.json，不存 model.json** | 模型 = 纯语义，干净可 diff；自动布局只写视图 |
| 变更入口 | **所有修改经过唯一 `applyPatch(model, patch)`** | patch = addNode/removeNode/updateNode/addEdge/… 的可序列化操作；undo/redo、AI 草稿应用、未来 CRDT 同步全部复用这一个咽喉点，v1 成本极低 |
| 完整性 | applyPatch 内强制：无悬空边、删节点连带删边 | 一致性校验的第一道闸 |
| 来源 | 每元素 `provenance: { by: human|ai|code-import, at }` | AI 草稿与代码导入可追溯、可筛选 |

### 1.3 视图、场景与推演会话

- `views.json`：每个视图 = `{ positions: {nodeId: {x,y}}, seeds?: string[], filter?, styleOverrides? }`。视图是模型的投影，删视图不丢语义。
- `seeds` = **当前镜片上的失效场景**（"谁挂了"的 what-if 假设）。
  - 它属于**视图**而不是模型：假设不是语义事实，所以永不写进 `model.json`——否则假设会污染模型、让 git diff 里出现"幽灵节点状态"。
  - 但它在切换镜片、刷新页面后仍在：同一个模型可以同时挂两个不同假设（架构镜片"支付服务挂了"、ER 镜片"orders 表没了"），互不干扰。
- `reasoning/<id>.json`：一次推演会话 = **场景 + 当时的结论**，不存模型快照：

```jsonc
{
  "schemaVersion": 1,
  "id": "ses_01J8ZK3Q7M",
  "name": "支付服务 失效 · 11-15 01:40",        // 自动命名（场景 + 时间），人可改
  "createdAt": "2026-11-15T01:40:12.000Z",
  "lens": "architecture",
  "seeds": ["n_payment"],                       // 场景：令谁失效
  "findings": [                                 // 当时模型顶了哪些嘴（摘要，不是全文）
    { "id": "spof:n_payment", "severity": "warning", "title": "单点故障：支付服务" }
  ],
  "blast": { "failed": 3, "degraded": 0, "affectedEntries": ["n_user"] }
}
```

- 序列化与 `model.json` 同规则：固定键序、2 空格、UTF-8 无 BOM、结尾换行 → git 友好。
- **一文件一会话**：diff 干净、冲突面小、删一个不动其他；文件名 = 不可变 id（`ses_…`），改名只改内部 `name`。
- **为什么存场景而不是存快照**——见 §2.6，这是本设计的核心取舍。

## 2. 推演语义（灵魂，确定性、可解释、不依赖 LLM）

### 2.1 核心洞察：依赖模式让模拟有意义

朴素可达性会把整张图染红，毫无信息量。关键在**每条边的依赖模式**：

| 模式 | 语义 | 传播规则（被依赖方失效时） |
|---|---|---|
| `hard` | 同步强依赖，无兜底 | 依赖方 → `failed` |
| `soft` | 有降级/兜底（fallback 文本必填） | 依赖方 → `degraded`，继续传播 degraded |
| `async` | 异步解耦（队列缓冲） | 依赖方 → `degraded`（标注「积压」），不立即失效 |

边类型的默认模式：`calls`/`reads`/`writes` → hard；`publishes` → hard（可改 soft+outbox）；`subscribes` → async；`depends-on` → hard；`contains` → 整体失效则部分失效（向下传播）。

**节点状态格**：`ok < degraded < failed`，传播只升不降 → 有环也保证终止。算法 = 从失效集出发的 worklist BFS，逐边套用规则，为每个受影响节点记录**传播路径**（侧栏展示「为什么受影响」）。

### 2.2 模拟 = overlay，绝不改模型

- 模拟产出 `{nodeId: state}` 叠加层 + 影响路径集；模型本身不动。
- 多个场景可并排对比（v1.5：同一模型的两个场景并列看爆炸半径）；单个场景存为 ReasoningSession（§2.6）。
- **免费附赠单点检测（SPOF）**：对每个节点跑一次失效模拟，统计受影响的用户入口（Actor/Endpoint）数；影响 ≥1 个入口且无 soft/async 缓冲的节点 = 单点候选。N 次 BFS，小图开销可忽略。

### 2.3 请求追踪

- 追踪 = 从 Actor/Endpoint 出发、沿 `calls/reads/writes/publishes/subscribes` 的一条路径（可分支）。
- **手动步进为主**（这才是推演）：每一跳由用户在出边中选择，边上的 latency/failureMode 标注 + 节点笔记辅助判断；自动枚举简单路径作为建议。
- 分支 = 边的 `when` 条件（如「缓存未命中」），步进时选择。
- 追踪可加注解（「这里是瓶颈」），保存为 ReasoningSession；注解可一键转为 `Assumption`/`Decision` 节点。

### 2.4 核心价值循环：编辑 → 重演 → 对比

> 把「订单→支付」从 hard 改为 soft+兜底，或把同步调用改为经队列 async——重跑同一失效场景，**爆炸半径 visibly 缩小**：failed 数下降、入口影响消失。

这是产品最有力的一句话：**推演让架构权衡可见、可量化**（爆炸半径 = failed/degraded 计数 + 受影响入口）。设计评审从口头争论变成对着同一场景做实验。

### 2.5 模拟属性来源（已确认）

- **v1：纯手工标注**（结构化 attrs：latencyMs、replicas、dependency、fallback…）。
- 从代码/监控推导 = 需要集成，违背 local-first  simplicity，放 v2+；attrs 结构化已为导入留口。
- 容量算术（流量×2 → 超 capacity）作为 v1.5 可选小步，不预造仿真引擎。

### 2.6 推演会话：存场景，在今天的模型上重放

**核心取舍**：会话存的是**场景 + 当时的结论**，不是模型快照。

| | 存快照 | 存场景（本项目采用） |
|---|---|---|
| 打开看到什么 | 昨天那张图，与今天无关 | 昨天的假设**跑在今天的模型上** |
| 回答什么问题 | "昨天长这样" | "**昨天的判断，今天还成立吗？**" |
| 模型演化后 | 只能怀念，无法比较 | 自动产出差异清单 |
| 本质 | 墓碑 | 对照实验 |

- **重放**：打开会话时，用会话的 `lens` + `seeds` 在当前模型上重跑推演器与失效模拟，得到"现在"的结论，再与会话里的 `findings` / `blast` 对账。
- **对账（drift）**：按 finding `id` 对齐，产出四类差异——

| 类别 | 含义 | 读者该问的问题 |
|---|---|---|
| `added` | 现在才顶的嘴 | 是我引入的，还是它一直都在只是没被看见？ |
| `resolved` | 已经不再顶嘴 | **是真修好了，还是被绕过去了？**（见下方陷阱） |
| `changed` | 同一条发现严重度变了（error→warning） | 我改的那处是根因还是症状？ |
| `blast` | 爆炸半径差值（**now − then**，负数 = 收缩） | 收缩是来自兜底，还是来自"少了一块"？ |

- **必须写死的陷阱：`resolved` 不等于"变好了"。**
  实测例子：删掉「订单服务」后，支付服务、订单库的单点故障全部消失——因为从入口到它们的路径断了。**消失的单点故障，可能是被孤立死的节点。**
  所以对账只负责**把变化摆出来**，绝不替人下"这次改动更好了"的结论。这正是"模型顶嘴、人拍板"这条边界的体现：模型可以指出"你昨天担心的东西今天不报警了"，但"这是福是祸"必须由人判断。
- **与前缀功能的边界**：
  - 这是**设计期**的对账（同一模型前后两个版本）。
  - M4 的**架构漂移推演器**是它的孪生兄弟：那一个对比"设计 vs 运行时"（观测/代码导入），机制相同（同一套模拟 + 同一套 diff），只是"现在"的来源不同。**M1 的会话对账是它的雏形，不是另一套东西。**
- **不做的**：不自动给会话打分、不排序"最优架构"、不做批量多场景优化搜索——那会越过"顶嘴"变成"替你想"，越权且不诚实。

## 3. 知识引用（笔记 ↔ 图元）

### 3.1 主机制：知识卡片（懒创建的 stub note）

- 每个图元**可以**有一张知识卡片：`notes/elements/<id>.md`，文件名 = 不可变 id：
  ```markdown
  ---
  devdraw-id: n_order
  devdraw-type: Service
  aliases: [订单服务]
  ---
  # 订单服务
  这里写长文描述、设计考量、踩坑记录……
  ```
- **懒创建**：用户点「为它写笔记」或首次被引用时才生成，不批量制造文件。
- 其他笔记用标准 wikilink 引用：`[[n_order]]` 或 `[[n_order|订单服务]]` → **Obsidian 原生解析、反向链接面板、图谱视图全部免费可用**。
- 改名安全：文件名是 id，显示名在 aliases/标题里，改名不断链。

### 3.2 辅助机制（轻量关联，无卡片时）

- 笔记 frontmatter：`devdraw: [n_order, n_events]`（笔记级关联，阅读模式不可见）。
- 行内标签：`#devdraw/n_order`（上下文提及，Obsidian 标签面板可查）。
- DevDraw 扫描 vault 解析三者 → `.devdraw/` 内建双向索引：点节点看相关笔记，点笔记定位图元。
- **优雅降级**：不装任何插件，Obsidian 里 wikilink/标签/frontmatter 依然可见可搜；Obsidian 插件（点击跳转 DevDraw 视图）留 v2 评估——卡片机制已覆盖大部分价值。

### 3.3 代码引用

- 图元 `links: [{ kind:"code", repo, path, symbol }]`，渲染为 `vscode://file/...` 可点击链接；repo 根路径项目级配置。
- 代码→图草稿（M4）：tree-sitter 提取候选实体 + LLM 整理，走 applyPatch 草稿 diff 确认，与文本生图同一条管道。

## 4. 思路图谱与「升格」（已确认：不纳入 v1，设计保留）

**决定**：v1 聚焦严格语义的架构/流程图与推演；思路图谱后置 v2+。以下设计保留备用——类型系统天然支持，届时无需重构即可启用。

**张力**：早期思考是混乱、前语义的；过早上类型会杀死思路流动。而 README 承诺了思路图谱。

**保留提案**：思路图谱不是独立引擎，而是同一模型的宽松投影——
- 内置 `Idea` 节点 + `relates-to` 边（无类型关联、不参与传播），加自由 Note，即成思路图谱；
- **升格（crystallization）**：Idea 想清楚后，一键升格为 Service/Decision/Assumption…，id 不变（笔记、链接、provenance 全保留）；
- 工作流变成：**先画思路图谱 → 逐步升格为架构模型 → 对模型推演**。这是 "Think first, draw later" 的最直接体现：思考的痕迹结晶为可推演的模型。

## 5. 一致性校验清单（软警告，不阻塞）

- 依赖环（架构坏味道）；hard 边构成的环（强警告）；
- 关键节点的 hard 出边无 fallback（提示）；
- `contradicts` 边未解决（两个假设互相矛盾）；
- 悬空引用（笔记引用了已删除的图元 id → 标记而非静默）。

## 6. 剩余开放问题

- Obsidian 插件形态（点击跳转 DevDraw 视图）是否列入 v2——知识卡片机制已覆盖大部分价值。
- 自定义类型注册表的 UI 深度（v1 只做「名称+颜色」级自定义？）。

已确认关闭：模拟深度（§2.5）、思路图谱取舍（§4）、开源策略（先私有，见 vision §1）。
