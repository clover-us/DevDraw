import { describe, expect, it } from 'vitest';
import { arrangeColumns, columnKey, groupColumns, packAround, placeIsolated, reflowColumn, type Positions } from '../er-arrange';

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

  it('x 差十几像素算同一列（ELK 同层对不齐的副作用），列键取较小的那个', () => {
    // 实测：orders 在 360、带 reads 边的假设卡在 372 —— 差 12px，被当成两列就互相压住。
    const groups = groupColumns({ orders: { x: 360, y: 0 }, asm: { x: 372, y: 0 } });
    expect(groups.size).toBe(1);
    expect(groups.get(360)?.sort()).toEqual(['asm', 'orders']);
  });
});

describe('arrangeColumns', () => {
  it('只动 y，不动 x', () => {
    const pos: Positions = { a: { x: 0, y: 0 }, b: { x: 0, y: 300 }, c: { x: 300, y: 150 } };
    const out = arrangeColumns(pos, heights, [{ from: 'a', to: 'c' }], 44);
    for (const id of Object.keys(pos)) expect(out[id].x).toBe(pos[id].x);
  });

  it('同一列里 x 差十几像素的两张卡：对齐到列锚点，并且上下贴紧不重叠', () => {
    const pos: Positions = { a: { x: 360, y: 0 }, b: { x: 372, y: 0 } };
    const out = arrangeColumns(pos, heights, [], 44);
    expect(out.a.x).toBe(360);
    expect(out.b.x).toBe(360);
    expect(out.b.y).toBeGreaterThanOrEqual(out.a.y + H + 44);
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

describe('packAround', () => {
  const entries = [
    { id: 'a', y: 0, height: H },
    { id: 'b', y: 70, height: H },
    { id: 'c', y: 140, height: H },
  ];

  it('锚点顶边不动，下方按新高度补位', () => {
    // b 被折起来，只剩 20 高：c 应该贴到 b 的新底边 + gap。
    const shrunk = entries.map((e) => (e.id === 'b' ? { ...e, height: 20 } : e));
    const out = packAround(shrunk, 20, 'b', 70);
    expect(out.b).toBe(70);
    expect(out.c).toBe(70 + 20 + 20);
  });

  it('锚点上方的卡一个像素都不动', () => {
    const out = packAround(entries, 20, 'b', 70);
    expect(out.a).toBe(0);
  });

  it('锚点下方不再留空洞', () => {
    const sparse = [
      { id: 'a', y: 0, height: H },
      { id: 'b', y: 70, height: H },
      { id: 'c', y: 400, height: H },
    ];
    const out = packAround(sparse, 20, 'b', 70);
    expect(out.c).toBe(70 + H + 20);
  });

  it('锚点不存在时返回空表', () => {
    expect(packAround(entries, 20, 'zzz', 0)).toEqual({});
  });
});

describe('placeIsolated', () => {
  const widths = { a: 232, b: 232, c: 220, d: 220, e: 232 };
  const hs = { a: 74, b: 74, c: 72, d: 72, e: 74 };

  it('没有游离节点时返回空表', () => {
    expect(placeIsolated([], widths, hs, 1000, 0, 44)).toEqual({});
  });

  it('从主图右边界 + gap 起排，纵向从主图顶边开始', () => {
    const out = placeIsolated(['a', 'b'], widths, hs, 1000, 120, 44);
    expect(out.a).toEqual({ x: 1044, y: 120 });
    expect(out.b).toEqual({ x: 1044, y: 120 + 74 + 44 });
  });

  it('超过每列上限就换列，列宽取该列最宽的卡', () => {
    const out = placeIsolated(['a', 'b', 'c', 'd', 'e'], widths, hs, 1000, 0, 44, 2);
    // 第一列 a/b（宽 232），第二列 c/d（宽 220），第三列 e。
    expect(out.c.x).toBe(1000 + 44 + 232 + 44);
    expect(out.e.x).toBe(1000 + 44 + 232 + 44 + 220 + 44);
    expect(out.e.y).toBe(0);
  });

  it('同一列内不重叠', () => {
    const out = placeIsolated(['a', 'b', 'c'], widths, hs, 0, 0, 44);
    expect(out.b.y).toBeGreaterThanOrEqual(out.a.y + hs.a + 44);
    expect(out.c.y).toBeGreaterThanOrEqual(out.b.y + hs.b + 44);
  });
});