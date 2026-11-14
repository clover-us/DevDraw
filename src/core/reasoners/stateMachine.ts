/**
 * 状态机镜片推演器：生命周期验证 + 跨镜片缺口 + 交互式反问（零 AI）。
 * 设计依据：docs/design/lens-model.md §2.3、§3.1、§9。
 *
 * 结构检查：不可达状态、卡死（非终态却到不了终态）、终态由"无出边"自动推导。
 * 跨镜片顶嘴：transition.effectedBy 引用的服务若不在架构里 → 履约缺口（Order 卡在 Paid）。
 * 交互式反问：缺失迁移（兄弟状态可取消而 Paid 不可）→ 决策卡片；回答经 applyPatch 落地，
 *           记录为 Decision/Assumption 后模型不再追问（反问沉淀为 ADR）。
 */
import type { Patch } from '../patch';
import type { Model } from '../types';
import type { Finding, Reasoner } from './types';
import { distances, findRecord, hasRecord, nodeName, pushMap, reachable, recordPatch, SEVERITY_RANK } from './util';

interface Transition {
  from: string;
  to: string;
  event?: string;
  effectedBy?: string;
  manual: boolean;
}

interface StateMachine {
  states: string[];
  transitions: Array<[string, Transition]>;
}

function collect(model: Model, lifecycleId: string): StateMachine {
  const states: string[] = [];
  for (const e of Object.values(model.edges)) {
    if (e.type === 'contains' && e.from === lifecycleId && model.nodes[e.to]?.type === 'State') {
      states.push(e.to);
    }
  }
  const stateSet = new Set(states);
  const transitions: Array<[string, Transition]> = [];
  for (const [id, e] of Object.entries(model.edges)) {
    if (e.type === 'transition' && stateSet.has(e.from) && stateSet.has(e.to)) {
      transitions.push([
        id,
        {
          from: e.from,
          to: e.to,
          event: e.attrs?.event,
          effectedBy: e.attrs?.effectedBy,
          manual: e.attrs?.manual === true,
        },
      ]);
    }
  }
  return { states, transitions };
}

