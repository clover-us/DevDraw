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
