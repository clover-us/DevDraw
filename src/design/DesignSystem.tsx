/**
 * DevDraw · 设计语言 —— 活体参考页（/design.html）。
 * 把"大致定下来"的地基显性化：色彩语义、字体、空间、组件标本、光暗双主题、锁与不锁。
 * 复用产品 styles.css 的 token 与真实组件（FindingCard / Metric），不是另一套仿制品。
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Finding, FindingSeverity } from '../core/reasoners/types';
import { FindingCard, Metric, SEV_LABEL } from '../ui/inspect';
import {
  ArchitectureIcon,
  ErIcon,
  LogoIcon,
  MoonIcon,
  PlusIcon,
  StateMachineIcon,
  SunIcon,
  TrashIcon,
  UndoIcon,
} from '../ui/icons';
import { useTheme } from '../ui/theme';

/* ---------------- 数据 ---------------- */

const STATES: { token: string; name: string; desc: string }[] = [
  { token: '--danger', name: '失效', desc: '硬依赖断裂、服务不可用。真红，最高优先级，一眼就要看见。' },
  { token: '--warning', name: '降级', desc: '有兜底或异步缓冲，功能受限但还活着。琥珀，提醒而不报警。' },
  { token: '--success', name: '正常', desc: '健康、有冗余兜底。酸绿，安静不抢戏，是画布的底色情绪。' },
  { token: '--question', name: '反问', desc: '模型在问你一个设计决策。紫罗兰——DevDraw 的灵魂色，独此一家。' },
];

const NEUTRALS = [
  { token: '--bg', name: '背景' },
  { token: '--bg-elevated', name: '抬升背景' },
  { token: '--panel', name: '面板' },
  { token: '--panel-2', name: '面板 2' },
  { token: '--overlay', name: '浮层' },
  { token: '--border', name: '边框' },
  { token: '--border-strong', name: '强边框' },
  { token: '--text', name: '主文本' },
  { token: '--text-2', name: '次文本' },
  { token: '--muted', name: '弱化文本' },
  { token: '--faint', name: '最弱文本' },
];
const ACCENT = [
  { token: '--accent', name: '电蓝 · 主色' },
  { token: '--accent-soft', name: '电蓝 · 浅底' },
  { token: '--accent-contrast', name: '电蓝 · 高对比' },
];
const SEMANTIC = [
  { token: '--danger', name: '失效 / 错误' },
  { token: '--warning', name: '降级 / 警告' },
  { token: '--success', name: '正常 / 韧性' },
  { token: '--question', name: '反问（灵魂）' },
  { token: '--info', name: '信息' },
];

const TYPE_ROWS: { meta: string; size: number; weight: number; sample: string; mono?: boolean }[] = [
  { meta: 'Display · 46 / 800', size: 46, weight: 800, sample: '研思落绘' },
  { meta: 'Title · 22 / 750', size: 22, weight: 750, sample: '一个模型，多副镜片' },
  { meta: 'Heading · 16 / 700', size: 16, weight: 700, sample: '跨镜片缺口：架构缺少履约服务' },
  { meta: 'Body · 14 / 400', size: 14, weight: 400, sample: '推演替你检验思考，抓住没想到的漏洞。' },
  { meta: 'Caption · 12 / 500', size: 12, weight: 500, sample: '迁移 fulfill 假设了一个履约服务能力' },
  { meta: 'Mono · 13 / id', size: 13, weight: 500, sample: 'n_order_01J8ZK · tr_fulfill', mono: true },
];

const SPACING = [4, 8, 12, 16, 24, 32, 48];
const RADII = [6, 8, 12, 999];

const gapFinding: Finding = {
  id: 'spec-gap',
  severity: 'error',
  title: '跨镜片缺口：架构缺少「履约服务」',
  detail: '迁移 fulfill / deliver 假设了一个「履约服务」，但架构镜片里没有它。Order 会永远卡在 Paid、Fulfilling。',
  question: {
    prompt: '如何补齐「履约服务」能力？',
    options: [
      { id: 'add', label: '在架构中新增履约服务', description: '新增服务节点，迁移引用即被满足。', patches: [] },
      { id: 'manual', label: '改为人工履约', description: '标记迁移为人工，不再要求服务实现。', patches: [] },
      { id: 'assume', label: '记录为待定假设', description: '先记下缺口，不立即修复。', patches: [] },
    ],
  },
};
const cancelFinding: Finding = {
  id: 'spec-cancel',
  severity: 'question',
  title: '缺失迁移：Paid 能否取消？',
  detail: 'Paid 没有到 Cancelled 的路径，而 Created 可以。Paid 之后不可取消，是有意设计吗？',
  question: {
    prompt: 'Paid 该不该能取消？',
    options: [
      { id: 'allow', label: '允许 Paid 取消', description: '新增 Paid → Cancelled 迁移。', patches: [] },
      { id: 'forbid', label: '维持不可取消（记录决策）', description: '记录为 ADR，模型不再追问。', patches: [] },
    ],
  },
};

