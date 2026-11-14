/**
 * 拖出连线、松手 → 就地选「这条线是什么语义」。
 *
 * 为什么要有这一步：同样是两个节点之间的一根线，`calls` 和 `publishes` 的失效传播规则完全不同
 * （hard 直接失败 vs async 只是积压）。让镜片偷偷替你决定默认类型，等于把最该由人做的语义判断拿走。
 */
import { useEffect, useState } from 'react';
import type { EdgeTypeDef } from '../core/registry';
import type { EdgeType } from '../core/types';

interface Props {
  options: EdgeTypeDef[];
  /** 默认高亮（上次用过的类型）。 */
  value: EdgeType;
  x: number;
  y: number;
  onPick: (type: EdgeType) => void;
  onCancel: () => void;
}

export function EdgePicker({ options, value, x, y, onPick, onCancel }: Props) {
  const initial = Math.max(0, options.findIndex((o) => o.id === value));
  const [cursor, setCursor] = useState(initial);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const hit = options[cursor];
        if (hit) onPick(hit.id);
        return;
      }
      const digit = Number(e.key);
      if (Number.isInteger(digit) && digit >= 1 && digit <= options.length) {
        e.preventDefault();
        onPick(options[digit - 1].id);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, options.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [options, cursor, onPick, onCancel]);

  const W = 188;
  const H = 58 + options.length * 38;
  const left = Math.min(x, window.innerWidth - W - 12);
  const top = Math.min(y, window.innerHeight - H - 12);

  return (
    <>
      <div className="dd-popover-overlay" onMouseDown={onCancel} />
      <div className="dd-popover dd-edge-picker" style={{ left, top, width: W }} role="dialog" aria-label="选择连线语义">
        <div className="dd-popover-title">这条线是什么？</div>
        {options.map((opt, idx) => (
          <button
            key={opt.id}
            type="button"
            className={`dd-edge-opt${idx === cursor ? ' on' : ''}`}
            onMouseEnter={() => setCursor(idx)}
            onClick={() => onPick(opt.id)}
          >
            <span className="dd-edge-opt-key">{idx + 1}</span>
            <span className="dd-edge-opt-label">{opt.label}</span>
            <span className="dd-edge-opt-id">{opt.id}</span>
          </button>
        ))}
        <div className="dd-popover-foot">边类型决定失效怎么传 · Esc 取消</div>
      </div>
    </>
  );
}