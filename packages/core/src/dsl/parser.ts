import type {
  CanvasSlot,
  CrossLayerRef,
  DrillTarget,
  EdgeResilience,
  EntityNode,
  EntityStatus,
  ErField,
  FlowScript,
  FlowStep,
  NodeLinks,
  RelationEdge,
  SemanticColor,
} from '../types';
import { findPrimitiveByKind, getAnnotationKind } from '../primitives';

export interface TextSpan {
  start: number;
  end: number;
  line: number;
}

export interface DslDiagnostic {
  line: number;
  message: string;
  severity: 'error' | 'warning';
}

export interface TextEditPatch {
  from: number;
  to: number;
  insert: string;
}

export interface ParsedPropCst {
  value: string;
  valueSpan: TextSpan;
  lineSpan: TextSpan;
}

export interface ParsedEntityCst {
  id: string;
  dslId: string;
  kind: string;
  title: string;
  titleSpan: TextSpan;
  blockSpan: TextSpan;
  hasBlock: boolean;
  /** Offset of the closing `}` on the last line of the block (if hasBlock is true) */
  closingBraceOffset?: number;
  props: Record<string, ParsedPropCst>;
  fieldsSpan?: TextSpan;
  fields: ErField[];
}

export interface ParsedEdgeCst {
  id: string;
  index: number;
  from: string;
  to: string;
  fromField?: string;
  toField?: string;
  lineSpan: TextSpan;
  line: number;
}

export interface ParsedDslResult {
  nodes: EntityNode[];
  edges: RelationEdge[];
  flows: FlowScript[];
  cstEntities: Map<string, ParsedEntityCst>;
  cstEdges: ParsedEdgeCst[];
  diagnostics: DslDiagnostic[];
}

const VALID_COLORS = new Set<SemanticColor>(['violet', 'sky', 'emerald', 'amber', 'rose', 'slate']);
const VALID_STATUSES = new Set<EntityStatus>(['active', 'planned', 'deprecated']);
const VALID_STATE_ROLES = new Set<NonNullable<EntityNode['stateRole']>>(['initial', 'active', 'terminal']);

export function sanitizeDslId(raw: string, fallback: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9_]/g, '_').replace(/^_+|_+$/g, '');
  if (!cleaned) return fallback;
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `n_${cleaned}`;
}

function escapeString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n');
}

function unescapeString(value: string): string {
  return value.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

function formatDrillTarget(drill?: DrillTarget): string | undefined {
  if (!drill?.layerId) return undefined;
  return drill.subCanvasId ? `${drill.layerId}/${drill.subCanvasId}` : drill.layerId;
}

function parseDrillTarget(raw?: string): DrillTarget | undefined {
  if (!raw) return undefined;
  const parts = raw.split('/').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return undefined;
  return parts.length >= 2 ? { layerId: parts[0], subCanvasId: parts[1] } : { layerId: parts[0] };
}

function formatCrossLayerRef(ref?: CrossLayerRef): string | undefined {
  if (!ref?.layerId || !ref?.nodeId) return undefined;
  return ref.subCanvasId ? `${ref.layerId}/${ref.subCanvasId}/${ref.nodeId}` : `${ref.layerId}/${ref.nodeId}`;
}

function parseCrossLayerRef(raw?: string): CrossLayerRef | undefined {
  if (!raw) return undefined;
  const parts = raw.split('/').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 2) return { layerId: parts[0], nodeId: parts[1] };
  if (parts.length >= 3) return { layerId: parts[0], subCanvasId: parts[1], nodeId: parts[2] };
  return undefined;
}

export function buildNodeDslIdMap(nodes: EntityNode[]): Map<string, string> {
  const idToDsl = new Map<string, string>();
  const usedIds = new Set<string>();
  nodes.forEach((n, idx) => {
    const base = sanitizeDslId(n.dslId || n.id, `node_${idx + 1}`);
    let candidate = base;
    let suffix = 2;
    while (usedIds.has(candidate)) {
      candidate = `${base}_${suffix++}`;
    }
    usedIds.add(candidate);
    idToDsl.set(n.id, candidate);
  });
  return idToDsl;
}

