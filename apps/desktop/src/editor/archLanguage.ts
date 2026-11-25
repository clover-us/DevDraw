import {
  autocompletion,
  snippetCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { StreamLanguage, type StringStream } from '@codemirror/language';
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import { RangeSetBuilder, StateEffect, StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
import { ALL_PRIMITIVES, parseArchDsl, type EntityNode } from '@devdraw/core';

const ENTITY_KINDS = new Set<string>([
  ...ALL_PRIMITIVES.map((p) => p.kind),
  'er_table',
  'store_kv',
  'ddd_context',
  'fsm_state',
  'pipeline_stage',
  'store_ref',
  'annotation',
]);

const STRUCTURAL_KEYWORDS = new Set<string>([
  'flow',
  'fields',
  'desc',
  'parallel',
  'async',
  'orthogonal',
  'bezier',
  'circuitBreaker',
]);

const PROPERTY_KEYS = new Set<string>([
  'tag',
  'tech',
  'spec',
  'aggregate',
  'complexity',
  'color',
  'owner',
  'note',
  'summary',
  'status',
  'state_role',
  'tags',
  'ttl',
  'policy',
  'size',
  'link',
  'drill',
  'ref',
  'repo',
  'docs',
  'adr',
  'dashboard',
  'timeout',
  'retry',
  'latency',
  'rationale',
]);

const ATOM_VALUES = new Set<string>([
  'violet',
  'sky',
  'emerald',
  'amber',
  'rose',
  'slate',
  'active',
  'planned',
  'deprecated',
  'initial',
  'terminal',
  'PK',
  'FK',
  'UK',
]);

const DATA_TYPES = new Set<string>([
  'BIGINT',
  'INT',
  'INTEGER',
  'SMALLINT',
  'TINYINT',
  'VARCHAR',
  'TEXT',
  'UUID',
  'JSONB',
  'JSON',
  'TIMESTAMP',
  'DATETIME',
  'DATE',
  'BOOLEAN',
  'BOOL',
  'DECIMAL',
  'FLOAT',
  'DOUBLE',
  'string',
  'hash',
  'zset',
  'list',
  'set',
  'stream',
]);

interface ArchStreamState {
  braceDepth: number;
  inFields: boolean;
}

/**
 * Dedicated CodeMirror 6 StreamLanguage for DevDraw `.arch` DSL.
 */
export const archStreamLanguage = StreamLanguage.define<ArchStreamState>({
  name: 'arch',
  startState: () => ({ braceDepth: 0, inFields: false }),
  token(stream: StringStream, state: ArchStreamState): string | null {
    if (stream.eatSpace()) return null;

    // Line comments: // ... or # ...
    if (stream.match('//') || stream.peek() === '#') {
      stream.skipToEnd();
      return 'comment';
    }

    // Quoted strings with escape support
    if (stream.peek() === '"') {
      stream.next();
      let escaped = false;
      while (!stream.eol()) {
        const ch = stream.next();
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          break;
        }
      }
      return 'string';
    }

    // Arrows: -> and ~>
    if (stream.match('->') || stream.match('~>')) {
      return 'operator';
    }

    // Braces & brackets
    if (stream.eat('{')) {
      state.braceDepth++;
      return 'brace';
    }
    if (stream.eat('}')) {
      if (state.inFields && state.braceDepth <= 2) {
        state.inFields = false;
      }
      state.braceDepth = Math.max(0, state.braceDepth - 1);
      return 'brace';
    }
    if (stream.eat('[') || stream.eat(']')) {
      return 'squareBracket';
    }
    if (stream.eat(':') || stream.eat('.') || stream.eat(',')) {
      return 'punctuation';
    }

    // Numbers (step order, retry count, etc.)
    if (stream.match(/^\d+/)) {
      return 'number';
    }

    // Identifiers, keywords, entity kinds, property names, field types
    if (stream.match(/^[A-Za-z_][A-Za-z0-9_-]*/)) {
      const word = stream.current();
      if (word === 'fields') {
        state.inFields = true;
        return 'keyword';
      }
      if (STRUCTURAL_KEYWORDS.has(word)) {
        return 'keyword';
      }
      if (ATOM_VALUES.has(word)) {
        return 'atom';
      }
      if (state.inFields) {
        if (DATA_TYPES.has(word)) return 'typeName';
        return 'variableName';
      }
      if (state.braceDepth === 0 && ENTITY_KINDS.has(word)) {
        return 'definitionKeyword';
      }
      if (state.braceDepth > 0 && PROPERTY_KEYS.has(word)) {
        return 'propertyName';
      }
      if (DATA_TYPES.has(word)) {
        return 'typeName';
      }
      return 'variableName';
    }

    stream.next();
    return null;
  },
});

const PROPERTY_COMPLETIONS: Completion[] = [
  snippetCompletion('tag "${标签}"', { label: 'tag', type: 'property', detail: '层级 / 类型标签' }),
  snippetCompletion('tech "${Go / gRPC}"', { label: 'tech', type: 'property', detail: '技术栈' }),
  snippetCompletion('note "${推演说明}"', { label: 'note', type: 'property', detail: '推演备注' }),
  snippetCompletion('summary "${一句话摘要}"', { label: 'summary', type: 'property', detail: '节点摘要' }),
  snippetCompletion('color ${violet}', { label: 'color', type: 'property', detail: '语义主题色' }),
  snippetCompletion('owner "${@team}"', { label: 'owner', type: 'property', detail: '负责人 / 团队' }),
  snippetCompletion('status ${planned}', { label: 'status', type: 'property', detail: '状态 active|planned|deprecated' }),
  snippetCompletion('spec "${4C8G · HPA}"', { label: 'spec', type: 'property', detail: '部署规格' }),
  snippetCompletion('aggregate "${Order}"', { label: 'aggregate', type: 'property', detail: 'DDD 聚合根' }),
  snippetCompletion('complexity "${O(N log N)}"', { label: 'complexity', type: 'property', detail: '算法复杂度' }),
  snippetCompletion('state_role ${active}', { label: 'state_role', type: 'property', detail: '状态角色 initial|active|terminal' }),
  snippetCompletion('ttl "${3600s}"', { label: 'ttl', type: 'property', detail: '缓存过期时间' }),
  snippetCompletion('policy "${allkeys-lru}"', { label: 'policy', type: 'property', detail: '缓存淘汰策略' }),
  snippetCompletion('link ${target_id}', { label: 'link', type: 'property', detail: '绑定目标实体（标注卡）' }),
  snippetCompletion('drill ${layer_id}', { label: 'drill', type: 'property', detail: '双击下钻目标层' }),
  snippetCompletion('fields {\n    ${id}: BIGINT [PK] "主键"\n  }', {
    label: 'fields',
    type: 'keyword',
    detail: 'ER / Redis 字段定义块',
  }),
];

const EDGE_ATTR_COMPLETIONS: Completion[] = [
  { label: 'HTTPS', type: 'constant', detail: '通信协议' },
  { label: 'gRPC', type: 'constant', detail: '通信协议' },
  { label: 'Kafka', type: 'constant', detail: '异步消息' },
  { label: 'SQL', type: 'constant', detail: '数据库查询' },
  { label: 'Redis', type: 'constant', detail: '缓存访问' },
  { label: 'orthogonal', type: 'keyword', detail: '正交折线路由' },
  { label: 'bezier', type: 'keyword', detail: '贝塞尔曲线路由' },
  { label: 'async', type: 'keyword', detail: '异步虚线' },
  snippetCompletion('timeout: "${3s}"', { label: 'timeout', type: 'property', detail: '超时配置' }),
  snippetCompletion('retry: ${3}', { label: 'retry', type: 'property', detail: '重试次数' }),
  { label: 'circuitBreaker', type: 'keyword', detail: '熔断保护' },
  snippetCompletion('latency: "${15ms}"', { label: 'latency', type: 'property', detail: '链路步骤耗时' }),
  snippetCompletion('rationale: "${设计原因}"', { label: 'rationale', type: 'property', detail: '步骤推演依据' }),
  { label: 'parallel', type: 'keyword', detail: '并行步骤' },
];

const COLOR_COMPLETIONS: Completion[] = [
  { label: 'violet', type: 'enum', detail: '紫色（核心/网关）' },
  { label: 'sky', type: 'enum', detail: '天蓝（服务/组件）' },
  { label: 'emerald', type: 'enum', detail: '翠绿（存储/决策）' },
  { label: 'amber', type: 'enum', detail: '琥珀（假设/队列）' },
  { label: 'rose', type: 'enum', detail: '玫红（告警/缓存）' },
  { label: 'slate', type: 'enum', detail: '灰蓝（引用/笔记）' },
];

const STATUS_COMPLETIONS: Completion[] = [
  { label: 'active', type: 'enum', detail: '已上线 / 活跃' },
  { label: 'planned', type: 'enum', detail: '规划演进中' },
  { label: 'deprecated', type: 'enum', detail: '即将下线' },
];

const STATE_ROLE_COMPLETIONS: Completion[] = [
  { label: 'initial', type: 'enum', detail: '初始状态' },
  { label: 'active', type: 'enum', detail: '流转中间态' },
  { label: 'terminal', type: 'enum', detail: '终止状态' },
];

function computeBraceDepthBefore(docText: string, pos: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < pos && i < docText.length; i++) {
    const ch = docText[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') depth = Math.max(0, depth - 1);
  }
  return depth;
}

/**
 * Context-aware autocompletion for `.arch` DSL:
 * - Primitive kinds & snippets at top level
 * - Existing entity `dslId`s after `->`, `~>`, `link `, or top-level relation starts
 * - Entity fields after `entityId.`
 * - Property keys inside entity blocks
 * - Enum values for `color`, `status`, `state_role`, and `[...]` attributes
 */
export function createArchAutocompletion(getNodes: () => EntityNode[]): Extension {
  const source = (context: CompletionContext): CompletionResult | null => {
    const line = context.state.doc.lineAt(context.pos);
    const beforeCursor = line.text.slice(0, context.pos - line.from);
    const nodes = getNodes();

    const entityCompletions: Completion[] = nodes.map((n) => ({
      label: n.dslId || n.id,
      type: 'variable',
      detail: `${n.title} (${n.kind})`,
    }));

    // 1. Field access after `entityId.`
    const dotMatch = beforeCursor.match(/([A-Za-z_][A-Za-z0-9_-]*)\.([A-Za-z0-9_]*)$/);
    if (dotMatch) {
      const entityKey = dotMatch[1];
      const target = nodes.find((n) => n.dslId === entityKey || n.id === entityKey);
      if (target?.fields && target.fields.length > 0) {
        return {
          from: context.pos - dotMatch[2].length,
          options: target.fields.map((f) => ({
            label: f.name,
            type: 'property',
            detail: `${f.type}${f.key ? ` [${f.key}]` : ''}`,
          })),
        };
      }
    }

    // 2. Inside `[...]` attributes
    if (/\[[^\]]*$/.test(beforeCursor)) {
      const word = context.matchBefore(/[A-Za-z_]*/);
      return {
        from: word ? word.from : context.pos,
        options: EDGE_ATTR_COMPLETIONS,
      };
    }

    // 3. After `color `, `status `, `state_role `
    if (/^\s*color\s+[A-Za-z]*$/.test(beforeCursor)) {
      const word = context.matchBefore(/[A-Za-z]*$/);
      return { from: word ? word.from : context.pos, options: COLOR_COMPLETIONS };
    }
    if (/^\s*status\s+[A-Za-z]*$/.test(beforeCursor)) {
      const word = context.matchBefore(/[A-Za-z]*$/);
      return { from: word ? word.from : context.pos, options: STATUS_COMPLETIONS };
    }
    if (/^\s*state_role\s+[A-Za-z]*$/.test(beforeCursor)) {
      const word = context.matchBefore(/[A-Za-z]*$/);
      return { from: word ? word.from : context.pos, options: STATE_ROLE_COMPLETIONS };
    }

    // 4. After `-> `, `~> `, `link `, or step number `1: `
    if (/(?:->|~>|\blink|\b\d+\s*:)\s+[A-Za-z0-9_-]*$/.test(beforeCursor)) {
      const word = context.matchBefore(/[A-Za-z0-9_-]*$/);
      return {
        from: word ? word.from : context.pos,
        options: entityCompletions,
      };
    }

    const word = context.matchBefore(/[A-Za-z_][A-Za-z0-9_-]*/);
    if (!word && !context.explicit) return null;

    const depth = computeBraceDepthBefore(context.state.doc.toString(), context.pos);

    // 5. Inside entity/flow block: property keys
    if (depth > 0) {
      return {
        from: word ? word.from : context.pos,
        options: PROPERTY_COMPLETIONS,
      };
    }

    // 6. Top-level: primitive kinds + flow snippet + existing entity IDs (to start relations)
    const kindCompletions: Completion[] = [
      ...ALL_PRIMITIVES.map((p) =>
        snippetCompletion(`${p.kind} \${${p.kind}_1} "\${${p.label}}" {\n  note "\${}"\n}`, {
          label: p.kind,
          type: 'class',
          detail: `${p.label} [${p.badge}]`,
          info: p.desc,
        })
      ),
      snippetCompletion('flow ${main_flow} "${核心请求链路}" {\n  1: ${src} -> ${dst} "${调用说明}" [latency: "12ms"]\n}', {
        label: 'flow',
        type: 'keyword',
        detail: '动态推演链路脚本',
      }),
    ];

    return {
      from: word ? word.from : context.pos,
      options: [...kindCompletions, ...entityCompletions],
    };
  };

  return autocompletion({
    override: [source],
    activateOnTyping: true,
    maxRenderedOptions: 20,
  });
}

/**
 * Live CodeMirror 6 linter backed directly by `@devdraw/core`'s `parseArchDsl`.
 */
export function createArchLinter(): Extension {
  return [
    lintGutter(),
    linter(
      (view) => {
        const text = view.state.doc.toString();
        const parsed = parseArchDsl(text);
        const diagnostics: Diagnostic[] = [];
        const lineCount = view.state.doc.lines;

        for (const d of parsed.diagnostics) {
          const safeLine = Math.min(Math.max(1, d.line), lineCount);
          const lineInfo = view.state.doc.line(safeLine);
          diagnostics.push({
            from: lineInfo.from,
            to: Math.max(lineInfo.from, lineInfo.to),
            severity: d.severity,
            message: d.message,
          });
        }
        return diagnostics;
      },
      { delay: 250 }
    ),
  ];
}

/**
 * Active-selection line range highlight (Canvas -> DSL visual link).
 */
export const setActiveDslLinesEffect = StateEffect.define<{
  startLine: number;
  endLine: number;
} | null>();

const activeLineDecoration = Decoration.line({
  attributes: {
    class: 'dd-dsl-linked-line',
  },
});

export const activeDslLinesField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    let next = decorations.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setActiveDslLinesEffect)) {
        if (!effect.value) {
          next = Decoration.none;
        } else {
          const builder = new RangeSetBuilder<Decoration>();
          const maxLine = tr.state.doc.lines;
          const start = Math.max(1, Math.min(effect.value.startLine, maxLine));
          const end = Math.max(start, Math.min(effect.value.endLine, maxLine));
          for (let l = start; l <= end; l++) {
            const lineInfo = tr.state.doc.line(l);
            builder.add(lineInfo.from, lineInfo.from, activeLineDecoration);
          }
          next = builder.finish();
        }
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export const archEditorTheme = EditorView.baseTheme({
  '.dd-dsl-linked-line': {
    backgroundColor: 'rgba(139, 92, 246, 0.14)',
    boxShadow: 'inset 2px 0 0 #8b5cf6',
  },
});
