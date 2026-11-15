/**
 * 按数据库引擎区分的 SQL 类型目录。
 *
 * 为什么要有这一层：数据类型不是全局统一的——MySQL 有 enum/datetime，PostgreSQL 有
 * jsonb/inet/serial，SQLite 只有 integer/real/text/blob 几个亲和类。字段编辑器里的
 * 类型建议应当跟着「这张表归属哪个数据库实体」走，而不是给所有人同一份混合列表。
 *
 * 纯数据，无 UI 依赖：目录只作 datalist 建议，输入仍自由（引擎冷门类型不该被挡住）。
 */

export type EngineId = 'mysql' | 'postgresql' | 'sqlite' | 'sqlserver' | 'oracle' | 'redis' | 'generic';

const CATALOGS: Record<EngineId, string[]> = {
  mysql: [
    'bigint', 'int', 'mediumint', 'smallint', 'tinyint',
    'varchar', 'char', 'text', 'mediumtext', 'longtext',
    'decimal', 'float', 'double', 'boolean',
    'date', 'time', 'datetime', 'timestamp', 'year',
    'json', 'enum', 'set', 'binary', 'varbinary', 'blob',
  ],
  postgresql: [
    'bigint', 'int', 'smallint', 'serial', 'bigserial',
    'varchar', 'char', 'text',
    'decimal', 'numeric', 'real', 'double precision', 'boolean', 'bool',
    'date', 'time', 'timestamp', 'timestamptz', 'interval',
    'json', 'jsonb', 'uuid', 'bytea', 'inet', 'cidr', 'macaddr', 'xml', 'money', 'tsvector',
  ],
  sqlite: [
    'integer', 'int', 'bigint', 'real', 'double', 'float',
    'numeric', 'decimal', 'boolean',
    'text', 'varchar', 'char', 'blob',
    'date', 'datetime', 'timestamp', 'json',
  ],
  sqlserver: [
    'bigint', 'int', 'smallint', 'tinyint', 'bit',
    'decimal', 'numeric', 'money', 'float', 'real',
    'char', 'varchar', 'text', 'nchar', 'nvarchar', 'ntext',
    'date', 'time', 'datetime', 'datetime2', 'datetimeoffset',
    'uniqueidentifier', 'xml', 'varbinary',
  ],
  oracle: [
    'number', 'integer', 'float', 'binary_float', 'binary_double',
    'char', 'varchar2', 'nchar', 'nvarchar2', 'clob', 'nclob', 'blob',
    'date', 'timestamp', 'interval', 'raw', 'rowid',
  ],
  // Redis 没有 SQL 类型：hash 字段的「类型」是值序列化约定，目录给常用几种。
  redis: ['string', 'number', 'json', 'boolean', 'timestamp', 'binary'],
  generic: [
    'bigint', 'int', 'smallint', 'varchar', 'char', 'text',
    'decimal', 'numeric', 'boolean',
    'date', 'time', 'timestamp', 'json', 'blob', 'uuid',
  ],
};

const LABELS: Record<EngineId, string> = {
  mysql: 'MySQL',
  postgresql: 'PostgreSQL',
  sqlite: 'SQLite',
  sqlserver: 'SQL Server',
  oracle: 'Oracle',
  redis: 'Redis',
  generic: '通用 SQL',
};

/** 引擎输入框的 datalist 建议：覆盖常见关系库 + 内存/分析库，输入仍自由。 */
export const ENGINE_SUGGESTIONS = [
  'MySQL', 'PostgreSQL', 'SQLite', 'SQL Server', 'Oracle',
  'Redis', 'MongoDB', 'ClickHouse', 'Elasticsearch',
];

/** 引擎别名归一：MariaDB 走 MySQL 目录，pg/postgres 走 PostgreSQL，未知引擎退回通用 SQL。 */
export function normalizeEngine(engine?: string): EngineId {
  const e = (engine ?? '').trim().toLowerCase();
  if (!e) return 'generic';
  if (e === 'mysql' || e === 'mariadb') return 'mysql';
  if (e === 'postgres' || e === 'postgresql' || e === 'pg') return 'postgresql';
  if (e === 'sqlite' || e === 'sqlite3') return 'sqlite';
  if (e === 'sqlserver' || e === 'mssql' || e === 'sql server') return 'sqlserver';
  if (e === 'oracle') return 'oracle';
  if (e === 'redis' || e === 'keydb' || e === 'valkey') return 'redis';
  return 'generic';
}

/** 展示标签：已知引擎用规范名；未知引擎原样展示（Redis/ClickHouse…，类型建议退通用）；空用「通用 SQL」。 */
export function engineLabel(engine?: string): string {
  const e = (engine ?? '').trim();
  if (!e) return LABELS.generic;
  const id = normalizeEngine(e);
  return id === 'generic' ? e : LABELS[id];
}

/** 该引擎的常用类型建议（datalist 用，顺序即常见度）。 */
export function sqlTypesForEngine(engine?: string): string[] {
  return CATALOGS[normalizeEngine(engine)];
}
