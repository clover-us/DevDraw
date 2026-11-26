import React from 'react';
import { ExternalLink, Link2, PanelRightClose, Plus, Trash2 } from 'lucide-react';
import {
  getAnnotationKind,
  isCollapsibleEntity,
  TECH_BADGES,
  type EdgeCardinality,
  type EntityStatus,
  type ErField,
  type NodeLinks,
} from '@devdraw/core';
import { getActiveSlotFromProject, useWorkbenchStore } from '../store/useWorkbenchStore';

export const RightInspector: React.FC = () => {
  const {
    projects,
    activeProjectId,
    activeLayerIndex,
    selectedNodeId,
    selectedEdgeId,
    inspectorOpen,
    closeInspector,
    updateNode,
    duplicateNode,
    deleteNode,
    drillToNodeTarget,
    updateEdge,
    updateEdgeWaypoints,
    reverseEdge,
    deleteEdge,
  } = useWorkbenchStore();

  const project = projects.find((p) => p.id === activeProjectId);
  const active = getActiveSlotFromProject(project, activeLayerIndex);
  if (!project || !active) return null;

  const node = selectedNodeId ? active.slot.nodes.find((n) => n.id === selectedNodeId) : null;
  const edge = selectedEdgeId ? active.slot.edges.find((e) => e.id === selectedEdgeId) : null;

  if (!inspectorOpen || (!node && !edge)) return null;

  const isAnnotation = node ? !!getAnnotationKind(node) : false;
  const isCollapsible = node ? isCollapsibleEntity(node) : false;
  const isKv = node
    ? node.kind === 'store_kv' || node.kind.startsWith('kv_') || node.engine === 'redis'
    : false;

  const updateField = (idx: number, patch: Partial<ErField>) => {
    if (!node) return;
    const fields = [...(node.fields ?? [])];
    fields[idx] = { ...fields[idx], ...patch };
    updateNode(node.id, { fields });
  };

  const addField = () => {
    if (!node) return;
    const fields = [...(node.fields ?? []), { key: '' as const, name: 'new_col', type: 'VARCHAR(64)', note: '' }];
    updateNode(node.id, { fields });
  };

  const removeField = (idx: number) => {
    if (!node) return;
    const fields = (node.fields ?? []).filter((_, i) => i !== idx);
    updateNode(node.id, { fields });
  };

  const toggleTechBadge = (label: string) => {
    if (!node) return;
    const parts = (node.tech ?? '')
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean);
    const existsIdx = parts.findIndex((p) => p.toLowerCase() === label.toLowerCase());
    const next =
      existsIdx >= 0 ? parts.filter((_, i) => i !== existsIdx) : [...parts, label];
    updateNode(node.id, { tech: next.length > 0 ? next.join(' / ') : undefined });
  };

  const cycleFieldKey = (idx: number) => {
    if (!node) return;
    const cur = node.fields?.[idx]?.key ?? '';
    const order: Array<ErField['key']> = ['', 'PK', 'FK', 'UK'];
    const next = order[(order.indexOf(cur) + 1) % order.length];
    updateField(idx, { key: next });
  };

  return (
    <aside className="absolute top-0 right-0 bottom-0 w-72 sm:w-80 border-l bg-[var(--dd-bg-panel)]/95 backdrop-blur-xl border-[var(--dd-border-subtle)] shadow-[-20px_0_50px_rgba(0,0,0,0.55)] flex flex-col z-40 text-xs overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--dd-border-subtle)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${edge ? 'bg-sky-400' : 'bg-violet-400'}`} />
          <span className="font-semibold">{edge ? '连线契约与路由' : '实体详情与推演契约'}</span>
        </div>
        <button
          type="button"
          onClick={closeInspector}
          title="收起详情抽屉 (Esc)"
          className="p-1 rounded-lg text-[var(--dd-text-secondary)] hover:bg-white/[0.08]"
        >
          <PanelRightClose className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
        {node && (
          <>
            <div className="p-3 rounded-xl bg-white/[0.03] border border-[var(--dd-border-subtle)] space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-mono text-[var(--dd-text-muted)]">
                <span>DSL ID: {node.dslId || node.id}</span>
                <span>
                  X:{node.x} Y:{node.y}
                </span>
              </div>
              <div className="text-sm font-semibold truncate">{node.title}</div>
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] text-[var(--dd-text-secondary)]">实体名称</label>
              <input
                type="text"
                value={node.title}
                onChange={(e) => updateNode(node.id, { title: e.target.value })}
                className="w-full h-8 px-2.5 rounded-lg bg-black/20 border border-[var(--dd-border-subtle)] focus:border-violet-400 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="block text-[11px] text-[var(--dd-text-secondary)]">层级 / 类型标签</label>
                <input
                  type="text"
                  value={node.tag}
                  onChange={(e) => updateNode(node.id, { tag: e.target.value })}
                  className="w-full h-8 px-2.5 rounded-lg bg-black/20 border border-[var(--dd-border-subtle)] focus:border-violet-400 focus:outline-none font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] text-[var(--dd-text-secondary)]">技术栈 (Tech)</label>
                <input
                  type="text"
                  value={node.tech ?? ''}
                  onChange={(e) => updateNode(node.id, { tech: e.target.value || undefined })}
                  placeholder="Go / gRPC"
                  className="w-full h-8 px-2.5 rounded-lg bg-black/20 border border-[var(--dd-border-subtle)] focus:border-violet-400 focus:outline-none font-mono"
                />
              </div>
            </div>

            {!isAnnotation && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10.5px] text-[var(--dd-text-muted)]">
                  <span>快捷技术栈徽章（支持多选组合）</span>
                  {node.tech && (
                    <button
                      type="button"
                      onClick={() => updateNode(node.id, { tech: undefined })}
                      className="text-[10px] text-zinc-500 hover:text-zinc-300"
                    >
                      清空
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto pr-0.5">
                  {TECH_BADGES.map((badge) => {
                    const activeBadge = (node.tech ?? '')
                      .toLowerCase()
                      .split(/[\/,+·|]+/)
                      .map((s) => s.trim())
                      .includes(badge.label.toLowerCase());
                    return (
                      <button
                        key={badge.id}
                        type="button"
                        onClick={() => toggleTechBadge(badge.label)}
                        title={`点击切换 ${badge.label}`}
                        style={
                          activeBadge
                            ? {
                                color: badge.hex,
                                backgroundColor: badge.svgBg,
                                borderColor: `${badge.hex}88`,
                              }
                            : undefined
                        }
                        className={`px-1.5 py-0.5 rounded border text-[10px] font-mono transition-colors ${
                          activeBadge
                            ? 'font-semibold'
                            : 'bg-white/[0.03] border-[var(--dd-border-subtle)] text-zinc-400 hover:text-zinc-200 hover:border-white/20'
                        }`}
                      >
                        {badge.short}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {!isAnnotation && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="block text-[11px] text-[var(--dd-text-secondary)]">演进状态</label>
                    <select
                      value={node.status ?? ''}
                      onChange={(e) =>
                        updateNode(node.id, {
                          status: (e.target.value || undefined) as EntityStatus | undefined,
                        })
                      }
                      className="w-full h-8 px-2 rounded-lg bg-black/20 border border-[var(--dd-border-subtle)] focus:border-violet-400 focus:outline-none"
                    >
                      <option value="">默认</option>
                      <option value="active">已上线 (active)</option>
                      <option value="planned">规划中 (planned)</option>
                      <option value="deprecated">将下线 (deprecated)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] text-[var(--dd-text-secondary)]">负责人 / 团队</label>
                    <input
                      type="text"
                      value={node.owner ?? ''}
                      onChange={(e) => updateNode(node.id, { owner: e.target.value || undefined })}
                      placeholder="@core-team"
                      className="w-full h-8 px-2.5 rounded-lg bg-black/20 border border-[var(--dd-border-subtle)] focus:border-violet-400 focus:outline-none font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] text-[var(--dd-text-secondary)]">一句话摘要 (Summary)</label>
                  <input
                    type="text"
                    value={node.summary ?? ''}
                    onChange={(e) => updateNode(node.id, { summary: e.target.value || undefined })}
                    placeholder="用于 ADR 文档清单展示的核心职责概括"
                    className="w-full h-8 px-2.5 rounded-lg bg-black/20 border border-[var(--dd-border-subtle)] focus:border-violet-400 focus:outline-none"
                  />
                </div>
              </>
            )}

            {/* Reasoning Annotation: Linked Entity */}
            {isAnnotation && (
              <div className="space-y-1">
                <label className="block text-[11px] text-[var(--dd-text-secondary)]">
                  关联实体（自动布局时紧跟其下方）
                </label>
                <select
                  value={node.linkNodeId ?? ''}
                  onChange={(e) => updateNode(node.id, { linkNodeId: e.target.value || null })}
                  className="w-full h-8 px-2.5 rounded-lg bg-black/20 border border-[var(--dd-border-subtle)] focus:border-amber-400 focus:outline-none"
                >
                  <option value="">未关联</option>
                  {active.slot.nodes
                    .filter((n) => n.id !== node.id && !getAnnotationKind(n))
                    .map((target) => (
                      <option key={target.id} value={target.id}>
                        {target.title}
                      </option>
                    ))}
                </select>
              </div>
            )}

            {/* Cross-layer Read-only Ref Source Banner */}
            {node.ref && (
              <div className="p-2.5 rounded-xl bg-violet-500/10 border border-violet-400/30 space-y-2">
                <div className="flex items-center justify-between text-[10px] font-mono text-violet-300">
                  <span className="inline-flex items-center gap-1 uppercase">
                    <Link2 className="w-3 h-3" />
                    跨层只读引用锚点
                  </span>
                  <span>
                    {project.layers.find((l) => l.id === node.ref?.layerId)?.name || node.ref.layerId}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => drillToNodeTarget(node)}
                  className="w-full py-1.5 px-2.5 rounded-lg bg-violet-600/80 hover:bg-violet-500 text-white text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>跳转到源实体所在层</span>
                </button>
              </div>
            )}

            {/* Cross-layer Drill-down Target (supports both layers and nested sub-canvases) */}
            {!isAnnotation && !node.ref && project.layers.length > 0 && (
              <div className="space-y-1">
                <label className="block text-[11px] text-[var(--dd-text-secondary)]">
                  双击下钻目标视图
                </label>
                <select
                  value={
                    node.drillTarget?.layerId
                      ? node.drillTarget.subCanvasId
                        ? `${node.drillTarget.layerId}::${node.drillTarget.subCanvasId}`
                        : node.drillTarget.layerId
                      : ''
                  }
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (!raw) {
                      updateNode(node.id, { drillTarget: undefined });
                      return;
                    }
                    const [layerId, subCanvasId] = raw.split('::');
                    updateNode(node.id, {
                      drillTarget: subCanvasId ? { layerId, subCanvasId } : { layerId },
                    });
                  }}
                  className="w-full h-8 px-2.5 rounded-lg bg-black/20 border border-[var(--dd-border-subtle)] focus:border-violet-400 focus:outline-none"
                >
                  <option value="">无下钻绑定</option>
                  {project.layers.flatMap((l) => {
                    if (l.children && l.children.length > 0) {
                      return l.children
                        .filter((sub) => !(l.id === active.layer.id && sub.id === active.slot.id))
                        .map((sub) => (
                          <option key={`${l.id}::${sub.id}`} value={`${l.id}::${sub.id}`}>
                            {l.name} / {sub.name}
                          </option>
                        ));
                    }
                    if (l.id === active.layer.id) return [];
                    return [
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>,
                    ];
                  })}
                </select>
              </div>
            )}

            {/* ER / Redis Fields Editor */}
            {isCollapsible && (
              <div className="space-y-2 pt-1 border-t border-[var(--dd-border-subtle)]">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-[var(--dd-text-secondary)]">
                    {isKv ? 'Redis 键字段与过期策略' : '数据表字段 Schema'}
                  </label>
                  <button
                    type="button"
                    onClick={addField}
                    className="inline-flex items-center gap-0.5 text-[11px] text-violet-400 hover:text-violet-300"
                  >
                    <Plus className="w-3 h-3" />
                    <span>新增</span>
                  </button>
                </div>

                {isKv && (
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={node.kv?.ttl ?? ''}
                      onChange={(e) => updateNode(node.id, { kv: { ...node.kv, ttl: e.target.value } })}
                      placeholder="TTL (7d / 3600s)"
                      className="h-7 px-2 rounded bg-black/20 border border-[var(--dd-border-subtle)] font-mono text-[11px]"
                    />
                    <input
                      type="text"
                      value={node.kv?.policy ?? ''}
                      onChange={(e) => updateNode(node.id, { kv: { ...node.kv, policy: e.target.value } })}
                      placeholder="allkeys-lru"
                      className="h-7 px-2 rounded bg-black/20 border border-[var(--dd-border-subtle)] font-mono text-[11px]"
                    />
                  </div>
                )}

                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                  {(node.fields ?? []).map((f, idx) => (
                    <div key={idx} className="flex items-center gap-1">
                      {!isKv && (
                        <button
                          type="button"
                          onClick={() => cycleFieldKey(idx)}
                          title="点击切换键约束：无 / PK / FK / UK"
                          className={`w-7 h-7 rounded border font-mono text-[9.5px] font-bold shrink-0 transition-colors ${
                            f.key === 'PK'
                              ? 'bg-amber-500/20 border-amber-400/40 text-amber-300'
                              : f.key === 'FK'
                                ? 'bg-sky-500/20 border-sky-400/40 text-sky-300'
                                : f.key === 'UK'
                                  ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                                  : 'bg-black/20 border-[var(--dd-border-subtle)] text-zinc-500 hover:text-zinc-300'
                          }`}
                        >
                          {f.key || '—'}
                        </button>
                      )}
                      <input
                        value={f.name}
                        onChange={(e) => updateField(idx, { name: e.target.value })}
                        className="flex-1 min-w-0 h-7 px-1.5 rounded bg-black/20 border border-[var(--dd-border-subtle)] font-mono text-[10.5px]"
                      />
                      <input
                        value={f.type}
                        onChange={(e) => updateField(idx, { type: e.target.value })}
                        className="w-20 h-7 px-1.5 rounded bg-black/20 border border-[var(--dd-border-subtle)] font-mono text-[10.5px]"
                      />
                      <button
                        type="button"
                        onClick={() => removeField(idx)}
                        className="p-1 rounded text-zinc-500 hover:text-rose-400"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-[11px] text-[var(--dd-text-secondary)]">推演备注 / 契约说明</label>
              <textarea
                rows={3}
                value={node.note}
                onChange={(e) => updateNode(node.id, { note: e.target.value })}
                className="w-full p-2.5 rounded-lg bg-black/20 border border-[var(--dd-border-subtle)] focus:border-violet-400 focus:outline-none resize-none"
              />
            </div>

            {!isAnnotation && (
              <div className="space-y-1.5 pt-1 border-t border-[var(--dd-border-subtle)]">
                <label className="block text-[11px] text-[var(--dd-text-secondary)]">
                  关联文档与仓库链接 (同步到 .arch)
                </label>
                {(
                  [
                    { key: 'repo', label: 'Repo', placeholder: 'https://github.com/...' },
                    { key: 'docs', label: 'Docs', placeholder: '设计文档 / Wiki URL' },
                    { key: 'adr', label: 'ADR', placeholder: 'ADR-001 或链接' },
                    { key: 'dashboard', label: 'Dash', placeholder: 'Grafana / 监控面板 URL' },
                  ] as Array<{ key: keyof NodeLinks; label: string; placeholder: string }>
                ).map((item) => {
                  const val = node.links?.[item.key] ?? '';
                  return (
                    <div key={item.key} className="flex items-center gap-1.5">
                      <span className="w-10 text-[10px] font-mono text-[var(--dd-text-muted)] shrink-0">
                        {item.label}
                      </span>
                      <input
                        type="text"
                        value={val}
                        onChange={(e) => {
                          const nextVal = e.target.value.trim();
                          const nextLinks: NodeLinks = { ...(node.links ?? {}) };
                          if (nextVal) nextLinks[item.key] = nextVal;
                          else delete nextLinks[item.key];
                          updateNode(node.id, {
                            links: Object.keys(nextLinks).length > 0 ? nextLinks : undefined,
                          });
                        }}
                        placeholder={item.placeholder}
                        className="flex-1 min-w-0 h-7 px-2 rounded bg-black/20 border border-[var(--dd-border-subtle)] focus:border-violet-400 focus:outline-none font-mono text-[10.5px]"
                      />
                      {/^https?:\/\//i.test(val) && (
                        <a
                          href={val}
                          target="_blank"
                          rel="noreferrer"
                          title="打开链接"
                          className="p-1 rounded text-violet-400 hover:bg-white/[0.08] shrink-0"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="pt-2 border-t border-[var(--dd-border-subtle)] flex items-center gap-2">
              <button
                type="button"
                onClick={() => duplicateNode(node.id)}
                className="flex-1 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-[var(--dd-border-subtle)] text-[11px]"
              >
                复制副本
              </button>
              <button
                type="button"
                onClick={() => deleteNode(node.id)}
                className="flex-1 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-[11px] text-rose-400"
              >
                删除实体
              </button>
            </div>
          </>
        )}

        {edge && (
          <>
            {(edge.fromField || edge.toField) && (
              <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-400/30 space-y-1">
                <div className="text-[10px] font-mono text-sky-300 uppercase">字段级关联端口</div>
                <div className="text-[11px] font-mono text-white truncate">
                  {(active.slot.nodes.find((n) => n.id === edge.from)?.title || edge.from)}
                  {edge.fromField ? `.${edge.fromField}` : ''} →{' '}
                  {(active.slot.nodes.find((n) => n.id === edge.to)?.title || edge.to)}
                  {edge.toField ? `.${edge.toField}` : ''}
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-[11px] text-[var(--dd-text-secondary)]">关系 / 动作标签</label>
              <input
                type="text"
                value={edge.label}
                onChange={(e) => updateEdge(edge.id, { label: e.target.value })}
                className="w-full h-8 px-2.5 rounded-lg bg-black/20 border border-[var(--dd-border-subtle)] focus:border-sky-400 focus:outline-none font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] text-[var(--dd-text-secondary)]">通信协议 (Protocol)</label>
              <input
                type="text"
                value={edge.protocol ?? ''}
                onChange={(e) => updateEdge(edge.id, { protocol: e.target.value })}
                placeholder="HTTPS / gRPC / Kafka / SQL"
                className="w-full h-8 px-2.5 rounded-lg bg-black/20 border border-[var(--dd-border-subtle)] focus:border-sky-400 focus:outline-none font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] text-[var(--dd-text-secondary)]">
                ER 关系基数 (Cardinality · 同步到 .arch)
              </label>
              <div className="grid grid-cols-5 gap-1">
                {(['', '1:1', '1:N', 'N:1', 'N:M'] as Array<'' | EdgeCardinality>).map((card) => {
                  const activeCard = (edge.cardinality ?? '') === card;
                  return (
                    <button
                      key={card || 'none'}
                      type="button"
                      onClick={() => updateEdge(edge.id, { cardinality: card || undefined })}
                      className={`py-1.5 rounded-lg border font-mono text-[10.5px] transition-colors ${
                        activeCard
                          ? 'bg-sky-500/20 border-sky-400/50 text-sky-300 font-semibold'
                          : 'bg-white/[0.04] border-[var(--dd-border-subtle)] text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {card || '无'}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] text-[var(--dd-text-secondary)]">同步 / 异步语义</label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => updateEdge(edge.id, { dashed: false })}
                  className={`py-1.5 rounded-lg border text-[11px] ${
                    !edge.dashed
                      ? 'bg-violet-500/20 border-violet-400/50 text-violet-300'
                      : 'bg-white/[0.04] border-[var(--dd-border-subtle)]'
                  }`}
                >
                  实线同步 (-&gt;)
                </button>
                <button
                  type="button"
                  onClick={() => updateEdge(edge.id, { dashed: true })}
                  className={`py-1.5 rounded-lg border text-[11px] ${
                    edge.dashed
                      ? 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                      : 'bg-white/[0.04] border-[var(--dd-border-subtle)]'
                  }`}
                >
                  虚线异步 (~&gt;)
                </button>
              </div>
            </div>

            <div className="space-y-2 pt-1 border-t border-[var(--dd-border-subtle)]">
              <label className="block text-[11px] text-[var(--dd-text-secondary)]">
                韧性契约 (Resilience · 同步到 .arch)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <span className="block text-[10px] font-mono text-[var(--dd-text-muted)]">超时 Timeout</span>
                  <input
                    type="text"
                    value={edge.resilience?.timeout ?? ''}
                    onChange={(e) => {
                      const val = e.target.value.trim();
                      const nextRes = { ...(edge.resilience ?? {}), timeout: val || undefined };
                      const hasAny = Boolean(
                        nextRes.timeout || typeof nextRes.retry === 'number' || nextRes.circuitBreaker
                      );
                      updateEdge(edge.id, { resilience: hasAny ? nextRes : undefined });
                    }}
                    placeholder="3s / 500ms"
                    className="w-full h-7 px-2 rounded bg-black/20 border border-[var(--dd-border-subtle)] focus:border-sky-400 focus:outline-none font-mono text-[11px]"
                  />
                </div>
                <div className="space-y-1">
                  <span className="block text-[10px] font-mono text-[var(--dd-text-muted)]">重试 Retry</span>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={edge.resilience?.retry ?? ''}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const num = raw === '' ? undefined : Math.max(0, Number(raw));
                      const nextRes = { ...(edge.resilience ?? {}), retry: num };
                      const hasAny = Boolean(
                        nextRes.timeout || typeof nextRes.retry === 'number' || nextRes.circuitBreaker
                      );
                      updateEdge(edge.id, { resilience: hasAny ? nextRes : undefined });
                    }}
                    placeholder="3"
                    className="w-full h-7 px-2 rounded bg-black/20 border border-[var(--dd-border-subtle)] focus:border-sky-400 focus:outline-none font-mono text-[11px]"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const nextCb = !edge.resilience?.circuitBreaker;
                  const nextRes = { ...(edge.resilience ?? {}), circuitBreaker: nextCb || undefined };
                  const hasAny = Boolean(
                    nextRes.timeout || typeof nextRes.retry === 'number' || nextRes.circuitBreaker
                  );
                  updateEdge(edge.id, { resilience: hasAny ? nextRes : undefined });
                }}
                className={`w-full py-1.5 px-2.5 rounded-lg border text-[11px] flex items-center justify-between transition-colors ${
                  edge.resilience?.circuitBreaker
                    ? 'bg-emerald-500/18 border-emerald-400/45 text-emerald-300'
                    : 'bg-white/[0.04] border-[var(--dd-border-subtle)] text-[var(--dd-text-secondary)]'
                }`}
              >
                <span>熔断保护 (Circuit Breaker)</span>
                <span className="font-mono text-[10px]">
                  {edge.resilience?.circuitBreaker ? '已启用' : '未启用'}
                </span>
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] text-[var(--dd-text-secondary)]">连线路由模式</label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => updateEdge(edge.id, { routing: 'bezier', waypoints: undefined })}
                  className={`py-1.5 rounded-lg border text-[11px] ${
                    edge.routing !== 'orthogonal'
                      ? 'bg-sky-500/20 border-sky-400/50 text-sky-300'
                      : 'bg-white/[0.04] border-[var(--dd-border-subtle)]'
                  }`}
                >
                  贝塞尔曲线
                </button>
                <button
                  type="button"
                  onClick={() => updateEdge(edge.id, { routing: 'orthogonal' })}
                  className={`py-1.5 rounded-lg border text-[11px] ${
                    edge.routing === 'orthogonal'
                      ? 'bg-sky-500/20 border-sky-400/50 text-sky-300'
                      : 'bg-white/[0.04] border-[var(--dd-border-subtle)]'
                  }`}
                >
                  正交折线
                </button>
              </div>
              {edge.routing === 'orthogonal' && edge.waypoints && edge.waypoints.length > 0 && (
                <button
                  type="button"
                  onClick={() => updateEdgeWaypoints(edge.id, undefined)}
                  className="w-full py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-[var(--dd-border-subtle)] text-[11px] text-[var(--dd-text-secondary)]"
                >
                  重置手调 / ELK 折线拐点 ({edge.waypoints.length})
                </button>
              )}
            </div>

            <div className="pt-2 border-t border-[var(--dd-border-subtle)] flex items-center gap-2">
              <button
                type="button"
                onClick={() => reverseEdge(edge.id)}
                className="flex-1 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-[var(--dd-border-subtle)] text-[11px]"
              >
                反转方向
              </button>
              <button
                type="button"
                onClick={() => deleteEdge(edge.id)}
                className="flex-1 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-[11px] text-rose-400"
              >
                删除连线
              </button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
};
