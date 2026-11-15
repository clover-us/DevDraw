/**
 * ER 镜片的「字段级」外键解析 + 表卡片行几何。
 *
 * 为什么要有这一层：数据库的关联关系本质是「一张表的键列被另一张表的外键列引用」，
 * 所以画布上的外键线应该落在具体的字段行上，而不是笼统地连在两块卡片之间——
 * 线落在哪一行，本身就是模型里最有用的那句信息。
 *
 * 纯数据，无 UI 依赖：渲染（handle id）、布局（ELK port）、拖线（外键语义）三处共用同一份
 * 「外键列在哪张表、哪一行」的判断，避免三处各猜一套。
 */
import type { Model, ModelEdge } from './types';

/** 表卡片里的一行（字段）。 */
export interface ErField {
  id: string;
  name: string;
  /** PK / FK / UK …（来自 attrs.key）。 */
  keyRole?: string;
  /** 列类型（varchar / bigint …），画布行右列显示。 */
  dataType?: string;
  nullable?: boolean;
  /** 列备注：画布行中列缩略显示，完整内容在 title / 编辑器里。 */
  comment?: string;
}

/** 表卡片行几何（px）：与 .dd-table-head / .dd-field-row / .dd-table-fields 的 CSS 尺寸同步。 */
export const TABLE_HEAD_H = 36;
/** 实测：4 列卡渲染 145.9、24 列卡 645.9，行高正好 25；旧值 24.5 会让高卡比估算矮，缝隙被吃掉。 */
export const TABLE_ROW_H = 25;
/** .dd-table-fields 的上下内边距 + 卡片上下边框。 */
export const TABLE_BODY_PAD = 10;

/** 第 index 行（0 起）的竖直中心相对卡片顶边的偏移。 */
export function fieldRowOffset(index: number): number {
  return TABLE_HEAD_H + TABLE_BODY_PAD / 2 + TABLE_ROW_H * (index + 0.5);
}

/** 有 rows 行字段时表卡片的高度（无字段时留一行「无字段，去右侧添加」的位置）。 */
export function tableCardHeight(rows: number): number {
  if (rows <= 0) return TABLE_HEAD_H + 30;
  return TABLE_HEAD_H + TABLE_BODY_PAD + rows * TABLE_ROW_H;
}

/** 超过这么多列就默认折叠成「只显示键列」。字段一多，卡片会高得把画布撑散。 */
export const AUTO_FOLD_AT = 6;

export interface FoldedRows {
  /** 实际显示出来的行（折叠时只有键列）。 */
  rows: ErField[];
  /** 被折起来的行数；> 0 时卡片底部多一行「还有 N 列」。 */
  hidden: number;
}

/**
 * 折叠：只留键列（PK/FK/UK）。这不是纯显示技巧——外键线只关心键列，
 * 把非键列折起来之后，一张表在画布上占的高度和它"参与的关系"成正比，
 * 而不是和"它有多少列"成正比。
 */
export function foldRows(rows: ErField[], folded: boolean): FoldedRows {
  if (!folded) return { rows, hidden: 0 };
  const keys = rows.filter((r) => Boolean(r.keyRole));
  // 一个键都没有的表（比如纯日志表）折成空卡片就没信息了，至少留前两列。
  const keep = keys.length > 0 ? keys : rows.slice(0, 2);
  return { rows: keep, hidden: rows.length - keep.length };
}

export function shouldAutoFold(rows: ErField[]): boolean {
  return rows.length > AUTO_FOLD_AT;
}

/**
 * 折叠态下的卡片高度：只算可见行。
 *
 * 折叠必须真的矮下去——早先在底部留一行「还有 N 列」，结果 4 列的表折起来跟不折一样高，
 * 看起来像"点了没反应"。省下来的列数改放在表头（`3/12 列`），高度就完全等于行数。
 */
export function foldedCardHeight(visible: number): number {
  return tableCardHeight(Math.max(0, visible));
}

/** 字段行的行顺序：按 contains 边的出现顺序（与界面渲染顺序一致）。 */
export function tableFieldIds(model: Model, tableId: string): string[] {
  const ids: string[] = [];
  for (const e of Object.values(model.edges)) {
    if (e.type === 'contains' && e.from === tableId && model.nodes[e.to]?.type === 'Field') ids.push(e.to);
  }
  return ids;
}

export function erFieldRows(model: Model, tableId: string): ErField[] {
  return tableFieldIds(model, tableId).map((id) => {
    const n = model.nodes[id];
    return {
      id,
      name: n?.name ?? id,
      keyRole: typeof n?.attrs?.key === 'string' ? n.attrs.key : undefined,
      dataType: typeof n?.attrs?.dataType === 'string' ? n.attrs.dataType : undefined,
      nullable: n?.attrs?.nullable === true,
      comment: typeof n?.attrs?.comment === 'string' && n.attrs.comment ? n.attrs.comment : undefined,
    };
  });
}

/** 字段级 handle id：fl:… 在行左（target，进线），fr:… 在行右（source，出线）。 */
export function erFieldPort(side: 'left' | 'right', fieldId: string): string {
  return `${side === 'left' ? 'fl' : 'fr'}:${fieldId}`;
}

