/**
 * entity-fields —— 实体「字段 / 连线」的共享构件，供只读抽屉与编辑弹窗复用。
 * 读 / 写分离后：抽屉用 *View（只读），NodeEditor 弹窗用 *Editor（可写）。
 * 同一份字段列表 / 牵连分析渲染逻辑只写一遍，避免两处口径漂移。
 */
import { useEffect, useState, type ReactNode } from 'react';
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

/** 字段行列表（只读、可点击钻取）：Table 的读 / 写视图共用。行内三列：名称 · 备注（缩略）· 类型。 */
export function FieldRows({
  model,
  tableId,
  onSelectField,
  selectedFieldId,
}: {
  model: Model;
  tableId: string;
  onSelectField: (id: string) => void;
  selectedFieldId?: string | null;
}) {
  const fields = fieldsOf(model, tableId);
  return (
    <ul className="dd-field-list">
      {fields.map(([fid, name]) => {
        const f = model.nodes[fid];
        const comment = typeof f.attrs?.comment === 'string' ? f.attrs.comment : '';
        return (
          <li key={fid}>
            <button
              className={`dd-field-item${selectedFieldId === fid ? ' selected' : ''}`}
              onClick={() => onSelectField(fid)}
              aria-pressed={selectedFieldId === fid}
            >
              {typeof f.attrs?.key === 'string' && (
                <span className={`dd-key dd-key-${f.attrs.key.toLowerCase()}`}>{f.attrs.key}</span>
              )}
              <span className="dd-field-name">{name}</span>
              {comment && (
                <span className="dd-field-comment" title={comment}>
                  {comment}
                </span>
              )}
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
  selectedFieldId,
}: {
  model: Model;
  tableId: string;
  onSelectField: (id: string) => void;
  onAdd: (name: string, dataType: string) => void;
  selectedFieldId?: string | null;
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
      <FieldRows model={model} tableId={tableId} onSelectField={onSelectField} selectedFieldId={selectedFieldId} />
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
          <div>
            <dt>唯一</dt>
            <dd>{f.attrs?.unique === true ? '是（UNIQUE）' : '否'}</dd>
          </div>
          <div>
            <dt>自增</dt>
            <dd>{f.attrs?.autoIncrement === true ? '是' : '否'}</dd>
          </div>
          <div>
            <dt>默认值</dt>
            <dd>{typeof f.attrs?.default === 'string' && f.attrs.default ? f.attrs.default : '—'}</dd>
          </div>
          <div>
            <dt>备注</dt>
            <dd>{typeof f.attrs?.comment === 'string' && f.attrs.comment ? f.attrs.comment : '—'}</dd>
          </div>
        </dl>
      </Section>
      <ColumnImpactView model={model} fieldId={fieldId} />
    </>
  );
}

/** 可写：Field 的属性编辑 + 牵连（弹窗用）。onDelete 可选：表内联编辑时提供「删除字段」。 */
export function FieldEditor({
  model,
  fieldId,
  onSelectNode,
  updateNode,
  onDelete,
}: {
  model: Model;
  fieldId: string;
  onSelectNode: (id: string) => void;
  updateNode: (id: string, attrs: Record<string, string | number | boolean>) => void;
  onDelete?: (id: string) => void;
}) {
  const f = model.nodes[fieldId];
  const owner = Object.values(model.edges).find((e) => e.type === 'contains' && e.to === fieldId)?.from;
  const [deleteArmed, setDeleteArmed] = useState(false);
  useEffect(() => {
    if (!deleteArmed) return;
    const t = window.setTimeout(() => setDeleteArmed(false), 3000);
    return () => window.clearTimeout(t);
  }, [deleteArmed]);
  // 换选另一列时解除「确认删除」武装，避免误删新选中的列。
  useEffect(() => setDeleteArmed(false), [fieldId]);
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
        <div className="dd-attrs-grid">
          <div>
            <label className="dd-field-label">数据类型</label>
            <input
              className="dd-input"
              value={typeof f.attrs?.dataType === 'string' ? f.attrs.dataType : ''}
              onChange={(e) => updateNode(fieldId, { dataType: e.target.value })}
            />
          </div>
          <div>
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
          </div>
          <div>
            <label className="dd-field-label">默认值</label>
            <input
              className="dd-input"
              placeholder="如 0 / NOW()"
              value={typeof f.attrs?.default === 'string' ? f.attrs.default : ''}
              onChange={(e) => updateNode(fieldId, { default: e.target.value })}
            />
          </div>
          <div className="dd-attr-wide">
            <label className="dd-field-label">备注</label>
            <input
              className="dd-input"
              placeholder="这一列是干什么的（画布上缩略显示）"
              value={typeof f.attrs?.comment === 'string' ? f.attrs.comment : ''}
              onChange={(e) => updateNode(fieldId, { comment: e.target.value })}
            />
          </div>
        </div>
        <div className="dd-toggle-row">
          <label className="dd-toggle">
            <input
              type="checkbox"
              checked={f.attrs?.nullable === true}
              onChange={(e) => updateNode(fieldId, { nullable: e.target.checked })}
            />
            可空（NULL）
          </label>
          <label className="dd-toggle">
            <input
              type="checkbox"
              checked={f.attrs?.unique === true}
              onChange={(e) => updateNode(fieldId, { unique: e.target.checked })}
            />
            唯一（UNIQUE）
          </label>
          <label className="dd-toggle">
            <input
              type="checkbox"
              checked={f.attrs?.autoIncrement === true}
              onChange={(e) => updateNode(fieldId, { autoIncrement: e.target.checked })}
            />
            自增
          </label>
        </div>
        {onDelete && (
          <button
            className={`dd-danger dd-field-delete${deleteArmed ? ' armed' : ''}`}
            onClick={() => (deleteArmed ? onDelete(fieldId) : setDeleteArmed(true))}
          >
            {deleteArmed ? '确认删除？再点一次' : '删除字段'}
          </button>
        )}
      </Section>
      <ColumnImpactView model={model} fieldId={fieldId} />
    </>
  );
}

/** 布尔 / 数值属性的控件种类推断：软 schema 只给标签，控件形态按属性名约定。 */
const BOOL_ATTRS = new Set(['nullable', 'unique', 'autoIncrement', 'initial', 'terminal']);
const NUM_ATTRS = new Set(['replicas']);
const WIDE_ATTRS = new Set(['comment', 'detail', 'tech']);

/**
 * 可写：实体级属性（注册表软 schema 驱动）。Service / Database / Table 等共用，
 * 加属性只需改注册表，这里自动长出对应控件。
 */
export function AttrsEditor({
  model,
  nodeId,
  updateNode,
}: {
  model: Model;
  nodeId: string;
  updateNode: (id: string, attrs: Record<string, string | number | boolean>) => void;
}) {
  const node = model.nodes[nodeId];
  const schema = NODE_TYPES[node.type].attrs;
  if (!schema) return null;
  return (
    <Section title="实体属性">
      <div className="dd-attrs-grid">
        {Object.entries(schema).map(([key, label]) => {
          const v = node.attrs?.[key];
          if (BOOL_ATTRS.has(key)) {
            return (
              <label className="dd-toggle dd-attr-bool" key={key}>
                <input type="checkbox" checked={v === true} onChange={(e) => updateNode(nodeId, { [key]: e.target.checked })} />
                {label}
              </label>
            );
          }
          return (
            <div key={key} className={WIDE_ATTRS.has(key) ? 'dd-attr-wide' : undefined}>
              <label className="dd-field-label">{label}</label>
              <input
                className="dd-input"
                type={NUM_ATTRS.has(key) ? 'number' : 'text'}
                min={NUM_ATTRS.has(key) ? 0 : undefined}
                placeholder="未设置"
                value={typeof v === 'string' || typeof v === 'number' ? v : ''}
                onChange={(e) =>
                  updateNode(nodeId, { [key]: NUM_ATTRS.has(key) && e.target.value !== '' ? Number(e.target.value) : e.target.value })
                }
              />
            </div>
          );
        })}
      </div>
    </Section>
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
