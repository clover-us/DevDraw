/**
 * DynamicLegend —— 画布左下角的「动态图例」。
 *
 * 为什么需要它：架构镜片的视觉语言已经很丰富（节点三态、依赖三种线型、失效传播
 * 与请求追踪两层 overlay），但此前只有面板脚注一行静态色点（失效/降级/正常/反问），
 * 既数不清当前到底有几处失效、也解释不了边的线型与叠加层。图例应当是「当前视图的
 * 实时读数」，而不是一张死掉的对照表——所以每一项都带活计数，0 的类别淡出，正在
 * 发生的叠加（传播 / 追踪）才浮现。它和失效推演一样只读不写，是画布的注解层。
 *
 * 色板与线型严格对齐画布实际编码（styles.css）：
 *   节点  失效=--danger 降级=--warning 正常=--success 失效源=红牌
 *   依赖  强=--edge-hard 实线 — 可降级=--warning 实线 — 异步=--accent 虚线
 *   叠加  失效传播=--danger 流动虚线 — 请求追踪=--info 实线 + 跳号牌
 */
import { useState } from 'react';
import { MinusIcon, PlusIcon } from './icons';
import type { LegendStats } from '../core/legend';

export type { LegendStats };

type DotKind = 'failed' | 'degraded' | 'ok' | 'seed';
type LineKind = 'hard' | 'soft' | 'async' | 'impacted' | 'traced';

function Swatch({ dot, line }: { dot?: DotKind; line?: LineKind }) {
  if (dot) return <span className={`dd-lg-dot is-${dot}`} aria-hidden />;
  return <span className={`dd-lg-line is-${line}`} aria-hidden />;
}

function Item({ dot, line, label, count }: { dot?: DotKind; line?: LineKind; label: string; count: number }) {
  return (
    <span className={`dd-lg-item${count === 0 ? ' is-zero' : ''}`}>
      <Swatch dot={dot} line={line} />
      <span className="dd-lg-label">{label}</span>
      <span className="dd-lg-count">{count}</span>
    </span>
  );
}

export function DynamicLegend({ nodeCounts, edgeCounts, impactedCount, tracedCount, simulating, tracing }: LegendStats) {
  // 收起偏好记在本地：图例是常驻注解，但有人喜欢干净的画布，给他一个不挡事的收起态。
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('devdraw-legend-collapsed') === '1';
    } catch {
      return false;
    }
  });
  const toggle = () =>
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem('devdraw-legend-collapsed', next ? '1' : '0');
      } catch {
        /* 隐私模式写不进就算了，本次会话内仍生效 */
      }
      return next;
    });

  if (collapsed) {
    return (
      <button className="dd-legend-card is-collapsed" onClick={toggle} title="展开动态图例" aria-expanded={false}>
        <span className="dd-lg-live" aria-hidden />
        图例
        <PlusIcon size={12} />
      </button>
    );
  }

  return (
    <div className="dd-legend-card" role="note" aria-label="动态图例：当前视图的实时读数">
      <div className="dd-lg-head">
        <span className="dd-lg-live" aria-hidden />
        <strong>图例</strong>
        <span className="dd-lg-sub">实时 · 当前视图</span>
        <button className="dd-lg-toggle" onClick={toggle} title="收起图例" aria-expanded={true}>
          <MinusIcon size={12} />
        </button>
      </div>

      <div className="dd-lg-group">
        <span className="dd-lg-glabel">节点</span>
        <div className="dd-lg-items">
          <Item dot="failed" label="失效" count={nodeCounts.failed} />
          <Item dot="degraded" label="降级" count={nodeCounts.degraded} />
          <Item dot="ok" label="正常" count={nodeCounts.ok} />
          <Item dot="seed" label="失效源" count={nodeCounts.seeds} />
        </div>
      </div>

      <div className="dd-lg-group">
        <span className="dd-lg-glabel">依赖</span>
        <div className="dd-lg-items">
          <Item line="hard" label="强依赖" count={edgeCounts.hard} />
          <Item line="soft" label="可降级" count={edgeCounts.soft} />
          <Item line="async" label="异步" count={edgeCounts.async} />
        </div>
      </div>

      {(simulating || tracing) && (
        <div className="dd-lg-group">
          <span className="dd-lg-glabel">叠加</span>
          <div className="dd-lg-items">
            {simulating && <Item line="impacted" label="失效传播" count={impactedCount} />}
            {tracing && <Item line="traced" label="请求追踪" count={tracedCount} />}
          </div>
        </div>
      )}
    </div>
  );
}