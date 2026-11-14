/**
 * ModelStore —— 读写层抽象（持久化定调第 1 条：单文件起步 + 可逆拆分）。
 * 当下是单文件实现；将来换拆分/增量实现只改这一个模块，内核/推演器/UI 零改动。
 * 协作的增量同步也挂在这一层。设计依据：lens-model.md §1.3、§2.3。
 */
import type { Model } from '../types';
import type { Views } from '../serialize';

/** 一个项目的完整持久化状态（语义 + 视图）。notes/ 由文件系统直接承载，不进 Store。 */
export interface ProjectSnapshot {
  model: Model;
  views: Views;
}

export interface ModelStore {
  /** 人类可读的项目标识（文件夹名 / zip 名 / "内存"）。 */
  readonly label: string;
  /** 是否支持自动保存（FSA=true；zip/内存=false，需手动导出）。 */
  readonly autoSave: boolean;
  /** 读取项目；不存在时返回 null。 */
  load(): Promise<ProjectSnapshot | null>;
  /** 写入项目（稳定序列化）。 */
  save(snapshot: ProjectSnapshot): Promise<void>;
}

/** 空视图（每镜片无布局，UI 回退到手写坐标/默认位）。 */
export function emptyViews(): Views {
  return {};
}
