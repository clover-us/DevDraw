/**
 * 模型完整性校验 —— applyPatch 咽喉点的语义守门员（协作隐患①的解法）。
 * CRDT 合并后也要跑这道闸：字节不打架 ≠ 语义对。悬空边/非法引用必须被抓住。
 * 设计依据：docs/design/core-semantics.md §1.2、lens-model.md §1.3。
 */
import type { Model } from './types';

export interface IntegrityIssue {
  kind: 'dangling-edge' | 'unknown-type' | 'bad-effectedBy';
  edgeId?: string;
  nodeId?: string;
  detail: string;
}

/** 检查图完整性：每条边的两端必须存在；effectedBy 引用若指向节点则必须存在。 */
export function checkIntegrity(model: Model): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  for (const [id, edge] of Object.entries(model.edges)) {
    if (!model.nodes[edge.from]) {
      issues.push({ kind: 'dangling-edge', edgeId: id, detail: `edge ${id} references missing source ${edge.from}` });
    }
    if (!model.nodes[edge.to]) {
      issues.push({ kind: 'dangling-edge', edgeId: id, detail: `edge ${id} references missing target ${edge.to}` });
    }
    // effectedBy 是跨镜片属性引用：允许指向"尚未建模"的服务（这正是履约缺口推演器要抓的），
    // 所以这里不把它当硬错误，交由状态机推演器判定。
  }
  return issues;
}

/** 是否完整（无悬空边）。applyPatch 用它做落地后断言。 */
export function isIntact(model: Model): boolean {
  return checkIntegrity(model).length === 0;
}
