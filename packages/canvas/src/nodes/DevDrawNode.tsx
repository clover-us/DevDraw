import React, { memo } from 'react';
import { Handle, NodeResizer, Position, type NodeProps, type Node } from '@xyflow/react';
import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowDownRight,
  ArrowLeftRight,
  ArrowRightCircle,
  BellRing,
  Blocks,
  Box,
  Boxes,
  Braces,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Clock,
  Cloud,
  Cog,
  CornerUpRight,
  Cpu,
  Crown,
  Database,
  DatabaseZap,
  DoorOpen,
  Eye,
  FileCode,
  FileText,
  Filter,
  GitFork,
  GitMerge,
  Globe,
  HardDrive,
  Hash,
  HelpCircle,
  Hexagon,
  History,
  Hourglass,
  KeyRound,
  Layers,
  Lightbulb,
  Link,
  ListOrdered,
  ListTree,
  LogIn,
  Merge,
  Package,
  PlayCircle,
  Radar,
  Radio,
  Repeat,
  Rocket,
  ServerCog,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Split,
  Table2,
  Tags,
  Trophy,
  Zap,
} from 'lucide-react';
import {
  findPrimitiveByKind,
  getAnnotationKind,
  isCollapsibleEntity,
  isGroupEntity,
  type CanvasExpandMode,
  type EntityNode,
  type EntityVisualStyle,
  type SemanticColor,
} from '@devdraw/core';

export const FIELD_SOURCE_PREFIX = 'field-s:';
export const FIELD_TARGET_PREFIX = 'field-t:';

export function toFieldSourceHandle(fieldName: string): string {
  return `${FIELD_SOURCE_PREFIX}${fieldName}`;
}

export function toFieldTargetHandle(fieldName: string): string {
  return `${FIELD_TARGET_PREFIX}${fieldName}`;
}

export function parseFieldHandle(handleId?: string | null): string | undefined {
  if (!handleId) return undefined;
  if (handleId.startsWith(FIELD_SOURCE_PREFIX)) return handleId.slice(FIELD_SOURCE_PREFIX.length);
  if (handleId.startsWith(FIELD_TARGET_PREFIX)) return handleId.slice(FIELD_TARGET_PREFIX.length);
  return undefined;
}

export interface DevDrawFlowNodeData extends Record<string, unknown> {
  entity: EntityNode;
  kindStyle?: EntityVisualStyle;
  theme: 'dark' | 'light';
  expandMode: CanvasExpandMode;
  compactMode?: boolean;
  relatedFields: string[];
  flowState?: 'idle' | 'active' | 'dimmed';
  onToggleCollapse?: (nodeId: string) => void;
  onDrillDown?: (node: EntityNode) => void;
  onResizeNode?: (nodeId: string, x: number, y: number, w: number, h: number) => void;
}

export type DevDrawFlowNode = Node<DevDrawFlowNodeData, 'devdraw'>;

export const ENTITY_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  hexagon: Hexagon,
  'log-in': LogIn,
  database: Database,
  smartphone: Smartphone,
  cog: Cog,
  zap: Zap,
  layers: Layers,
  'key-round': KeyRound,
  cloud: Cloud,
  'table-2': Table2,
  link: Link,
  'git-merge': GitMerge,
  'list-tree': ListTree,
  history: History,
  activity: Activity,
  braces: Braces,
  eye: Eye,
  split: Split,
  hash: Hash,
  trophy: Trophy,
  tags: Tags,
  'list-ordered': ListOrdered,
  radio: Radio,
  globe: Globe,
  'split-square-horizontal': ArrowLeftRight,
  'server-cog': ServerCog,
  'share-2': Share2,
  'shield-check': ShieldCheck,
  'hard-drive': HardDrive,
  archive: Archive,
  rocket: Rocket,
  radar: Radar,
  'play-circle': PlayCircle,
  'circle-dot': CircleDot,
  'git-fork': GitFork,
  'help-circle': HelpCircle,
  clock: Clock,
  'alert-triangle': AlertTriangle,
  'check-circle-2': CheckCircle2,
  'arrow-right-circle': ArrowRightCircle,
  'file-code': FileCode,
  filter: Filter,
  cpu: Cpu,
  hourglass: Hourglass,
  merge: Merge,
  sparkles: Sparkles,
  'database-zap': DatabaseZap,
  boxes: Boxes,
  blocks: Blocks,
  package: Package,
  crown: Crown,
  'bell-ring': BellRing,
  'shield-alert': ShieldAlert,
  'door-open': DoorOpen,
  repeat: Repeat,
  lightbulb: Lightbulb,
  'file-text': FileText,
};

