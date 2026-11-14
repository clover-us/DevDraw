/**
 * ModelStore —— 读写层抽象（持久化定调第 1 条：单文件起步 + 可逆拆分）。
 * 当下是单文件实现；将来换拆分/增量实现只改这一个模块，内核/推演器/UI 零改动。
 * 协作的增量同步也挂在这一层。设计依据：lens-model.md §1.3、§2.3。
 */
import type { Model } from '../types';
import type { Views } from '../serialize';
import type { ReasoningSession } from '../session';

/** 一个项目的完整持久化状态（语义 + 视图 + 推演会话）。notes/ 由文件系统直接承载，不进 Store。 */
export interface ProjectSnapshot {
  model: Model;
  views: Views;
  /** 推演会话（reasoning/<id>.json，一会话一文件）。老项目可能没有。 */
  sessions?: ReasoningSession[];
}

/** 存储形态：本地文件夹（FSA 自动保存）/ zip 快照（手动）/ 内存（未持久化）。 */
export type StoreKind = 'folder' | 'zip' | 'memory';

export interface ModelStore {
  /** 存储形态，供 UI 选择图标与解释文案。 */
  readonly kind: StoreKind;
  /** 人类可读的项目标识（文件夹名 / zip 名 / "内存"）。 */
  readonly label: string;
  /** 是否支持自动保存（FSA=true；zip/内存=false，需手动导出）。 */
  readonly autoSave: boolean;
  /** 读取项目；不存在时返回 null。 */
  load(): Promise<ProjectSnapshot | null>;
  /** 写入项目（稳定序列化）。会话不在这里写——它们各自成文件。 */
  save(snapshot: ProjectSnapshot): Promise<void>;
  /** 写入一个推演会话（reasoning/<id>.json）。 */
  saveSession(session: ReasoningSession): Promise<void>;
  /** 删除一个推演会话。 */
  deleteSession(id: string): Promise<void>;
}

/** 空视图（每镜片无布局，UI 回退到手写坐标/默认位）。 */
export function emptyViews(): Views {
  return {};
}
