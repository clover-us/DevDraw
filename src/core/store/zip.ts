/**
 * Zip Store —— 降级路径（非 Chromium / 不想授权文件夹）。
 * zip 里就是标准项目文件夹（model.json + views.json），与 FSA 产出同构：
 * 解压即得一个能用 Obsidian 打开、能 git init 的文件夹。手动快照，非自动保存。
 * 设计依据：持久化定调第 3 条。用 fflate（轻量纯 JS）。
 */
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { deserializeModel, deserializeViews, serializeModel, serializeViews } from '../serialize';
import { deserializeSession, serializeSession, sessionFileName, sortSessions } from '../session';
import type { ReasoningSession } from '../session';
import type { ModelStore, ProjectSnapshot } from './types';

/** 把项目快照打包成 zip 字节（标准文件夹结构，含 reasoning/ 会话）。 */
export function packProject(snapshot: ProjectSnapshot): Uint8Array {
  const files: Record<string, Uint8Array> = {
    'model.json': strToU8(serializeModel(snapshot.model)),
    'views.json': strToU8(serializeViews(snapshot.views)),
  };
  for (const s of snapshot.sessions ?? []) {
    files[`reasoning/${sessionFileName(s.id)}`] = strToU8(serializeSession(s));
  }
  return zipSync(files);
}

/** 从 zip 字节解出项目快照。 */
export function unpackProject(bytes: Uint8Array): ProjectSnapshot {
  const files = unzipSync(bytes);
  const modelText = files['model.json'];
  if (!modelText) throw new Error('invalid project zip: missing model.json');
  const viewsText = files['views.json'];
  const sessions: ReasoningSession[] = [];
  for (const [name, data] of Object.entries(files)) {
    if (!name.startsWith('reasoning/') || !name.endsWith('.json')) continue;
    try {
      sessions.push(deserializeSession(strFromU8(data)));
    } catch {
      // 忽略坏存档
    }
  }
  return {
    model: deserializeModel(strFromU8(modelText)),
    views: viewsText ? deserializeViews(strFromU8(viewsText)) : {},
    sessions: sortSessions(sessions),
  };
}

/** 触发浏览器下载一个 .devdraw.zip。 */
export function downloadProject(snapshot: ProjectSnapshot, filename?: string): void {
  const bytes = packProject(snapshot);
  const blob = new Blob([bytes as BlobPart], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? `${snapshot.model.name || 'devdraw'}.devdraw.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

/** 内存中的 zip 项目（导入后编辑，导出时再打包）。autoSave=false。 */
export class ZipStore implements ModelStore {
  readonly kind = 'zip' as const;
  readonly label: string;
  readonly autoSave = false;
  private snapshot: ProjectSnapshot;

  constructor(snapshot: ProjectSnapshot, label?: string) {
    this.snapshot = structuredClone(snapshot);
    this.label = label ?? `${snapshot.model.name}（zip 快照）`;
  }

  static fromBytes(bytes: Uint8Array, label?: string): ZipStore {
    return new ZipStore(unpackProject(bytes), label);
  }

  async load(): Promise<ProjectSnapshot | null> {
    return this.snapshot;
  }

  async save(snapshot: ProjectSnapshot): Promise<void> {
    this.snapshot = structuredClone(snapshot);
  }

  async saveSession(session: ReasoningSession): Promise<void> {
    const rest = (this.snapshot.sessions ?? []).filter((s) => s.id !== session.id);
    this.snapshot = { ...this.snapshot, sessions: sortSessions([...rest, structuredClone(session)]) };
  }

  async deleteSession(id: string): Promise<void> {
    this.snapshot = { ...this.snapshot, sessions: (this.snapshot.sessions ?? []).filter((s) => s.id !== id) };
  }

  /** 导出当前状态为 zip 下载。 */
  export(): void {
    downloadProject(this.snapshot);
  }
}
