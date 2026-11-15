/**
 * entity-fields —— 实体「字段 / 连线」的共享构件，供只读抽屉与编辑弹窗复用。
 * 读 / 写分离后：抽屉用 *View（只读），NodeEditor 弹窗用 *Editor（可写）。
 * 同一份字段列表 / 牵连分析渲染逻辑只写一遍，避免两处口径漂移。
 */
import { useState, type ReactNode } from 'react';
import { nodeGlyph } from '../core/components';
import { columnImpact } from '../core/reasoners/er';
import { NODE_TYPES } from '../core/registry';
import type { Model, ModelNode } from '../core/types';
import { Glyph } from './glyphs';
import { nodeName } from './inspect';
import { PlusIcon } from './icons';

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="dd-drawer-section">
      <div className="dd-drawer-section-head">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function fieldsOf(model: Model, tableId: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const e of Object.values(model.edges)) {
    if (e.type === 'contains' && e.from === tableId && model.nodes[e.to]?.type === 'Field') out.push([e.to, model.nodes[e.to].name]);
  }
  return out;
}

/** 字段行列表（只读、可点击钻取）：Table 的读 / 写视图共用。 */
export function FieldRows({ model, tableId, onSelectField }: { model: Model; tableId: string; onSelectField: (id: string) => void }) {
  const fields = fieldsOf(model, tableId);
  return (
    <ul className="dd-field-list">
      {fields.map(([fid, name]) => {
        const f = model.nodes[fid];
        return (
          <li key={fid}>
            <button className="dd-field-item" onClick={() => onSelectField(fid)}>
              {typeof f.attrs?.key === 'string' && (
                <span className={`dd-key dd-key-${f.attrs.key.toLowerCase()}`}>{f.attrs.key}</span>
              )}
              <span className="dd-field-name">{name}</span>
              <span className="dd-field-type">{typeof f.attrs?.dataType === 'string' ? f.attrs.dataType : ''}</span>
              {f.attrs?.nullable === true && <span className="dd-nullable" title="可空">?</span>}
            </button>
          </li>
        );
      })}
      {fields.length === 0 && <li className="dd-empty">还没有字段。</li>}
    </ul>
  );
}

/** 只读：Table 的字段清单。 */
export function TableFieldsView({ model, tableId, onSelectField }: { model: Model; tableId: string; onSelectField: (id: string) => void }) {
  const fields = fieldsOf(model, tableId);
  return (
    <Section title={`字段（${fields.length}）`}>
      <FieldRows model={model} tableId={tableId} onSelectField={onSelectField} />
    </Section>
  );
}

