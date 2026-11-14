import { describe, expect, it } from 'vitest';
import { arrangeColumns, columnKey, groupColumns, reflowColumn, type Positions } from '../er-arrange';

const H = 50;
const heights = { a: H, b: H, c: H, d: H };

describe('columnKey / groupColumns', () => {
  it('四舍五入后同值的 x 归为一列', () => {
    expect(columnKey(0.4)).toBe(0);
    expect(columnKey(0.2)).toBe(0);
    expect(columnKey(300)).toBe(300);
  });

  it('按 x 分组，保留节点 id', () => {
    const groups = groupColumns({ a: { x: 0, y: 0 }, b: { x: 0.3, y: 80 }, c: { x: 300, y: 10 } });
    expect(groups.get(0)?.sort()).toEqual(['a', 'b']);
    expect(groups.get(300)).toEqual(['c']);
  });
});

describe('arrangeColumns', () => {
  it('只动 y，不动 x', () => {
    const pos: Positions = { a: { x: 0, y: 0 }, b: { x: 0, y: 300 }, c: { x: 300, y: 150 } };
    const out = arrangeColumns(pos, heights, [{ from: 'a', to: 'c' }], 44);
    for (const id of Object.keys(pos)) expect(out[id].x).toBe(pos[id].x);
  });

  it('列内按 gap 贴紧，不留空洞', () => {
    // 原始间距 250 —— 排完应该只剩 gap。
    const pos: Positions = { a: { x: 0, y: 0 }, b: { x: 0, y: 300 } };
    const out = arrangeColumns(pos, heights, [], 44);
    expect(out.b.y - out.a.y).toBe(H + 44);
  });

  it('按邻居高度排序：邻居在上面的那张卡自动上移', () => {
    // 初始 a 在上、b 在下；但 a 的父表在下方、b 的父表在上方 —— 排完 b 应该跑到 a 上面。
    const pos: Positions = {
      a: { x: 0, y: 0 },
      b: { x: 0, y: 300 },
      c: { x: 300, y: 400 },
      d: { x: 300, y: 0 },
    };
    const out = arrangeColumns(
      pos,
      heights,
      [
        { from: 'a', to: 'c' },
        { from: 'b', to: 'd' },
      ],
      44,
    );
    expect(out.b.y).toBeLessThan(out.a.y);
  });

  it('整列以全图中轴垂直居中', () => {
    const pos: Positions = { a: { x: 0, y: 0 }, b: { x: 0, y: 100 }, c: { x: 300, y: 0 } };
    const out = arrangeColumns(pos, heights, [], 44);
    // 单卡列的中心 = 全图中轴。
    const total = (Math.min(0, 0) + Math.max(0 + H, 100 + H)) / 2;
    expect(out.c.y + H / 2).toBeCloseTo(total, 0);
  });

  it('同样输入给同样输出（纯函数）', () => {
    const pos: Positions = { a: { x: 0, y: 0 }, b: { x: 0, y: 300 }, c: { x: 300, y: 150 }, d: { x: 600, y: 20 } };
    const edges = [
      { from: 'a', to: 'c' },
      { from: 'c', to: 'd' },
    ];
    expect(arrangeColumns(pos, heights, edges, 44)).toEqual(arrangeColumns(pos, heights, edges, 44));
  });

  it('空输入原样返回', () => {
    expect(arrangeColumns({}, {}, [], 44)).toEqual({});
  });
});

describe('reflowColumn', () => {
  it('按顺序贴紧，被挤下去的卡不会盖住上一张', () => {
    const out = reflowColumn(
      [
        { id: 'a', y: 0, height: H },
        { id: 'b', y: 10, height: H },
      ],
      20,
    );
    expect(out.a).toBe(0);
    expect(out.b).toBe(H + 20);
  });

  it('被拖动的卡停在用户放下的位置，其余让位', () => {
    const out = reflowColumn(
      [
        { id: 'a', y: 0, height: H },
        { id: 'b', y: 60, height: H },
      ],
      20,
      { id: 'b', y: 200 },
    );
    expect(out.b).toBe(200);
    expect(out.a).toBe(0);
  });

  it('空输入返回空表', () => {
    expect(reflowColumn([], 20)).toEqual({});
  });
});