export const stateMachineReasoner: Reasoner = {
  id: 'lifecycleVerification',
  label: '生命周期验证 / 反问',
  run(model: Model): Finding[] {
    const findings: Finding[] = [];
    const lifecycles = Object.entries(model.nodes).filter(([, n]) => n.type === 'Lifecycle');

    for (const [lcId, lc] of lifecycles) {
      const sm = collect(model, lcId);
      if (sm.states.length === 0) continue;

      const forward = new Map<string, string[]>();
      const reverse = new Map<string, string[]>();
      const outgoing = new Set<string>();
      for (const [, t] of sm.transitions) {
        pushMap(forward, t.from, t.to);
        pushMap(reverse, t.to, t.from);
        outgoing.add(t.from);
      }
      const terminals = sm.states.filter((s) => !outgoing.has(s));
      const initial = sm.states.find((s) => model.nodes[s]?.attrs?.initial === true) ?? sm.states[0];
      const reachableFromInitial = reachable(forward, [initial]);
      const canReachTerminal = reachable(reverse, terminals);

      findings.push({
        id: `sm:summary:${lcId}`,
        severity: 'info',
        title: lc.name,
        detail: `${sm.states.length} 个状态；初始 ${nodeName(model, initial)}；终态 ${
          terminals.map((t) => nodeName(model, t)).join('、') || '（无）'
        }。`,
        nodeIds: [lcId],
      });

      // 不可达状态
      for (const s of sm.states) {
        if (!reachableFromInitial.has(s)) {
          findings.push({
            id: `sm:unreachable:${s}`,
            severity: 'warning',
            title: `不可达状态：${nodeName(model, s)}`,
            detail: `从初始状态 ${nodeName(model, initial)} 出发到不了 ${nodeName(model, s)}，缺少进入它的迁移。`,
            nodeIds: [s],
          });
        }
      }

      // 卡死：非终态却到不了任何终态
      for (const s of sm.states) {
        if (reachableFromInitial.has(s) && !terminals.includes(s) && !canReachTerminal.has(s)) {
          findings.push({
            id: `sm:deadlock:${s}`,
            severity: 'warning',
            title: `可能卡死：${nodeName(model, s)}`,
            detail: `${nodeName(model, s)} 不是终态，却到不了任何终态，订单可能永远卡在这里。`,
            nodeIds: [s],
          });
        }
      }

      // 跨镜片缺口：迁移引用的服务不存在于架构
      const gapByService = new Map<string, Array<[string, Transition]>>();
      for (const [tid, t] of sm.transitions) {
        if (t.effectedBy && !t.manual && !model.nodes[t.effectedBy]) {
          const list = gapByService.get(t.effectedBy) ?? [];
          list.push([tid, t]);
          gapByService.set(t.effectedBy, list);
        }
      }
      for (const [serviceId, list] of gapByService) {
        const events = list.map(([, t]) => t.event ?? '?').join(' / ');
        const stuckAt = [...new Set(list.map(([, t]) => t.from))].map((s) => nodeName(model, s)).join('、');
        const edgeIds = list.map(([tid]) => tid);
        const nodeIds = [...new Set(list.flatMap(([, t]) => [t.from, t.to]))];
        const topic = `gap:${serviceId}`;
        const friendly = serviceId === 'n_fulfillment' ? '履约服务' : serviceId;
        const finding: Finding = {
          id: `sm:gap:${serviceId}`,
          severity: 'error',
          title: `跨镜片缺口：架构缺少「${friendly}」`,
          detail: `迁移 ${events} 假设了一个「${friendly}」能力，但架构镜片里没有这个服务。依赖它的状态无法推进——Order 会永远卡在 ${stuckAt}。`,
          nodeIds,
          edgeIds,
        };
        if (!hasRecord(model, lcId, topic)) {
          finding.question = {
            prompt: `如何补齐「${friendly}」能力？`,
            options: [
              {
                id: 'add-service',
                label: `在架构中新增${friendly}`,
                description: '新增服务节点，迁移引用即被满足（可去架构镜片连上调用边）。',
                patches: [{ op: 'add-node', id: serviceId, node: { type: 'Service', name: friendly } }],
              },
              {
                id: 'manual',
                label: '改为人工履约',
                description: '标记这些迁移为人工，不再要求服务实现。',
                patches: [
                  ...edgeIds.map((eid): Patch => ({ op: 'update-edge', id: eid, attrs: { manual: true } })),
                  recordPatch('Decision', `dec_manual_${serviceId}`, `${friendly}由人工完成`, lcId, topic, '履约暂由人工操作，后续再服务化。'),
                ],
              },
              {
                id: 'assume',
                label: '记录为待定假设',
                description: '先记下这个缺口，不立即修复（缺口仍在）。',
                patches: [
                  recordPatch('Assumption', `asm_gap_${serviceId}`, `${friendly}能力待实现`, lcId, topic, '生命周期假设了履约能力，架构尚未提供。'),
                ],
              },
            ],
          };
        }
        findings.push(finding);
      }

      // 缺失迁移反问：兄弟状态可取消，而某状态不可
      const cancelTerminals = terminals.filter((t) => /cancel/i.test(nodeName(model, t)) || /取消/.test(nodeName(model, t)));
      for (const T of cancelTerminals) {
        const reachT = reachable(reverse, [T]);
        const nonTerminal = sm.states.filter((s) => !terminals.includes(s));
        const canCancel = nonTerminal.filter((s) => reachT.has(s));
        const cannotCancel = nonTerminal.filter((s) => !reachT.has(s));
        if (canCancel.length === 0 || cannotCancel.length === 0) continue;

        const dist = distances(forward, initial);
        const headline = cannotCancel.slice().sort((a, b) => (dist.get(a) ?? 999) - (dist.get(b) ?? 999))[0];
        const topic = 'cancel-reachability';
        const rec = findRecord(model, headline, topic);
        if (rec) {
          findings.push({
            id: `sm:cancel-decided:${headline}`,
            severity: 'info',
            title: `已记录决策：${rec[1].name}`,
            detail: `${nodeName(model, headline)} 的取消策略已确认为有意设计，模型不再追问。`,
            nodeIds: [headline, rec[0]],
          });
          continue;
        }
        const others = cannotCancel.filter((s) => s !== headline).map((s) => nodeName(model, s));
        findings.push({
          id: `sm:cancel:${T}:${headline}`,
          severity: 'question',
          title: `缺失迁移：${nodeName(model, headline)} 能否取消？`,
          detail: `${nodeName(model, headline)} 没有到 ${nodeName(model, T)} 的路径，而 ${nodeName(model, canCancel[0])} 可以。${nodeName(model, headline)} 之后不可取消是有意设计吗？${others.length > 0 ? `（同样无法取消：${others.join('、')}）` : ''}`,
          nodeIds: [headline, T],
          question: {
            prompt: `${nodeName(model, headline)} 该不该能取消？`,
            options: [
              {
                id: 'allow',
                label: `允许 ${nodeName(model, headline)} 取消`,
                description: `新增 ${nodeName(model, headline)} → ${nodeName(model, T)} 迁移。`,
                patches: [
                  { op: 'add-edge', id: `tr_cancel_${headline}`, edge: { type: 'transition', from: headline, to: T, attrs: { event: `cancel_${headline}` } } },
                ],
              },
              {
                id: 'forbid',
                label: '维持不可取消（记录决策）',
                description: '记录为有意决策（ADR），模型不再追问。',
                patches: [
                  recordPatch('Decision', `dec_cancel_${headline}`, `${nodeName(model, headline)} 不可取消（有意）`, headline, topic, '已支付后不允许直接取消，需走退款流程。'),
                ],
              },
              {
                id: 'pending',
                label: '待定',
                description: '先记为假设，稍后决定。',
                patches: [
                  recordPatch('Assumption', `asm_cancel_${headline}`, `${nodeName(model, headline)} 取消策略待定`, headline, topic, '尚未决定是否允许取消。'),
                ],
              },
            ],
          },
        });
      }
    }

    return findings.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  },
};
