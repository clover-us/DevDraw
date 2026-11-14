/**
 * 一个模型多副镜片：镜片切换 = 投影 + 推演器分派。模型统一，推演穿镜而过。
 * 设计依据：docs/design/lens-model.md §4。所有变更经 applyPatch/applyPatches 唯一咽喉点。
 */
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
import { applyPatch, applyPatches } from '../core/patch';
import type { QuestionOption } from '../core/reasoners/types';
import { getLens, LENSES, projectLens, type LensId } from '../core/registry';
import { sampleThreeLensModel, threeLensPositions } from '../core/sample-three-lens';
import { edgeDependency, simulate, type SimulationResult } from '../core/simulate';
import type { DependencyMode, Model } from '../core/types';
import { DevDrawEdge, DevDrawNode, type DevDrawEdgeData, type DevDrawNodeData } from './components';
import { Sidebar } from './Sidebar';

const nodeTypes = { devdraw: DevDrawNode };
const edgeTypes = { devdraw: DevDrawEdge };

const HINTS: Record<LensId, string> = {
  architecture: '右键节点：切换失效源 · 点击边标签：改依赖模式',
  er: '点击字段：看改列牵连 · 红色外键：N:M 缺中间表',
  'state-machine': '红色迁移：缺服务实现 · 在右侧回答模型的反问',
};

