import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { newEdgeId, newNodeId, slugify } from '../id';
import { applyPatchChecked, applyPatchesChecked } from '../patch';
import { deserializeModel, deserializeViews, serializeModel, serializeViews } from '../serialize';
import { sampleThreeLensModel } from '../sample-three-lens';
import { MemoryStore } from '../store/memory';
import { packProject, unpackProject } from '../store/zip';
import { checkIntegrity, isIntact } from '../validate';

describe('id 生成（协作隐患②：name 与 id 分离，全局唯一）', () => {
  it('节点 id 带类型前缀且唯一', () => {
    const a = newNodeId('Service');
    const b = newNodeId('Service');
    expect(a).toMatch(/^svc_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(a).not.toBe(b);
  });

  it('同一毫秒内批量生成仍唯一（单调自增）', () => {
    const now = 1700000000000;
    const ids = new Set(Array.from({ length: 1000 }, () => newNodeId('State', now)));
    expect(ids.size).toBe(1000);
  });

  it('边 id 带类型前缀', () => {
    expect(newEdgeId('transition')).toMatch(/^tr_/);
    expect(newEdgeId('fk')).toMatch(/^fk_/);
  });

  it('slugify 仅用于展示，保留 unicode', () => {
    expect(slugify('Order Service')).toBe('order-service');
    expect(slugify('订单服务')).toBe('订单服务');
    expect(slugify('  ')).toBe('untitled');
  });
});

describe('稳定序列化（git 友好硬约束）', () => {
  it('键序固定 + 结尾换行 + 往返一致', () => {
    const text = serializeModel(sampleThreeLensModel);
    expect(text.endsWith('\n')).toBe(true);
    expect(text.indexOf('"schemaVersion"')).toBeLessThan(text.indexOf('"name"'));
    expect(text.indexOf('"name"')).toBeLessThan(text.indexOf('"nodes"'));
    expect(text.indexOf('"nodes"')).toBeLessThan(text.indexOf('"edges"'));
    const back = deserializeModel(text);
    expect(back).toEqual(sampleThreeLensModel);
  });

  it('对象插入顺序不影响序列化结果（map 按键排序）', () => {
    const m1 = { ...sampleThreeLensModel, nodes: { ...sampleThreeLensModel.nodes } };
    const reversed: typeof m1.nodes = {};
    for (const k of Object.keys(m1.nodes).reverse()) reversed[k] = m1.nodes[k];
    const m2 = { ...sampleThreeLensModel, nodes: reversed };
    expect(serializeModel(m1)).toBe(serializeModel(m2));
  });

  it('拒绝错误 schemaVersion', () => {
    expect(() => deserializeModel('{"schemaVersion":2,"name":"x","nodes":{},"edges":{}}')).toThrow(/schemaVersion/);
  });

  it('views 往返一致', () => {
    const views = { architecture: { positions: { n_order: { x: 1, y: 2 } } } };
    expect(deserializeViews(serializeViews(views))).toEqual(views);
  });

  it('折叠状态跟着 views 一起落盘、一起读回', () => {
    const views = { er: { positions: {}, folded: { t_audit_log: false, t_shipments: true } } };
    const back = deserializeViews(serializeViews(views));
    expect(back.er.folded).toEqual({ t_audit_log: false, t_shipments: true });
  });
});

describe('完整性守门（协作隐患①：字节不打架 ≠ 语义对）', () => {
  it('sample 模型完整', () => {
    expect(isIntact(sampleThreeLensModel)).toBe(true);
    expect(checkIntegrity(sampleThreeLensModel)).toEqual([]);
  });

  it('remove-node 级联删边后仍完整', () => {
    const next = applyPatchChecked(sampleThreeLensModel, { op: 'remove-node', id: 'n_payment' });
    expect(isIntact(next)).toBe(true);
    expect(next.nodes.n_payment).toBeUndefined();
  });

  it('add-edge 指向不存在节点被拒', () => {
    expect(() =>
      applyPatchChecked(sampleThreeLensModel, {
        op: 'add-edge',
        id: 'e_bad',
        edge: { type: 'calls', from: 'n_order', to: 'n_ghost' },
      }),
    ).toThrow(/endpoint not found/);
  });

  it('直接构造悬空边能被 checkIntegrity 抓住（CRDT 合并后体检）', () => {
    const broken = {
      ...sampleThreeLensModel,
      edges: {
        ...sampleThreeLensModel.edges,
        e_dangling: { type: 'calls' as const, from: 'n_order', to: 'n_deleted' },
      },
    };
    const issues = checkIntegrity(broken);
    expect(issues.some((i) => i.kind === 'dangling-edge' && i.edgeId === 'e_dangling')).toBe(true);
  });

  it('applyPatchesChecked 整批校验', () => {
    const id = newNodeId('Service');
    const next = applyPatchesChecked(sampleThreeLensModel, [
      { op: 'add-node', id, node: { type: 'Service', name: '履约服务' } },
      { op: 'add-edge', id: newEdgeId('calls'), edge: { type: 'calls', from: 'n_order', to: id } },
    ]);
    expect(isIntact(next)).toBe(true);
    expect(next.nodes[id].name).toBe('履约服务');
  });
});

describe('Store 读写层（单文件起步，可逆拆分）', () => {
  it('MemoryStore 保存/读取往返', async () => {
    const store = new MemoryStore();
    expect(await store.load()).toBeNull();
    const snap = { model: sampleThreeLensModel, views: {} };
    await store.save(snap);
    const loaded = await store.load();
    expect(loaded?.model).toEqual(sampleThreeLensModel);
    expect(store.autoSave).toBe(false);
  });

  it('zip 打包/解包同构（与 FSA 产出同一文件夹结构）', () => {
    const snap = { model: sampleThreeLensModel, views: { er: { positions: { t_orders: { x: 0, y: 0 } } } } };
    const bytes = packProject(snap);
    const back = unpackProject(bytes);
    expect(back.model).toEqual(snap.model);
    expect(back.views).toEqual(snap.views);
  });

  it('zip 缺 model.json 报错', () => {
    const bad = zipSync({ 'readme.txt': strToU8('hi') });
    expect(() => unpackProject(bad)).toThrow(/missing model.json/);
  });
});
