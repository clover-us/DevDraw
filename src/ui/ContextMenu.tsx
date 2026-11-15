/**
 * 画布右键菜单：把"危险动作"从最高频的手势里拿出来。
 *
 * 以前右键节点 = 直接把它变成失效源（还顺手切到推演面板）。很"啊哈"，但没人猜得到，
 * 而且误触代价不小。现在右键恢复它该有的样子：列出能对**这个节点**做的事。
 */
import { useEffect, useState } from 'react';

export interface MenuItem {
  key: string;
  label: string;
  hint?: string;
  tone?: 'danger';
  /** 设置后该项需点两次：首点上膛显示 confirmLabel，二点才执行（破坏性动作防误触）。 */
  confirmLabel?: string;
  onSelect: () => void;
}

interface Props {
  x: number;
  y: number;
  title?: string;
  items: MenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, title, items, onClose }: Props) {
  const [armed, setArmed] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(null), 3000);
    return () => window.clearTimeout(t);
  }, [armed]);

  const W = 208;
  const H = 16 + (title ? 26 : 0) + items.length * 32;
  const left = Math.min(x, window.innerWidth - W - 8);
  const top = Math.min(y, window.innerHeight - H - 8);

  return (
    <>
      <div className="dd-popover-overlay" onMouseDown={onClose} onContextMenu={(e) => e.preventDefault()} />
      <div className="dd-popover dd-ctx-menu" style={{ left, top, width: W }} role="menu">
        {title && <div className="dd-ctx-title">{title}</div>}
        {items.map((item) => {
          const isArmed = armed === item.key && !!item.confirmLabel;
          return (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              className={`dd-ctx-item${item.tone === 'danger' ? ' danger' : ''}${isArmed ? ' armed' : ''}`}
              onClick={() => {
                if (item.confirmLabel && armed !== item.key) {
                  setArmed(item.key);
                  return;
                }
                item.onSelect();
                onClose();
              }}
            >
              <span>{isArmed ? item.confirmLabel : item.label}</span>
              {item.hint && !isArmed && <span className="dd-ctx-hint">{item.hint}</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}