function buildEntityPropEntries(
  node: EntityNode,
  idToDsl: Map<string, string>
): Array<{ key: string; line: string }> {
  const entries: Array<{ key: string; line: string }> = [];
  const annKind = getAnnotationKind(node);

  if (annKind) {
    if (node.linkNodeId && idToDsl.has(node.linkNodeId)) {
      entries.push({ key: 'link', line: `  link ${idToDsl.get(node.linkNodeId)}` });
    }
    if (node.tag) {
      const prim = findPrimitiveByKind(annKind);
      if (node.tag !== prim?.badge) {
        entries.push({ key: 'tag', line: `  tag "${escapeString(node.tag)}"` });
      }
    }
    if (node.note) entries.push({ key: 'note', line: `  note "${escapeString(node.note)}"` });
    return entries;
  }

  const prim = findPrimitiveByKind(node.kind);
  const defaultColor = prim?.defaultColor ?? 'sky';

  if (node.tag) entries.push({ key: 'tag', line: `  tag "${escapeString(node.tag)}"` });
  if (node.summary) entries.push({ key: 'summary', line: `  summary "${escapeString(node.summary)}"` });
  if (node.tech) entries.push({ key: 'tech', line: `  tech "${escapeString(node.tech)}"` });
  if (node.spec) entries.push({ key: 'spec', line: `  spec "${escapeString(node.spec)}"` });
  if (node.aggregate) entries.push({ key: 'aggregate', line: `  aggregate "${escapeString(node.aggregate)}"` });
  if (node.complexity) entries.push({ key: 'complexity', line: `  complexity "${escapeString(node.complexity)}"` });
  if (node.status) entries.push({ key: 'status', line: `  status ${node.status}` });
  if (node.stateRole) entries.push({ key: 'state_role', line: `  state_role ${node.stateRole}` });
  if (node.color && node.color !== defaultColor) {
    entries.push({ key: 'color', line: `  color ${node.color}` });
  }
  if (node.owner) entries.push({ key: 'owner', line: `  owner "${escapeString(node.owner)}"` });
  if (node.tags && node.tags.length > 0) {
    entries.push({ key: 'tags', line: `  tags "${escapeString(node.tags.join(', '))}"` });
  }
  if (node.links?.repo) entries.push({ key: 'repo', line: `  repo "${escapeString(node.links.repo)}"` });
  if (node.links?.docs) entries.push({ key: 'docs', line: `  docs "${escapeString(node.links.docs)}"` });
  if (node.links?.adr) entries.push({ key: 'adr', line: `  adr "${escapeString(node.links.adr)}"` });
  if (node.links?.dashboard) {
    entries.push({ key: 'dashboard', line: `  dashboard "${escapeString(node.links.dashboard)}"` });
  }
  const drillExpr = formatDrillTarget(node.drillTarget);
  if (drillExpr) entries.push({ key: 'drill', line: `  drill ${drillExpr}` });
  const refExpr = formatCrossLayerRef(node.ref);
  if (refExpr) entries.push({ key: 'ref', line: `  ref ${refExpr}` });
  if (node.note) entries.push({ key: 'note', line: `  note "${escapeString(node.note)}"` });
  if (node.kv?.ttl) entries.push({ key: 'ttl', line: `  ttl "${escapeString(node.kv.ttl)}"` });
  if (node.kv?.policy) entries.push({ key: 'policy', line: `  policy "${escapeString(node.kv.policy)}"` });
  if (node.kv?.size) entries.push({ key: 'size', line: `  size "${escapeString(node.kv.size)}"` });

  return entries;
}

function serializeFieldsBlock(fields: ErField[]): string {
  const lines = ['  fields {'];
  for (const f of fields) {
    const keyPart = f.key ? ` [${f.key}]` : '';
    const notePart = f.note ? ` "${escapeString(f.note)}"` : '';
    lines.push(`    ${f.name}: ${f.type}${keyPart}${notePart}`);
  }
  lines.push('  }');
  return lines.join('\n');
}

export function serializeEntityToDsl(node: EntityNode, idToDsl: Map<string, string>): string {
  const dslId = idToDsl.get(node.id) ?? sanitizeDslId(node.dslId || node.id, 'node');
  const annKind = getAnnotationKind(node);
  const declKind = annKind ?? node.kind;
  const propLines = buildEntityPropEntries(node, idToDsl).map((e) => e.line);
  const body = [...propLines];
  if (!annKind && node.fields && node.fields.length > 0) {
    body.push(serializeFieldsBlock(node.fields));
  }

  if (body.length === 0) {
    return `${declKind} ${dslId} "${escapeString(node.title)}"`;
  }
  return `${declKind} ${dslId} "${escapeString(node.title)}" {\n${body.join('\n')}\n}`;
}

export function serializeEdgeToDsl(edge: RelationEdge, idToDsl: Map<string, string>): string | null {
  const fromId = idToDsl.get(edge.from) ?? edge.from;
  const toId = idToDsl.get(edge.to) ?? edge.to;
  if (!fromId || !toId) return null;
  const fromExpr = edge.fromField ? `${fromId}.${edge.fromField}` : fromId;
  const toExpr = edge.toField ? `${toId}.${edge.toField}` : toId;
  const arrow = edge.dashed ? '~>' : '->';
  const labelPart = edge.label ? ` "${escapeString(edge.label)}"` : '';
  const attrs: string[] = [];
  if (edge.protocol) attrs.push(edge.protocol);
  if (edge.routing === 'orthogonal') attrs.push('orthogonal');
  if (edge.resilience?.timeout) attrs.push(`timeout: "${escapeString(edge.resilience.timeout)}"`);
  if (typeof edge.resilience?.retry === 'number') attrs.push(`retry: ${edge.resilience.retry}`);
  if (edge.resilience?.circuitBreaker) attrs.push('circuitBreaker');
  const attrPart = attrs.length > 0 ? ` [${attrs.join(', ')}]` : '';
  return `${fromExpr} ${arrow} ${toExpr}${labelPart}${attrPart}`;
}

/**
 * Serialize any CanvasSlot (entities, annotations, relations, flows) into clean,
 * Git-friendly .arch DSL text. Layout coordinates remain in .arch-layout.json.
 */
