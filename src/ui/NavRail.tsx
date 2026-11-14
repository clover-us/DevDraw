/**
 * NavRail —— 左侧导航轨（常驻图标轨，面板默认收起）。
 * 把旧右栏那堆内容拆成三个可导航分区：实体 / 发现 / 推演。
 * 镜片切换留在顶部 header（用户要求顶部不变）。底部：主题切换 + 展开/收起。
 */
import { ChevronLeftIcon, ChevronRightIcon, EntitiesIcon, FindingsIcon, LibraryIcon, LogoIcon, MoonIcon, SimulationIcon, SunIcon } from './icons';
import type { Theme } from './theme';

export type NavSection = 'library' | 'entities' | 'findings' | 'simulation';

interface NavRailProps {
  section: NavSection;
  expanded: boolean;
  findingsBadge: number;
  simulationBadge: number;
  theme: Theme;
  onSection: (s: NavSection) => void;
  onToggleExpand: () => void;
  onToggleTheme: () => void;
}

const SECTIONS: Array<{ id: NavSection; label: string; Icon: typeof EntitiesIcon; hint: string }> = [
  { id: 'library', label: '组件库', Icon: LibraryIcon, hint: '挑选高辨识度组件，点/拖入画布建模' },
  { id: 'entities', label: '实体', Icon: EntitiesIcon, hint: '浏览与建模当前镜片的实体' },
  { id: 'findings', label: '发现', Icon: FindingsIcon, hint: '模型顶嘴：推演器发现的问题与反问' },
  { id: 'simulation', label: '推演', Icon: SimulationIcon, hint: '失效推演：设失效源，看爆炸半径' },
];

export function NavRail({
  section,
  expanded,
  findingsBadge,
  simulationBadge,
  theme,
  onSection,
  onToggleExpand,
  onToggleTheme,
}: NavRailProps) {
  const badgeFor = (id: NavSection) => (id === 'findings' ? findingsBadge : id === 'simulation' ? simulationBadge : 0);
  return (
    <nav className="dd-rail" aria-label="主导航">
      <div className="dd-rail-logo" title="DevDraw · 研绘">
        <LogoIcon size={24} />
      </div>

      <div className="dd-rail-group">
        {SECTIONS.map(({ id, label, Icon, hint }) => {
          const active = section === id && expanded;
          const badge = badgeFor(id);
          return (
            <button
              key={id}
              className={`dd-rail-btn${active ? ' active' : ''}`}
              onClick={() => onSection(id)}
              title={`${hint}${badge > 0 ? ` · ${badge} 处待处理` : ''}`}
              aria-pressed={active}
            >
              <span className="dd-rail-ico">
                <Icon size={21} />
                {badge > 0 && <span className="dd-rail-badge">{badge}</span>}
              </span>
              <span className="dd-rail-label">{label}</span>
            </button>
          );
        })}
      </div>

      <div className="dd-rail-spacer" />

      <button
        className="dd-rail-btn dd-rail-icon-only"
        onClick={onToggleTheme}
        title={theme === 'dark' ? '切换到亮色主题' : '切换到暗色主题'}
        aria-label="切换主题"
      >
        <span className="dd-rail-ico">{theme === 'dark' ? <SunIcon size={20} /> : <MoonIcon size={20} />}</span>
      </button>
      <button
        className="dd-rail-btn dd-rail-icon-only"
        onClick={onToggleExpand}
        title={expanded ? '收起导航面板' : '展开导航面板'}
        aria-expanded={expanded}
        aria-label="展开或收起导航面板"
      >
        <span className="dd-rail-ico">{expanded ? <ChevronLeftIcon size={20} /> : <ChevronRightIcon size={20} />}</span>
      </button>
    </nav>
  );
}
