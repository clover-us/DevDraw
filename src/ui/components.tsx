/**
 * 镜片感知的节点 / 边渲染。一个模型多副镜片：同一组件按 kind / edgeType 切换形态。
 * 架构=失效着色；ER=表卡片（字段折进表内，不再游离）/外键基数；状态机=状态/迁移（缺服务标红）。
 */
import { useEffect, useRef, type ReactNode } from 'react';
import {
  EdgeLabelRenderer,
  Handle,
  Position,
  getBezierPath,
  type EdgeProps,
  type NodeProps,
} from '@xyflow/react';
import type { DependencyMode, EdgeType, NodeState, NodeType } from '../core/types';
import { DEFAULT_NODE_ICON } from '../core/components';
import { Glyph } from './glyphs';

/** 语义类型 → 兜底图标（节点无组件身份时）。 */
const KIND_GLYPH = DEFAULT_NODE_ICON;

/** 表卡片内的一行字段（从全模型 contains 边折叠而来）。 */
export interface FieldRow {
  id: string;
  name: string;
  dataType?: string;
  nullable?: boolean;
  keyRole?: string;
}

export interface DevDrawNodeData extends Record<string, unknown> {
  name: string;
  kind: NodeType;
  state: NodeState;
  isSeed: boolean;
  highlighted: boolean;
  selected: boolean;
  dataType?: string;
  nullable?: boolean;
  keyRole?: string;
  initial?: boolean;
  fieldCount?: number;
  detail?: string;
  /** 组件图标 glyph id（表现层，来自 node.attrs.icon 快照）。 */
  icon?: string;
  /** 组件名（如 Redis / Kafka），显示在类型行。 */
  componentLabel?: string;
  /** ER 表卡片：内部字段行。 */
  fields?: FieldRow[];
  selectedFieldId?: string | null;
  onFieldSelect?: (id: string) => void;
  onSelect: (id: string) => void;
  renaming?: boolean;
  onRename?: (id: string, name: string) => void;
  onRenameCancel?: () => void;
  /** ER 表卡片：正在原地改名的字段 id。 */
  renamingFieldId?: string | null;
  onFieldRenameStart?: (id: string) => void;
  onFieldRename?: (id: string, name: string) => void;
  onFieldRenameCancel?: () => void;
}

/**
 * 原地改名：双击后直接在原文字上编辑（同一个 span，字体/字号/颜色完全不变）。
 * 用 contentEditable 而非 input，避免输入框样式覆盖原字体；Enter 提交、Esc 取消、失焦提交。
 */
function InlineName({
  name,
  renaming,
  className,
  ariaLabel,
  onRename,
  onCancel,
}: {
  name: string;
  renaming?: boolean;
  className?: string;
  ariaLabel: string;
  onRename?: (name: string) => void;
  onCancel?: () => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (renaming) {
      cancelRef.current = false;
      el.textContent = name;
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    } else if (el.textContent !== name) {
      // 退出编辑：把 DOM 拉回模型值（取消时可能残留输入）。
      el.textContent = name;
    }
    // 仅在进入/退出编辑时同步；编辑期间 name 不变，避免覆盖用户输入。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renaming]);

  return (
    <span
      ref={ref}
      className={`${className ?? ''}${renaming ? ' dd-editing nodrag nowheel' : ''}`}
      contentEditable={renaming}
      suppressContentEditableWarning
      role={renaming ? 'textbox' : undefined}
      aria-label={renaming ? ariaLabel : undefined}
      onClick={(e) => {
        if (renaming) e.stopPropagation();
      }}
      onDoubleClick={(e) => {
        if (renaming) e.stopPropagation();
      }}
      onKeyDown={(e) => {
        if (!renaming) return;
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancelRef.current = true;
          e.currentTarget.textContent = name;
          onCancel?.();
        }
      }}
      onPaste={(e) => {
        if (!renaming) return;
        e.preventDefault();
        document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
      }}
      onBlur={(e) => {
        if (!renaming) return;
        if (cancelRef.current) {
          cancelRef.current = false;
          return;
        }
        onRename?.(e.currentTarget.textContent ?? '');
      }}
    >
      {name}
    </span>
  );
}

const KIND_LABEL: Record<NodeType, string> = {
  Service: '服务',
  Database: '数据库',
  Table: '表',
  Field: '字段',
  Queue: '队列',
  Endpoint: '端点',
  ExternalSystem: '外部系统',
  Actor: '角色',
  Decision: '决策',
  Assumption: '假设',
  Note: '笔记',
  Lifecycle: '生命周期',
  State: '状态',
};