export function serializeSlotToDsl(slot: Pick<CanvasSlot, 'name' | 'nodes' | 'edges' | 'flows'>): string {
  const lines: string[] = [];
  lines.push(`// DevDraw .arch — ${slot.name}`);
  lines.push('');

  const idToDsl = buildNodeDslIdMap(slot.nodes);
  const mainNodes = slot.nodes.filter((n) => !getAnnotationKind(n));
  const annotations = slot.nodes.filter((n) => !!getAnnotationKind(n));

  if (mainNodes.length > 0) {
    lines.push('// ── 实体定义 ──');
    for (const node of mainNodes) {
      lines.push(serializeEntityToDsl(node, idToDsl));
    }
    lines.push('');
  }

  if (annotations.length > 0) {
    lines.push('// ── 研思推演标注 ──');
    for (const ann of annotations) {
      lines.push(serializeEntityToDsl(ann, idToDsl));
    }
    lines.push('');
  }

  if (slot.edges.length > 0) {
    lines.push('// ── 拓扑与数据关系 ──');
    for (const edge of slot.edges) {
      if (!idToDsl.has(edge.from) || !idToDsl.has(edge.to)) continue;
      const line = serializeEdgeToDsl(edge, idToDsl);
      if (line) lines.push(line);
    }
    lines.push('');
  }

  if (slot.flows && slot.flows.length > 0) {
    lines.push('// ── 动态推演链路 ──');
    for (const flow of slot.flows) {
      lines.push(`flow ${sanitizeDslId(flow.id, 'main_flow')} "${escapeString(flow.name)}" {`);
      if (flow.description) {
        lines.push(`  desc "${escapeString(flow.description)}"`);
      }
      for (const step of flow.steps) {
        const fromId = idToDsl.get(step.from) ?? step.from;
        const toId = idToDsl.get(step.to) ?? step.to;
        const meta: string[] = [];
        if (step.latency) meta.push(`latency: "${escapeString(step.latency)}"`);
        if (step.rationale) meta.push(`rationale: "${escapeString(step.rationale)}"`);
        if (step.parallel) meta.push('parallel');
        const metaStr = meta.length > 0 ? ` [${meta.join(', ')}]` : '';
        lines.push(`  ${step.order}: ${fromId} -> ${toId} "${escapeString(step.label)}"${metaStr}`);
      }
      lines.push('}');
      lines.push('');
    }
  }

  return lines.join('\n').trimEnd() + '\n';
}

function buildEdgeMatchKey(from: string, to: string, fromField?: string, toField?: string): string {
  return `${from}|${fromField ?? ''}|${to}|${toField ?? ''}`;
}

/**
 * Recursive line/block parser with CST offsets so canvas edits can apply surgical
 * text patches without erasing comments, blank lines, or custom formatting.
 */
