/**
 * 一个模型多副镜片：镜片切换 = 投影 + 推演器分派。模型统一，推演穿镜而过。
 * 设计依据：docs/design/lens-model.md §4。所有变更经 applyPatch/applyPatches 唯一咽喉点。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from '@xyflow/react';
import { newEdgeId } from '../core/id';
import { layoutProjection, type Positions } from '../core/layout';
import { applyPatch, applyPatchChecked, applyPatches } from '../core/patch';
import type { QuestionOption } from '../core/reasoners/types';
import { getLens, LENSES, projectLens, type LensId } from '../core/registry';
import { threeLensPositions } from '../core/sample-three-lens';
import { edgeDependency, simulate, type SimulationResult } from '../core/simulate';
import type { DependencyMode, EdgeType, Model } from '../core/types';
import { DevDrawEdge, DevDrawNode, type DevDrawEdgeData, type DevDrawNodeData } from './components';
import { ModelPanel } from './ModelPanel';
import { Sidebar } from './Sidebar';
import { StorageBar } from './StorageBar';
import { useProject } from './useProject';

const nodeTypes = { devdraw: DevDrawNode };
const edgeTypes = { devdraw: DevDrawEdge };

const HINTS: Record<LensId, string> = {
  architecture: '拖拽节点摆位 · 从右侧圆点拖出连线 · 双击改名 · 右键切换失效源 · 点边标签改依赖模式',
  er: '拖拽摆位 · 拖出外键 · 双击改名 · 点字段看改列牵连 · 红色外键=N:M 缺中间表',
  'state-machine': '拖拽摆位 · 拖出迁移 · 双击改名 · 红色迁移=缺服务 · 在右侧回答模型的反问',
};

/** 拖拽连线时按镜片落的默认边类型（之后可在右侧改具体属性）。 */
const CONNECT_TYPE: Record<LensId, EdgeType> = {
  architecture: 'calls',
  er: 'fk',
  'state-machine': 'transition',
};

