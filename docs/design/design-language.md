# DevDraw · 设计语言 v0.1

> 状态：**地基已锁，像素未冻**。本文与活体参考页 `/design.html`（`src/design/DesignSystem.tsx`）互为表里——
> 文档记决策，页面可点可复制可对照。两者共享产品同一套 token（`src/ui/styles.css`）。
> 日期：2026-11-14。

## 0. 一句话立场

**颜色不是装饰，是模型在说话。** DevDraw 的视觉语言只服务灵魂——让"模型顶嘴"立刻被看见。
因此我们**现在锁定设计地基（语法），但不冻结屏幕级表达（句子）**：地基稳定，后续功能才能继承一致；
屏幕留白，等真实复杂度来填（项目纪律：rule of three、由真实复杂度驱动避免过度设计）。

## 1. 色彩系统（已锁）

所有颜色走 CSS 变量，定义于 `src/ui/styles.css` 的 `:root,[data-theme='dark']` 与 `[data-theme='light']`。
组件**只引用 `var(--token)`，绝不写死 hex**——新组件因此自动获得双主题。

### 1.1 语义色（模型的状态，最高优先级）

| 语义 | token | 暗色 | 亮色 | 用途 |
|---|---|---|---|---|
| 失效 / 错误 | `--danger` | `#f0495a` | `#d92d3f` | 硬依赖断裂、error 发现 |
| 降级 / 警告 | `--warning` | `#f5a524` | `#c27400` | 有兜底/异步缓冲、warning |
| 正常 / 韧性 | `--success` | `#34d17b` | `#1a9e57` | 健康、冗余兜底、Δ 收缩 |
| **反问（灵魂）** | `--question` | `#b57bff` | `#8b3fd6` | 模型问设计决策，紫罗兰独此一家 |
| 信息 | `--info` | `#2dd4bf` | `#0d9488` | 中性告知 |

每个语义色配 `*-soft` 浅底变量（如 `--danger-soft`）用于卡片/chip 背景。

### 1.2 主色族 · 电蓝（连接 / 信息 / 主操作）

`--accent` 暗 `#3d9bff` / 亮 `#1f7ae0`；`--accent-soft`（浅底）、`--accent-contrast`（高对比文本）。

### 1.3 中性 · 冷墨蓝分层（承载最大面积）

暗：`--bg #0b0e14` → `--bg-elevated #0f131c` → `--panel #121722` → `--panel-2 #161c29` → `--overlay #1b2230`；
边框 `--border #232b3a` / `--border-strong #323d52`；文本 `--text #e9ecf3` / `--text-2 #c3cad9` / `--muted #8a93a8` / `--faint #5b6478`。
亮：`--bg #eef1f7` / `--panel #ffffff` / `--panel-2 #f5f7fb`；`--text #1a2233` / `--text-2 #3c4658` / `--muted #6b7488` / `--faint #9aa3b5`。

**规则**：饱和色永不铺大背景；大背景永远是冷墨蓝中性。红/琥珀只给对应语义，不当强调色。

## 2. 双主题机制（已锁）

- `<html data-theme="dark|light">` 切换；`useTheme()`（`src/ui/theme.ts`）管状态，偏好存 `localStorage['devdraw-theme']`，默认暗（产品识别色）。
- 同时设 `style.colorScheme`，让原生滚动条/输入框跟随。
- 自定义滚动条：`scrollbar-color: var(--border-strong) transparent` + webkit thumb 圆角。
- 焦点环：`outline: 2px solid var(--ring)`，键盘可达。

## 3. 字体与排版（已锁）

- 字体栈：`system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif`（零外部依赖，离线可用）。
- 等宽（id/代码/色值/指标）：`ui-monospace, 'Cascadia Code', 'SF Mono', Consolas, monospace`。
- 字号刻度：Display 46/800 · Title 22/750 · Heading 16/700 · Body 14/400 · Caption 12/500 · Mono 13。
- 基线 body 14px；标题负字距（≥22px 用 -0.4px）。

## 4. 空间 / 圆角 / 阴影 / 动效（已锁）

- 间距：4px 基栅格，刻度 4/8/12/16/24/32/48。
- 圆角：控件 6–8px，卡片 12–14px，pill 999px。
- 阴影两层：`--shadow-soft`（抬升）/ `--shadow`（浮层）。
- 动效克制：控件 150ms、主题 250ms，ease/ease-out；只给状态反馈，不打断思考。

## 5. 组件原语（已锁）

按钮（`dd-primary`/默认/`dd-icon-btn`/danger/disabled）、严重度 chip、镜片 tabs（`dd-lens-tab`+`dd-lens-badge`）、
失效源 chip（`dd-seed-chip.on`+`dd-seed-dot`）、发现卡片（`FindingCard`，`src/ui/inspect.tsx`）、
爆炸半径指标（`Metric`，绿 Δ=收缩/红 Δ=扩张）、ER 表卡片（字段入表，PK/FK 徽标）、表单控件、toggle、
对话框（`dd-modal-overlay`/`dd-modal`：遮罩 + Esc 与点遮罩关闭 + 焦点圈在弹窗内 + 打开时锁背景滚动）、
就地浮层（`dd-popover-overlay`/`dd-popover`：双击空白新建 `QuickCreate`、拖线选语义 `EdgePicker`、右键菜单 `ContextMenu`）。
**抽屉=看，弹窗=填，就地浮层=做下一个动作**：浮层贴着鼠标出现、不遮全屏、选完立刻消失，Esc 一律可退；
它承载的是"我正要做的那一下"，所以只放动作与检索，不放说明长文与设置表单。
**复用而非仿制**：参考页直接 import 真实组件。
**不变量**：浮层里出现的数字键/箭头，就是键盘能直接按的东西（`EdgePicker` 的 1..n、`QuickCreate` 的 ↑↓）。

## 6. 暂不冻结（由真实复杂度驱动）

各镜片屏幕布局与密度、插画/空状态/品牌图形、微交互与转场、大规模渐进披露与子镜片交互、onboarding 呈现、文案语气。
理由：还没遇到真实负载，现在冻结只会凭空假设（违反 §10 纪律）。

## 7. 如何扩展

1. 新颜色：先在两套主题各加一个 token，再在组件引用 `var(--token)`；语义色需更新本文 §1.1 与参考页。
2. 新组件：只用既有 token 与原语，自动双主题；在 `/design.html` 加一个标本。
3. 改地基（token/语义/刻度）：走设计评审，因为被所有组件继承。
4. 改屏幕表达：自由迭代，无需评审，直到它沉淀为可复用模式再考虑升格为地基。

## 8. 验证

- `npm run build` 双入口（`index.html` + `design.html`）绿；48/48 单测绿。
- 参考页 headless 实测：双主题对照、色卡复制、真实发现卡片可点、组件标本渲染、0 console error。
