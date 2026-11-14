/**
 * 最小建模 UX —— M0 第一刀：加节点 / 连边 / 改类型属性 / 删除。
 * 所有变更经 applyPatchChecked 咽喉点（唯一 id + 完整性守门）。
 * 刻意不做：自由手绘、自动布局、富属性编辑器（留待开发阶段由真实复杂度驱动）。
 */
import { useState } from 'react';
import { newEdgeId, newNodeId } from '../core/id';
import { applyPatchChecked } from '../core/patch';
import { EDGE_TYPES, NODE_TYPES } from '../core/registry';
import type { EdgeType, Model, NodeType } from '../core/types';

interface ModelPanelProps {
  model: Model;
  lensNodeTypes: NodeType[];
  selectedNode: string | null;
  selectedEdge: string | null;
  onChange: (next: Model) => void;
  onSelectNode: (id: string | null) => void;
}

const NODE_TYPE_LIST = Object.values(NODE_TYPES);
const EDGE_TYPE_LIST = Object.values(EDGE_TYPES);

export function ModelPanel({ model, lensNodeTypes, selectedNode, selectedEdge, onChange, onSelectNode }: ModelPanelProps) {
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<NodeType>(lensNodeTypes[0] ?? 'Service');
  const [edgeFrom, setEdgeFrom] = useState('');
  const [edgeTo, setEdgeTo] = useState('');
  const [edgeType, setEdgeType] = useState<EdgeType>('calls');
  const [error, setError] = useState<string | null>(null);

  const allowedTypes = NODE_TYPE_LIST.filter((t) => lensNodeTypes.includes(t.id));
  const nodeEntries = Object.entries(model.nodes).filter(([, n]) => lensNodeTypes.includes(n.type));

  const tryChange = (fn: () => Model) => {
    try {
      onChange(fn());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const addNode = () => {
    const name = newName.trim() || `新${NODE_TYPES[newType].label}`;
    const id = newNodeId(newType);
    tryChange(() => applyPatchChecked(model, { op: 'add-node', id, node: { type: newType, name, provenance: { by: 'human' } } }));
    setNewName('');
    onSelectNode(id);
  };

  const addEdge = () => {
    if (!edgeFrom || !edgeTo || edgeFrom === edgeTo) {
      setError('请选择不同的起点与终点');
      return;
    }
    const id = newEdgeId(edgeType);
    tryChange(() => applyPatchChecked(model, { op: 'add-edge', id, edge: { type: edgeType, from: edgeFrom, to: edgeTo } }));
  };

  const removeSelected = () => {
    if (selectedNode) tryChange(() => applyPatchChecked(model, { op: 'remove-node', id: selectedNode }));
    else if (selectedEdge) tryChange(() => applyPatchChecked(model, { op: 'remove-edge', id: selectedEdge }));
    onSelectNode(null);
  };

  const renameSelected = (name: string) => {
    if (selectedNode) tryChange(() => applyPatchChecked(model, { op: 'update-node', id: selectedNode, name }));
  };

  const selNode = selectedNode ? model.nodes[selectedNode] : null;

  return (
    <section className="dd-panel dd-model-panel">
      <h3>建模</h3>

      <div className="dd-model-row">
        <select value={newType} onChange={(e) => setNewType(e.target.value as NodeType)}>
          {allowedTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <input
          placeholder="名称（可重复，id 自动唯一）"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addNode()}
        />
        <button onClick={addNode}>＋节点</button>
      </div>

      <div className="dd-model-row">
        <select value={edgeFrom} onChange={(e) => setEdgeFrom(e.target.value)}>
          <option value="">起点…</option>
          {nodeEntries.map(([id, n]) => (
            <option key={id} value={id}>
              {n.name}
            </option>
          ))}
        </select>
        <select value={edgeType} onChange={(e) => setEdgeType(e.target.value as EdgeType)}>
          {EDGE_TYPE_LIST.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <select value={edgeTo} onChange={(e) => setEdgeTo(e.target.value)}>
          <option value="">终点…</option>
          {nodeEntries.map(([id, n]) => (
            <option key={id} value={id}>
              {n.name}
            </option>
          ))}
        </select>
        <button onClick={addEdge}>＋边</button>
      </div>

      {selNode && (
        <div className="dd-model-row">
          <span className="dd-muted">选中：</span>
          <input value={selNode.name} onChange={(e) => renameSelected(e.target.value)} />
          <button className="dd-danger" onClick={removeSelected}>
            删除
          </button>
        </div>
      )}
      {!selNode && selectedEdge && (
        <div className="dd-model-row">
          <span className="dd-muted">选中边 {selectedEdge}</span>
          <button className="dd-danger" onClick={removeSelected}>
            删除边
          </button>
        </div>
      )}

      {error && <p className="dd-model-error">{error}</p>}
      <p className="dd-muted">变更经 applyPatch 守门：悬空边/非法引用会被拒绝。id 全局唯一，name 可重复。</p>
    </section>
  );
}
