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
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from '@xyflow/react';
import { nodeComponent, nodeFromComponent, nodeGlyph, resolveComponent } from '../core/components';
import { ER_ANCHOR_HANDLE, erFieldPort, erFieldRows, fieldIdFromHandle, planFkConnection, resolveFkLinks, tableCardHeight, tableFieldIds } from '../core/er';
import { newEdgeId, newNodeId } from '../core/id';
import { layoutProjection, NODE_WIDTH, nodeHeight, type Positions } from '../core/layout';
import { applyPatch, applyPatchChecked, applyPatches } from '../core/patch';
import type { QuestionOption } from '../core/reasoners/types';
import { connectableEdgeTypes, getLens, LENSES, NODE_TYPES, projectLens, type LensId } from '../core/registry';
import { threeLensPositions } from '../core/sample-three-lens';
import { createSession, type ReasoningSession } from '../core/session';
import { edgeDependency, simulate, type SimulationResult } from '../core/simulate';
import type { ComponentDef, DependencyMode, EdgeType, Model, NodeType } from '../core/types';
import { ComponentEditor } from './ComponentEditor';
import { COMPONENT_MIME, ComponentLibrary } from './ComponentLibrary';
import { ContextMenu, type MenuItem } from './ContextMenu';
import { DevDrawEdge, DevDrawNode, type DevDrawEdgeData, type DevDrawNodeData, type FieldRow } from './components';
import { EdgePicker } from './EdgePicker';
import { EntityDrawer } from './EntityDrawer';
import { FitFrameIcon, LayoutIcon, MaximizeIcon, MinimizeIcon, MinusIcon, PlusIcon, RedoIcon, UndoIcon } from './icons';
import { NavPanel } from './NavPanel';
import { NavRail, type NavSection } from './NavRail';
import { QuickCreate } from './QuickCreate';
import { SessionsPanel } from './SessionsPanel';
import { SimulationPanel } from './SimulationPanel';
import { StorageBar } from './StorageBar';
import { useTheme } from './theme';
import { useProject } from './useProject';

const nodeTypes = { devdraw: DevDrawNode };
const edgeTypes = { devdraw: DevDrawEdge };

