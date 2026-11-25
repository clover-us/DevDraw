import React, { useMemo, useState } from 'react';
import {
  Archive,
  Copy,
  FolderGit2,
  FolderOpen,
  GitBranch,
  LayoutTemplate,
  MoreVertical,
  Network,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Unlink,
  Upload,
  X,
  Check,
  Database,
} from 'lucide-react';
import { LAYER_TEMPLATES, type LayerTemplateName, type ProjectCategory } from '@devdraw/core';
import { storageAdapter, supportsLocalDirectoryPicker } from '../storage/adapter';
import { useWorkbenchStore } from '../store/useWorkbenchStore';
import { WindowControls } from './WindowControls';

function formatWorkspaceFolderName(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || path;
}

export const LauncherView: React.FC = () => {
  const {
    projects,
    openProject,
    createProject,
    duplicateProject,
    toggleArchiveProject,
    deleteProject,
    openWorkspaceFolder,
    reloadWorkspaceFolder,
    unbindWorkspaceFolder,
    setImportModalOpen,
  } = useWorkbenchStore();

  const canPickFolder = supportsLocalDirectoryPicker();

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ProjectCategory>('personal');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [selectedTemplates, setSelectedTemplates] = useState<LayerTemplateName[]>(['系统架构拓扑']);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      if (p.category !== category) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.subtitle.toLowerCase().includes(q) ||
        p.meta.toLowerCase().includes(q)
      );
    });
  }, [projects, category, query]);

  const toggleTemplate = (tpl: LayerTemplateName) => {
    setSelectedTemplates((prev) => {
      if (prev.includes(tpl)) {
        return prev.length === 1 ? prev : prev.filter((item) => item !== tpl);
      }
      if (prev.length === 1 && prev[0] === '空白项目' && tpl !== '空白项目') {
        return [tpl];
      }
      return [...prev, tpl];
    });
  };

  const handleConfirmCreate = () => {
    createProject(newTitle, selectedTemplates);
    setCreateModalOpen(false);
    setNewTitle('');
  };

  return (
    <div
      className="relative min-h-screen w-full flex flex-col bg-[#14111a] text-zinc-100 overflow-y-auto"
      onClick={() => setOpenMenuId(null)}
    >
      {/* Atmospheric Spotlight */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#16121e] via-[#14111a] to-[#110e16]" />
        <div className="spotlight-beam absolute -inset-24 opacity-95" />
      </div>

      {/* Top Window Bar (Frameless Custom Titlebar) */}
      <header
        data-tauri-drag-region
        className="relative z-20 h-11 px-4 flex items-center justify-between border-b border-white/[0.05] bg-[#131019]/75 backdrop-blur-md select-none"
      >
        <div data-tauri-drag-region className="flex items-center gap-2 text-xs text-zinc-400 font-mono">
          <span className="w-2 h-2 rounded-full bg-violet-400 pointer-events-none" />
          <span className="pointer-events-none">DevDraw Studio</span>
        </div>

        <div
          data-tauri-drag-region
          className="px-3.5 py-1 rounded-full bg-[#221d2d]/90 border border-white/[0.08] text-xs font-medium text-zinc-200 flex items-center gap-2"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 pointer-events-none" />
          <span className="pointer-events-none">DevDraw · Tauri v2 本地工作台</span>
        </div>

        <div className="flex items-center gap-2.5">
          <span data-tauri-drag-region className="text-[11px] font-mono text-zinc-500">
            v0.1.0
          </span>
          <WindowControls variant="launcher" />
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 w-full max-w-[1040px] mx-auto px-6 pt-16 pb-14 flex flex-col">
        {/* Brand Hero */}
        <section className="flex flex-col items-center text-center">
          <div className="flex items-center gap-3.5 mb-2.5">
            <div className="w-11 h-11 rounded-2xl bg-[#1e1a29]/90 border border-white/10 flex items-center justify-center shadow-[0_0_28px_rgba(74,222,128,0.16)]">
              <svg className="w-6 h-6" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M11 23H21"
                  stroke="#64748b"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray="2.5 3.5"
                />
                <circle cx="8.5" cy="23" r="3" stroke="#facc15" strokeWidth="2.3" />
                <circle cx="24" cy="23" r="2.3" fill="#38bdf8" />
                <path
                  d="M8.5 19.5C8.5 12.5 13.5 8.5 20.5 9.5"
                  stroke="url(#think_arc)"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                />
                <path
                  d="M23.5 7.5L18.5 12.5L21 15L25.5 9.5L23.5 7.5Z"
                  fill="#4ade80"
                  stroke="#4ade80"
                  strokeWidth="1.2"
                  strokeLinejoin="round"
                />
                <defs>
                  <linearGradient id="think_arc" x1="8.5" y1="20" x2="21" y2="9" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#facc15" />
                    <stop offset="1" stopColor="#4ade80" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <h1 className="text-3xl sm:text-[34px] font-bold tracking-tight flex items-baseline gap-2.5">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#fde047] via-[#86efac] to-[#38bdf8]">
                DevDraw
              </span>
              <span className="text-zinc-500 font-light text-2xl">·</span>
              <span className="text-2xl sm:text-[28px] font-semibold text-zinc-100">研绘</span>
            </h1>
          </div>

          <p className="font-mono italic text-[14px] text-sky-400/90 mb-1">
            Think first, draw later.
          </p>
          <p className="text-sm text-zinc-300/90 mb-6">
            研思落绘，将推演化为可视之形。
          </p>

          {/* Search Input */}
          <div className="w-full max-w-[760px] relative">
            <Search className="w-4 h-4 text-zinc-500 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索项目、推演层或架构标签..."
              className="w-full h-11 pl-11 pr-10 rounded-xl bg-[#201b29]/85 focus:bg-[#262032] text-sm text-zinc-100 placeholder-zinc-500 border border-white/[0.07] focus:border-violet-400/50 focus:outline-none transition-all"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded text-zinc-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </section>

        {/* Workspace Filter Bar */}
        <section className="mt-9 mb-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#201b2a]/90 border border-white/[0.07] text-xs">
            <button
              type="button"
              onClick={() => setCategory('personal')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
                category === 'personal'
                  ? 'bg-violet-600/90 text-white font-medium'
                  : 'text-zinc-400 hover:text-zinc-100'
              }`}
            >
              <FolderGit2 className="w-3.5 h-3.5" />
              <span>本地项目</span>
            </button>
            <button
              type="button"
              onClick={() => setCategory('archived')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
                category === 'archived'
                  ? 'bg-amber-500/25 text-amber-200 font-medium'
                  : 'text-zinc-400 hover:text-zinc-100'
              }`}
            >
              <Archive className="w-3.5 h-3.5" />
              <span>归档项目</span>
            </button>
          </div>

          <div className="flex items-center gap-2.5 text-xs text-zinc-400">
            <button
              type="button"
              onClick={() => void openWorkspaceFolder()}
              title={
                canPickFolder
                  ? '打开包含 project.json 或 *.arch 文件的本地文件夹（三层 Git 友好工作区）'
                  : '当前浏览器不支持目录 API，请使用 Chrome / Edge 或 Tauri 桌面端'
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/12 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-200 transition-colors"
            >
              <FolderOpen className="w-3.5 h-3.5 text-emerald-400" />
              <span>打开本地目录</span>
            </button>
            <button
              type="button"
              onClick={() => setImportModalOpen(true)}
              title="从 SQL CREATE TABLE 或 DevDraw JSON 快速导入项目"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] text-zinc-200 transition-colors"
            >
              <Upload className="w-3.5 h-3.5 text-sky-400" />
              <span>导入 SQL / JSON</span>
            </button>
            <button
              type="button"
              onClick={() => setCreateModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] text-zinc-200 transition-colors"
            >
              <LayoutTemplate className="w-3.5 h-3.5 text-violet-400" />
              <span>从模板新建</span>
            </button>
            <span className="font-mono">
              项目 <strong className="text-zinc-100">{filtered.length}</strong>
            </span>
          </div>
        </section>

        {/* Project Cards Grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {category !== 'archived' && (
            <div
              onClick={() => createProject('未命名项目', ['空白项目'])}
              className="glass-card rounded-2xl p-5 min-h-[152px] flex flex-col justify-between cursor-pointer border-dashed border-white/15 hover:border-violet-400/50"
            >
              <div className="w-8 h-8 rounded-xl bg-violet-500/15 border border-violet-400/30 flex items-center justify-center text-violet-300">
                <Plus className="w-4 h-4" />
              </div>
              <div className="mt-6">
                <h3 className="text-[14px] font-semibold text-white">新建空白项目</h3>
                <p className="text-xs text-zinc-400 mt-1">开出 1 个空白推演层，自由组合全量实体原语</p>
              </div>
            </div>
          )}

          {filtered.map((item) => {
            const CardIcon =
              item.icon === 'git-branch'
                ? GitBranch
                : item.icon === 'database'
                  ? Database
                  : item.icon === 'archive'
                    ? Archive
                    : Network;

            return (
              <div
                key={item.id}
                onClick={() => openProject(item.id)}
                className="glass-card rounded-2xl p-5 min-h-[152px] flex flex-col justify-between cursor-pointer relative"
              >
                <div className="flex items-start justify-between">
                  <div className="w-8 h-8 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-zinc-300">
                    <CardIcon className="w-4 h-4" />
                  </div>

                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => setOpenMenuId(openMenuId === item.id ? null : item.id)}
                      className="p-1.5 -mr-1.5 -mt-1 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.08]"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {openMenuId === item.id && (
                      <div className="absolute right-0 mt-1 w-44 rounded-xl bg-[#1b1625] border border-white/15 shadow-2xl p-1 z-30 text-xs">
                        {item.workspacePath && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                void reloadWorkspaceFolder(item.id);
                                setOpenMenuId(null);
                              }}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.08] text-emerald-300"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>从磁盘重新加载</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                unbindWorkspaceFolder(item.id);
                                setOpenMenuId(null);
                              }}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.08] text-zinc-300"
                            >
                              <Unlink className="w-3.5 h-3.5 text-zinc-400" />
                              <span>解绑本地目录</span>
                            </button>
                            <div className="my-1 border-t border-white/[0.07]" />
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            duplicateProject(item.id);
                            setOpenMenuId(null);
                          }}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.08] text-zinc-200"
                        >
                          <Copy className="w-3.5 h-3.5 text-zinc-400" />
                          <span>创建副本</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            toggleArchiveProject(item.id);
                            setOpenMenuId(null);
                          }}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.08] text-zinc-200"
                        >
                          <Archive className="w-3.5 h-3.5 text-zinc-400" />
                          <span>{item.category === 'archived' ? '取消归档' : '归档项目'}</span>
                        </button>
                        <div className="my-1 border-t border-white/[0.07]" />
                        <button
                          type="button"
                          onClick={() => {
                            deleteProject(item.id);
                            setOpenMenuId(null);
                          }}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-rose-500/15 text-rose-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>移除项目</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-6">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[14px] font-semibold text-white truncate">{item.title}</h3>
                    {item.workspacePath && (
                      <span
                        title={`本地目录工作区：${item.workspacePath}`}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-mono shrink-0 border ${
                          storageAdapter.hasWorkspaceBinding?.(item)
                            ? 'bg-emerald-500/12 border-emerald-500/30 text-emerald-300'
                            : 'bg-amber-500/12 border-amber-500/30 text-amber-300'
                        }`}
                      >
                        <FolderGit2 className="w-2.5 h-2.5" />
                        <span className="max-w-[84px] truncate">
                          {formatWorkspaceFolderName(item.workspacePath)}
                        </span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-mono text-zinc-400 mt-1 truncate">{item.subtitle}</p>
                </div>
              </div>
            );
          })}
        </section>
      </main>

      {/* Create From Multi-Layer Template Modal */}
      {createModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setCreateModalOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-[#1b1624] border border-white/10 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">从模板新建项目</h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  勾选一个或多个工程推演层，自动生成预置实体与动态链路
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-2">项目名称</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="例如：订单中心分布式事务与多活架构"
                  className="w-full h-10 px-3.5 rounded-xl bg-[#130f1a] border border-white/10 focus:border-violet-400 focus:outline-none text-sm text-white placeholder-zinc-600"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-zinc-300">选择推演层组合</label>
                  <span className="text-[11px] font-mono text-violet-300">
                    已选 {selectedTemplates.length} 层
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[280px] overflow-y-auto pr-0.5">
                  {LAYER_TEMPLATES.map((tpl) => {
                    const checked = selectedTemplates.includes(tpl.name);
                    return (
                      <button
                        key={tpl.name}
                        type="button"
                        onClick={() => toggleTemplate(tpl.name)}
                        className={`text-left p-3 rounded-xl border transition-all ${
                          checked
                            ? 'bg-violet-500/12 border-violet-400/60'
                            : 'bg-[#14101b] border-white/[0.07] hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs font-medium text-zinc-100 mb-1">
                          <span>{tpl.name}</span>
                          {checked && (
                            <span className="w-4 h-4 rounded-md bg-violet-500 text-white flex items-center justify-center">
                              <Check className="w-2.5 h-2.5" />
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-400 leading-relaxed">{tpl.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="px-6 py-3.5 bg-[#15111d] border-t border-white/[0.06] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs text-zinc-400 hover:text-white hover:bg-white/[0.05]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmCreate}
                className="px-4 py-2 rounded-xl text-xs font-medium text-white bg-violet-600 hover:bg-violet-500 transition-colors"
              >
                创建并进入工作台
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
