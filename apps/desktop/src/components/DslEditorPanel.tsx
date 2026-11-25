import React, { useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView, type ViewUpdate } from '@codemirror/view';
import { AlertCircle, Bot, CheckCircle2, Code2, Crosshair, Sparkles, X } from 'lucide-react';
import {
  locateEdgeInDsl,
  locateEntityInDsl,
  locateSelectionAtDslLine,
  serializeSlotToDsl,
} from '@devdraw/core';
import { getActiveSlotFromProject, useWorkbenchStore } from '../store/useWorkbenchStore';
import {
  activeDslLinesField,
  archEditorTheme,
  archStreamLanguage,
  createArchAutocompletion,
  createArchLinter,
  setActiveDslLinesEffect,
} from '../editor/archLanguage';

export const DslEditorPanel: React.FC = () => {
  const {
    projects,
    activeProjectId,
    activeLayerIndex,
    selectedNodeId,
    selectedEdgeId,
    dslSplitOpen,
    dslDiagnostics,
    theme,
    applyDslSource,
    copyAiPromptContext,
    selectNode,
    selectEdge,
    toggleDslSplit,
    showToast,
  } = useWorkbenchStore();

  const project = projects.find((p) => p.id === activeProjectId);
  const active = getActiveSlotFromProject(project, activeLayerIndex);

  const canonicalCode = useMemo(() => {
    if (!active) return '';
    return active.slot.dslSource || serializeSlotToDsl(active.slot);
  }, [active]);

  // Keep a local draft so typing incomplete/invalid syntax never wipes cursor or text
  const [draftCode, setDraftCode] = useState(canonicalCode);
  const lastCommittedRef = useRef<string>(canonicalCode);
  const lastSlotIdRef = useRef<string | null>(active?.slot.id ?? null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cmRef = useRef<ReactCodeMirrorRef | null>(null);
  const isEditorDrivenSelectionRef = useRef(false);

  // Keep latest nodes/edges in refs so CodeMirror extensions stay referentially stable
  const latestNodesRef = useRef(active?.slot.nodes ?? []);
  const latestEdgesRef = useRef(active?.slot.edges ?? []);
  latestNodesRef.current = active?.slot.nodes ?? [];
  latestEdgesRef.current = active?.slot.edges ?? [];

  // Sync canonical store DSL -> local draft ONLY when changed externally or slot switches
  useEffect(() => {
    if (!active) return;
    const slotChanged = lastSlotIdRef.current !== active.slot.id;
    if (slotChanged || canonicalCode !== lastCommittedRef.current) {
      lastSlotIdRef.current = active.slot.id;
      lastCommittedRef.current = canonicalCode;
      setDraftCode(canonicalCode);
    }
  }, [active, canonicalCode]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  // Canvas selection -> Editor highlight & scroll into view
  useEffect(() => {
    const view = cmRef.current?.view;
    if (!view || !dslSplitOpen || !active) return;

    const currentDoc = view.state.doc.toString();
    let range: { startLine: number; endLine: number } | null = null;

    if (selectedNodeId) {
      const loc = locateEntityInDsl(currentDoc, selectedNodeId, active.slot.nodes);
      if (loc) range = { startLine: loc.startLine, endLine: loc.endLine };
    } else if (selectedEdgeId) {
      const loc = locateEdgeInDsl(currentDoc, selectedEdgeId, active.slot.nodes, active.slot.edges);
      if (loc) range = { startLine: loc.line, endLine: loc.line };
    }

    const effects = [setActiveDslLinesEffect.of(range)];
    if (range && !isEditorDrivenSelectionRef.current) {
      const safeLine = Math.min(Math.max(1, range.startLine), view.state.doc.lines);
      const lineInfo = view.state.doc.line(safeLine);
      view.dispatch({
        effects: [...effects, EditorView.scrollIntoView(lineInfo.from, { y: 'center' })],
      });
    } else {
      view.dispatch({ effects });
    }
    isEditorDrivenSelectionRef.current = false;
  }, [selectedNodeId, selectedEdgeId, dslSplitOpen, active?.slot.id, draftCode]);

  const extensions = useMemo(() => {
    const cursorSyncListener = EditorView.updateListener.of((update: ViewUpdate) => {
      if (!update.selectionSet || update.docChanged) return;
      // Only trigger canvas selection on user pointer/keyboard cursor moves
      const isUserEvent = update.transactions.some(
        (tr) => tr.isUserEvent('select.pointer') || tr.isUserEvent('select.keyboard')
      );
      if (!isUserEvent) return;

      const head = update.state.selection.main.head;
      const lineNum = update.state.doc.lineAt(head).number;
      const hit = locateSelectionAtDslLine(
        update.state.doc.toString(),
        lineNum,
        latestNodesRef.current,
        latestEdgesRef.current
      );
      if (!hit) return;

      isEditorDrivenSelectionRef.current = true;
      if (hit.kind === 'node') {
        selectNode(hit.id, false);
      } else {
        selectEdge(hit.id, false);
      }
    });

    return [
      archStreamLanguage,
      createArchAutocompletion(() => latestNodesRef.current),
      createArchLinter(),
      activeDslLinesField,
      archEditorTheme,
      cursorSyncListener,
    ];
  }, [selectNode, selectEdge]);

  if (!dslSplitOpen || !active) return null;

  const handleChange = (val: string) => {
    setDraftCode(val);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      lastCommittedRef.current = val;
      applyDslSource(val);
    }, 220);
  };

  const handleFormat = () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    const formatted = serializeSlotToDsl(active.slot);
    lastCommittedRef.current = formatted;
    setDraftCode(formatted);
    applyDslSource(formatted);
    showToast('已按标准缩进格式化 .arch 源码');
  };

  const jumpToLine = (lineNum: number) => {
    const view = cmRef.current?.view;
    if (!view) return;
    const safeLine = Math.min(Math.max(1, lineNum), view.state.doc.lines);
    const lineInfo = view.state.doc.line(safeLine);
    view.dispatch({
      selection: { anchor: lineInfo.from },
      effects: EditorView.scrollIntoView(lineInfo.from, { y: 'center' }),
    });
    view.focus();
  };

  const errorCount = dslDiagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = dslDiagnostics.filter((d) => d.severity === 'warning').length;

  return (
    <section className="w-[380px] xl:w-[440px] h-full border-r bg-[var(--dd-bg-panel)] border-[var(--dd-border-subtle)] flex flex-col shrink-0 z-20">
      <div className="h-9 px-3 border-b border-[var(--dd-border-subtle)] flex items-center justify-between text-xs shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Code2 className="w-3.5 h-3.5 text-violet-400 shrink-0" />
          <span className="font-mono font-medium truncate">
            {active.slot.id}.arch
          </span>
          <span
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 ${
              errorCount > 0
                ? 'bg-rose-500/15 text-rose-400'
                : 'bg-emerald-500/15 text-emerald-400'
            }`}
          >
            {errorCount > 0 ? `${errorCount} 错误` : '无损双向'}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {(selectedNodeId || selectedEdgeId) && (
            <button
              type="button"
              onClick={() => {
                const view = cmRef.current?.view;
                if (!view) return;
                const doc = view.state.doc.toString();
                const loc = selectedNodeId
                  ? locateEntityInDsl(doc, selectedNodeId, active.slot.nodes)
                  : selectedEdgeId
                    ? locateEdgeInDsl(doc, selectedEdgeId, active.slot.nodes, active.slot.edges)
                    : null;
                if (loc) jumpToLine('startLine' in loc ? loc.startLine : loc.line);
              }}
              title="定位当前画布选中元素所在源码行"
              className="p-1 rounded-md text-violet-400 hover:bg-white/[0.08]"
            >
              <Crosshair className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => void copyAiPromptContext()}
            title="一键复制 .arch 语法规范与当前源码，发给任意 AI 协助推演"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono text-[var(--dd-text-secondary)] hover:text-emerald-300 hover:bg-white/[0.08]"
          >
            <Bot className="w-3 h-3 text-emerald-400" />
            <span>AI 上下文</span>
          </button>
          <button
            type="button"
            onClick={handleFormat}
            title="按规范重排 .arch 源码"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono text-[var(--dd-text-secondary)] hover:bg-white/[0.08]"
          >
            <Sparkles className="w-3 h-3 text-violet-400" />
            <span>格式化</span>
          </button>
          <button
            type="button"
            onClick={toggleDslSplit}
            title="关闭源码分屏 (Ctrl+\)"
            className="p-1 rounded-md text-[var(--dd-text-secondary)] hover:bg-white/[0.08]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto text-[12px]">
        <CodeMirror
          ref={cmRef}
          value={draftCode}
          height="100%"
          theme={theme === 'dark' ? oneDark : 'light'}
          extensions={extensions}
          onChange={handleChange}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLine: true,
            foldGutter: true,
            autocompletion: false,
          }}
        />
      </div>

      {/* Live Clickable Diagnostics Footer */}
      <div className="px-3 py-2 border-t border-[var(--dd-border-subtle)] text-[11px] font-mono shrink-0">
        {dslDiagnostics.length === 0 ? (
          <div className="flex items-center justify-between gap-2 text-emerald-400">
            <span className="flex items-center gap-1.5 truncate">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>语法校验通过 · 注释与排版无损保留</span>
            </span>
            <span className="text-[10px] text-[var(--dd-text-muted)] shrink-0">
              {active.slot.nodes.length} 实体 · {active.slot.edges.length} 关系
            </span>
          </div>
        ) : (
          <div className="space-y-1 max-h-24 overflow-y-auto">
            {dslDiagnostics.map((d, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => jumpToLine(d.line)}
                className={`w-full text-left flex items-start gap-1.5 rounded px-1 py-0.5 hover:bg-white/[0.06] transition-colors ${
                  d.severity === 'error' ? 'text-rose-400' : 'text-amber-400'
                }`}
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span className="truncate">
                  L{d.line}: {d.message}
                </span>
              </button>
            ))}
            {warningCount > 0 && errorCount === 0 && (
              <div className="text-[10px] text-amber-300/80 pl-5">
                存在 {warningCount} 条警告（已同步到画布，点击可跳转定位）
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
