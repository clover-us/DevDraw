import { sanitizeDslId } from '../dsl/parser';
import type {
  CanvasSlot,
  EntityNode,
  ErField,
  ProjectDocument,
  RelationEdge,
} from '../types';

export interface SqlImportResult {
  nodes: EntityNode[];
  edges: RelationEdge[];
  tableCount: number;
  relationCount: number;
  warnings: string[];
}

export interface MermaidImportResult {
  dialect: 'flowchart' | 'er';
  nodes: EntityNode[];
  edges: RelationEdge[];
  nodeCount: number;
  edgeCount: number;
  warnings: string[];
}

export type JsonImportResult =
  | { kind: 'slot'; slot: CanvasSlot }
  | { kind: 'project'; project: ProjectDocument };

function stripIdentifierQuotes(raw: string): string {
  return raw
    .trim()
    .replace(/^[`"\[]+/, '')
    .replace(/[`"\]]+$/, '')
    .trim();
}

function extractTableBaseName(rawName: string): string {
  const parts = rawName.split('.').map(stripIdentifierQuotes).filter(Boolean);
  return parts[parts.length - 1] || stripIdentifierQuotes(rawName);
}

/**
 * Strip `-- ...`, `# ...`, and `/* ... *\/` SQL comments while preserving string literals.
 */
function stripSqlComments(sql: string): string {
  let out = '';
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inSingle) {
      out += ch;
      if (ch === '\\' && next) {
        out += next;
        i += 2;
        continue;
      }
      if (ch === "'" && next === "'") {
        out += next;
        i += 2;
        continue;
      }
      if (ch === "'") inSingle = false;
      i++;
      continue;
    }

    if (inDouble) {
      out += ch;
      if (ch === '"') inDouble = false;
      i++;
      continue;
    }

    if (inBacktick) {
      out += ch;
      if (ch === '`') inBacktick = false;
      i++;
      continue;
    }

    if (ch === "'") {
      inSingle = true;
      out += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      out += ch;
      i++;
      continue;
    }
    if (ch === '`') {
      inBacktick = true;
      out += ch;
      i++;
      continue;
    }

    // Block comment /* ... */
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) {
        if (sql[i] === '\n') out += '\n';
        i++;
      }
      i += 2;
      continue;
    }

    // Line comment -- or #
    if ((ch === '-' && next === '-') || ch === '#') {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }

    out += ch;
    i++;
  }

  return out;
}

/**
 * Split comma-separated SQL table body entries at parenthesis depth 0, respecting quotes.
 */
function splitTopLevelCommas(body: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    const next = body[i + 1];

    if (inSingle) {
      current += ch;
      if (ch === '\\' && next) {
        current += next;
        i++;
      } else if (ch === "'" && next === "'") {
        current += next;
        i++;
      } else if (ch === "'") {
        inSingle = false;
      }
      continue;
    }
    if (inDouble) {
      current += ch;
      if (ch === '"') inDouble = false;
      continue;
    }
    if (inBacktick) {
      current += ch;
      if (ch === '`') inBacktick = false;
      continue;
    }

    if (ch === "'") inSingle = true;
    else if (ch === '"') inDouble = true;
    else if (ch === '`') inBacktick = true;
    else if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === ',' && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    }

    current += ch;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

function extractParenBlock(sql: string, openIdx: number): { content: string; closeIdx: number } | null {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;

  for (let i = openIdx; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (inSingle) {
      if (ch === '\\' && next) i++;
      else if (ch === "'" && next === "'") i++;
      else if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '"') inDouble = false;
      continue;
    }
    if (inBacktick) {
      if (ch === '`') inBacktick = false;
      continue;
    }
    if (ch === "'") inSingle = true;
    else if (ch === '"') inDouble = true;
    else if (ch === '`') inBacktick = true;
    else if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) {
        return { content: sql.slice(openIdx + 1, i), closeIdx: i };
      }
    }
  }
  return null;
}

function parseColumnList(raw: string): string[] {
  return raw
    .split(',')
    .map((item) => stripIdentifierQuotes(item.replace(/\(\d+\)/g, '').replace(/\s+(ASC|DESC)\b/gi, '')))
    .filter(Boolean);
}

