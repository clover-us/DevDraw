import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ConnectionMode,
  MiniMap,
  ReactFlow,
  SelectionMode,
  useReactFlow,
  type Connection,
  type NodeChange,
  type OnSelectionChangeParams,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  ChevronsUpDown,
  Database,
  Expand,
  GitCommitHorizontal,
  GitCompareArrows,
  Group,
  LayoutGrid,
  ListFilter,
  ListOrdered,
  Map as MapIcon,
  Maximize,
  Minimize2,
  Minus,
  Moon,
  MousePointerClick,
  Plus,
  Sun,
  Table2,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import {
  isCollapsibleEntity,
  isGroupEntity,
  type AlignDirection,
  type CanvasExpandMode,
  type CanvasSlot,
  type CanvasToolMode,
  type DistributeAxis,
  type EdgeWaypoint,
  type EntityNode,
  type EntityVisualStyle,
  type FlowScript,
  type FreehandStroke,
  type LayerTemplateName,
  type PortSide,
  type RelationEdge,
  type SlotDiffResult,
} from '@devdraw/core';
import {
  DevDrawNodeComponent,
  parseFieldHandle,
  toFieldSourceHandle,
  toFieldTargetHandle,
  type DevDrawFlowNode,
} from '../nodes/DevDrawNode';
import { DevDrawEdgeComponent, type DevDrawFlowEdge } from '../edges/DevDrawEdge';
import { FlowPlayerBar } from './FlowPlayerBar';
import { FreehandLayer } from './FreehandLayer';
import { CanvasContextMenu, type ContextMenuTarget } from './CanvasContextMenu';

const nodeTypes = { devdraw: DevDrawNodeComponent };
const edgeTypes = { devdraw: DevDrawEdgeComponent };

const PORT_SIDES = new Set<PortSide>(['top', 'right', 'bottom', 'left']);

function parsePortSide(handleId?: string | null): PortSide | undefined {
  if (handleId && PORT_SIDES.has(handleId as PortSide)) return handleId as PortSide;
  return undefined;
}

function pickClosestPorts(
  fromPos: { x: number; y: number } | undefined,
  toPos: { x: number; y: number } | undefined
): { source: PortSide; target: PortSide } {
  if (!fromPos || !toPos) return { source: 'right', target: 'left' };
  const dx = toPos.x - fromPos.x;
  const dy = toPos.y - fromPos.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { source: 'right', target: 'left' } : { source: 'left', target: 'right' };
  }
  return dy >= 0 ? { source: 'bottom', target: 'top' } : { source: 'top', target: 'bottom' };
}

