import type {
  CanvasSlot,
  EntityNode,
  EntityVisualStyle,
  PortSide,
  RelationEdge,
  SemanticColor,
} from '../types';
import { getAnnotationKind, isCollapsibleEntity, isGroupEntity } from '../primitives';

function sanitizeMermaidText(value: string): string {
  return String(value || '')
    .replace(/"/g, "'")
    .replace(/[<>]/g, '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeXml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isErNode(node: EntityNode): boolean {
  return node.kind === 'db' || node.kind === 'dep_rds' || node.kind.startsWith('er_');
}

function detectMermaidDialect(nodes: EntityNode[]): 'er' | 'class' | 'flowchart' {
  const entities = nodes.filter((n) => !getAnnotationKind(n) && n.kind !== 'store_ref');
  if (entities.length === 0) return 'flowchart';
  if (entities.every(isErNode)) return 'er';
  if (entities.every((n) => n.kind.startsWith('ddd_'))) return 'class';
  return 'flowchart';
}

function buildMermaidIdentifiers(nodes: EntityNode[]): Record<string, string> {
  const used = new Set<string>();
  const map: Record<string, string> = {};
  nodes.forEach((n, idx) => {
    const raw = (n.dslId || n.title || '')
      .replace(/[^A-Za-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
    const base = /^[A-Za-z_]/.test(raw) ? raw : `E${idx + 1}${raw ? '_' + raw : ''}`;
    let ident = base;
    let dup = 2;
    while (used.has(ident)) ident = `${base}_${dup++}`;
    used.add(ident);
    map[n.id] = ident;
  });
  return map;
}

/**
 * Smart Mermaid exporter: auto-selects erDiagram / classDiagram / flowchart LR
 * based on active canvas semantics.
 */
export function exportSlotToMermaid(slot: CanvasSlot): string {
  const { nodes, edges, name } = slot;
  const dialect = detectMermaidDialect(nodes);
  const idents = buildMermaidIdentifiers(nodes);
  const header = `%% DevDraw · ${name} (${nodes.length} 实体 / ${edges.length} 连线 · ${dialect})`;

  if (dialect === 'er') {
    const lines = [header, 'erDiagram'];
    for (const n of nodes) {
      lines.push(`  ${idents[n.id]} {`);
      for (const f of n.fields ?? []) {
        const type = f.type.replace(/[^A-Za-z0-9_()[\]]/g, '_') || 'string';
        const col = f.name.replace(/[^A-Za-z0-9_]/g, '_') || 'col';
        const key = f.key ? ` ${f.key}` : '';
        const note = f.note ? ` "${sanitizeMermaidText(f.note)}"` : '';
        lines.push(`    ${type} ${col}${key}${note}`);
      }
      lines.push('  }');
    }
    for (const e of edges) {
      const from = idents[e.from];
      const to = idents[e.to];
      if (!from || !to) continue;
      const hint = [e.label, e.fromField, e.toField].filter(Boolean).join(' ');
      let arrow = '||--o{';
      if (/N\s*:\s*M|N\s*:\s*N/i.test(hint)) arrow = '}o--o{';
      else if (/1\s*:\s*1/.test(hint)) arrow = '||--||';
      else if (/N\s*:\s*1/.test(hint)) arrow = '}o--||';
      if (e.dashed) arrow = arrow.replace('--', '..');
      const label = sanitizeMermaidText([e.label, e.fromField, e.toField].filter(Boolean).join(' · '));
      lines.push(`  ${from} ${arrow} ${to} : "${label}"`);
    }
    return lines.join('\n');
  }

  if (dialect === 'class') {
    const lines = [header, 'classDiagram'];
    for (const n of nodes) {
      const id = idents[n.id];
      const label = sanitizeMermaidText(n.title);
      lines.push(`  class ${id}["${label}"]`);
    }
    for (const e of edges) {
      const from = idents[e.from];
      const to = idents[e.to];
      if (!from || !to) continue;
      const arrow = e.dashed ? '..>' : '-->';
      const label = sanitizeMermaidText(e.label);
      lines.push(`  ${from} ${arrow} ${to}${label ? ` : "${label}"` : ''}`);
    }
    return lines.join('\n');
  }

  const lines = [header, 'flowchart LR', `  subgraph LAYER["${sanitizeMermaidText(name)}"]`];
  for (const n of nodes) {
    const id = idents[n.id];
    const label = sanitizeMermaidText(`${n.title}${n.tag ? ` [${n.tag}]` : ''}`);
    if (getAnnotationKind(n)) {
      lines.push(`    ${id}["${label}"]:::annotation`);
    } else if (isErNode(n)) {
      lines.push(`    ${id}[("${label}")]`);
    } else {
      lines.push(`    ${id}("${label}")`);
    }
  }
  lines.push('  end');
  for (const e of edges) {
    const from = idents[e.from];
    const to = idents[e.to];
    if (!from || !to) continue;
    const arrow = e.dashed ? '-.->' : '-->';
    const label = sanitizeMermaidText(e.label);
    lines.push(label ? `  ${from} ${arrow}|"${label}"| ${to}` : `  ${from} ${arrow} ${to}`);
  }
  lines.push('  classDef annotation stroke-dasharray: 5 5;');
  return lines.join('\n');
}

const SVG_ACCENT_MAP: Record<SemanticColor, { accent: string; badgeBg: string; border: string }> = {
  violet: { accent: '#a78bfa', badgeBg: 'rgba(139,92,246,0.16)', border: 'rgba(167,139,250,0.42)' },
  sky: { accent: '#38bdf8', badgeBg: 'rgba(56,189,248,0.16)', border: 'rgba(56,189,248,0.42)' },
  emerald: { accent: '#34d399', badgeBg: 'rgba(52,211,153,0.16)', border: 'rgba(52,211,153,0.42)' },
  amber: { accent: '#fbbf24', badgeBg: 'rgba(251,191,36,0.16)', border: 'rgba(251,191,36,0.42)' },
  rose: { accent: '#fb7185', badgeBg: 'rgba(251,113,133,0.16)', border: 'rgba(251,113,133,0.42)' },
  slate: { accent: '#94a3b8', badgeBg: 'rgba(148,163,184,0.16)', border: 'rgba(148,163,184,0.38)' },
};

interface SvgBox {
  x: number;
  y: number;
  w: number;
  h: number;
  headerH: number;
  fieldRowH: number;
  fields: NonNullable<EntityNode['fields']>;
}

function pickAutoPorts(a: SvgBox, b: SvgBox): { src: PortSide; dst: PortSide } {
  const dx = b.x + b.w / 2 - (a.x + a.w / 2);
  const dy = b.y + b.h / 2 - (a.y + a.h / 2);
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { src: 'right', dst: 'left' } : { src: 'left', dst: 'right' };
  }
  return dy >= 0 ? { src: 'bottom', dst: 'top' } : { src: 'top', dst: 'bottom' };
}

function getPortPoint(box: SvgBox, side: PortSide, fieldName?: string): { x: number; y: number } {
  if (fieldName && box.fields.length > 0) {
    const idx = box.fields.findIndex((f) => f.name === fieldName);
    if (idx >= 0) {
      const fy = box.y + box.headerH + idx * box.fieldRowH + box.fieldRowH / 2;
      return { x: side === 'left' ? box.x : box.x + box.w, y: fy };
    }
  }
  switch (side) {
    case 'top':
      return { x: box.x + box.w / 2, y: box.y };
    case 'bottom':
      return { x: box.x + box.w / 2, y: box.y + box.h };
    case 'left':
      return { x: box.x, y: box.y + box.h / 2 };
    case 'right':
    default:
      return { x: box.x + box.w, y: box.y + box.h / 2 };
  }
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(0, maxChars - 1)) + '…';
}

/**
 * High-fidelity standalone SVG exporter:
 * - Semantic color accents, customStyle / kindStyles borders & accent bars
 * - Full ER / Redis field schema rows (PK/FK/UK badges, types, TTL)
 * - Accurate port attachment sides, orthogonal waypoints, bezier curves & pill labels
 * - Freehand sketch strokes and tight world-space bounding box
 */
export function exportSlotToSvg(
  slot: CanvasSlot,
  theme: 'dark' | 'light' = 'dark',
  kindStyles?: Record<string, EntityVisualStyle>
): string {
  const { nodes, edges, freehand } = slot;
  const boxes = new Map<string, SvgBox>();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const trackPoint = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };

  for (const n of nodes) {
    const showFields = isCollapsibleEntity(n) && !n.collapsed && (n.fields?.length ?? 0) > 0;
    const fields = showFields ? n.fields!.slice(0, 12) : [];
    const headerH = n.kv?.ttl || n.tech || n.spec ? 76 : 64;
    const fieldRowH = 24;
    const w = n.w ?? (showFields ? 268 : 244);
    const computedH = showFields
      ? headerH + fields.length * fieldRowH + 12
      : n.note
        ? 98
        : 84;
    const h = n.h ?? computedH;

    boxes.set(n.id, { x: n.x, y: n.y, w, h, headerH, fieldRowH, fields });
    trackPoint(n.x, n.y);
    trackPoint(n.x + w, n.y + h);
  }

  for (const e of edges) {
    for (const wp of e.waypoints ?? []) {
      trackPoint(wp.x, wp.y);
    }
  }

  for (const stroke of freehand ?? []) {
    for (const pt of stroke.points) {
      trackPoint(pt.x, pt.y);
    }
  }

  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 640;
    maxY = 360;
  }

  const pad = 72;
  const vx = Math.round(minX - pad);
  const vy = Math.round(minY - pad);
  const vw = Math.max(360, Math.round(maxX - minX + pad * 2));
  const vh = Math.max(200, Math.round(maxY - minY + pad * 2));

  const isLight = theme === 'light';
  const bg = isLight ? '#f3f5f9' : '#110e17';
  const gridDot = isLight ? 'rgba(100,116,139,0.22)' : 'rgba(167,139,250,0.16)';
  const cardBg = isLight ? '#ffffff' : '#1b1625';
  const cardHeaderDivider = isLight ? '#e2e8f0' : 'rgba(255,255,255,0.08)';
  const titleColor = isLight ? '#0f172a' : '#f4f4f5';
  const subColor = isLight ? '#475569' : '#a1a1aa';
  const fieldTypeColor = isLight ? '#64748b' : '#94a3b8';
  const pillBg = isLight ? '#ffffff' : '#181322';
  const pillBorder = isLight ? '#cbd5e1' : 'rgba(167,139,250,0.35)';

  // 1. Freehand sketch layer
  const freehandSvg = (freehand ?? [])
    .filter((s) => s.points.length >= 2)
    .map((s) => {
      const pts = s.points.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(' ');
      return `  <polyline points="${pts}" fill="none" stroke="${escapeXml(s.color)}" stroke-width="${s.width}" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>`;
    })
    .join('\n');

  // 2. Edges layer
  const edgeLines = edges
    .map((e: RelationEdge) => {
      const a = boxes.get(e.from);
      const b = boxes.get(e.to);
      if (!a || !b) return '';

      const auto = pickAutoPorts(a, b);
      const srcSide = e.sourcePort ?? auto.src;
      const dstSide = e.targetPort ?? auto.dst;
      const p1 = getPortPoint(a, srcSide, e.fromField);
      const p2 = getPortPoint(b, dstSide, e.toField);

      let d: string;
      let labelX: number;
      let labelY: number;

      if (e.waypoints && e.waypoints.length > 0) {
        const pts = [p1, ...e.waypoints, p2];
        d = pts
          .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${Math.round(pt.x)} ${Math.round(pt.y)}`)
          .join(' ');
        const mid = pts[Math.floor(pts.length / 2)];
        const prev = pts[Math.max(0, Math.floor(pts.length / 2) - 1)];
        labelX = (mid.x + prev.x) / 2;
        labelY = (mid.y + prev.y) / 2;
      } else if (e.routing === 'orthogonal') {
        const mx = Math.round((p1.x + p2.x) / 2);
        const my = Math.round((p1.y + p2.y) / 2);
        if (srcSide === 'top' || srcSide === 'bottom') {
          d = `M ${Math.round(p1.x)} ${Math.round(p1.y)} L ${Math.round(p1.x)} ${my} L ${Math.round(p2.x)} ${my} L ${Math.round(p2.x)} ${Math.round(p2.y)}`;
          labelX = mx;
          labelY = my;
        } else {
          d = `M ${Math.round(p1.x)} ${Math.round(p1.y)} L ${mx} ${Math.round(p1.y)} L ${mx} ${Math.round(p2.y)} L ${Math.round(p2.x)} ${Math.round(p2.y)}`;
          labelX = mx;
          labelY = my;
        }
      } else {
        const offset = Math.max(48, Math.hypot(p2.x - p1.x, p2.y - p1.y) * 0.35);
        const c1 =
          srcSide === 'left'
            ? { x: p1.x - offset, y: p1.y }
            : srcSide === 'top'
              ? { x: p1.x, y: p1.y - offset }
              : srcSide === 'bottom'
                ? { x: p1.x, y: p1.y + offset }
                : { x: p1.x + offset, y: p1.y };
        const c2 =
          dstSide === 'right'
            ? { x: p2.x + offset, y: p2.y }
            : dstSide === 'top'
              ? { x: p2.x, y: p2.y - offset }
              : dstSide === 'bottom'
                ? { x: p2.x, y: p2.y + offset }
                : { x: p2.x - offset, y: p2.y };
        d = `M ${Math.round(p1.x)} ${Math.round(p1.y)} C ${Math.round(c1.x)} ${Math.round(c1.y)}, ${Math.round(c2.x)} ${Math.round(c2.y)}, ${Math.round(p2.x)} ${Math.round(p2.y)}`;
        labelX = (p1.x + p2.x) / 2;
        labelY = (p1.y + p2.y) / 2;
      }

      const strokeColor = e.dashed ? '#f59e0b' : '#8b5cf6';
      const markerId = e.dashed ? 'ddArrowAmber' : 'ddArrow';
      const dash = e.dashed ? ' stroke-dasharray="6 5"' : '';
      const labelText = [e.protocol, e.label].filter(Boolean).join(' · ');

      let labelSvg = '';
      if (labelText) {
        const pillW = Math.min(220, Math.max(46, labelText.length * 7.2 + 18));
        const rx = Math.round(labelX - pillW / 2);
        const ry = Math.round(labelY - 11);
        labelSvg = `  <g>
    <rect x="${rx}" y="${ry}" width="${Math.round(pillW)}" height="20" rx="10" fill="${pillBg}" stroke="${pillBorder}" stroke-width="1"/>
    <text x="${Math.round(labelX)}" y="${Math.round(labelY + 3)}" text-anchor="middle" fill="${isLight ? '#334155' : '#e4e4e7'}" font-size="10.5" font-family="JetBrains Mono, Consolas, monospace">${escapeXml(truncateText(labelText, 28))}</text>
  </g>`;
      }
      return `  <path d="${d}" fill="none" stroke="${strokeColor}" stroke-width="1.8"${dash} marker-end="url(#${markerId})"/>\n${labelSvg}`;
    })
    .join('\n');

  // 3. Group boundary containers (rendered behind edges & regular nodes)
  const groupCards = nodes
    .filter((n) => isGroupEntity(n))
    .map((n) => {
      const b = boxes.get(n.id)!;
      const mergedStyle: EntityVisualStyle = {
        ...(kindStyles?.[n.kind] ?? {}),
        ...(n.customStyle ?? {}),
      };
      const colorKey: SemanticColor = mergedStyle.color ?? n.color ?? 'violet';
      const tone = SVG_ACCENT_MAP[colorKey] ?? SVG_ACCENT_MAP.violet;
      return `  <g transform="translate(${Math.round(b.x)}, ${Math.round(b.y)})">
    <rect width="${b.w}" height="${b.h}" rx="18" fill="${tone.badgeBg}" fill-opacity="0.35" stroke="${tone.border}" stroke-width="1.6" stroke-dasharray="7 5"/>
    <text x="16" y="24" fill="${tone.accent}" font-size="10" font-weight="600" font-family="JetBrains Mono, monospace">${escapeXml(truncateText(n.tag, 28))}</text>
    <text x="16" y="42" fill="${titleColor}" font-size="12.5" font-weight="600" font-family="Inter, Noto Sans SC, sans-serif">${escapeXml(truncateText(n.title, 36))}</text>
  </g>`;
    })
    .join('\n');

  // 4. Nodes layer (regular entities & annotations)
  const nodeCards = nodes
    .filter((n) => !isGroupEntity(n))
    .map((n) => {
      const b = boxes.get(n.id)!;
      const isAnn = Boolean(getAnnotationKind(n));
      const mergedStyle: EntityVisualStyle = {
        ...(kindStyles?.[n.kind] ?? {}),
        ...(n.customStyle ?? {}),
      };
      const colorKey: SemanticColor = mergedStyle.color ?? n.color ?? 'sky';
      const tone = SVG_ACCENT_MAP[colorKey] ?? SVG_ACCENT_MAP.sky;
      const rx = mergedStyle.radius === 'md' ? 8 : mergedStyle.radius === '2xl' ? 18 : 13;
      const strokeWidth = mergedStyle.borderStyle === 'none' ? 0 : 1.3;
      const dash = isAnn || mergedStyle.borderStyle === 'dashed' ? ' stroke-dasharray="5 4"' : '';
      const stroke = isLight ? tone.border : tone.border;

      const accentBarSvg =
        mergedStyle.accentBar === 'top'
          ? `    <rect x="0" y="0" width="${b.w}" height="4" rx="2" fill="${tone.accent}"/>`
          : mergedStyle.accentBar === 'left' || (!mergedStyle.accentBar && !isAnn)
            ? `    <rect x="0" y="10" width="3.5" height="${Math.max(16, b.h - 20)}" rx="2" fill="${tone.accent}"/>`
            : '';

      const metaLine = [n.tech, n.spec, n.kv?.ttl ? `TTL ${n.kv.ttl}` : undefined]
        .filter(Boolean)
        .join(' · ');

      let bodySvg = '';
      if (b.fields.length > 0) {
        const rows = b.fields
          .map((f, idx) => {
            const ry = b.headerH + idx * b.fieldRowH;
            const keyColor =
              f.key === 'PK' ? '#fbbf24' : f.key === 'FK' ? '#38bdf8' : f.key === 'UK' ? '#a78bfa' : '';
            const keyBadge = f.key
              ? `<text x="14" y="${ry + 16}" fill="${keyColor}" font-size="9.5" font-weight="700" font-family="JetBrains Mono, monospace">${escapeXml(f.key)}</text>`
              : '';
            const nameX = f.key ? 38 : 14;
            return `    <line x1="10" y1="${ry}" x2="${b.w - 10}" y2="${ry}" stroke="${cardHeaderDivider}" stroke-width="0.8"/>
    ${keyBadge}
    <text x="${nameX}" y="${ry + 16}" fill="${titleColor}" font-size="11" font-family="JetBrains Mono, monospace">${escapeXml(truncateText(f.name, 20))}</text>
    <text x="${b.w - 14}" y="${ry + 16}" text-anchor="end" fill="${fieldTypeColor}" font-size="10" font-family="JetBrains Mono, monospace">${escapeXml(truncateText(f.type, 14))}</text>`;
          })
          .join('\n');
        bodySvg = rows;
      } else if (n.note) {
        bodySvg = `    <text x="14" y="${metaLine ? 84 : 74}" fill="${subColor}" font-size="11" font-family="Inter, Noto Sans SC, sans-serif">${escapeXml(truncateText(n.note, 34))}</text>`;
      }

      return `  <g transform="translate(${Math.round(b.x)}, ${Math.round(b.y)})">
    <rect width="${b.w}" height="${b.h}" rx="${rx}" fill="${cardBg}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash}/>
${accentBarSvg}
    <text x="14" y="23" fill="${tone.accent}" font-size="10" font-weight="600" font-family="JetBrains Mono, monospace">${escapeXml(truncateText(n.tag, 28))}</text>
    <text x="14" y="45" fill="${titleColor}" font-size="13.5" font-weight="600" font-family="Inter, Noto Sans SC, sans-serif">${escapeXml(truncateText(n.title, 26))}</text>
    ${metaLine ? `<text x="14" y="63" fill="${tone.accent}" opacity="0.85" font-size="10" font-family="JetBrains Mono, monospace">${escapeXml(truncateText(metaLine, 34))}</text>` : ''}
${bodySvg}
  </g>`;
    })
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}" width="${vw}" height="${vh}">
  <defs>
    <pattern id="ddDotGrid" width="22" height="22" patternUnits="userSpaceOnUse">
      <circle cx="1.5" cy="1.5" r="1" fill="${gridDot}"/>
    </pattern>
    <marker id="ddArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#8b5cf6"/>
    </marker>
    <marker id="ddArrowAmber" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b"/>
    </marker>
  </defs>
  <rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="${bg}"/>
  <rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="url(#ddDotGrid)"/>
${groupCards}
${freehandSvg}
${edgeLines}
${nodeCards}
</svg>`;
}

/**
 * Generate a clean RFC / ADR Markdown engineering document combining:
 * - Embedded Mermaid topology / ER diagram
 * - Component & Schema inventory tables
 * - Reasoning Annotations (`assumption` / `decision` / `note`)
 * - Step-by-step Flow scripts with latency & rationale
 */
export function exportSlotToMarkdownAdr(slot: CanvasSlot, projectTitle: string): string {
  const mainNodes = slot.nodes.filter((n) => !getAnnotationKind(n));
  const annotations = slot.nodes.filter((n) => Boolean(getAnnotationKind(n)));
  const nodeById = new Map(slot.nodes.map((n) => [n.id, n]));
  const lines: string[] = [];

  lines.push(`# ${projectTitle} — ${slot.name}`);
  lines.push('');
  lines.push(
    `> 由 **DevDraw · 研绘** 导出 · 共 ${mainNodes.length} 个核心实体、${slot.edges.length} 条拓扑关系、${annotations.length} 条研思标注。`
  );
  lines.push('');

  lines.push('## 1. 架构 / 模型视图');
  lines.push('');
  lines.push('```mermaid');
  lines.push(exportSlotToMermaid(slot));
  lines.push('```');
  lines.push('');

  if (mainNodes.length > 0) {
    lines.push('## 2. 核心实体清单');
    lines.push('');
    lines.push('| 实体名称 | 类型标签 | 技术栈 / 规格 | 状态 / 负责人 | 说明 |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const n of mainNodes) {
      const spec = [n.tech, n.spec, n.complexity, n.kv?.ttl ? `TTL ${n.kv.ttl}` : undefined]
        .filter(Boolean)
        .join(' · ') || '-';
      const meta = [n.status, n.owner].filter(Boolean).join(' / ') || '-';
      const note = (n.summary || n.note || '-').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
      lines.push(`| **${n.title}** | \`${n.tag}\` | ${spec} | ${meta} | ${note} |`);
    }
    lines.push('');
  }

  const schemaNodes = mainNodes.filter((n) => n.fields && n.fields.length > 0);
  if (schemaNodes.length > 0) {
    lines.push('## 3. 数据表与键空间 Schema');
    lines.push('');
    for (const n of schemaNodes) {
      lines.push(`### ${n.title} (\`${n.tag}\`)`);
      if (n.note) lines.push(`> ${n.note}`);
      lines.push('');
      lines.push('| 键 | 字段名 | 类型 | 备注 |');
      lines.push('| --- | --- | --- | --- |');
      for (const f of n.fields ?? []) {
        lines.push(`| ${f.key ? `\`${f.key}\`` : '-'} | \`${f.name}\` | \`${f.type}\` | ${f.note || '-'} |`);
      }
      lines.push('');
    }
  }

  if (annotations.length > 0) {
    const sectionNum = schemaNodes.length > 0 ? 4 : 3;
    lines.push(`## ${sectionNum}. 研思推演记录（ADR / 假设 / 笔记）`);
    lines.push('');
    const kindLabel: Record<string, string> = {
      assumption: '推演假设 (Assumption)',
      decision: '架构决策 (Decision)',
      note: '推演笔记 (Note)',
    };
    for (const ann of annotations) {
      const kind = getAnnotationKind(ann) ?? 'note';
      const target = ann.linkNodeId ? nodeById.get(ann.linkNodeId) : undefined;
      const targetSuffix = target ? ` → 关联 **${target.title}**` : '';
      lines.push(`- **[${kindLabel[kind]}] ${ann.title}**${targetSuffix}`);
      if (ann.note) {
        lines.push(`  - ${ann.note.replace(/\r?\n/g, '\n  - ')}`);
      }
    }
    lines.push('');
  }

  if (slot.flows && slot.flows.length > 0) {
    const baseNum = 3 + (schemaNodes.length > 0 ? 1 : 0) + (annotations.length > 0 ? 1 : 0);
    lines.push(`## ${baseNum}. 动态推演链路`);
    lines.push('');
    for (const flow of slot.flows) {
      lines.push(`### ${flow.name}`);
      if (flow.description) lines.push(`> ${flow.description}`);
      lines.push('');
      lines.push('| 步骤 | 链路 | 说明 | 耗时 | 推演依据 |');
      lines.push('| --- | --- | --- | --- | --- |');
      for (const step of flow.steps) {
        const fromName = nodeById.get(step.from)?.title ?? step.from;
        const toName = nodeById.get(step.to)?.title ?? step.to;
        lines.push(
          `| ${step.order}${step.parallel ? ' (并行)' : ''} | ${fromName} → ${toName} | ${step.label} | ${step.latency || '-'} | ${step.rationale || '-'} |`
        );
      }
      lines.push('');
    }
  }

  return lines.join('\n').trimEnd() + '\n';
}

export function exportSlotToJson(slot: CanvasSlot): string {
  return JSON.stringify(slot, null, 2);
}

/**
 * Generate a self-contained, zero-dependency interactive HTML reviewer
 * with zoom/pan, node detail drawer, and Step-by-step Flow playback.
 */
export function exportSlotToInteractiveHtml(slot: CanvasSlot, projectTitle: string): string {
  const safePayload = JSON.stringify({ projectTitle, slot }).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeXml(projectTitle)} · ${escapeXml(slot.name)} — DevDraw 交互推演视图</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #110e17; color: #f4f4f5; font-family: Inter, "Noto Sans SC", system-ui, sans-serif; height: 100vh; overflow: hidden; display: flex; flex-direction: column; }
    header { height: 46px; padding: 0 16px; border-bottom: 1px solid rgba(255,255,255,0.08); background: #16121e; display: flex; align-items: center; justify-content: space-between; font-size: 13px; }
    .badge { font-family: monospace; font-size: 11px; padding: 2px 8px; border-radius: 999px; background: rgba(124,92,255,0.18); color: #c4b5fd; border: 1px solid rgba(124,92,255,0.3); }
    #stage { flex: 1; position: relative; overflow: hidden; background-image: radial-gradient(rgba(167,139,250,0.16) 1px, transparent 1px); background-size: 22px 22px; cursor: grab; }
    #world { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
    .card { position: absolute; width: 236px; padding: 12px 14px; border-radius: 14px; background: #1b1625; border: 1px solid rgba(255,255,255,0.12); box-shadow: 0 10px 28px rgba(0,0,0,0.45); transition: opacity 0.2s, border-color 0.2s, box-shadow 0.2s; }
    .card.dimmed { opacity: 0.24; }
    .card.active { border-color: #34d399; box-shadow: 0 0 0 2px rgba(52,211,153,0.35), 0 12px 32px rgba(0,0,0,0.65); }
    .card-tag { font-family: monospace; font-size: 10px; color: #a78bfa; margin-bottom: 4px; }
    .card-title { font-size: 13px; font-weight: 600; color: #fff; margin-bottom: 4px; }
    .card-note { font-size: 11px; color: #a1a1aa; line-height: 1.45; }
    #player { position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%); display: flex; align-items: center; gap: 10px; padding: 8px 14px; border-radius: 999px; background: rgba(23,18,32,0.92); border: 1px solid rgba(255,255,255,0.12); backdrop-filter: blur(12px); box-shadow: 0 16px 40px rgba(0,0,0,0.65); font-size: 12px; }
    button { background: rgba(255,255,255,0.08); color: #fff; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 4px 10px; cursor: pointer; font-size: 12px; }
    button:hover { background: rgba(124,92,255,0.35); }
    #stepDesc { color: #d4d4d8; max-width: 340px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  </style>
</head>
<body>
  <header>
    <div><strong>${escapeXml(projectTitle)}</strong> <span style="color:#71717a">/</span> ${escapeXml(slot.name)}</div>
    <span class="badge">DevDraw Interactive Snapshot</span>
  </header>
  <div id="stage">
    <div id="world">
      <svg id="edges" style="position:absolute;left:0;top:0;overflow:visible;pointer-events:none"></svg>
      <div id="nodes"></div>
    </div>
  </div>
  <div id="player" style="display:none">
    <button id="prevBtn">← 上一步</button>
    <span id="stepIndex" class="badge">0 / 0</span>
    <span id="stepDesc"></span>
    <button id="nextBtn">下一步 →</button>
    <button id="resetBtn">全图</button>
  </div>
  <script>
    const DATA = ${safePayload};
    const { slot } = DATA;
    const world = document.getElementById('world');
    const nodesEl = document.getElementById('nodes');
    const edgesEl = document.getElementById('edges');
    let tx = 80, ty = 80, scale = 1, activeFlow = (slot.flows && slot.flows[0]) || null, stepIdx = -1;

    function applyTransform() { world.style.transform = \`translate(\${tx}px, \${ty}px) scale(\${scale})\`; }
    function render() {
      const step = activeFlow && stepIdx >= 0 ? activeFlow.steps[stepIdx] : null;
      nodesEl.innerHTML = '';
      const map = new Map();
      slot.nodes.forEach(n => {
        map.set(n.id, n);
        const div = document.createElement('div');
        const isHit = !step || step.from === n.id || step.to === n.id;
        div.className = 'card' + (step ? (isHit ? ' active' : ' dimmed') : '');
        div.style.left = n.x + 'px';
        div.style.top = n.y + 'px';
        div.innerHTML = \`<div class="card-tag">\${n.tag || n.kind}</div><div class="card-title">\${n.title}</div>\${n.note ? \`<div class="card-note">\${n.note}</div>\` : ''}\`;
        nodesEl.appendChild(div);
      });
      edgesEl.innerHTML = slot.edges.map(e => {
        const a = map.get(e.from), b = map.get(e.to);
        if (!a || !b) return '';
        const x1 = a.x + 236, y1 = a.y + 42, x2 = b.x, y2 = b.y + 42, mx = (x1 + x2) / 2;
        const hit = step && step.from === e.from && step.to === e.to;
        const op = step ? (hit ? 1 : 0.16) : 0.78;
        const stroke = hit ? '#34d399' : '#8b5cf6';
        return \`<path d="M \${x1} \${y1} C \${mx} \${y1}, \${mx} \${y2}, \${x2} \${y2}" fill="none" stroke="\${stroke}" stroke-width="\${hit ? 2.8 : 1.8}" opacity="\${op}" \${e.dashed ? 'stroke-dasharray="6 5"' : ''}/>\`;
      }).join('');
      if (activeFlow) {
        document.getElementById('player').style.display = 'flex';
        document.getElementById('stepIndex').textContent = step ? \`\${stepIdx + 1} / \${activeFlow.steps.length}\` : \`共 \${activeFlow.steps.length} 步\`;
        document.getElementById('stepDesc').textContent = step ? \`[\${activeFlow.name}] \${step.label}\` : \`点击「下一步」开始播放：\${activeFlow.name}\`;
      }
    }
    const stage = document.getElementById('stage');
    let drag = null;
    stage.onmousedown = e => { drag = { x: e.clientX - tx, y: e.clientY - ty }; };
    window.onmousemove = e => { if (!drag) return; tx = e.clientX - drag.x; ty = e.clientY - drag.y; applyTransform(); };
    window.onmouseup = () => { drag = null; };
    stage.onwheel = e => { e.preventDefault(); scale = Math.min(2, Math.max(0.35, scale * (e.deltaY < 0 ? 1.08 : 0.92))); applyTransform(); };
    document.getElementById('nextBtn').onclick = () => { if (!activeFlow) return; stepIdx = (stepIdx + 1) % activeFlow.steps.length; render(); };
    document.getElementById('prevBtn').onclick = () => { if (!activeFlow) return; stepIdx = stepIdx <= 0 ? activeFlow.steps.length - 1 : stepIdx - 1; render(); };
    document.getElementById('resetBtn').onclick = () => { stepIdx = -1; render(); };
    applyTransform(); render();
  </script>
</body>
</html>`;
}
