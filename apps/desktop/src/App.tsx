import React, { useEffect } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { DevDrawCanvas } from '@devdraw/canvas';
import { getActiveSlotFromProject, useWorkbenchStore } from './store/useWorkbenchStore';
import { LauncherView } from './components/LauncherView';
import { TopBar } from './components/TopBar';
import { LayerTabsBar } from './components/LayerTabsBar';
import { LeftSidebar } from './components/LeftSidebar';
import { DslEditorPanel } from './components/DslEditorPanel';
import { RightInspector } from './components/RightInspector';
import { ExportModal } from './components/ExportModal';
import { StyleCustomizerModal } from './components/StyleCustomizerModal';

export const App: React.FC = () => {
  const {
    projects,
    activeProjectId,
    activeLayerIndex,
    activeTool,
    selectedNodeId,
    selectedEdgeId,
    inspectorOpen,
    theme,
    expandMode,
    compactMode,
    simulating,
    activeFlowId,
    flowStepIndex,
    isFlowPlaying,
    history,
    historyIndex,
    recentKinds,
    toastMessage,
    hydrate,
    setTool,
    selectNode,
    selectEdge,
    openNodeInspector,
    openEdgeInspector,
    closeInspector,
    openStyleModal,
    moveNode,
    duplicateNode,
    toggleNodePinned,
    disconnectNode,
    deleteNode,
    connectNodes,
    updateEdge,
    updateEdgeWaypoints,
    toggleEdgeDashed,
    toggleEdgeRouting,
    reverseEdge,
    deleteEdge,
    addNodeFromPrimitive,
    addFreehandStroke,
    clearFreehandStrokes,
    toggleNodeCollapse,
    cycleDensity,
    toggleCompactMode,
    toggleTheme,
    drillToNodeTarget,
    selectSubCanvas,
    selectFlow,
    stepFlow,
    toggleFlowAutoPlay,
    resetFlowStep,
    stopSimulation,
    toggleDslSplit,
    runAutoLayout,
    undo,
    redo,
  } = useWorkbenchStore();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // Auto-play timer for Step-by-step Flow playback
  useEffect(() => {
    if (!simulating || !isFlowPlaying) return;
    const id = setInterval(() => stepFlow(1), 1600);
    return () => clearInterval(id);
  }, [simulating, isFlowPlaying, stepFlow]);

  // Global keyboard shortcuts (V/L/P modes, A/D/T annotations, Esc, Delete, Ctrl+\, Ctrl+L, Ctrl+Z/Y)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!activeProjectId) return;
      const target = e.target as HTMLElement | null;
      const inEditable =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          !!target.closest('.cm-editor'));

      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault();
        toggleDslSplit();
        return;
      }
      if (inEditable) return;

      const lower = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && lower === 'l') {
        e.preventDefault();
        void runAutoLayout(false);
      } else if ((e.ctrlKey || e.metaKey) && lower === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && lower === 'y') {
        e.preventDefault();
        redo();
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && lower === 'v') {
        setTool('select');
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && lower === 'l') {
        setTool('connect');
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && lower === 'p') {
        setTool('draw');
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && lower === 'a') {
        addNodeFromPrimitive('assumption', 220, 260);
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && lower === 'd') {
        addNodeFromPrimitive('decision', 260, 260);
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && lower === 't') {
        addNodeFromPrimitive('note', 300, 260);
      } else if (e.key === 'Escape') {
        if (activeTool !== 'select') {
          setTool('select');
        } else if (inspectorOpen) {
          closeInspector();
        } else if (selectedNodeId || selectedEdgeId) {
          selectNode(null);
          selectEdge(null);
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeId) {
          e.preventDefault();
          deleteNode(selectedNodeId);
        } else if (selectedEdgeId) {
          e.preventDefault();
          deleteEdge(selectedEdgeId);
        }
      } else if (simulating && e.key === 'ArrowRight') {
        e.preventDefault();
        stepFlow(1);
      } else if (simulating && e.key === 'ArrowLeft') {
        e.preventDefault();
        stepFlow(-1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeProjectId,
    activeTool,
    selectedNodeId,
    selectedEdgeId,
    inspectorOpen,
    simulating,
    setTool,
    selectNode,
    selectEdge,
    closeInspector,
    addNodeFromPrimitive,
    deleteNode,
    deleteEdge,
    toggleDslSplit,
    runAutoLayout,
    undo,
    redo,
    stepFlow,
  ]);

  const project = projects.find((p) => p.id === activeProjectId);
  const active = getActiveSlotFromProject(project, activeLayerIndex);

  if (!project || !active) {
    return (
      <>
        <LauncherView />
        {toastMessage && (
          <div className="fixed top-[56px] right-4 z-50 px-3.5 py-2 rounded-xl bg-[#1b1625]/95 border border-violet-400/35 text-xs text-zinc-100 shadow-2xl backdrop-blur-md">
            {toastMessage}
          </div>
        )}
      </>
    );
  }

  return (
    <div
      className={`h-screen w-screen flex flex-col overflow-hidden bg-[var(--dd-bg-base)] text-[var(--dd-text-primary)] ${
        theme === 'light' ? 'devdraw-light' : ''
      }`}
    >
      <TopBar />
      <LayerTabsBar />

      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        <LeftSidebar />
        <DslEditorPanel />

        <main className="flex-1 min-w-0 h-full relative">
          <ReactFlowProvider>
            <DevDrawCanvas
              slot={active.slot}
              layerTemplate={active.layer.template}
              subCanvases={active.layer.children}
              activeSubCanvasIndex={active.layer.activeChildIndex ?? 0}
              activeTool={activeTool}
              selectedNodeId={selectedNodeId}
              selectedEdgeId={selectedEdgeId}
              theme={theme}
              expandMode={expandMode}
              compactMode={compactMode}
              simulating={simulating}
              activeFlowId={activeFlowId}
              flowStepIndex={flowStepIndex}
              isFlowPlaying={isFlowPlaying}
              canUndo={historyIndex > 0}
              canRedo={historyIndex < history.length - 1}
              recentKinds={recentKinds}
              kindStyles={project.kindStyles}
              onSetTool={setTool}
              onSelectNode={selectNode}
              onSelectEdge={selectEdge}
              onOpenNodeInspector={openNodeInspector}
              onOpenEdgeInspector={openEdgeInspector}
              onCustomizeNodeStyle={(nodeId) => openStyleModal(nodeId)}
              onNodeDragStop={moveNode}
              onConnectNodes={connectNodes}
              onDropPrimitive={addNodeFromPrimitive}
              onDuplicateNode={duplicateNode}
              onToggleNodePinned={toggleNodePinned}
              onDisconnectNode={disconnectNode}
              onDeleteNode={deleteNode}
              onUpdateEdgeLabel={(edgeId, label) => updateEdge(edgeId, { label })}
              onUpdateEdgeWaypoints={updateEdgeWaypoints}
              onToggleEdgeDashed={toggleEdgeDashed}
              onToggleEdgeRouting={toggleEdgeRouting}
              onReverseEdge={reverseEdge}
              onDeleteEdge={deleteEdge}
              onToggleNodeCollapse={toggleNodeCollapse}
              onCycleDensity={cycleDensity}
              onToggleCompactMode={toggleCompactMode}
              onToggleTheme={toggleTheme}
              onRunAutoLayout={() => void runAutoLayout(false)}
              onUndo={undo}
              onRedo={redo}
              onDrillDown={drillToNodeTarget}
              onAddFreehandStroke={addFreehandStroke}
              onClearFreehandStrokes={clearFreehandStrokes}
              onSelectSubCanvas={selectSubCanvas}
              onSelectFlow={selectFlow}
              onFlowPrev={() => stepFlow(-1)}
              onFlowNext={() => stepFlow(1)}
              onFlowTogglePlay={toggleFlowAutoPlay}
              onFlowReset={resetFlowStep}
              onFlowClose={stopSimulation}
            />
          </ReactFlowProvider>
        </main>

        <RightInspector />
      </div>

      <ExportModal />
      <StyleCustomizerModal />

      {toastMessage && (
        <div className="fixed top-[88px] right-4 z-50 px-3.5 py-2 rounded-xl bg-[#1b1625]/95 border border-violet-400/35 text-xs text-zinc-100 shadow-2xl backdrop-blur-md">
          {toastMessage}
        </div>
      )}
    </div>
  );
};
