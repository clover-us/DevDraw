import {
  createDefaultProjects,
  DEFAULT_APP_SETTINGS,
  deserializeWorkspaceFilesToProject,
  serializeProjectToWorkspaceFiles,
  type AppSettings,
  type ProjectDocument,
  type StorageAdapter,
  type WorkspaceDiagnostic,
} from '@devdraw/core';

const PROJECTS_KEY = 'devdraw_studio_projects_v1';
const THEME_KEY = 'devdraw_canvas_theme_v1';
const SETTINGS_KEY = 'devdraw_app_settings_v1';

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// Browser File System Access API minimal types (avoids relying on lib.dom experimental flags)
interface FsWritableStreamLike {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}

interface FsFileHandleLike {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<FsWritableStreamLike>;
}

interface FsDirectoryHandleLike {
  kind: 'directory';
  name: string;
  entries(): AsyncIterableIterator<[string, FsFileHandleLike | FsDirectoryHandleLike]>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FsDirectoryHandleLike>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FsFileHandleLike>;
  removeEntry(name: string): Promise<void>;
}

type WindowWithDirectoryPicker = Window & {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FsDirectoryHandleLike>;
};

export function supportsLocalDirectoryPicker(): boolean {
  if (isTauriRuntime()) return true;
  return (
    typeof window !== 'undefined' &&
    typeof (window as WindowWithDirectoryPicker).showDirectoryPicker === 'function'
  );
}

/**
 * In-memory directory handles for Browser File System Access API mode (`pnpm dev`).
 * Tauri desktop mode persists paths directly via `project.workspacePath`.
 */
const browserDirHandles = new Map<string, FsDirectoryHandleLike>();
let lastBrowserSelfWriteAt = 0;

async function snapshotBrowserDirectoryFingerprint(
  dirHandle: FsDirectoryHandleLike,
  prefix = ''
): Promise<string> {
  const entries: string[] = [];
  for await (const [name, handle] of dirHandle.entries()) {
    if (name === '.git' || name === 'node_modules' || name === 'target') continue;
    const rel = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === 'directory') {
      entries.push(await snapshotBrowserDirectoryFingerprint(handle, rel));
    } else if (
      name.endsWith('.arch') ||
      name === 'project.json' ||
      name === '.arch-layout.json'
    ) {
      const file = await handle.getFile();
      entries.push(`${rel}:${file.size}:${file.lastModified}`);
    }
  }
  return entries.sort().join('|');
}

async function readBrowserDirectoryFiles(
  dirHandle: FsDirectoryHandleLike,
  prefix = ''
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for await (const [name, handle] of dirHandle.entries()) {
    if (name === '.git' || name === 'node_modules' || name === 'target') continue;
    const rel = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === 'directory') {
      const nested = await readBrowserDirectoryFiles(handle, rel);
      Object.assign(result, nested);
    } else if (
      name.endsWith('.arch') ||
      name === 'project.json' ||
      name === '.arch-layout.json'
    ) {
      const file = await handle.getFile();
      result[rel] = await file.text();
    }
  }
  return result;
}

async function writeBrowserDirectoryFiles(
  rootHandle: FsDirectoryHandleLike,
  files: Record<string, string>
): Promise<void> {
  lastBrowserSelfWriteAt = Date.now();
  const expectedLayerFiles = new Set<string>();

  for (const [relPath, content] of Object.entries(files)) {
    const segments = relPath.replace(/\\/g, '/').split('/').filter(Boolean);
    if (segments.length === 0) continue;
    if (segments.length === 2 && segments[0] === 'layers' && segments[1].endsWith('.arch')) {
      expectedLayerFiles.add(segments[1]);
    }

    let currentDir = rootHandle;
    for (let i = 0; i < segments.length - 1; i++) {
      currentDir = await currentDir.getDirectoryHandle(segments[i], { create: true });
    }
    const fileHandle = await currentDir.getFileHandle(segments[segments.length - 1], {
      create: true,
    });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }

    // Clean up orphaned layers/*.arch files
  try {
    const layersDir = await rootHandle.getDirectoryHandle('layers');
    for await (const [name, handle] of layersDir.entries()) {
      if (handle.kind === 'file' && name.endsWith('.arch') && !expectedLayerFiles.has(name)) {
        await layersDir.removeEntry(name);
      }
    }
  } catch {
    // layers/ directory may not exist yet
  }
  lastBrowserSelfWriteAt = Date.now();
}

