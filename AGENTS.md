# DevDraw 仓库协作与开发规则

## Git 提交规范

本仓库采用 **Conventional Commits 英文类型前缀 + 中文描述** 的提交规范：

```text
<type>(<scope>): <中文简明描述>
```

（若改动涉及全局或基建，可省略 `(<scope>)`，写为 `<type>: <中文简明描述>`。）

### 1. 类型 (`type`)
- `feat`：新增功能或交互能力
- `fix`：缺陷修复或体验问题修正
- `refactor`：不改变外部行为的代码重构
- `perf`：性能优化
- `test`：补充或调整单元测试
- `docs`：文档、注释或规则更新
- `style`：代码格式与样式微调
- `chore`：工程配置、依赖管理、打包发布与基建变更

### 2. 作用域 (`scope`)
按实际功能模块命名，例如：
- `core` / `dsl` / `workspace` / `layout`：核心数据模型、`.arch` 解析与无损补丁、本地三层目录编解码、ELK 布局
- `io`：导入与导出（SQL DDL、JSON、SVG、PNG、Markdown ADR、HTML）
- `layers`：推演层、子画布与跨层引用管理
- `flow`：动态链路编排与演播
- `canvas`：画布渲染、多选对齐、分组容器与命令面板
- `ui`：桌面端界面、顶栏、侧边栏与弹窗样式
- `tauri`：Rust 后端命令、窗口配置与桌面端打包

### 3. 描述规则
- **描述一律使用中文**，直述改动内容，简洁明了（专有名词如 `.arch`、`DSL`、`SQL DDL`、`SVG`、`PNG`、`Tauri`、`Ctrl+K` 保持原样）。
- **禁止**在 `scope` 或描述中写入内部排期/优先级编号（如 `P0`、`P1`、`p1-1`、`#3`、`Px-#x` 等）。

### 4. 示例

推荐：
- `feat(io): 新增 SQL DDL 与 JSON 导入及高保真 SVG/2x PNG 导出`
- `feat(flow): 新增动态推演链路可视化编排面板与画布点选连线`
- `fix(ui): 区分导入与导出按钮图标方向`
- `chore: 初始化 DevDraw v0.1.0 基线`

避免：
- `feat(p1-3): add SQL import`（禁止出现 `p1-x` 编号与英文描述）
- `fix: update code`（描述过于宽泛且未使用中文）

## 提交前验证

- 改动 TypeScript 代码后，执行 `pnpm typecheck` 与 `pnpm test`。
- 改动 `apps/desktop/src-tauri` 下的 Rust 代码或 Tauri 配置后，执行 `cargo check`。
