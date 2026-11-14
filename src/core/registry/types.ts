/**
 * 类型注册表 + 镜片注册表的契约（数据驱动、开放）。
 * 设计依据：docs/design/lens-model.md §4.2、§4.3。
 * 类型携带镜片归属与意义；推演语义不写在类型里，由镜片推演器按类型分派。
 */
import type { Reasoner } from '../reasoners/types';
import type { EdgeType, NodeType } from '../types';

export type LensId = 'architecture' | 'er' | 'state-machine';

/** 属性软 schema：属性名 → 说明（文档性，不强制校验，延续 vision 决策）。 */
export type SoftSchema = Record<string, string>;

export interface TypeDef {
  id: NodeType;
  label: string;
  /** 镜片归属：该类型在哪几副镜片里被投影。 */
  lenses: LensId[];
  attrs?: SoftSchema;
  edges?: { asSource?: EdgeType[]; asTarget?: EdgeType[] };
}

export interface EdgeTypeDef {
  id: EdgeType;
  label: string;
  lenses: LensId[];
  attrs?: SoftSchema;
}

export interface LensDef {
  id: LensId;
  label: string;
  description: string;
  /** 投影：显示哪些节点类型（边按"两端均在投影内"自动筛选）。 */
  nodeTypes: NodeType[];
  layout: string;
  reasoner: Reasoner;
}