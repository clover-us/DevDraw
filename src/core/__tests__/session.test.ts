import { describe, expect, it } from 'vitest';
import {
  createSession,
  deserializeSession,
  diffSession,
  serializeSession,
  sessionFileName,
  sortSessions,
  type ReasoningSession,
} from '../session';
import type { Finding } from '../reasoners/types';
import { MemoryStore } from '../store/memory';
import { packProject, unpackProject } from '../store/zip';
import { sampleThreeLensModel } from '../sample-three-lens';
import { deserializeViews, serializeViews } from '../serialize';

const finding = (id: string, severity: Finding['severity'], title: string): Finding => ({
  id,
  severity,
  title,
  detail: `${title} 的解释`,
});

const base = {
  lens: 'architecture' as const,
  lensLabel: '架构',
  seeds: ['n_payment'],
  seedNames: ['支付服务'],
  findings: [finding('spof:n_order', 'warning', '单点故障：订单服务')],
  blast: { failed: 3, degraded: 1, affectedEntries: ['n_user'] },
};

describe('会话存档', () => {
  it('自动命名带场景与时间戳', () => {
    const s = createSession({ ...base, now: new Date('2026-11-15T01:20:00') });
    expect(s.name).toBe('支付服务 失效 · 11-15 01:20');
    expect(s.id.startsWith('ses_')).toBe(true);
    expect(s.createdAt).toBe(new Date('2026-11-15T01:20:00').toISOString());
  });

  it('无场景时用镜片名命名', () => {
    const s = createSession({ ...base, seeds: [], seedNames: [], now: new Date('2026-11-15T01:20:00') });
    expect(s.name).toBe('架构 快照 · 11-15 01:20');
  });

  it('稳定序列化：固定键序 + 结尾换行 + 往返一致', () => {
    const s = createSession({ ...base, now: new Date('2026-11-15T01:20:00') });
    const text = serializeSession(s);
    expect(text.endsWith('\n')).toBe(true);
    const keys = Object.keys(JSON.parse(text) as Record<string, unknown>);
    expect(keys).toEqual(['schemaVersion', 'id', 'name', 'createdAt', 'lens', 'seeds', 'findings', 'blast']);
    expect(deserializeSession(text)).toEqual(s);
  });

  it('坏存档抛错（由 store 跳过，不打不开项目）', () => {
    expect(() => deserializeSession(JSON.stringify({ schemaVersion: 9 }))).toThrow(/schemaVersion/);
    expect(() => deserializeSession(JSON.stringify({ schemaVersion: 1, id: 'x' }))).toThrow(/missing/);
  });

  it('文件名 = id.json（一会话一文件，git diff 干净）', () => {
    expect(sessionFileName('ses_ABC')).toBe('ses_ABC.json');
  });

  it('按时间倒序', () => {
    const a: ReasoningSession = { ...createSession(base), createdAt: '2026-01-01T00:00:00.000Z' };
    const b: ReasoningSession = { ...createSession(base), createdAt: '2026-02-01T00:00:00.000Z' };
    expect(sortSessions([a, b]).map((s) => s.id)).toEqual([b.id, a.id]);
  });
});

describe('当时 → 现在对账', () => {
  const session = createSession({
    ...base,
    findings: [
      finding('spof:n_order', 'warning', '单点故障：订单服务'),
      finding('sm:gap:n_fulfillment', 'error', '履约服务不存在'),
      finding('erm:nullable:f_x', 'question', '外键可空'),
    ],
    now: new Date('2026-11-15T01:20:00'),
  });

  it('识别新增 / 修掉 / 严重度变化', () => {
    const diff = diffSession(session, {
      findings: [
        // 仍在，但降级成 info（答过反问 → 沉淀决策）
        { id: 'erm:nullable:f_x', severity: 'info', title: '外键可空' },
        // 新增
        { id: 'spof:n_new', severity: 'error', title: '单点故障：新服务' },
      ],
      blast: { failed: 5, degraded: 1, affectedEntries: ['n_user', 'n_ops'] },
    });
    expect(diff.added.map((f) => f.id)).toEqual(['spof:n_new']);
    expect(diff.resolved.map((f) => f.id).sort()).toEqual(['sm:gap:n_fulfillment', 'spof:n_order']);
    expect(diff.changed).toEqual([{ id: 'erm:nullable:f_x', title: '外键可空', from: 'question', to: 'info' }]);
    expect(diff.blast).toEqual({ failed: 2, degraded: 0, entries: 1 });
  });

  it('没有场景时 blast 对账为 null', () => {
    const noBlast = createSession({ ...base, blast: undefined });
    const diff = diffSession(noBlast, { findings: [] });
    expect(diff.blast).toBeNull();
  });
});

describe('会话存储', () => {
  it('MemoryStore 立即落盘并可删除', async () => {
    const store = new MemoryStore({ model: sampleThreeLensModel, views: {} });
    const s = createSession(base);
    await store.saveSession(s);
    expect((await store.load())?.sessions?.map((x) => x.id)).toEqual([s.id]);
    await store.deleteSession(s.id);
    expect((await store.load())?.sessions).toEqual([]);
  });

  it('zip 打包/解包带上 reasoning/ 会话，且同构可逆', () => {
    const s = createSession(base);
    const bytes = packProject({ model: sampleThreeLensModel, views: {}, sessions: [s] });
    const back = unpackProject(bytes);
    expect(back.sessions?.map((x) => x.id)).toEqual([s.id]);
    expect(back.model.name).toBe(sampleThreeLensModel.name);
  });

  it('没有会话的老 zip 也能读（sessions 为空）', () => {
    const bytes = packProject({ model: sampleThreeLensModel, views: {} });
    expect(unpackProject(bytes).sessions).toEqual([]);
  });

  it('场景（seeds）随 views.json 持久化，刷新不丢', () => {
    const views = { architecture: { positions: { n_payment: { x: 1, y: 2 } }, seeds: ['n_payment'] } };
    const text = serializeViews(views);
    expect(deserializeViews(text)).toEqual(views);
  });
});