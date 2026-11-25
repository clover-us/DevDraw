import React, { useMemo, useState } from 'react';
import { Box, Palette, RotateCcw, Sparkles, X } from 'lucide-react';
import {
  ALL_PRIMITIVES,
  findPrimitiveByKind,
  type EntityVisualStyle,
  type SemanticColor,
} from '@devdraw/core';
import { ENTITY_ICON_MAP } from '@devdraw/canvas';
import { getActiveSlotFromProject, useWorkbenchStore } from '../store/useWorkbenchStore';

const COLOR_OPTIONS: Array<{
  key: SemanticColor;
  label: string;
  dot: string;
  border: string;
  bar: string;
  iconBox: string;
  iconOutline: string;
  iconPlain: string;
}> = [
  { key: 'violet', label: '电光紫', dot: 'bg-violet-400', border: 'border-violet-400/50', bar: 'bg-violet-400', iconBox: 'bg-violet-500/15 text-violet-300 border-violet-400/25', iconOutline: 'bg-transparent text-violet-300 border-violet-400/55', iconPlain: 'text-violet-400' },
  { key: 'sky', label: '冰川青', dot: 'bg-sky-400', border: 'border-sky-400/50', bar: 'bg-sky-400', iconBox: 'bg-sky-500/15 text-sky-300 border-sky-400/25', iconOutline: 'bg-transparent text-sky-300 border-sky-400/55', iconPlain: 'text-sky-400' },
  { key: 'emerald', label: '薄荷绿', dot: 'bg-emerald-400', border: 'border-emerald-400/50', bar: 'bg-emerald-400', iconBox: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/25', iconOutline: 'bg-transparent text-emerald-300 border-emerald-400/55', iconPlain: 'text-emerald-400' },
  { key: 'amber', label: '琥珀金', dot: 'bg-amber-400', border: 'border-amber-400/50', bar: 'bg-amber-400', iconBox: 'bg-amber-500/15 text-amber-300 border-amber-400/25', iconOutline: 'bg-transparent text-amber-300 border-amber-400/55', iconPlain: 'text-amber-400' },
  { key: 'rose', label: '警告红', dot: 'bg-rose-400', border: 'border-rose-400/50', bar: 'bg-rose-400', iconBox: 'bg-rose-500/15 text-rose-300 border-rose-400/25', iconOutline: 'bg-transparent text-rose-300 border-rose-400/55', iconPlain: 'text-rose-400' },
  { key: 'slate', label: '中性灰', dot: 'bg-zinc-400', border: 'border-zinc-400/50', bar: 'bg-zinc-400', iconBox: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/25', iconOutline: 'bg-transparent text-zinc-300 border-zinc-500/55', iconPlain: 'text-zinc-400' },
];

const BORDER_OPTIONS: Array<{ key: NonNullable<EntityVisualStyle['borderStyle']>; label: string }> = [
  { key: 'solid', label: '实线边框' },
  { key: 'dashed', label: '虚线边框' },
  { key: 'none', label: '极简无框' },
];

const RADIUS_OPTIONS: Array<{ key: NonNullable<EntityVisualStyle['radius']>; label: string; cls: string }> = [
  { key: 'md', label: '紧凑方角', cls: 'rounded-lg' },
  { key: 'xl', label: '标准圆角', cls: 'rounded-xl' },
  { key: '2xl', label: '柔和圆角', cls: 'rounded-2xl' },
];

const ACCENT_OPTIONS: Array<{ key: NonNullable<EntityVisualStyle['accentBar']>; label: string }> = [
  { key: 'none', label: '无色条' },
  { key: 'left', label: '左侧色条' },
  { key: 'top', label: '顶部色条' },
];

const ICON_STYLE_OPTIONS: Array<{ key: NonNullable<EntityVisualStyle['iconStyle']>; label: string }> = [
  { key: 'filled', label: '柔和底框' },
  { key: 'outline', label: '线框轮廓' },
  { key: 'plain', label: '纯图标' },
  { key: 'hidden', label: '隐藏图标' },
];

const ICON_CHOICES: Array<{ key: string; label: string }> = [
  { key: 'hexagon', label: '微服务' },
  { key: 'log-in', label: '网关入口' },
  { key: 'database', label: '数据库' },
  { key: 'zap', label: '缓存' },
  { key: 'layers', label: '消息队列' },
  { key: 'server-cog', label: 'K8s 集群' },
  { key: 'cloud', label: '外部云' },
  { key: 'globe', label: '边缘/CDN' },
  { key: 'cpu', label: '计算算子' },
  { key: 'cog', label: '后台任务' },
  { key: 'key-round', label: '鉴权中心' },
  { key: 'smartphone', label: '端侧/BFF' },
  { key: 'table-2', label: '数据表' },
  { key: 'hard-drive', label: '存储实例' },
  { key: 'archive', label: '对象存储' },
  { key: 'git-fork', label: '分支/并行' },
  { key: 'boxes', label: '领域边界' },
  { key: 'crown', label: '聚合根' },
  { key: 'bell-ring', label: '领域事件' },
  { key: 'rocket', label: 'CI/CD' },
  { key: 'radar', label: '可观测性' },
  { key: 'sparkles', label: 'AI 推理' },
  { key: 'lightbulb', label: '推演假设' },
  { key: 'shield-check', label: '决策记录' },
];

export const StyleCustomizerModal: React.FC = () => {
  const {
    projects,
    activeProjectId,
    activeLayerIndex,
    styleModalOpen,
    styleTargetNodeId,
    closeStyleModal,
    updateNodeStyle,
    resetNodeStyle,
    updateKindStyle,
    resetKindStyle,
    applyStyleToKind,
  } = useWorkbenchStore();

  const project = projects.find((p) => p.id === activeProjectId);
  const active = getActiveSlotFromProject(project, activeLayerIndex);

  const targetNode =
    styleTargetNodeId && active
      ? active.slot.nodes.find((n) => n.id === styleTargetNodeId) ?? null
      : null;

  const [scope, setScope] = useState<'entity' | 'kind'>(targetNode ? 'entity' : 'kind');
  const [selectedKind, setSelectedKind] = useState<string>(targetNode?.kind || 'service');

  React.useEffect(() => {
    if (!styleModalOpen) return;
    if (targetNode) {
      setScope('entity');
      setSelectedKind(targetNode.kind);
    } else {
      setScope('kind');
    }
  }, [styleModalOpen, targetNode?.id, targetNode?.kind]);

  const kindChoices = useMemo(() => {
    const map = new Map<string, string>();
    active?.slot.nodes.forEach((n) => {
      if (!map.has(n.kind)) {
        const prim = findPrimitiveByKind(n.kind);
        map.set(n.kind, prim?.label || n.tag || n.kind);
      }
    });
    ALL_PRIMITIVES.forEach((p) => {
      if (!map.has(p.kind)) map.set(p.kind, p.label);
    });
    return Array.from(map.entries());
  }, [active]);

  if (!styleModalOpen || !project || !active) return null;

  const effectiveScope = targetNode ? scope : 'kind';
  const kindPreset = project.kindStyles?.[selectedKind] ?? {};
  const primDefault = findPrimitiveByKind(selectedKind);

  const currentStyle: Required<EntityVisualStyle> =
    effectiveScope === 'entity' && targetNode
      ? {
          color:
            targetNode.customStyle?.color ??
            project.kindStyles?.[targetNode.kind]?.color ??
            targetNode.color ??
            'sky',
          borderStyle:
            targetNode.customStyle?.borderStyle ??
            project.kindStyles?.[targetNode.kind]?.borderStyle ??
            'solid',
          radius:
            targetNode.customStyle?.radius ??
            project.kindStyles?.[targetNode.kind]?.radius ??
            '2xl',
          accentBar:
            targetNode.customStyle?.accentBar ??
            project.kindStyles?.[targetNode.kind]?.accentBar ??
            'none',
          icon:
            targetNode.customStyle?.icon ??
            project.kindStyles?.[targetNode.kind]?.icon ??
            targetNode.icon ??
            findPrimitiveByKind(targetNode.kind)?.icon ??
            'hexagon',
          iconStyle:
            targetNode.customStyle?.iconStyle ??
            project.kindStyles?.[targetNode.kind]?.iconStyle ??
            'filled',
        }
      : {
          color: kindPreset.color ?? primDefault?.defaultColor ?? 'sky',
          borderStyle: kindPreset.borderStyle ?? 'solid',
          radius: kindPreset.radius ?? '2xl',
          accentBar: kindPreset.accentBar ?? 'none',
          icon: kindPreset.icon ?? primDefault?.icon ?? 'hexagon',
          iconStyle: kindPreset.iconStyle ?? 'filled',
        };

  const patchStyle = (patch: Partial<EntityVisualStyle>) => {
    if (effectiveScope === 'entity' && targetNode) {
      updateNodeStyle(targetNode.id, patch);
    } else {
      updateKindStyle(selectedKind, patch);
    }
  };

  const colorMeta = COLOR_OPTIONS.find((c) => c.key === currentStyle.color) ?? COLOR_OPTIONS[1];
  const radiusCls = RADIUS_OPTIONS.find((r) => r.key === currentStyle.radius)?.cls ?? 'rounded-2xl';
  const borderCls =
    currentStyle.borderStyle === 'none'
      ? 'border-transparent'
      : currentStyle.borderStyle === 'dashed'
        ? `border-dashed ${colorMeta.border}`
        : `border-solid ${colorMeta.border}`;

  const PreviewIcon = ENTITY_ICON_MAP[currentStyle.icon] || Box;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={closeStyleModal}
    >
      <div
        className="w-full max-w-xl max-h-[90vh] rounded-2xl bg-[#1b1624] border border-white/10 text-zinc-100 shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-fuchsia-500/15 border border-fuchsia-400/30 flex items-center justify-center text-fuchsia-300">
              <Palette className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">自定义实体样式</h3>
              <p className="text-[11px] text-zinc-400">
                外观与图标独立定制，不影响右侧契约详情与 .arch 语义模型
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeStyleModal}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Scope Switcher */}
          {targetNode && (
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-black/25 border border-white/[0.07] text-xs">
              <button
                type="button"
                onClick={() => setScope('entity')}
                className={`py-1.5 rounded-lg font-medium transition-colors truncate px-2 ${
                  effectiveScope === 'entity'
                    ? 'bg-violet-600 text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                当前实体：{targetNode.title}
              </button>
              <button
                type="button"
                onClick={() => setScope('kind')}
                className={`py-1.5 rounded-lg font-medium transition-colors ${
                  effectiveScope === 'kind'
                    ? 'bg-violet-600 text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                按类型全局预设
              </button>
            </div>
          )}

          {effectiveScope === 'kind' && (
            <div className="space-y-1.5">
              <label className="block text-[11px] text-zinc-400">选择要统一自定义样式的实体类型</label>
              <select
                value={selectedKind}
                onChange={(e) => setSelectedKind(e.target.value)}
                className="w-full h-9 px-3 rounded-xl bg-[#110e17] border border-white/10 focus:border-violet-400 focus:outline-none text-xs text-zinc-100"
              >
                {kindChoices.map(([kind, label]) => (
                  <option key={kind} value={kind}>
                    {label} ({kind})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Live Card Preview */}
          <div className="p-4 rounded-xl bg-[#110e17] border border-white/[0.06] flex items-center justify-center">
            <div
              className={`relative w-64 border ${radiusCls} ${borderCls} bg-[#1a1524] shadow-xl overflow-hidden transition-all`}
            >
              {currentStyle.accentBar === 'top' && <div className={`h-1 w-full ${colorMeta.bar}`} />}
              {currentStyle.accentBar === 'left' && (
                <div className={`absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-full ${colorMeta.bar}`} />
              )}
              <div className="px-3.5 py-2.5 flex items-start gap-2.5">
                {currentStyle.iconStyle !== 'hidden' && (
                  <div
                    className={
                      currentStyle.iconStyle === 'plain'
                        ? `w-5 h-5 flex items-center justify-center shrink-0 mt-1 ${colorMeta.iconPlain}`
                        : currentStyle.iconStyle === 'outline'
                          ? `w-7 h-7 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${colorMeta.iconOutline}`
                          : `w-7 h-7 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${colorMeta.iconBox}`
                    }
                  >
                    <PreviewIcon className={currentStyle.iconStyle === 'plain' ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-mono text-zinc-400 mb-0.5">
                    {effectiveScope === 'entity' && targetNode ? targetNode.tag : selectedKind.toUpperCase()}
                  </div>
                  <div className="text-[13px] font-semibold text-white truncate">
                    {effectiveScope === 'entity' && targetNode
                      ? targetNode.title
                      : primDefault?.label || selectedKind}
                  </div>
                  <div className="text-[11px] text-zinc-400 mt-0.5 truncate">实体外观与图标实时预览</div>
                </div>
              </div>
            </div>
          </div>

          {/* Icon Style & Icon Picker */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] text-zinc-400">图标样式</label>
              <div className="flex items-center gap-1">
                {ICON_STYLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => patchStyle({ iconStyle: opt.key })}
                    className={`px-2 py-1 rounded-md border text-[10.5px] transition-colors ${
                      currentStyle.iconStyle === opt.key
                        ? 'bg-violet-500/20 border-violet-400/50 text-violet-200'
                        : 'bg-white/[0.03] border-white/[0.08] text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {currentStyle.iconStyle !== 'hidden' && (
              <div className="grid grid-cols-8 gap-1.5 p-2 rounded-xl bg-[#110e17] border border-white/[0.06]">
                {ICON_CHOICES.map((ic) => {
                  const IconComp = ENTITY_ICON_MAP[ic.key] || Box;
                  const activeIcon = currentStyle.icon === ic.key;
                  return (
                    <button
                      key={ic.key}
                      type="button"
                      title={`${ic.label} (${ic.key})`}
                      onClick={() => patchStyle({ icon: ic.key })}
                      className={`h-8 rounded-lg border flex items-center justify-center transition-all ${
                        activeIcon
                          ? `${colorMeta.border} bg-violet-500/20 text-white`
                          : 'border-transparent bg-white/[0.03] text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.08]'
                      }`}
                    >
                      <IconComp className="w-3.5 h-3.5" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Color Swatches */}
          <div className="space-y-1.5">
            <label className="block text-[11px] text-zinc-400">语义主题色</label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => patchStyle({ color: c.key })}
                  className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg border text-[11px] transition-all ${
                    currentStyle.color === c.key
                      ? `${c.border} bg-white/[0.09] text-white`
                      : 'border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                  <span>{c.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Border Style */}
          <div className="space-y-1.5">
            <label className="block text-[11px] text-zinc-400">边框样式</label>
            <div className="grid grid-cols-3 gap-1.5">
              {BORDER_OPTIONS.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => patchStyle({ borderStyle: b.key })}
                  className={`py-1.5 rounded-lg border text-[11px] transition-colors ${
                    currentStyle.borderStyle === b.key
                      ? 'bg-violet-500/20 border-violet-400/50 text-violet-200'
                      : 'bg-white/[0.03] border-white/[0.08] text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          {/* Radius & Accent Bar */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-[11px] text-zinc-400">卡片圆角</label>
              <div className="grid grid-cols-3 gap-1">
                {RADIUS_OPTIONS.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => patchStyle({ radius: r.key })}
                    className={`py-1.5 rounded-lg border text-[10.5px] transition-colors ${
                      currentStyle.radius === r.key
                        ? 'bg-violet-500/20 border-violet-400/50 text-violet-200'
                        : 'bg-white/[0.03] border-white/[0.08] text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] text-zinc-400">强调色条</label>
              <div className="grid grid-cols-3 gap-1">
                {ACCENT_OPTIONS.map((a) => (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => patchStyle({ accentBar: a.key })}
                    className={`py-1.5 rounded-lg border text-[10.5px] transition-colors ${
                      currentStyle.accentBar === a.key
                        ? 'bg-violet-500/20 border-violet-400/50 text-violet-200'
                        : 'bg-white/[0.03] border-white/[0.08] text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-[#15111d] border-t border-white/[0.06] flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              if (effectiveScope === 'entity' && targetNode) resetNodeStyle(targetNode.id);
              else resetKindStyle(selectedKind);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs text-zinc-300"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>恢复默认样式</span>
          </button>

          <div className="flex items-center gap-2">
            {effectiveScope === 'entity' && targetNode && (
              <button
                type="button"
                onClick={() => applyStyleToKind(targetNode.kind, currentStyle)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-fuchsia-500/15 hover:bg-fuchsia-500/25 border border-fuchsia-400/35 text-xs text-fuchsia-200"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>应用到同类型全部实体</span>
              </button>
            )}
            <button
              type="button"
              onClick={closeStyleModal}
              className="px-4 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium"
            >
              完成
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
