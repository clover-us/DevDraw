import { isTauriRuntime } from '../storage/adapter';

/**
 * Rasterize a standalone DevDraw SVG string into a high-DPI (default 2x Retina) PNG Blob.
 */
export async function rasterizeSvgToPngBlob(svgMarkup: string, scale = 2): Promise<Blob> {
  const widthMatch = svgMarkup.match(/\bwidth="(\d+(?:\.\d+)?)"/);
  const heightMatch = svgMarkup.match(/\bheight="(\d+(?:\.\d+)?)"/);
  const width = Math.max(320, Math.ceil(Number(widthMatch?.[1] ?? 1024)));
  const height = Math.max(200, Math.ceil(Number(heightMatch?.[1] ?? 640)));

  const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('SVG 转 PNG 渲染失败'));
      el.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法初始化 Canvas 2D 上下文');

    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((result) => resolve(result), 'image/png')
    );
    if (!blob) throw new Error('PNG 编码失败');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface SaveExportOptions {
  defaultFileName: string;
  extension: string;
  filterName: string;
  content: string | Blob;
}

/**
 * Save exported text or binary PNG via:
 * - Tauri native Save dialog (`@tauri-apps/plugin-dialog` + `save_export_file` IPC)
 * - Standard browser file download fallback
 */
export async function saveExportedFile(
  options: SaveExportOptions
): Promise<'saved' | 'cancelled'> {
  const { defaultFileName, extension, filterName, content } = options;

  if (isTauriRuntime()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { invoke } = await import('@tauri-apps/api/core');

    const chosenPath = await save({
      title: `导出 ${filterName}`,
      defaultPath: defaultFileName,
      filters: [{ name: filterName, extensions: [extension] }],
    });
    if (!chosenPath) return 'cancelled';

    const bytes =
      typeof content === 'string'
        ? Array.from(new TextEncoder().encode(content))
        : Array.from(new Uint8Array(await content.arrayBuffer()));

    await invoke('save_export_file', {
      path: chosenPath,
      bytes,
    });
    return 'saved';
  }

  const blob =
    typeof content === 'string'
      ? new Blob([content], { type: 'text/plain;charset=utf-8' })
      : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = defaultFileName;
  a.click();
  URL.revokeObjectURL(url);
  return 'saved';
}
