/**
 * ER 外键走线：把"哪张表的哪个字段行"变成一条横平竖直的折线。
 *
 * 为什么单独成模块：布局（ELK + 列对齐）只决定卡片坐标，真正让图"看得清谁接了谁"的是
 * 走线。规则收在一个纯函数里才能单测，也方便以后换布局算法而不动渲染。
 *
 * 三条规则：
 * 1. **相邻两列**：出门 → 在列间车道竖直落到目标行 → 进线。列间是空的，横竖各一段就够。
 * 2. **跨列长边**（中间还夹着一列）：如果目标行的高度上正好有中间列的卡片，直线会从卡片
 *    身上穿过去，改成从上方或下方绕一条横带过去（就近选边）；就近没有便宜的横带
 *    （要绕一大圈才算躲开），就统一走所有卡片上方的顶部留白——宁可画布高一点，也不穿卡片。
 * 3. **回边 / 自引用**（目标在左边或同一列）：从卡片上方绕过去再折回左侧入场。
 */
export interface Pt {
  x: number;
  y: number;
}

/** 卡片在流坐标里的包围盒（不含阴影/边框外扩）。 */
export interface CardRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface FkRoute {
  /** 出线点（父表键列右侧的 handle） */
  sx: number;
  sy: number;
  /** 入线点（子表外键列左侧的 handle） */
  tx: number;
  ty: number;
  /** 同一源字段散出的第几条线（0 起）与其总数：错开竖段，避免叠成一根。 */
  lane: number;
  laneCount: number;
  /** 本镜片所有卡片：用来判断长边会不会横穿中间列的卡片。 */
  cards?: CardRect[];
  /** 顶部通道的 y（所有卡片之上）。给了它，长边绕不过去时可以改走这里，而不是硬穿卡片。 */
  topY?: number;
}

/** 车道间距：同一源字段的多条线在这个宽度上依次排开。 */
const LANE_STEP = 10;
/** 绕行横带与中间列卡片的距离。 */
const BAND_GAP = 22;
/** 卡片之间至少要留这么宽才开车道。 */
const MIN_LANE = 26;
/** 横带比"直接跌到目标行"多走超过这么多，就不如干脆从顶部绕一次。 */
const MAX_BAND_DETOUR = 90;

