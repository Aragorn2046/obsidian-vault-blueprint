// ─── Preview Tooltip — Note content on hover ────────────────
// Shows first ~200 chars of a note when hovering a node.
// DOM-based overlay. Zero Obsidian dependencies.

import type { ThemeColors } from './theme';

export class PreviewTooltip {
  private el: HTMLDivElement;
  private container: HTMLDivElement;
  private visible = false;
  private currentNodeId: string | null = null;
  private showTimer: ReturnType<typeof setTimeout> | null = null;
  private cache: Map<string, string> = new Map();

  // Callback to fetch content (provided by view.ts)
  private fetchContent: ((nodeId: string) => Promise<string | null>) | null = null;

  constructor(container: HTMLDivElement, theme: ThemeColors) {
    this.container = container;
    this.el = document.createElement('div');
    this.el.className = 'blueprint-preview-tooltip';
    this.el.style.display = 'none';
    this.container.appendChild(this.el);
  }

  /** Set the content fetcher callback */
  setFetcher(fn: (nodeId: string) => Promise<string | null>): void {
    this.fetchContent = fn;
  }

  /** Schedule showing tooltip for a node at given position */
  scheduleShow(nodeId: string, screenX: number, screenY: number): void {
    if (this.currentNodeId === nodeId && this.visible) return;

    this.cancelShow();
    this.currentNodeId = nodeId;

    this.showTimer = setTimeout(async () => {
      await this.show(nodeId, screenX, screenY);
    }, 400); // 400ms delay to avoid flicker
  }

  /** Hide and cancel any pending show */
  hide(): void {
    this.cancelShow();
    this.visible = false;
    this.currentNodeId = null;
    this.el.style.display = 'none';
  }

  /** Clean up cached content */
  clearCache(): void {
    this.cache.clear();
  }

  setTheme(_theme: ThemeColors): void {
    // Styled via CSS vars
  }

  destroy(): void {
    this.cancelShow();
    if (this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
  }

  private cancelShow(): void {
    if (this.showTimer) {
      clearTimeout(this.showTimer);
      this.showTimer = null;
    }
  }

  private async show(nodeId: string, screenX: number, screenY: number): Promise<void> {
    let content = this.cache.get(nodeId);

    if (content === undefined && this.fetchContent) {
      content = await this.fetchContent(nodeId) ?? undefined;
      if (content !== undefined) {
        this.cache.set(nodeId, content);
      }
    }

    // Might have been cancelled during async fetch
    if (this.currentNodeId !== nodeId) return;
    if (!content) return;

    // Clear and set content safely
    while (this.el.firstChild) {
      this.el.removeChild(this.el.firstChild);
    }

    const textNode = document.createTextNode(content);
    this.el.appendChild(textNode);

    // Position near cursor but within bounds
    const containerRect = this.container.getBoundingClientRect();
    let x = screenX - containerRect.left + 15;
    let y = screenY - containerRect.top + 15;

    this.el.style.display = 'block';
    this.visible = true;

    // Clamp to container bounds
    const elRect = this.el.getBoundingClientRect();
    if (x + elRect.width > containerRect.width - 10) {
      x = screenX - containerRect.left - elRect.width - 15;
    }
    if (y + elRect.height > containerRect.height - 10) {
      y = screenY - containerRect.top - elRect.height - 15;
    }

    this.el.style.left = Math.max(5, x) + 'px';
    this.el.style.top = Math.max(5, y) + 'px';
  }
}
