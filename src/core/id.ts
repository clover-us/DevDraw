/**
 * 全局唯一 id 生成 —— name 与 id 分离（协作隐患②的解法）。
 * 设计依据：docs/design/lens-model.md §1.3、持久化定调第 4 条。
 * 用户给的 name 是显示名（可重复）；底层 id 用「类型前缀 + ULID」全局唯一，
 * 两人离线各建节点也不会撞车，CRDT 合并时按 id 寻址天然不冲突。
 */

/** Crockford Base32 字母表（去掉 I L O U，避免歧义）。 */
const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 节点类型 → id 前缀（短、可读、跨类型不撞）。 */
const NODE_PREFIX: Record<string, string> = {
  Service: 'svc',
  Database: 'db',
  Table: 'tbl',
  Field: 'fld',
  Queue: 'q',
  Endpoint: 'ep',
  ExternalSystem: 'ext',
  Actor: 'act',
  Decision: 'dec',
  Assumption: 'asm',
  Note: 'note',
  Lifecycle: 'lc',
  State: 'st',
};

/** 边类型 → id 前缀。 */
const EDGE_PREFIX: Record<string, string> = {
  calls: 'call',
  reads: 'read',
  writes: 'write',
  publishes: 'pub',
  subscribes: 'sub',
  'depends-on': 'dep',
  contains: 'cont',
  fk: 'fk',
  transition: 'tr',
  'has-lifecycle': 'hlc',
  encodes: 'enc',
};

let lastTime = 0;
let lastRandom: number[] = [];

/** 生成一个 ULID 的 26 字符主体（48bit 时间 + 80bit 随机，单调递增）。 */
function ulidBody(now: number): string {
  // 同一毫秒内：随机部分自增，保证单调且唯一。
  if (now === lastTime && lastRandom.length === 16) {
    for (let i = 15; i >= 0; i--) {
      if (lastRandom[i] < 31) {
        lastRandom[i]++;
        break;
      }
      lastRandom[i] = 0;
    }
  } else {
    lastTime = now;
    lastRandom = Array.from({ length: 16 }, () => Math.floor(Math.random() * 32));
  }

  // 时间部分：10 字符（48bit）。
  let time = now;
  const timeChars: string[] = new Array(10);
  for (let i = 9; i >= 0; i--) {
    timeChars[i] = ENCODING[time % 32];
    time = Math.floor(time / 32);
  }
  // 随机部分：16 字符（80bit）。
  const randChars = lastRandom.map((r) => ENCODING[r]);
  return timeChars.join('') + randChars.join('');
}

/** 生成节点 id，如 svc_01JABC...（前缀 + ULID）。 */
export function newNodeId(type: string, now: number = Date.now()): string {
  const prefix = NODE_PREFIX[type] ?? 'n';
  return `${prefix}_${ulidBody(now)}`;
}

/** 生成边 id，如 tr_01JABC...。 */
export function newEdgeId(type: string, now: number = Date.now()): string {
  const prefix = EDGE_PREFIX[type] ?? 'e';
  return `${prefix}_${ulidBody(now)}`;
}

/** 生成自定义组件 id，如 comp_01JABC...。 */
export function newComponentId(now: number = Date.now()): string {
  return `comp_${ulidBody(now)}`;
}

/** 生成推演会话 id，如 ses_01JABC...（reasoning/<id>.json）。 */
export function newSessionId(now: number = Date.now()): string {
  return `ses_${ulidBody(now)}`;
}

/** 把任意显示名转成可读 slug（仅用于文件名/展示，不作唯一 id）。 */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'untitled'
  );
}