export function routeFkPath(route: FkRoute): Pt[] {
  const { sx, sy, tx, ty, laneCount } = route;
  const lane = laneCount > 1 ? route.lane : 0;
  const offset = lane * LANE_STEP;
  const cards = route.cards ?? [];
  const span = tx - sx;

  if (span < 56) {
    // 回边 / 自引用：正着走会横穿卡片，从上方绕出去再折回左侧。
    const outX = sx + 24 + offset;
    const overY = Math.min(sy, ty) - (30 + offset);
    const backX = tx - 24 - offset;
    return [
      { x: sx, y: sy },
      { x: outX, y: sy },
      { x: outX, y: overY },
      { x: backX, y: overY },
      { x: backX, y: ty },
      { x: tx, y: ty },
    ];
  }

  // 源列右侧最近的卡片左边界 = 这条车道最远能停的地方。
  const ahead = cards.filter((c) => c.left > sx + 2);
  const nextLeft = ahead.length > 0 ? Math.min(...ahead.map((c) => c.left)) : tx;
  const laneRoom = Math.max(MIN_LANE, Math.min(nextLeft - sx - 12, 56));
  const laneX = sx + laneRoom * 0.5 + offset;

  // 中间夹着的卡片（跨列长边才会遇到）。
  const between = cards.filter((c) => c.left > sx + 2 && c.right < tx - 2);
  const blocks = between.some((c) => c.top - 2 <= ty && c.bottom + 2 >= ty);
  if (!blocks) {
    return [
      { x: sx, y: sy },
      { x: laneX, y: sy },
      { x: laneX, y: ty },
      { x: tx, y: ty },
    ];
  }

  // 入场车道：贴着目标列左边界，避开中间列右侧的卡片。
  const behind = cards.filter((c) => c.right < tx - 2);
  const prevRight = behind.length > 0 ? Math.max(...behind.map((c) => c.right)) : sx;
  const inRoom = Math.max(MIN_LANE, Math.min(tx - prevRight - 12, 56));
  const inX = tx - inRoom * 0.5 - offset;

  // 绕行横带的候选：中间列每张卡片的"上沿之上 / 下沿之下"，再加上整体最上、最下。
  // 只认上下的极值会逼出"绕整列一大圈"的空心框——卡片之间那几十像素的空当同样能穿过去。
  // 候选要保证在 [laneX, inX] 这段横穿范围内不碰到任何卡片（源列、目标列的卡不在此区间内）。
  const blockers = between.filter((c) => c.right > laneX && c.left < inX);
  const isFree = (y: number) => !blockers.some((c) => y > c.top - 2 && y < c.bottom + 2);
  const candidates: number[] = [];
  for (const c of between) candidates.push(c.top - BAND_GAP, c.bottom + BAND_GAP);
  candidates.push(
    Math.min(...between.map((c) => c.top)) - BAND_GAP,
    Math.max(...between.map((c) => c.bottom)) + BAND_GAP,
  );
  const free = candidates.filter(isFree);
  const cost = (y: number) => Math.abs(sy - y) + Math.abs(ty - y);
  const bestBand = free.length > 0 ? free.reduce((best, y) => (cost(y) < cost(best) ? y : best)) : undefined;
  // 同源字段的多条线叠在一条横带上会糊成一根，所以在空当里上下错开一点；
  // 错开会撞进卡片时就不错开（宁可两条线共用一条横带，也不要为了错开而穿卡）。
  const band =
    bestBand === undefined
      ? undefined
      : offset === 0
        ? bestBand
        : isFree(bestBand - offset)
          ? bestBand - offset
          : isFree(bestBand + offset)
            ? bestBand + offset
            : bestBand;

  // 就近横带优先（截图中 orders→order_items 从 payments 与 products 之间穿过去的走法）。
  // 判定用"比直线多绕多少"，而不是绝对距离：横带本来就夹在两端之间时，它只走 |sy-ty|，
  // 哪怕两端差着三百像素也是最优解 —— 拿绝对值去卡会把它误判成"绕太远"，
  // 结果拐出一个一路顶到画布上沿、再折回目标的大回环。
  const topY = route.topY;
  const direct = Math.abs(ty - sy);
  if (band !== undefined && cost(band) <= direct + MAX_BAND_DETOUR) {
    return [
      { x: sx, y: sy },
      { x: laneX, y: sy },
      { x: laneX, y: band },
      { x: inX, y: band },
      { x: inX, y: ty },
      { x: tx, y: ty },
    ];
  }
  if (topY !== undefined) {
    // 顶部通道：上到所有卡片之上 → 横穿 → 从目标列左边界下来。任何卡片都碰不到。
    return [
      { x: sx, y: sy },
      { x: laneX, y: sy },
      { x: laneX, y: topY },
      { x: inX, y: topY },
      { x: inX, y: ty },
      { x: tx, y: ty },
    ];
  }

  return [
    { x: sx, y: sy },
    { x: laneX, y: sy },
    { x: laneX, y: band ?? candidates[0] },
    { x: inX, y: band ?? candidates[0] },
    { x: inX, y: ty },
    { x: tx, y: ty },
  ];
}

/** 折线的中间点（标签/基数标记定位用）：取最长的那个竖段的中点。 */
export function longestVerticalMidpoint(points: Pt[]): Pt {
  let best = points[0];
  let bestLen = -1;
  for (let i = 1; i < points.length; i++) {
    const len = Math.abs(points[i].y - points[i - 1].y);
    if (len > bestLen) {
      bestLen = len;
      best = { x: points[i].x, y: (points[i].y + points[i - 1].y) / 2 };
    }
  }
  return best;
}