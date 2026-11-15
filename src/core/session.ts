/**
 * ReasoningSession —— 一次「推演现场」的存档（M1 收尾）。
 *
 * 为什么不是存整份模型快照：模型会一直编辑，存快照只能看死照片。
 * 会话存的是【当时的场景 + 当时的结论】：放到 reasoning/<id>.json，
 * 下次拿当前模型重放同一个场景，就能回答「昨天那个判断今天还成立吗」。
 * 这正是「架构漂移推演器」（lens-model.md §10.2）的雏形，也是 git 友好的
 * 思考演化史——每次提交都会带上当时为什么这么想。
 */
import type { LensId } from './registry/types';
import type { Finding, FindingSeverity } from './reasoners/types';
import type { TraceHop, TraceReplay } from './trace';
import { newSessionId } from './id';

export const SESSION_SCHEMA_VERSION = 1;

/** 存档里的发现摘要：只留「会不会再顶嘴」需要的最小信息。 */
export interface SessionFinding {
  id: string;
  severity: FindingSeverity;
  title: string;
}

/** 存档里的爆炸半径（仅架构镜片的失效推演有）。 */
export interface SessionBlast {
  failed: number;
  degraded: number;
  affectedEntries: string[];
}

/**
 * 存档里的请求追踪（§2.3）：场景（入口 + 走过的跳 + 注解）+ 当时的结论（累计延迟）。
 * 与 seeds/blast 同一取舍：不存模型快照，重放时逐跳核对「这一跳今天还成立吗」。
 */
export interface SessionTrace {
  entry: string;
  hops: TraceHop[];
  /** 当时的累计延迟（结论，同 blast 的地位）。 */
  latencyMs: number;
}

export interface ReasoningSession {
  schemaVersion: typeof SESSION_SCHEMA_VERSION;
  id: string;
  name: string;
  /** ISO 时间戳（稳定序列化，git diff 可读）。 */
  createdAt: string;
  lens: LensId;
  /** 当时的失效源（场景）。 */
  seeds: string[];
  /** 当时模型给出的发现（error/question/warning/info 摘要）。 */
  findings: SessionFinding[];
  /** 当时的爆炸半径。 */
  blast?: SessionBlast;
  /** 当时的请求追踪（架构镜片）。 */
  trace?: SessionTrace;
}

/** 把推演器的 Finding 压成可存档的摘要。 */
export function snapshotFindings(findings: Finding[]): SessionFinding[] {
  return findings.map((f) => ({ id: f.id, severity: f.severity, title: f.title }));
}

function stamp(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/** 自动取名：有失效场景就用「谁失效」，有追踪就用「谁的请求」，否则用镜片名，都带时间戳。 */
export function sessionName(input: {
  lensLabel: string;
  seedNames: string[];
  traceEntryName?: string;
  now: Date;
}): string {
  const head = input.seedNames.length
    ? `${input.seedNames.join(' + ')} 失效`
    : input.traceEntryName
      ? `${input.traceEntryName} 请求追踪`
      : `${input.lensLabel} 快照`;
  return `${head} · ${stamp(input.now)}`;
}

export function createSession(input: {
  lens: LensId;
  lensLabel: string;
  seeds: string[];
  seedNames: string[];
  findings: Finding[];
  blast?: SessionBlast;
  trace?: SessionTrace;
  traceEntryName?: string;
  now?: Date;
}): ReasoningSession {
  const now = input.now ?? new Date();
  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    id: newSessionId(now.getTime()),
    name: sessionName({ lensLabel: input.lensLabel, seedNames: input.seedNames, traceEntryName: input.traceEntryName, now }),
    createdAt: now.toISOString(),
    lens: input.lens,
    seeds: [...input.seeds],
    findings: snapshotFindings(input.findings),
    ...(input.blast ? { blast: { ...input.blast, affectedEntries: [...input.blast.affectedEntries] } } : {}),
    ...(input.trace
      ? { trace: { entry: input.trace.entry, hops: input.trace.hops.map((h) => ({ ...h })), latencyMs: input.trace.latencyMs } }
      : {}),
  };
}

