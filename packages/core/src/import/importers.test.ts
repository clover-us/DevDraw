import { describe, expect, it } from 'vitest';
import { importDevDrawJson, importSqlDdlToSlot } from './importers';
import { createDefaultProjects } from '../presets';

describe('@devdraw/core SQL DDL & JSON importers', () => {
  it('parses MySQL & PostgreSQL CREATE TABLE statements with comments, PK/FK/UK, and foreign key relations', () => {
    const sql = `
      -- Leading SQL comment
      /* Multi-line block comment */
      CREATE TABLE IF NOT EXISTS \`public\`.\`users\` (
        \`user_id\` BIGINT NOT NULL AUTO_INCREMENT COMMENT '用户主键',
        \`email\` VARCHAR(128) UNIQUE NOT NULL COMMENT '登录邮箱',
        \`balance\` DECIMAL(12, 2) DEFAULT 0.00,
        PRIMARY KEY (\`user_id\`)
      ) ENGINE=InnoDB COMMENT='用户主表';

      CREATE TABLE "orders" (
        "order_id" UUID PRIMARY KEY,
        "user_id" BIGINT NOT NULL REFERENCES users(user_id),
        "coupon_code" VARCHAR(32),
        CONSTRAINT uk_coupon UNIQUE (coupon_code)
      );

      CREATE TABLE order_items (
        item_id BIGINT PRIMARY KEY,
        order_id UUID NOT NULL,
        sku_id BIGINT NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(order_id)
      );
    `;

    const res = importSqlDdlToSlot(sql, { idPrefix: 'test' });
    expect(res.tableCount).toBe(3);
    expect(res.relationCount).toBe(2);
    expect(res.warnings).toHaveLength(0);

    const users = res.nodes.find((n) => n.title === 'users')!;
    expect(users.tag).toBe('TABLE · InnoDB');
    expect(users.note).toBe('用户主表');
    expect(users.fields).toEqual([
      { key: 'PK', name: 'user_id', type: 'BIGINT', note: '用户主键' },
      { key: 'UK', name: 'email', type: 'VARCHAR(128)', note: '登录邮箱' },
      { key: '', name: 'balance', type: 'DECIMAL(12,2)', note: undefined },
    ]);

    const orders = res.nodes.find((n) => n.title === 'orders')!;
    expect(orders.fields?.find((f) => f.name === 'order_id')?.key).toBe('PK');
    expect(orders.fields?.find((f) => f.name === 'user_id')?.key).toBe('FK');
    expect(orders.fields?.find((f) => f.name === 'coupon_code')?.key).toBe('UK');

    // Field-level orthogonal FK edges
    expect(res.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: users.id,
          fromField: 'user_id',
          to: orders.id,
          toField: 'user_id',
          routing: 'orthogonal',
        }),
      ])
    );
  });

  it('imports both CanvasSlot JSON and full ProjectDocument JSON', () => {
    const project = createDefaultProjects()[0];

    const projImport = importDevDrawJson(JSON.stringify(project));
    expect(projImport.kind).toBe('project');
    if (projImport.kind === 'project') {
      expect(projImport.project.layers.length).toBe(project.layers.length);
    }

    const slot = project.layers[0];
    const slotImport = importDevDrawJson(JSON.stringify(slot));
    expect(slotImport.kind).toBe('slot');
    if (slotImport.kind === 'slot') {
      expect(slotImport.slot.nodes.length).toBe(slot.nodes.length);
    }

    expect(() => importDevDrawJson('{ bad json')).toThrow('JSON 语法格式不正确');
    expect(() => importDevDrawJson('{"hello": 1}')).toThrow('无法识别的 DevDraw JSON');
  });
});
