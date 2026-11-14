/**
 * useTheme —— 光 / 暗双主题。偏好存 localStorage，应用到 <html data-theme>，
 * 同时设置 color-scheme 让原生控件（滚动条/输入框）跟随。默认暗色（产品识别色）。
 */
import { useCallback, useLayoutEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

const KEY = 'devdraw-theme';

function initial(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    /* localStorage 不可用（隐私模式）时忽略 */
  }
  return 'dark';
}

export function useTheme(): { theme: Theme; toggle: () => void; setTheme: (t: Theme) => void } {
  const [theme, setThemeState] = useState<Theme>(initial);

  // 用 layout effect 在绘制前同步应用 data-theme：保证子组件的 passive effect
  // （如设计页色卡读取 getComputedStyle）读到的已是新主题取值，避免读到旧值。
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* 忽略 */
    }
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggle = useCallback(() => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')), []);

  return { theme, toggle, setTheme };
}