export function parseArchDsl(
  source: string,
  existingNodes: EntityNode[] = [],
  existingEdges: RelationEdge[] = []
): ParsedDslResult {
  const diagnostics: DslDiagnostic[] = [];
  const cstEntities = new Map<string, ParsedEntityCst>();
  const cstEdges: ParsedEdgeCst[] = [];
  const nodes: EntityNode[] = [];
  const edges: RelationEdge[] = [];
  const flows: FlowScript[] = [];

  const existingById = new Map<string, EntityNode>();
  existingNodes.forEach((n) => {
    existingById.set(n.id, n);
    if (n.dslId) existingById.set(n.dslId, n);
  });

  // Normalize CRLF -> LF internally while preserving exact offsets for the passed source
  const rawLines = source.split('\n');
  const lineOffsets: number[] = [];
  let cursor = 0;
  for (const l of rawLines) {
    lineOffsets.push(cursor);
    cursor += l.length + 1;
  }

  let i = 0;
  while (i < rawLines.length) {
    const rawLine = rawLines[i];
    const lineStart = lineOffsets[i];
    const trimmed = rawLine.trim();
    const lineNum = i + 1;

    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) {
      i++;
      continue;
    }

    // 1. Flow block: flow <id> "<name>" { ... }
    const flowMatch = trimmed.match(/^flow\s+([A-Za-z_][A-Za-z0-9_-]*)\s+"((?:[^"\\]|\\.)*)"\s*\{$/);
    if (flowMatch) {
      const flowId = flowMatch[1];
      const flowName = unescapeString(flowMatch[2]);
      let flowDescription: string | undefined;
      const steps: FlowStep[] = [];
      i++;
      while (i < rawLines.length && rawLines[i].trim() !== '}') {
        const stepLine = rawLines[i].trim();
        if (stepLine && !stepLine.startsWith('//')) {
          const descMatch = stepLine.match(/^desc\s+"((?:[^"\\]|\\.)*)"$/);
          if (descMatch) {
            flowDescription = unescapeString(descMatch[1]);
            i++;
            continue;
          }
          const sm = stepLine.match(
            /^(\d+)\s*:\s*([A-Za-z_][A-Za-z0-9_-]*)\s*(?:->|~>)\s*([A-Za-z_][A-Za-z0-9_-]*)\s+"((?:[^"\\]|\\.)*)"(?:\s*\[([^\]]*)\])?$/
          );
          if (sm) {
            const metaRaw = sm[5] || '';
            const latencyMatch = metaRaw.match(/latency\s*:\s*"((?:[^"\\]|\\.)*)"/);
            const rationaleMatch = metaRaw.match(/rationale\s*:\s*"((?:[^"\\]|\\.)*)"/);
            steps.push({
              order: Number(sm[1]),
              from: sm[2],
              to: sm[3],
              label: unescapeString(sm[4]),
              latency: latencyMatch ? unescapeString(latencyMatch[1]) : undefined,
              rationale: rationaleMatch ? unescapeString(rationaleMatch[1]) : undefined,
              parallel: /\bparallel\b/.test(metaRaw),
            });
          } else {
            diagnostics.push({
              line: i + 1,
              severity: 'warning',
              message: `无法解析链路步骤: ${stepLine}`,
            });
          }
        }
        i++;
      }
      if (i >= rawLines.length) {
        diagnostics.push({
          line: lineNum,
          severity: 'error',
          message: `flow "${flowId}" 缺少闭合花括号 "}"`,
        });
      }
      flows.push({ id: flowId, name: flowName, description: flowDescription, steps });
      i++;
      continue;
    }

    // 2. Relation line: a[.f1] ->|~> b[.f2] ["label"] [attrs]
    const relMatch = trimmed.match(
      /^([A-Za-z_][A-Za-z0-9_-]*)(?:\.([A-Za-z0-9_:{}-]+))?\s*(->|~>)\s*([A-Za-z_][A-Za-z0-9_-]*)(?:\.([A-Za-z0-9_:{}-]+))?(?:\s+"((?:[^"\\]|\\.)*)")?(?:\s*\[([^\]]*)\])?$/
    );
    if (relMatch) {
      const from = relMatch[1];
      const fromField = relMatch[2];
      const arrow = relMatch[3];
      const to = relMatch[4];
      const toField = relMatch[5];
      const label = relMatch[6] ? unescapeString(relMatch[6]) : '';
      const attrRaw = relMatch[7] || '';
      const attrParts = attrRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      let protocol: string | undefined;
      let routing: 'bezier' | 'orthogonal' | undefined;
      const resilience: EdgeResilience = {};
      let hasResilience = false;
      let dashed = arrow === '~>';
      for (const part of attrParts) {
        if (part === 'async') dashed = true;
        else if (part === 'orthogonal') routing = 'orthogonal';
        else if (part === 'bezier') routing = 'bezier';
        else if (part === 'circuitBreaker') {
          resilience.circuitBreaker = true;
          hasResilience = true;
        } else if (part.startsWith('timeout:')) {
          resilience.timeout = part.replace(/^timeout:\s*"?([^"]*)"?$/, '$1');
          hasResilience = true;
        } else if (part.startsWith('retry:')) {
          const parsedRetry = Number(part.replace(/^retry:\s*/, ''));
          if (!Number.isNaN(parsedRetry)) {
            resilience.retry = parsedRetry;
            hasResilience = true;
          }
        } else if (!protocol) {
          protocol = part;
        }
      }

      const edgeIndex = edges.length;
      const edgeId = `e-${from}${fromField ? '.' + fromField : ''}-${to}${toField ? '.' + toField : ''}-${edgeIndex}`;
      edges.push({
        id: edgeId,
        from,
        to,
        fromField,
        toField,
        label,
        protocol,
        dashed,
        routing,
        resilience: hasResilience ? resilience : undefined,
      });
      cstEdges.push({
        id: edgeId,
        index: edgeIndex,
        from,
        to,
        fromField,
        toField,
        line: lineNum,
        lineSpan: { start: lineStart, end: lineStart + rawLine.length, line: lineNum },
      });
      i++;
      continue;
    }

    // 3. Entity declaration: <kind> <id> "<title>" [{ ... }]
    const entityMatch = trimmed.match(
      /^([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_-]*)\s+"((?:[^"\\]|\\.)*)"\s*(\{)?$/
    );
    if (entityMatch) {
      const kind = entityMatch[1];
      const id = entityMatch[2];
      const rawTitle = entityMatch[3];
      const title = unescapeString(rawTitle);
      const hasBlock = Boolean(entityMatch[4]);

      const quoteIdx = rawLine.indexOf(`"${rawTitle}"`);
      const titleSpan: TextSpan = {
        start: lineStart + (quoteIdx >= 0 ? quoteIdx + 1 : 0),
        end: lineStart + (quoteIdx >= 0 ? quoteIdx + 1 + rawTitle.length : 0),
        line: lineNum,
      };

      const props: Record<string, ParsedPropCst> = {};
      const fields: ErField[] = [];
      let fieldsSpan: TextSpan | undefined;
      let blockEnd = lineStart + rawLine.length;
      let closingBraceOffset: number | undefined;

      if (hasBlock) {
        i++;
        let inFields = false;
        let fieldsStart = 0;
        let fieldsStartLine = 0;
        let closed = false;

        while (i < rawLines.length) {
          const innerRaw = rawLines[i];
          const innerStart = lineOffsets[i];
          const innerTrim = innerRaw.trim();

          if (innerTrim === '}') {
            if (inFields) {
              inFields = false;
              fieldsSpan = {
                start: fieldsStart,
                end: innerStart + innerRaw.length,
                line: fieldsStartLine,
              };
              i++;
              continue;
            }
            blockEnd = innerStart + innerRaw.length;
            closingBraceOffset = innerStart + innerRaw.indexOf('}');
            closed = true;
            break;
          }

          if (!innerTrim || innerTrim.startsWith('//') || innerTrim.startsWith('#')) {
            i++;
            continue;
          }

          if (innerTrim === 'fields {') {
            inFields = true;
            fieldsStart = innerStart;
            fieldsStartLine = i + 1;
            i++;
            continue;
          }

          if (inFields) {
            const fm = innerTrim.match(
              /^([A-Za-z0-9_:{}-]+)\s*:\s*([^\s\["]+)(?:\s*\[(PK|FK|UK)\])?(?:\s+"((?:[^"\\]|\\.)*)")?$/
            );
            if (fm) {
              fields.push({
                name: fm[1],
                type: fm[2],
                key: (fm[3] as ErField['key']) || '',
                note: fm[4] ? unescapeString(fm[4]) : undefined,
              });
            } else {
              diagnostics.push({
                line: i + 1,
                severity: 'warning',
                message: `无法解析字段定义: "${innerTrim.slice(0, 48)}"`,
              });
            }
          } else {
            const lineSpan: TextSpan = {
              start: innerStart,
              end: innerStart + innerRaw.length,
              line: i + 1,
            };
            const pmQuoted = innerTrim.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+"((?:[^"\\]|\\.)*)"$/);
            const pmBare = innerTrim.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+([^\s]+)$/);
            if (pmQuoted) {
              const key = pmQuoted[1];
              const rawVal = pmQuoted[2];
              const qIdx = innerRaw.indexOf(`"${rawVal}"`);
              props[key] = {
                value: unescapeString(rawVal),
                valueSpan: {
                  start: innerStart + (qIdx >= 0 ? qIdx + 1 : 0),
                  end: innerStart + (qIdx >= 0 ? qIdx + 1 + rawVal.length : 0),
                  line: i + 1,
                },
                lineSpan,
              };
            } else if (pmBare) {
              const key = pmBare[1];
              const rawVal = pmBare[2];
              const vIdx = innerRaw.lastIndexOf(rawVal);
              props[key] = {
                value: rawVal,
                valueSpan: {
                  start: innerStart + Math.max(0, vIdx),
                  end: innerStart + Math.max(0, vIdx) + rawVal.length,
                  line: i + 1,
                },
                lineSpan,
              };
            } else {
              diagnostics.push({
                line: i + 1,
                severity: 'warning',
                message: `无法解析实体属性: "${innerTrim.slice(0, 48)}"`,
              });
            }
          }
          i++;
        }

        if (!closed) {
          diagnostics.push({
            line: lineNum,
            severity: 'error',
            message: `实体 "${id}" 缺少闭合花括号 "}"`,
          });
        }
      }

      const prev = existingById.get(id);
      const prim = findPrimitiveByKind(kind);
      const rawColor = props.color?.value as SemanticColor | undefined;
      const color: SemanticColor =
        rawColor && VALID_COLORS.has(rawColor) ? rawColor : prim?.defaultColor || 'sky';

      const rawStatus = props.status?.value as EntityStatus | undefined;
      const status = rawStatus && VALID_STATUSES.has(rawStatus) ? rawStatus : undefined;

      const rawStateRole = props.state_role?.value as EntityNode['stateRole'] | undefined;
      const stateRole = rawStateRole && VALID_STATE_ROLES.has(rawStateRole) ? rawStateRole : undefined;

      const tags = props.tags?.value
        ? props.tags.value
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;

      const links: NodeLinks = {};
      if (props.repo?.value) links.repo = props.repo.value;
      if (props.docs?.value) links.docs = props.docs.value;
      if (props.adr?.value) links.adr = props.adr.value;
      if (props.dashboard?.value) links.dashboard = props.dashboard.value;
      const hasLinks = Object.keys(links).length > 0;

      const hasKv = Boolean(props.ttl || props.policy || props.size);
      const kv = hasKv
        ? {
            ttl: props.ttl?.value,
            policy: props.policy?.value,
            size: props.size?.value,
          }
        : undefined;

      const node: EntityNode = {
        id: prev?.id || id,
        dslId: id,
        kind,
        title,
        tag: props.tag?.value || prim?.badge || kind.toUpperCase(),
        summary: props.summary?.value,
        tech: props.tech?.value,
        spec: props.spec?.value,
        aggregate: props.aggregate?.value,
        complexity: props.complexity?.value,
        status,
        stateRole,
        owner: props.owner?.value,
        tags,
        links: hasLinks ? links : undefined,
        note: props.note?.value ?? '',
        color,
        icon: prev?.icon || prim?.icon,
        engine: prev?.engine || prim?.engine,
        fields: fields.length > 0 ? fields : undefined,
        kv,
        linkNodeId: props.link?.value || null,
        drillTarget: parseDrillTarget(props.drill?.value),
        ref: parseCrossLayerRef(props.ref?.value),
        // Preserve geometry & visual overrides from existing node (kept out of .arch)
        x: prev?.x ?? (nodes.length % 4) * 290,
        y: prev?.y ?? Math.floor(nodes.length / 4) * 180,
        w: prev?.w,
        h: prev?.h,
        pinned: prev?.pinned,
        collapsed: prev?.collapsed,
        customStyle: prev?.customStyle,
      };

      nodes.push(node);
      const cst: ParsedEntityCst = {
        id: node.id,
        dslId: id,
        kind,
        title,
        titleSpan,
        blockSpan: { start: lineStart, end: blockEnd, line: lineNum },
        hasBlock,
        closingBraceOffset,
        props,
        fieldsSpan,
        fields,
      };
      cstEntities.set(node.id, cst);
      if (id !== node.id) cstEntities.set(id, cst);
      i++;
      continue;
    }

    diagnostics.push({
      line: lineNum,
      severity: 'error',
      message: `无法识别的 DSL 语法: "${trimmed.slice(0, 48)}"`,
    });
    i++;
  }

  // Remap edge endpoints & linkNodeId from dslId to actual node.id
  const dslIdToNodeId = new Map<string, string>();
  for (const n of nodes) {
    if (n.dslId) dslIdToNodeId.set(n.dslId, n.id);
    dslIdToNodeId.set(n.id, n.id);
  }
  for (const n of nodes) {
    if (n.linkNodeId && dslIdToNodeId.has(n.linkNodeId)) {
      n.linkNodeId = dslIdToNodeId.get(n.linkNodeId)!;
    }
  }

  // Group existing edges by semantic endpoints so we preserve stable IDs, ports, and waypoints
  const existingEdgeQueues = new Map<string, RelationEdge[]>();
  for (const ex of existingEdges) {
    const k = buildEdgeMatchKey(ex.from, ex.to, ex.fromField, ex.toField);
    const list = existingEdgeQueues.get(k) ?? [];
    list.push(ex);
    existingEdgeQueues.set(k, list);
  }

  for (let idx = 0; idx < edges.length; idx++) {
    const e = edges[idx];
    e.from = dslIdToNodeId.get(e.from) ?? e.from;
    e.to = dslIdToNodeId.get(e.to) ?? e.to;

    const matchKey = buildEdgeMatchKey(e.from, e.to, e.fromField, e.toField);
    const queue = existingEdgeQueues.get(matchKey);
    const prevEdge = queue && queue.length > 0 ? queue.shift() : undefined;
    if (prevEdge) {
      e.id = prevEdge.id;
      e.sourcePort = prevEdge.sourcePort;
      e.targetPort = prevEdge.targetPort;
      e.curveOffsetX = prevEdge.curveOffsetX;
      e.curveOffsetY = prevEdge.curveOffsetY;
      e.waypoints = prevEdge.waypoints;
      if (!e.routing && prevEdge.routing) {
        e.routing = prevEdge.routing;
      }
    }
    if (cstEdges[idx]) {
      cstEdges[idx].id = e.id;
      cstEdges[idx].from = e.from;
      cstEdges[idx].to = e.to;
    }
  }

  for (const f of flows) {
    for (const s of f.steps) {
      s.from = dslIdToNodeId.get(s.from) ?? s.from;
      s.to = dslIdToNodeId.get(s.to) ?? s.to;
    }
  }

  return { nodes, edges, flows, cstEntities, cstEdges, diagnostics };
}

