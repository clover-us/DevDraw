# DevDraw · 研绘

> **Think first, draw later.** 研思落绘，将推演化为可视之形。

面向开发者与软件架构师的本地优先桌面推演画布：基于 **Tauri v2 + React + TypeScript + React Flow + ELK + CodeMirror 6**，融合 **6 大工程推演层、无损 `.arch` 图码双向同步、本地 Git 友好三层工作区热重载、可视化动态链路编排、SQL/Mermaid 导入与高保真多格式导出**。

## 核心特性（v0.2.0）

- **本地优先 · Git 友好三层目录工作区**：支持 Tauri 原生目录与浏览器 File System Access API，项目拆分为 `project.json`、`layers/*.arch` 与 `.arch-layout.json`；内置外部文件监听，在 VS Code / Git 切分支 / AI 助手中修改 `.arch` 时画布自动实时热更新。
- **真正无损的 `.arch` DSL 双向同步**：基于 CST 区间的外科手术式补丁，画布增删改节点、连线或 Flow 时完整保留用户注释与缩进；内置专属 CodeMirror 6 `.arch` 语法高亮、上下文自动补全、实时诊断与画布↔源码双向定位。
- **多推演层与跨层只读引用**：支持推演层重命名、复制、删除、拖拽排序与数据建模子画布（关系库 / Redis 缓存）管理；可从其他层引入只读引用锚点（`store_ref`），支持连线、双击下钻跳转与源实体改名自动同步。
- **动态推演链路（Flow）可视化编排与演播**：左侧编排面板支持多条链路管理、画布点选连线快速追加步骤、拖拽调序、耗时与决策依据（`rationale`）记录，配合底部演播器 Step-by-step 演示请求链路。
- **多格式导入导出 & AI 协作**：
  - **导入**：MySQL/PostgreSQL/SQLite `CREATE TABLE` SQL DDL（自动提取 PK/FK/UK 与字段级外键连线）、Mermaid（`flowchart` / `erDiagram`）反向导入、DevDraw JSON 导入。
  - **导出**：高保真 SVG（还原语义色、ER 字段、端口与拐点、手绘笔迹）、2x 高清 PNG、Markdown / ADR 工程设计文档、`.arch` DSL、Mermaid、JSON、交互式单文件 HTML，支持 Tauri 原生另存为对话框。
  - **AI 协同**：一键复制「`.arch` 语法速查 + 当前画布源码」，直接发给任意 LLM 评审或生成架构迭代方案。
- **中大型画布编辑提效**：`Shift+拖拽` 框选多选、6 向对齐与等距分布、可缩放分组容器（Group / VPC，拖动自动联动框内实体）、跨层 `Ctrl+C/V` 复制粘贴、`Ctrl+K` 全局命令面板与实体居中定位。

## Monorepo 结构

```text
DevDraw/
├── packages/
│   ├── core/            # 纯 TypeScript 核心：数据模型、原语库、.arch 无损解析/补丁、三层目录编解码、ELK/对齐引擎、导入导出
│   └── canvas/          # 可复用 React Flow 渲染器：语义节点/ER 卡片/分组框/研思标注、正交+贝塞尔连线、链路播放器、双主题
└── apps/
    └── desktop/         # Tauri v2 无边框桌面外壳 + 启动器 + 多层工作台 + CodeMirror 6 DSL 分屏 + 链路编排 + 命令面板
```

## 三层文件模型（Git 友好）

```text
my-project/
├── project.json         # 项目元信息、推演层目录与全局样式映射
├── layers/
│   ├── architecture.arch
│   ├── data-modeling.arch
│   └── deployment.arch  # 纯语义 DSL（实体、关系、标注、Flow 链路），PR Diff 极度清爽
└── .arch-layout.json    # 仅存坐标、分组尺寸、收起态、视觉覆写、手绘笔迹与连线拐点
```

## 常用快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl+K` | 打开全局命令面板（实体定位 / 切层 / 插入原语 / 快捷动作） |
| `Ctrl+\` | 切换 `.arch` DSL 源码分屏 |
| `Ctrl+L` | 执行 ELK 全图分层正交布局 |
| `V` / `L` / `P` | 切换选择 / 推演连线 / 自由落绘模式 |
| `A` / `D` / `T` | 快速插入假设（Assumption）/ 决策（Decision）/ 笔记（Note） |
| `Shift+拖拽` | 框选多个实体（浮出对齐 / 分布 / 建组工具栏） |
| `Alt+拖拽分组` | 仅移动分组容器边框，不带动内部实体 |
| `Ctrl+A` / `C` / `V` | 全选 / 复制（含内部连线）/ 粘贴（支持跨推演层） |
| `Ctrl+Z` / `Ctrl+Y` | 撤销 / 重做（覆盖画布、DSL 与链路编排） |
| `←` / `→` | 链路演播模式下切换上一步 / 下一步 |

## 快速开始

### 前置环境
1. **Node.js 20+** 与 **pnpm 9+**（`corepack enable && corepack prepare pnpm@9.15.0 --activate`）
2. （仅桌面端开发/打包需要）**Rust 1.78+** 与 Windows **WebView2 / Visual Studio C++ Build Tools**

### 安装、调试与打包

```bash
# 1. 安装依赖
pnpm install

# 2. 浏览器模式热启动（毫秒级调试 UI 与核心引擎，Chrome/Edge 同样支持本地目录工作区）
pnpm dev

# 3. Tauri v2 桌面端开发运行
pnpm dev:tauri

# 4. 类型检查 & 核心单元测试
pnpm typecheck
pnpm test

# 5. 构建 Windows 桌面端安装包 (NSIS .exe + WiX .msi)
pnpm build:tauri
```

## 开源协议

本项目基于 [MIT License](./LICENSE) 开源。
