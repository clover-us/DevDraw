/**
 * 请求追踪端到端集成测试 —— M1 验收演示「下单请求带缓存命中/未命中分支」。
 * 单测各管一个纯函数；这里把 UI 真正编排的整条链路串起来跑一遍：
 * 步进 → 选分支 → 注解 → 沉淀决策 → 存档往返 → 改模型 → 重放对账（§2.3 / §2.6）。
 */
import { describe, expect, it } from 'vitest';
import { sampleModel } from '../sample';
import {
  annotateHop,
  currentNode,
  enumerateTracePaths,
  replayTrace,
  startTrace,
  stepTrace,
  traceBottleneck,
  traceLatency,
  traceOptions,
} from '../trace';
import { createSession, deserializeSession, diffSession, serializeSession } from '../session';
import { findRecord, recordPatch } from '../reasoners/util';
import { applyPatch, applyPatchChecked } from '../patch';
import type { Model } from '../types';

/** 走完「用户 → 网关 → 订单服务」公共前缀，停在缓存分支岔口。 */
function atOrder(m: Model) {
  let s = startTrace(m, 'n_user')!;
  s = stepTrace(m, s, 'e_user_gw')!;
  s = stepTrace(m, s, 'e_gw_order')!;
  return s;
}

describe('请求追踪端到端（M1 验收演示）', () => {
  it('完整链路：步进 → 分支 → 注解 → 沉淀决策 → 存档 → 改模型 → 重放对账', () => {
    const m = structuredClone(sampleModel);

    // 1. 从用户发起，步进到订单服务。
    let s = atOrder(m);
    expect(currentNode(s)).toBe('n_order');

    // 2. 岔口同时列出缓存命中 / 未命中两条分支，各带 when 与依赖模式。
    const opts = traceOptions(m, s);
    const hit = opts.find((o) => o.edgeId === 'e_order_cache')!;
    const miss = opts.find((o) => o.edgeId === 'e_order_db_read')!;
    expect(hit.when).toBe('缓存命中');
    expect(hit.dependency).toBe('soft');
    expect(miss.when).toBe('缓存未命中');

    // 3. 选「未命中」分支，给这一跳写注解；延迟 = 网关 8 + 读库 15。
    s = stepTrace(m, s, 'e_order_db_read')!;
    s = annotateHop(s, s.hops.length - 1, '缓存未命中时这里最慢');
    expect(traceLatency(m, s)).toBe(23);
    expect(traceBottleneck(m, s)!.hop.edgeId).toBe('e_order_db_read');

    // 4. 注解一键沉淀为决策节点（UI recordTraceHop 的同款逻辑），靠 attrs.about 定位。
    const hop = s.hops[s.hops.length - 1];
    const topic = `trace:${hop.edgeId}:Decision`;
    const m2 = applyPatchChecked(m, recordPatch('Decision', 'dec_test', hop.note!, hop.to, topic, '请求追踪沉淀'));
    expect(m2.nodes['dec_test'].type).toBe('Decision');
    expect(m2.nodes['dec_test'].attrs?.about).toBe('n_order_db');
    expect(findRecord(m2, 'n_order_db', topic)?.[0]).toBe('dec_test');

    // 幂等：再记一次只更新不新增，且 update-node 合并 attrs 不丢 about/topic。
    const existing = findRecord(m2, hop.to, topic)!;
    const m3 = applyPatchChecked(m2, { op: 'update-node', id: existing[0], name: '改名', attrs: { detail: '更新' } });
    expect(Object.keys(m3.nodes).filter((id) => m3.nodes[id].type === 'Decision')).toHaveLength(1);
    expect(m3.nodes['dec_test'].attrs?.about).toBe('n_order_db');
    expect(m3.nodes['dec_test'].attrs?.topic).toBe(topic);

    // 5. 存档（场景 + 当时延迟），序列化往返一致，自动命名带「请求追踪」。
    const session = createSession({
      lens: 'architecture',
      lensLabel: '架构',
      seeds: [],
      seedNames: [],
      findings: [],
      trace: { entry: s.entry, hops: s.hops, latencyMs: traceLatency(m, s) },
      traceEntryName: '用户',
      now: new Date('2026-11-15T01:20:00Z'),
    });
    expect(session.name).toContain('用户 请求追踪');
    const restored = deserializeSession(serializeSession(session));
    expect(restored.trace).toEqual(session.trace);

    // 6. 模型演化（删掉未命中那条边）→ 在今天的模型上重放，对账出断跳与延迟变化。
    const evolved = applyPatch(m, { op: 'remove-edge', id: 'e_order_db_read' });
    const replay = replayTrace(evolved, restored.trace!);
    expect(replay.broken).toBe(1);
    expect(replay.hops.find((h) => h.edgeId === 'e_order_db_read')!.status).toBe('missing');
    const diff = diffSession(restored, { findings: [], trace: replay });
    expect(diff.trace!.broken).toBe(1);
    expect(diff.trace!.latencyDelta).toBe(-15); // 断跳不计延迟：23 → 8
  });

  it('缓存命中分支：soft 依赖、落在缓存、延迟 8 + 2', () => {
    const m = structuredClone(sampleModel);
    let s = atOrder(m);
    s = stepTrace(m, s, 'e_order_cache')!;
    expect(currentNode(s)).toBe('n_cache');
    expect(traceLatency(m, s)).toBe(10);
  });

  it('追踪全程是 overlay：模型逐字节不变（§2.2）', () => {
    const m = structuredClone(sampleModel);
    const before = JSON.stringify(m);
    let s = atOrder(m);
    s = stepTrace(m, s, 'e_order_db_read')!;
    s = annotateHop(s, 0, '瓶颈');
    enumerateTracePaths(m, 'n_user');
    traceLatency(m, s);
    traceBottleneck(m, s);
    replayTrace(m, s);
    expect(JSON.stringify(m)).toBe(before);
  });
});
