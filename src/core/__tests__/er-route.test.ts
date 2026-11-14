import { describe, expect, it } from 'vitest';
import { longestVerticalMidpoint, routeFkPath, type CardRect, type Pt } from '../er-route';

/** 折线是否strictly 横平竖直（每段只能变 x 或只能变 y）。 */
function isOrthogonal(points: Pt[]): boolean {
  return points.every((p, i) => i === 0 || p.x === points[i - 1].x || p.y === points[i - 1].y);
}

/** 某条线段是否穿进卡片内部（闭合判断，边框上不算）。 */
function crosses(rect: CardRect, a: Pt, b: Pt): boolean {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  return minX > rect.left + 1 && maxX < rect.right - 1 && minY > rect.top + 1 && maxY < rect.bottom - 1;
}

function hitsCard(card: CardRect, points: Pt[]): boolean {
  for (let i = 1; i < points.length; i++) {
    if (crosses(card, points[i - 1], points[i])) return true;
  }
  return false;
}

describe('routeFkPath', () => {
  const parent = { left: 0, top: 100, right: 232, bottom: 300 };
  const middle = { left: 604, top: 80, right: 836, bottom: 300 };
  const child = { left: 1004, top: 60, right: 1236, bottom: 260 };

  it('相邻两列：四段折线，车道落在两卡之间', () => {
    const points = routeFkPath({ sx: 232, sy: 140, tx: 372, ty: 200, lane: 0, laneCount: 1, cards: [parent, child] });
    expect(points).toHaveLength(4);
    expect(isOrthogonal(points)).toBe(true);
    expect(points[0]).toEqual({ x: 232, y: 140 });
    expect(points[3]).toEqual({ x: 372, y: 200 });
    expect(points[1].x).toBeGreaterThan(232);
    expect(points[1].x).toBeLessThan(372);
    expect(points[1].x).toBe(points[2].x);
  });

  it('跨列长边：目标行被中间列卡片挡住时，绕上方或下方过去，不穿卡', () => {
    const points = routeFkPath({ sx: 232, sy: 140, tx: 1004, ty: 200, lane: 0, laneCount: 1, cards: [parent, middle, child] });
    expect(points).toHaveLength(6);
    expect(isOrthogonal(points)).toBe(true);
    expect(hitsCard(middle, points)).toBe(false);
    // 横带要么在中间列之上（< top），要么在其下（> bottom）
    const band = points[2].y;
    expect(band < middle.top || band > middle.bottom).toBe(true);
  });

  it('跨列长边：目标行没被挡住时不必绕行，保持四段', () => {
    const points = routeFkPath({ sx: 232, sy: 140, tx: 1004, ty: 340, lane: 0, laneCount: 1, cards: [parent, middle, child] });
    expect(points).toHaveLength(4);
    expect(hitsCard(middle, points)).toBe(false);
  });

  it('跨列长边：中间列两张卡之间的空当能穿过去，就不绕整列一大圈', () => {
    const upper = { left: 604, top: 80, right: 836, bottom: 300 };
    const lower = { left: 604, top: 360, right: 836, bottom: 600 };
    const points = routeFkPath({
      sx: 232,
      sy: 140,
      tx: 1004,
      ty: 400,
      lane: 0,
      laneCount: 1,
      cards: [parent, upper, lower, child],
    });
    expect(points).toHaveLength(6);
    expect(hitsCard(upper, points)).toBe(false);
    expect(hitsCard(lower, points)).toBe(false);
    // 横带落在两张卡之间那条缝里（而不是绕到整列之上/之下）
    expect(points[2].y).toBeGreaterThan(upper.bottom);
    expect(points[2].y).toBeLessThan(lower.top);
  });

  it('回边 / 自引用：从上方绕出去再折回左侧', () => {
    const points = routeFkPath({ sx: 232, sy: 140, tx: 60, ty: 200, lane: 0, laneCount: 1, cards: [parent] });
    expect(points).toHaveLength(6);
    expect(isOrthogonal(points)).toBe(true);
    expect(Math.min(...points.map((p) => p.y))).toBeLessThan(140);
  });

  it('同源多条线按 lane 错开车道', () => {
    const a = routeFkPath({ sx: 232, sy: 140, tx: 372, ty: 200, lane: 0, laneCount: 2, cards: [parent, child] });
    const b = routeFkPath({ sx: 232, sy: 140, tx: 372, ty: 200, lane: 1, laneCount: 2, cards: [parent, child] });
    expect(b[1].x).toBeGreaterThan(a[1].x);
    expect(b[1].x - a[1].x).toBeGreaterThanOrEqual(8);
  });

  it('没有卡片信息时也能兜底成十字折线', () => {
    const points = routeFkPath({ sx: 232, sy: 140, tx: 600, ty: 300, lane: 0, laneCount: 1 });
    expect(points).toHaveLength(4);
    expect(isOrthogonal(points)).toBe(true);
  });

  it('longestVerticalMidpoint 取最长竖段的中点（标签定位用）', () => {
    const mid = longestVerticalMidpoint([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 120 },
      { x: 200, y: 120 },
    ]);
    expect(mid).toEqual({ x: 40, y: 60 });
  });
});