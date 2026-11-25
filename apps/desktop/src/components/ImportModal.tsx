import React, { useMemo, useRef, useState } from 'react';
import { Database, Download, FileJson, Sparkles, X } from 'lucide-react';
import { importSqlDdlToSlot } from '@devdraw/core';
import { useWorkbenchStore } from '../store/useWorkbenchStore';

type ImportTab = 'sql' | 'json';

const SAMPLE_SQL_DDL = `-- 示例：电商订单核心表结构（MySQL / PostgreSQL 均支持）
CREATE TABLE users (
  user_id BIGINT PRIMARY KEY COMMENT '用户主键',
  email VARCHAR(128) UNIQUE NOT NULL COMMENT '登录邮箱',
  nickname VARCHAR(64) COMMENT '展示昵称',
  created_at TIMESTAMP NOT NULL
) ENGINE=InnoDB COMMENT='用户主表';

CREATE TABLE orders (
  order_id BIGINT PRIMARY KEY COMMENT '订单号',
  user_id BIGINT NOT NULL COMMENT '下单用户',
  total_amount DECIMAL(12,2) NOT NULL COMMENT '订单总额',
  status VARCHAR(32) NOT NULL COMMENT '订单状态',
  created_at TIMESTAMP NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB COMMENT='订单主表';

CREATE TABLE order_items (
  item_id BIGINT PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(order_id),
  sku_id BIGINT NOT NULL COMMENT '商品 SKU',
  quantity INT NOT NULL COMMENT '购买数量',
  unit_price DECIMAL(10,2) NOT NULL
) COMMENT='订单明细表';`;

