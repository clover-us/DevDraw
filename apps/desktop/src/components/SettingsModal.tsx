import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  FolderSync,
  Palette,
  RefreshCw,
  RotateCcw,
  Route,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import { isTauriRuntime } from '../storage/adapter';
import { useWorkbenchStore, type SettingsTab } from '../store/useWorkbenchStore';
import { APP_VERSION, GITHUB_REPO_URL, openExternalUrl } from '../utils/updater';

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '';
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function formatCheckTime(ts?: number): string {
  if (!ts) return '尚未检查';
  try {
    return new Date(ts).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '刚刚';
  }
}

export const SettingsModal: React.FC = () => {
  const {
    theme,
    compactMode,
    settingsModalOpen,
    settingsInitialTab,
    appSettings,
    updateCheckState,
    updateInfo,
    updateError,
    updateInstalling,
    closeSettingsModal,
    toggleTheme,
    toggleCompactMode,
    updateAppSettings,
    resetAppSettings,
    resetDemoWorkspace,
    checkForUpdates,
    installAvailableUpdate,
  } = useWorkbenchStore();

  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [confirmResetDemo, setConfirmResetDemo] = useState(false);

  useEffect(() => {
    if (settingsModalOpen) {
      setActiveTab(settingsInitialTab);
      setConfirmResetDemo(false);
    }
  }, [settingsModalOpen, settingsInitialTab]);

  if (!settingsModalOpen) return null;

  const navTabs: Array<{
    id: SettingsTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: boolean;
  }> = [
    { id: 'general', label: '外观与画布', icon: Palette },
    { id: 'workspace', label: '工作区与源码', icon: FolderSync },
    { id: 'flow', label: '动态推演', icon: Route },
    {
      id: 'updates',
      label: '自动更新与关于',
      icon: Sparkles,
      badge: updateCheckState === 'available',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={closeSettingsModal}
    >
      <div
        className="w-full max-w-2xl h-[540px] max-h-[86vh] rounded-2xl bg-[#1b1624] border border-white/10 text-zinc-100 shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-300">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">应用设置</h3>
              <p className="text-[11px] text-zinc-400">
                自定义画布交互偏好、本地工作区同步与自动更新策略（Ctrl+,）
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeSettingsModal}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body: Left Nav + Right Content */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          <nav className="w-44 border-r border-white/[0.06] bg-[#15111d] p-2.5 space-y-1 shrink-0">
            {navTabs.map((t) => {
              const Icon = t.icon;
              const isActive = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-xs transition-colors ${
                    isActive
                      ? 'bg-violet-600/25 text-violet-200 font-medium border border-violet-400/35'
                      : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.05] border border-transparent'
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{t.label}</span>
                  </span>
                  {t.badge && <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />}
                </button>
              );
            })}
          </nav>

          <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
            {activeTab === 'general' && (
              <>
                <div className="p-3.5 rounded-xl bg-white/[0.025] border border-white/[0.07] space-y-3">
                  <div>
                    <div className="font-medium text-zinc-100">画布主题风格</div>
                    <p className="text-[11px] text-zinc-400 mt-0.5">切换暗夜紫墨或晴昼白板视觉主题</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (theme !== 'dark') toggleTheme();
                      }}
                      className={`py-2 px-3 rounded-xl border text-left transition-colors ${
                        theme === 'dark'
                          ? 'bg-violet-500/20 border-violet-400/50 text-violet-200 font-medium'
                          : 'bg-black/20 border-white/10 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      暗夜紫墨 (Dark)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (theme !== 'light') toggleTheme();
                      }}
                      className={`py-2 px-3 rounded-xl border text-left transition-colors ${
                        theme === 'light'
                          ? 'bg-violet-500/20 border-violet-400/50 text-violet-200 font-medium'
                          : 'bg-black/20 border-white/10 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      晴昼白板 (Light)
                    </button>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-white/[0.025] border border-white/[0.07] flex items-center justify-between gap-4">
                  <div>
                    <div className="font-medium text-zinc-100">精简卡片模式</div>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      隐藏卡片备注与底部元信息，适合超大拓扑俯瞰
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={toggleCompactMode}
                    className={`w-10 h-5 rounded-full transition-colors p-0.5 shrink-0 ${
                      compactMode ? 'bg-violet-600' : 'bg-white/15'
                    }`}
                  >
                    <span
                      className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                        compactMode ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className="p-3.5 rounded-xl bg-white/[0.025] border border-white/[0.07] flex items-center justify-between gap-4">
                  <div>
                    <div className="font-medium text-zinc-100">显示画布右下角迷你地图 (MiniMap)</div>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      关闭后可释放更多画布可视区域（也可在画布左下角快速切换）
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateAppSettings({ showMiniMap: !appSettings.showMiniMap })}
                    className={`w-10 h-5 rounded-full transition-colors p-0.5 shrink-0 ${
                      appSettings.showMiniMap ? 'bg-sky-500' : 'bg-white/15'
                    }`}
                  >
                    <span
                      className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                        appSettings.showMiniMap ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className="p-3.5 rounded-xl bg-white/[0.025] border border-white/[0.07] space-y-2.5">
                  <div>
                    <div className="font-medium text-zinc-100">默认连线路由样式</div>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      在画布中新建普通实体连线时默认采用的路由风格
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { id: 'bezier', label: '贝塞尔曲线 (流畅)' },
                        { id: 'orthogonal', label: '正交折线 (工整)' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => updateAppSettings({ defaultEdgeRouting: opt.id })}
                        className={`py-2 px-3 rounded-xl border text-left transition-colors ${
                          appSettings.defaultEdgeRouting === opt.id
                            ? 'bg-sky-500/20 border-sky-400/50 text-sky-200 font-medium'
                            : 'bg-black/20 border-white/10 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-white/[0.025] border border-white/[0.07] space-y-2.5">
                  <div>
                    <div className="font-medium text-zinc-100">ELK 默认自动布局方向</div>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      按下 Ctrl+L 执行自动排版时的默认拓扑展开方向
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { id: 'RIGHT', label: '水平分层 (左 → 右)' },
                        { id: 'DOWN', label: '垂直分层 (上 → 下)' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => updateAppSettings({ defaultLayoutDirection: opt.id })}
                        className={`py-2 px-3 rounded-xl border text-left transition-colors ${
                          appSettings.defaultLayoutDirection === opt.id
                            ? 'bg-violet-500/20 border-violet-400/50 text-violet-200 font-medium'
                            : 'bg-black/20 border-white/10 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {activeTab === 'workspace' && (
              <>
                <div className="p-3.5 rounded-xl bg-white/[0.025] border border-white/[0.07] flex items-center justify-between gap-4">
                  <div>
                    <div className="font-medium text-zinc-100">外部目录变更实时热重载</div>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      监听已绑定的本地文件夹，在 VS Code / Git / AI 中修改 .arch 时自动更新画布
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      updateAppSettings({ autoReloadWorkspace: !appSettings.autoReloadWorkspace })
                    }
                    className={`w-10 h-5 rounded-full transition-colors p-0.5 shrink-0 ${
                      appSettings.autoReloadWorkspace ? 'bg-emerald-500' : 'bg-white/15'
                    }`}
                  >
                    <span
                      className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                        appSettings.autoReloadWorkspace ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className="p-3.5 rounded-xl bg-white/[0.025] border border-white/[0.07] space-y-2.5">
                  <div>
                    <div className="font-medium text-zinc-100">本地目录自动落盘防抖间隔</div>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      控制画布编辑后同步写入 project.json / layers/*.arch / .arch-layout.json 的延迟
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { value: 240, label: '240ms · 实时' },
                        { value: 600, label: '600ms · 均衡' },
                        { value: 1200, label: '1200ms · 节能' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => updateAppSettings({ workspaceSyncDelayMs: opt.value })}
                        className={`py-2 px-2.5 rounded-xl border text-center font-mono text-[11px] transition-colors ${
                          appSettings.workspaceSyncDelayMs === opt.value
                            ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200 font-medium'
                            : 'bg-black/20 border-white/10 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-white/[0.025] border border-white/[0.07] flex items-center justify-between gap-4">
                  <div>
                    <div className="font-medium text-zinc-100">源码光标 ↔ 画布双向选中联动</div>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      在 .arch 编辑器移动光标时自动高亮并选中画布对应实体或连线
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateAppSettings({ dslCursorSync: !appSettings.dslCursorSync })}
                    className={`w-10 h-5 rounded-full transition-colors p-0.5 shrink-0 ${
                      appSettings.dslCursorSync ? 'bg-violet-600' : 'bg-white/15'
                    }`}
                  >
                    <span
                      className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                        appSettings.dslCursorSync ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className="p-3.5 rounded-xl bg-rose-500/[0.05] border border-rose-500/20 flex items-center justify-between gap-4">
                  <div>
                    <div className="font-medium text-rose-200">重置演示工作区数据</div>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      恢复内置预置示例项目（不会删除你已落盘的本地磁盘目录）
                    </p>
                  </div>
                  {confirmResetDemo ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setConfirmResetDemo(false)}
                        className="px-2.5 py-1.5 rounded-lg bg-white/[0.06] text-zinc-300 text-[11px]"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          resetDemoWorkspace();
                          setConfirmResetDemo(false);
                          closeSettingsModal();
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-medium"
                      >
                        确认重置
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmResetDemo(true)}
                      className="px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-[11px] font-medium shrink-0"
                    >
                      重置数据
                    </button>
                  )}
                </div>
              </>
            )}

            {activeTab === 'flow' && (
              <div className="p-3.5 rounded-xl bg-white/[0.025] border border-white/[0.07] space-y-2.5">
                <div>
                  <div className="font-medium text-zinc-100">动态链路自动演播步进速度</div>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    在链路演播模式点击「自动播放」时，每一步停留的时长
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { value: 1000, label: '1.0 秒 · 紧凑演示' },
                      { value: 1600, label: '1.6 秒 · 标准默认' },
                      { value: 2500, label: '2.5 秒 · 评审讲解' },
                      { value: 3500, label: '3.5 秒 · 深度推演' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => updateAppSettings({ flowAutoPlayIntervalMs: opt.value })}
                      className={`py-2 px-3 rounded-xl border text-left font-mono text-[11px] transition-colors ${
                        appSettings.flowAutoPlayIntervalMs === opt.value
                          ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200 font-medium'
                          : 'bg-black/20 border-white/10 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'updates' && (
              <>
                {/* Version & Update Action Card */}
                <div className="p-4 rounded-xl bg-gradient-to-br from-violet-500/10 via-[#181324] to-emerald-500/10 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">DevDraw · 研绘</span>
                        <span className="px-2 py-0.5 rounded-full bg-violet-500/20 border border-violet-400/35 text-violet-200 font-mono text-[10.5px]">
                          v{APP_VERSION}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-1 font-mono">
                        {isTauriRuntime() ? 'Tauri v2 桌面端' : 'Web 开发预览模式'} · 上次检查：
                        {formatCheckTime(appSettings.lastUpdateCheckAt)}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={updateCheckState === 'checking'}
                      onClick={() => void checkForUpdates(false)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-medium shrink-0 transition-colors"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${
                          updateCheckState === 'checking' ? 'animate-spin' : ''
                        }`}
                      />
                      <span>{updateCheckState === 'checking' ? '检查中...' : '立即检查更新'}</span>
                    </button>
                  </div>

                  {/* Live Update Check Status */}
                  {updateCheckState === 'up-to-date' && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>当前已是最新版本（v{updateInfo?.latestVersion ?? APP_VERSION}）</span>
                    </div>
                  )}

                  {updateCheckState === 'error' && updateError && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-300 text-[11px]">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{updateError}</span>
                    </div>
                  )}

                  {updateCheckState === 'available' && updateInfo && (
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-400/35 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-emerald-200">
                          发现新版本 v{updateInfo.latestVersion}
                        </span>
                        {updateInfo.installerAsset && (
                          <span className="text-[10px] font-mono text-emerald-300/80">
                            {updateInfo.installerAsset.name} ({formatBytes(updateInfo.installerAsset.size)})
                          </span>
                        )}
                      </div>
                      {updateInfo.releaseNotes && (
                        <div className="max-h-24 overflow-y-auto text-[11px] text-zinc-300 whitespace-pre-wrap leading-relaxed bg-black/25 rounded-lg p-2.5 border border-white/[0.06]">
                          {updateInfo.releaseNotes}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        {updateInfo.installerAsset && (
                          <button
                            type="button"
                            disabled={updateInstalling}
                            onClick={() => void installAvailableUpdate()}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[11px] font-medium"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>{updateInstalling ? '正在下载安装...' : '一键下载并安装更新'}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void openExternalUrl(updateInfo.releaseUrl)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 text-[11px]"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>查看发布详情</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Auto-check toggle */}
                <div className="p-3.5 rounded-xl bg-white/[0.025] border border-white/[0.07] flex items-center justify-between gap-4">
                  <div>
                    <div className="font-medium text-zinc-100">启动时自动检查更新</div>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      应用启动后静默检测 GitHub Releases 新版本并在顶栏提示
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      updateAppSettings({ autoCheckUpdates: !appSettings.autoCheckUpdates })
                    }
                    className={`w-10 h-5 rounded-full transition-colors p-0.5 shrink-0 ${
                      appSettings.autoCheckUpdates ? 'bg-emerald-500' : 'bg-white/15'
                    }`}
                  >
                    <span
                      className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                        appSettings.autoCheckUpdates ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Update Channel */}
                <div className="p-3.5 rounded-xl bg-white/[0.025] border border-white/[0.07] space-y-2.5">
                  <div>
                    <div className="font-medium text-zinc-100">更新通道</div>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      选择接收稳定正式版，或提前体验含新特性的预览版本
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { id: 'stable', label: '正式版 (Stable · 推荐)' },
                        { id: 'prerelease', label: '预览版 (Pre-release)' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => updateAppSettings({ updateChannel: opt.id })}
                        className={`py-2 px-3 rounded-xl border text-left transition-colors ${
                          appSettings.updateChannel === opt.id
                            ? 'bg-violet-500/20 border-violet-400/50 text-violet-200 font-medium'
                            : 'bg-black/20 border-white/10 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between px-1 text-[11px] text-zinc-400">
                  <span>开源协议：MIT License</span>
                  <button
                    type="button"
                    onClick={() => void openExternalUrl(GITHUB_REPO_URL)}
                    className="inline-flex items-center gap-1 text-violet-300 hover:text-violet-200"
                  >
                    <span>github.com/clover-us/DevDraw</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#15111d] border-t border-white/[0.06] flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={resetAppSettings}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]"
          >
            <RotateCcw className="w-3 h-3" />
            <span>恢复默认设置</span>
          </button>
          <button
            type="button"
            onClick={closeSettingsModal}
            className="px-4 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};
