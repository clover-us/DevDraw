import { useCallback, useMemo, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from '@xyflow/react';
import { applyPatch } from '../core/patch';
import { sampleModel, samplePositions } from '../core/sample';
import { edgeDependency, simulate, type SimulationResult } from '../core/simulate';
import type { DependencyMode, Model } from '../core/types';
import { DevDrawEdge, DevDrawNode, type DevDrawEdgeData, type DevDrawNodeData } from './components';
import { Sidebar } from './Sidebar';

const nodeTypes = { devdraw: DevDrawNode };
const edgeTypes = { devdraw: DevDrawEdge };

export function App() {
  const [model, setModel] = useState<Model>(() => structuredClone(sampleModel));
  const [seeds, setSeeds] = useState<string[]>([]);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  // 基线 = 首次改边前的推演结果，用于「编辑→重演→对比」
  const [baseline, setBaseline] = useState<SimulationResult | null>(null);

  const result = useMemo(() => (seeds.length > 0 ? simulate(model, seeds) : null), [model, seeds]);

  const impactedEdges = useMemo(() => {
    const set = new Set<string>();
    if (result) {
      for (const path of Object.values(result.paths)) {
        for (const step of path) set.add(step.edge);
      }
    }
    return set;
  }, [result]);

  const rfNodes: Node<DevDrawNodeData>[] = useMemo(
    () =>
      Object.entries(model.nodes).map(([id, n]) => ({
        id,
        type: 'devdraw',
        position: samplePositions[id] ?? { x: 0, y: 0 },
        data: {
          name: n.name,
          kind: n.type,
          state: result?.states[id] ?? 'ok',
          isSeed: seeds.includes(id),
        },
        draggable: false,
      })),
    [model, result, seeds],
  );

  const rfEdges: Edge<DevDrawEdgeData>[] = useMemo(
    () =>
      Object.entries(model.edges).map(([id, e]) => ({
        id,
        source: e.from,
        target: e.to,
        type: 'devdraw',
        data: {
          edgeType: e.type,
          mode: edgeDependency(e),
          label: e.label,
          impacted: impactedEdges.has(id),
          onSelect: (edgeId: string) => setSelectedEdge(edgeId),
        },
      })),
    [model, impactedEdges],
  );

  const onNodeContextMenu: NodeMouseHandler = useCallback((event, node) => {
    event.preventDefault();
    setSeeds((s) => (s.includes(node.id) ? s.filter((x) => x !== node.id) : [...s, node.id]));
  }, []);

  const changeEdgeMode = useCallback(
    (edgeId: string, mode: DependencyMode) => {
      setBaseline((prev) => prev ?? result);
      setModel((m) => applyPatch(m, { op: 'update-edge', id: edgeId, attrs: { dependency: mode } }));
    },
    [result],
  );

  const clearScenario = useCallback(() => {
    setSeeds([]);
    setBaseline(null);
  }, []);

  const resetAll = useCallback(() => {
    setModel(structuredClone(sampleModel));
    setSeeds([]);
    setBaseline(null);
    setSelectedEdge(null);
  }, []);

  return (
    <div className="dd-app">
      <header className="dd-header">
        <div className="dd-brand">
          DevDraw · 研绘 <span className="dd-tag">推演原型 spike</span>
        </div>
        <div className="dd-model-name">{model.name}</div>
        <div className="dd-actions">
          <button onClick={clearScenario} disabled={seeds.length === 0}>
            清除推演
          </button>
          <button onClick={resetAll}>重置模型</button>
        </div>
      </header>
      <div className="dd-main">
        <div className="dd-canvas">
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeContextMenu={onNodeContextMenu}
            onEdgeClick={(_, edge) => setSelectedEdge(edge.id)}
            onPaneClick={() => setSelectedEdge(null)}
            nodesDraggable={false}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.4}
            maxZoom={2}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color="#2a2f3a" />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) => {
                const state = (n.data as DevDrawNodeData).state;
                return state === 'failed' ? '#e5484d' : state === 'degraded' ? '#d99a2b' : '#3a4150';
              }}
            />
          </ReactFlow>
          <div className="dd-hint">右键节点：切换失效源 · 点击边标签：改依赖模式</div>
        </div>
        <Sidebar
          model={model}
          seeds={seeds}
          result={result}
          baseline={baseline}
          selectedEdge={selectedEdge}
          onChangeMode={changeEdgeMode}
          onClearEdge={() => setSelectedEdge(null)}
        />
      </div>
    </div>
  );
}
