import React, { useEffect, useState } from 'react';
import { Copy, Minus, Square, X } from 'lucide-react';
import { isTauriRuntime } from '../storage/adapter';

interface WindowControlsProps {
  /** Use muted dark-launcher styling vs theme-aware workbench styling */
  variant?: 'launcher' | 'workbench';
}

export const WindowControls: React.FC<WindowControlsProps> = ({ variant = 'workbench' }) => {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let unlisten: (() => void) | undefined;
    let active = true;

    void (async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();
        if (active) setMaximized(await win.isMaximized());
        unlisten = await win.onResized(async () => {
          if (active) setMaximized(await win.isMaximized());
        });
      } catch {
        // Ignore if window API is unavailable
      }
    })();

    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  if (!isTauriRuntime()) return null;

  const handleMinimize = async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().minimize();
  };

  const handleToggleMaximize = async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    await win.toggleMaximize();
    setMaximized(await win.isMaximized());
  };

  const handleClose = async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().close();
  };

  const btnBase =
    variant === 'launcher'
      ? 'w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.08] transition-colors'
      : 'w-7 h-7 rounded-lg flex items-center justify-center text-[var(--dd-text-secondary)] hover:text-[var(--dd-text-primary)] hover:bg-white/[0.08] transition-colors';

  return (
    <div className="flex items-center gap-0.5 shrink-0 select-none">
      <button
        type="button"
        onClick={() => void handleMinimize()}
        title="最小化"
        className={btnBase}
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={() => void handleToggleMaximize()}
        title={maximized ? '向下还原' : '最大化'}
        className={btnBase}
      >
        {maximized ? <Copy className="w-3 h-3" /> : <Square className="w-3 h-3" />}
      </button>
      <button
        type="button"
        onClick={() => void handleClose()}
        title="关闭窗口"
        className={`${btnBase} hover:!bg-rose-500/85 hover:!text-white`}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
