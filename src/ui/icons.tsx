/**
 * 内联 SVG 图标集（无外部依赖，1.7px 描边，继承 currentColor）。
 * 主题无关：颜色由 CSS 变量驱动，光暗两套自动适配。
 */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 18, ...rest }: IconProps) {
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

/** 品牌标记：罗盘指针——"研思落绘"，推演方向。 */
export function LogoIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2.2 5-5 2.2 2.2-5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** 架构：依赖网络。 */
export function ArchitectureIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="5" cy="6" r="2.4" />
      <circle cx="19" cy="6" r="2.4" />
      <circle cx="12" cy="18" r="2.4" />
      <path d="M6.8 7.6L10.6 16M17.2 7.6L13.4 16M7.4 6h9.2" />
    </svg>
  );
}

/** ER：表结构。 */
export function ErIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="3.5" y="4" width="17" height="16" rx="2" />
      <path d="M3.5 9h17M9 9v11" />
    </svg>
  );
}

/** 状态机：生命周期分支。 */
export function StateMachineIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="6" cy="6" r="2.4" />
      <circle cx="6" cy="18" r="2.4" />
      <circle cx="18" cy="12" r="2.4" />
      <path d="M8.4 6h4.6a3 3 0 0 1 3 3v.6M8.4 18h4.6a3 3 0 0 0 3-3v-.6" />
    </svg>
  );
}

/** 实体浏览。 */
export function EntitiesIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 3l8 4.5-8 4.5-8-4.5z" />
      <path d="M4 12l8 4.5 8-4.5M4 16.5L12 21l8-4.5" />
    </svg>
  );
}

/** 发现 / 模型顶嘴。 */
export function FindingsIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5z" />
      <path d="M12 8v4M12 15h.01" />
    </svg>
  );
}

/** 推演 / 失效传播：脉冲波形。 */
export function SimulationIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M3 12h4l2.5-7 4 14 2.5-7h5" />
    </svg>
  );
}

/** 请求追踪：一条带起点与箭头的路径（"一个请求沿调用链走一遍"）。 */
export function TraceIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="4.5" cy="17.5" r="2" />
      <path d="M6.5 17.5H10a4 4 0 0 0 4-4v-3a4 4 0 0 1 4-4h1.5" />
      <path d="M17 3.5l3 3-3 3" />
    </svg>
  );
}

/** 会话 / 存档：带回溯箭头的时钟（"昨天的判断今天还成立吗"）。 */
export function SessionsIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3.2 4.6v4.2h4.2" />
      <path d="M12 7.8V12l3 1.8" />
    </svg>
  );
}

export function SunIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

export function MoonIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

export function ChevronLeftIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

export function ChevronRightIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function PlusIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function MinusIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M5 12h14" />
    </svg>
  );
}

/** 适应视图：四角括号（与全屏的斜向箭头区分开）。 */
export function FitFrameIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M9 3H5a2 2 0 0 0-2 2v4M15 3h4a2 2 0 0 1 2 2v4M21 15v4a2 2 0 0 1-2 2h-4M9 21H5a2 2 0 0 1-2-2v-4" />
    </svg>
  );
}

export function CloseIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function TrashIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6" />
    </svg>
  );
}

export function SearchIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

export function LinkIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1" />
    </svg>
  );
}

export function ArrowRightIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function KeyIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="8" cy="8" r="4" />
      <path d="M10.8 10.8L20 20M16 16l2-2M13 13l2-2" />
    </svg>
  );
}

export function UndoIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  );
}

export function RedoIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M15 14l5-5-5-5" />
      <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
    </svg>
  );
}

/** 画布全屏：四角外扩。 */
/** 重新布局：左二右一的节点图（三圆两线），小尺寸下也不会糊成一团。 */
export function LayoutIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="6" cy="6" r="2.6" />
      <circle cx="6" cy="18" r="2.6" />
      <circle cx="18" cy="12" r="2.6" />
      <path d="M8.6 7.2l6.8 3.4M8.6 16.8l6.8-3.4" />
    </svg>
  );
}

export function MaximizeIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      {/* 斜向双箭头（maximize-2）：刻意不用四角括号——React Flow 自带的"适应视图"就是括号，
          两个按钮长一样会让人分不清哪个是全屏。 */}
      <path d="M14 3h7v7M10 21H3v-7M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}

/** 退出全屏：四角内收。 */
export function MinimizeIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M4 14h6v6M20 10h-6V4M10 14l-7 7M14 10l7-7" />
    </svg>
  );
}

/** 组件库：积木格。 */
export function LibraryIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <path d="M17 13.5v7M13.5 17h7" />
    </svg>
  );
}

/** 编辑：铅笔。 */
export function PencilIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z" />
      <path d="M13.5 6.5l3 3" />
    </svg>
  );
}

/** 组件 / 拼图块。 */
export function ComponentIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M10 4.5a1.5 1.5 0 0 1 3 0V6h3a1 1 0 0 1 1 1v3h1.5a1.5 1.5 0 0 1 0 3H17v3a1 1 0 0 1-1 1h-3v-1.5a1.5 1.5 0 0 0-3 0V18H7a1 1 0 0 1-1-1v-3H4.5a1.5 1.5 0 0 1 0-3H6V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}
