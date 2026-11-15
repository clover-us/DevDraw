/**
 * 一个模型多副镜片：镜片切换 = 投影 + 推演器分派。模型统一，推演穿镜而过。
 * 设计依据：docs/design/lens-model.md §4。所有变更经 applyPatch/applyPatches 唯一咽喉点。
 *
 * 布局（用户 m01049 定调）：顶部 header 保持不变（镜片切换在此）；
 * 左侧导航轨把旧右栏拆成可导航分区（实体 / 发现 / 推演，默认收起）；
 * 右侧 = 语境抽屉（选中实体/边 → 详情 + 相关内容 + 上下文建模）。
 */
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  ControlButton,
  MiniMap,
  Panel,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeMouseHandler,
  type Node,
  type NodeMouseHandler,
} from '@xyflow/react';
import { nodeComponent, nodeFromComponent, nodeGlyph, resolveComponent } from '../core/components';
import {
  applyErScope,
  ER_ANCHOR_HANDLE,
  erDatabases,
  erFieldPort,
  erFieldRows,
  fieldIdFromHandle,
  foldRows,
  foldedCardHeight,
  isErStructure,
  planFkConnection,
  resolveFkLinks,
  shouldAutoFold,
  unassignedTableIds,
  type ErField,
  type FkLink,
} from '../core/er';
import { packAround, reflowColumn } from '../core/er-arrange';
import { applySmScope, smMachines as smMachinesOf, unassignedStateIds } from '../core/lifecycle';
import { newEdgeId, newNodeId } from '../core/id';
import { layoutProjection, NODE_WIDTH, nodeHeight, type Positions } from '../core/layout';
import { applyPatch, applyPatchChecked, applyPatches } from '../core/patch';
import type { QuestionOption } from '../core/reasoners/types';
import { findRecord, recordPatch } from '../core/reasoners/util';
import { connectableEdgeTypes, EDGE_TYPES, getLens, LENSES, NODE_TYPES, projectLens, type LensId } from '../core/registry';
import { threeLensPositions } from '../core/sample-three-lens';
import { createSession, type ReasoningSession } from '../core/session';
import { engineLabel } from '../core/sqlTypes';
import { edgeDependency, simulate, type SimulationResult } from '../core/simulate';
import {
  annotateHop,
  currentNode,
  startTrace,
  stepTrace,
  traceLatency,
  tracePathNodes,
  undoTrace,
  type TraceScenario,
} from '../core/trace';
import { computeLegendStats } from '../core/legend';
import type { ComponentDef, DependencyMode, EdgeType, Model, NodeType } from '../core/types';
import { ComponentEditor } from './ComponentEditor';
import { NodeEditor } from './NodeEditor';
import { EdgeEditor } from './EdgeEditor';
import { COMPONENT_MIME, ComponentLibrary } from './ComponentLibrary';
import { ContextMenu, type MenuItem } from './ContextMenu';
import { DevDrawEdge, DevDrawNode, Z_SELECTED, type DevDrawEdgeData, type DevDrawNodeData, type FieldRow } from './components';
import { EdgePicker } from './EdgePicker';
import { EntityDrawer } from './EntityDrawer';
import { ReasoningNudge } from './ReasoningNudge';
import { DynamicLegend } from './DynamicLegend';
import { FitFrameIcon, LayoutIcon, LogoIcon, MaximizeIcon, MinimizeIcon, MinusIcon, PlusIcon, RedoIcon, UndoIcon } from './icons';
import { NavPanel } from './NavPanel';
import { NavRail, type NavSection } from './NavRail';
import { QuickCreate } from './QuickCreate';
import { SessionsPanel } from './SessionsPanel';
import { SimulationPanel } from './SimulationPanel';
import { StorageBar } from './StorageBar';
import { TracePanel } from './TracePanel';
import { useTheme } from './theme';
import { useProject } from './useProject';

const nodeTypes = { devdraw: DevDrawNode };
const edgeTypes = { devdraw: DevDrawEdge };

const HINTS: Record<LensId, string> = {
  architecture: '双击空白新建 · 拖出连线选语义 · 双击改名 · 选中节点可模拟失效 / 追踪请求 · 画完推一推，模型会顶嘴',
  er: '双击空白新建表 · 拖出外键 · 双击改名 · 点表内字段看改列牵连 · 红色外键=N:M 缺中间表',
  'state-machine': '双击空白新建状态 · 从一个状态拖到另一个画迁移 · 双击改名 · 红色迁移=缺服务',
};

/** 拖拽连线时按镜片落的默认边类型（用户没选过的兜底；选过就记住上次）。 */
const CONNECT_TYPE: Record<LensId, EdgeType> = {
  architecture: 'calls',
  er: 'fk',
  'state-machine': 'transition',
};

const LAST_EDGE_KEY = 'devdraw-last-edge';

/** 拖线松手后还没定语义的那根线：记住两端表 + 两端字段（字段级连线时才有）。 */
interface ConnectDraft {
  from: string;
  to: string;
  /** 桌面坐标：语义选择器就弹在松手处。 */
  x: number;
  y: number;
  sourceField?: string;
  targetField?: string;
}

/** 记住"上次画的边类型"——重复画同一种线是最常见的情形。 */
function readLastEdge(): Partial<Record<LensId, EdgeType>> {
  try {
    const raw = localStorage.getItem(LAST_EDGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<Record<LensId, EdgeType>>) : {};
  } catch {
    return {};
  }
}

/** 可以当失效源的物理实体（知识卡片/状态之类挂上去没有意义）。 */
const SEEDABLE = new Set<NodeType>(['Service', 'Database', 'Queue', 'Endpoint', 'ExternalSystem', 'Actor']);

/** ER 表卡片内的字段行：与折叠 / 外键解析共用 erFieldRows 单一来源（名称 / 类型 / 可空 / 备注 / 键）。 */
function fieldsOf(model: Model, tableId: string): FieldRow[] {
  return erFieldRows(model, tableId);
}

/**
 * 把模型目标态合入画布现有节点：保留 React Flow 已测量的尺寸（避免边线抖动），
 * 若某节点正被拖拽则保留其实时位置，不让外部同步打断手势。
 */
function syncNodes(
  prev: Node<DevDrawNodeData>[],
  derived: Node<DevDrawNodeData>[],
): Node<DevDrawNodeData>[] {
  const byId = new Map(prev.map((n) => [n.id, n]));
  return derived.map((n) => {
    const old = byId.get(n.id);
    if (!old) return n;
    return {
      ...n,
      measured: old.measured,
      width: old.width,
      height: old.height,
      ...(old.dragging ? { position: old.position, dragging: true } : {}),
    };
  });
}

/** 抽屉的一次「视图」：选中某节点或某边（二者互斥）。用于 back/forward 导航历史。 */
type DrawerView = { node: string | null; edge: string | null };