const HINTS: Record<LensId, string> = {
  architecture: '双击空白新建 · 从圆点拖出连线再选语义 · 双击改名 · 右键更多 · 点实体/边在右侧编辑',
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

/** ER 表卡片内的字段行：从全模型 contains 边折叠而来（字段不再游离）。 */
function fieldsOf(model: Model, tableId: string): FieldRow[] {
  return tableFieldIds(model, tableId).map((fieldId) => {
    const f = model.nodes[fieldId];
    return {
      id: fieldId,
      name: f?.name ?? fieldId,
      dataType: typeof f?.attrs?.dataType === 'string' ? f.attrs.dataType : undefined,
      nullable: f?.attrs?.nullable === true,
      keyRole: typeof f?.attrs?.key === 'string' ? f.attrs.key : undefined,
    };
  });
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

export function App() {
  const project = useProject();
  const { model, setModel, setViews } = project;
  const theme = useTheme();
  const { screenToFlowPosition, zoomIn, zoomOut, fitView } = useReactFlow();
  const [lens, setLens] = useState<LensId>('architecture');
  const [seeds, setSeeds] = useState<string[]>([]);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [activeFinding, setActiveFinding] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<SimulationResult | null>(null);
  const [autoPos, setAutoPos] = useState<Positions>({});
  const [fitTick, setFitTick] = useState(0);
  const [relayoutNonce, setRelayoutNonce] = useState(0);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingFieldId, setRenamingFieldId] = useState<string | null>(null);
  // 左导航：默认收起，仅图标轨；点分区展开对应面板。
  const [section, setSection] = useState<NavSection>('library');
  const [navExpanded, setNavExpanded] = useState(false);
  const [createMode, setCreateMode] = useState(false);
  // 自定义组件编辑器：null=关闭；{editing:null}=新建；{editing:comp}=编辑。
  const [componentEditor, setComponentEditor] = useState<{ editing: ComponentDef | null } | null>(null);
  // 会话分区里选中的存档（存档本身住在 reasoning/ 里，这里只是"正在看哪一份"）。
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  // ── 三个直接落在画布上的交互：就地新建 / 连线选语义 / 右键菜单 ──
  const [quickCreate, setQuickCreate] = useState<{ x: number; y: number; flow: { x: number; y: number } } | null>(null);
  const [pendingConnect, setPendingConnect] = useState<ConnectDraft | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  // 拖线松手时 onConnect 拿不到鼠标坐标，所以自己盯着指针（连线落点 = 当前指针处）。
  const pointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  // 切镜片 / 重新布局后要 fit 一次，但必须等 ELK 把坐标算完再 fit（否则框住的是旧坐标）。
  const pendingFitRef = useRef(false);
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
    setBaseline(null);
    setActiveSessionId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.loadedAt]);

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

  // 结构变化 / 切镜片 / 手动重新布局 → ELK 重算坐标（给没有人工摆位过的节点兜个底）。
  useEffect(() => {
    let cancelled = false;
    void layoutProjection(projectionRef.current, lens, model)
      .then((pos) => {
        if (cancelled) return;
        // 只采纳"还没有位置"的节点的坐标：新增一个节点不该把整张画布重新洗牌，
        // 否则你刚双击落下的位置、刚看清的关系，全都会被下一帧挪走。
        setAutoPos((prev) => {
          const next = { ...prev };
          for (const [id, p] of Object.entries(pos)) if (!next[id]) next[id] = p;
          return next;
        });
      })
      .finally(() => {
        if (cancelled) return;
        // 坐标就位之后再 fit 一次：先 fit 再落位会把"旧坐标"框进视野，看着就是一堆散沙。
        if (pendingFitRef.current) {
          pendingFitRef.current = false;
          setFitTick((t) => t + 1);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structKey, lens, relayoutNonce]);

  // 只有"整幅视角变了"（切镜片 / 手动重新布局）才 remount + fitView，而且必须等布局算完。
  // 新增一个节点不该把整张画布重新缩放挪走——否则「落在鼠标处」就白说了。
  useEffect(() => {
    pendingFitRef.current = true;
  }, [lens, relayoutNonce]);
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

  // 每副镜片的错误/反问计数（顶部标签小红点，引导用户去看"顶嘴"）
  const lensBadges = useMemo(() => {
    const out: Record<string, number> = {};
    for (const l of LENSES) out[l.id] = l.reasoner.run(model).filter((f) => f.severity === 'error' || f.severity === 'question').length;
    return out;
  }, [model]);
  const findingsBadge = findings.filter((f) => f.severity === 'error' || f.severity === 'question').length;

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

  const selectNode = useCallback((id: string | null) => {
    setSelectedNode(id);
    setSelectedEdge(null);
    setCreateMode(false);
  }, []);
  const selectEdge = useCallback((id: string | null) => {
    setSelectedEdge(id);
    setSelectedNode(null);
    setCreateMode(false);
  }, []);
  const closeDrawer = useCallback(() => {
    setSelectedNode(null);
    setSelectedEdge(null);
    setCreateMode(false);
  }, []);
  const startCreate = useCallback(() => {
    setCreateMode(true);
    setSelectedNode(null);
    setSelectedEdge(null);
  }, []);

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
    // 连"自动布局兜底坐标"一起清掉，否则 ELK 的新结果会被旧 autoPos 挡住。
    setAutoPos({});
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
          highlighted: highlightNodes.has(id),
          selected: selectedNode === id,
          dataType: typeof n.attrs?.dataType === 'string' ? n.attrs.dataType : undefined,
          nullable: n.attrs?.nullable === true,
          keyRole: typeof n.attrs?.key === 'string' ? n.attrs.key : undefined,
          initial: n.attrs?.initial === true,
          fieldCount: n.type === 'Table' ? fieldCount(id) : undefined,
          fields: n.type === 'Table' ? fieldsOf(model, id) : undefined,
          selectedFieldId: n.type === 'Table' ? selectedNode : undefined,
          onFieldSelect: selectNode,
          renamingFieldId: n.type === 'Table' ? renamingFieldId : undefined,
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
    [projection, positionFor, result, seeds, highlightNodes, selectedNode, fieldCount, selectNode, renamingId, renamingFieldId, commitRename, cancelRename, startFieldRename, commitFieldRename, cancelFieldRename, model],
  );

  // 外键边 → 具体字段：父表键列在哪一行、子表外键列在哪一行。渲染（handle）与拖线都读这份。
  const fkLinks = useMemo(() => resolveFkLinks(model), [model]);

  /** 本镜片里所有表卡片的包围盒：正交走线靠它判断一条线会不会横穿别家卡片。 */
  const cardRects = useMemo(() => {
    if (lens !== 'er') return [];
    return Object.entries(projection.nodes)
      .filter(([, n]) => n.type === 'Table')
      .map(([id]) => {
        const p = positionFor(id);
        return {
          left: p.x,
          top: p.y,
          right: p.x + NODE_WIDTH.Table,
          bottom: p.y + tableCardHeight(erFieldRows(model, id).length),
        };
      });
  }, [lens, projection, positionFor, model]);

  /**
   * 同一源字段散出去的多条外键：给每条分一条竖向车道（lane），否则它们的竖段会叠成一根。
   * 按目标卡片的高度排序分配，扇面因此不会自己跟自己交叉。
   * 顺带把两端的基数标记按锚点去重：多条线落到同一个字段行时，只留一个 1、一个 N。
   */
  const edgeRouting = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const [id, e] of Object.entries(projection.edges)) {
      if (e.type !== 'fk') continue;
      const anchor = fkLinks[id]?.fromFieldId ? `f:${fkLinks[id].fromFieldId}` : `n:${e.from}`;
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
      const link = e.type === 'fk' ? fkLinks[id] : undefined;
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
  }, [projection, fkLinks, positionFor]);

  const derivedEdges = useMemo<Edge<DevDrawEdgeData>[]>(
    () =>
      Object.entries(projection.edges).map(([id, e]) => {
        const effectedBy = e.attrs?.effectedBy;
        const missingService =
          e.type === 'transition' && typeof effectedBy === 'string' && e.attrs?.manual !== true && !model.nodes[effectedBy];
        const link = e.type === 'fk' ? fkLinks[id] : undefined;
        const routing = edgeRouting[id];
        // 表卡片有十几个 handle（每行左右各一），不点名的话 React Flow 会把无边名的边
        // 接到 DOM 里第一个同类型 handle —— 也就是第一行字段，于是"读这张表"会被画成"读 id 这一列"。
        // 所以表与表之间非外键的线也要显式锚到卡片级锚点。
        const anchored = (nodeId: string, side: 'left' | 'right') =>
          model.nodes[nodeId]?.type === 'Table' ? ER_ANCHOR_HANDLE[side] : undefined;
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
    [projection, model, fkLinks, edgeRouting, impactedEdges, highlightEdges, selectEdge, selectedEdge, lens, cardRects],
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
    },
    [setModel],
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
    items.push({ key: 'edit', label: '编辑详情', hint: '右侧', onSelect: () => selectNode(id) });
    items.push({
      key: 'rename',
      label: '重命名',
      hint: '原地改',
      onSelect: () => {
        // 只进原地改名，不选中节点——选中会顺手拉开右侧抽屉，把刚要看的那块画布盖掉。
        setRenamingId(id);
      },
    });
    items.push({ key: 'delete', label: '删除', tone: 'danger', onSelect: () => deleteNode(id) });
    return items;
  }, [contextMenu, model, lens, seeds, toggleSeed, selectNode, deleteNode]);

  // 双击空白：就地新建（组件或空白类型），落在鼠标处。
  const openQuickCreate = useCallback(
    (e: ReactMouseEvent) => {
      // Background 的 svg 盖在 pane 上，所以不能只认 .react-flow__pane——
      // 只要不在任何节点/控件里，就算"空白处"。
      const el = e.target as HTMLElement;
      if (el.closest('.react-flow__node') || el.closest('.react-flow__controls') || el.closest('.react-flow__minimap')) return;
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
      setRenamingId(id);
    },
    [quickCreate, setModel, persistPosition, centerAt],
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

  const switchLens = useCallback(
    (id: LensId) => {
      setLens(id);
      setSelectedEdge(null);
      setSelectedNode(null);
      setActiveFinding(null);
      setCreateMode(false);
      setRenamingId(null);
      setRenamingFieldId(null);
      // 每个镜片有自己的场景：切过去就该看见那个镜片上次在推演的东西。
      setSeeds(project.views[id]?.seeds ?? []);
      setBaseline(null);
    },
    [project.views],
  );

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
    });
    void project.saveSession(session);
    setActiveSessionId(session.id);
    setSection('sessions');
    setNavExpanded(true);
  }, [lens, seeds, model, findings, result, project]);

  const openSession = useCallback(
    (session: ReasoningSession) => {
      if (session.lens !== lens) switchLens(session.lens);
      applySeeds(session.seeds, session.lens);
      setBaseline(null);
      setActiveSessionId(session.id);
    },
    [lens, switchLens, applySeeds],
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
    setBaseline(null);
    setSelectedEdge(null);
    setSelectedNode(null);
    setActiveFinding(null);
    setCreateMode(false);
    setActiveSessionId(null);
  }, [project]);

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

  // 撤销/重做快捷键：Ctrl/Cmd+Z 撤销，Ctrl/Cmd+Shift+Z 或 Ctrl+Y 重做；输入框内不拦截。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      e.preventDefault();
      if (key === 'y' || e.shiftKey) project.redo();
      else project.undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [project.redo, project.undo]);

  // 撤销/重做或删除可能让选中实体/边消失 → 清掉悬空选择，避免抽屉读到不存在的节点。
  useEffect(() => {
    if (selectedNode && !model.nodes[selectedNode]) setSelectedNode(null);
    if (selectedEdge && !model.edges[selectedEdge]) setSelectedEdge(null);
  }, [model, selectedNode, selectedEdge]);

  return (
    <div className="dd-app">
      <header className="dd-header">
        <div className="dd-brand">DevDraw · 研绘</div>
        <div className="dd-model-name">{model.name}</div>
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
          {lens === 'architecture' && (
            <button onClick={clearScenario} disabled={seeds.length === 0}>
              清除推演
            </button>
          )}
          <button onClick={project.exportZip} title="把当前状态打包下载一份 zip 快照（备份 / 分享 / 换浏览器）">
            导出 zip
          </button>
          <button onClick={resetAll}>重置示例</button>
        </div>
      </header>
      <div className="dd-main">
        <NavRail
          section={section}
          expanded={navExpanded}
          findingsBadge={findingsBadge}
          simulationBadge={seeds.length}
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
          ) : section === 'sessions' ? (
            <SessionsPanel
              model={model}
              sessions={project.sessions}
              activeId={activeSessionId}
              onArchive={archiveSession}
              onOpen={openSession}
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
            key={`${lens}-${fitTick}`}
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            deleteKeyCode={null}
            onNodeContextMenu={onNodeContextMenu}
            onNodeDoubleClick={onNodeDoubleClick}
            onNodeDragStop={(_, node) => persistPosition(node.id, node.position)}
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
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.3}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color="var(--canvas-dot)" />
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
                const state = (n.data as DevDrawNodeData).state;
                return state === 'failed' ? 'var(--danger)' : state === 'degraded' ? 'var(--warning)' : 'var(--minimap-node)';
              }}
            />
          </ReactFlow>
          <div className="dd-canvas-status">
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
            {project.fsaSupported && project.storeKind !== 'folder' && (
              <button
                className="dd-primary"
                onClick={() => void project.openFolder()}
                title="授权一个本地文件夹，之后每次改动自动保存到磁盘"
              >
                打开文件夹
              </button>
            )}
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
              title={model.nodes[contextMenu.nodeId]?.name}
              items={menuItems}
              onClose={() => setContextMenu(null)}
            />
          )}
        </div>
        {drawerOpen && (
          <EntityDrawer
            model={model}
            lens={lensDef}
            projection={projection}
            selectedNode={selectedNode}
            selectedEdge={selectedEdge}
            createMode={createMode}
            findings={findings}
            activeFinding={activeFinding}
            result={result}
            onSelectNode={selectNode}
            onSelectEdge={selectEdge}
            onSelectFinding={setActiveFinding}
            onAnswer={answer}
            onChange={onModelChange}
            onChangeMode={changeEdgeMode}
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
      </div>
    </div>
  );
}