/**
 * 卡片级兜底锚点：字段锚不上时（例如 N:M 缺中间表，子表里根本没有那个外键列）连卡片边缘。
 * 必须给显式 id——Handle 不带 id 时 React Flow 会把边接到 DOM 里第一个同类型 handle，
 * 也就是第一行字段，线于是从"某个字段"冒出来，释义全错。
 */
export const ER_ANCHOR_HANDLE = { left: 'ea:left', right: 'ea:right' } as const;

/** 从 handle id 反查字段 id（用户拖线时 React Flow 给我们的是 handle id）。 */
export function fieldIdFromHandle(handleId?: string | null): string | undefined {
  if (!handleId || handleId.length < 4) return undefined;
  if (!handleId.startsWith('fl:') && !handleId.startsWith('fr:')) return undefined;
  return handleId.slice(3);
}

export interface FkLink {
  /** 边 from 端表上要锚的字段（正常情况下是父表主键）。 */
  fromFieldId?: string;
  /** 边 to 端表上要锚的字段（正常情况下是子表外键列）。 */
  toFieldId?: string;
  /** 语义父表（1 端）/ 子表（N 端）；外键列写在了父表一侧时为交换后的值。 */
  parentTable?: string;
  childTable?: string;
  /** 两端都锚到字段行 = true；模型里字段对不上时退回卡片级端口。 */
  fieldLevel: boolean;
}

/** 挑「被引用的键列」：优先叫 id 的主键，其次任意主键。 */
function pickParentKey(rows: ErField[]): ErField | undefined {
  return rows.find((r) => r.keyRole === 'PK' && /^id$/i.test(r.name)) ?? rows.find((r) => r.keyRole === 'PK');
}

/**
 * 解析一条外键边：谁引用谁、引用的是哪两行。
 * 外键列按定义应在子表（1:N 的 N 端，模型里的 to）；写反了就顺着「列在哪张表」翻回来，
 * 这样即使模型写错了，线也仍然落在人看得懂的两行上。
 */
export function resolveFkLink(edge: ModelEdge, rowsOf: (tableId: string) => ErField[]): FkLink {
  const fromRows = rowsOf(edge.from);
  const toRows = rowsOf(edge.to);
  const key = typeof edge.attrs?.key === 'string' ? edge.attrs.key : undefined;
  const childOnTo = key ? toRows.find((r) => r.name === key) : undefined;
  const childOnFrom = key ? fromRows.find((r) => r.name === key) : undefined;

  if (!childOnTo && !childOnFrom) {
    // 没写外键列（或列名对不上）：只把父表主键那端锚上，另一端退回卡片级端口。
    const fromKey = pickParentKey(fromRows);
    return { fromFieldId: fromKey?.id, fieldLevel: false };
  }
  const childTable = childOnTo ? edge.to : edge.from;
  const parentTable = childOnTo ? edge.from : edge.to;
  const child = (childOnTo ?? childOnFrom)!;
  const parent = pickParentKey(childOnTo ? fromRows : toRows);
  const fromFieldId = childOnTo ? parent?.id : child.id;
  const toFieldId = childOnTo ? child.id : parent?.id;
  return {
    fromFieldId,
    toFieldId,
    parentTable,
    childTable,
    fieldLevel: Boolean(fromFieldId && toFieldId),
  };
}

/** 全模型的外键边 → 字段级解析结果（只算 fk 边，别的边用不着）。 */
export function resolveFkLinks(model: Model): Record<string, FkLink> {
  const out: Record<string, FkLink> = {};
  const rowsOf = (tableId: string) => erFieldRows(model, tableId);
  for (const [id, edge] of Object.entries(model.edges)) {
    if (edge.type !== 'fk') continue;
    out[id] = resolveFkLink(edge, rowsOf);
  }
  return out;
}

export interface FkConnection {
  from: string;
  to: string;
  /** 外键列名（子表那一列）。 */
  key?: string;
  cardinality: '1:1' | '1:N';
}

/**
 * 拖线落点 → 外键语义。字段级连线时按字段角色定方向与基数：
 * 主键 → 普通列 是正常的 parent→child（1:N）；从子表往父表反着拖也认，
 * 顺手把方向纠正过来（用户想表达的永远是「这两列有引用关系」）。
 */
export function planFkConnection(
  model: Model,
  sourceTable: string,
  targetTable: string,
  sourceFieldId?: string | null,
  targetFieldId?: string | null,
): FkConnection {
  const field = (id?: string | null) => {
    if (!id) return undefined;
    const n = model.nodes[id];
    if (n?.type !== 'Field') return undefined;
    return { name: n.name, role: typeof n.attrs?.key === 'string' ? n.attrs.key : undefined };
  };
  const s = field(sourceFieldId);
  const t = field(targetFieldId);
  const pk = (f?: { role?: string }) => f?.role === 'PK';
  const oneToOne = pk(s) && pk(t);

  if (t && pk(t) && !pk(s)) {
    // 从子表往父表拖：方向翻过来，外键列是源端那一列。
    return { from: targetTable, to: sourceTable, key: s?.name, cardinality: '1:N' };
  }
  return {
    from: sourceTable,
    to: targetTable,
    key: t?.name ?? s?.name,
    cardinality: oneToOne ? '1:1' : '1:N',
  };
}