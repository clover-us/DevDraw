import { describe, expect, it } from 'vitest';
import { engineLabel, normalizeEngine, sqlTypesForEngine } from '../sqlTypes';

describe('按引擎的 SQL 类型目录', () => {
  it('引擎别名归一', () => {
    expect(normalizeEngine('MySQL')).toBe('mysql');
    expect(normalizeEngine('mariadb')).toBe('mysql');
    expect(normalizeEngine('PostgreSQL')).toBe('postgresql');
    expect(normalizeEngine('postgres')).toBe('postgresql');
    expect(normalizeEngine('pg')).toBe('postgresql');
    expect(normalizeEngine('SQLite3')).toBe('sqlite');
    expect(normalizeEngine('SQL Server')).toBe('sqlserver');
    expect(normalizeEngine('mssql')).toBe('sqlserver');
    expect(normalizeEngine('Oracle')).toBe('oracle');
    expect(normalizeEngine('Redis')).toBe('redis');
    expect(normalizeEngine('keydb')).toBe('redis');
    expect(normalizeEngine('valkey')).toBe('redis');
    expect(normalizeEngine('')).toBe('generic');
    expect(normalizeEngine(undefined)).toBe('generic');
    expect(normalizeEngine('cockroachdb')).toBe('generic');
  });

  it('各引擎目录带自己的特征类型，不混用', () => {
    const mysql = sqlTypesForEngine('MySQL');
    const pg = sqlTypesForEngine('PostgreSQL');
    const sqlite = sqlTypesForEngine('sqlite');
    expect(mysql).toContain('enum');
    expect(mysql).toContain('datetime');
    expect(mysql).not.toContain('jsonb');
    expect(pg).toContain('jsonb');
    expect(pg).toContain('inet');
    expect(pg).toContain('timestamptz');
    expect(pg).not.toContain('enum');
    expect(sqlite).toContain('integer');
    expect(sqlite).toContain('blob');
    expect(sqlite).not.toContain('varchar2');
  });

  it('未知引擎退回通用 SQL，仍含常见类型', () => {
    const generic = sqlTypesForEngine('whatever');
    expect(generic).toContain('varchar');
    expect(generic).toContain('timestamp');
    expect(engineLabel('whatever')).toBe('whatever'); // 未知引擎原样展示，类型建议退通用
    expect(engineLabel('Redis')).toBe('Redis');
    expect(engineLabel('pg')).toBe('PostgreSQL');
    expect(engineLabel(undefined)).toBe('通用 SQL');
  });

  it('示例 audit_log 的既有类型都在 PostgreSQL 目录里（建议不脱节）', () => {
    const pg = sqlTypesForEngine('PostgreSQL');
    for (const t of ['bigint', 'varchar', 'inet', 'jsonb', 'timestamptz', 'bool']) {
      expect(pg).toContain(t);
    }
  });
});
