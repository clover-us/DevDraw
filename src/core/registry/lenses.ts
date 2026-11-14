/**
 * 镜片注册表（开放、可插拔）。加一副新镜片 = 注册一个 LensDef + 一个推演器，不动底座。
 * 设计依据：docs/design/lens-model.md §4.3。
 * 投影只列节点类型；边按"两端均在投影内"自动筛选（跨镜片胶水边在单镜片视图隐藏，
 * 但推演器读全模型，故跨镜片推理照常进行——这正是护城河）。
 */
import { architectureReasoner } from '../reasoners/architecture';
import { erReasoner } from '../reasoners/er';
import { stateMachineReasoner } from '../reasoners/stateMachine';
import type { LensDef } from './types';

export const LENSES: LensDef[] = [
  {
    id: 'architecture',
    label: '架构',
    description: '服务依赖与失效传播。右键节点设失效源；点边标签改依赖模式。推演器自动标出单点故障。',
    nodeTypes: ['Service', 'Database', 'Queue', 'Endpoint', 'ExternalSystem', 'Actor', 'Decision', 'Assumption', 'Note'],
    layout: 'elk-layered',
    reasoner: architectureReasoner,
  },
  {
    id: 'er',
    label: 'ER',
    description: '表结构与外键基数。字段折进所属表卡片（不再游离）；推演器查外键位置、N:M 中间表、可空孤儿；点字段看改列牵连。',
    // 字段不作为独立画布节点：折进 Table 卡片内部渲染（仍在模型里，推演器读全模型）。
    nodeTypes: ['Table', 'Decision', 'Assumption', 'Note'],
    layout: 'elk-layered',
    reasoner: erReasoner,
  },
  {
    id: 'state-machine',
    label: '状态机',
    description: '实体生命周期。推演器查可达/卡死，跨镜片抓履约缺口，并就缺失迁移反问。',
    nodeTypes: ['State', 'Decision', 'Assumption', 'Note'],
    layout: 'elk-layered',
    reasoner: stateMachineReasoner,
  },
];
