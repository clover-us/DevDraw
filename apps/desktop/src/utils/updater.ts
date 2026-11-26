import { isTauriRuntime } from '../storage/adapter';

export const APP_VERSION = '0.3.0';
export const GITHUB_REPO = 'clover-us/DevDraw';
export const GITHUB_REPO_URL = `https://github.com/${GITHUB_REPO}`;
export const GITHUB_RELEASES_URL = `${GITHUB_REPO_URL}/releases`;

export interface UpdateAssetInfo {
  name: string;
  downloadUrl: string;
  size: number;
}

export interface UpdateCheckResult {
  status: 'up-to-date' | 'available';
  currentVersion: string;
  latestVersion: string;
  releaseName: string;
  releaseNotes: string;
  releaseUrl: string;
  publishedAt: string;
  prerelease: boolean;
  installerAsset?: UpdateAssetInfo;
}

interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface GitHubReleasePayload {
  tag_name: string;
  name?: string;
  body?: string;
  html_url: string;
  published_at?: string;
  prerelease?: boolean;
  draft?: boolean;
  assets?: GitHubReleaseAsset[];
}

function parseSemver(raw: string): [number, number, number] {
  const cleaned = raw.trim().replace(/^v/i, '').split('-')[0];
  const parts = cleaned.split('.').map((n) => Number.parseInt(n, 10) || 0);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

/**
 * Returns >0 if `a > b`, <0 if `a < b`, 0 if equal.
 */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function pickWindowsInstallerAsset(assets: GitHubReleaseAsset[] = []): UpdateAssetInfo | undefined {
  const nsis = assets.find((a) => /-setup\.exe$/i.test(a.name));
  const msi = assets.find((a) => /\.msi$/i.test(a.name));
  const chosen = nsis ?? msi;
  if (!chosen) return undefined;
  return {
    name: chosen.name,
    downloadUrl: chosen.browser_download_url,
    size: chosen.size,
  };
}

/**
 * Check GitHub Releases for a newer DevDraw version.
 */
export async function checkForAppUpdate(
  channel: 'stable' | 'prerelease' = 'stable'
): Promise<UpdateCheckResult> {
  let release: GitHubReleasePayload | undefined;

  if (channel === 'stable') {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) {
      throw new Error(`检查更新失败 (HTTP ${res.status})`);
    }
    release = (await res.json()) as GitHubReleasePayload;
  } else {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=10`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) {
      throw new Error(`检查更新失败 (HTTP ${res.status})`);
    }
    const list = (await res.json()) as GitHubReleasePayload[];
    release = list.find((r) => !r.draft);
  }

  if (!release?.tag_name) {
    throw new Error('未获取到有效的发布版本信息');
  }

  const latestVersion = release.tag_name.replace(/^v/i, '');
  const hasUpdate = compareSemver(latestVersion, APP_VERSION) > 0;

  return {
    status: hasUpdate ? 'available' : 'up-to-date',
    currentVersion: APP_VERSION,
    latestVersion,
    releaseName: release.name || release.tag_name,
    releaseNotes: release.body || '',
    releaseUrl: release.html_url || GITHUB_RELEASES_URL,
    publishedAt: release.published_at || '',
    prerelease: Boolean(release.prerelease),
    installerAsset: pickWindowsInstallerAsset(release.assets),
  };
}

export async function openExternalUrl(url: string): Promise<void> {
  if (isTauriRuntime()) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('open_external_url', { url });
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Download the official Windows installer from GitHub Releases and launch it (Tauri desktop),
 * or open the download URL directly in browser mode.
 */
export async function downloadAndInstallUpdate(asset: UpdateAssetInfo): Promise<void> {
  if (!isTauriRuntime()) {
    window.open(asset.downloadUrl, '_blank', 'noopener,noreferrer');
    return;
  }
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('download_and_launch_installer', {
    url: asset.downloadUrl,
    fileName: asset.name,
  });
}
