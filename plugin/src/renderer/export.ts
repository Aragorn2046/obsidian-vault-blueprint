// ─── Export — PNG download + SVG stub ────────────────────────
// Zero Obsidian dependencies. Browser download API only.

import { Notice } from 'obsidian';

/**
 * Export the current canvas content as a PNG file and trigger a browser download.
 *
 * Uses the canvas as-is (already rendered at device pixel ratio by the renderer),
 * so the exported image matches what the user sees at full resolution.
 */
export async function exportToPng(
  canvas: HTMLCanvasElement,
  filename?: string,
): Promise<void> {
  const name = filename ?? 'vault-blueprint-export.png';

  return new Promise<void>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to create PNG blob from canvas'));
          return;
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.style.display = 'none';

        document.body.appendChild(a);
        a.click();

        // Clean up after a tick — browser needs the URL alive during download initiation
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          resolve();
        }, 100);
      },
      'image/png',
    );
  });
}

/**
 * SVG export stub — full SVG re-rendering is complex (need to replay all
 * canvas draw calls as SVG elements). Shows a notice for now.
 */
export function exportToSvg(): void {
  new Notice('SVG export coming soon');
}
