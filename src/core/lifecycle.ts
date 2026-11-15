/**
 * 状态机镜片按生命周期分scope：架构里有多台状态机时，各看各的状态。
 * 与 ER 按数据库分scope（core/er.ts applyErScope）同构：Lifecycle --contains--> State。
 * Lifecycle 是锚点不投影；scope 条是它在画布上的呈现入口。
 */
import type { Model, ModelEdge, ModelNode } from './types';

/** 状态归属的生命周期 id：Lifecycle --contains--> State。没挂任何机器返回 undefined。 */
export function lifecycleOfState(model: Model, stateId: string): string | undefined {
  for (const e of Object.values(model.edges)) {
    if (e.type === 'contains' && e.to === stateId && model.nodes[e.from]?.type === 'Lifecycle') return e.from;
  }
  return undefined;
}

/** 一台状态机在状态机镜片里的「内容」：它 contains 的状态（按边序）+ 来源实体名。 */
export interface SmMachine {
  id: string;
  name: string;
  stateIds: string[];
  /** 拥有生命周期的实体（has-lifecycle 来源，如 orders 表），scope 条展示用。 */
  ownerName?: string;
}

/** 模型里全部生命周期 + 各自状态清单（有多台机器时，状态机按机器分scope）。 */
export function smMachines(model: Model): SmMachine[] {
  const out: SmMachine[] = [];
  for (const [id, n] of Object.entries(model.nodes)) {
    if (n.type !== 'Lifecycle') continue;
    const stateIds: string[] = [];
    for (const e of Object.values(model.edges)) {
      if (e.type === 'contains' && e.from === id && model.nodes[e.to]?.type === 'State') stateIds.push(e.to);
    }
    let ownerName: string | undefined;
    for (const e of Object.values(model.edges)) {
      if (e.type === 'has-lifecycle' && e.to === id) {
        ownerName = model.nodes[e.from]?.name;
        break;
      }
    }
    out.push({ id, name: n.name, stateIds, ownerName });
  }
  return out;
}

/** 没挂任何生命周期的状态（scope 条里给它们一个「未归属」入口）。 */
export function unassignedStateIds(model: Model): string[] {
  const assigned = new Set(smMachines(model).flatMap((m) => m.stateIds));
  return Object.entries(model.nodes)
    .filter(([id, n]) => n.type === 'State' && !assigned.has(id))
    .map(([id]) => id);
}

export interface SmProjection {
  nodes: Record<string, ModelNode>;
  edges: Record<string, ModelEdge>;
}

/**
 * 状态机按生命周期分scope：'all' 原样；机器 id 只留它的状态；'unassigned' 只留没挂机器的状态。
 * 注释类节点（Note/Decision/Assumption）是全模型注解，任何scope都保留；
 * 边按「两端均在scope内」筛选——跨机器迁移在单机器视图里自动隐藏，回到「全部」才出现。
 */
export function applySmScope(model: Model, proj: SmProjection, scope: string): SmProjection {
  if (scope === 'all') return proj;
  let stateSet: Set<string>;
  if (scope === 'unassigned') {
    stateSet = new Set(unassignedStateIds(model));
  } else {
    const m = smMachines(model).find((x) => x.id === scope);
    if (!m) return proj;
    stateSet = new Set(m.stateIds);
  }
  const nodes: Record<string, ModelNode> = {};
  for (const [id, n] of Object.entries(proj.nodes)) {
    if (n.type !== 'State' || stateSet.has(id)) nodes[id] = n;
  }
  const edges: Record<string, ModelEdge> = {};
  for (const [id, e] of Object.entries(proj.edges)) {
    if (nodes[e.from] && nodes[e.to]) edges[id] = e;
  }
  return { nodes, edges };
}