/**
 * Apply a single lossless TextEditPatch to a source string.
 */
export function applyTextPatch(source: string, patch: TextEditPatch): string {
  return source.slice(0, patch.from) + patch.insert + source.slice(patch.to);
}

/**
 * Apply multiple non-overlapping TextEditPatches in reverse offset order.
 */
export function applyTextPatches(source: string, patches: TextEditPatch[]): string {
  const sorted = [...patches].sort((a, b) => b.from - a.from || b.to - a.to);
  let out = source;
  for (const p of sorted) {
    out = out.slice(0, p.from) + p.insert + out.slice(p.to);
  }
  return out;
}

function expandSpanWithTrailingNewline(source: string, start: number, end: number): { from: number; to: number } {
  let to = end;
  if (source[to] === '\r' && source[to + 1] === '\n') to += 2;
  else if (source[to] === '\n') to += 1;
  return { from: start, to };
}

/**
 * Generate a surgical patch that renames an entity's title in .arch source
 * without disturbing comments, indentation, or surrounding blocks.
 */
export function createRenameEntityPatch(
  source: string,
  entityId: string,
  newTitle: string
): TextEditPatch | null {
  const parsed = parseArchDsl(source);
  const cst = parsed.cstEntities.get(entityId);
  if (!cst) return null;
  return {
    from: cst.titleSpan.start,
    to: cst.titleSpan.end,
    insert: escapeString(newTitle),
  };
}