export function DevDrawNode({ id, data }: NodeProps) {
  const d = data as DevDrawNodeData;
  const cls = [
    'dd-node',
    `kind-${d.kind.toLowerCase()}`,
    `state-${d.state}`,
    d.isSeed ? 'seed' : '',
    d.highlighted ? 'highlighted' : '',
    d.selected ? 'selected' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const renameNode = (name: string) => d.onRename?.(id, name);

  let body: ReactNode;
  if (d.kind === 'Table') {
    const fields = d.fields ?? [];
    body = (
      <>
        <div className="dd-table-head">
          <span className="dd-table-glyph">
            <Glyph id={d.icon ?? 'table'} size={16} />
          </span>
          <InlineName
            className="dd-node-name"
            name={d.name}
            renaming={d.renaming}
            ariaLabel="重命名表"
            onRename={renameNode}
            onCancel={d.onRenameCancel}
          />
          <span className="dd-table-count">{fields.length || d.fieldCount || 0} 列</span>
        </div>
        <div className="dd-table-fields">
          {fields.length === 0 && <div className="dd-table-empty">无字段 · 在右侧抽屉添加</div>}
          {fields.map((f) => (
            <div
              key={f.id}
              className={`dd-field-row${d.selectedFieldId === f.id ? ' selected' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                d.onFieldSelect?.(f.id);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                d.onFieldRenameStart?.(f.id);
              }}
              title="单击查看详情 · 双击改名"
            >
              {f.keyRole ? (
                <span className={`dd-key dd-key-${f.keyRole.toLowerCase()}`}>{f.keyRole}</span>
              ) : (
                <span className="dd-key-spacer" />
              )}
              <InlineName
                className="dd-field-name"
                name={f.name}
                renaming={d.renamingFieldId === f.id}
                ariaLabel="重命名字段"
                onRename={(name) => d.onFieldRename?.(f.id, name)}
                onCancel={d.onFieldRenameCancel}
              />
              <span className="dd-field-type">{f.dataType}</span>
              {f.nullable && (
                <span className="dd-nullable" title="可空">
                  ?
                </span>
              )}
            </div>
          ))}
        </div>
      </>
    );
  } else if (d.kind === 'Field') {
    body = (
      <>
        {d.keyRole && <span className={`dd-key dd-key-${d.keyRole.toLowerCase()}`}>{d.keyRole}</span>}
        <InlineName
          className="dd-field-name"
          name={d.name}
          renaming={d.renaming}
          ariaLabel="重命名字段"
          onRename={renameNode}
          onCancel={d.onRenameCancel}
        />
        <span className="dd-field-type">{d.dataType}</span>
        {d.nullable && <span className="dd-nullable" title="可空">?</span>}
      </>
    );
  } else if (d.kind === 'State') {
    body = (
      <>
        <InlineName
          className="dd-node-name"
          name={d.name}
          renaming={d.renaming}
          ariaLabel="重命名状态"
          onRename={renameNode}
          onCancel={d.onRenameCancel}
        />
        {d.initial && <div className="dd-initial-badge">初始</div>}
      </>
    );
  } else if (d.kind === 'Decision' || d.kind === 'Assumption' || d.kind === 'Note') {
    body = (
      <>
        <div className="dd-node-kind">
          <Glyph id={d.icon ?? KIND_GLYPH[d.kind]} size={13} />
          {KIND_LABEL[d.kind]}
        </div>
        <InlineName
          className="dd-node-name"
          name={d.name}
          renaming={d.renaming}
          ariaLabel="重命名"
          onRename={renameNode}
          onCancel={d.onRenameCancel}
        />
        {d.detail && <div className="dd-knowledge-detail">{d.detail}</div>}
      </>
    );
  } else {
    body = (
      <div className="dd-node-arch-row">
        <span className="dd-node-glyph">
          <Glyph id={d.icon ?? KIND_GLYPH[d.kind]} size={22} />
        </span>
        <span className="dd-node-arch-text">
          <span className="dd-node-kind">
            {KIND_LABEL[d.kind]}
            {d.componentLabel ? ` · ${d.componentLabel}` : ''}
          </span>
          <InlineName
            className="dd-node-name"
            name={d.name}
            renaming={d.renaming}
            ariaLabel="重命名节点"
            onRename={renameNode}
            onCancel={d.onRenameCancel}
          />
        </span>
        {d.isSeed && <span className="dd-seed-badge">失效源</span>}
      </div>
    );
  }

  return (
    <div className={cls} onClick={() => d.onSelect(id)}>
      <Handle type="target" position={Position.Left} />
      {body}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export interface DevDrawEdgeData extends Record<string, unknown> {
  edgeType: EdgeType;
  mode: DependencyMode;
  label?: string;
  impacted: boolean;
  highlighted: boolean;
  cardinality?: string;
  keyCol?: string;
  event?: string;
  missingService?: boolean;
  onSelect: (edgeId: string) => void;
}

const HIDDEN_EDGES = new Set<EdgeType>(['contains', 'has-lifecycle', 'encodes']);

export function DevDrawEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected } = props;
  const d = data as DevDrawEdgeData;
  if (HIDDEN_EDGES.has(d.edgeType)) return null;

  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  let cls: string;
  let text: string;
  if (d.edgeType === 'fk') {
    cls = `edge-fk${d.cardinality === 'N:M' ? ' nm-error' : ''}`;
    text = `${d.cardinality ?? ''}${d.keyCol ? ` · ${d.keyCol}` : ''}`;
  } else if (d.edgeType === 'transition') {
    cls = `edge-transition${d.missingService ? ' missing-service' : ''}`;
    text = `${d.event ?? 'transition'}${d.missingService ? ' ⚠ 缺服务' : ''}`;
  } else {
    cls = `mode-${d.mode}`;
    text = `${d.label ? `${d.label} · ` : ''}${d.edgeType} · ${d.mode}`;
  }
  cls += `${d.impacted ? ' impacted' : ''}${d.highlighted ? ' highlighted' : ''}${selected ? ' selected' : ''}`;

  return (
    <>
      <path id={id} d={path} fill="none" className={`dd-edge ${cls}`} />
      <path d={path} fill="none" stroke="transparent" strokeWidth={20} style={{ cursor: 'pointer' }} />
      <EdgeLabelRenderer>
        <div
          className={`dd-edge-label ${cls}`}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          onClick={(event) => {
            event.stopPropagation();
            d.onSelect(id);
          }}
        >
          {text}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