const COLOR_STYLES: Record<
  SemanticColor,
  {
    darkBorder: string;
    lightBorder: string;
    tagDark: string;
    tagLight: string;
    iconBoxDark: string;
    iconBoxLight: string;
    iconOutline: string;
    iconPlain: string;
    bar: string;
    calloutDark: string;
    calloutLight: string;
  }
> = {
  violet: {
    darkBorder: 'border-violet-400/25 hover:border-violet-400/50',
    lightBorder: 'border-slate-200/95 hover:border-violet-300',
    tagDark: 'text-violet-300/80',
    tagLight: 'text-violet-600/85',
    iconBoxDark: 'bg-violet-500/12 text-violet-300',
    iconBoxLight: 'bg-violet-50 text-violet-600',
    iconOutline: 'bg-transparent text-violet-400 border border-violet-400/50',
    iconPlain: 'text-violet-400',
    bar: 'bg-violet-400',
    calloutDark: 'bg-violet-500/[0.06] border-violet-400/25',
    calloutLight: 'bg-violet-50/75 border-violet-300/70',
  },
  sky: {
    darkBorder: 'border-sky-400/25 hover:border-sky-400/50',
    lightBorder: 'border-slate-200/95 hover:border-sky-300',
    tagDark: 'text-sky-300/80',
    tagLight: 'text-sky-600/85',
    iconBoxDark: 'bg-sky-500/12 text-sky-300',
    iconBoxLight: 'bg-sky-50 text-sky-600',
    iconOutline: 'bg-transparent text-sky-400 border border-sky-400/50',
    iconPlain: 'text-sky-400',
    bar: 'bg-sky-400',
    calloutDark: 'bg-sky-500/[0.06] border-sky-400/25',
    calloutLight: 'bg-sky-50/75 border-sky-300/70',
  },
  emerald: {
    darkBorder: 'border-emerald-400/25 hover:border-emerald-400/50',
    lightBorder: 'border-slate-200/95 hover:border-emerald-300',
    tagDark: 'text-emerald-300/80',
    tagLight: 'text-emerald-600/85',
    iconBoxDark: 'bg-emerald-500/12 text-emerald-300',
    iconBoxLight: 'bg-emerald-50 text-emerald-600',
    iconOutline: 'bg-transparent text-emerald-400 border border-emerald-400/50',
    iconPlain: 'text-emerald-400',
    bar: 'bg-emerald-400',
    calloutDark: 'bg-emerald-500/[0.06] border-emerald-400/25',
    calloutLight: 'bg-emerald-50/75 border-emerald-300/70',
  },
  amber: {
    darkBorder: 'border-amber-400/28 hover:border-amber-400/55',
    lightBorder: 'border-slate-200/95 hover:border-amber-300',
    tagDark: 'text-amber-300/85',
    tagLight: 'text-amber-600/90',
    iconBoxDark: 'bg-amber-500/12 text-amber-300',
    iconBoxLight: 'bg-amber-50 text-amber-600',
    iconOutline: 'bg-transparent text-amber-400 border border-amber-400/50',
    iconPlain: 'text-amber-400',
    bar: 'bg-amber-400',
    calloutDark: 'bg-amber-500/[0.06] border-amber-400/25',
    calloutLight: 'bg-amber-50/80 border-amber-300/70',
  },
  rose: {
    darkBorder: 'border-rose-400/25 hover:border-rose-400/50',
    lightBorder: 'border-slate-200/95 hover:border-rose-300',
    tagDark: 'text-rose-300/80',
    tagLight: 'text-rose-600/85',
    iconBoxDark: 'bg-rose-500/12 text-rose-300',
    iconBoxLight: 'bg-rose-50 text-rose-600',
    iconOutline: 'bg-transparent text-rose-400 border border-rose-400/50',
    iconPlain: 'text-rose-400',
    bar: 'bg-rose-400',
    calloutDark: 'bg-rose-500/[0.06] border-rose-400/25',
    calloutLight: 'bg-rose-50/75 border-rose-300/70',
  },
  slate: {
    darkBorder: 'border-zinc-500/28 hover:border-zinc-400/45',
    lightBorder: 'border-slate-200/95 hover:border-slate-300',
    tagDark: 'text-zinc-400',
    tagLight: 'text-slate-500',
    iconBoxDark: 'bg-zinc-500/15 text-zinc-300',
    iconBoxLight: 'bg-slate-100 text-slate-600',
    iconOutline: 'bg-transparent text-zinc-400 border border-zinc-400/45',
    iconPlain: 'text-zinc-400',
    bar: 'bg-zinc-400',
    calloutDark: 'bg-zinc-500/[0.06] border-zinc-500/25',
    calloutLight: 'bg-slate-100/80 border-slate-300/80',
  },
};

