// ─── Context Menu — Right-click menu for nodes ──────────────
// DOM-based floating menu. Styled to match Obsidian's native menus.

import type { ThemeColors } from './theme';

export interface ContextMenuCallbacks {
  onOpen: (nodeId: string) => void;
  onOpenNewPane: (nodeId: string) => void;
  onRevealInExplorer: (nodeId: string) => void;
  onCopyWikiLink: (nodeId: string) => void;
  onShowBacklinks: (nodeId: string) => void;
  onDeleteNote: (nodeId: string) => void;
  onResetNodePosition: (nodeId: string) => void;
}

export class ContextMenu {
  private el: HTMLDivElement;
  private callbacks: ContextMenuCallbacks;
  private activeNodeId: string | null = null;
  private clickAwayHandler: (e: MouseEvent) => void;

  constructor(
    private container: HTMLDivElement,
    callbacks: ContextMenuCallbacks,
    _theme: ThemeColors,
  ) {
    this.callbacks = callbacks;

    this.el = document.createElement('div');
    this.el.className = 'blueprint-context-menu';
    this.el.style.display = 'none';
    document.body.appendChild(this.el);

    this.clickAwayHandler = (e: MouseEvent) => {
      if (!this.el.contains(e.target as Node)) {
        this.hide();
      }
    };
  }

  show(nodeId: string, screenX: number, screenY: number): void {
    this.activeNodeId = nodeId;

    // Clear existing children safely
    while (this.el.firstChild) {
      this.el.removeChild(this.el.firstChild);
    }

    const items: { label: string; action: () => void; separator?: boolean; danger?: boolean }[] = [
      { label: 'Open Note', action: () => this.fire('onOpen') },
      { label: 'Open in New Pane', action: () => this.fire('onOpenNewPane') },
      { label: 'Reveal in Explorer', action: () => this.fire('onRevealInExplorer') },
      { label: 'Copy [[Wiki Link]]', action: () => this.fire('onCopyWikiLink'), separator: true },
      { label: 'Show Backlinks', action: () => this.fire('onShowBacklinks'), separator: true },
      { label: 'Reset Position', action: () => this.fire('onResetNodePosition') },
      { label: 'Delete Note', action: () => this.fire('onDeleteNote'), separator: true, danger: true },
    ];

    for (const item of items) {
      if (item.separator) {
        const sep = document.createElement('div');
        sep.className = 'blueprint-context-separator';
        this.el.appendChild(sep);
      }

      const row = document.createElement('div');
      row.className = 'blueprint-context-item';
      row.textContent = item.label;

      if (item.danger) {
        row.classList.add('blueprint-context-danger');
      }

      row.addEventListener('click', (e) => {
        e.stopPropagation();
        item.action();
        this.hide();
      });

      this.el.appendChild(row);
    }

    // Position menu near click, keeping it on screen
    this.el.style.display = 'block';
    const menuRect = this.el.getBoundingClientRect();
    const maxX = window.innerWidth - menuRect.width - 8;
    const maxY = window.innerHeight - menuRect.height - 8;
    this.el.style.left = Math.min(screenX, maxX) + 'px';
    this.el.style.top = Math.min(screenY, maxY) + 'px';

    // Delayed click-away listener to avoid immediate close
    setTimeout(() => {
      document.addEventListener('click', this.clickAwayHandler, true);
      document.addEventListener('contextmenu', this.clickAwayHandler, true);
    }, 50);
  }

  hide(): void {
    this.el.style.display = 'none';
    this.activeNodeId = null;
    document.removeEventListener('click', this.clickAwayHandler, true);
    document.removeEventListener('contextmenu', this.clickAwayHandler, true);
  }

  private fire(method: keyof ContextMenuCallbacks): void {
    if (this.activeNodeId) {
      this.callbacks[method](this.activeNodeId);
    }
  }

  setTheme(_theme: ThemeColors): void {
    // Menu uses CSS vars from Obsidian — no runtime theme needed
  }

  destroy(): void {
    this.hide();
    this.el.remove();
  }
}
