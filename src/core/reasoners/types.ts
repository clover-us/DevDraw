/**
 * 推演器（Reasoner）契约 —— 每副镜片一个插件，模型统一、推演器 plural。
 * 设计依据：docs/design/lens-model.md §4.3、§9。
 * 推演器是纯函数：读全模型（可跨镜片），产出可解释的 Finding；绝不修改模型。
 * 交互式反问 = severity 'question' 的 Finding + 决策选项（选项携带 applyPatch 补丁）。
 */
import type { Patch } from '../patch';
import type { Model } from '../types';

export type FindingSeverity = 'error' | 'warning' | 'info' | 'question';

export interface QuestionOption {
  id: string;
  label: string;
  description?: string;
  /** 选择后顺序应用的补丁（经 applyPatch，唯一变更咽喉点）。 */
  patches: Patch[];
}

export interface Question {
  prompt: string;
  options: QuestionOption[];
}

export interface Finding {
  id: string;
  severity: FindingSeverity;
  title: string;
  /** 模型"顶嘴"的一句话解释。 */
  detail: string;
  nodeIds?: string[];
  edgeIds?: string[];
  question?: Question;
}

export interface Reasoner {
  id: string;
  label: string;
  /** 读全模型（含跨镜片节点/边），产出发现列表。纯函数。 */
  run(model: Model): Finding[];
}