/** 可写：Table 的字段清单 + 添加字段行（弹窗用）。 */
export function TableFieldsEditor({
  model,
  tableId,
  onSelectField,
  onAdd,
}: {
  model: Model;
  tableId: string;
  onSelectField: (id: string) => void;
  onAdd: (name: string, dataType: string) => void;
}) {
  const [fieldName, setFieldName] = useState('');
  const [fieldType, setFieldType] = useState('varchar');
  const fields = fieldsOf(model, tableId);
  const add = () => {
    onAdd(fieldName.trim() || 'new_field', fieldType || 'varchar');
    setFieldName('');
  };
  return (
    <Section title={`字段（${fields.length}）`}>
      <FieldRows model={model} tableId={tableId} onSelectField={onSelectField} />
      <div className="dd-connect-row">
        <input
          className="dd-input"
          placeholder="字段名"
          value={fieldName}
          onChange={(e) => setFieldName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <input
          className="dd-input dd-input-narrow"
          placeholder="类型"
          value={fieldType}
          onChange={(e) => setFieldType(e.target.value)}
        />
        <button className="dd-icon-add" onClick={add} title="添加字段">
          <PlusIcon size={16} />
        </button>
      </div>
    </Section>
  );
}

/** 只读：改 / 删此列会波及的外键与表。 */
export function ColumnImpactView({ model, fieldId }: { model: Model; fieldId: string }) {
  const impact = columnImpact(model, fieldId);
  return (
    <Section title="改列牵连">
      {impact.edgeIds.length === 0 ? (
        <p className="dd-muted">没有外键引用此列，改动不牵连其他表。</p>
      ) : (
        <>
          <p className="dd-muted">改 / 删此列会波及以下外键与表：</p>
          <ul className="dd-impact-list">
            {impact.edgeIds.map((eid, i) => (
              <li key={eid} className="dd-impact state-degraded">
                <div className="dd-impact-head">
                  <strong>{nodeName(model, impact.tableIds[i])}</strong>
                </div>
                <div className="dd-impact-path">
                  外键 {eid} · {model.edges[eid]?.attrs?.key}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}

/** 只读：Field 的属性 + 所属表 + 牵连。 */
export function FieldView({ model, fieldId, onSelectNode }: { model: Model; fieldId: string; onSelectNode: (id: string) => void }) {
  const f = model.nodes[fieldId];
  const owner = Object.values(model.edges).find((e) => e.type === 'contains' && e.to === fieldId)?.from;
  return (
    <>
      <Section title="字段属性">
        {owner && (
          <p className="dd-hint-text">
            所属表：
            <button className="dd-inline-link" onClick={() => onSelectNode(owner)}>
              {nodeName(model, owner)}
            </button>
          </p>
        )}
        <dl className="dd-comp-meta">
          <div>
            <dt>数据类型</dt>
            <dd>{typeof f.attrs?.dataType === 'string' ? f.attrs.dataType : '—'}</dd>
          </div>
          <div>
            <dt>键角色</dt>
            <dd>{typeof f.attrs?.key === 'string' && f.attrs.key ? f.attrs.key : '普通列'}</dd>
          </div>
          <div>
            <dt>可空</dt>
            <dd>{f.attrs?.nullable === true ? '是（NULL）' : '否'}</dd>
          </div>
        </dl>
      </Section>
      <ColumnImpactView model={model} fieldId={fieldId} />
    </>
  );
}

/** 可写：Field 的属性编辑 + 牵连（弹窗用）。 */
export function FieldEditor({
  model,
  fieldId,
  onSelectNode,
  updateNode,
}: {
  model: Model;
  fieldId: string;
  onSelectNode: (id: string) => void;
  updateNode: (id: string, attrs: Record<string, string | number | boolean>) => void;
}) {
  const f = model.nodes[fieldId];
  const owner = Object.values(model.edges).find((e) => e.type === 'contains' && e.to === fieldId)?.from;
  return (
    <>
      <Section title="字段属性">
        {owner && (
          <p className="dd-hint-text">
            所属表：
            <button className="dd-inline-link" onClick={() => onSelectNode(owner)}>
              {nodeName(model, owner)}
            </button>
          </p>
        )}
        <label className="dd-field-label">数据类型</label>
        <input
          className="dd-input"
          value={typeof f.attrs?.dataType === 'string' ? f.attrs.dataType : ''}
          onChange={(e) => updateNode(fieldId, { dataType: e.target.value })}
        />
        <label className="dd-field-label">键角色</label>
        <select
          className="dd-input"
          value={typeof f.attrs?.key === 'string' ? f.attrs.key : ''}
          onChange={(e) => updateNode(fieldId, { key: e.target.value })}
        >
          <option value="">普通列</option>
          <option value="PK">PK（主键）</option>
          <option value="FK">FK（外键）</option>
        </select>
        <label className="dd-toggle">
          <input
            type="checkbox"
            checked={f.attrs?.nullable === true}
            onChange={(e) => updateNode(fieldId, { nullable: e.target.checked })}
          />
          可空（NULL）
        </label>
      </Section>
      <ColumnImpactView model={model} fieldId={fieldId} />
    </>
  );
}

/**
 * 可搜索的终点选择器：取代扁平 <select>。实体一多，纯名字下拉既难找又可能重名歧义；
 * 这里带类型图标 + 类型标签 + 即时过滤，选中前就能确认「连到的是哪一个」。
 */
export function NodePicker({
  model,
  nodes,
  value,
  onChange,
  placeholder,
}: {
  model: Model;
  nodes: Array<[string, ModelNode]>;
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selectedName = value ? model.nodes[value]?.name ?? '' : '';
  const q = query.trim().toLowerCase();
  const matches = q ? nodes.filter(([, n]) => n.name.toLowerCase().includes(q)) : nodes;
  return (
    <div className="dd-nodepicker">
      <input
        className="dd-input"
        placeholder={placeholder}
        value={open ? query : selectedName}
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        onChange={(e) => {
          setOpen(true);
          setQuery(e.target.value);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        role="combobox"
        aria-expanded={open}
        aria-label={placeholder}
      />
      {open && (
        <div className="dd-nodepicker-list" role="listbox">
          {matches.length === 0 && <div className="dd-nodepicker-empty">没有匹配的实体</div>}
          {matches.map(([nid, n]) => (
            <button
              key={nid}
              type="button"
              role="option"
              aria-selected={nid === value}
              className={`dd-nodepicker-item${nid === value ? ' selected' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(nid);
                setOpen(false);
                setQuery('');
              }}
            >
              <Glyph id={nodeGlyph(model, n)} size={16} />
              <span className="dd-nodepicker-name">{n.name}</span>
              <span className="dd-nodepicker-type">{NODE_TYPES[n.type].label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