export interface DevDrawCanvasProps {
  slot: CanvasSlot;
  layerTemplate: LayerTemplateName;
  subCanvases?: CanvasSlot[];
  activeSubCanvasIndex?: number;
  activeTool: CanvasToolMode;
  selectedNodeId: string | null;
  selectedNodeIds?: string[];
  selectedEdgeId: string | null;
  focusNodeRequest?: { nodeId: string; nonce: number } | null;
  theme: 'dark' | 'light';
  expandMode: CanvasExpandMode;
  compactMode: boolean;
  simulating: boolean;
  activeFlowId: string | null;
  flowStepIndex: number;
  isFlowPlaying: boolean;
  canUndo: boolean;
  canRedo: boolean;
  recentKinds: string[];
  kindStyles?: Record<string, EntityVisualStyle>;
  onSetTool: (tool: CanvasToolMode) => void;
  onSelectNode: (nodeId: string | null) => void;
  onSelectNodes?: (nodeIds: string[]) => void;
  onSelectEdge: (edgeId: string | null) => void;
  onOpenNodeInspector: (nodeId: string) => void;
  onOpenEdgeInspector: (edgeId: string) => void;
  onCustomizeNodeStyle: (nodeId: string) => void;
  onNodeDragStop: (nodeId: string, x: number, y: number) => void;
  onNodesDragStop?: (updates: Array<{ id: string; x: number; y: number }>) => void;
  onResizeNode?: (nodeId: string, x: number, y: number, w: number, h: number) => void;
  onAlignNodes?: (direction: AlignDirection) => void;
  onDistributeNodes?: (axis: DistributeAxis) => void;
  onGroupSelectedNodes?: () => void;
  onDeleteSelectedNodes?: () => void;
  onConnectNodes: (
    from: string,
    to: string,
    fromField?: string,
    toField?: string,
    sourcePort?: PortSide,
    targetPort?: PortSide
  ) => void;
  onDropPrimitive: (kind: string, x: number, y: number) => void;
  onCreateChildNode?: (nodeId: string) => void;
  onCreateSiblingNode?: (nodeId: string) => void;
  onDuplicateNode: (nodeId: string) => void;
  onToggleNodePinned: (nodeId: string) => void;
  onDisconnectNode: (nodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onUpdateEdgeLabel: (edgeId: string, label: string) => void;
  onUpdateEdgeWaypoints: (edgeId: string, waypoints: EdgeWaypoint[] | undefined) => void;
  onToggleEdgeDashed: (edgeId: string) => void;
  onToggleEdgeRouting: (edgeId: string) => void;
  onReverseEdge: (edgeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
  onToggleNodeCollapse: (nodeId: string) => void;
  onCycleDensity: () => void;
  onToggleCompactMode: () => void;
  onToggleTheme: () => void;
  showMiniMap?: boolean;
  onToggleMiniMap?: () => void;
  onRunAutoLayout: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onDrillDown: (node: EntityNode) => void;
  onAddFreehandStroke: (stroke: FreehandStroke) => void;
  onClearFreehandStrokes: () => void;
  onSelectSubCanvas?: (index: number) => void;
  onSelectFlow?: (flowId: string) => void;
  onFlowPrev?: () => void;
  onFlowNext?: () => void;
  onFlowTogglePlay?: () => void;
  onFlowReset?: () => void;
  onFlowClose?: () => void;
  onEditFlows?: () => void;
  flowPickEdgeMode?: boolean;
  onFlowPickEdge?: (edgeId: string) => void;
  onCancelFlowPickEdge?: () => void;
  diffResult?: SlotDiffResult | null;
  diffBaselineLabel?: string | null;
  onExitDiff?: () => void;
}

export const DevDrawCanvas: React.FC<DevDrawCanvasProps> = ({
  slot,
  layerTemplate,
  subCanvases,
  activeSubCanvasIndex = 0,
  activeTool,
  selectedNodeId,
  selectedNodeIds = [],
  selectedEdgeId,
  focusNodeRequest,
  theme,
  expandMode,
  compactMode,
  simulating,
  activeFlowId,
  flowStepIndex,
  isFlowPlaying,
  canUndo,
  canRedo,
  recentKinds,
  kindStyles,
  onSetTool,
  onSelectNode,
  onSelectNodes,
  onSelectEdge,
  onOpenNodeInspector,
  onOpenEdgeInspector,
  onCustomizeNodeStyle,
  onNodeDragStop,
  onNodesDragStop,
  onResizeNode,
  onAlignNodes,
  onDistributeNodes,
  onGroupSelectedNodes,
  onDeleteSelectedNodes,
  onConnectNodes,
  onDropPrimitive,
  onCreateChildNode,
  onCreateSiblingNode,
  onDuplicateNode,
  onToggleNodePinned,
  onDisconnectNode,
  onDeleteNode,
  onUpdateEdgeLabel,
  onUpdateEdgeWaypoints,
  onToggleEdgeDashed,
  onToggleEdgeRouting,
  onReverseEdge,
  onDeleteEdge,
  onToggleNodeCollapse,
  onCycleDensity,
  onToggleCompactMode,
  onToggleTheme,
  showMiniMap = true,
  onToggleMiniMap,
  onRunAutoLayout,
  onUndo,
  onRedo,
  onDrillDown,
  onAddFreehandStroke,
  onClearFreehandStrokes,
  onSelectSubCanvas,
  onSelectFlow,
  onFlowPrev,
  onFlowNext,
  onFlowTogglePlay,
  onFlowReset,
  onFlowClose,
  onEditFlows,
  flowPickEdgeMode = false,
  onFlowPickEdge,
  onCancelFlowPickEdge,
  diffResult = null,
  diffBaselineLabel = null,
  onExitDiff,
}) => {
  const { zoomIn, zoomOut, fitView, setCenter, screenToFlowPosition } = useReactFlow();
  const isLight = theme === 'light';

  // Smoothly pan & focus viewport when a node is jumped to via Command Palette (Ctrl+K)
  useEffect(() => {
    if (!focusNodeRequest) return;
    const target = slot.nodes.find((n) => n.id === focusNodeRequest.nodeId);
    if (!target) return;
    const cx = target.x + (target.w ?? 248) / 2;
    const cy = target.y + (target.h ?? 96) / 2;
    void setCenter(cx, cy, { zoom: 1.05, duration: 320 });
  }, [focusNodeRequest, slot.nodes, setCenter]);

  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuTarget | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const groupDragRef = useRef<{
    groupId: string;
    startX: number;
    startY: number;
    children: Array<{ id: string; startX: number; startY: number }>;
  } | null>(null);

  useEffect(() => {
    const syncFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', syncFs);
    return () => document.removeEventListener('fullscreenchange', syncFs);
  }, []);

  const handleToggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore fullscreen permission errors in restricted webviews
    }
  }, []);

  useEffect(() => {
    if (activeTool !== 'connect') {
      setConnectSourceId(null);
    }
  }, [activeTool, slot.id]);

  useEffect(() => {
    setContextMenu(null);
    setEditingEdgeId(null);
  }, [slot.id]);

  const flows: FlowScript[] = slot.flows ?? [];
  const activeFlow = flows.find((f) => f.id === activeFlowId) ?? flows[0] ?? null;
  const activeStep =
    simulating && activeFlow && flowStepIndex >= 0 ? activeFlow.steps[flowStepIndex] : null;

  const relatedFieldsByNode = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const e of slot.edges) {
      if (e.fromField) {
        if (!map.has(e.from)) map.set(e.from, new Set());
        map.get(e.from)!.add(e.fromField);
      }
      if (e.toField) {
        if (!map.has(e.to)) map.set(e.to, new Set());
        map.get(e.to)!.add(e.toField);
      }
    }
    return map;
  }, [slot.edges]);

  const mountedFieldsByNode = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const entity of slot.nodes) {
      if (!isCollapsibleEntity(entity) || entity.collapsed) continue;
      const allFields = entity.fields ?? [];
      const related = relatedFieldsByNode.get(entity.id);
      const visible =
        expandMode === 'related' && related && related.size > 0
          ? allFields.filter((f) => related.has(f.name))
          : allFields;
      map.set(entity.id, new Set(visible.map((f) => f.name)));
    }
    return map;
  }, [slot.nodes, expandMode, relatedFieldsByNode]);

  const selectedIdSet = useMemo(() => {
    const s = new Set<string>(selectedNodeIds);
    if (selectedNodeId) s.add(selectedNodeId);
    return s;
  }, [selectedNodeId, selectedNodeIds]);

  const computedNodes: DevDrawFlowNode[] = useMemo(() => {
    const addedNodeSet = diffResult ? new Set(diffResult.addedNodeIds) : null;
    const baseNodes: DevDrawFlowNode[] = slot.nodes.map((entity) => {
      let flowState: 'idle' | 'active' | 'dimmed' = 'idle';
      if (activeStep) {
        flowState =
          activeStep.from === entity.id || activeStep.to === entity.id ? 'active' : 'dimmed';
      }
      let diffState: 'added' | 'modified' | 'removed' | 'unchanged' | undefined;
      let diffSummary: string | undefined;
      if (diffResult) {
        if (addedNodeSet?.has(entity.id)) {
          diffState = 'added';
          diffSummary = '相对基准新增的实体';
        } else if (diffResult.modifiedNodes[entity.id]) {
          diffState = 'modified';
          diffSummary = diffResult.modifiedNodes[entity.id].summary;
        } else {
          diffState = 'unchanged';
        }
      }
      const isGroup = isGroupEntity(entity);
      return {
        id: entity.id,
        type: 'devdraw',
        position: { x: entity.x, y: entity.y },
        zIndex: isGroup ? -1 : 1,
        style: isGroup ? { width: entity.w ?? 420, height: entity.h ?? 280 } : undefined,
        selected: selectedIdSet.has(entity.id) || entity.id === connectSourceId,
        data: {
          entity,
          kindStyle: kindStyles?.[entity.kind],
          theme,
          expandMode,
          compactMode,
          relatedFields: Array.from(relatedFieldsByNode.get(entity.id) ?? []),
          flowState,
          diffState,
          diffSummary,
          onToggleCollapse: onToggleNodeCollapse,
          onDrillDown,
          onResizeNode,
        },
      };
    });

    if (!diffResult || diffResult.removedNodes.length === 0) {
      return baseNodes;
    }

    const ghostNodes: DevDrawFlowNode[] = diffResult.removedNodes.map((ghost) => ({
      id: ghost.id,
      type: 'devdraw',
      position: { x: ghost.x, y: ghost.y },
      zIndex: 0,
      draggable: false,
      selectable: false,
      connectable: false,
      selected: false,
      data: {
        entity: ghost,
        kindStyle: kindStyles?.[ghost.kind],
        theme,
        expandMode,
        compactMode,
        relatedFields: [],
        flowState: 'idle',
        diffState: 'removed',
        diffSummary: '相对基准已移除的实体（幽灵对照视图）',
      },
    }));

    return [...baseNodes, ...ghostNodes];
  }, [
    slot.nodes,
    kindStyles,
    selectedIdSet,
    connectSourceId,
    theme,
    expandMode,
    compactMode,
    relatedFieldsByNode,
    activeStep,
    diffResult,
    onToggleNodeCollapse,
    onDrillDown,
    onResizeNode,
  ]);

  const [localNodes, setLocalNodes] = useState<DevDrawFlowNode[]>(computedNodes);

  useEffect(() => {
    setLocalNodes(computedNodes);
  }, [computedNodes]);

  const handleNodesChange = useCallback((changes: NodeChange<DevDrawFlowNode>[]) => {
    setLocalNodes((prev) => applyNodeChanges(changes, prev));
  }, []);

  const handleStartEditEdgeLabel = useCallback(
    (edgeId: string) => {
      onSelectEdge(edgeId);
      setEditingEdgeId(edgeId);
    },
    [onSelectEdge]
  );

  const handleCommitEdgeLabel = useCallback(
    (edgeId: string, nextLabel: string) => {
      setEditingEdgeId(null);
      onUpdateEdgeLabel(edgeId, nextLabel);
    },
    [onUpdateEdgeLabel]
  );

  const handleCancelEditEdgeLabel = useCallback(() => {
    setEditingEdgeId(null);
  }, []);

  const localNodePosMap = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const n of localNodes) {
      map.set(n.id, n.position);
    }
    return map;
  }, [localNodes]);

  const rfEdges: DevDrawFlowEdge[] = useMemo(() => {
    const addedEdgeSet = diffResult ? new Set(diffResult.addedEdgeIds) : null;
    const modifiedEdgeSet = diffResult ? new Set(diffResult.modifiedEdgeIds) : null;

    const currentEdges: DevDrawFlowEdge[] = slot.edges.map((relation: RelationEdge) => {
      let flowState: 'idle' | 'active' | 'dimmed' = 'idle';
      if (activeStep) {
        const hit =
          activeStep.edgeId === relation.id ||
          (activeStep.from === relation.from && activeStep.to === relation.to);
        flowState = hit ? 'active' : 'dimmed';
      }
      let diffState: 'added' | 'modified' | 'removed' | 'unchanged' | undefined;
      if (diffResult) {
        if (addedEdgeSet?.has(relation.id)) diffState = 'added';
        else if (modifiedEdgeSet?.has(relation.id)) diffState = 'modified';
        else diffState = 'unchanged';
      }

      const sourceMounted =
        relation.fromField && mountedFieldsByNode.get(relation.from)?.has(relation.fromField);
      const targetMounted =
        relation.toField && mountedFieldsByNode.get(relation.to)?.has(relation.toField);

      const autoPorts = pickClosestPorts(
        localNodePosMap.get(relation.from),
        localNodePosMap.get(relation.to)
      );
      const resolvedSourceHandle = sourceMounted
        ? toFieldSourceHandle(relation.fromField!)
        : relation.sourcePort ?? autoPorts.source;
      const resolvedTargetHandle = targetMounted
        ? toFieldTargetHandle(relation.toField!)
        : relation.targetPort ?? autoPorts.target;

      return {
        id: relation.id,
        source: relation.from,
        target: relation.to,
        sourceHandle: resolvedSourceHandle,
        targetHandle: resolvedTargetHandle,
        type: 'devdraw',
        selected: relation.id === selectedEdgeId,
        data: {
          relation,
          theme,
          isSelected: relation.id === selectedEdgeId,
          simulating,
          flowState,
          diffState,
          isEditingLabel: editingEdgeId === relation.id,
          onSelectEdge,
          onOpenInspector: onOpenEdgeInspector,
          onCommitLabel: handleCommitEdgeLabel,
          onCancelEditLabel: handleCancelEditEdgeLabel,
          onUpdateWaypoints: (edgeId, pts) => onUpdateEdgeWaypoints(edgeId, pts),
        },
      };
    });

    if (!diffResult || diffResult.removedEdges.length === 0) {
      return currentEdges;
    }

    const ghostEdges: DevDrawFlowEdge[] = diffResult.removedEdges.map((ghostEdge) => {
      const autoPorts = pickClosestPorts(
        localNodePosMap.get(ghostEdge.from),
        localNodePosMap.get(ghostEdge.to)
      );
      return {
        id: ghostEdge.id,
        source: ghostEdge.from,
        target: ghostEdge.to,
        sourceHandle: ghostEdge.sourcePort ?? autoPorts.source,
        targetHandle: ghostEdge.targetPort ?? autoPorts.target,
        type: 'devdraw',
        selectable: false,
        data: {
          relation: ghostEdge,
          theme,
          isSelected: false,
          simulating: false,
          flowState: 'idle',
          diffState: 'removed',
        },
      };
    });

    return [...currentEdges, ...ghostEdges];
  }, [
    slot.edges,
    localNodePosMap,
    selectedEdgeId,
    theme,
    simulating,
    activeStep,
    diffResult,
    mountedFieldsByNode,
    editingEdgeId,
    onSelectEdge,
    onOpenEdgeInspector,
    handleCommitEdgeLabel,
    handleCancelEditEdgeLabel,
    onUpdateEdgeWaypoints,
  ]);

  const handleConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target) return;
      const fromField = parseFieldHandle(conn.sourceHandle);
      const toField = parseFieldHandle(conn.targetHandle);
      const sourcePort = parsePortSide(conn.sourceHandle);
      const targetPort = parsePortSide(conn.targetHandle);
      if (conn.source === conn.target && fromField === toField) return;
      onConnectNodes(conn.source, conn.target, fromField, toField, sourcePort, targetPort);
    },
    [onConnectNodes]
  );

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: DevDrawFlowNode) => {
      setContextMenu(null);
      if (activeTool !== 'connect') return;
      if (!connectSourceId) {
        setConnectSourceId(node.id);
      } else if (connectSourceId === node.id) {
        setConnectSourceId(null);
      } else {
        onConnectNodes(connectSourceId, node.id);
        setConnectSourceId(null);
      }
    },
    [activeTool, connectSourceId, onConnectNodes]
  );

  const handleSelectionChange = useCallback(
    ({ nodes, edges }: OnSelectionChangeParams) => {
      if (activeTool !== 'select') return;
      if (nodes.length > 0) {
        const ids = nodes.map((n) => n.id);
        if (onSelectNodes) {
          onSelectNodes(ids);
        } else {
          onSelectNode(ids[0]);
        }
      } else if (edges.length > 0) {
        onSelectEdge(edges[0].id);
      }
    },
    [activeTool, onSelectNode, onSelectNodes, onSelectEdge]
  );

  const handlePaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      event.preventDefault();
      if (activeTool === 'connect' && connectSourceId) {
        setConnectSourceId(null);
      }
      const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setContextMenu({
        type: 'pane',
        clientX: event.clientX,
        clientY: event.clientY,
        worldX: Math.round(pos.x),
        worldY: Math.round(pos.y),
      });
    },
    [activeTool, connectSourceId, screenToFlowPosition]
  );

  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: DevDrawFlowNode) => {
      event.preventDefault();
      onSelectNode(node.id);
      setContextMenu({
        type: 'node',
        clientX: event.clientX,
        clientY: event.clientY,
        node: node.data.entity,
      });
    },
    [onSelectNode]
  );

  const handleEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: DevDrawFlowEdge) => {
      event.preventDefault();
      onSelectEdge(edge.id);
      if (!edge.data?.relation) return;
      setContextMenu({
        type: 'edge',
        clientX: event.clientX,
        clientY: event.clientY,
        edge: edge.data.relation,
      });
    },
    [onSelectEdge]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const kind =
        e.dataTransfer.getData('application/x-devdraw-kind') || e.dataTransfer.getData('text/plain');
      if (!kind) return;
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      onDropPrimitive(kind, Math.round(pos.x - 110), Math.round(pos.y - 44));
    },
    [screenToFlowPosition, onDropPrimitive]
  );

  const hasCollapsible = slot.nodes.some(isCollapsibleEntity);
  const allCollapsed =
    hasCollapsible && slot.nodes.filter(isCollapsibleEntity).every((n) => !!n.collapsed);
  const connectSourceNode = connectSourceId
    ? slot.nodes.find((n) => n.id === connectSourceId)
    : null;

  return (
    <div
      className={`devdraw-stage relative w-full h-full overflow-hidden ${isConnecting ? 'dd-connecting' : ''}`}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <ReactFlow
        nodes={localNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={40}
        connectionLineStyle={{
          stroke: isLight ? '#0284c7' : '#38bdf8',
          strokeWidth: 2,
          strokeDasharray: '6 4',
        }}
        onConnectStart={() => setIsConnecting(true)}
        onConnectEnd={() => setIsConnecting(false)}
        onNodesChange={handleNodesChange}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={(_, node) => {
          if (activeTool !== 'select') return;
          if (node.data.entity.ref) {
            onDrillDown(node.data.entity);
          } else {
            onOpenNodeInspector(node.id);
          }
        }}
        onEdgeClick={(e, edge) => {
          e.stopPropagation();
          setContextMenu(null);
          if (flowPickEdgeMode && onFlowPickEdge) {
            onFlowPickEdge(edge.id);
            return;
          }
          if (activeTool !== 'select') return;
          onSelectEdge(edge.id);
        }}
        onEdgeDoubleClick={(_, edge) => {
          if (activeTool !== 'select') return;
          onOpenEdgeInspector(edge.id);
        }}
        onPaneContextMenu={handlePaneContextMenu}
        onNodeContextMenu={handleNodeContextMenu}
        onEdgeContextMenu={handleEdgeContextMenu}
        onNodeDragStart={(event, node) => {
          groupDragRef.current = null;
          if (!isGroupEntity(node.data.entity) || event.altKey) return;
          const gx = node.position.x;
          const gy = node.position.y;
          const gw = node.data.entity.w ?? 420;
          const gh = node.data.entity.h ?? 280;
          const carried: Array<{ id: string; startX: number; startY: number }> = [];
          for (const candidate of localNodes) {
            if (candidate.id === node.id || isGroupEntity(candidate.data.entity)) continue;
            const cw = candidate.data.entity.w ?? 248;
            const ch = candidate.data.entity.h ?? 96;
            const cx = candidate.position.x + cw / 2;
            const cy = candidate.position.y + ch / 2;
            if (cx >= gx && cx <= gx + gw && cy >= gy && cy <= gy + gh) {
              carried.push({
                id: candidate.id,
                startX: candidate.position.x,
                startY: candidate.position.y,
              });
            }
          }
          if (carried.length > 0) {
            groupDragRef.current = {
              groupId: node.id,
              startX: gx,
              startY: gy,
              children: carried,
            };
          }
        }}
        onNodeDrag={(_event, node) => {
          const drag = groupDragRef.current;
          if (!drag || drag.groupId !== node.id) return;
          const dx = node.position.x - drag.startX;
          const dy = node.position.y - drag.startY;
          const childOffsetMap = new Map(
            drag.children.map((c) => [c.id, { x: c.startX + dx, y: c.startY + dy }])
          );
          setLocalNodes((prev) =>
            prev.map((n) => {
              const moved = childOffsetMap.get(n.id);
              return moved ? { ...n, position: moved } : n;
            })
          );
        }}
        onNodeDragStop={(_, node, draggedNodes) => {
          const drag = groupDragRef.current;
          groupDragRef.current = null;
          if (drag && drag.groupId === node.id && onNodesDragStop) {
            const dx = node.position.x - drag.startX;
            const dy = node.position.y - drag.startY;
            onNodesDragStop([
              { id: node.id, x: Math.round(node.position.x), y: Math.round(node.position.y) },
              ...drag.children.map((c) => ({
                id: c.id,
                x: Math.round(c.startX + dx),
                y: Math.round(c.startY + dy),
              })),
            ]);
            return;
          }
          const list = draggedNodes && draggedNodes.length > 0 ? draggedNodes : [node];
          if (onNodesDragStop && list.length > 1) {
            onNodesDragStop(
              list.map((n) => ({
                id: n.id,
                x: Math.round(n.position.x),
                y: Math.round(n.position.y),
              }))
            );
          } else {
            onNodeDragStop(node.id, Math.round(node.position.x), Math.round(node.position.y));
          }
        }}
        onConnect={handleConnect}
        onSelectionChange={handleSelectionChange}
        multiSelectionKeyCode={['Meta', 'Control', 'Shift']}
        selectionKeyCode="Shift"
        selectionMode={SelectionMode.Partial}
        onPaneClick={() => {
          setContextMenu(null);
          setEditingEdgeId(null);
          setConnectSourceId(null);
          onSelectNode(null);
          onSelectEdge(null);
        }}
        nodesDraggable={activeTool === 'select'}
        panOnDrag={activeTool !== 'draw'}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.25}
        maxZoom={2.2}
      >
        {/* Shared SVG Arrowhead Markers for DevDraw Edges */}
        <svg style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }} aria-hidden="true">
          <defs>
            {[
              { id: 'dd-arrow-violet', fill: '#8b5cf6' },
              { id: 'dd-arrow-violet-light', fill: '#7c3aed' },
              { id: 'dd-arrow-amber', fill: '#f59e0b' },
              { id: 'dd-arrow-sky', fill: '#38bdf8' },
              { id: 'dd-arrow-sky-light', fill: '#0284c7' },
              { id: 'dd-arrow-emerald', fill: '#34d399' },
              { id: 'dd-arrow-rose', fill: '#f43f5e' },
            ].map((m) => (
              <marker
                key={m.id}
                id={m.id}
                viewBox="0 0 10 10"
                refX="8.5"
                refY="5"
                markerWidth="8"
                markerHeight="8"
                orient="auto-start-reverse"
                markerUnits="userSpaceOnUse"
              >
                <path d="M 1 1.5 L 8.8 5 L 1 8.5 L 2.8 5 Z" fill={m.fill} />
              </marker>
            ))}
          </defs>
        </svg>

        <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1.2}
          color={isLight ? '#cbd5e1' : 'rgba(167, 139, 250, 0.22)'}
        />

        {showMiniMap && (
          <MiniMap
            pannable
            zoomable
            position="bottom-right"
            nodeBorderRadius={6}
            nodeStrokeWidth={3}
            bgColor="transparent"
            maskColor="transparent"
            maskStrokeColor="transparent"
            maskStrokeWidth={0}
            style={{
              width: 168,
              height: 104,
              borderRadius: 12,
              overflow: 'hidden',
              backgroundColor: isLight ? 'rgba(255,255,255,0.88)' : 'rgba(18,17,26,0.92)',
              border: isLight ? '1px solid rgba(15,23,42,0.09)' : '1px solid rgba(255,255,255,0.08)',
              backdropFilter: 'blur(12px)',
            }}
            nodeColor={(n) => {
              const isSel = n.id === selectedNodeId;
              if (isSel) return isLight ? '#0ea5e9' : '#38bdf8';
              return isLight ? 'rgba(124, 58, 237, 0.55)' : 'rgba(139, 92, 246, 0.55)';
            }}
            nodeStrokeColor={(n) => {
              const isSel = n.id === selectedNodeId;
              if (!isSel) return 'transparent';
              return isLight ? '#0369a1' : '#e0f2fe';
            }}
          />
        )}
      </ReactFlow>

      {/* World-space Freehand Sketch Layer */}
      <FreehandLayer
        strokes={slot.freehand ?? []}
        active={activeTool === 'draw'}
        theme={theme}
        onAddStroke={onAddFreehandStroke}
        onClearStrokes={onClearFreehandStrokes}
        onExitDrawMode={() => onSetTool('select')}
      />

      {/* Three-level Canvas / Node / Edge Context Menu */}
      <CanvasContextMenu
        target={contextMenu}
        theme={theme}
        layerName={slot.name}
        layerTemplate={layerTemplate}
        subCanvasEngine={slot.engine}
        recentKinds={recentKinds}
        canUndo={canUndo}
        canRedo={canRedo}
        hasFreehand={(slot.freehand?.length ?? 0) > 0}
        compactMode={compactMode}
        showCompactToggle={!hasCollapsible}
        onClose={() => setContextMenu(null)}
        onInsertEntity={(kind, wx, wy) => onDropPrimitive(kind, wx - 110, wy - 44)}
        onUndo={onUndo}
        onRedo={onRedo}
        onAutoLayout={onRunAutoLayout}
        onFitView={() => fitView({ padding: 0.2, duration: 240 })}
        onToggleCompactMode={onToggleCompactMode}
        onToggleTheme={onToggleTheme}
        onClearFreehand={onClearFreehandStrokes}
        onInspectNode={onOpenNodeInspector}
        onCustomizeNodeStyle={onCustomizeNodeStyle}
        onCreateChildNode={onCreateChildNode}
        onCreateSiblingNode={onCreateSiblingNode}
        onStartConnectFromNode={(nodeId) => {
          setConnectSourceId(nodeId);
          onSetTool('connect');
        }}
        onDuplicateNode={onDuplicateNode}
        onToggleNodePinned={onToggleNodePinned}
        onDisconnectNode={onDisconnectNode}
        onDeleteNode={onDeleteNode}
        onInspectEdge={onOpenEdgeInspector}
        onEditEdgeLabel={handleStartEditEdgeLabel}
        onToggleEdgeDashed={onToggleEdgeDashed}
        onToggleEdgeRouting={onToggleEdgeRouting}
        onReverseEdge={onReverseEdge}
        onResetEdgeWaypoints={(edgeId) => onUpdateEdgeWaypoints(edgeId, undefined)}
        onDeleteEdge={onDeleteEdge}
      />

      {/* Visual Architecture Diff Floating Summary Banner */}
      {diffResult && (
        <div
          className={`absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2.5 px-3.5 py-1.5 rounded-full border backdrop-blur-xl shadow-2xl text-xs select-none ${
            isLight
              ? 'bg-white/95 border-amber-300 text-slate-800'
              : 'bg-[#1a1524]/95 border-amber-400/45 text-zinc-100'
          }`}
        >
          <GitCompareArrows className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="font-medium truncate max-w-[180px]">
            对比：{diffBaselineLabel || '基准版本'}
          </span>
          <div className="h-3.5 w-px bg-white/15" />
          {diffResult.stats.hasChanges ? (
            <div className="flex items-center gap-2 font-mono text-[11px]">
              <span className="text-emerald-400">
                +{diffResult.stats.addedNodes + diffResult.stats.addedEdges} 新增
              </span>
              <span className="text-amber-300">
                ~{diffResult.stats.modifiedNodes + diffResult.stats.modifiedEdges} 变更
              </span>
              <span className="text-rose-400">
                -{diffResult.stats.removedNodes + diffResult.stats.removedEdges} 移除
              </span>
            </div>
          ) : (
            <span className="text-emerald-400 font-mono text-[11px]">语义完全一致</span>
          )}
          {onExitDiff && (
            <button
              type="button"
              onClick={onExitDiff}
              title="退出对比模式 (Esc)"
              className="ml-0.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.08] hover:bg-white/[0.15] text-[11px] text-zinc-200 transition-colors"
            >
              <X className="w-3 h-3" />
              <span>退出</span>
            </button>
          )}
        </div>
      )}

      {/* Multi-selection Alignment, Distribution & Group Floating Toolbar */}
      {!diffResult && !flowPickEdgeMode && activeTool === 'select' && selectedNodeIds.length >= 2 && (
        <div
          className={`absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 px-2.5 py-1.5 rounded-2xl border backdrop-blur-xl shadow-2xl text-xs select-none ${
            isLight
              ? 'bg-white/95 border-slate-200 text-slate-700'
              : 'bg-[#171220]/94 border-violet-400/35 text-zinc-200'
          }`}
        >
          <span className="px-1.5 py-0.5 rounded-md bg-violet-500/20 text-violet-300 font-mono text-[10.5px] whitespace-nowrap">
            已选 {selectedNodeIds.length} 项
          </span>
          <div className="h-3.5 w-px bg-white/10 mx-0.5" />
          <button
            type="button"
            onClick={() => onAlignNodes?.('left')}
            title="左对齐"
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <AlignStartVertical className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onAlignNodes?.('center-x')}
            title="水平居中对齐"
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <AlignCenterVertical className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onAlignNodes?.('right')}
            title="右对齐"
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <AlignEndVertical className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onAlignNodes?.('top')}
            title="顶部对齐"
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <AlignStartHorizontal className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onAlignNodes?.('center-y')}
            title="垂直居中对齐"
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <AlignCenterHorizontal className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onAlignNodes?.('bottom')}
            title="底部对齐"
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <AlignEndHorizontal className="w-3.5 h-3.5" />
          </button>

          {selectedNodeIds.length >= 3 && (
            <>
              <div className="h-3.5 w-px bg-white/10 mx-0.5" />
              <button
                type="button"
                onClick={() => onDistributeNodes?.('horizontal')}
                title="水平等距分布"
                className="p-1.5 rounded-lg hover:bg-white/10 text-sky-400 transition-colors"
              >
                <AlignHorizontalSpaceAround className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onDistributeNodes?.('vertical')}
                title="垂直等距分布"
                className="p-1.5 rounded-lg hover:bg-white/10 text-sky-400 transition-colors"
              >
                <AlignVerticalSpaceAround className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          <div className="h-3.5 w-px bg-white/10 mx-0.5" />
          <button
            type="button"
            onClick={() => onGroupSelectedNodes?.()}
            title="用分组边界框包裹选中实体"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 text-[11px] font-medium whitespace-nowrap transition-colors"
          >
            <Group className="w-3.5 h-3.5" />
            <span>建组</span>
          </button>
          <button
            type="button"
            onClick={() => onDeleteSelectedNodes?.()}
            title="批量删除选中实体 (Del)"
            className="p-1.5 rounded-lg hover:bg-rose-500/20 text-rose-400 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Flow Edge-Pick Mode Floating Hint Pill */}
      {flowPickEdgeMode && (
        <div
          className={`absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3.5 py-1.5 rounded-full border backdrop-blur-xl shadow-2xl text-xs select-none ${
            isLight
              ? 'bg-emerald-50/95 border-emerald-300 text-emerald-900'
              : 'bg-[#12221b]/94 border-emerald-400/45 text-emerald-200'
          }`}
        >
          <MousePointerClick className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>点选画布上的任意连线，即可按序追加为当前链路步骤</span>
          <button
            type="button"
            onClick={() => onCancelFlowPickEdge?.()}
            title="退出拾取模式 (Esc)"
            className="p-0.5 rounded-full hover:bg-white/10 text-emerald-300 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Connect Mode Floating Hint Pill */}
      {!flowPickEdgeMode && activeTool === 'connect' && (
        <div
          className={`absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-1.5 rounded-full border backdrop-blur-xl shadow-2xl text-xs select-none ${
            isLight
              ? 'bg-white/95 border-slate-200 text-slate-700'
              : 'bg-[#171220]/94 border-violet-400/35 text-zinc-200'
          }`}
        >
          <GitCommitHorizontal className="w-3.5 h-3.5 text-violet-400 shrink-0" />
          <span>
            {connectSourceNode
              ? `已选起点「${connectSourceNode.title}」，点击目标节点完成连线`
              : '推演连线模式：依次点击起点和终点节点，或直接拖拽 ER 字段端口'}
          </span>
          <button
            type="button"
            onClick={() => onSetTool('select')}
            title="退出连线模式 (Esc)"
            className="p-0.5 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Bottom-center Step-by-step Flow Player */}
      {simulating && flows.length > 0 && (
        <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-16 z-30">
          <FlowPlayerBar
            flows={flows}
            activeFlowId={activeFlowId}
            stepIndex={flowStepIndex}
            isPlaying={isFlowPlaying}
            theme={theme}
            onSelectFlow={(id) => onSelectFlow?.(id)}
            onPrev={() => onFlowPrev?.()}
            onNext={() => onFlowNext?.()}
            onTogglePlay={() => onFlowTogglePlay?.()}
            onReset={() => onFlowReset?.()}
            onEditFlows={onEditFlows}
            onClose={() => onFlowClose?.()}
          />
        </div>
      )}

      {simulating && flows.length === 0 && onEditFlows && (
        <div className="pointer-events-auto absolute left-1/2 -translate-x-1/2 bottom-16 z-30 flex items-center gap-2.5 px-3.5 py-2 rounded-2xl border backdrop-blur-xl shadow-2xl text-xs bg-[#171220]/94 border-violet-400/30 text-zinc-200">
          <span>当前画布暂无推演链路</span>
          <button
            type="button"
            onClick={onEditFlows}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-medium"
          >
            <ListOrdered className="w-3 h-3" />
            <span>编排首条链路</span>
          </button>
          <button
            type="button"
            onClick={() => onFlowClose?.()}
            className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Sub-canvas floating switcher capsule */}
      {subCanvases && subCanvases.length > 0 && (
        <div className="absolute left-4 bottom-[54px] z-30 flex items-center gap-1 p-1 rounded-full border backdrop-blur-md shadow-lg bg-[var(--dd-bg-elevated)] border-[var(--dd-border-subtle)]">
          <span className="pl-2 pr-1 text-[10px] font-mono text-zinc-500 flex items-center gap-1">
            <ChevronsUpDown className="w-3 h-3" />
            引擎画布
          </span>
          {subCanvases.map((sub, idx) => {
            const active = idx === activeSubCanvasIndex;
            const SubIcon = sub.engine === 'redis' ? Zap : Database;
            return (
              <button
                key={sub.id}
                type="button"
                onClick={() => onSelectSubCanvas?.(idx)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] transition-colors ${
                  active
                    ? 'bg-violet-500/20 text-violet-300 font-medium'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06]'
                }`}
              >
                <SubIcon className="w-3 h-3" />
                <span>{sub.name}</span>
                <span className="text-[9.5px] font-mono opacity-75">{sub.nodes.length}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Bottom-left Status Bar + Density & Theme toggles */}
      <div className="absolute bottom-4 left-4 z-30 flex items-center gap-1.5 px-2.5 py-1 rounded-xl border backdrop-blur-md text-[11px] font-mono bg-[var(--dd-bg-elevated)] border-[var(--dd-border-subtle)] text-[var(--dd-text-secondary)] shadow-lg">
        <span className={activeTool === 'draw' ? 'text-emerald-400' : 'text-violet-400'}>●</span>
        <span className="hidden md:inline truncate">
          {activeTool === 'draw'
            ? '自由落绘中：按住左键直接勾勒草图 · Esc 返回选择'
            : 'Tab 下游建点 / Enter 同级建点 / 双击看详情 / 右键菜单'}
        </span>
        <div className="h-3 w-px bg-[var(--dd-border-strong)] mx-0.5" />

        {hasCollapsible ? (
          <button
            type="button"
            onClick={onCycleDensity}
            title="切换卡片密度：收起轮廓 / 完整展开 / 仅关联字段"
            className="p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            {allCollapsed ? (
              <LayoutGrid className="w-3.5 h-3.5 text-violet-400" />
            ) : expandMode === 'related' ? (
              <ListFilter className="w-3.5 h-3.5 text-sky-400" />
            ) : (
              <Table2 className="w-3.5 h-3.5" />
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={onToggleCompactMode}
            title={
              compactMode
                ? '当前为精简模式（仅图标+标签+名称），点击切换回完整卡片'
                : '切换为精简模式（仅显示图标、标签与实体名称）'
            }
            className="p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <LayoutGrid className={`w-3.5 h-3.5 ${compactMode ? 'text-emerald-400' : ''}`} />
          </button>
        )}

        {onToggleMiniMap && (
          <button
            type="button"
            onClick={onToggleMiniMap}
            title={showMiniMap ? '隐藏右下角迷你地图' : '显示右下角迷你地图'}
            className="p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <MapIcon className={`w-3.5 h-3.5 ${showMiniMap ? 'text-sky-400' : ''}`} />
          </button>
        )}

        <button
          type="button"
          onClick={onToggleTheme}
          title={isLight ? '切换到暗夜紫墨画布' : '切换到晴昼白板画布'}
          className="p-1 rounded-lg hover:bg-white/10 transition-colors"
        >
          {isLight ? (
            <Moon className="w-3.5 h-3.5 text-indigo-500" />
          ) : (
            <Sun className="w-3.5 h-3.5 text-amber-300" />
          )}
        </button>
      </div>

      {/* Bottom-right Vertical View Control Stack (next to MiniMap) */}
      <div
        className={`hidden sm:flex flex-col absolute bottom-4 ${
          showMiniMap ? 'right-[192px]' : 'right-4'
        } z-30 w-7 h-[104px] rounded-xl border overflow-hidden divide-y bg-[var(--dd-bg-elevated)] border-[var(--dd-border-subtle)] divide-[var(--dd-border-subtle)] shadow-xl transition-[right] duration-150`}
      >
        <button
          type="button"
          onClick={() => zoomIn()}
          title="放大"
          className="flex-1 grid place-items-center text-[var(--dd-text-secondary)] hover:text-[var(--dd-text-primary)] hover:bg-white/[0.06]"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => zoomOut()}
          title="缩小"
          className="flex-1 grid place-items-center text-[var(--dd-text-secondary)] hover:text-[var(--dd-text-primary)] hover:bg-white/[0.06]"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => fitView({ padding: 0.2, duration: 240 })}
          title="适配全图到视口"
          className="flex-1 grid place-items-center text-[var(--dd-text-secondary)] hover:text-[var(--dd-text-primary)] hover:bg-white/[0.06]"
        >
          <Maximize className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={() => void handleToggleFullscreen()}
          title={isFullscreen ? '退出全屏' : '一键全屏'}
          className="flex-1 grid place-items-center text-[var(--dd-text-secondary)] hover:text-[var(--dd-text-primary)] hover:bg-white/[0.06]"
        >
          {isFullscreen ? <Minimize2 className="w-3 h-3 text-violet-400" /> : <Expand className="w-3 h-3" />}
        </button>
      </div>
    </div>
  );
};
