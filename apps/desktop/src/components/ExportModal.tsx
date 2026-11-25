import React, { useMemo, useState } from 'react';
import { Copy, Download, FileCode2, FolderSync, X } from 'lucide-react';
import {
  exportSlotToInteractiveHtml,
  exportSlotToJson,
  exportSlotToMermaid,
  exportSlotToSvg,
  serializeSlotToDsl,
} from '@devdraw/core';
import { getActiveSlotFromProject, useWorkbenchStore } from '../store/useWorkbenchStore';

type ExportFormat = 'arch' | 'mermaid' | 'svg' | 'json' | 'html';

export const ExportModal: React.FC = () => {
  const {
    projects,
    activeProjectId,
    activeLayerIndex,
    theme,
    exportModalOpen,
    setExportModalOpen,
    bindActiveProjectToFolder,
    showToast,
  } = useWorkbenchStore();

  const [format, setFormat] = useState<ExportFormat>('arch');

  const project = projects.find((p) => p.id === activeProjectId);
  const active = getActiveSlotFromProject(project, activeLayerIndex);

  const output = useMemo(() => {
    if (!project || !active) return '';
    if (format === 'arch') return active.slot.dslSource || serializeSlotToDsl(active.slot);
    if (format === 'mermaid') return exportSlotToMermaid(active.slot);
    if (format === 'svg') return exportSlotToSvg(active.slot, theme);
    if (format === 'json') return exportSlotToJson(active.slot);
    return exportSlotToInteractiveHtml(active.slot, project.title);
  }, [project, active, format, theme]);

  if (!exportModalOpen || !project || !active) return null;

  const extMap: Record<ExportFormat, string> = {
    arch: 'arch',
    mermaid: 'mmd',
    svg: 'svg',
    json: 'json',
    html: 'html',
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(output);
    showToast('已复制到剪贴板');
  };

  const handleDownload = () => {
    const blob = new Blob([output], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${active.slot.id}.${extMap[format]}`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`已导出 ${active.slot.id}.${extMap[format]}`);
  };

  const tabs: Array<{ id: ExportFormat; label: string }> = [
    { id: 'arch', label: '.arch DSL 源码' },
    { id: 'mermaid', label: 'Mermaid 代码' },
    { id: 'svg', label: '标准 SVG 矢量' },
    { id: 'json', label: 'DevDraw JSON' },
    { id: 'html', label: '交互式单文件 HTML' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={() => setExportModalOpen(false)}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-[#1b1624] border border-white/10 text-zinc-100 shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-300">
              <FileCode2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">导出推演产物与交互评审快照</h3>
              <p className="text-[11px] text-zinc-400">
                当前画布：{active.slot.name}（{active.slot.nodes.length} 实体 · {active.slot.edges.length} 连线）
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setExportModalOpen(false)}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pt-4 flex items-center gap-1.5 flex-wrap">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setFormat(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                format === t.id
                  ? 'bg-violet-600 text-white'
                  : 'bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-5">
          <textarea
            readOnly
            rows={12}
            value={output}
            className="w-full p-3.5 rounded-xl bg-[#110e17] border border-white/10 text-xs font-mono text-zinc-200 focus:outline-none resize-none leading-relaxed"
          />
        </div>

        <div className="px-5 py-3.5 bg-[#15111d] border-t border-white/[0.06] flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs font-medium"
            >
              <Copy className="w-3.5 h-3.5 text-violet-400" />
              <span>复制内容</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setExportModalOpen(false);
                void bindActiveProjectToFolder();
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500/12 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-200 text-xs font-medium"
            >
              <FolderSync className="w-3.5 h-3.5 text-emerald-400" />
              <span>落盘为本地工作区目录</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium"
          >
            <Download className="w-3.5 h-3.5" />
            <span>下载 .{extMap[format]} 文件</span>
          </button>
        </div>
      </div>
    </div>
  );
};