export const ImportModal: React.FC = () => {
  const {
    activeProjectId,
    importModalOpen,
    setImportModalOpen,
    importSqlDdl,
    importJsonDocument,
  } = useWorkbenchStore();

  const [tab, setTab] = useState<ImportTab>('sql');
  const [sqlText, setSqlText] = useState('');
  const [sqlMode, setSqlMode] = useState<'append' | 'new-layer'>('new-layer');
  const [jsonText, setJsonText] = useState('');
  const [jsonMode, setJsonMode] = useState<'replace-slot' | 'new-layer' | 'new-project'>('new-layer');
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const sqlPreview = useMemo(() => {
    if (!sqlText.trim()) return null;
    return importSqlDdlToSlot(sqlText);
  }, [sqlText]);

  if (!importModalOpen) return null;

  const handleConfirmSql = async () => {
    if (!sqlText.trim()) return;
    setImporting(true);
    try {
      const ok = await importSqlDdl(sqlText, sqlMode);
      if (ok) {
        setImportModalOpen(false);
        setSqlText('');
      }
    } finally {
      setImporting(false);
    }
  };

  const handleConfirmJson = () => {
    if (!jsonText.trim()) return;
    const ok = importJsonDocument(jsonText, activeProjectId ? jsonMode : 'new-project');
    if (ok) {
      setImportModalOpen(false);
      setJsonText('');
    }
  };

  const handlePickJsonFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setJsonText(text);
    e.target.value = '';
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={() => setImportModalOpen(false)}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-[#1b1624] border border-white/10 text-zinc-100 shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-300">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">导入 SQL DDL / DevDraw JSON</h3>
              <p className="text-[11px] text-zinc-400">
                粘贴建表语句自动生成 ER 表与外键连线，或恢复导出的 JSON 快照
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setImportModalOpen(false)}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pt-4 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setTab('sql')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                tab === 'sql'
                  ? 'bg-violet-600 text-white'
                  : 'bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>SQL DDL → ER 建模</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('json')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                tab === 'json'
                  ? 'bg-violet-600 text-white'
                  : 'bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300'
              }`}
            >
              <FileJson className="w-3.5 h-3.5" />
              <span>DevDraw JSON</span>
            </button>
          </div>

          {tab === 'sql' ? (
            <button
              type="button"
              onClick={() => setSqlText(SAMPLE_SQL_DDL)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 text-[11px] text-violet-300"
            >
              <Sparkles className="w-3 h-3" />
              <span>填入示例 DDL</span>
            </button>
          ) : (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={(e) => void handlePickJsonFile(e)}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 text-[11px] text-emerald-300"
              >
                <Download className="w-3 h-3" />
                <span>选择 .json 文件</span>
              </button>
            </>
          )}
        </div>

        <div className="p-5 space-y-3">
          {tab === 'sql' ? (
            <>
              <textarea
                rows={11}
                value={sqlText}
                onChange={(e) => setSqlText(e.target.value)}
                placeholder="粘贴 MySQL / PostgreSQL / SQLite 的 CREATE TABLE 语句，自动提取 PK/FK/UK 字段、注释与表间外键关系..."
                className="w-full p-3.5 rounded-xl bg-[#110e17] border border-white/10 focus:border-violet-400/60 text-xs font-mono text-zinc-200 focus:outline-none resize-none leading-relaxed"
              />

              <div className="flex items-center justify-between gap-2 flex-wrap text-[11px]">
                <div className="font-mono">
                  {sqlPreview ? (
                    sqlPreview.tableCount > 0 ? (
                      <span className="text-emerald-400">
                        已识别 {sqlPreview.tableCount} 张数据表 · {sqlPreview.relationCount} 条外键关联
                      </span>
                    ) : (
                      <span className="text-amber-400">未检测到有效的 CREATE TABLE 语句</span>
                    )
                  ) : (
                    <span className="text-zinc-500">支持多表 DDL、行内/表级 FOREIGN KEY、COMMENT 注释</span>
                  )}
                </div>

                {activeProjectId && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSqlMode('new-layer')}
                      className={`px-2.5 py-1 rounded-md border text-[11px] ${
                        sqlMode === 'new-layer'
                          ? 'bg-violet-500/20 border-violet-400/50 text-violet-200'
                          : 'bg-white/[0.03] border-white/10 text-zinc-400'
                      }`}
                    >
                      新建数据建模层
                    </button>
                    <button
                      type="button"
                      onClick={() => setSqlMode('append')}
                      className={`px-2.5 py-1 rounded-md border text-[11px] ${
                        sqlMode === 'append'
                          ? 'bg-violet-500/20 border-violet-400/50 text-violet-200'
                          : 'bg-white/[0.03] border-white/10 text-zinc-400'
                      }`}
                    >
                      追加到当前画布
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <textarea
                rows={11}
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                placeholder='粘贴 DevDraw 导出的画布 JSON（含 nodes / edges）或完整项目 JSON（含 layers）...'
                className="w-full p-3.5 rounded-xl bg-[#110e17] border border-white/10 focus:border-violet-400/60 text-xs font-mono text-zinc-200 focus:outline-none resize-none leading-relaxed"
              />

              {activeProjectId && (
                <div className="flex items-center justify-end gap-1.5 text-[11px]">
                  <span className="text-zinc-400 mr-1">导入位置：</span>
                  {(
                    [
                      { id: 'new-layer', label: '新增为推演层' },
                      { id: 'replace-slot', label: '替换当前画布' },
                      { id: 'new-project', label: '新建独立项目' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setJsonMode(opt.id)}
                      className={`px-2.5 py-1 rounded-md border ${
                        jsonMode === opt.id
                          ? 'bg-violet-500/20 border-violet-400/50 text-violet-200'
                          : 'bg-white/[0.03] border-white/10 text-zinc-400'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-3.5 bg-[#15111d] border-t border-white/[0.06] flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setImportModalOpen(false)}
            className="px-4 py-2 rounded-xl text-xs text-zinc-400 hover:text-white hover:bg-white/[0.05]"
          >
            取消
          </button>
          {tab === 'sql' ? (
            <button
              type="button"
              disabled={importing || !sqlPreview || sqlPreview.tableCount === 0}
              onClick={() => void handleConfirmSql()}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-medium transition-colors"
            >
              {importing ? '布局生成中...' : '生成 ER 实体并自动排版'}
            </button>
          ) : (
            <button
              type="button"
              disabled={!jsonText.trim()}
              onClick={handleConfirmJson}
              className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-xs font-medium transition-colors"
            >
              确认导入 JSON
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