/**
 * Surgically patch an entity's title, properties, and fields inside existing .arch source
 * while preserving comments, blank lines, and ordering inside and outside the block.
 */
export function patchEntityInDsl(
  source: string,
  node: EntityNode,
  allNodes: EntityNode[]
): string | null {
  const parsed = parseArchDsl(source, allNodes);
  const lookupKey = node.dslId || node.id;
  const cst = parsed.cstEntities.get(node.id) ?? parsed.cstEntities.get(lookupKey);
  if (!cst) return null;

  const idToDsl = buildNodeDslIdMap(allNodes);
  const desiredEntries = buildEntityPropEntries(node, idToDsl);
  const desiredMap = new Map(desiredEntries.map((e) => [e.key, e.line]));
  const annKind = getAnnotationKind(node);
  const desiredFields = !annKind && node.fields && node.fields.length > 0 ? node.fields : null;

  // If entity had no block `{ ... }` and still has no props/fields, just patch title
  if (!cst.hasBlock) {
    if (desiredEntries.length === 0 && !desiredFields) {
      if (cst.title === node.title) return source;
      return applyTextPatch(source, {
        from: cst.titleSpan.start,
        to: cst.titleSpan.end,
        insert: escapeString(node.title),
      });
    }
    // Expand single-line entity into block while keeping everything outside intact
    const replacement = serializeEntityToDsl(node, idToDsl);
    return applyTextPatch(source, {
      from: cst.blockSpan.start,
      to: cst.blockSpan.end,
      insert: replacement,
    });
  }

  const patches: TextEditPatch[] = [];

  // 1. Title patch
  if (cst.title !== node.title) {
    patches.push({
      from: cst.titleSpan.start,
      to: cst.titleSpan.end,
      insert: escapeString(node.title),
    });
  }

  // 2. Existing properties: update or remove
  const handledKeys = new Set<string>();
  for (const [key, propCst] of Object.entries(cst.props)) {
    handledKeys.add(key);
    const desiredLine = desiredMap.get(key);
    if (desiredLine === undefined) {
      // Remove obsolete property line
      const range = expandSpanWithTrailingNewline(source, propCst.lineSpan.start, propCst.lineSpan.end);
      patches.push({ from: range.from, to: range.to, insert: '' });
    } else {
      const currentLine = source.slice(propCst.lineSpan.start, propCst.lineSpan.end);
      if (currentLine !== desiredLine) {
        patches.push({
          from: propCst.lineSpan.start,
          to: propCst.lineSpan.end,
          insert: desiredLine,
        });
      }
    }
  }

  // 3. Fields block: update or remove
  if (cst.fieldsSpan) {
    if (!desiredFields) {
      const range = expandSpanWithTrailingNewline(source, cst.fieldsSpan.start, cst.fieldsSpan.end);
      patches.push({ from: range.from, to: range.to, insert: '' });
    } else {
      const newFieldsText = serializeFieldsBlock(desiredFields);
      const currentFieldsText = source.slice(cst.fieldsSpan.start, cst.fieldsSpan.end);
      if (currentFieldsText !== newFieldsText) {
        patches.push({
          from: cst.fieldsSpan.start,
          to: cst.fieldsSpan.end,
          insert: newFieldsText,
        });
      }
    }
  }

  // 4. Newly added properties & fields block inserted right before closing `}`
  const insertions: string[] = [];
  for (const entry of desiredEntries) {
    if (!handledKeys.has(entry.key)) {
      insertions.push(entry.line);
    }
  }
  if (!cst.fieldsSpan && desiredFields) {
    insertions.push(serializeFieldsBlock(desiredFields));
  }

  if (insertions.length > 0 && cst.closingBraceOffset !== undefined) {
    // Insert right at the start of the closing `}` line
    let lineStart = cst.closingBraceOffset;
    while (lineStart > 0 && source[lineStart - 1] !== '\n') {
      lineStart--;
    }
    patches.push({
      from: lineStart,
      to: lineStart,
      insert: insertions.join('\n') + '\n',
    });
  }

  if (patches.length === 0) return source;
  return applyTextPatches(source, patches);
}

