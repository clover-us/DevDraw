import { describe, expect, it } from 'vitest';
import { alignNodes, computeGroupBoundsForNodes, distributeNodes } from './align';
import type { EntityNode } from '../types';

function makeNode(id: string, x: number, y: number, w = 200, h = 100): EntityNode {
  return {
    id,
    kind: 'service',
    title: id,
    tag: 'SVC',
    note: '',
    color: 'sky',
    x,
    y,
    w,
    h,
  };
}

describe('@devdraw/core alignment, distribution & grouping helpers', () => {
  it('aligns selected nodes along left, center-x, right, top, center-y, and bottom', () => {
    const nodes = [makeNode('a', 100, 50, 200, 100), makeNode('b', 340, 210, 160, 80)];

    const left = alignNodes(nodes, ['a', 'b'], 'left');
    expect(left.map((n) => n.x)).toEqual([100, 100]);

    const right = alignNodes(nodes, ['a', 'b'], 'right');
    // Rightmost edge is 340 + 160 = 500 -> a.x = 300, b.x = 340
    expect(right.map((n) => n.x)).toEqual([300, 340]);

    const top = alignNodes(nodes, ['a', 'b'], 'top');
    expect(top.map((n) => n.y)).toEqual([50, 50]);

    const bottom = alignNodes(nodes, ['a', 'b'], 'bottom');
    // Bottommost edge is 210 + 80 = 290 -> a.y = 190, b.y = 210
    expect(bottom.map((n) => n.y)).toEqual([190, 210]);

    const centerX = alignNodes(nodes, ['a', 'b'], 'center-x');
    // Mid X of [100..500] = 300 -> a.x = 200, b.x = 220
    expect(centerX.map((n) => n.x)).toEqual([200, 220]);
  });

  it('distributes 3+ nodes evenly along horizontal and vertical axes', () => {
    const nodes = [
      makeNode('a', 0, 0, 100, 80),
      makeNode('b', 120, 40, 100, 80),
      makeNode('c', 500, 400, 100, 80),
    ];

    const horiz = distributeNodes(nodes, ['a', 'b', 'c'], 'horizontal');
    // Total span 0..600, sum widths 300, gap 150 -> x = 0, 250, 500
    expect(horiz.map((n) => n.x)).toEqual([0, 250, 500]);

    const vert = distributeNodes(nodes, ['a', 'b', 'c'], 'vertical');
    // Total span 0..480, sum heights 240, gap 120 -> y = 0, 200, 400
    expect(vert.map((n) => n.y)).toEqual([0, 200, 400]);
  });

  it('computes padded bounding group frame around selected nodes', () => {
    const nodes = [makeNode('a', 100, 100, 200, 90), makeNode('b', 400, 220, 200, 90)];
    const bounds = computeGroupBoundsForNodes(nodes, ['a', 'b'], 40);
    expect(bounds).toEqual({
      x: 60,
      y: 44,
      w: 580,
      h: 306,
    });
  });
});
