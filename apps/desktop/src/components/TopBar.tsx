import React, { useState } from 'react';
import {
  ArrowLeft,
  Code2,
  Download,
  FolderGit2,
  FolderSync,
  GitCommitHorizontal,
  MousePointer2,
  PenTool,
  Play,
  Redo2,
  RefreshCw,
  Search,
  Share,
  Square,
  Undo2,
} from 'lucide-react';
import { isTauriRuntime, storageAdapter } from '../storage/adapter';
import { useWorkbenchStore } from '../store/useWorkbenchStore';
import { WindowControls } from './WindowControls';

function getWorkspaceLabel(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || path;
}

export const TopBar: React.FC = () => {
  const {
    projects,
    activeProjectId,
    activeTool,
    saveState,
    dslSplitOpen,
    simulating,
    historyIndex,
    history,
    returnToLauncher,
    renameActiveProject,
    bindActiveProjectToFolder,
    reloadWorkspaceFolder,
    setTool,
    undo,
    redo,
    toggleDslSplit,
    toggleSimulation,
    setExportModalOpen,
    setImportModalOpen,
    setCommandPaletteOpen,
  } = useWorkbenchStore();

  const project = projects.find((p) => p.id === activeProjectId);
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');

  if (!project) return null;

  const isBoundLive = Boolean(storageAdapter.hasWorkspaceBinding?.(project));

  const startRename = () => {
    setDraftTitle(project.title);
    setRenaming(true);
  };

  const commitRename = () => {
    setRenaming(false);
    if (draftTitle.trim() && draftTitle.trim() !== project.title) {
      renameActiveProject(draftTitle.trim());
    }
  };

  return (
    <header
      data-tauri-drag-region
      className="h-11 px-3 sm:px-4 flex items-center gap-2 border-b bg-[var(--dd-bg-shell)] border-[var(--dd-border-subtle)] z-30 shrink-0 select-none"
    >
      {/* Left: Return + 3-state Save Indicator + Inline Rename */}
      <div
        data-tauri-drag-region
        className="flex-1 min-w-0 flex items-center gap-2"
      >
        <button
          type="button"
          onClick={returnToLauncher}
          title="返回导航首页 (Esc)"
          className="h-7 flex items-center gap-1.5 px-2.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-[var(--dd-border-subtle)] text-xs font-medium whitespace-nowrap shrink-0 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-violet-400 shrink-0" />
          <span className="hidden sm:inline">导航首页</span>
        </button>

        <div className="h-4 w-px bg-[var(--dd-border-subtle)] shrink-0" />

        <div className="flex items-center gap-2 min-w-0">
          <span className="flex items-center gap-1.5 shrink-0 whitespace-nowrap" title="本地持久化状态">
            <span
              className={`w-2 h-2 rounded-full ${
                saveState === 'error'
                  ? 'bg-rose-400'
                  : saveState === 'saving'
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-emerald-400'
              }`}
            />
            <span className="hidden xl:inline text-[10px] font-mono text-[var(--dd-text-muted)]">
              {saveState === 'error' ? '保存失败' : saveState === 'saving' ? '保存中' : '已保存'}
            </span>
          </span>

          {renaming ? (
            <input
              autoFocus
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setRenaming(false);
              }}
              className="text-xs sm:text-[13px] font-semibold bg-transparent border-b border-violet-400/70 outline-none px-0.5 w-44"
            />
          ) : (
            <h2
              onDoubleClick={startRename}
              title="双击重命名项目"
              className="text-xs sm:text-[13px] font-semibold truncate max-w-[140px] lg:max-w-[200px] cursor-text hover:text-violet-400 transition-colors"
            >
              {project.title}
            </h2>
          )}

          {project.workspacePath ? (
            <div className="hidden md:flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => void bindActiveProjectToFolder()}
                title={
                  isBoundLive
                    ? `已自动同步至本地目录：${project.workspacePath}（点击切换目录）`
                    : `本地目录 ${project.workspacePath} 需要重新授权写入（点击重新绑定）`
                }
                className={`h-6 inline-flex items-center gap-1 px-2 rounded-md border text-[10.5px] font-mono whitespace-nowrap transition-colors ${
                  isBoundLive
                    ? 'bg-emerald-500/12 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                    : 'bg-amber-500/12 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
                }`}
              >
                <FolderGit2 className="w-3 h-3 shrink-0" />
                <span className="max-w-[88px] truncate">
                  {getWorkspaceLabel(project.workspacePath)}
                </span>
              </button>
              {isBoundLive && (
                <button
                  type="button"
                  onClick={() => void reloadWorkspaceFolder()}
                  title="从磁盘重新加载最新 .arch 与布局文件"
                  className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--dd-text-secondary)] hover:text-emerald-300 hover:bg-white/[0.08] transition-colors shrink-0"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void bindActiveProjectToFolder()}
              title="绑定到本地文件夹，自动落盘 project.json + layers/*.arch + .arch-layout.json"
              className="hidden 2xl:inline-flex h-6 items-center gap-1 px-2 rounded-md bg-white/[0.04] hover:bg-white/[0.09] border border-[var(--dd-border-subtle)] text-[10.5px] text-[var(--dd-text-secondary)] hover:text-emerald-300 whitespace-nowrap transition-colors shrink-0"
            >
              <FolderSync className="w-3 h-3 text-emerald-400 shrink-0" />
              <span>绑定目录</span>
            </button>
          )}
        </div>
      </div>

      {/* Center: Pure Mode Switcher (Select / Connect / Freehand) */}
      <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-[var(--dd-bg-elevated)] border border-[var(--dd-border-subtle)] shrink-0">
        <button
          type="button"
          onClick={() => setTool('select')}
          title="选择与拖拽平移 (V)"
          className={`h-7 flex items-center gap-1.5 px-2.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
            activeTool === 'select'
              ? 'bg-violet-600 text-white'
              : 'text-[var(--dd-text-secondary)] hover:bg-white/[0.06]'
          }`}
        >
          <MousePointer2 className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden lg:inline">选择</span>
        </button>
        <button
          type="button"
          onClick={() => setTool('connect')}
          title="推演连线模式 (L)"
          className={`h-7 flex items-center gap-1.5 px-2.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
            activeTool === 'connect'
              ? 'bg-violet-600 text-white'
              : 'text-[var(--dd-text-secondary)] hover:bg-white/[0.06]'
          }`}
        >
          <GitCommitHorizontal className="w-3.5 h-3.5 text-violet-400 shrink-0" />
          <span className="hidden lg:inline">推演连线</span>
        </button>
        <button
          type="button"
          onClick={() => setTool('draw')}
          title="自由落绘草图 (P)"
          className={`h-7 flex items-center gap-1.5 px-2.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
            activeTool === 'draw'
              ? 'bg-violet-600 text-white'
              : 'text-[var(--dd-text-secondary)] hover:bg-white/[0.06]'
          }`}
        >
          <PenTool className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="hidden lg:inline">自由落绘</span>
        </button>
      </div>

      {/* Right: Undo/Redo + DSL Split + Run Flow + Import/Export + Window Controls */}
      <div
        data-tauri-drag-region
        className="flex-1 min-w-0 flex items-center justify-end gap-1.5"
      >
        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          title="全局命令面板与实体搜索定位 (Ctrl+K)"
          className="h-7 flex items-center gap-1 px-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-[var(--dd-border-subtle)] text-[var(--dd-text-secondary)] hover:text-violet-300 text-[11px] font-mono whitespace-nowrap shrink-0 transition-colors"
        >
          <Search className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden 2xl:inline">Ctrl+K</span>
        </button>

        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={undo}
            disabled={historyIndex <= 0}
            title="撤销 (Ctrl+Z)"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--dd-text-secondary)] hover:bg-white/[0.08] disabled:opacity-30 transition-colors"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
            title="重做 (Ctrl+Y)"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--dd-text-secondary)] hover:bg-white/[0.08] disabled:opacity-30 transition-colors"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="h-4 w-px bg-[var(--dd-border-subtle)] shrink-0" />

        <button
          type="button"
          onClick={toggleDslSplit}
          title="切换图码双向 .arch DSL 编辑器 (Ctrl+\)"
          className={`h-7 flex items-center gap-1.5 px-2.5 rounded-lg border text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
            dslSplitOpen
              ? 'bg-violet-500/20 border-violet-400/50 text-violet-300'
              : 'bg-white/[0.04] border-[var(--dd-border-subtle)] text-[var(--dd-text-secondary)] hover:bg-white/[0.08]'
          }`}
        >
          <Code2 className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden xl:inline">DSL</span>
        </button>

        <button
          type="button"
          onClick={toggleSimulation}
          title="运行 / 停止动态链路推演"
          className={`h-7 flex items-center gap-1.5 px-2.5 rounded-lg border text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
            simulating
              ? 'bg-emerald-500/25 border-emerald-400/50 text-emerald-300'
              : 'bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/30 text-emerald-400'
          }`}
        >
          {simulating ? <Square className="w-3 h-3 shrink-0" /> : <Play className="w-3.5 h-3.5 shrink-0" />}
          <span className="hidden md:inline">{simulating ? '停止推演' : '推演'}</span>
        </button>

        <button
          type="button"
          onClick={() => setImportModalOpen(true)}
          title="导入 SQL DDL 或 DevDraw JSON"
          className="h-7 flex items-center gap-1.5 px-2.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-[var(--dd-border-subtle)] text-[var(--dd-text-secondary)] hover:text-[var(--dd-text-primary)] text-xs font-medium whitespace-nowrap shrink-0 transition-colors"
        >
          <Download className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span className="hidden xl:inline">导入</span>
        </button>

        <button
          type="button"
          onClick={() => setExportModalOpen(true)}
          title="导出推演产物 (SVG / PNG / Markdown ADR / Mermaid / .arch / HTML)"
          className="h-7 flex items-center gap-1.5 px-2.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-[var(--dd-border-subtle)] text-[var(--dd-text-secondary)] hover:text-[var(--dd-text-primary)] text-xs font-medium whitespace-nowrap shrink-0 transition-colors"
        >
          <Share className="w-3.5 h-3.5 text-violet-400 shrink-0" />
          <span className="hidden md:inline">导出</span>
        </button>

        {isTauriRuntime() && (
          <>
            <div className="h-4 w-px bg-[var(--dd-border-subtle)] mx-0.5 shrink-0" />
            <WindowControls variant="workbench" />
          </>
        )}
      </div>
    </header>
  );
};
