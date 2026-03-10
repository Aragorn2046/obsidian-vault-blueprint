// ─── Legend — Category visibility toggles ───────────────────
// Zero Obsidian dependencies. DOM-only UI.

import type { CategoryDef } from '../types';
import type { ThemeColors } from './theme';

// ─── Types ──────────────────────────────────────────────────

export interface LegendCallbacks {
  onCategoryToggle: (catKey: string, visible: boolean) => void;
  onAllCategories: (visible: boolean) => void;
}

// ─── Legend ──────────────────────────────────────────────────

export class Legend {
  private container: HTMLDivElement;
  private el: HTMLDivElement;
  private rows: Map<string, HTMLDivElement> = new Map();
  private callbacks: LegendCallbacks;
  private theme: ThemeColors;

  constructor(
    container: HTMLDivElement,
    callbacks: LegendCallbacks,
    theme: ThemeColors,
  ) {
    this.container = container;
    this.callbacks = callbacks;
    this.theme = theme;

    this.el = document.createElement('div');
    this.el.className = 'bp-legend';
    this.applyStyles();
    this.container.appendChild(this.el);
  }

  // ─── Styles ───────────────────────────────────────────

  private applyStyles(): void {
    Object.assign(this.el.style, {
      position: 'absolute',
      top: '12px',
      right: '12px',
      zIndex: '10',
      background: this.theme.panelBg,
      border: `1px solid ${this.theme.panelBorder}`,
      borderRadius: '6px',
      padding: '10px 14px',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
    });
  }

  // ─── Update ───────────────────────────────────────────

  /** Rebuild legend from categories */
  update(categories: Record<string, CategoryDef>): void {
    // Clear existing
    while (this.el.firstChild) {
      this.el.removeChild(this.el.firstChild);
    }
    this.rows.clear();

    // All/None buttons
    const btnRow = document.createElement('div');
    btnRow.className = 'bp-leg-btns';
    Object.assign(btnRow.style, {
      display: 'flex',
      gap: '4px',
      marginBottom: '6px',
      borderBottom: `1px solid ${this.theme.panelBorder}`,
      paddingBottom: '6px',
    });

    const btnAll = this.createButton('All');
    btnAll.addEventListener('click', () => this.callbacks.onAllCategories(true));

    const btnNone = this.createButton('None');
    btnNone.addEventListener('click', () => this.callbacks.onAllCategories(false));

    btnRow.appendChild(btnAll);
    btnRow.appendChild(btnNone);
    this.el.appendChild(btnRow);

    // Category rows
    for (const key of Object.keys(categories)) {
      const cat = categories[key];
      const row = document.createElement('div');
      row.className = 'bp-leg';
      row.dataset.catKey = key;
      Object.assign(row.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        margin: '3px 0',
        fontSize: '11px',
        color: this.theme.panelText,
        cursor: 'pointer',
        userSelect: 'none',
      });

      // Checkbox
      const check = document.createElement('div');
      check.className = 'bp-leg-check';
      Object.assign(check.style, {
        width: '10px',
        height: '10px',
        borderRadius: '2px',
        border: `1px solid ${this.theme.textMuted}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '8px',
        flexShrink: '0',
      });
      this.syncCheck(check, cat.visible !== false);
      row.appendChild(check);

      // Color dot
      const dot = document.createElement('div');
      dot.className = 'bp-leg-dot';
      Object.assign(dot.style, {
        width: '8px',
        height: '8px',
        borderRadius: '2px',
        background: cat.color,
        flexShrink: '0',
      });
      row.appendChild(dot);

      // Label
      row.appendChild(document.createTextNode(cat.label));

      // Opacity for disabled
      if (cat.visible === false) {
        row.style.opacity = '0.35';
      }

      // Hover effect
      row.addEventListener('mouseenter', () => {
        row.style.color = this.theme.textPrimary;
      });
      row.addEventListener('mouseleave', () => {
        row.style.color = this.theme.panelText;
      });

      // Click handler
      row.addEventListener('click', () => {
        const newVisible = !cat.visible;
        cat.visible = newVisible;
        this.syncRow(row, check, newVisible);
        this.callbacks.onCategoryToggle(key, newVisible);
      });

      this.el.appendChild(row);
      this.rows.set(key, row);
    }
  }

  // ─── Helpers ──────────────────────────────────────────

  private createButton(text: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'bp-leg-btn';
    btn.textContent = text;
    Object.assign(btn.style, {
      background: this.theme.buttonBg,
      border: `1px solid ${this.theme.buttonBorder}`,
      color: this.theme.buttonText,
      padding: '2px 8px',
      borderRadius: '3px',
      fontSize: '10px',
      cursor: 'pointer',
      flex: '1',
      textAlign: 'center',
      fontFamily: 'inherit',
    });

    btn.addEventListener('mouseenter', () => {
      btn.style.background = this.theme.buttonHoverBg;
      btn.style.color = this.theme.textPrimary;
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = this.theme.buttonBg;
      btn.style.color = this.theme.buttonText;
    });

    return btn;
  }

  private syncCheck(check: HTMLDivElement, visible: boolean): void {
    if (visible) {
      check.textContent = '\u2713';
      check.style.background = 'rgba(255,255,255,0.1)';
    } else {
      check.textContent = '';
      check.style.background = 'transparent';
    }
  }

  private syncRow(row: HTMLDivElement, check: HTMLDivElement, visible: boolean): void {
    this.syncCheck(check, visible);
    row.style.opacity = visible ? '1' : '0.35';
  }

  // ─── Public API ───────────────────────────────────────

  /** Update theme colors */
  setTheme(theme: ThemeColors): void {
    this.theme = theme;
    this.applyStyles();
  }

  /** Remove all DOM elements */
  destroy(): void {
    if (this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
    this.rows.clear();
  }
}