export function App() {
  const project = useProject();
  const { model, setModel, setViews } = project;
  const [lens, setLens] = useState<LensId>('state-machine');
  const [seeds, setSeeds] = useState<string[]>([]);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [activeFinding, setActiveFinding] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<SimulationResult | null>(null);
  const [autoPos, setAutoPos] = useState<Positions>({});
  const [fitTick, setFitTick] = useState(0);
  const [relayoutNonce, setRelayoutNonce] = useState(0);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const lensDef = getLens(lens);
  const projection = useMemo(() => projectLens(model, lensDef), [model, lensDef]);
  const projectionRef = useRef(projection);
  projectionRef.current = projection;

  // 结构签名：节点 id + 边(id/type/from/to)。改名/改属性不触发重布局，增删节点/改连线才触发。
  const structKey = useMemo(() => {
    const nodes = Object.keys(projection.nodes).sort().join(',');
    const edges = Object.entries(projection.edges)
      .map(([id, e]) => `${id}:${e.type}:${e.from}>${e.to}`)
      .sort()
      .join(',');
    return `${lens}|${nodes}|${edges}`;
  }, [projection, lens]);

  // 结构变化 / 切镜片 / 手动重新布局 → ELK 重算坐标，随后 remount + fitView。
  useEffect(() => {
    let cancelled = false;
    void layoutProjection(projectionRef.current, lens).then((pos) => {
      if (cancelled) return;
      setAutoPos(pos);
      setFitTick((t) => t + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [structKey, lens, relayoutNonce]);
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
      // 优先级：用户拖拽持久化坐标 > ELK 自动布局 > sample 手写坐标 > 知识节点偏移 > 默认位。
      const saved = project.views[lens]?.positions[id];
      if (saved) return saved;
      const auto = autoPos[id];
      if (auto) return auto;
      const known = threeLensPositions[id];
      if (known) return known;
      const about = model.nodes[id]?.attrs?.about;
      if (typeof about === 'string' && threeLensPositions[about]) {
        const base = threeLensPositions[about];
        return { x: base.x + 60, y: base.y + 150 };
      }
      return { x: -340, y: 40 };
    },
    [model, project.views, lens, autoPos],
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

  const commitRename = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim();
      setRenamingId(null);
      if (!trimmed) return;
      setModel((m) => applyPatchChecked(m, { op: 'update-node', id, name: trimmed }));
    },
    [setModel],
  );
  const cancelRename = useCallback(() => setRenamingId(null), []);

  // 拖拽落点 → 写进 views.json（语义与布局分离，挪位置不污染 model diff）。
  const persistPosition = useCallback(
    (id: string, pos: { x: number; y: number }) => {
      setViews((v) => ({ ...v, [lens]: { ...v[lens], positions: { ...v[lens]?.positions, [id]: pos } } }));
    },
    [setViews, lens],
  );

  // 拖拽连线：按镜片落默认边类型，经守门员校验后入模型。
  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target || params.source === params.target) return;
      const type = CONNECT_TYPE[lens];
      const id = newEdgeId(type);
      setModel((m) => applyPatchChecked(m, { op: 'add-edge', id, edge: { type, from: params.source!, to: params.target! } }));
      setSelectedEdge(id);
      setSelectedNode(null);
    },
    [lens, setModel],
  );

  const onNodeDoubleClick = useCallback<NodeMouseHandler>((_, node) => {
    setRenamingId(node.id);
    setSelectedNode(node.id);
  }, []);

  // 重新布局：清掉本镜片的手动坐标，让 ELK 重新接管。
  const relayout = useCallback(() => {
    setViews((v) => ({ ...v, [lens]: { ...v[lens], positions: {} } }));
    setRelayoutNonce((n) => n + 1);
  }, [setViews, lens]);

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
          renaming: renamingId === id,
          onRename: commitRename,
          onRenameCancel: cancelRename,
        },
        draggable: true,
      })),
    [projection, positionFor, result, seeds, highlightNodes, selectedNode, fieldCount, selectNode, renamingId, commitRename, cancelRename],
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
    project.loadSample();
    setSeeds([]);
    setBaseline(null);
    setSelectedEdge(null);
    setSelectedNode(null);
    setActiveFinding(null);
  }, [project]);

  const onModelChange = useCallback((next: Model) => setModel(next), [setModel]);

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
        <StorageBar
          modelName={model.name}
          kind={project.storeKind}
          label={project.storeLabel}
          autoSave={project.autoSave}
          dirty={project.dirty}
          saving={project.saving}
          fsaSupported={project.fsaSupported}
          onOpenFolder={() => void project.openFolder()}
          onImportZip={(f) => void project.importZip(f)}
          onExportZip={project.exportZip}
          onSaveNow={() => void project.saveNow()}
        />
        <div className="dd-actions">
          {project.fsaSupported && project.storeKind !== 'folder' && (
            <button
              className="dd-primary"
              onClick={() => void project.openFolder()}
              title="授权一个本地文件夹，之后每次改动自动保存到磁盘"
            >
              打开文件夹
            </button>
          )}
          <button onClick={project.exportZip} title="把当前状态打包下载一份 zip 快照（备份 / 分享 / 换浏览器）">
            导出 zip
          </button>
          {lens === 'architecture' && (
            <button onClick={clearScenario} disabled={seeds.length === 0}>
              清除推演
            </button>
          )}
          <button onClick={relayout} title="清掉手动摆位，让 ELK 重新自动布局当前镜片">
            重新布局
          </button>
          <button onClick={resetAll}>重置示例</button>
        </div>
      </header>
      <div className="dd-main">
        <div className="dd-canvas">
          <ReactFlow
            key={`${lens}-${fitTick}`}
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeContextMenu={onNodeContextMenu}
            onNodeDoubleClick={onNodeDoubleClick}
            onNodeDragStop={(_, node) => persistPosition(node.id, node.position)}
            onConnect={onConnect}
            onEdgeClick={(_, edge) => selectEdge(edge.id)}
            onPaneClick={() => {
              setSelectedEdge(null);
              setSelectedNode(null);
              setActiveFinding(null);
              setRenamingId(null);
            }}
            connectionLineStyle={{ stroke: '#4a9eda', strokeWidth: 2 }}
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
        <div className="dd-rightcol">
          <ModelPanel
            model={model}
            lensNodeTypes={lensDef.nodeTypes}
            selectedNode={selectedNode}
            selectedEdge={selectedEdge}
            onChange={onModelChange}
            onSelectNode={setSelectedNode}
          />
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
    </div>
  );
}