export function App() {
  const [model, setModel] = useState<Model>(() => structuredClone(sampleThreeLensModel));
  const [lens, setLens] = useState<LensId>('state-machine');
  const [seeds, setSeeds] = useState<string[]>([]);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [activeFinding, setActiveFinding] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<SimulationResult | null>(null);

  const lensDef = getLens(lens);
  const projection = useMemo(() => projectLens(model, lensDef), [model, lensDef]);
  const findings = useMemo(() => lensDef.reasoner.run(model), [model, lensDef]);
  const result = useMemo(() => {
    if (lens !== 'architecture' || seeds.length === 0) return null;
    // 交互失效推演作用于架构投影（与画布所见一致）；SPOF 推演器仍读全模型以穿镜推理。
    return simulate({ ...model, nodes: projection.nodes, edges: projection.edges }, seeds);
  }, [model, seeds, lens, projection]);

  const active = findings.find((f) => f.id === activeFinding);
  const highlightNodes = useMemo(() => new Set(active?.nodeIds ?? []), [active]);
  const highlightEdges = useMemo(() => new Set(active?.edgeIds ?? []), [active]);

  const impactedEdges = useMemo(() => {
    const set = new Set<string>();
    if (result) for (const path of Object.values(result.paths)) for (const step of path) set.add(step.edge);
    return set;
  }, [result]);

  // 每副镜片的错误/反问计数（标签上的小红点，引导用户去看"顶嘴"）
  const lensBadges = useMemo(() => {
    const out: Record<string, number> = {};
    for (const l of LENSES) out[l.id] = l.reasoner.run(model).filter((f) => f.severity === 'error' || f.severity === 'question').length;
    return out;
  }, [model]);

  const positionFor = useCallback(
    (id: string): { x: number; y: number } => {
      const known = threeLensPositions[id];
      if (known) return known;
      const about = model.nodes[id]?.attrs?.about;
      if (typeof about === 'string' && threeLensPositions[about]) {
        const base = threeLensPositions[about];
        return { x: base.x + 60, y: base.y + 150 };
      }
      return { x: -340, y: 40 };
    },
    [model],
  );

  const fieldCount = useCallback(
    (tableId: string) =>
      Object.values(model.edges).filter((e) => e.type === 'contains' && e.from === tableId && model.nodes[e.to]?.type === 'Field').length,
    [model],
  );

  const selectNode = useCallback((id: string) => {
    setSelectedNode(id);
    setSelectedEdge(null);
  }, []);
  const selectEdge = useCallback((id: string) => {
    setSelectedEdge(id);
    setSelectedNode(null);
  }, []);

  const rfNodes: Node<DevDrawNodeData>[] = useMemo(
    () =>
      Object.entries(projection.nodes).map(([id, n]) => ({
        id,
        type: 'devdraw',
        position: positionFor(id),
        data: {
          name: n.name,
          kind: n.type,
          state: result?.states[id] ?? 'ok',
          isSeed: seeds.includes(id),
          highlighted: highlightNodes.has(id),
          selected: selectedNode === id,
          dataType: typeof n.attrs?.dataType === 'string' ? n.attrs.dataType : undefined,
          nullable: n.attrs?.nullable === true,
          keyRole: typeof n.attrs?.key === 'string' ? n.attrs.key : undefined,
          initial: n.attrs?.initial === true,
          fieldCount: n.type === 'Table' ? fieldCount(id) : undefined,
          detail: typeof n.attrs?.detail === 'string' ? n.attrs.detail : undefined,
          onSelect: selectNode,
        },
        draggable: false,
      })),
    [projection, positionFor, result, seeds, highlightNodes, selectedNode, fieldCount, selectNode],
  );

  const rfEdges: Edge<DevDrawEdgeData>[] = useMemo(
    () =>
      Object.entries(projection.edges).map(([id, e]) => {
        const effectedBy = e.attrs?.effectedBy;
        const missingService =
          e.type === 'transition' && typeof effectedBy === 'string' && e.attrs?.manual !== true && !model.nodes[effectedBy];
        return {
          id,
          source: e.from,
          target: e.to,
          type: 'devdraw',
          data: {
            edgeType: e.type,
            mode: edgeDependency(e),
            label: e.label,
            impacted: impactedEdges.has(id),
            highlighted: highlightEdges.has(id),
            cardinality: e.attrs?.cardinality,
            keyCol: e.attrs?.key,
            event: e.attrs?.event,
            missingService,
            onSelect: selectEdge,
          },
        };
      }),
    [projection, model, impactedEdges, highlightEdges, selectEdge],
  );

  const onNodeContextMenu: NodeMouseHandler = useCallback(
    (event, node) => {
      event.preventDefault();
      if (lens !== 'architecture') return;
      setSeeds((s) => (s.includes(node.id) ? s.filter((x) => x !== node.id) : [...s, node.id]));
    },
    [lens],
  );

  const changeEdgeMode = useCallback(
    (edgeId: string, mode: DependencyMode) => {
      setBaseline((prev) => prev ?? result);
      setModel((m) => applyPatch(m, { op: 'update-edge', id: edgeId, attrs: { dependency: mode } }));
    },
    [result],
  );

  const answer = useCallback((option: QuestionOption) => {
    setModel((m) => applyPatches(m, option.patches));
  }, []);

  const switchLens = useCallback((id: LensId) => {
    setLens(id);
    setSelectedEdge(null);
    setSelectedNode(null);
    setActiveFinding(null);
  }, []);

  const clearScenario = useCallback(() => {
    setSeeds([]);
    setBaseline(null);
  }, []);

  const resetAll = useCallback(() => {
    setModel(structuredClone(sampleThreeLensModel));
    setSeeds([]);
    setBaseline(null);
    setSelectedEdge(null);
    setSelectedNode(null);
    setActiveFinding(null);
  }, []);

  return (
    <div className="dd-app">
      <header className="dd-header">
        <div className="dd-brand">
          DevDraw · 研绘 <span className="dd-tag">三镜片原型</span>
        </div>
        <nav className="dd-lens-tabs">
          {LENSES.map((l) => (
            <button
              key={l.id}
              className={`dd-lens-tab${lens === l.id ? ' active' : ''}`}
              onClick={() => switchLens(l.id)}
            >
              {l.label}
              {lensBadges[l.id] > 0 && <span className="dd-lens-badge">{lensBadges[l.id]}</span>}
            </button>
          ))}
        </nav>
        <div className="dd-model-name">{model.name}</div>
        <div className="dd-actions">
          {lens === 'architecture' && (
            <button onClick={clearScenario} disabled={seeds.length === 0}>
              清除推演
            </button>
          )}
          <button onClick={resetAll}>重置模型</button>
        </div>
      </header>
      <div className="dd-main">
        <div className="dd-canvas">
          <ReactFlow
            key={lens}
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeContextMenu={onNodeContextMenu}
            onEdgeClick={(_, edge) => selectEdge(edge.id)}
            onPaneClick={() => {
              setSelectedEdge(null);
              setSelectedNode(null);
              setActiveFinding(null);
            }}
            nodesDraggable={false}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.3}
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
          <div className="dd-hint">{HINTS[lens]}</div>
        </div>
        <Sidebar
          model={model}
          lens={lensDef}
          findings={findings}
          activeFinding={activeFinding}
          onSelectFinding={setActiveFinding}
          onAnswer={answer}
          selectedNode={selectedNode}
          selectedEdge={selectedEdge}
          seeds={seeds}
          result={result}
          baseline={baseline}
          onChangeMode={changeEdgeMode}
          onClearEdge={() => setSelectedEdge(null)}
        />
      </div>
    </div>
  );
}