async function readTauriWorkspaceFiles(rootDir: string): Promise<Record<string, string>> {
  const { invoke } = await import('@tauri-apps/api/core');
  const res = await invoke<{ root: string; files: Record<string, string> }>('read_workspace_dir', {
    root: rootDir,
  });
  return res.files ?? {};
}

async function writeTauriWorkspaceFiles(
  rootDir: string,
  files: Record<string, string>
): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('write_workspace_files', {
    root: rootDir,
    files,
  });
}

async function pickTauriDirectory(title: string): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected = await open({
    directory: true,
    multiple: false,
    title,
  });
  if (typeof selected === 'string' && selected.trim()) {
    return selected;
  }
  return null;
}

/**
 * Dual-mode storage adapter:
 * - Always maintains fast localStorage index for instant launcher startup.
 * - Supports full three-layer Git-friendly directory workspaces (`project.json` +
 *   `layers/*.arch` + `.arch-layout.json`) in BOTH:
 *   1. Tauri v2 desktop runtime (`read_workspace_dir` / `write_workspace_files`)
 *   2. Modern browsers via File System Access API (`showDirectoryPicker`)
 */
export const storageAdapter: StorageAdapter = {
  get mode() {
    return isTauriRuntime() ? 'tauri-fs' : 'local-storage';
  },

  async loadProjects(): Promise<ProjectDocument[]> {
    try {
      const raw = localStorage.getItem(PROJECTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Fallback to starter workspace
    }
    return createDefaultProjects();
  },

  async saveProjects(projects: ProjectDocument[]): Promise<boolean> {
    try {
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
      return true;
    } catch {
      return false;
    }
  },

  async loadTheme(): Promise<'dark' | 'light'> {
    try {
      return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  },

  async saveTheme(theme: 'dark' | 'light'): Promise<void> {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Ignore quota errors
    }
  },

  async loadSettings(): Promise<AppSettings> {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return { ...DEFAULT_APP_SETTINGS, ...parsed };
        }
      }
    } catch {
      // Fallback to default settings
    }
    return { ...DEFAULT_APP_SETTINGS };
  },

  async saveSettings(settings: AppSettings): Promise<void> {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Ignore quota errors
    }
  },

  hasWorkspaceBinding(project: ProjectDocument): boolean {
    if (!project.workspacePath) return false;
    if (isTauriRuntime()) return true;
    return browserDirHandles.has(project.id);
  },

  unbindWorkspaceDirectory(projectId: string): void {
    browserDirHandles.delete(projectId);
  },

  async openWorkspaceDirectory(): Promise<{
    project: ProjectDocument;
    diagnostics: WorkspaceDiagnostic[];
  } | null> {
    if (isTauriRuntime()) {
      const rootDir = await pickTauriDirectory('选择 DevDraw 本地工作区目录');
      if (!rootDir) return null;
      const files = await readTauriWorkspaceFiles(rootDir);
      return deserializeWorkspaceFilesToProject(files, rootDir);
    }

    const picker = (window as WindowWithDirectoryPicker).showDirectoryPicker;
    if (!picker) {
      throw new Error('当前浏览器不支持本地目录 API，请使用 Chrome / Edge 或 Tauri 桌面端');
    }

    try {
      const dirHandle = await picker({ mode: 'readwrite' });
      const files = await readBrowserDirectoryFiles(dirHandle);
      const loaded = deserializeWorkspaceFilesToProject(files, dirHandle.name);
      browserDirHandles.set(loaded.project.id, dirHandle);
      return loaded;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return null;
      throw err;
    }
  },

  async bindWorkspaceDirectory(project: ProjectDocument): Promise<string | null> {
    const files = serializeProjectToWorkspaceFiles(project);

    if (isTauriRuntime()) {
      const rootDir = await pickTauriDirectory('选择要绑定落盘的本地文件夹');
      if (!rootDir) return null;
      await writeTauriWorkspaceFiles(rootDir, files);
      return rootDir;
    }

    const picker = (window as WindowWithDirectoryPicker).showDirectoryPicker;
    if (!picker) {
      throw new Error('当前浏览器不支持本地目录 API，请使用 Chrome / Edge 或 Tauri 桌面端');
    }

    try {
      const dirHandle = await picker({ mode: 'readwrite' });
      await writeBrowserDirectoryFiles(dirHandle, files);
      browserDirHandles.set(project.id, dirHandle);
      return dirHandle.name;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return null;
      throw err;
    }
  },

  async reloadWorkspaceDirectory(project: ProjectDocument): Promise<{
    project: ProjectDocument;
    diagnostics: WorkspaceDiagnostic[];
  } | null> {
    if (isTauriRuntime()) {
      if (!project.workspacePath) return null;
      const files = await readTauriWorkspaceFiles(project.workspacePath);
      const loaded = deserializeWorkspaceFilesToProject(files, project.workspacePath);
      loaded.project.id = project.id;
      return loaded;
    }

    const handle = browserDirHandles.get(project.id);
    if (!handle) return null;
    const files = await readBrowserDirectoryFiles(handle);
    const loaded = deserializeWorkspaceFilesToProject(files, handle.name);
    loaded.project.id = project.id;
    return loaded;
  },

  async syncWorkspaceDirectory(project: ProjectDocument): Promise<boolean> {
    if (!project.workspacePath) return true;
    const files = serializeProjectToWorkspaceFiles(project);

    if (isTauriRuntime()) {
      await writeTauriWorkspaceFiles(project.workspacePath, files);
      return true;
    }

    const handle = browserDirHandles.get(project.id);
    if (!handle) return false;
    await writeBrowserDirectoryFiles(handle, files);
    return true;
  },

  async watchWorkspaceDirectory(
    project: ProjectDocument,
    onExternalChange: () => void
  ): Promise<() => void> {
    if (!project.workspacePath) return () => {};

    if (isTauriRuntime()) {
      const { invoke } = await import('@tauri-apps/api/core');
      const { listen } = await import('@tauri-apps/api/event');

      const unlisten = await listen<string>('workspace-changed', (event) => {
        if (event.payload === project.workspacePath) {
          onExternalChange();
        }
      });

      try {
        await invoke('watch_workspace_dir', { root: project.workspacePath });
      } catch {
        unlisten();
        return () => {};
      }

      return () => {
        unlisten();
        void invoke('unwatch_workspace_dir');
      };
    }

    const handle = browserDirHandles.get(project.id);
    if (!handle) return () => {};

    let stopped = false;
    let prev = await snapshotBrowserDirectoryFingerprint(handle);
    const timer = window.setInterval(async () => {
      if (stopped) return;
      try {
        const next = await snapshotBrowserDirectoryFingerprint(handle);
        if (next !== prev) {
          prev = next;
          if (Date.now() - lastBrowserSelfWriteAt > 1500) {
            onExternalChange();
          }
        }
      } catch {
        // Ignore transient permission or read errors
      }
    }, 1200);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  },

  async exportWorkspaceDirectory(project: ProjectDocument, rootDir: string): Promise<void> {
    if (!isTauriRuntime()) {
      throw new Error('仅在 Tauri 桌面端支持按路径直接写入本地文件夹');
    }
    const files = serializeProjectToWorkspaceFiles(project);
    await writeTauriWorkspaceFiles(rootDir, files);
  },
};