/**
 * Surgically append a new entity or annotation to .arch source without disturbing comments/formatting.
 */
export function appendEntityToDsl(
  source: string,
  node: EntityNode,
  allNodes: EntityNode[]
): string {
  const idToDsl = buildNodeDslIdMap(allNodes);
  const block = serializeEntityToDsl(node, idToDsl);
  const parsed = parseArchDsl(source, allNodes);

  // Insert right after the last entity of the same category (main vs annotation), or before relations
  const isAnn = Boolean(getAnnotationKind(node));
  let insertOffset: number | null = null;

  for (const existing of parsed.nodes) {
    const existingIsAnn = Boolean(getAnnotationKind(existing));
    if (existingIsAnn === isAnn) {
      const cst = parsed.cstEntities.get(existing.id);
      if (cst) insertOffset = cst.blockSpan.end;
    }
  }

  if (insertOffset !== null) {
    return applyTextPatch(source, {
      from: insertOffset,
      to: insertOffset,
      insert: '\n' + block,
    });
  }

  // Fallback: insert before the first edge if any, else append to EOF
  if (parsed.cstEdges.length > 0) {
    const edgeStart = parsed.cstEdges[0].lineSpan.start;
    return applyTextPatch(source, {
      from: edgeStart,
      to: edgeStart,
      insert: block + '\n\n',
    });
  }

  const trimmedEnd = source.replace(/\s*$/, '');
  return (trimmedEnd ? trimmedEnd + '\n\n' : '') + block + '\n';
}

/**
 * Surgically remove an entity (and any edges touching it) from .arch source,
 * preserving all surrounding comments and formatting.
 */
export function deleteEntityFromDsl(
  source: string,
  nodeId: string,
  allNodes: EntityNode[],
  allEdges: RelationEdge[]
): string | null {
  const parsed = parseArchDsl(source, allNodes, allEdges);
  const targetNode = allNodes.find((n) => n.id === nodeId);
  const cst = parsed.cstEntities.get(nodeId) ?? (targetNode?.dslId ? parsed.cstEntities.get(targetNode.dslId) : undefined);
  if (!cst) return null;

  const patches: TextEditPatch[] = [];
  const blockRange = expandSpanWithTrailingNewline(source, cst.blockSpan.start, cst.blockSpan.end);
  patches.push({ from: blockRange.from, to: blockRange.to, insert: '' });

  // Remove edges connected to this entity
  for (const edgeCst of parsed.cstEdges) {
    if (edgeCst.from === cst.id || edgeCst.to === cst.id) {
      const r = expandSpanWithTrailingNewline(source, edgeCst.lineSpan.start, edgeCst.lineSpan.end);
      patches.push({ from: r.from, to: r.to, insert: '' });
    }
  }

  // Remove `link <dslId>` lines in annotations referencing this entity
  for (const other of parsed.cstEntities.values()) {
    if (other.id === cst.id) continue;
    const linkProp = other.props.link;
    if (linkProp && (linkProp.value === cst.dslId || linkProp.value === cst.id)) {
      const r = expandSpanWithTrailingNewline(source, linkProp.lineSpan.start, linkProp.lineSpan.end);
      patches.push({ from: r.from, to: r.to, insert: '' });
    }
  }

  // Deduplicate identical spans (since cstEntities aliases both id and dslId)
  const seen = new Set<string>();
  const uniquePatches = patches.filter((p) => {
    const key = `${p.from}:${p.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return applyTextPatches(source, uniquePatches);
}

/**
 * Surgically append a new relation line to .arch source.
 */
export function appendEdgeToDsl(
  source: string,
  edge: RelationEdge,
  allNodes: EntityNode[],
  allEdges: RelationEdge[]
): string | null {
  const idToDsl = buildNodeDslIdMap(allNodes);
  const edgeLine = serializeEdgeToDsl(edge, idToDsl);
  if (!edgeLine) return null;

  const parsed = parseArchDsl(source, allNodes, allEdges);
  if (parsed.cstEdges.length > 0) {
    const lastEdge = parsed.cstEdges[parsed.cstEdges.length - 1];
    return applyTextPatch(source, {
      from: lastEdge.lineSpan.end,
      to: lastEdge.lineSpan.end,
      insert: '\n' + edgeLine,
    });
  }

  // Insert before the first flow block if present, else append to EOF
  const flowIdx = source.search(/^flow\s+[A-Za-z_]/m);
  if (flowIdx >= 0) {
    return applyTextPatch(source, {
      from: flowIdx,
      to: flowIdx,
      insert: `// ── 拓扑与数据关系 ──\n${edgeLine}\n\n`,
    });
  }

  const trimmedEnd = source.replace(/\s*$/, '');
  return (trimmedEnd ? trimmedEnd + '\n\n' : '') + edgeLine + '\n';
}