export function App() {
  const project = useProject();
  const { model, setModel, setViews } = project;
  const theme = useTheme();
  const { screenToFlowPosition, zoomIn, zoomOut, fitView } = useReactFlow();
  const [lens, setLens] = useState<LensId>('architecture');
  // ER 按数据库分scope：'all' | 数据库 id | 'unassigned'。架构里有多库时，ER 各看各的内容。
  const [erScope, setErScope] = useState<string>('all');
  // 状态机按生命周期分scope：'all' | 生命周期 id | 'unassigned'。多台机器时，各看各的状态。
  const [smScope, setSmScope] = useState<string>('all');
  const [seeds, setSeeds] = useState<string[]>([]);
  // 请求追踪场景（§2.3）：和 seeds 一样是 what-if 假设，住在 views.architecture.trace，不进 model.json。
  const [trace, setTrace] = useState<TraceScenario | null>(null);
  // 推演邀请（质检条）是否被用户关掉：记在 localStorage，关掉不再打扰（推演入口别处一直都在）。
  const [nudgeDismissed, setNudgeDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('devdraw-nudge-off') === '1';
    } catch {
      return false;
    }
  });
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  // 抽屉导航历史：从节点→相关边→边另一端层层钻入时能原路返回（浏览器式 back/forward）。
  const [backStack, setBackStack] = useState<DrawerView[]>([]);
  const [fwdStack, setFwdStack] = useState<DrawerView[]>([]);
  // 渲染期同步当前选择，供 navigate/goBack 在事件回调里读到「此刻停在哪」。
  const selRef = useRef<DrawerView>({ node: null, edge: null });
  selRef.current = { node: selectedNode, edge: selectedEdge };
  const [activeFinding, setActiveFinding] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<SimulationResult | null>(null);
  // 每个镜片各存一份自动布局结果：共用一份的话，切镜片时新镜片会发现"这些 id 我都有坐标了"，
  // 于是原样沿用上一个镜片的摆法——架构和 ER 的图层完全不是一回事，看上去就是"刚排好的又回去了"。
  const [autoPos, setAutoPos] = useState<Partial<Record<LensId, Positions>>>({});
  const [relayoutNonce, setRelayoutNonce] = useState(0);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingFieldId, setRenamingFieldId] = useState<string | null>(null);
  // 左导航：默认收起，仅图标轨；点分区展开对应面板。
  const [section, setSection] = useState<NavSection>('library');
  const [navExpanded, setNavExpanded] = useState(false);
  const [createMode, setCreateMode] = useState(false);
  // 自定义组件编辑器：null=关闭；{editing:null}=新建；{editing:comp}=编辑。
  const [componentEditor, setComponentEditor] = useState<{ editing: ComponentDef | null } | null>(null);
  // 统一编辑弹窗：右键「编辑…」打开，tab 划分详情 / 外观（读 / 写分离，抽屉只读）。
  const [editorNode, setEditorNode] = useState<{ id: string; tab: 'attrs' | 'appearance' } | null>(null);
  // 关系编辑弹窗：右键关系「编辑关系…」打开。
  const [edgeEditor, setEdgeEditor] = useState<string | null>(null);
  // 会话分区里选中的存档（存档本身住在 reasoning/ 里，这里只是"正在看哪一份"）。
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  // ── 三个直接落在画布上的交互：就地新建 / 连线选语义 / 右键菜单 ──
  const [quickCreate, setQuickCreate] = useState<{ x: number; y: number; flow: { x: number; y: number } } | null>(null);
  const [pendingConnect, setPendingConnect] = useState<ConnectDraft | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId?: string; edgeId?: string } | null>(null);
  // 拖线松手时 onConnect 拿不到鼠标坐标，所以自己盯着指针（连线落点 = 当前指针处）。
  const pointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  // 切镜片 / 重新布局后要 fit 一次，但必须等 ELK 把坐标算完再 fit（否则框住的是旧坐标）。
  const pendingFitRef = useRef(false);
  // 折叠会改卡片高度 → 需要 ELK 按新高度重排一次，并且用结果覆盖旧坐标（而不是只补空缺）。
  const forceLayoutRef = useRef(false);
  // 每张表的折叠选择存在 views.json 里（和坐标一样属于"这一镜片怎么摆"），
  // 没记过的表按字段数自动决定。只在 ER 镜片有意义。
  const foldedTables = useMemo<Record<string, boolean>>(() => project.views[lens]?.folded ?? {}, [project.views, lens]);
  const foldedRef = useRef(foldedTables);
  foldedRef.current = foldedTables;
  const [lastEdge, setLastEdge] = useState<Partial<Record<LensId, EdgeType>>>(readLastEdge);
  // 画布全屏：把画布元素本身扔进全屏，顶栏/导航暂时让位，Esc 退出。
  const canvasRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === canvasRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void canvasRef.current?.requestFullscreen();
  }, []);

  // 项目加载完：把架构镜片存的场景恢复回来 —— what-if 假设不该因为刷新就消失。
  useEffect(() => {
    setSeeds(project.views['architecture']?.seeds ?? []);
    setTrace(project.views['architecture']?.trace ?? null);
    setBaseline(null);
    setActiveSessionId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.loadedAt]);

  const lensDef = getLens(lens);
  const baseProjection = useMemo(() => projectLens(model, lensDef), [model, lensDef]);
  // ER scope 条的数据源：架构里的数据库实体 + 各自表数；没挂库的表给「未归属」入口。
  const erDbs = useMemo(() => erDatabases(model), [model]);
  const erUnassigned = useMemo(() => unassignedTableIds(model), [model]);
  const erTableTotal = useMemo(() => Object.values(model.nodes).filter((n) => isErStructure(n.type)).length, [model]);
  // 选中的库被删 / 未归属清空时退回「全部」，不让scope条指着空气。
  const activeErScope =
    erScope !== 'all' && !(erScope === 'unassigned' ? erUnassigned.length > 0 : model.nodes[erScope]?.type === 'Database')
      ? 'all'
      : erScope;
  // 状态机 scope 条的数据源：生命周期 + 各自状态数 + 来源实体名；没挂机器的状态给「未归属」入口。
  const smMachines = useMemo(() => smMachinesOf(model), [model]);
  const smUnassigned = useMemo(() => unassignedStateIds(model), [model]);
  const smStateTotal = useMemo(() => Object.values(model.nodes).filter((n) => n.type === 'State').length, [model]);
  // 选中的机器被删 / 未归属清空时退回「全部」，不让scope条指着空气。
  const activeSmScope =
    smScope !== 'all' && !(smScope === 'unassigned' ? smUnassigned.length > 0 : model.nodes[smScope]?.type === 'Lifecycle')
      ? 'all'
      : smScope;
  const projection = useMemo(
    () =>
      lens === 'er'
        ? applyErScope(model, baseProjection, activeErScope)
        : lens === 'state-machine'
          ? applySmScope(model, baseProjection, activeSmScope)
          : baseProjection,
    [lens, model, baseProjection, activeErScope, activeSmScope],
  );
  const projectionRef = useRef(projection);
  projectionRef.current = projection;
  // 空scope引导：当前视图里一个结构/状态都没有时，给一句说明 + 就地新建入口，不让画布干空着。
  const erStructureInView = useMemo(() => Object.values(projection.nodes).filter((n) => isErStructure(n.type)).length, [projection]);
  const smStateInView = useMemo(() => Object.values(projection.nodes).filter((n) => n.type === 'State').length, [projection]);

  // 结构签名：节点 id + 边(id/type/from/to)。改名/改属性不触发重布局，增删节点/改连线才触发。
  const structKey = useMemo(() => {
    const nodes = Object.keys(projection.nodes).sort().join(',');
    const edges = Object.entries(projection.edges)
      .map(([id, e]) => `${id}:${e.type}:${e.from}>${e.to}`)
      .sort()
      .join(',');
    return `${lens}|${nodes}|${edges}`;
  }, [projection, lens]);

  // 结构变化 / 切镜片 / 折叠切换 / 手动重新布局 → ELK 重算坐标（给没有人工摆位过的节点兜个底）。
  useEffect(() => {
    let cancelled = false;
    void layoutProjection(projectionRef.current, lens, model, foldedRef.current)
      .then((pos) => {
        if (cancelled) return;
        // 折叠改变的是卡片高度，等于整列都要重新码一遍 —— 这时候必须整体覆盖，
        // 只补空缺会让折起来的卡片下面继续留着旧空洞。
        const settled = (next: Positions) => (prev: Partial<Record<LensId, Positions>>) => ({ ...prev, [lens]: next });
        if (forceLayoutRef.current) {
          forceLayoutRef.current = false;
          setAutoPos(settled(pos));
          // 「重新布局」是用户明确的一次决定：把它落进 views.json，刷新/切镜片回来还是这副样子。
          // 代价是这一镜片的自动布局从此被钉住 —— 再加表时旧卡不会自己让位，得再按一次「重新布局」。
          setViews((v) => ({ ...v, [lens]: { ...v[lens], positions: pos } }));
          return;
        }
        // 其余情况只采纳"还没有位置"的节点的坐标：新增一个节点不该把整张画布重新洗牌，
        // 否则你刚双击落下的位置、刚看清的关系，全都会被下一帧挪走。
        setAutoPos((prev) => {
          const cur = prev[lens] ?? {};
          const next = { ...cur };
          for (const [id, p] of Object.entries(pos)) if (!next[id]) next[id] = p;
          return { ...prev, [lens]: next };
        });
      })
      .finally(() => {
        if (cancelled) return;
        // 坐标就位之后再 fit 一次：先 fit 再落位会把"旧坐标"框进视野，看着就是一堆散沙。
        // 用命令式 fitView 而不是换 key 重挂 ReactFlow —— 重挂会让整块画布白一帧，也就是那下"闪"。
        if (pendingFitRef.current) {
          pendingFitRef.current = false;
          setTimeout(() => {
            if (cancelled) return;
            void fitView({
              padding: Object.keys(projectionRef.current.nodes).length > 10 ? 0.08 : 0.16,
              maxZoom: 1.15,
              duration: 0,
            });
          }, 0);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structKey, lens, relayoutNonce]);

  // 只有"整幅视角变了"（切镜片 / 手动重新布局 / ER 换库scope / 状态机换机器scope）才 remount + fitView，而且必须等布局算完。
  // 新增一个节点不该把整张画布重新缩放挪走——否则「落在鼠标处」就白说了。
  useEffect(() => {
    pendingFitRef.current = true;
  }, [lens, relayoutNonce, activeErScope, activeSmScope]);
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

  // 请求追踪 overlay（§2.3）：入口 / 已走过 / 当前。和失效推演一样只是画布上的高亮，绝不改模型。
  const traceRoles = useMemo(() => {
    const out: Record<string, 'entry' | 'visited' | 'current'> = {};
    if (lens !== 'architecture' || !trace) return out;
    for (const id of tracePathNodes(trace)) out[id] = 'visited';
    out[trace.entry] = 'entry';
    out[currentNode(trace)] = 'current';
    return out;
  }, [lens, trace]);
  // 每条走过的边标第几跳（成环时同一条边可能出现多次，取首次）。
  const traceSteps = useMemo(() => {
    const out: Record<string, number> = {};
    if (lens !== 'architecture' || !trace) return out;
    trace.hops.forEach((h, i) => {
      if (out[h.edgeId] === undefined) out[h.edgeId] = i + 1;
    });
    return out;
  }, [lens, trace]);

  // 动态图例的实时读数（架构镜片）：计数逻辑在内核 core/legend.ts（可单测），UI 只摆数字。
  const legendStats = useMemo(() => {
    if (lens !== 'architecture') return null;
    return computeLegendStats(projection.nodes, projection.edges, result, seeds, trace);
  }, [lens, projection, result, seeds, trace]);

  // 每副镜片的错误/反问计数（顶部标签小红点，引导用户去看"顶嘴"）
  const lensBadges = useMemo(() => {
    const out: Record<string, number> = {};
    for (const l of LENSES) out[l.id] = l.reasoner.run(model).filter((f) => f.severity === 'error' || f.severity === 'question').length;
    return out;
  }, [model]);
  const findingsBadge = findings.filter((f) => f.severity === 'error' || f.severity === 'question').length;

  // 质检条用的「体检结果」：架构推演器的单点发现（spof:*）。第一个单点拿来做一键演示。
  const spofFindings = useMemo(() => findings.filter((f) => f.id.startsWith('spof:')), [findings]);
  const demoNodeId = spofFindings[0]?.nodeIds?.[0] ?? null;
  const demoNodeName = demoNodeId ? (model.nodes[demoNodeId]?.name ?? null) : null;

  const positionFor = useCallback(
    (id: string): { x: number; y: number } => {
      // 优先级：用户拖拽持久化坐标 > ELK 自动布局 > sample 手写坐标 > 知识节点偏移 > 默认位。
      const saved = project.views[lens]?.positions[id];
      if (saved) return saved;
      const auto = autoPos[lens]?.[id];
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

  /** 每张表的折叠状态与实际显示的行：折叠只看键列，卡片高度跟着变，布局也跟着重排。 */
  const tableFolds = useMemo(() => {
    const out: Record<string, { all: ErField[]; folded: boolean; rows: ErField[]; hidden: number }> = {};
    if (lens !== 'er') return out;
    for (const [id, n] of Object.entries(projection.nodes)) {
      if (!isErStructure(n.type)) continue;
      const all = erFieldRows(model, id);
      // 没手动选过就按字段数自动折叠：4 列的表全展开，12 列的表默认只露键列。
      const folded = foldedTables[id] ?? shouldAutoFold(all);
      const visible = foldRows(all, folded);
      out[id] = { all, folded, rows: visible.rows, hidden: visible.hidden };
    }
    return out;
  }, [lens, projection, model, foldedTables]);

  /** 这一列现在看得见吗：折叠会把外键锚点从"某一行"退回"整张卡"。 */
  const fieldVisible = useCallback(
    (tableId: string, fieldId?: string): boolean => {
      if (!fieldId) return false;
      const fold = tableFolds[tableId];
      return fold ? fold.rows.some((r) => r.id === fieldId) : false;
    },
    [tableFolds],
  );

  const toggleFold = useCallback(
    (id: string) => {
      const all = erFieldRows(model, id);
      const next = !(foldedTables[id] ?? shouldAutoFold(all));
      // 折叠只改卡片高度：列还是那几列、顺序也没变，所以本地按新高度重码一遍就够了，
      // 不必等 ELK 再来一次异步重排（那中间的几十毫秒正是"闪一下"的来源）。
      // 重码只发生在被点的那一列：锚点顶边不动、同列下方补位，其他列一个像素都不碰。
      const positions: Positions = {};
      const heights: Record<string, number> = {};
      for (const nid of Object.keys(projection.nodes)) {
        const nt = model.nodes[nid]?.type;
        if (!nt || !isErStructure(nt)) continue;
        const rows = erFieldRows(model, nid);
        const folded = nid === id ? next : (foldedTables[nid] ?? shouldAutoFold(rows));
        const visible = foldRows(rows, folded);
        heights[nid] = Math.max(74, foldedCardHeight(visible.rows.length));
        positions[nid] = positionFor(nid);
      }
      const anchor = positions[id] ?? positionFor(id);
      const key = Math.round(anchor.x);
      const entries = Object.keys(positions)
        .filter((nid) => Math.round(positions[nid].x) === key)
        .map((nid) => ({ id: nid, y: positions[nid].y, height: heights[nid] }));
      const ys = packAround(entries, 44, id, anchor.y);
      const out: Positions = {};
      for (const [nid, y] of Object.entries(ys)) out[nid] = { x: positions[nid].x, y };
      // 折叠状态 + 这一列的新 y 一起落进 views.json：坐标一旦被「重新布局」写进去就是权威值，
      // 只写 autoPos 会被它盖住，观感就成了"点了没反应"。
      setViews((v) => {
        const view = v[lens] ?? { positions: {} };
        const prevFolded = view.folded ?? {};
        return {
          ...v,
          [lens]: { ...view, folded: { ...prevFolded, [id]: next }, positions: { ...view.positions, ...out } },
        };
      });
      setAutoPos((prevAll) => ({ ...prevAll, [lens]: { ...(prevAll[lens] ?? {}), ...out } }));
    },
    [model, setViews, lens, foldedTables, projection, positionFor],
  );

  // 只改选择、不动历史（back/forward 与关闭抽屉用）。
  const applyView = useCallback((v: DrawerView) => {
    setSelectedNode(v.node);
    setSelectedEdge(v.edge);
    setCreateMode(false);
  }, []);
  // 导航到某节点/边：把当前视图压入回退栈、清空前进栈（浏览器式）。
  // null（关闭）与「点同一个」不入栈，避免历史里全是噪声。
  const navigate = useCallback(
    (v: DrawerView) => {
      const cur = selRef.current;
      const same = cur.node === v.node && cur.edge === v.edge;
      if ((v.node || v.edge) && !same) {
        if (cur.node || cur.edge) setBackStack((s) => [...s.slice(-49), cur]);
        setFwdStack([]);
      }
      applyView(v);
    },
    [applyView],
  );
  const selectNode = useCallback((id: string | null) => navigate({ node: id, edge: null }), [navigate]);
  const selectEdge = useCallback((id: string | null) => navigate({ node: null, edge: id }), [navigate]);
  const closeDrawer = useCallback(() => applyView({ node: null, edge: null }), [applyView]);
  const startCreate = useCallback(() => {
    setCreateMode(true);
    setSelectedNode(null);
    setSelectedEdge(null);
  }, []);
  // 回退/前进：跳过已被删除的视图（撤销/删除后历史里可能留着悬空 id）。
  const goBack = useCallback(() => {
    const stack = [...backStack];
    let prev: DrawerView | undefined;
    while (stack.length) {
      const v = stack.pop()!;
      if ((v.node && model.nodes[v.node]) || (v.edge && model.edges[v.edge])) {
        prev = v;
        break;
      }
    }
    if (!prev) return;
    setBackStack(stack);
    setFwdStack((f) => [...f, selRef.current]);
    applyView(prev);
  }, [backStack, model, applyView]);
  const goForward = useCallback(() => {
    const stack = [...fwdStack];
    let next: DrawerView | undefined;
    while (stack.length) {
      const v = stack.pop()!;
      if ((v.node && model.nodes[v.node]) || (v.edge && model.edges[v.edge])) {
        next = v;
        break;
      }
    }
    if (!next) return;
    setFwdStack(stack);
    setBackStack((b) => [...b, selRef.current]);
    applyView(next);
  }, [fwdStack, model, applyView]);

  // 左导航分区：点当前已展开分区 → 收起；否则切到该分区并展开。
  const onSection = useCallback(
    (s: NavSection) => {
      if (section === s && navExpanded) {
        setNavExpanded(false);
      } else {
        setSection(s);
        setNavExpanded(true);
      }
    },
    [section, navExpanded],
  );
  const toggleExpand = useCallback(() => setNavExpanded((v) => !v), []);
  const collapseNav = useCallback(() => setNavExpanded(false), []);

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

  // ER 字段原地改名（字段也是节点，走同一守门员）。
  const startFieldRename = useCallback((id: string) => {
    setRenamingId(null);
    setRenamingFieldId(id);
  }, []);
  const commitFieldRename = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim();
      setRenamingFieldId(null);
      if (!trimmed) return;
      setModel((m) => applyPatchChecked(m, { op: 'update-node', id, name: trimmed }));
    },
    [setModel],
  );
  const cancelFieldRename = useCallback(() => setRenamingFieldId(null), []);

  // 拖拽落点 → 写进 views.json（语义与布局分离，挪位置不污染 model diff）。
  const persistPosition = useCallback(
    (id: string, pos: { x: number; y: number }) => {
      setViews((v) => ({ ...v, [lens]: { ...v[lens], positions: { ...v[lens]?.positions, [id]: pos } } }));
    },
    [setViews, lens],
  );

  /**
   * 拖完一张表：ER 里只把同一列的卡片重新码一遍（局部重排），别的列一根手指都不碰。
   * 用户把卡片放到哪，就钉在哪；上下邻居让位，车道和连线跟着这一列重算。
   */
  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      persistPosition(node.id, node.position);
      const draggedType = model.nodes[node.id]?.type;
      if (lens !== 'er' || !draggedType || !isErStructure(draggedType)) return;
      const col = Math.round(node.position.x);
      const siblings = Object.entries(projection.nodes)
        .filter(([id]) => {
          const t = model.nodes[id]?.type;
          return id !== node.id && t !== undefined && isErStructure(t) && Math.round(positionFor(id).x) === col;
        })
        .map(([id]) => {
          const fold = tableFolds[id];
          const height = fold ? Math.max(74, foldedCardHeight(fold.rows.length)) : 74;
          return { id, y: positionFor(id).y, height };
        });
      if (siblings.length === 0) return;
      const fold = tableFolds[node.id];
      const own = fold ? Math.max(74, foldedCardHeight(fold.rows.length)) : 74;
      const moved = reflowColumn(
        [...siblings, { id: node.id, y: node.position.y, height: own }],
        44,
        { id: node.id, y: node.position.y },
      );
      const shifted: Record<string, { x: number; y: number }> = {};
      for (const [id, y] of Object.entries(moved)) {
        if (id === node.id) continue;
        shifted[id] = { x: positionFor(id).x, y };
      }
      // 让位后的纵坐标也要落进 views.json，否则「重新布局」写过的权威坐标会把它们盖回去。
      setViews((v) => {
        const view = v[lens] ?? { positions: {} };
        return { ...v, [lens]: { ...view, positions: { ...view.positions, ...shifted } } };
      });
      setAutoPos((prevAll) => ({ ...prevAll, [lens]: { ...(prevAll[lens] ?? {}), ...shifted } }));
    },
    [persistPosition, lens, model, projection, positionFor, tableFolds],
  );

  // 拖拽连线：先问"这条线是什么语义"，再入模型（只有一种选项的镜片就不问了，省一次点击）。
  const edgeOptions = useMemo(() => connectableEdgeTypes(lens), [lens]);
  const rememberEdge = useCallback((type: EdgeType) => {
    setLastEdge((prev) => {
      const next = { ...prev, [lens]: type };
      try {
        localStorage.setItem(LAST_EDGE_KEY, JSON.stringify(next));
      } catch {
        /* 隐私模式下写不了就只记在内存里 */
      }
      return next;
    });
  }, [lens]);

  const addEdge = useCallback(
    (from: string, to: string, type: EdgeType, link?: { key?: string; cardinality?: '1:1' | '1:N' }) => {
      const id = newEdgeId(type);
      // 外键默认 1:N（与抽屉里的新建连线保持一致），用户可在右侧改基数。
      // 从字段拖出来的外键顺手记住"引用的是哪一列"（attrs.key），ER 推演器靠它判父子关系。
      const edge =
        type === 'fk'
          ? {
              type,
              from,
              to,
              attrs: { cardinality: link?.cardinality ?? ('1:N' as const), ...(link?.key ? { key: link.key } : {}) },
            }
          : { type, from, to };
      setModel((m) => applyPatchChecked(m, { op: 'add-edge', id, edge }));
      rememberEdge(type);
      setPendingConnect(null);
      // 不顺手选中新边：选中会拉开右侧抽屉、盖住画布右半边——刚连完线就被面板撞一下很烦。
      // 想改基数/属性，点一下那根线即可。
      setSelectedEdge(null);
      setSelectedNode(null);
      setCreateMode(false);
    },
    [setModel, rememberEdge],
  );

  /** 一根待定语义的线落地：外键先按字段角色定方向/基数，其余类型照原样入模型。 */
  const commitConnect = useCallback(
    (draft: ConnectDraft, type: EdgeType) => {
      if (type === 'fk') {
        const plan = planFkConnection(model, draft.from, draft.to, draft.sourceField, draft.targetField);
        addEdge(plan.from, plan.to, type, { key: plan.key, cardinality: plan.cardinality });
        return;
      }
      addEdge(draft.from, draft.to, type);
    },
    [model, addEdge],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return;
      const sourceField = fieldIdFromHandle(params.sourceHandle);
      const targetField = fieldIdFromHandle(params.targetHandle);
      // 自引用外键（categories.parent_id → categories.id）是合法建模：只有两端都落在字段上才放行。
      if (params.source === params.target && !(sourceField && targetField)) return;
      const draft: ConnectDraft = {
        from: params.source,
        to: params.target,
        x: pointerRef.current.x,
        y: pointerRef.current.y,
        sourceField,
        targetField,
      };
      // 两端都落在具体字段上：ER 里"某一列指向另一列"只可能是外键，语义已经写在手上，
      // 不必再弹一次类型选择——拖完就是结果，改基数点线即可。
      if (lens === 'er' && sourceField && targetField) {
        commitConnect(draft, 'fk');
        return;
      }
      const preferred = lastEdge[lens] ?? CONNECT_TYPE[lens];
      if (edgeOptions.length <= 1) {
        commitConnect(draft, edgeOptions[0]?.id ?? preferred);
        return;
      }
      setPendingConnect(draft);
    },
    [lens, lastEdge, edgeOptions, commitConnect],
  );

  const onNodeDoubleClick = useCallback<NodeMouseHandler>((_, node) => {
    setRenamingFieldId(null);
    setRenamingId(node.id);
    setSelectedNode(node.id);
  }, []);

  // 重新布局：清掉本镜片的手动坐标，让 ELK 重新接管。
  const relayout = useCallback(() => {
    setViews((v) => ({ ...v, [lens]: { ...v[lens], positions: {} } }));
    // 但 autoPos 不清：清空的那一瞬间所有卡片会先掉回默认位、等 ELK 算完再弹回来，
    // 观感上就是"闪一下"。留着旧坐标当垫子，新结果一到整体替换掉即可。
    forceLayoutRef.current = true;
    setRelayoutNonce((n) => n + 1);
  }, [setViews, lens]);

  // 模型 → React Flow 节点/边的"目标态"。位置由 positionFor 给出权威值。
  const derivedNodes = useMemo<Node<DevDrawNodeData>[]>(
    () =>
      Object.entries(projection.nodes).map(([id, n]) => ({
        id,
        type: 'devdraw',
        position: positionFor(id),
        selected: selectedNode === id,
        data: {
          name: n.name,
          kind: n.type,
          icon: nodeGlyph(model, n),
          componentLabel: nodeComponent(model, n)?.name,
          state: result?.states[id] ?? 'ok',
          isSeed: seeds.includes(id),
          traceRole: traceRoles[id],
          highlighted: highlightNodes.has(id),
          selected: selectedNode === id,
          dataType: typeof n.attrs?.dataType === 'string' ? n.attrs.dataType : undefined,
          nullable: n.attrs?.nullable === true,
          keyRole: typeof n.attrs?.key === 'string' ? n.attrs.key : undefined,
          comment: typeof n.attrs?.comment === 'string' && n.attrs.comment ? n.attrs.comment : undefined,
          initial: n.attrs?.initial === true,
          fieldCount: isErStructure(n.type) ? (tableFolds[id]?.all.length ?? fieldCount(id)) : undefined,
          fields: isErStructure(n.type) ? (tableFolds[id]?.rows ?? fieldsOf(model, id)) : undefined,
          hiddenFields: isErStructure(n.type) ? tableFolds[id]?.hidden || undefined : undefined,
          folded: isErStructure(n.type) ? tableFolds[id]?.folded : undefined,
          // 3 列及以下折起来没意义（键列差不多就是全部），不给按钮。
          foldable: n.type === 'Table' ? (tableFolds[id]?.all.length ?? 0) > 3 : undefined,
          onToggleFold: toggleFold,
          selectedFieldId: isErStructure(n.type) ? selectedNode : undefined,
          onFieldSelect: selectNode,
          renamingFieldId: isErStructure(n.type) ? renamingFieldId : undefined,
          structure: n.type === 'RedisKey' && typeof n.attrs?.structure === 'string' ? n.attrs.structure : undefined,
          ttl: n.type === 'RedisKey' && typeof n.attrs?.ttl === 'string' && n.attrs.ttl ? n.attrs.ttl : undefined,
          onFieldRenameStart: startFieldRename,
          onFieldRename: commitFieldRename,
          onFieldRenameCancel: cancelFieldRename,
          detail: typeof n.attrs?.detail === 'string' ? n.attrs.detail : undefined,
          onSelect: selectNode,
          renaming: renamingId === id,
          onRename: commitRename,
          onRenameCancel: cancelRename,
        },
        draggable: true,
      })),
    [projection, positionFor, result, seeds, traceRoles, highlightNodes, selectedNode, fieldCount, selectNode, renamingId, renamingFieldId, commitRename, cancelRename, startFieldRename, commitFieldRename, cancelFieldRename, model, tableFolds, toggleFold],
  );

  // 外键边 → 具体字段：父表键列在哪一行、子表外键列在哪一行。渲染（handle）与拖线都读这份。
  const fkLinks = useMemo(() => resolveFkLinks(model), [model]);

  /** 本镜片里所有表卡片的包围盒：正交走线靠它判断一条线会不会横穿别家卡片。 */
  const cardRects = useMemo(() => {
    if (lens !== 'er') return [];
    return Object.entries(projection.nodes)
      .filter(([, n]) => isErStructure(n.type))
      .map(([id, n]) => {
        const p = positionFor(id);
        const fold = tableFolds[id];
        const rows = fold ? fold.rows.length : erFieldRows(model, id).length;
        return {
          left: p.x,
          top: p.y,
          right: p.x + NODE_WIDTH[n.type],
          bottom: p.y + Math.max(74, foldedCardHeight(rows)),
        };
      });
  }, [lens, projection, positionFor, model, tableFolds]);

  /**
   * 外键落到哪个字段行：折叠把这一行藏起来时，这条线退回卡片级锚点。
   * 线本身还在（关系没消失），只是不再假装指向看不见的那一行。
   */
  const fkAnchors = useMemo(() => {
    const out: Record<string, FkLink> = {};
    for (const [id, e] of Object.entries(projection.edges)) {
      const link = fkLinks[id];
      if (!link) continue;
      const ok =
        link.fieldLevel && fieldVisible(e.from, link.fromFieldId) && fieldVisible(e.to, link.toFieldId);
      out[id] = ok ? link : { ...link, fieldLevel: false };
    }
    return out;
  }, [projection, fkLinks, fieldVisible]);

  /**
   * 同一源字段散出去的多条外键：给每条分一条竖向车道（lane），否则它们的竖段会叠成一根。
   * 按目标卡片的高度排序分配，扇面因此不会自己跟自己交叉。
   * 顺带把两端的基数标记按锚点去重：多条线落到同一个字段行时，只留一个 1、一个 N。
   */
  const edgeRouting = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const [id, e] of Object.entries(projection.edges)) {
      if (e.type !== 'fk') continue;
      const anchor = fkAnchors[id]?.fieldLevel ? `f:${fkAnchors[id].fromFieldId}` : `n:${e.from}`;
      const list = groups.get(anchor);
      if (list) list.push(id);
      else groups.set(anchor, [id]);
    }
    const out: Record<string, { lane: number; laneCount: number; showSourceTag: boolean; showTargetTag: boolean }> = {};
    for (const ids of groups.values()) {
      const sorted = [...ids].sort((a, b) => {
        const pa = positionFor(projection.edges[a].to);
        const pb = positionFor(projection.edges[b].to);
        return pa.y - pb.y || a.localeCompare(b);
      });
      sorted.forEach((id, index) => {
        out[id] = { lane: index, laneCount: sorted.length, showSourceTag: true, showTargetTag: true };
      });
    }
    const seenSource = new Set<string>();
    const seenTarget = new Set<string>();
    for (const [id, e] of Object.entries(projection.edges)) {
      const link = e.type === 'fk' ? fkAnchors[id] : undefined;
      if (!link?.fieldLevel) continue;
      const sourceKey = `s:${link.fromFieldId}`;
      const targetKey = `t:${link.toFieldId}`;
      const entry = out[id] ?? { lane: 0, laneCount: 1, showSourceTag: true, showTargetTag: true };
      entry.showSourceTag = !seenSource.has(sourceKey);
      entry.showTargetTag = !seenTarget.has(targetKey);
      seenSource.add(sourceKey);
      seenTarget.add(targetKey);
      out[id] = entry;
    }
    return out;
  }, [projection, fkAnchors, positionFor]);

  const derivedEdges = useMemo<Edge<DevDrawEdgeData>[]>(
    () =>
      Object.entries(projection.edges).map(([id, e]) => {
        const effectedBy = e.attrs?.effectedBy;
        const missingService =
          e.type === 'transition' && typeof effectedBy === 'string' && e.attrs?.manual !== true && !model.nodes[effectedBy];
        const link = e.type === 'fk' ? fkAnchors[id] : undefined;
        const routing = edgeRouting[id];
        // 表卡片有十几个 handle（每行左右各一），不点名的话 React Flow 会把无边名的边
        // 接到 DOM 里第一个同类型 handle —— 也就是第一行字段，于是"读这张表"会被画成"读 id 这一列"。
        // 所以表与表之间非外键的线也要显式锚到卡片级锚点。
        const anchored = (nodeId: string, side: 'left' | 'right') => {
          const t = model.nodes[nodeId]?.type;
          return t !== undefined && isErStructure(t) ? ER_ANCHOR_HANDLE[side] : undefined;
        };
        return {
          id,
          source: e.from,
          target: e.to,
          // 外键连到具体字段行：父表键列右侧出线，子表外键列左侧进线。
          // 只有"两端都锚上了字段"才算字段级；锚不全（如 N:M 缺中间表）就整体退回卡片级，
          // 否则会画出"从 id 行出发、飞到另一张表表头"的半吊子线，读者更糊涂。
          sourceHandle:
            !link || !link.fieldLevel
              ? anchored(e.from, 'right')
              : erFieldPort('right', link.fromFieldId ?? ''),
          targetHandle:
            !link || !link.fieldLevel
              ? anchored(e.to, 'left')
              : erFieldPort('left', link.toFieldId ?? ''),
          type: 'devdraw',
          selected: selectedEdge === id,
          // 选中的线抬到最上层（manual 模式，层级自管）。边标签在 DevDrawEdge 里带同一个值，
          // 因为标签经 EdgeLabelRenderer portal 到独立容器，不随边路径一起抬升。
          zIndex: selectedEdge === id ? Z_SELECTED : 0,
          data: {
            edgeType: e.type,
            mode: edgeDependency(e),
            label: e.label,
            impacted: impactedEdges.has(id),
            traced: traceSteps[id] !== undefined,
            traceStep: traceSteps[id],
            highlighted: highlightEdges.has(id),
            cardinality: e.attrs?.cardinality,
            keyCol: e.attrs?.key,
            event: e.attrs?.event,
            missingService,
            fieldLevel: link?.fieldLevel === true,
            ortho: lens === 'er',
            cards: lens === 'er' ? cardRects : undefined,
            lane: routing?.lane ?? 0,
            laneCount: routing?.laneCount ?? 1,
            showSourceTag: routing?.showSourceTag !== false,
            showTargetTag: routing?.showTargetTag !== false,
            onSelect: selectEdge,
          },
        };
      }),
    [projection, model, fkAnchors, edgeRouting, impactedEdges, traceSteps, highlightEdges, selectEdge, selectedEdge, lens, cardRects],
  );

  // 受控画布：onNodesChange/onEdgesChange 实时应用拖拽/选择变更（修复"拖动落地才动"）。
  // 目标态变化时在渲染期同步（而非 effect），保证 remount+fitView 当帧就拿到新坐标。
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node<DevDrawNodeData>>(derivedNodes);
  const [prevDerivedNodes, setPrevDerivedNodes] = useState(derivedNodes);
  if (derivedNodes !== prevDerivedNodes) {
    setPrevDerivedNodes(derivedNodes);
    setRfNodes((prev) => syncNodes(prev, derivedNodes));
  }

  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge<DevDrawEdgeData>>(derivedEdges);
  const [prevDerivedEdges, setPrevDerivedEdges] = useState(derivedEdges);
  if (derivedEdges !== prevDerivedEdges) {
    setPrevDerivedEdges(derivedEdges);
    setRfEdges(derivedEdges);
  }

  // 选中 / 拖拽中的节点抬到最上层。读 rfNodes 的实时 selected/dragging，而不是 App 的 selectedNode：
  // 拖拽时 React Flow 会先把节点标记 selected，但 App 的选中态未必同步——以画布实时态为准，
  // 拖动中的卡片才不会钻到别的卡片底下。manual 模式下 React Flow 不再自动抬升，层级全由这里说了算。
  const renderNodes = useMemo(
    () => rfNodes.map((n) => ({ ...n, zIndex: n.selected || n.dragging ? Z_SELECTED : 0 })),
    [rfNodes],
  );

  const applySeeds = useCallback(
    (next: string[], forLens: LensId) => {
      setSeeds(next);
      // 场景写进 views：刷新/换设备后 still 是你上次在推演的那个假设。
      setViews((v) => ({ ...v, [forLens]: { ...(v[forLens] ?? { positions: {} }), seeds: next } }));
    },
    [setViews],
  );

  const toggleSeed = useCallback(
    (id: string) => {
      applySeeds(seeds.includes(id) ? seeds.filter((x) => x !== id) : [...seeds, id], lens);
    },
    [seeds, lens, applySeeds],
  );

  const switchLens = useCallback(
    (id: LensId) => {
      setLens(id);
      setSelectedEdge(null);
      setSelectedNode(null);
      setActiveFinding(null);
      setCreateMode(false);
      setRenamingId(null);
      setRenamingFieldId(null);
      // 换镜片等于换了一个世界，旧镜片的钻取历史不再有意义。
      setBackStack([]);
      setFwdStack([]);
      // 每个镜片有自己的场景：切过去就该看见那个镜片上次在推演的东西。
      setSeeds(project.views[id]?.seeds ?? []);
      setTrace(project.views[id]?.trace ?? null);
      setBaseline(null);
    },
    [project.views],
  );

  // ── 请求追踪（§2.3）：场景和 seeds 一样是 what-if 假设，写进 views 而非 model ──
  const applyTrace = useCallback(
    (next: TraceScenario | null, forLens: LensId) => {
      setTrace(next);
      setViews((v) => ({ ...v, [forLens]: { ...(v[forLens] ?? { positions: {} }), trace: next ?? undefined } }));
    },
    [setViews],
  );

  // 从 Actor/Endpoint 起一条追踪：永远落在架构镜片（请求路径只在那副镜片里有意义）。
  const startTraceFrom = useCallback(
    (entry: string) => {
      const target: LensId = 'architecture';
      if (lens !== target) switchLens(target);
      const scenario = startTrace(model, entry);
      if (scenario) applyTrace(scenario, target);
      setSection('trace');
      setNavExpanded(true);
    },
    [lens, model, switchLens, applyTrace],
  );

  // ── 推演邀请（质检条）：把「思考是建模的质检」落到第一屏 ──
  // 一键演示：把体检出的第一个单点设为失效源，直接看爆炸半径（此时 seeds 必为空，toggle 即添加）。
  const nudgeDemo = useCallback(() => {
    if (!demoNodeId) return;
    toggleSeed(demoNodeId);
    setSection('simulation');
    setNavExpanded(true);
  }, [demoNodeId, toggleSeed]);
  const nudgeSimulate = useCallback(() => {
    setSection('simulation');
    setNavExpanded(true);
  }, []);
  const nudgeTrace = useCallback(() => {
    setSection('trace');
    setNavExpanded(true);
  }, []);
  const dismissNudge = useCallback(() => {
    setNudgeDismissed(true);
    try {
      localStorage.setItem('devdraw-nudge-off', '1');
    } catch {
      /* 隐私模式等写不进就算了，本次会话内仍然生效 */
    }
  }, []);

  // 右键：恢复它该有的样子——列出能对**这个节点**做的事（设为失效源只是其中一项）。
  const onNodeContextMenu: NodeMouseHandler = useCallback((event, node) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
  }, []);

  const deleteNode = useCallback(
    (id: string) => {
      setModel((m) => applyPatch(m, { op: 'remove-node', id }));
      setSelectedNode((cur) => (cur === id ? null : cur));
      setRenamingId((cur) => (cur === id ? null : cur));
      setEditorNode((cur) => (cur?.id === id ? null : cur));
    },
    [setModel],
  );

  const deleteEdge = useCallback(
    (id: string) => {
      setModel((m) => applyPatch(m, { op: 'remove-edge', id }));
      setSelectedEdge((cur) => (cur === id ? null : cur));
      setEdgeEditor((cur) => (cur === id ? null : cur));
    },
    [setModel],
  );

  // 右键关系：与节点同一套菜单语言，编辑收进弹窗、删除两步确认。
  const onEdgeContextMenu: EdgeMouseHandler = useCallback((event, edge) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, edgeId: edge.id });
  }, []);

  // 抽屉创建态：建节点并选中（选中即退出 createMode，落到只读详情）。
  const createNode = useCallback(
    (type: NodeType, name: string) => {
      const id = newNodeId(type);
      setModel((m) => applyPatchChecked(m, { op: 'add-node', id, node: { type, name, provenance: { by: 'human' } } }));
      selectNode(id);
    },
    [setModel, selectNode],
  );

  const menuItems = useMemo<MenuItem[]>(() => {
    const id = contextMenu?.nodeId;
    const node = id ? model.nodes[id] : undefined;
    if (!id || !node) return [];
    const items: MenuItem[] = [];
    if (lens === 'architecture' && SEEDABLE.has(node.type)) {
      const on = seeds.includes(id);
      items.push({
        key: 'seed',
        label: on ? '取消失效源' : '设为失效源',
        hint: on ? '回到正常' : '看它拖垮谁',
        onSelect: () => {
          toggleSeed(id);
          setSection('simulation');
          setNavExpanded(true);
        },
      });
    }
    if (lens === 'architecture' && (node.type === 'Actor' || node.type === 'Endpoint')) {
      items.push({
        key: 'trace',
        label: '追踪请求',
        hint: '一步步走',
        onSelect: () => startTraceFrom(id),
      });
    }
    // 单一编辑入口：详情 / 外观在弹窗内用 tab 划分（读 / 写分离）。
    items.push({ key: 'edit', label: '编辑…', hint: '属性 / 字段 / 外观', onSelect: () => setEditorNode({ id, tab: 'attrs' }) });
    items.push({
      key: 'rename',
      label: '重命名',
      hint: '原地改',
      onSelect: () => {
        // 只进原地改名，不选中节点——选中会顺手拉开右侧抽屉，把刚要看的那块画布盖掉。
        setRenamingId(id);
      },
    });
    items.push({ key: 'delete', label: '删除', tone: 'danger', confirmLabel: '确认删除？再点一次', onSelect: () => deleteNode(id) });
    return items;
  }, [contextMenu, model, lens, seeds, toggleSeed, startTraceFrom, deleteNode]);

  const edgeMenuItems = useMemo<MenuItem[]>(() => {
    const id = contextMenu?.edgeId;
    const edge = id ? model.edges[id] : undefined;
    if (!id || !edge) return [];
    return [
      { key: 'edit', label: '编辑关系…', hint: '标签 / 依赖', onSelect: () => setEdgeEditor(id) },
      { key: 'delete', label: '删除', tone: 'danger', confirmLabel: '确认删除？再点一次', onSelect: () => deleteEdge(id) },
    ];
  }, [contextMenu, model, deleteEdge]);

  // 双击空白：就地新建（组件或空白类型），落在鼠标处。
  const openQuickCreate = useCallback(
    (e: ReactMouseEvent) => {
      // Background 的 svg 盖在 pane 上，所以不能只认 .react-flow__pane——
      // 只要不在任何节点/控件里，就算"空白处"。
      const el = e.target as HTMLElement;
      if (el.closest('.react-flow__node') || el.closest('.react-flow__controls') || el.closest('.react-flow__minimap')) return;
      // scope 条等面板上的双击有自己的语义（机器chip双击改名），不该再弹就地新建。
      if (el.closest('.react-flow__panel')) return;
      if (!el.closest('.react-flow')) return;
      const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      setSelectedNode(null);
      setSelectedEdge(null);
      setCreateMode(false);
      setRenamingId(null);
      setQuickCreate({ x: e.clientX, y: e.clientY, flow });
    },
    [screenToFlowPosition],
  );

  // 让"落点"等于鼠标处：节点坐标记的是左上角，所以要退半个身位（否则总是偏在右下）。
  const centerAt = useCallback(
    (type: NodeType, name: string, at: { x: number; y: number }) => ({
      x: Math.round(at.x - NODE_WIDTH[type] / 2),
      y: Math.round(at.y - nodeHeight(model, '', type, name) / 2),
    }),
    [model],
  );

  const quickPlaceComponent = useCallback(
    (comp: ComponentDef) => {
      const spot = quickCreate;
      setQuickCreate(null);
      if (!spot) return;
      const id = newNodeId(comp.baseType);
      setModel((m) => applyPatchChecked(m, { op: 'add-node', id, node: nodeFromComponent(comp) }));
      persistPosition(id, centerAt(comp.baseType, comp.name, spot.flow));
      setSelectedNode(id);
      setSelectedEdge(null);
      setCreateMode(false);
    },
    [quickCreate, setModel, persistPosition, centerAt],
  );

  const quickPlaceType = useCallback(
    (type: NodeType) => {
      const spot = quickCreate;
      setQuickCreate(null);
      if (!spot) return;
      const id = newNodeId(type);
      const name = NODE_TYPES[type].label;
      setModel((m) => applyPatchChecked(m, { op: 'add-node', id, node: { type, name, provenance: { by: 'human' } } }));
      persistPosition(id, centerAt(type, name, spot.flow));
      setSelectedNode(id);
      setSelectedEdge(null);
      setCreateMode(false);
      // 空白节点的名字本来就得当场起，建完直接进入原地改名。
      // 但不投影的类型（生命周期锚点）画布上没有卡片可改名——进编辑器起名，scope 条会立刻出现它。
      if (lensDef.nodeTypes.includes(type)) setRenamingId(id);
      else setEditorNode({ id, tab: 'attrs' });
    },
    [quickCreate, setModel, persistPosition, centerAt, lensDef],
  );

  // 空scope引导的「新建」：不依赖双击落点，直接放在当前视口中心。
  const placeCentered = useCallback(
    (type: NodeType) => {
      const flow = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
      const id = newNodeId(type);
      const name = NODE_TYPES[type].label;
      setModel((m) => applyPatchChecked(m, { op: 'add-node', id, node: { type, name, provenance: { by: 'human' } } }));
      persistPosition(id, centerAt(type, name, flow));
      setSelectedNode(id);
      setSelectedEdge(null);
      setCreateMode(false);
      if (lensDef.nodeTypes.includes(type)) setRenamingId(id);
      else setEditorNode({ id, tab: 'attrs' });
    },
    [screenToFlowPosition, setModel, persistPosition, centerAt, lensDef],
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

  // 推演面板里点失效源：若不在架构镜片，先跳过去，让控制永远有可见反馈。
  const toggleSeedFromPanel = useCallback(
    (id: string) => {
      const target: LensId = 'architecture';
      // 从目标镜片自己的场景出发算下一步，别被当前镜片的 seeds 带偏。
      const base = lens === target ? seeds : project.views[target]?.seeds ?? [];
      if (lens !== target) switchLens(target);
      applySeeds(base.includes(id) ? base.filter((x) => x !== id) : [...base, id], target);
    },
    [lens, seeds, project.views, switchLens, applySeeds],
  );

  const clearScenario = useCallback(() => {
    applySeeds([], lens);
    setBaseline(null);
  }, [applySeeds, lens]);

  // 追踪的其余操作（步进/退跳/注解/建议路径/沉淀知识节点）都建立在上面的 applyTrace 之上。
  const stepTraceEdge = useCallback(
    (edgeId: string) => {
      if (!trace) return;
      const next = stepTrace(model, trace, edgeId);
      if (next) applyTrace(next, lens);
    },
    [trace, model, lens, applyTrace],
  );

  const undoTraceHop = useCallback(() => {
    if (!trace) return;
    applyTrace(undoTrace(trace), lens);
  }, [trace, lens, applyTrace]);

  const clearTrace = useCallback(() => applyTrace(null, lens), [applyTrace, lens]);

  const annotateTraceHop = useCallback(
    (index: number, note: string) => {
      if (!trace) return;
      applyTrace(annotateHop(trace, index, note), lens);
    },
    [trace, lens, applyTrace],
  );

  // 点建议路径：若当前已走的是它的前缀，就接着走（保住已有注解）；否则从入口重走。
  const walkTracePath = useCallback(
    (edgeIds: string[]) => {
      if (!trace) return;
      const isPrefix = trace.hops.length <= edgeIds.length && trace.hops.every((h, i) => edgeIds[i] === h.edgeId);
      let scenario: TraceScenario = isPrefix ? trace : startTrace(model, trace.entry) ?? trace;
      for (const id of edgeIds.slice(isPrefix ? trace.hops.length : 0)) {
        const next = stepTrace(model, scenario, id);
        if (!next) break;
        scenario = next;
      }
      applyTrace(scenario, lens);
    },
    [trace, model, lens, applyTrace],
  );

  // 注解一键沉淀为知识节点：复用推演器的 recordPatch 机制（靠 attrs.about 定位，无需连边）。
  // topic 带上 kind，决策与假设各自幂等——先记决策再记假设不会互相覆盖。
  const recordTraceHop = useCallback(
    (index: number, kind: 'Decision' | 'Assumption') => {
      if (!trace) return;
      const hop = trace.hops[index];
      if (!hop) return;
      const fromName = model.nodes[hop.from]?.name ?? hop.from;
      const toName = model.nodes[hop.to]?.name ?? hop.to;
      const edge = model.edges[hop.edgeId];
      const latency = typeof edge?.attrs?.latencyMs === 'number' ? edge.attrs.latencyMs : undefined;
      const when = typeof edge?.attrs?.when === 'string' ? edge.attrs.when : undefined;
      const name = hop.note?.trim() || `第 ${index + 1} 跳：${fromName} → ${toName}`;
      const detail =
        `请求追踪 第 ${index + 1} 跳：${fromName} → ${toName}` +
        (latency !== undefined ? ` · ${latency}ms` : '') +
        (when ? ` · 当 ${when}` : '') +
        (hop.note ? `。注解：${hop.note}` : '');
      const topic = `trace:${hop.edgeId}:${kind}`;
      const existing = findRecord(model, hop.to, topic);
      const patch = existing
        ? { op: 'update-node' as const, id: existing[0], name, attrs: { detail } }
        : recordPatch(kind, newNodeId(kind), name, hop.to, topic, detail);
      setModel((m) => applyPatchChecked(m, patch));
    },
    [trace, model, setModel],
  );

  // ── 推演会话：把「场景 + 此刻的结论」存进 reasoning/<id>.json ──
  const archiveSession = useCallback(() => {
    const session = createSession({
      lens,
      lensLabel: getLens(lens).label,
      seeds,
      seedNames: seeds.map((id) => model.nodes[id]?.name ?? id),
      findings,
      blast: result
        ? {
            failed: result.blastRadius.failed,
            degraded: result.blastRadius.degraded,
            affectedEntries: [...result.blastRadius.affectedEntries],
          }
        : undefined,
      trace:
        lens === 'architecture' && trace && trace.hops.length > 0
          ? { entry: trace.entry, hops: trace.hops, latencyMs: traceLatency(model, trace) }
          : undefined,
      traceEntryName: trace ? model.nodes[trace.entry]?.name : undefined,
    });
    void project.saveSession(session);
    setActiveSessionId(session.id);
    setSection('sessions');
    setNavExpanded(true);
  }, [lens, seeds, model, findings, result, trace, project]);

  // 「看一份存档」和「把存档恢复成当前场景」是两件事：
  // 点列表只是选中它、看当时→现在的对账（viewSession），不该悄悄改掉你正在推演的场景；
  // 只有明确点「恢复这个场景」才真的把 seeds/trace 应用回来（restoreSession）。
  const viewSession = useCallback((session: ReasoningSession) => {
    setActiveSessionId(session.id);
  }, []);
  const restoreSession = useCallback(
    (session: ReasoningSession) => {
      if (session.lens !== lens) switchLens(session.lens);
      applySeeds(session.seeds, session.lens);
      applyTrace(session.trace ? { entry: session.trace.entry, hops: session.trace.hops } : null, session.lens);
      setBaseline(null);
      setActiveSessionId(session.id);
    },
    [lens, switchLens, applySeeds, applyTrace],
  );

  const removeSession = useCallback(
    (id: string) => {
      void project.deleteSession(id);
      setActiveSessionId((cur) => (cur === id ? null : cur));
    },
    [project],
  );

  const resetAll = useCallback(() => {
    project.loadSample();
    setSeeds([]);
    setTrace(null);
    setBaseline(null);
    setSelectedEdge(null);
    setSelectedNode(null);
    setActiveFinding(null);
    setCreateMode(false);
    setActiveSessionId(null);
    setBackStack([]);
    setFwdStack([]);
  }, [project]);

  // 重置示例会丢掉当前模型，是破坏性操作——两步确认：先点一下「上膛」，3 秒内再点才真的重置。
  // 用按钮自身的文案变化做确认，不弹模态打断心流（§2.2 推演不打断建模）。
  const [resetArmed, setResetArmed] = useState(false);
  const resetTimerRef = useRef<number | null>(null);
  useEffect(() => () => { if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current); }, []);
  const handleResetClick = useCallback(() => {
    if (resetArmed) {
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
      setResetArmed(false);
      resetAll();
      return;
    }
    setResetArmed(true);
    resetTimerRef.current = window.setTimeout(() => setResetArmed(false), 3000);
  }, [resetArmed, resetAll]);

  // ── 组件库：点添加 / 拖入画布 / 自定义组件 CRUD（语义底座稳定，图标是表现层）──
  const addComponent = useCallback(
    (comp: ComponentDef, position?: { x: number; y: number }) => {
      const id = newNodeId(comp.baseType);
      const node = nodeFromComponent(comp);
      setModel((m) => applyPatchChecked(m, { op: 'add-node', id, node }));
      if (position) persistPosition(id, position);
      setSelectedNode(id);
      setSelectedEdge(null);
      setCreateMode(false);
    },
    [setModel, persistPosition],
  );

  const onDragOver = useCallback((e: DragEvent) => {
    if (e.dataTransfer.types.includes(COMPONENT_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      const compId = e.dataTransfer.getData(COMPONENT_MIME);
      if (!compId) return;
      e.preventDefault();
      const comp = resolveComponent(model, compId);
      if (!comp) return;
      addComponent(comp, screenToFlowPosition({ x: e.clientX, y: e.clientY }));
    },
    [model, screenToFlowPosition, addComponent],
  );

  const saveComponent = useCallback(
    (comp: ComponentDef) => {
      setModel((m) =>
        applyPatchChecked(
          m,
          m.components?.[comp.id]
            ? { op: 'update-component', id: comp.id, component: comp }
            : { op: 'add-component', id: comp.id, component: comp },
        ),
      );
      setComponentEditor(null);
    },
    [setModel],
  );

  const deleteComponent = useCallback(
    (id: string) => {
      setModel((m) => applyPatchChecked(m, { op: 'remove-component', id }));
      setComponentEditor(null);
    },
    [setModel],
  );

  const onModelChange = useCallback((next: Model) => setModel(next), [setModel]);
  const drawerOpen = createMode || selectedNode !== null || selectedEdge !== null;
  // 质检条只在架构镜片的「建模态」出现：没在模拟/追踪、模型非空、且用户没关掉。
  // 一旦开始推演（seeds 或 trace 非空）或已打开推演面板就让位，不挡正在进行的思考——
  // 这样点横幅自己的「模拟失效 / 追踪请求」按钮时，横幅会 visibly 退场，给出明确反馈。
  const showNudge =
    lens === 'architecture' &&
    !nudgeDismissed &&
    seeds.length === 0 &&
    !trace &&
    section !== 'simulation' &&
    section !== 'trace' &&
    Object.keys(model.nodes).length > 0;

  // 键盘：Ctrl/Cmd+Z 撤销、Ctrl/Cmd+Shift+Z 或 Ctrl+Y 重做；Esc 关抽屉；Alt+←/→ 抽屉回退/前进。
  // 输入框内一律不拦截（让输入框自己处理 Esc/方向键）。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const inField = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (inField) return;
      if (e.key === 'Escape') {
        if (drawerOpen) {
          e.preventDefault();
          closeDrawer();
        }
        return;
      }
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        goBack();
        return;
      }
      if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        goForward();
        return;
      }
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;
      e.preventDefault();
      if (key === 'y' || e.shiftKey) project.redo();
      else project.undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [project.redo, project.undo, drawerOpen, closeDrawer, goBack, goForward]);

  // 撤销/重做或删除可能让选中实体/边消失 → 清掉悬空选择，避免抽屉读到不存在的节点。
  useEffect(() => {
    if (selectedNode && !model.nodes[selectedNode]) setSelectedNode(null);
    if (selectedEdge && !model.edges[selectedEdge]) setSelectedEdge(null);
  }, [model, selectedNode, selectedEdge]);

  return (
    <div className="dd-app">
      <header className="dd-header">
        <div className="dd-brand">
          <span className="dd-brand-mark" title="DevDraw · 研绘">
            <LogoIcon size={24} />
          </span>
          <span className="dd-brand-name">DevDraw</span>
          <span className="dd-brand-sub">研绘</span>
        </div>
        <div className="dd-model-name" title={model.name}>{model.name}</div>
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
        <div className="dd-actions">
          <div className="dd-action-group" role="group" aria-label="历史">
            <button
              className="dd-icon-btn"
              onClick={project.undo}
              disabled={!project.canUndo}
              title="撤销 (Ctrl+Z)"
              aria-label="撤销"
            >
              <UndoIcon size={16} />
            </button>
            <button
              className="dd-icon-btn"
              onClick={project.redo}
              disabled={!project.canRedo}
              title="重做 (Ctrl+Shift+Z)"
              aria-label="重做"
            >
              <RedoIcon size={16} />
            </button>
          </div>
          <span className="dd-action-divider" aria-hidden="true" />
          {lens === 'architecture' && (
            <button
              className="dd-tool-btn"
              onClick={clearScenario}
              disabled={seeds.length === 0}
              title="清除当前失效源与推演结果，回到干净画布"
            >
              清除推演
            </button>
          )}
          <button className="dd-tool-btn" onClick={project.exportZip} title="把当前状态打包下载一份 zip 快照（备份 / 分享 / 换浏览器）">
            导出 zip
          </button>
          <button
            className={`dd-tool-btn dd-tool-danger${resetArmed ? ' armed' : ''}`}
            onClick={handleResetClick}
            title={resetArmed ? '再点一次确认重置（会丢掉当前模型）' : '重置为内置示例模型（会丢掉当前模型）'}
          >
            {resetArmed ? '确认重置？' : '重置示例'}
          </button>
        </div>
      </header>
      <div className="dd-main">
        <NavRail
          section={section}
          expanded={navExpanded}
          findingsBadge={findingsBadge}
          simulationBadge={seeds.length}
          traceBadge={trace?.hops.length ?? 0}
          sessionsBadge={project.sessions.length}
          theme={theme.theme}
          onSection={onSection}
          onToggleExpand={toggleExpand}
          onToggleTheme={theme.toggle}
        />
        {navExpanded &&
          (section === 'library' ? (
            <ComponentLibrary
              model={model}
              lens={lensDef}
              onAdd={addComponent}
              onCreateCustom={() => setComponentEditor({ editing: null })}
              onEditCustom={(c) => setComponentEditor({ editing: c })}
              onDeleteCustom={deleteComponent}
              onClose={collapseNav}
            />
          ) : section === 'simulation' ? (
            <SimulationPanel
              model={model}
              lens={lensDef}
              seeds={seeds}
              result={result}
              baseline={baseline}
              onToggleSeed={toggleSeedFromPanel}
              onClearScenario={clearScenario}
              onSelectNode={selectNode}
              onClose={collapseNav}
            />
          ) : section === 'trace' ? (
            <TracePanel
              model={model}
              lens={lensDef}
              trace={lens === 'architecture' ? trace : null}
              onStart={startTraceFrom}
              onStep={stepTraceEdge}
              onWalkPath={walkTracePath}
              onUndo={undoTraceHop}
              onClear={clearTrace}
              onAnnotate={annotateTraceHop}
              onRecord={recordTraceHop}
              onArchive={archiveSession}
              onSelectNode={selectNode}
              onClose={collapseNav}
            />
          ) : section === 'sessions' ? (
            <SessionsPanel
              model={model}
              sessions={project.sessions}
              activeId={activeSessionId}
              onArchive={archiveSession}
              onView={viewSession}
              onOpen={restoreSession}
              onDelete={removeSession}
              onClose={collapseNav}
            />
          ) : (
            <NavPanel
              section={section}
              lens={lensDef}
              model={model}
              projection={projection}
              findings={findings}
              activeFinding={activeFinding}
              selectedNode={selectedNode}
              onSelectFinding={setActiveFinding}
              onAnswer={answer}
              onSelectNode={selectNode}
              onCreate={startCreate}
              onClose={collapseNav}
            />
          ))}
        <div
          className="dd-canvas"
          ref={canvasRef}
          onPointerMove={(e) => {
            pointerRef.current = { x: e.clientX, y: e.clientY };
          }}
          onDoubleClick={openQuickCreate}
        >
          <ReactFlow
            key={lens}
            nodes={renderNodes}
            edges={rfEdges}
            // 层级自管：选中的组件/线（含边标签）永远盖在最上层，见 renderNodes / derivedEdges / DevDrawEdge。
            zIndexMode="manual"
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            deleteKeyCode={null}
            onNodeContextMenu={onNodeContextMenu}
            onEdgeContextMenu={onEdgeContextMenu}
            onNodeDoubleClick={onNodeDoubleClick}
            onNodeDragStop={onNodeDragStop}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onEdgeClick={(_, edge) => selectEdge(edge.id)}
            onPaneClick={() => {
              setSelectedEdge(null);
              setSelectedNode(null);
              setActiveFinding(null);
              setRenamingId(null);
              setCreateMode(false);
              // 点空白处顺手收起所有画布浮层（它们都是"临时的"）。
              setQuickCreate(null);
              setPendingConnect(null);
              setContextMenu(null);
            }}
            connectionLineStyle={{ stroke: 'var(--accent)', strokeWidth: 2 }}
            zoomOnDoubleClick={false}
            fitView
            fitViewOptions={{ padding: derivedNodes.length > 10 ? 0.08 : 0.16, maxZoom: 1.15 }}
            minZoom={0.3}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color="var(--canvas-dot)" />
            {lens === 'er' && (erDbs.length > 0 || erUnassigned.length > 0) && (
              <Panel position="top-center" className="dd-scope-panel">
                <div className="dd-scope-bar" role="group" aria-label="按数据库筛选 ER 内容">
                  <button
                    type="button"
                    className={`dd-scope-chip${activeErScope === 'all' ? ' active' : ''}`}
                    aria-pressed={activeErScope === 'all'}
                    onClick={() => setErScope('all')}
                  >
                    全部
                    <span className="dd-scope-count">{erTableTotal}</span>
                  </button>
                  {erDbs.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      className={`dd-scope-chip${activeErScope === d.id ? ' active' : ''}`}
                      aria-pressed={activeErScope === d.id}
                      onClick={() => setErScope(d.id)}
                      title={`${d.name} · ${engineLabel(d.engine)} · ${d.tableIds.length} 张表/键`}
                    >
                      {d.name}
                      <span className="dd-scope-engine">{engineLabel(d.engine)}</span>
                      <span className="dd-scope-count">{d.tableIds.length}</span>
                    </button>
                  ))}
                  {erUnassigned.length > 0 && (
                    <button
                      type="button"
                      className={`dd-scope-chip${activeErScope === 'unassigned' ? ' active' : ''}`}
                      aria-pressed={activeErScope === 'unassigned'}
                      onClick={() => setErScope('unassigned')}
                    >
                      未归属
                      <span className="dd-scope-count">{erUnassigned.length}</span>
                    </button>
                  )}
                </div>
              </Panel>
            )}
            {lens === 'state-machine' && (smMachines.length > 0 || smUnassigned.length > 0) && (
              <Panel position="top-center" className="dd-scope-panel">
                <div className="dd-scope-bar" role="group" aria-label="按生命周期筛选状态机内容">
                  <button
                    type="button"
                    className={`dd-scope-chip${activeSmScope === 'all' ? ' active' : ''}`}
                    aria-pressed={activeSmScope === 'all'}
                    onClick={() => setSmScope('all')}
                  >
                    全部
                    <span className="dd-scope-count">{smStateTotal}</span>
                  </button>
                  {smMachines.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={`dd-scope-chip${activeSmScope === m.id ? ' active' : ''}`}
                      aria-pressed={activeSmScope === m.id}
                      onClick={() => setSmScope(m.id)}
                      onDoubleClick={() => setEditorNode({ id: m.id, tab: 'attrs' })}
                      title={`${m.name} · ${m.stateIds.length} 个状态 · 双击改名`}
                    >
                      {m.name}
                      {m.ownerName && <span className="dd-scope-engine">{m.ownerName}</span>}
                      <span className="dd-scope-count">{m.stateIds.length}</span>
                    </button>
                  ))}
                  {smUnassigned.length > 0 && (
                    <button
                      type="button"
                      className={`dd-scope-chip${activeSmScope === 'unassigned' ? ' active' : ''}`}
                      aria-pressed={activeSmScope === 'unassigned'}
                      onClick={() => setSmScope('unassigned')}
                    >
                      未归属
                      <span className="dd-scope-count">{smUnassigned.length}</span>
                    </button>
                  )}
                </div>
              </Panel>
            )}
            {lens === 'er' && erStructureInView === 0 && (
              <Panel position="top-center" className="dd-scope-empty-panel">
                <div className="dd-scope-empty">
                  <p>
                    {activeErScope === 'all'
                      ? '这个镜片还没有表或 Redis 键。'
                      : activeErScope === 'unassigned'
                        ? '没有未归属的表/键。'
                        : '这个数据库下还没有表/键。'}
                  </p>
                  <div className="dd-scope-empty-actions">
                    <button type="button" className="dd-primary" onClick={() => placeCentered('Table')}>
                      新建表
                    </button>
                    <button type="button" className="dd-ghost" onClick={() => placeCentered('RedisKey')}>
                      新建 Redis 键
                    </button>
                  </div>
                </div>
              </Panel>
            )}
            {lens === 'state-machine' && smStateInView === 0 && (
              <Panel position="top-center" className="dd-scope-empty-panel">
                <div className="dd-scope-empty">
                  <p>{activeSmScope === 'all' ? '这个镜片还没有状态。' : activeSmScope === 'unassigned' ? '没有未归属的状态。' : '这个生命周期下还没有状态。'}</p>
                  <div className="dd-scope-empty-actions">
                    <button type="button" className="dd-primary" onClick={() => placeCentered('State')}>
                      新建状态
                    </button>
                  </div>
                </div>
              </Panel>
            )}
            <Controls
              showZoom={false}
              showFitView={false}
              showInteractive={false}
              position="bottom-right"
              style={{ right: 190, bottom: 0 }}
            >
              {/* 四个按钮全部自带图标：React Flow 内置的是实心图形，混在描边图标里粗细不一。 */}
              <ControlButton onClick={() => void zoomIn({ duration: 140 })} title="放大" aria-label="放大">
                <PlusIcon size={15} />
              </ControlButton>
              <ControlButton onClick={() => void zoomOut({ duration: 140 })} title="缩小" aria-label="缩小">
                <MinusIcon size={15} />
              </ControlButton>
              <ControlButton onClick={() => void fitView({ padding: 0.16, duration: 220 })} title="适应视图" aria-label="适应视图">
                <FitFrameIcon size={15} />
              </ControlButton>
              <ControlButton
                onClick={toggleFullscreen}
                title={fullscreen ? '退出全屏 (Esc)' : '画布全屏'}
                aria-label={fullscreen ? '退出全屏' : '画布全屏'}
              >
                {fullscreen ? <MinimizeIcon size={15} /> : <MaximizeIcon size={15} />}
              </ControlButton>
            </Controls>
            <MiniMap
              pannable
              zoomable
              style={{ width: 176, height: 116 }}
              nodeColor={(n) => {
                const data = n.data as DevDrawNodeData;
                if (data.traceRole === 'current') return 'var(--info)';
                const state = data.state;
                return state === 'failed' ? 'var(--danger)' : state === 'degraded' ? 'var(--warning)' : 'var(--minimap-node)';
              }}
            />
          </ReactFlow>
          {showNudge && (
            <ReasoningNudge
              spofCount={spofFindings.length}
              demoNodeName={demoNodeName}
              onDemo={nudgeDemo}
              onSimulate={nudgeSimulate}
              onTrace={nudgeTrace}
              onDismiss={dismissNudge}
            />
          )}
          {legendStats && <DynamicLegend {...legendStats} />}
          <div className="dd-canvas-status">
            {/* 还没落到磁盘上时，"打开文件夹"和"未持久化"是同一件事的两面，放一起看更顺：
                左边给你解决办法，右边是当前状态。 */}
            {/* 刷新后浏览器还压着上次那个文件夹的权限（没有用户手势不给续），这时候
                悄悄退回示例数据是最坏的结果 —— 所以先把"接回来"摆在最显眼的位置。 */}
            {project.pendingFolder && (
              <button
                className="dd-status-open is-attn"
                onClick={() => void project.reconnectFolder()}
                title="浏览器需要你点一下才允许继续读写这个文件夹，点了就会读回磁盘上的项目"
              >
                继续编辑「{project.pendingFolder}」
              </button>
            )}
            {project.fsaSupported && project.storeKind !== 'folder' && !project.pendingFolder && (
              <button
                className="dd-status-open"
                onClick={() => void project.openFolder()}
                title="授权一个本地文件夹，之后每次改动自动保存到磁盘"
              >
                打开文件夹
              </button>
            )}
            <StorageBar
              modelName={model.name}
              kind={project.storeKind}
              label={project.storeLabel}
              autoSave={project.autoSave}
              dirty={project.dirty}
              saving={project.saving}
              fsaSupported={project.fsaSupported}
              hideName
              onOpenFolder={() => void project.openFolder()}
              onImportZip={(f) => void project.importZip(f)}
              onExportZip={project.exportZip}
              onSaveNow={() => void project.saveNow()}
            />
          </div>
          <div className="dd-canvas-dock">
            <div className="dd-dock-foot">
              <div className="dd-hint">{HINTS[lens]}</div>
              <button
                className="dd-hint-btn"
                onClick={relayout}
                title="重新布局：清掉当前镜片的摆位，让 ELK 重新排（只影响这一页）"
              >
                <LayoutIcon size={13} />
                重新布局
              </button>
            </div>
          </div>
          {quickCreate && (
            <QuickCreate
              model={model}
              lens={lensDef}
              x={quickCreate.x}
              y={quickCreate.y}
              onPickComponent={quickPlaceComponent}
              onPickType={quickPlaceType}
              onCancel={() => setQuickCreate(null)}
            />
          )}
          {pendingConnect && (
            <EdgePicker
              options={edgeOptions}
              value={lastEdge[lens] ?? CONNECT_TYPE[lens]}
              x={pendingConnect.x}
              y={pendingConnect.y}
              onPick={(type) => commitConnect(pendingConnect, type)}
              onCancel={() => setPendingConnect(null)}
            />
          )}
          {contextMenu && (
            <ContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              title={
                contextMenu.edgeId
                  ? model.edges[contextMenu.edgeId]
                    ? EDGE_TYPES[model.edges[contextMenu.edgeId].type].label
                    : undefined
                  : contextMenu.nodeId
                    ? model.nodes[contextMenu.nodeId]?.name
                    : undefined
              }
              items={contextMenu.edgeId ? edgeMenuItems : menuItems}
              onClose={() => setContextMenu(null)}
            />
          )}
        </div>
        {drawerOpen && (
          <EntityDrawer
            model={model}
            lens={lensDef}
            selectedNode={selectedNode}
            selectedEdge={selectedEdge}
            createMode={createMode}
            findings={findings}
            onCreate={createNode}
            onSelectNode={selectNode}
            onSelectEdge={selectEdge}
            onSelectFinding={setActiveFinding}
            onAnswer={answer}
            seeds={seeds}
            onToggleSeed={toggleSeed}
            onStartTrace={startTraceFrom}
            canBack={backStack.length > 0}
            canForward={fwdStack.length > 0}
            onBack={goBack}
            onForward={goForward}
            onClose={closeDrawer}
          />
        )}
        {componentEditor && (
          <ComponentEditor
            editing={componentEditor.editing}
            onSave={saveComponent}
            onDelete={deleteComponent}
            onClose={() => setComponentEditor(null)}
          />
        )}
        {editorNode && model.nodes[editorNode.id] && (
          <NodeEditor
            model={model}
            node={model.nodes[editorNode.id]}
            nodeId={editorNode.id}
            onChange={onModelChange}
            onDelete={deleteNode}
            onClose={() => setEditorNode(null)}
            initialTab={editorNode.tab}
          />
        )}
        {edgeEditor && model.edges[edgeEditor] && (
          <EdgeEditor
            model={model}
            edge={model.edges[edgeEditor]}
            edgeId={edgeEditor}
            lens={lensDef}
            onChange={onModelChange}
            onChangeMode={changeEdgeMode}
            onDelete={deleteEdge}
            onClose={() => setEdgeEditor(null)}
          />
        )}
      </div>
    </div>
  );
}
