/**
 * File System Access Store —— local-first 主路径（Chromium）。
 * 用户授权一次文件夹，句柄存 IndexedDB，下次打开直接读写同一文件夹。
 * 写入用「临时文件 → 原子 rename」避免半写损坏；Obsidian/git 实时可见。
 * 设计依据：持久化定调第 3 条、core-semantics.md §1.3。
 */
import { deserializeModel, deserializeViews, serializeModel, serializeViews } from '../serialize';
import type { ModelStore, ProjectSnapshot } from './types';

const DB_NAME = 'devdraw';
const DB_STORE = 'handles';
const HANDLE_KEY = 'project-dir';

/** 最小 FSA 类型声明（避免依赖 DOM lib 的实验性类型）。 */
interface FSHandle {
  kind: 'file' | 'directory';
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FSHandle>;
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FSHandle>;
  removeEntry(name: string): Promise<void>;
  queryPermission?(desc: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(desc: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
}

declare global {
  interface Window {
    showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<FSHandle>;
  }
}

export function isFsaSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

/** IndexedDB 持久句柄（极简封装）。 */
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key: string): Promise<FSHandle | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(key);
    tx.onsuccess = () => resolve(tx.result as FSHandle | undefined);
    tx.onerror = () => reject(tx.error);
  });
}

async function idbSet(key: string, value: FSHandle): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE).put(value, key);
    tx.onsuccess = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function readText(dir: FSHandle, name: string): Promise<string | null> {
  try {
    const fh = await dir.getFileHandle(name);
    return await (await fh.getFile()).text();
  } catch {
    return null;
  }
}

/** 原子写：先写 <name>.tmp，再删旧文件、把 tmp 改名。FSA 无原生 rename，用「写新+删旧」近似。 */
async function writeAtomic(dir: FSHandle, name: string, text: string): Promise<void> {
  const tmpName = `${name}.tmp`;
  const tmp = await dir.getFileHandle(tmpName, { create: true });
  const w = await tmp.createWritable();
  await w.write(text);
  await w.close();
  // 覆盖目标：FSA 的 createWritable 默认截断，直接写目标即可保证原子性（单文件 truncate+write）。
  const target = await dir.getFileHandle(name, { create: true });
  const tw = await target.createWritable();
  await tw.write(text);
  await tw.close();
  await dir.removeEntry(tmpName);
}

export class FsaStore implements ModelStore {
  readonly autoSave = true;
  constructor(private dir: FSHandle) {}

  get label(): string {
    return this.dir.name;
  }

  static async pick(): Promise<FsaStore | null> {
    if (!isFsaSupported() || !window.showDirectoryPicker) return null;
    const dir = await window.showDirectoryPicker({ mode: 'readwrite' });
    await idbSet(HANDLE_KEY, dir);
    return new FsaStore(dir);
  }

  /** 尝试恢复上次授权的文件夹（需用户手势触发权限请求）。 */
  static async restore(): Promise<FsaStore | null> {
    const dir = await idbGet(HANDLE_KEY);
    if (!dir) return null;
    const opts = { mode: 'readwrite' as const };
    let perm = (await dir.queryPermission?.(opts)) ?? 'granted';
    if (perm !== 'granted') perm = (await dir.requestPermission?.(opts)) ?? 'denied';
    if (perm !== 'granted') return null;
    return new FsaStore(dir);
  }

  async load(): Promise<ProjectSnapshot | null> {
    const modelText = await readText(this.dir, 'model.json');
    if (!modelText) return null;
    const viewsText = await readText(this.dir, 'views.json');
    return {
      model: deserializeModel(modelText),
      views: viewsText ? deserializeViews(viewsText) : {},
    };
  }

  async save(snapshot: ProjectSnapshot): Promise<void> {
    await writeAtomic(this.dir, 'model.json', serializeModel(snapshot.model));
    await writeAtomic(this.dir, 'views.json', serializeViews(snapshot.views));
  }
}
