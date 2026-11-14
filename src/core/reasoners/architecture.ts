/**
 * 架构镜片推演器：失效传播（已建 simulate）+ 自动单点故障（SPOF）检测。
 * 设计依据：docs/design/lens-model.md §2.1、core-semantics.md §2。
 * SPOF = 杀掉单个节点即让某入口（Actor/Endpoint）失效，且无冗余兜底。
 */
import { simulate } from '../simulate';
import type { Model, NodeType } from '../types';
import type { Finding, Reasoner } from './types';
import { nodeName } from './util';

/**
 * SPOF 候选 = 架构镜片的运行时基础设施。Table/State 属 ER/状态机镜片（各有推演器），
 * Decision/Assumption/Note 是知识注解，均不作 SPOF 种子。
 * 注意：传播仍读全模型（simulate 用全部边，含跨镜片 reads/writes），故跨镜片影响照常流动；
 * 这里只限定"报告哪些节点为单点"，避免架构画布出现指向不可见表节点的发现。
 */
const SPOF_TYPES = new Set<NodeType>(['Service', 'Database', 'Queue', 'ExternalSystem']);

export const architectureReasoner: Reasoner = {
  id: 'failurePropagation',
  label: '失效传播 / 单点检测',
  run(model: Model): Finding[] {
    const findings: Finding[] = [];
    const isEntry = (id: string): boolean => {
      const t = model.nodes[id]?.type;
      return t === 'Actor' || t === 'Endpoint';
    };
    const hasEntry = Object.keys(model.nodes).some(isEntry);
    if (!hasEntry) return findings;

    for (const [id, node] of Object.entries(model.nodes)) {
      if (isEntry(id) || !SPOF_TYPES.has(node.type)) continue;
      const res = simulate(model, [id]);
      const failedEntries = res.blastRadius.affectedEntries.filter((e) => res.states[e] === 'failed');
      if (failedEntries.length > 0) {
        findings.push({
          id: `spof:${id}`,
          severity: 'warning',
          title: `单点故障：${node.name}`,
          detail: `${node.name} 失效会让入口 ${failedEntries
            .map((e) => nodeName(model, e))
            .join('、')} 不可用，且无冗余兜底。考虑加副本或降级路径。`,
          nodeIds: [id, ...failedEntries],
        });
      }
    }
    return findings;
  },
};