export const DevDrawNodeComponent = memo(function DevDrawNodeComponent({
  data,
  selected,
}: NodeProps<DevDrawFlowNode>) {
  const {
    entity,
    kindStyle,
    theme,
    expandMode,
    compactMode = false,
    relatedFields,
    flowState = 'idle',
    onToggleCollapse,
    onDrillDown,
    onResizeNode,
  } = data;

  const isLight = theme === 'light';
  const annKind = getAnnotationKind(entity);
  const isRef = entity.kind === 'store_ref' || !!entity.ref;
  const isGroup = isGroupEntity(entity);
  const collapsible = isCollapsibleEntity(entity);
  const isCollapsed = collapsible && !!entity.collapsed;

  // Merge project-wide kind style + per-entity custom style override
  const effectiveColor: SemanticColor =
    entity.customStyle?.color ?? kindStyle?.color ?? entity.color ?? 'sky';
  const effectiveBorder =
    entity.customStyle?.borderStyle ?? kindStyle?.borderStyle ?? (annKind || isRef ? 'dashed' : 'solid');
  const primitiveDef = findPrimitiveByKind(entity.kind);
  const effectiveRadius = entity.customStyle?.radius ?? kindStyle?.radius ?? 'xl';
  const effectiveAccentBar = entity.customStyle?.accentBar ?? kindStyle?.accentBar ?? 'none';
  const effectiveIconName =
    entity.customStyle?.icon ?? kindStyle?.icon ?? entity.icon ?? primitiveDef?.icon ?? '';
  const effectiveIconStyle = entity.customStyle?.iconStyle ?? kindStyle?.iconStyle ?? 'filled';

  const palette = COLOR_STYLES[effectiveColor];

  const IconComp = isRef
    ? CornerUpRight
    : ENTITY_ICON_MAP[effectiveIconName] ||
      (annKind === 'assumption'
        ? Lightbulb
        : annKind === 'decision'
          ? ShieldCheck
          : annKind === 'note'
            ? FileText
            : Box);

  const flowClass =
    flowState === 'dimmed'
      ? 'opacity-25 scale-[0.98]'
      : flowState === 'active'
        ? 'ring-2 ring-emerald-400/80 shadow-[0_0_24px_rgba(52,211,153,0.3)]'
        : '';

  const selectedRing = selected
    ? isLight
      ? 'ring-1 ring-sky-500/75 !border-sky-400 shadow-[0_6px_24px_rgba(2,132,199,0.16)]'
      : 'ring-1 ring-sky-400/75 !border-sky-400/70 shadow-[0_8px_28px_rgba(56,189,248,0.18)]'
    : '';

  const surfaceClass = isLight
    ? 'bg-white text-slate-800 shadow-[0_4px_16px_-4px_rgba(15,23,42,0.08),0_1px_2px_rgba(15,23,42,0.04)]'
    : 'bg-gradient-to-b from-[#1e192b]/95 to-[#15111f]/95 text-zinc-100 shadow-[0_10px_26px_-8px_rgba(0,0,0,0.68),inset_0_1px_0_0_rgba(255,255,255,0.07)]';

  const borderStyleClass =
    effectiveBorder === 'none'
      ? 'border-transparent'
      : effectiveBorder === 'dashed'
        ? `border-dashed ${isLight ? palette.lightBorder : palette.darkBorder}`
        : `border-solid ${isLight ? palette.lightBorder : palette.darkBorder}`;

  const radiusClass =
    effectiveRadius === 'md'
      ? 'rounded-lg'
      : effectiveRadius === '2xl'
        ? 'rounded-2xl'
        : 'rounded-[10px]';

  // Dedicated Group / Boundary Container rendering (VPC / AZ / Bounded Context)
  if (isGroup) {
    const groupTone = isLight ? palette.calloutLight : palette.calloutDark;
    return (
      <div
        className={`relative w-full h-full min-w-[240px] min-h-[160px] rounded-2xl border-2 border-dashed transition-colors ${groupTone} ${
          selected ? 'ring-2 ring-sky-400/70 !border-sky-400/80' : ''
        }`}
      >
        <NodeResizer
          isVisible={Boolean(selected)}
          minWidth={240}
          minHeight={160}
          lineStyle={{ borderColor: '#38bdf8', borderWidth: 1 }}
          handleStyle={{
            width: 8,
            height: 8,
            borderRadius: 3,
            backgroundColor: '#38bdf8',
            border: '1px solid #0f172a',
          }}
          onResizeEnd={(_event, params) => {
            onResizeNode?.(
              entity.id,
              Math.round(params.x),
              Math.round(params.y),
              Math.round(params.width),
              Math.round(params.height)
            );
          }}
        />
        <div className="px-3.5 py-2.5 flex items-center gap-2 pointer-events-none select-none">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold ${
              isLight ? palette.tagLight : palette.tagDark
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>{entity.tag || 'GROUP'}</span>
          </span>
          <span
            className={`text-xs font-semibold truncate ${
              isLight ? 'text-slate-700' : 'text-zinc-200'
            }`}
          >
            {entity.title}
          </span>
          {entity.note && (
            <span
              className={`text-[10.5px] truncate ${
                isLight ? 'text-slate-500' : 'text-zinc-400'
              }`}
            >
              · {entity.note}
            </span>
          )}
        </div>
      </div>
    );
  }

  const allFields = entity.fields ?? [];
  const visibleFields =
    expandMode === 'related' && relatedFields.length > 0
      ? allFields.filter((f) => relatedFields.includes(f.name))
      : allFields;
  const hiddenCount = Math.max(0, allFields.length - visibleFields.length);

  const handleBorderClass = isLight ? '!border-white shadow-sm' : '!border-[#15111d]';
  const isCompactCard = compactMode && !collapsible;
  const showExpandedFields = collapsible && !isCollapsed && allFields.length > 0;

  // Lightweight callout presentation for Reasoning Annotations (Assumption / Decision / Note)
  if (annKind && !entity.customStyle) {
    return (
      <div
        title={isCompactCard && entity.note ? entity.note : undefined}
        className={`group relative ${
          isCompactCard ? 'min-w-[168px] max-w-[236px]' : 'min-w-[216px] max-w-[268px]'
        } rounded-lg border border-dashed backdrop-blur-md transition-all duration-150 select-none before:content-[''] before:absolute before:-inset-3 before:-z-10 before:rounded-2xl ${
          isLight ? palette.calloutLight : palette.calloutDark
        } ${selectedRing} ${flowClass}`}
      >
        <div className={`absolute left-0 top-2 bottom-2 w-[2.5px] rounded-r-full ${palette.bar} opacity-80`} />

        <Handle type="source" id="left" position={Position.Left} className={`dd-handle !bg-violet-400 ${handleBorderClass} opacity-0 group-hover:opacity-100 transition-opacity duration-150`} />
        <Handle type="source" id="right" position={Position.Right} className={`dd-handle !bg-violet-400 ${handleBorderClass} opacity-0 group-hover:opacity-100 transition-opacity duration-150`} />
        <Handle type="source" id="top" position={Position.Top} className={`dd-handle !bg-sky-400 ${handleBorderClass} opacity-0 group-hover:opacity-100 transition-opacity duration-150`} />
        <Handle type="source" id="bottom" position={Position.Bottom} className={`dd-handle !bg-sky-400 ${handleBorderClass} opacity-0 group-hover:opacity-100 transition-opacity duration-150`} />

        <div className="pl-3.5 pr-3 py-2 space-y-1">
          <div className="flex items-center gap-1.5">
            <IconComp className={`w-3 h-3 shrink-0 ${palette.iconPlain}`} />
            <span className={`text-[10px] font-mono tracking-wide ${isLight ? palette.tagLight : palette.tagDark}`}>
              {entity.tag}
            </span>
          </div>
          <div
            className={`text-[12px] font-medium leading-snug ${
              isLight ? 'text-slate-800' : 'text-zinc-100/95'
            }`}
          >
            {entity.title}
          </div>
          {!isCompactCard && entity.note && (
            <div className={`text-[11px] leading-relaxed line-clamp-2 ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>
              {entity.note}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      title={isCompactCard && entity.note ? entity.note : undefined}
      className={`group relative ${
        isCompactCard ? 'min-w-[160px] max-w-[236px]' : 'min-w-[224px] max-w-[272px]'
      } border ${radiusClass} ${borderStyleClass} ${surfaceClass} ${selectedRing} ${flowClass} transition-all duration-150 select-none before:content-[''] before:absolute before:-inset-3 before:-z-10 before:rounded-3xl`}
    >
      {/* Optional Semantic Accent Bar */}
      {effectiveAccentBar === 'top' && (
        <div className={`h-[3px] w-full ${palette.bar} ${radiusClass === 'rounded-lg' ? 'rounded-t-lg' : radiusClass === 'rounded-2xl' ? 'rounded-t-2xl' : 'rounded-t-[10px]'} opacity-85`} />
      )}
      {effectiveAccentBar === 'left' && (
        <div className={`absolute left-0 top-2 bottom-2 w-[2.5px] rounded-r-full ${palette.bar} opacity-85`} />
      )}
      {/* Four-side bidirectional connection handles (ConnectionMode.Loose: any side can start or receive) */}
      <Handle
        type="source"
        id="left"
        position={Position.Left}
        style={showExpandedFields ? { top: 28 } : undefined}
        className={`dd-handle !bg-violet-400 ${handleBorderClass} opacity-0 group-hover:opacity-100 transition-opacity duration-150`}
      />
      <Handle
        type="source"
        id="right"
        position={Position.Right}
        style={showExpandedFields ? { top: 28 } : undefined}
        className={`dd-handle !bg-violet-400 ${handleBorderClass} opacity-0 group-hover:opacity-100 transition-opacity duration-150`}
      />
      <Handle
        type="source"
        id="top"
        position={Position.Top}
        className={`dd-handle !bg-sky-400 ${handleBorderClass} opacity-0 group-hover:opacity-100 transition-opacity duration-150`}
      />
      <Handle
        type="source"
        id="bottom"
        position={Position.Bottom}
        className={`dd-handle !bg-sky-400 ${handleBorderClass} opacity-0 group-hover:opacity-100 transition-opacity duration-150`}
      />

      {/* Header */}
      <div className={`${isCompactCard ? 'px-3 py-2' : 'px-3.5 py-2.5'} flex items-center gap-2.5`}>
        {effectiveIconStyle !== 'hidden' && (
          <div
            className={
              effectiveIconStyle === 'plain'
                ? `w-5 h-5 flex items-center justify-center shrink-0 ${palette.iconPlain}`
                : effectiveIconStyle === 'outline'
                  ? `w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${palette.iconOutline}`
                  : `w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isLight ? palette.iconBoxLight : palette.iconBoxDark}`
            }
          >
            <IconComp className={effectiveIconStyle === 'plain' ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span
              className={`text-[10px] font-mono tracking-wide leading-none truncate ${
                isLight ? palette.tagLight : palette.tagDark
              }`}
            >
              {entity.tag}
            </span>
            {!isCompactCard && entity.tech && (
              <>
                <span className="text-[9px] text-zinc-600">·</span>
                <span
                  className={`text-[10px] font-mono leading-none truncate ${
                    isLight ? 'text-slate-400' : 'text-zinc-500'
                  }`}
                >
                  {entity.tech}
                </span>
              </>
            )}
          </div>

          <div
            className={`text-[13px] font-medium tracking-[-0.01em] leading-snug truncate ${
              isLight ? 'text-slate-900' : 'text-zinc-100'
            }`}
          >
            {entity.title}
          </div>

          {!isCompactCard && (entity.spec || entity.aggregate || entity.complexity) && (
            <div className="mt-1 text-[10px] font-mono text-violet-400/90 truncate">
              {entity.spec || entity.aggregate || `Complexity: ${entity.complexity}`}
            </div>
          )}
        </div>

        {collapsible && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse?.(entity.id);
            }}
            title={isCollapsed ? '展开字段明细' : '收起卡片轮廓'}
            className={`p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity ${
              isLight
                ? 'hover:bg-slate-100 text-slate-500'
                : 'hover:bg-white/10 text-zinc-400 hover:text-white'
            }`}
          >
            {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {/* ER / Redis Keyspace Fields (when expanded) */}
      {collapsible && !isCollapsed && allFields.length > 0 && (
        <div
          className={`border-t px-2.5 py-1.5 space-y-1 ${
            isLight ? 'border-slate-200/80 bg-slate-50/70' : 'border-white/[0.07] bg-black/20'
          }`}
        >
          {entity.kv && (entity.kv.ttl || entity.kv.policy) && (
            <div className="flex items-center justify-between text-[9.5px] font-mono text-rose-400/90 px-1 pb-1 border-b border-white/[0.05]">
              <span>TTL: {entity.kv.ttl || '∞'}</span>
              <span>{entity.kv.policy || 'noeviction'}</span>
            </div>
          )}
          {visibleFields.map((field) => {
            const isLinkedField = relatedFields.includes(field.name);
            return (
              <div
                key={field.name}
                title={field.note || `${field.name}: ${field.type}`}
                className={`group/field relative flex items-center justify-between gap-2 px-1.5 py-0.5 rounded text-[10.5px] font-mono transition-colors ${
                  isLight ? 'hover:bg-slate-200/70' : 'hover:bg-white/[0.06]'
                }`}
              >
                {/* Field-level left & right bidirectional ports (ConnectionMode.Loose) */}
                <Handle
                  type="source"
                  id={toFieldTargetHandle(field.name)}
                  position={Position.Left}
                  style={{ left: -11, top: '50%' }}
                  className={`dd-handle !w-[7px] !h-[7px] ${handleBorderClass} opacity-0 transition-opacity duration-150 ${
                    isLinkedField
                      ? '!bg-sky-400 group-hover:opacity-100'
                      : '!bg-violet-400 group-hover/field:opacity-100'
                  }`}
                />
                <Handle
                  type="source"
                  id={toFieldSourceHandle(field.name)}
                  position={Position.Right}
                  style={{ right: -11, top: '50%' }}
                  className={`dd-handle !w-[7px] !h-[7px] ${handleBorderClass} opacity-0 transition-opacity duration-150 ${
                    isLinkedField
                      ? '!bg-sky-400 group-hover:opacity-100'
                      : '!bg-violet-400 group-hover/field:opacity-100'
                  }`}
                />

                <div className="flex items-center gap-1.5 min-w-0">
                  {field.key && (
                    <span
                      className={`px-1 rounded text-[8.5px] font-bold ${
                        field.key === 'PK'
                          ? 'bg-amber-500/20 text-amber-300'
                          : field.key === 'FK'
                            ? 'bg-sky-500/20 text-sky-300'
                            : 'bg-emerald-500/20 text-emerald-300'
                      }`}
                    >
                      {field.key}
                    </span>
                  )}
                  <span className={`truncate ${isLight ? 'text-slate-800' : 'text-zinc-200'}`}>
                    {field.name}
                  </span>
                </div>
                <span className="text-[9.5px] text-zinc-500 shrink-0">{field.type}</span>
              </div>
            );
          })}
          {hiddenCount > 0 && (
            <div className="px-1 pt-0.5 text-[9.5px] font-mono text-zinc-500">
              + 其余 {hiddenCount} 个未关联字段（仅关联模式）
            </div>
          )}
        </div>
      )}

      {/* Note / Summary */}
      {!isCompactCard && entity.note && (!collapsible || isCollapsed) && (
        <div
          className={`px-3.5 pb-2.5 text-[11px] leading-relaxed line-clamp-2 ${
            isLight ? 'text-slate-500' : 'text-zinc-400'
          }`}
        >
          {entity.note}
        </div>
      )}

      {/* Drill-down / Cross-layer Reference Footer Badge */}
      {!isCompactCard && (entity.drillTarget || isRef) && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDrillDown?.(entity);
          }}
          onDoubleClick={(e) => e.stopPropagation()}
          className={`w-full px-3.5 py-1.5 border-t flex items-center justify-between text-[10px] font-mono transition-colors ${
            isLight
              ? 'border-slate-200/80 text-violet-600 bg-violet-50/50 hover:bg-violet-100/70 rounded-b-2xl'
              : 'border-white/[0.06] text-violet-300/90 bg-violet-500/[0.06] hover:bg-violet-500/[0.14] rounded-b-2xl'
          }`}
        >
          <span>{isRef ? '只读跨层引用 · 点击跳转' : '进入关联下钻视图'}</span>
          <ArrowDownRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );
});
