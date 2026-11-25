# DevDraw · 研绘

> **Think first, draw later.** 研思落绘，将推演化为可视之形。

面向开发者与软件架构师的本地优先桌面推演画布：基于 **Tauri v2 + React + TypeScript + React Flow + ELK + CodeMirror 6**，融合 **6 大工程推演层、图码双向同步（`.arch` DSL）、跨层引用下钻、ER/Redis 三档卡片密度、研思推演标注** 与 **Step-by-step 动态链路演播**。

## Monorepo 结构

```text
DevDraw/
├── packages/
│   ├── core/            # 纯 TypeScript 核心：统一数据模型、6 层原语库、.arch CST Parser/Patcher、ELK 混合布局、多格式导出
│   └── canvas/          # 可复用 React Flow 渲染器：语义节点/ER 卡片/研思标注、贝塞尔+正交连线、动态链路播放器、暗夜/晴昼主题
└── apps/
    └── desktop/         # Tauri v2 桌面端外壳 + 研绘启动器 + 多推演层工作台 + CodeMirror 6 DSL 分屏 + 属性检查器
```

## 三层文件模型（Git 友好）

当通过 Tauri 打开本地目录工作区时，每个项目以纯文本与独立布局覆盖层落盘：

```text
my-project/
├── project.json         # 项目元信息、推演层目录与跨层引用索引
├── layers/
│   ├── architecture.arch
│   ├── data-modeling.arch
│   └── deployment.arch  # 纯语义 DSL（实体、关系、标注、Flow 链路），PR Diff 极度清爽
└── .arch-layout.json    # 仅存用户手动微调（pinned）的坐标、视口与连线拐点
```

## 快速开始

### 前置环境
1. **Node.js 20+** 与 **pnpm 9+**（`corepack enable && corepack prepare pnpm@9.15.0 --activate`）
2. （仅桌面端打包/运行需要）**Rust 1.78+** 与 Windows **WebView2 / Visual Studio C++ Build Tools**

### 安装与运行

```bash
# 1. 安装依赖
pnpm install

# 2. 浏览器模式热启动（无需 Rust，毫秒级调试 UI 与核心引擎）
pnpm dev

# 3. Tauri v2 桌面端开发运行
pnpm dev:tauri

# 4. 类型检查 & 核心单元测试
pnpm typecheck
pnpm test
```
