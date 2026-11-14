import { describe, expect, it } from 'vitest';
import type { ComponentDef, Model } from '../types';
import {
  BUILTIN_COMPONENTS,
  componentCatalog,
  nodeComponent,
  nodeFromComponent,
  nodeGlyph,
  resolveComponent,
} from '../components';
import { applyPatch, applyPatchChecked } from '../patch';
import { deserializeModel, serializeModel } from '../serialize';

function baseModel(): Model {
  return {
    schemaVersion: 1,
    name: 'test',
    nodes: {
      n_svc: { type: 'Service', name: '订单服务' },
      n_db: { type: 'Database', name: '订单库', attrs: { component: 'mysql', icon: 'relational-db' } },
    },
    edges: {},
  };
}

const custom: ComponentDef = {
  id: 'comp_clickhouse',
  name: 'ClickHouse',
  baseType: 'Database',
  icon: 'database',
  category: 'data',
  description: '列式分析库',
};

describe('组件目录', () => {
  it('内置目录非空且都映射到合法语义底座', () => {
    expect(BUILTIN_COMPONENTS.length).toBeGreaterThan(20);
    for (const c of BUILTIN_COMPONENTS) {
      expect(c.id).toBeTruthy();
      expect(c.icon).toBeTruthy();
      expect(c.baseType).toBeTruthy();
    }
  });

  it('catalog = 内置 + 自定义；自定义可覆盖同 id 内置', () => {
    const m = baseModel();
    expect(componentCatalog(m).length).toBe(BUILTIN_COMPONENTS.length);
    const withCustom: Model = { ...m, components: { [custom.id]: custom } };
    expect(componentCatalog(withCustom).length).toBe(BUILTIN_COMPONENTS.length + 1);
    const override: Model = { ...m, components: { redis: { ...custom, id: 'redis', name: '我的Redis' } } };
    const cat = componentCatalog(override);
    expect(cat.length).toBe(BUILTIN_COMPONENTS.length);
    expect(cat.find((c) => c.id === 'redis')?.name).toBe('我的Redis');
  });

  it('resolveComponent 自定义优先', () => {
    const m: Model = { ...baseModel(), components: { redis: { ...custom, id: 'redis', name: 'X' } } };
    expect(resolveComponent(m, 'redis')?.name).toBe('X');
    expect(resolveComponent(m, 'kafka')?.baseType).toBe('Queue');
    expect(resolveComponent(m, 'nope')).toBeUndefined();
    expect(resolveComponent(m, undefined)).toBeUndefined();
  });
});

describe('节点图标解析', () => {
  it('attrs.icon 快照优先于组件与类型兜底', () => {
    const m = baseModel();
    expect(nodeGlyph(m, m.nodes.n_db)).toBe('relational-db');
    expect(nodeGlyph(m, { type: 'Database', name: 'x', attrs: { icon: 'cache' } })).toBe('cache');
  });

  it('无快照时用组件图标，再用语义类型兜底', () => {
    const m: Model = { ...baseModel(), components: { [custom.id]: custom } };
    expect(nodeGlyph(m, { type: 'Database', name: 'x', attrs: { component: custom.id } })).toBe('database');
    expect(nodeGlyph(m, { type: 'Queue', name: 'q' })).toBe('queue');
    expect(nodeGlyph(m, { type: 'Service', name: 's' })).toBe('service');
  });

  it('nodeFromComponent 快照 icon/component，语义底座稳定', () => {
    const node = nodeFromComponent(resolveComponent(baseModel(), 'redis')!);
    expect(node.type).toBe('Database');
    expect(node.attrs?.component).toBe('redis');
    expect(node.attrs?.icon).toBe('cache');
    expect(node.name).toBe('Redis');
    expect(nodeFromComponent(custom, '  ').name).toBe('ClickHouse');
  });

  it('nodeComponent 解析节点组件身份', () => {
    const m = baseModel();
    expect(nodeComponent(m, m.nodes.n_db)?.id).toBe('mysql');
    expect(nodeComponent(m, m.nodes.n_svc)).toBeUndefined();
  });
});

describe('组件补丁（applyPatch 咽喉点）', () => {
  it('add/update/remove-component 不可变且删组件不删节点', () => {
    const m0 = baseModel();
    const m1 = applyPatch(m0, { op: 'add-component', id: custom.id, component: custom });
    expect(m1.components?.[custom.id]?.name).toBe('ClickHouse');
    expect(m0.components).toBeUndefined(); // 入参不变

    const m2 = applyPatch(m1, { op: 'update-component', id: custom.id, component: { ...custom, name: 'CH' } });
    expect(m2.components?.[custom.id]?.name).toBe('CH');

    const m3 = applyPatch(m2, { op: 'remove-component', id: custom.id });
    expect(m3.components?.[custom.id]).toBeUndefined();
    expect(Object.keys(m3.nodes)).toEqual(['n_svc', 'n_db']); // 节点保留
  });

  it('重复 add / 缺失 update/remove 抛错', () => {
    const m = applyPatch(baseModel(), { op: 'add-component', id: custom.id, component: custom });
    expect(() => applyPatch(m, { op: 'add-component', id: custom.id, component: custom })).toThrow();
    expect(() => applyPatch(m, { op: 'update-component', id: 'nope', component: custom })).toThrow();
    expect(() => applyPatch(m, { op: 'remove-component', id: 'nope' })).toThrow();
  });

  it('applyPatchChecked 接受合法组件补丁', () => {
    const m = applyPatchChecked(baseModel(), { op: 'add-component', id: custom.id, component: custom });
    expect(m.components?.[custom.id]).toBeTruthy();
  });
});

describe('组件序列化（git 友好）', () => {
  it('components 往返保留，键序在 groups 之后', () => {
    const m: Model = { ...baseModel(), components: { [custom.id]: custom } };
    const text = serializeModel(m);
    expect(text.endsWith('\n')).toBe(true);
    const back = deserializeModel(text);
    expect(back.components?.[custom.id]?.name).toBe('ClickHouse');
    // 顶层键序：components 在 edges 之后
    expect(text.indexOf('"edges"')).toBeLessThan(text.indexOf('"components"'));
  });

  it('无 components 时不产生该键（不污染旧模型 diff）', () => {
    const text = serializeModel(baseModel());
    expect(text.includes('"components"')).toBe(false);
    expect(deserializeModel(text).components).toBeUndefined();
  });
});