/** 稳定序列化：固定键序 + 2 空格 + 结尾换行（与 model.json 同一套 git 友好规则）。 */
export function serializeSession(session: ReasoningSession): string {
  const ordered: Record<string, unknown> = {
    schemaVersion: session.schemaVersion,
    id: session.id,
    name: session.name,
    createdAt: session.createdAt,
    lens: session.lens,
    seeds: session.seeds,
    findings: session.findings.map((f) => ({ id: f.id, severity: f.severity, title: f.title })),
  };
  if (session.blast) {
    ordered.blast = {
      failed: session.blast.failed,
      degraded: session.blast.degraded,
      affectedEntries: session.blast.affectedEntries,
    };
  }
  if (session.trace) {
    ordered.trace = {
      entry: session.trace.entry,
      hops: session.trace.hops.map((h) => ({
        edgeId: h.edgeId,
        from: h.from,
        to: h.to,
        ...(h.note ? { note: h.note } : {}),
      })),
      latencyMs: session.trace.latencyMs,
    };
  }
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

/** 解析会话文件；坏文件抛错由调用方跳过（绝不因一个坏存档打不开项目）。 */
export function deserializeSession(text: string): ReasoningSession {
  const raw = JSON.parse(text) as Partial<ReasoningSession>;
  if (raw.schemaVersion !== SESSION_SCHEMA_VERSION) throw new Error('unsupported session schemaVersion');
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string' || typeof raw.createdAt !== 'string') {
    throw new Error('invalid session: missing id/name/createdAt');
  }
  if (raw.lens !== 'architecture' && raw.lens !== 'er' && raw.lens !== 'state-machine') {
    throw new Error('invalid session: bad lens');
  }
  const findings = Array.isArray(raw.findings) ? raw.findings : [];
  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    id: raw.id,
    name: raw.name,
    createdAt: raw.createdAt,
    lens: raw.lens,
    seeds: Array.isArray(raw.seeds) ? raw.seeds.filter((s): s is string => typeof s === 'string') : [],
    findings: findings
      .filter((f) => typeof f?.id === 'string' && typeof f?.title === 'string')
      .map((f) => ({ id: f.id, severity: f.severity ?? 'info', title: f.title })),
    ...(raw.blast && Array.isArray(raw.blast.affectedEntries)
      ? {
          blast: {
            failed: Number(raw.blast.failed) || 0,
            degraded: Number(raw.blast.degraded) || 0,
            affectedEntries: raw.blast.affectedEntries.filter((s): s is string => typeof s === 'string'),
          },
        }
      : {}),
    ...(raw.trace && typeof raw.trace.entry === 'string' && Array.isArray(raw.trace.hops)
      ? {
          trace: {
            entry: raw.trace.entry,
            hops: raw.trace.hops
              .filter((h) => typeof h?.edgeId === 'string' && typeof h?.from === 'string' && typeof h?.to === 'string')
              .map((h) => ({
                edgeId: h.edgeId,
                from: h.from,
                to: h.to,
                ...(typeof h.note === 'string' && h.note ? { note: h.note } : {}),
              })),
            latencyMs: Number(raw.trace.latencyMs) || 0,
          },
        }
      : {}),
  };
}

/** 会话文件名：<id>.json（一会话一文件 → git diff 干净、merge 不打架）。 */
export function sessionFileName(id: string): string {
  return `${id}.json`;
}

/** 现在的结论（用于和存档对账）。 */
export interface SessionNow {
  findings: SessionFinding[];
  blast?: SessionBlast;
  /** 存档含追踪时，用当前模型重放的结果（replayTrace）。 */
  trace?: TraceReplay;
}

export interface SessionDiff {
  /** 现在才出现的发现（模型变差，或者补上了新检查）。 */
  added: SessionFinding[];
  /** 当时有、现在没有的发现（修掉了，或者答案已沉淀）。 */
  resolved: SessionFinding[];
  /** 同一发现严重度变了（如 question 变 error）。 */
  changed: { id: string; title: string; from: FindingSeverity; to: FindingSeverity }[];
  /** 爆炸半径的变化（现在 - 当时）；任一侧没有场景就是 null。 */
  blast: { failed: number; degraded: number; entries: number } | null;
  /** 追踪的对账：断了几跳、延迟差值（现在 - 当时）、入口是否还在。任一侧没有就是 null。 */
  trace: { broken: number; latencyDelta: number; entryMissing: boolean } | null;
}

/** 存档 vs 现在：模型改过之后，这个判断还站得住吗。 */
export function diffSession(session: ReasoningSession, now: SessionNow): SessionDiff {
  const before = new Map(session.findings.map((f) => [f.id, f]));
  const after = new Map(now.findings.map((f) => [f.id, f]));

  const added: SessionFinding[] = [];
  const resolved: SessionFinding[] = [];
  const changed: SessionDiff['changed'] = [];

  for (const [id, f] of after) {
    const old = before.get(id);
    if (!old) added.push(f);
    else if (old.severity !== f.severity) changed.push({ id, title: f.title, from: old.severity, to: f.severity });
  }
  for (const [id, f] of before) {
    if (!after.has(id)) resolved.push(f);
  }

  const blast =
    session.blast && now.blast
      ? {
          failed: now.blast.failed - session.blast.failed,
          degraded: now.blast.degraded - session.blast.degraded,
          entries: now.blast.affectedEntries.length - session.blast.affectedEntries.length,
        }
      : null;

  const trace =
    session.trace && now.trace
      ? {
          broken: now.trace.broken,
          latencyDelta: now.trace.totalLatencyMs - session.trace.latencyMs,
          entryMissing: now.trace.entryMissing,
        }
      : null;

  return { added, resolved, changed, blast, trace };
}

/** 会话列表按时间倒序（新的在上）。 */
export function sortSessions(sessions: ReasoningSession[]): ReasoningSession[] {
  return [...sessions].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}