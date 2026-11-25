import React, { useMemo, useState } from 'react';
import { Code2, Copy, Download, Eye, FileCode2, FolderSync, X } from 'lucide-react';
import {
  exportSlotToInteractiveHtml,
  exportSlotToJson,
  exportSlotToMarkdownAdr,
  exportSlotToMermaid,
  exportSlotToSvg,
  serializeSlotToDsl,
} from '@devdraw/core';
import { isTauriRuntime } from '../storage/adapter';
import { getActiveSlotFromProject, useWorkbenchStore } from '../store/useWorkbenchStore';
import { rasterizeSvgToPngBlob, saveExportedFile } from '../utils/exportHelpers';

type ExportFormat = 'arch' | 'mermaid' | 'svg' | 'png' | 'markdown' | 'json' | 'html';

const FORMAT_META: Record<ExportFormat, { ext: string; filterName: string; label: string }> = {
  arch: { ext: 'arch', filterName: 'DevDraw DSL', label: '.arch DSL' },
  mermaid: { ext: 'mmd', filterName: 'Mermaid Diagram', label: 'Mermaid' },
  svg: { ext: 'svg', filterName: 'SVG Vector', label: '高清 SVG' },
  png: { ext: 'png', filterName: 'PNG Image (2x)', label: '高清 PNG (2x)' },
  markdown: { ext: 'md', filterName: 'Markdown ADR Doc', label: 'Markdown / ADR' },
  json: { ext: 'json', filterName: 'DevDraw JSON', label: 'JSON' },
  html: { ext: 'html', filterName: 'Interactive HTML', label: '交互式 HTML' },
};

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

  const [format, setFormat] = useState<ExportFormat>('svg');
  const [showRawSvg, setShowRawSvg] = useState(false);
  const [exporting, setExporting] = useState(false);

  const project = projects.find((p) => p.id === activeProjectId);
  const active = getActiveSlotFromProject(project, activeLayerIndex);

  const svgMarkup = useMemo(() => {
    if (!project || !active) return '';
    return exportSlotToSvg(active.slot, theme, project.kindStyles);
  }, [project, active, theme]);

  const textOutput = useMemo(() => {
    if (!project || !active) return '';
    if (format === 'arch') return active.slot.dslSource || serializeSlotToDsl(active.slot);
    if (format === 'mermaid') return exportSlotToMermaid(active.slot);
    if (format === 'svg' || format === 'png') return svgMarkup;
    if (format === 'markdown') return exportSlotToMarkdownAdr(active.slot, project.title);
    if (format === 'json') return exportSlotToJson(active.slot);
    return exportSlotToInteractiveHtml(active.slot, project.title);
  }, [project, active, format, svgMarkup]);

  if (!exportModalOpen || !project || !active) return null;

  const meta = FORMAT_META[format];
  const isVisualMode = format === 'png' || (format === 'svg' && !showRawSvg);

  const handleCopy = async () => {
    try {
      if (format === 'png') {
        const blob = await rasterizeSvgToPngBlob(svgMarkup, 2);
        if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          showToast('已复制 2x 高清 PNG 图片到剪贴板');
          return;
        }
        showToast('当前环境不支持直接复制图片，请点击「另存为 PNG」');
        return;
      }
      await navigator.clipboard.writeText(textOutput);
      showToast(`已复制 ${meta.label} 内容到剪贴板`);
    } catch {
      showToast('复制到剪贴板失败');
    }
  };

  const handleDownload = async () => {
    setExporting(true);
    try {
      const content = format === 'png' ? await rasterizeSvgToPngBlob(svgMarkup, 2) : textOutput;
      const result = await saveExportedFile({
        defaultFileName: `${active.slot.id}.${meta.ext}`,
        extension: meta.ext,
        filterName: meta.filterName,
        content,
      });
      if (result === 'saved') {
        showToast(`已导出 ${active.slot.id}.${meta.ext}`);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : '导出文件失败');
    } finally {
      setExporting(false);
    }
  };

  const tabs: ExportFormat[] = ['svg', 'png', 'markdown', 'arch', 'mermaid', 'json', 'html'];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={() => setExportModalOpen(false)}
    >
      <div
        className="w-full max-w-3xl rounded-2xl bg-[#1b1624] border border-white/10 text-zinc-100 shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-300">
              <FileCode2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">导出推演产物与设计文档</h3>
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

        <div className="px-5 pt-4 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {tabs.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setFormat(id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  format === id
                    ? 'bg-violet-600 text-white'
                    : 'bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300'
                }`}
              >
                {FORMAT_META[id].label}
              </button>
            ))}
          </div>

          {format === 'svg' && (
            <button
              type="button"
              onClick={() => setShowRawSvg((v) => !v)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-[11px] text-zinc-300"
            >
              {showRawSvg ? <Eye className="w-3 h-3" /> : <Code2 className="w-3 h-3" />}
              <span>{showRawSvg ? '视觉预览' : '查看源码'}</span>
            </button>
          )}
        </div>

        <div className="p-5">
          {isVisualMode ? (
            <div className="w-full h-[300px] rounded-xl bg-[#110e17] border border-white/10 overflow-auto flex items-center justify-center p-3">
              <div
                className="max-w-full max-h-full [&>svg]:max-w-full [&>svg]:max-h-[270px] [&>svg]:h-auto [&>svg]:w-auto [&>svg]:rounded-lg"
                dangerouslySetInnerHTML={{ __html: svgMarkup }}
              />
            </div>
          ) : (
            <textarea
              readOnly
              rows={13}
              value={textOutput}
              className="w-full p-3.5 rounded-xl bg-[#110e17] border border-white/10 text-xs font-mono text-zinc-200 focus:outline-none resize-none leading-relaxed"
            />
          )}
        </div>

        <div className="px-5 py-3.5 bg-[#15111d] border-t border-white/[0.06] flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs font-medium"
            >
              <Copy className="w-3.5 h-3.5 text-violet-400" />
              <span>{format === 'png' ? '复制高清 PNG' : '复制内容'}</span>
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
            disabled={exporting}
            onClick={() => void handleDownload()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-medium"
          >
            <Download className="w-3.5 h-3.5" />
            <span>
              {exporting
                ? '正在生成...'
                : isTauriRuntime()
                  ? `另存为 .${meta.ext}`
                  : `下载 .${meta.ext} 文件`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