interface PendingForeignKey {
  childTable: string;
  childCol: string;
  parentTable: string;
  parentCol: string;
}

const TABLE_COLORS = ['violet', 'sky', 'emerald', 'amber', 'rose'] as const;

/**
 * Parse MySQL / PostgreSQL / SQLite `CREATE TABLE` DDL statements into DevDraw ER
 * entity cards (`er_main`) and field-level orthogonal foreign-key relations.
 */
export function importSqlDdlToSlot(
  rawSql: string,
  options: { startX?: number; startY?: number; idPrefix?: string } = {}
): SqlImportResult {
  const { startX = 60, startY = 60, idPrefix = `sql-${Date.now().toString(36)}` } = options;
  const cleaned = stripSqlComments(rawSql);
  const warnings: string[] = [];
  const nodes: EntityNode[] = [];
  const pendingFks: PendingForeignKey[] = [];
  const tableIdByName = new Map<string, string>();

  const headerRegex =
    /\bCREATE\s+(?:TEMP(?:ORARY)?\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"[\w.-]+)\s*\(/gi;

  let match: RegExpExecArray | null;
  let tableIdx = 0;

  while ((match = headerRegex.exec(cleaned)) !== null) {
    const rawTableName = match[1];
    const tableName = extractTableBaseName(rawTableName);
    const openIdx = match.index + match[0].length - 1;
    const block = extractParenBlock(cleaned, openIdx);
    if (!block) {
      warnings.push(`表 "${tableName}" 缺少闭合括号 ")"，已跳过`);
      continue;
    }

    // Inspect trailing table options up to `;` (e.g. COMMENT='...' or ENGINE=InnoDB)
    const afterClose = cleaned.slice(block.closeIdx + 1);
    const semiIdx = afterClose.indexOf(';');
    const tail = semiIdx >= 0 ? afterClose.slice(0, semiIdx) : afterClose.slice(0, 200);
    const tableCommentMatch = tail.match(/\bCOMMENT\s*=?\s*'((?:[^'\\]|\\.|'')*)'/i);
    const engineMatch = tail.match(/\bENGINE\s*=\s*([A-Za-z0-9_]+)/i);
    const tableComment = tableCommentMatch ? tableCommentMatch[1].replace(/''/g, "'") : '';

    const entries = splitTopLevelCommas(block.content);
    const fields: ErField[] = [];
    const pkCols = new Set<string>();
    const ukCols = new Set<string>();
    const fkCols = new Set<string>();

    for (const entry of entries) {
      const normalized = entry.replace(/\s+/g, ' ').trim();
      if (!normalized) continue;

      // Table-level PRIMARY KEY (...)
      const pkMatch = normalized.match(/^(?:CONSTRAINT\s+\S+\s+)?PRIMARY\s+KEY\s*\(([^)]+)\)/i);
      if (pkMatch) {
        for (const col of parseColumnList(pkMatch[1])) pkCols.add(col.toLowerCase());
        continue;
      }

      // Table-level UNIQUE [KEY|INDEX] [name] (...)
      const ukMatch = normalized.match(
        /^(?:CONSTRAINT\s+\S+\s+)?UNIQUE(?:\s+(?:KEY|INDEX))?(?:\s+[`"[\w-]+)?\s*\(([^)]+)\)/i
      );
      if (ukMatch) {
        for (const col of parseColumnList(ukMatch[1])) ukCols.add(col.toLowerCase());
        continue;
      }

      // Table-level FOREIGN KEY (col) REFERENCES parent(parent_col)
      const fkMatch = normalized.match(
        /^(?:CONSTRAINT\s+\S+\s+)?FOREIGN\s+KEY(?:\s+[`"[\w-]+)?\s*\(([^)]+)\)\s+REFERENCES\s+([`"[\w.-]+)\s*\(([^)]+)\)/i
      );
      if (fkMatch) {
        const childCols = parseColumnList(fkMatch[1]);
        const parentTable = extractTableBaseName(fkMatch[2]);
        const parentCols = parseColumnList(fkMatch[3]);
        childCols.forEach((c, idx) => {
          fkCols.add(c.toLowerCase());
          pendingFks.push({
            childTable: tableName.toLowerCase(),
            childCol: c,
            parentTable: parentTable.toLowerCase(),
            parentCol: parentCols[idx] || parentCols[0] || 'id',
          });
        });
        continue;
      }

      // Skip standalone INDEX / KEY / FULLTEXT / CHECK constraints
      if (/^(?:(?:FULLTEXT|SPATIAL)\s+)?(?:KEY|INDEX|CHECK|CONSTRAINT)\b/i.test(normalized)) {
        continue;
      }

      // Column definition: <col_name> <type[(...)]> [constraints...]
      const colMatch = normalized.match(
        /^([`"\[]?[A-Za-z_][A-Za-z0-9_$-]*[`"\]]?)\s+([A-Za-z][A-Za-z0-9_]*(?:\s*\([^)]+\))?(?:\s+UNSIGNED)?)(.*)$/i
      );
      if (!colMatch) {
        warnings.push(`表 "${tableName}" 中未识别的语句: ${normalized.slice(0, 40)}`);
        continue;
      }

      const colName = stripIdentifierQuotes(colMatch[1]);
      const colType = colMatch[2].replace(/\s+/g, ' ').trim().toUpperCase();
      const rest = colMatch[3] || '';

      let key: ErField['key'] = '';
      if (/\bPRIMARY\s+KEY\b/i.test(rest)) {
        key = 'PK';
        pkCols.add(colName.toLowerCase());
      } else if (/\bUNIQUE\b/i.test(rest)) {
        key = 'UK';
        ukCols.add(colName.toLowerCase());
      }

      // Inline REFERENCES parent(col)
      const inlineRef = rest.match(/\bREFERENCES\s+([`"[\w.-]+)\s*\(([^)]+)\)/i);
      if (inlineRef) {
        if (!key) key = 'FK';
        fkCols.add(colName.toLowerCase());
        const parentTable = extractTableBaseName(inlineRef[1]);
        const parentCols = parseColumnList(inlineRef[2]);
        pendingFks.push({
          childTable: tableName.toLowerCase(),
          childCol: colName,
          parentTable: parentTable.toLowerCase(),
          parentCol: parentCols[0] || 'id',
        });
      }

      const colCommentMatch = rest.match(/\bCOMMENT\s+'((?:[^'\\]|\\.|'')*)'/i);
      const colNote = colCommentMatch ? colCommentMatch[1].replace(/''/g, "'") : undefined;

      fields.push({
        key,
        name: colName,
        type: colType.replace(/\s+/g, ''),
        note: colNote,
      });
    }

    // Apply table-level PK / FK / UK markers onto parsed columns
    for (const f of fields) {
      const lower = f.name.toLowerCase();
      if (pkCols.has(lower)) f.key = 'PK';
      else if (fkCols.has(lower)) f.key = 'FK';
      else if (ukCols.has(lower) && !f.key) f.key = 'UK';
    }

    const nodeId = `${idPrefix}-t${tableIdx + 1}`;
    const dslId = sanitizeDslId(tableName, `table_${tableIdx + 1}`);
    const col = tableIdx % 3;
    const row = Math.floor(tableIdx / 3);

    nodes.push({
      id: nodeId,
      dslId,
      kind: 'er_main',
      engine: 'relational',
      icon: 'table-2',
      tag: engineMatch ? `TABLE · ${engineMatch[1]}` : 'TABLE · SQL',
      title: tableName,
      note: tableComment,
      color: TABLE_COLORS[tableIdx % TABLE_COLORS.length],
      fields,
      x: startX + col * 340,
      y: startY + row * 280,
      pinned: false,
    });

    tableIdByName.set(tableName.toLowerCase(), nodeId);
    tableIdx++;
    headerRegex.lastIndex = block.closeIdx + 1;
  }

  // Convert parsed foreign keys into field-level orthogonal edges (parent.pk -> child.fk)
  const edges: RelationEdge[] = [];
  const seenEdgeKeys = new Set<string>();
  for (const fk of pendingFks) {
    const parentId = tableIdByName.get(fk.parentTable);
    const childId = tableIdByName.get(fk.childTable);
    if (!parentId || !childId) {
      warnings.push(`外键引用的表 "${fk.parentTable}" 未在本次 DDL 中定义`);
      continue;
    }
    const dedup = `${parentId}.${fk.parentCol}->${childId}.${fk.childCol}`;
    if (seenEdgeKeys.has(dedup)) continue;
    seenEdgeKeys.add(dedup);

    edges.push({
      id: `${idPrefix}-fk${edges.length + 1}`,
      from: parentId,
      fromField: fk.parentCol,
      to: childId,
      toField: fk.childCol,
      label: '1 : N',
      protocol: 'FK',
      routing: 'orthogonal',
    });
  }

  if (nodes.length === 0) {
    warnings.push('未检测到有效的 CREATE TABLE 语句');
  }

  return {
    nodes,
    edges,
    tableCount: nodes.length,
    relationCount: edges.length,
    warnings,
  };
}

/**
 * Import a DevDraw JSON document (either a single CanvasSlot or a full ProjectDocument).
 */
export function importDevDrawJson(rawJson: string): JsonImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('JSON 语法格式不正确，请检查引号或逗号');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('JSON 根节点必须是对象');
  }

  const obj = parsed as Record<string, unknown>;

  if (Array.isArray(obj.layers) && typeof obj.title === 'string') {
    return {
      kind: 'project',
      project: obj as unknown as ProjectDocument,
    };
  }

  if (Array.isArray(obj.nodes) && Array.isArray(obj.edges)) {
    const slot: CanvasSlot = {
      id: typeof obj.id === 'string' ? obj.id : `imported-${Date.now().toString(36)}`,
      name: typeof obj.name === 'string' ? obj.name : '导入画布',
      engine: obj.engine === 'relational' || obj.engine === 'redis' ? obj.engine : undefined,
      nodes: obj.nodes as EntityNode[],
      edges: obj.edges as RelationEdge[],
      flows: Array.isArray(obj.flows) ? (obj.flows as CanvasSlot['flows']) : [],
      freehand: Array.isArray(obj.freehand) ? (obj.freehand as CanvasSlot['freehand']) : undefined,
    };
    return { kind: 'slot', slot };
  }

  throw new Error('无法识别的 DevDraw JSON 结构（需要包含 nodes/edges 或 layers 字段）');
}

function unquoteMermaidLabel(raw: string): string {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function parseMermaidNodeToken(token: string): {
  id: string;
  title?: string;
  kind?: string;
  isAnnotation?: boolean;
} | null {
  const cleaned = token.trim();
  if (!cleaned) return null;

  const isAnnotation = /:::annotation\b/i.test(cleaned);
  const withoutClass = cleaned.replace(/:::[A-Za-z0-9_-]+/g, '').trim();

  // Cylinder DB: id[(label)]
  let m = withoutClass.match(/^([A-Za-z_][A-Za-z0-9_-]*)\[\((.+)\)\]$/);
  if (m) return { id: m[1], title: unquoteMermaidLabel(m[2]), kind: 'db', isAnnotation };

  // Stadium / Circle: id([label]) or id((label))
  m = withoutClass.match(/^([A-Za-z_][A-Za-z0-9_-]*)(?:\(\[(.+)\]\)|\(\((.+)\)\))$/);
  if (m) return { id: m[1], title: unquoteMermaidLabel(m[2] ?? m[3]), kind: 'ingress', isAnnotation };

  // Diamond / Hexagon: id{label} or id{{label}}
  m = withoutClass.match(/^([A-Za-z_][A-Za-z0-9_-]*)\{\{?(.+?)\}?\}$/);
  if (m) return { id: m[1], title: unquoteMermaidLabel(m[2]), kind: 'fsm_branch', isAnnotation };

  // Rectangle / Rounded: id[label] or id(label)
  m = withoutClass.match(/^([A-Za-z_][A-Za-z0-9_-]*)(?:\[(.+)\]|\((.+)\))$/);
  if (m) {
    return {
      id: m[1],
      title: unquoteMermaidLabel(m[2] ?? m[3]),
      kind: isAnnotation ? 'note' : 'service',
      isAnnotation,
    };
  }

  // Bare identifier
  m = withoutClass.match(/^([A-Za-z_][A-Za-z0-9_-]*)$/);
  if (m) return { id: m[1], isAnnotation };

  return null;
}

/**
 * Reverse-import Mermaid `flowchart` / `graph` or `erDiagram` markup into
 * editable DevDraw entities and relations.
 */
export function importMermaidToSlot(
  rawMermaid: string,
  options: { idPrefix?: string } = {}
): MermaidImportResult {
  const { idPrefix = `mmd-${Date.now().toString(36)}` } = options;
  const warnings: string[] = [];
  const lines = rawMermaid
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('%%'));

  const isEr = lines.some((l) => /^erDiagram\b/i.test(l));
  const nodes: EntityNode[] = [];
  const edges: RelationEdge[] = [];
  const nodeByMmdId = new Map<string, EntityNode>();

  if (isEr) {
    const ensureErTable = (name: string): EntityNode => {
      const key = name.trim();
      const existing = nodeByMmdId.get(key);
      if (existing) return existing;
      const idx = nodes.length;
      const node: EntityNode = {
        id: `${idPrefix}-er${idx + 1}`,
        dslId: sanitizeDslId(key, `table_${idx + 1}`),
        kind: 'er_main',
        engine: 'relational',
        icon: 'table-2',
        tag: 'TABLE · Mermaid',
        title: key,
        note: '',
        color: TABLE_COLORS[idx % TABLE_COLORS.length],
        fields: [],
        x: (idx % 3) * 320,
        y: Math.floor(idx / 3) * 260,
        pinned: false,
      };
      nodes.push(node);
      nodeByMmdId.set(key, node);
      return node;
    };

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (/^erDiagram\b/i.test(line)) {
        i++;
        continue;
      }

      // Entity block: users { ... }
      const blockMatch = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*\{$/);
      if (blockMatch) {
        const table = ensureErTable(blockMatch[1]);
        i++;
        while (i < lines.length && lines[i] !== '}') {
          const fm = lines[i].match(
            /^([^\s]+)\s+([A-Za-z_][A-Za-z0-9_-]*)(?:\s+(PK|FK|UK))?(?:\s+"([^"]*)")?$/i
          );
          if (fm) {
            table.fields = table.fields ?? [];
            table.fields.push({
              type: fm[1],
              name: fm[2],
              key: (fm[3]?.toUpperCase() as ErField['key']) || '',
              note: fm[4],
            });
          }
          i++;
        }
        i++;
        continue;
      }

      // ER relationship: A ||--o{ B : "label"
      const relMatch = line.match(
        /^([A-Za-z_][A-Za-z0-9_-]*)\s+([|o}][|o{]?)(--|\.\.)([|o{]?[|o{])\s+([A-Za-z_][A-Za-z0-9_-]*)(?:\s*:\s*(.+))?$/
      );
      if (relMatch) {
        const fromNode = ensureErTable(relMatch[1]);
        const leftCard = relMatch[2];
        const lineStyle = relMatch[3];
        const rightCard = relMatch[4];
        const toNode = ensureErTable(relMatch[5]);
        const rawLabel = relMatch[6] ? unquoteMermaidLabel(relMatch[6]) : '';
        const isManyLeft = leftCard.includes('}');
        const isManyRight = rightCard.includes('{');
        const cardLabel =
          isManyLeft && isManyRight
            ? 'N : M'
            : isManyLeft
              ? 'N : 1'
              : isManyRight
                ? '1 : N'
                : '1 : 1';
        edges.push({
          id: `${idPrefix}-e${edges.length + 1}`,
          from: fromNode.id,
          to: toNode.id,
          label: rawLabel || cardLabel,
          dashed: lineStyle === '..',
          routing: 'orthogonal',
        });
        i++;
        continue;
      }

      i++;
    }

    if (nodes.length === 0) warnings.push('未在 Mermaid erDiagram 中检测到实体定义');
    return {
      dialect: 'er',
      nodes,
      edges,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      warnings,
    };
  }

  // Flowchart / Graph dialect
  const ensureFlowNode = (token: string): EntityNode | null => {
    const parsed = parseMermaidNodeToken(token);
    if (!parsed) return null;
    const existing = nodeByMmdId.get(parsed.id);
    if (existing) {
      if (parsed.title && existing.title === parsed.id) {
        existing.title = parsed.title;
      }
      if (parsed.kind && existing.kind === 'service' && parsed.kind !== 'service') {
        existing.kind = parsed.kind;
        existing.tag = parsed.kind === 'db' ? 'Database' : parsed.kind === 'ingress' ? 'Ingress' : existing.tag;
        existing.color = parsed.kind === 'db' ? 'emerald' : parsed.kind === 'ingress' ? 'violet' : existing.color;
      }
      return existing;
    }

    const idx = nodes.length;
    const kind = parsed.kind || 'service';
    const isDb = kind === 'db';
    const isAnn = Boolean(parsed.isAnnotation);
    const node: EntityNode = {
      id: `${idPrefix}-n${idx + 1}`,
      dslId: sanitizeDslId(parsed.id, `node_${idx + 1}`),
      kind,
      title: parsed.title || parsed.id,
      tag: isAnn ? 'Note' : isDb ? 'Database' : kind === 'ingress' ? 'Ingress' : kind === 'fsm_branch' ? 'Decision' : 'Service',
      note: '',
      color: isAnn ? 'slate' : isDb ? 'emerald' : kind === 'ingress' ? 'violet' : TABLE_COLORS[idx % TABLE_COLORS.length],
      x: (idx % 3) * 300,
      y: Math.floor(idx / 3) * 180,
      pinned: false,
    };
    nodes.push(node);
    nodeByMmdId.set(parsed.id, node);
    return node;
  };

  for (const line of lines) {
    if (
      /^(?:flowchart|graph)\b/i.test(line) ||
      /^(?:subgraph|end|classDef|class|style|linkStyle|direction)\b/i.test(line)
    ) {
      continue;
    }

    // Edge forms:
    // 1) Inline labeled edge first: A -- label --> B  or  A -. label .-> B
    const inlineEdge = line.match(/^(.+?)\s+(--|-\.)\s+(.+?)\s+(-->|\.-?>)\s+(.+)$/);
    // 2) Standard / pipe labeled edge: A -->|label| B   or   A -.->|"label"| B   or   A ==>|label| B
    const pipeEdge = !inlineEdge
      ? line.match(/^(.+?)\s*(-->|-\.->|==>|---|-\.-)\s*(?:\|([^|]+)\|)?\s*(.+)$/)
      : null;

    if (pipeEdge) {
      const fromNode = ensureFlowNode(pipeEdge[1]);
      const arrow = pipeEdge[2];
      const label = pipeEdge[3] ? unquoteMermaidLabel(pipeEdge[3]) : '';
      const toNode = ensureFlowNode(pipeEdge[4]);
      if (fromNode && toNode) {
        edges.push({
          id: `${idPrefix}-e${edges.length + 1}`,
          from: fromNode.id,
          to: toNode.id,
          label,
          dashed: arrow.includes('.'),
          routing: 'bezier',
        });
      }
      continue;
    }

    if (inlineEdge) {
      const fromNode = ensureFlowNode(inlineEdge[1]);
      const dashed = inlineEdge[2].includes('.') || inlineEdge[4].includes('.');
      const label = unquoteMermaidLabel(inlineEdge[3]);
      const toNode = ensureFlowNode(inlineEdge[5]);
      if (fromNode && toNode) {
        edges.push({
          id: `${idPrefix}-e${edges.length + 1}`,
          from: fromNode.id,
          to: toNode.id,
          label,
          dashed,
          routing: 'bezier',
        });
      }
      continue;
    }

    // Standalone node declaration
    ensureFlowNode(line);
  }

  if (nodes.length === 0) {
    warnings.push('未检测到有效的 Mermaid 节点或连线定义');
  }

  return {
    dialect: 'flowchart',
    nodes,
    edges,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    warnings,
  };
}

