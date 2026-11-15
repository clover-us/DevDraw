/** Store 入口：re-export + 工厂。 */
export * from './types';
export { MemoryStore } from './memory';
export { FsaStore, isFsaSupported, pendingFolder, reconnectPendingFolder } from './fsa';
export { ZipStore, packProject, unpackProject, downloadProject } from './zip';

import { FsaStore, isFsaSupported } from './fsa';
import { MemoryStore } from './memory';
import type { ModelStore } from './types';

/** 启动时尝试恢复上次的 FSA 文件夹；失败回退内存（UI 再引导用户打开/导入）。 */
export async function restoreStore(): Promise<ModelStore> {
  if (isFsaSupported()) {
    try {
      const fsa = await FsaStore.restore();
      if (fsa) return fsa;
    } catch {
      /* 权限被拒/句柄失效 → 回退 */
    }
  }
  return new MemoryStore();
}