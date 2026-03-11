// ─── Stats Bar — Node/wire/category counts ──────────────────
// Zero Obsidian dependencies. DOM-only UI.

import type { ThemeColors } from './theme';

// ─── StatsBar ───────────────────────────────────────────────

export class StatsBar {
  private container: HTMLDivElement;
  private el: HTMLDivElement;
  private theme: ThemeColors;

  constructor(container: HTMLDivElement, theme: ThemeColors) {
    this.container = container;
    this.theme = theme;

    this.el = document.createElement('div');
    this.el.className = 'bp-stats';
    this.applyStyles();
    this.container.appendChild(this.el);
  }

  // ─── Styles ───────────────────────────────────────────

  private applyStyles(): void {
    Object.assign(this.el.style, {
      position: 'absolute',
      bottom: '12px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '10',
      fontSize: '10px',
      color: this.theme.textMuted,
      letterSpacing: '0.5px',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      whiteSpace: 'nowrap',
    });
  }

  // ─── Public API ───────────────────────────────────────

  /** Update displayed counts */
  update(nodeCount: number, wireCount: number, categoryCount: number): void {
    this.el.textContent =
      `${nodeCount} nodes \u00b7 ${wireCount} connections \u00b7 ${categoryCount} categories`;
  }

  /** Update theme colors */
  setTheme(theme: ThemeColors): void {
    this.theme = theme;
    this.applyStyles();
  }

  /** Remove DOM element */
  destroy(): void {
    if (this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
  }
}