/* ---------------- 小部件 ---------------- */

function Swatch({ token, name, theme }: { token: string; name: string; theme: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hex, setHex] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (el) setHex(getComputedStyle(el).getPropertyValue(token).trim());
  }, [token, theme]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(hex);
      setCopied(true);
      setTimeout(() => setCopied(false), 1100);
    } catch {
      /* 剪贴板不可用时静默 */
    }
  };
  return (
    <div className="ds-swatch" onClick={copy} title={`点击复制 ${hex}`}>
      <div className="ds-chip" ref={ref} style={{ background: `var(${token})` }} />
      <div className="ds-meta">
        <div className="ds-name">{name}</div>
        <div className={`ds-hex${copied ? ' ds-copied' : ''}`}>{copied ? '已复制 ✓' : hex || token}</div>
      </div>
    </div>
  );
}

function SevChip({ sev }: { sev: FindingSeverity }) {
  return <span className={`ds-sev ${sev}`}>{SEV_LABEL[sev]}</span>;
}

function Section({ id, num, title, sub, children }: { id: string; num: string; title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="ds-section" id={id}>
      <div className="ds-section-head">
        <span className="ds-num">{num}</span>
        <h2 className="ds-h2">{title}</h2>
        {sub && <p className="ds-sub">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

function MiniSurface() {
  return (
    <div className="ds-theme-body">
      <div className="ds-row" style={{ marginBottom: 12 }}>
        <div className="ds-node-spec">
          <span className="ds-kind">服务</span>
          <span className="ds-nname">订单服务</span>
        </div>
        <div className="ds-node-spec failed">
          <span className="ds-kind">服务</span>
          <span className="ds-nname">支付服务</span>
        </div>
      </div>
      <div className="ds-row" style={{ marginBottom: 14 }}>
        <SevChip sev="error" />
        <SevChip sev="question" />
        <SevChip sev="warning" />
        <SevChip sev="info" />
      </div>
      <div className="ds-row">
        <button className="dd-primary">主操作</button>
        <button>次操作</button>
        <Metric label="失效" value={3} delta={-2} />
      </div>
    </div>
  );
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <span className={`ds-toggle${on ? ' on' : ''}`} onClick={onClick} role="switch" aria-checked={on} tabIndex={0}>
      <span className="ds-track">
        <span className="ds-knob" />
      </span>
      {label}
    </span>
  );
}

/* ---------------- 页面 ---------------- */

export function DesignSystem() {
  const { theme, toggle } = useTheme();
  const [toast, setToast] = useState<string | null>(null);
  const [toggleDemo, setToggleDemo] = useState(true);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  return (
    <div className="ds">
      <header className="ds-topbar">
        <div className="ds-brand">
          <span className="ds-logo">
            <LogoIcon size={18} />
          </span>
          DevDraw · 设计语言
        </div>
        <span className="ds-ver">v0.1 · 锁地基，不冻像素</span>
        <span className="ds-spacer" />
        <a className="ds-back" href="/">← 返回画布</a>
        <button className="ds-theme-btn" onClick={toggle} aria-label="切换主题">
          {theme === 'dark' ? <SunIcon size={16} /> : <MoonIcon size={16} />}
          {theme === 'dark' ? '亮色' : '暗色'}
        </button>
      </header>

      <div className="ds-wrap">
        {/* 开篇：语义状态即主角 */}
        <div className="ds-hero">
          <span className="ds-kicker">
            <LogoIcon size={14} /> 蓝图推演画布 · 视觉系统
          </span>
          <h1>
            颜色不是装饰，<br />
            是<em>模型在说话</em>。
          </h1>
          <p className="ds-lede">
            DevDraw 的视觉语言只服务一件事：让"模型顶嘴"立刻被看见。红=失效、琥珀=降级、绿=正常、紫罗兰=反问——
            语义先于美观，地基先于像素。这一页把已经定下来的设计地基 codify 成可点、可复制、可对照的活体参考；
            屏幕级的排版与插画，留给真实复杂度去驱动，现在不冻结。
          </p>
          <div className="ds-states">
            {STATES.map((s) => (
              <div className="ds-state" key={s.token} style={{ ['--sc' as string]: `var(${s.token})` }}>
                <span className="ds-dot" />
                <h3>{s.name}</h3>
                <span className="ds-token">{s.token}</span>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>
          <nav className="ds-toc">
            <a href="#color">01 · 色彩</a>
            <a href="#theme">02 · 双主题</a>
            <a href="#type">03 · 字体</a>
            <a href="#space">04 · 空间</a>
            <a href="#component">05 · 组件</a>
            <a href="#rules">06 · 约定</a>
            <a href="#lock">07 · 锁与不锁</a>
          </nav>
        </div>

        {/* 01 色彩 */}
        <Section id="color" num="01" title="色彩系统" sub="冷墨蓝中性分层承载最大面积；电蓝是连接与主操作；四个语义色各自对应一种模型状态。所有颜色走 CSS 变量，点击色卡复制当前主题下的真实色值。">
          <div className="ds-group-label">语义色 · 模型的状态</div>
          <div className="ds-grid">
            {SEMANTIC.map((s) => <Swatch key={s.token} token={s.token} name={s.name} theme={theme} />)}
          </div>
          <div className="ds-group-label">主色族 · 电蓝</div>
          <div className="ds-grid">
            {ACCENT.map((s) => <Swatch key={s.token} token={s.token} name={s.name} theme={theme} />)}
          </div>
          <div className="ds-group-label">中性 · 冷墨蓝分层</div>
          <div className="ds-grid">
            {NEUTRALS.map((s) => <Swatch key={s.token} token={s.token} name={s.name} theme={theme} />)}
          </div>
        </Section>

        {/* 02 双主题 */}
        <Section id="theme" num="02" title="光 / 暗双主题" sub="同一套 token，两套取值，由 <html data-theme> 切换；偏好存 localStorage。暗色是产品识别色（深墨蓝画布），亮色用于日光阅读。下面两块强制各自主题，与全局切换无关——直接对照。">
          <div className="ds-duo">
            <div className="ds-theme-card ds-force-dark">
              <div className="ds-theme-cap"><span>暗色 · 产品识别色</span><span className="ds-num">data-theme=dark</span></div>
              <MiniSurface />
            </div>
            <div className="ds-theme-card ds-force-light">
              <div className="ds-theme-cap"><span>亮色 · 日光阅读</span><span className="ds-num">data-theme=light</span></div>
              <MiniSurface />
            </div>
          </div>
          <p className="ds-note">主题机制已锁：组件只引用 var(--token)，绝不写死颜色；新增组件自动获得双主题。原生滚动条、输入框通过 color-scheme 跟随。</p>
        </Section>

        {/* 03 字体 */}
        <Section id="type" num="03" title="字体与排版" sub="系统字体栈（system-ui / PingFang SC / Microsoft YaHei），零外部字体依赖，离线可用。id、代码、色值、指标用等宽字体，与正文形成清晰的「语义 vs 标识」对比。">
          <div className="ds-specimen">
            {TYPE_ROWS.map((r) => (
              <div className="ds-type-row" key={r.meta}>
                <div className="ds-type-meta">{r.meta}</div>
                <div
                  className="ds-type-spec"
                  style={{
                    fontSize: r.size,
                    fontWeight: r.weight,
                    letterSpacing: r.size >= 22 ? '-0.4px' : '0',
                    fontFamily: r.mono ? "ui-monospace, 'Cascadia Code', Consolas, monospace" : 'inherit',
                    color: r.mono ? 'var(--accent)' : 'var(--text)',
                  }}
                >
                  {r.sample}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* 04 空间 */}
        <Section id="space" num="04" title="空间 · 圆角 · 阴影 · 动效" sub="4px 基栅格；圆角分控件级与卡片级；阴影只用两层（soft 抬升 / 强浮层）；动效克制——控件 150ms、主题 250ms，绝不炫技打断思考。">
          <div className="ds-cols">
            <div className="ds-specimen">
              <div className="ds-specimen-cap">间距刻度 · 4px 基栅格</div>
              {SPACING.map((s) => (
                <div className="ds-space-row" key={s}>
                  <span className="ds-space-val">{s}px</span>
                  <span className="ds-space-bar" style={{ width: s * 4 }} />
                </div>
              ))}
            </div>
            <div>
              <div className="ds-specimen">
                <div className="ds-specimen-cap">圆角</div>
                <div className="ds-radii">
                  {RADII.map((r) => (
                    <div className="ds-radius" key={r} style={{ borderRadius: r }}>{r === 999 ? 'pill' : `${r}px`}</div>
                  ))}
                </div>
              </div>
              <div className="ds-specimen">
                <div className="ds-specimen-cap">阴影 · 两层</div>
                <div className="ds-shadows">
                  <div className="ds-shadow-box" style={{ boxShadow: '0 6px 18px var(--shadow-soft)' }}>soft · 抬升</div>
                  <div className="ds-shadow-box" style={{ boxShadow: '0 16px 40px var(--shadow)' }}>strong · 浮层</div>
                </div>
              </div>
              <div className="ds-specimen">
                <div className="ds-specimen-cap">动效</div>
                <div className="ds-row" style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
                  <span className="ds-sev info">控件 150ms</span>
                  <span className="ds-sev info">主题 250ms</span>
                  <span className="ds-sev info">ease / ease-out</span>
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* 05 组件 */}
        <Section id="component" num="05" title="组件标本" sub="下面多数是产品里的真实组件（发现卡片、爆炸半径指标直接 import 复用），不是仿制品。它们共享同一套 token，因此天然双主题。">
          <div className="ds-specimen">
            <div className="ds-specimen-cap">按钮</div>
            <div className="ds-row">
              <button className="dd-primary"><PlusIcon size={15} /> 新建实体</button>
              <button>次操作</button>
              <button className="dd-icon-btn" aria-label="撤销"><UndoIcon size={16} /></button>
              <button className="ds-btn-danger"><TrashIcon size={15} /> 删除实体</button>
              <button disabled>禁用</button>
            </div>
          </div>

          <div className="ds-specimen">
            <div className="ds-specimen-cap">严重度 chip · 镜片 tabs · 失效源</div>
            <div className="ds-row" style={{ marginBottom: 14 }}>
              <SevChip sev="error" /><SevChip sev="question" /><SevChip sev="warning" /><SevChip sev="info" />
            </div>
            <div className="ds-row" style={{ marginBottom: 14 }}>
              <nav className="dd-lens-tabs">
                <button className="dd-lens-tab active"><ArchitectureIcon size={15} /> 架构</button>
                <button className="dd-lens-tab"><ErIcon size={15} /> ER<span className="dd-lens-badge">2</span></button>
                <button className="dd-lens-tab"><StateMachineIcon size={15} /> 状态机<span className="dd-lens-badge">2</span></button>
              </nav>
            </div>
            <div className="ds-row">
              <span className="dd-seed-chip on"><span className="dd-seed-dot" />支付服务</span>
              <span className="dd-seed-chip"><span className="dd-seed-dot" />订单服务</span>
            </div>
          </div>

          <div className="ds-specimen">
            <div className="ds-specimen-cap">表单控件</div>
            <div className="ds-row">
              <input className="ds-input" placeholder="订单服务" defaultValue="订单服务" />
              <select className="ds-input" defaultValue="hard">
                <option value="hard">hard · 强依赖</option>
                <option value="soft">soft · 可降级</option>
                <option value="async">async · 异步</option>
              </select>
              <Toggle on={toggleDemo} onClick={() => setToggleDemo((v) => !v)} label="自动保存" />
            </div>
          </div>

          <div className="ds-cols">
            <div className="ds-specimen">
              <div className="ds-specimen-cap">ER 表卡片 · 字段入表</div>
              <div className="ds-table-card">
                <div className="ds-table-head">order_items<span className="ds-count">4 列</span></div>
                <div className="ds-field-row"><span className="ds-key pk">PK</span><span className="ds-fname">id</span><span className="ds-ftype">bigint</span></div>
                <div className="ds-field-row"><span className="ds-key fk">FK</span><span className="ds-fname">order_id</span><span className="ds-ftype">bigint</span></div>
                <div className="ds-field-row"><span className="ds-key fk">FK</span><span className="ds-fname">product_id</span><span className="ds-ftype">bigint</span></div>
                <div className="ds-field-row"><span className="ds-fname">qty</span><span className="ds-ftype">int</span></div>
              </div>
            </div>
            <div className="ds-specimen">
              <div className="ds-specimen-cap">爆炸半径指标 · Δ 对比</div>
              <div className="ds-row">
                <Metric label="失效" value={3} delta={-2} />
                <Metric label="降级" value={1} delta={0} />
                <Metric label="受影响入口" value={1} delta={null} />
              </div>
              <p className="ds-note">绿色 Δ = 爆炸半径收缩（改 hard→soft 后），红色 = 扩张。让架构权衡可见、可量化。</p>
            </div>
          </div>

          <div className="ds-specimen">
            <div className="ds-specimen-cap">模型顶嘴 · 发现卡片（真实组件，可点）</div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
              <FindingCard finding={gapFinding} active={false} onSelect={() => flash('已定位到缺口节点')} onAnswer={(o) => flash(`已落地为补丁 → ${o.label}`)} />
              <FindingCard finding={cancelFinding} active={false} onSelect={() => flash('已定位到 Paid 状态')} onAnswer={(o) => flash(`已记录决策 → ${o.label}`)} />
            </ul>
          </div>
        </Section>

        {/* 06 约定 */}
        <Section id="rules" num="06" title="使用约定" sub="几条硬规则，保证语义不被装饰稀释。">
          <div className="ds-rules">
            <div className="ds-rule do">
              <h4>✓ 要</h4>
              <ul>
                <li>反问一律用紫罗兰 --question，它是灵魂，辨识度最高。</li>
                <li>红只给失效 / error；琥珀只给降级 / warning；别拿来当强调色。</li>
                <li>组件只引用 var(--token)，新组件自动双主题。</li>
                <li>id / 代码 / 色值 / 指标用等宽字体。</li>
                <li>焦点环用 --ring，键盘可达；滚动条用产品样式。</li>
              </ul>
            </div>
            <div className="ds-rule dont">
              <h4>✗ 不要</h4>
              <ul>
                <li>不要把反问紫和信息青混用——一个是"问你"，一个是"告知"。</li>
                <li>不要写死 hex；不要引入第二套灰阶。</li>
                <li>不要用饱和色铺大背景（大背景永远是冷墨蓝中性）。</li>
                <li>不要加打断思考的炫技动画；动效只给状态反馈。</li>
                <li>不要在这一阶段冻结屏幕级排版与插画风格。</li>
              </ul>
            </div>
          </div>
        </Section>

        {/* 07 锁与不锁 */}
        <Section id="lock" num="07" title="现在锁什么，不锁什么" sub="回答「UI 样式要不要现在大致定下来」：锁地基（语法），不冻像素（句子）。地基稳定，后续功能才能继承一致；屏幕留白，等真实复杂度来填。">
          <div className="ds-lock">
            <div className="ds-lock-col locked">
              <h3>🔒 现在锁定 · 设计地基</h3>
              <div className="ds-lock-sub">改动需走设计评审，因为它们被所有组件继承。</div>
              <ul>
                <li>色彩 token 与语义映射（<code>--danger</code>=失效、<code>--question</code>=反问…）</li>
                <li>光暗双主题机制（<code>data-theme</code> + CSS 变量 + localStorage）</li>
                <li>字体栈与字号刻度、等宽用法</li>
                <li>4px 间距栅格、圆角层级、两层阴影</li>
                <li>动效时长与缓动（150 / 250ms）</li>
                <li>组件原语：按钮 / chip / 发现卡片 / 指标 / 表卡片</li>
                <li>自定义滚动条与焦点环</li>
              </ul>
            </div>
            <div className="ds-lock-col open">
              <h3>🔓 暂不冻结 · 屏幕表达</h3>
              <div className="ds-lock-sub">由真实工作流与复杂度驱动，避免过早过度设计。</div>
              <ul>
                <li>各镜片的具体屏幕布局与密度</li>
                <li>插画 / 空状态 / 品牌图形风格</li>
                <li>微交互与转场细节</li>
                <li>大规模下的渐进披露与子镜片交互</li>
                <li>onboarding / 导览的呈现方式</li>
                <li>具体文案语气（随功能打磨）</li>
              </ul>
            </div>
          </div>
          <p className="ds-note">
            依据：项目纪律"抽象从案例浮现（rule of three）""由真实复杂度驱动，避免过度设计"。地基已经过三镜片原型与本轮 UI 大改的验证，足够稳定；
            屏幕级设计还没遇到真实负载，现在冻结只会凭空假设。详见 docs/design/design-language.md。
          </p>
        </Section>

        <div className="ds-foot">
          DevDraw · 研绘 — 设计语言 v0.1 · 与产品共享同一套 token（src/ui/styles.css）。<br />
          这页本身就是"锁地基"的产物：可点、可复制、可对照，而不是一份会过时的截图规范。
        </div>
      </div>

      {toast && (
        <div className="ds-toast">
          <span className="ds-toast-dot" />
          {toast}
        </div>
      )}
    </div>
  );
}
