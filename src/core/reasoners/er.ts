/**
 * ER 镜片推演器：模式影响 + 基数一致性（三条确定性结构检查，零 AI）。
 * 设计依据：docs/design/lens-model.md §2.2、§8。
 *  1. 外键位置 vs 基数：1:N 的外键列必须落在"多"方表。
 *  2. N:M 必须有中间表：直连非法。
 *  3. 可选性 / 孤儿：可空外键允许孤儿记录 → 交互式反问。
 */
import type { Model, ModelNode } from '../types';
import type { Finding, Reasoner } from './types';
import { hasRecord, recordPatch, SEVERITY_RANK } from './util';

/** 某表通过 contains 拥有的字段。 */
function fieldsOf(model: Model, tableId: string): Array<[string, ModelNode]> {
  const out: Array<[string, ModelNode]> = [];
  for (const e of Object.values(model.edges)) {
    if (e.type === 'contains' && e.from === tableId) {
      const n = model.nodes[e.to];
      if (n?.type === 'Field') out.push([e.to, n]);
    }
  }
  return out;
}

/** 改/删一列的牵连：哪些外键引用了它、牵连哪些表。（UI 选中字段时展示） */
export function columnImpact(model: Model, fieldId: string): { edgeIds: string[]; tableIds: string[] } {
  const field = model.nodes[fieldId];
  if (!field || field.type !== 'Field') return { edgeIds: [], tableIds: [] };
  const owner = Object.values(model.edges).find((e) => e.type === 'contains' && e.to === fieldId)?.from;
  const edgeIds: string[] = [];
  const tableIds = new Set<string>();
  for (const [id, e] of Object.entries(model.edges)) {
    if (e.type === 'fk' && e.attrs?.key === field.name && (owner ? e.to === owner : true)) {
      edgeIds.push(id);
      tableIds.add(e.from);
    }
  }
  return { edgeIds, tableIds: [...tableIds] };
}

export const erReasoner: Reasoner = {
  id: 'schemaImpact',
  label: '模式影响 / 基数一致性',
  run(model: Model): Finding[] {
    const findings: Finding[] = [];
    for (const [edgeId, e] of Object.entries(model.edges)) {
      if (e.type !== 'fk') continue;
      const from = model.nodes[e.from];
      const to = model.nodes[e.to];
      if (!from || !to) continue;
      const card = e.attrs?.cardinality;
      const key = e.attrs?.key;

      // 检查 2：N:M 直连缺少中间表
      if (card === 'N:M') {
        findings.push({
          id: `erm:nm:${edgeId}`,
          severity: 'error',
          title: `N:M 直连缺少中间表：${from.name} ↔ ${to.name}`,
          detail: `${from.name} 与 ${to.name} 声明为 N:M，但单外键只能表达 1:N。需要中间表承载多对多——例如 order_items 即 orders↔products 的中间表，建议改为 orders 1—N order_items N—1 products。`,
          nodeIds: [e.from, e.to],
          edgeIds: [edgeId],
        });
        continue;
      }

      if ((card === '1:N' || card === '1:1') && key) {
        const fields = fieldsOf(model, e.to);
        // 检查 1：外键位置——key 列必须在"多"方表
        const keyField = fields.find(([, f]) => f.name === key);
        if (!keyField) {
          findings.push({
            id: `erm:fkpos:${edgeId}`,
            severity: 'error',
            title: `外键位置错误：${key} 应在 ${to.name}`,
            detail: `${from.name} 1—N ${to.name} 的外键 ${key} 必须落在"多"方 ${to.name}，但在 ${to.name} 找不到该列。若放进 ${from.name}，每条 ${from.name} 只能存一个 ${key}，表达不了一对多。`,
            nodeIds: [e.from, e.to],
            edgeIds: [edgeId],
          });
        }
        // 检查 3：可空外键 → 孤儿记录反问
        if (keyField && keyField[1].attrs?.nullable === true) {
          const [fieldId] = keyField;
          if (!hasRecord(model, fieldId, 'nullable-fk')) {
            findings.push({
              id: `erm:nullable:${fieldId}`,
              severity: 'question',
              title: `可空外键：${to.name}.${key}`,
              detail: `${to.name}.${key} 可空 ⇒ 允许没有 ${from.name} 的 ${to.name}（孤儿记录）。这是有意设计吗？`,
              nodeIds: [fieldId, e.to, e.from],
              edgeIds: [edgeId],
              question: {
                prompt: `${to.name}.${key} 是否允许为空？`,
                options: [
                  {
                    id: 'notnull',
                    label: '改为必填（NOT NULL）',
                    description: '禁止孤儿记录。',
                    patches: [{ op: 'update-node', id: fieldId, attrs: { nullable: false } }],
                  },
                  {
                    id: 'keep',
                    label: '保留可空（记录决策）',
                    description: '记录为有意决策，模型不再追问。',
                    patches: [
                      recordPatch(
                        'Decision',
                        `dec_nullable_${fieldId}`,
                        `${to.name}.${key} 可空（有意）`,
                        fieldId,
                        'nullable-fk',
                        '允许孤儿记录，业务上可接受。',
                      ),
                    ],
                  },
                ],
              },
            });
          }
        }
      }
    }
    return findings.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  },
};
