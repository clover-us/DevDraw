import type { CanvasSlot, EntityNode, RelationEdge } from '../types';
import { getAnnotationKind } from '../primitives';

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

/**
 * Export standalone SVG with tight world-space bounding box.
 */
export function exportSlotToSvg(slot: CanvasSlot, theme: 'dark' | 'light' = 'dark'): string {
  const { nodes, edges } = slot;
  const boxes = new Map<string, { x: number; y: number; w: number; h: number }>();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const n of nodes) {
    const w = n.w ?? 232;
    const h = n.h ?? (n.fields?.length && !n.collapsed ? 80 + n.fields.length * 24 : 92);
    boxes.set(n.id, { x: n.x, y: n.y, w, h });
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + w);
    maxY = Math.max(maxY, n.y + h);
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

  const bg = theme === 'light' ? '#f3f5f9' : '#110e17';
  const cardBg = theme === 'light' ? '#ffffff' : '#1b1625';
  const cardBorder = theme === 'light' ? '#cbd5e1' : 'rgba(255,255,255,0.14)';
  const titleColor = theme === 'light' ? '#0f172a' : '#f4f4f5';
  const subColor = theme === 'light' ? '#475569' : '#a1a1aa';

  const edgeLines = edges
    .map((e: RelationEdge) => {
      const a = boxes.get(e.from);
      const b = boxes.get(e.to);
      if (!a || !b) return '';
      const x1 = a.x + a.w;
      const y1 = a.y + a.h / 2;
      const x2 = b.x;
      const y2 = b.y + b.h / 2;
      const mx = (x1 + x2) / 2;
      const d =
        e.routing === 'orthogonal'
          ? `M ${x1} ${y1} L ${mx} ${y1} L ${mx} ${y2} L ${x2} ${y2}`
          : `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
      const dash = e.dashed ? ' stroke-dasharray="6 5"' : '';
      const labelSvg = e.label
        ? `<text x="${mx}" y="${(y1 + y2) / 2 - 8}" text-anchor="middle" fill="${subColor}" font-size="11" font-family="JetBrains Mono, monospace">${escapeXml(e.label)}</text>`
        : '';
      return `  <path d="${d}" fill="none" stroke="#8b5cf6" stroke-width="1.8"${dash} marker-end="url(#ddArrow)"/>\n  ${labelSvg}`;
    })
    .join('\n');

  const nodeCards = nodes
    .map((n) => {
      const b = boxes.get(n.id)!;
      const isAnn = !!getAnnotationKind(n);
      const dash = isAnn ? ' stroke-dasharray="5 4"' : '';
      return `  <g transform="translate(${b.x}, ${b.y})">
    <rect width="${b.w}" height="${b.h}" rx="14" fill="${cardBg}" stroke="${cardBorder}" stroke-width="1.2"${dash}/>
    <text x="14" y="24" fill="#a78bfa" font-size="10" font-family="JetBrains Mono, monospace">${escapeXml(n.tag)}</text>
    <text x="14" y="46" fill="${titleColor}" font-size="13.5" font-weight="600" font-family="Inter, Noto Sans SC, sans-serif">${escapeXml(n.title)}</text>
    ${n.note ? `<text x="14" y="68" fill="${subColor}" font-size="11" font-family="Inter, Noto Sans SC, sans-serif">${escapeXml(n.note.slice(0, 32))}</text>` : ''}
  </g>`;
    })
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}" width="${vw}" height="${vh}">
  <defs>
    <marker id="ddArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#8b5cf6"/>
    </marker>
  </defs>
  <rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="${bg}"/>
${edgeLines}
${nodeCards}
</svg>`;
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
