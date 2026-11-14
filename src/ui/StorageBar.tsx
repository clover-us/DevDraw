/**
 * StorageBar —— 把"数据存在哪、怎么存"讲清楚的存储状态条。
 * 直接回应用户困惑：DevDraw 没有后端服务、也没有"记路径的配置文件"；
 * 浏览器经 File System Access 直接读写你授权的文件夹，文件就在你自己的磁盘上。
 * 三种形态：本地文件夹（自动保存）/ zip 快照（手动）/ 内存（未持久化）。
 */
import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { StoreKind } from '../core/store';

interface StorageBarProps {
  modelName: string;
  kind: StoreKind;
  label: string;
  autoSave: boolean;
  dirty: boolean;
  saving: boolean;
  fsaSupported: boolean;
  /** 收起形态：不显示文件夹名，只留状态（工具坞里的窄胶囊）。 */
  hideName?: boolean;
  onOpenFolder: () => void;
  onImportZip: (file: File) => void;
  onExportZip: () => void;
  onSaveNow: () => void;
}

/* ---------- 内联图标（无外部依赖， crisp 1.6px 描边） ---------- */
const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function FolderIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" {...stroke}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}
function ArchiveIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" {...stroke}>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M10 12h4" />
    </svg>
  );
}
function ChipIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" {...stroke}>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
    </svg>
  );
}
function InfoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" {...stroke}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" {...stroke}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

const MODE_ICON: Record<StoreKind, () => ReactElement> = {
  folder: FolderIcon,
  zip: ArchiveIcon,
  memory: ChipIcon,
};

interface Status {
  text: string;
  tone: 'ok' | 'warn' | 'idle' | 'saving';
}

function statusOf(kind: StoreKind, autoSave: boolean, dirty: boolean, saving: boolean, compact = false): Status {
  if (saving) return { text: '保存中…', tone: 'saving' };
  if (dirty) return { text: autoSave ? (compact ? '待保存' : '待自动保存') : compact ? '有改动' : '有改动未导出', tone: 'warn' };
  if (kind === 'folder') return { text: compact ? '已保存' : '已保存到磁盘', tone: 'ok' };
  if (kind === 'zip') return { text: compact ? '快照' : '快照已加载', tone: 'ok' };
  return { text: compact ? '未持久化' : '未持久化 · 刷新即失', tone: 'idle' };
}

export function StorageBar(props: StorageBarProps) {
  const { modelName, kind, label, autoSave, dirty, saving, fsaSupported, hideName } = props;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const status = statusOf(kind, autoSave, dirty, saving, hideName);
  const Icon = MODE_ICON[kind];

  // 点击外部 / Esc 关闭弹层
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const act = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };

  return (
    <div className="dd-storage" ref={wrapRef}>
      <button
        type="button"
        className={`dd-storage-pill tone-${status.tone}${open ? ' open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        title="点击查看：你的数据存在哪里、怎么存"
        aria-expanded={open}
      >
        <span className={`dd-storage-icon kind-${kind}`}>
          <Icon />
        </span>
        <span className="dd-storage-text">
          {!hideName && <span className="dd-storage-name">{label}</span>}
          <span className="dd-storage-status">
            <span className={`dd-save-dot tone-${status.tone}`} />
            {status.text}
          </span>
        </span>
        <span className="dd-storage-info">
          <InfoIcon />
        </span>
      </button>

      {open && (
        <div className="dd-storage-pop" role="dialog" aria-label="数据存储说明">
          <div className="dd-storage-pop-head">
            <h3>你的数据存在哪里？</h3>
            <button type="button" className="dd-storage-close" onClick={() => setOpen(false)} aria-label="关闭">
              <CloseIcon />
            </button>
          </div>

          <p className="dd-storage-lead">
            DevDraw <strong>没有后端服务</strong>，也没有一个"记路径的配置文件"。浏览器直接读写<strong>你授权的那个文件夹</strong>
            ——<code>model.json</code> / <code>views.json</code> 就躺在你自己的磁盘上，Obsidian 能开、git 能管。
          </p>

          <div className="dd-storage-modes">
            <ModeCard
              active={kind === 'folder'}
              icon={<FolderIcon />}
              title="本地文件夹"
              tag="自动保存"
              desc="点「打开文件夹」选一个目录、授权一次。之后每次改动自动写盘，刷新或重开都还在。浏览器记住的是文件夹的「句柄」（存 IndexedDB），不是路径字符串。"
            />
            <ModeCard
              active={kind === 'zip'}
              icon={<ArchiveIcon />}
              title="zip 快照"
              tag="手动"
              desc="「导出 zip」把当前状态打包下载一份；「导入 zip」把快照读回来继续编辑。适合备份、换浏览器、分享。解压就是一个标准项目文件夹。"
            />
            <ModeCard
              active={kind === 'memory'}
              icon={<ChipIcon />}
              title="内存"
              tag="未持久化"
              desc="当前示例只在内存里，刷新即失。要留住思考，请打开一个文件夹，或导出一份 zip。"
            />
          </div>

          <p className="dd-storage-note">
            {fsaSupported
              ? '当前浏览器支持直接读写文件夹（Chromium / Edge）。'
              : '当前浏览器不支持文件夹直读（Firefox / Safari），请用 zip 导入导出。'}
            {kind === 'folder' && <> 正在读写：<strong>{label}</strong>。</>}
          </p>

          <div className="dd-storage-actions">
            {fsaSupported && (
              <button type="button" className={kind === 'folder' ? '' : 'dd-primary'} onClick={act(props.onOpenFolder)}>
                <FolderIcon /> {kind === 'folder' ? '换个文件夹…' : '打开文件夹…'}
              </button>
            )}
            <label className="dd-file-btn dd-storage-file">
              <ArchiveIcon /> 导入 zip
              <input
                type="file"
                accept=".zip"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) props.onImportZip(f);
                  e.target.value = '';
                  setOpen(false);
                }}
              />
            </label>
            <button
              type="button"
              className={kind !== 'folder' ? 'dd-primary' : ''}
              onClick={act(props.onExportZip)}
            >
              <ArchiveIcon /> 导出 zip
            </button>
            {!autoSave && dirty && (
              <button type="button" onClick={act(props.onSaveNow)}>
                暂存
              </button>
            )}
          </div>
          <p className="dd-storage-model">项目：{modelName}</p>
        </div>
      )}
    </div>
  );
}

function ModeCard({
  active,
  icon,
  title,
  tag,
  desc,
}: {
  active: boolean;
  icon: ReactElement;
  title: string;
  tag: string;
  desc: string;
}) {
  return (
    <div className={`dd-mode-card${active ? ' active' : ''}`}>
      <div className="dd-mode-card-head">
        <span className="dd-mode-card-icon">{icon}</span>
        <span className="dd-mode-card-title">{title}</span>
        <span className="dd-mode-card-tag">{tag}</span>
        {active && <span className="dd-mode-card-now">当前</span>}
      </div>
      <p className="dd-mode-card-desc">{desc}</p>
    </div>
  );
}