/**
 * Surgically update a single relation line in .arch source.
 */
export function patchEdgeInDsl(
  source: string,
  edge: RelationEdge,
  allNodes: EntityNode[],
  allEdges: RelationEdge[],
  previousEdge?: RelationEdge
): string | null {
  const parsed = parseArchDsl(source, allNodes, allEdges);
  let targetCst = parsed.cstEdges.find((c) => c.id === edge.id);
  if (!targetCst && previousEdge) {
    targetCst = parsed.cstEdges.find(
      (c) =>
        c.from === previousEdge.from &&
        c.to === previousEdge.to &&
        (c.fromField ?? '') === (previousEdge.fromField ?? '') &&
        (c.toField ?? '') === (previousEdge.toField ?? '')
    );
  }
  if (!targetCst) return null;

  const idToDsl = buildNodeDslIdMap(allNodes);
  const nextLine = serializeEdgeToDsl(edge, idToDsl);
  if (!nextLine) return null;

  return applyTextPatch(source, {
    from: targetCst.lineSpan.start,
    to: targetCst.lineSpan.end,
    insert: nextLine,
  });
}

/**
 * Surgically delete one or more relation lines from .arch source.
 */
export function deleteEdgesFromDsl(
  source: string,
  edgeIds: string[],
  allNodes: EntityNode[],
  allEdges: RelationEdge[]
): string | null {
  const idSet = new Set(edgeIds);
  const parsed = parseArchDsl(source, allNodes, allEdges);
  const matches = parsed.cstEdges.filter((c) => idSet.has(c.id));
  if (matches.length === 0) return null;

  const patches = matches.map((c) => {
    const range = expandSpanWithTrailingNewline(source, c.lineSpan.start, c.lineSpan.end);
    return { from: range.from, to: range.to, insert: '' };
  });
  return applyTextPatches(source, patches);
}

/**
 * Locate the 1-based line range of an entity or edge inside .arch source (for Canvas -> Editor sync).
 */
export function locateEntityInDsl(
  source: string,
  nodeId: string,
  allNodes: EntityNode[] = []
): { startLine: number; endLine: number; startOffset: number; endOffset: number } | null {
  const parsed = parseArchDsl(source, allNodes);
  const target = allNodes.find((n) => n.id === nodeId);
  const cst = parsed.cstEntities.get(nodeId) ?? (target?.dslId ? parsed.cstEntities.get(target.dslId) : undefined);
  if (!cst) return null;

  const startLine = cst.blockSpan.line;
  const slice = source.slice(cst.blockSpan.start, cst.blockSpan.end);
  const newlineCount = (slice.match(/\n/g) || []).length;
  return {
    startLine,
    endLine: startLine + newlineCount,
    startOffset: cst.blockSpan.start,
    endOffset: cst.blockSpan.end,
  };
}

export function locateEdgeInDsl(
  source: string,
  edgeId: string,
  allNodes: EntityNode[] = [],
  allEdges: RelationEdge[] = []
): { line: number; startOffset: number; endOffset: number } | null {
  const parsed = parseArchDsl(source, allNodes, allEdges);
  const cst = parsed.cstEdges.find((c) => c.id === edgeId);
  if (!cst) return null;
  return {
    line: cst.line,
    startOffset: cst.lineSpan.start,
    endOffset: cst.lineSpan.end,
  };
}

/**
 * Locate which entity or edge covers a given 1-based line number (for Editor -> Canvas sync).
 */
export function locateSelectionAtDslLine(
  source: string,
  line: number,
  allNodes: EntityNode[] = [],
  allEdges: RelationEdge[] = []
): { kind: 'node'; id: string } | { kind: 'edge'; id: string } | null {
  const parsed = parseArchDsl(source, allNodes, allEdges);

  for (const edgeCst of parsed.cstEdges) {
    if (edgeCst.line === line) {
      return { kind: 'edge', id: edgeCst.id };
    }
  }

  const visited = new Set<string>();
  for (const cst of parsed.cstEntities.values()) {
    if (visited.has(cst.id)) continue;
    visited.add(cst.id);
    const startLine = cst.blockSpan.line;
    const slice = source.slice(cst.blockSpan.start, cst.blockSpan.end);
    const endLine = startLine + (slice.match(/\n/g) || []).length;
    if (line >= startLine && line <= endLine) {
      return { kind: 'node', id: cst.id };
    }
  }

  return null;
}
