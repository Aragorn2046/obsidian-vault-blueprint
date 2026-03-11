// ─── Legend — Category visibility toggles + color picker ─────
// Zero Obsidian dependencies. DOM-only UI.

import type { CategoryDef } from '../types';
import type { ThemeColors } from './theme';

// ─── Types ──────────────────────────────────────────────────

export interface LegendCallbacks {
  onCategoryToggle: (catKey: string, visible: boolean) => void;
  onAllCategories: (visible: boolean) => void;
  onColorChange?: (catKey: string, color: string, dark: string) => void;
  onAddCategory?: (label: string, color: string) => void;
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
      transition: 'right 0.15s ease',
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

      // Color dot (clickable — opens color picker)
      const dot = document.createElement('div');
      dot.className = 'bp-leg-dot';
      Object.assign(dot.style, {
        width: '12px',
        height: '12px',
        borderRadius: '3px',
        background: cat.color,
        flexShrink: '0',
        cursor: 'pointer',
        border: '1px solid rgba(255,255,255,0.2)',
        position: 'relative',
      });
      dot.title = 'Click to change color';

      // Hidden color input
      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = cat.color;
      Object.assign(colorInput.style, {
        position: 'absolute',
        width: '0',
        height: '0',
        padding: '0',
        border: 'none',
        opacity: '0',
        pointerEvents: 'none',
      });
      dot.appendChild(colorInput);

      dot.addEventListener('click', (e) => {
        e.stopPropagation(); // Don't trigger row click (visibility toggle)
        colorInput.click();
      });

      colorInput.addEventListener('input', (e) => {
        e.stopPropagation();
        const newColor = colorInput.value;
        dot.style.background = newColor;
        // Generate a darker variant for the "dark" field
        const dark = this.darkenColor(newColor, 0.3);
        cat.color = newColor;
        cat.dark = dark;
        if (this.callbacks.onColorChange) {
          this.callbacks.onColorChange(key, newColor, dark);
        }
      });

      // Prevent color input clicks from toggling visibility
      colorInput.addEventListener('click', (e) => e.stopPropagation());

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

      // Click handler (toggles visibility — NOT on dot)
      row.addEventListener('click', () => {
        const newVisible = !cat.visible;
        cat.visible = newVisible;
        this.syncRow(row, check, newVisible);
        this.callbacks.onCategoryToggle(key, newVisible);
      });

      this.el.appendChild(row);
      this.rows.set(key, row);
    }

    // "Add Category" button
    if (this.callbacks.onAddCategory) {
      const addBtn = document.createElement('div');
      Object.assign(addBtn.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        margin: '6px 0 0',
        padding: '4px 0',
        fontSize: '10px',
        color: this.theme.textMuted,
        cursor: 'pointer',
        borderTop: `1px solid ${this.theme.panelBorder}`,
      });
      addBtn.textContent = '+ Add Category';
      addBtn.addEventListener('mouseenter', () => {
        addBtn.style.color = this.theme.textPrimary;
      });
      addBtn.addEventListener('mouseleave', () => {
        addBtn.style.color = this.theme.textMuted;
      });
      addBtn.addEventListener('click', () => {
        this.showAddCategoryDialog();
      });
      this.el.appendChild(addBtn);
    }
  }

  /** Show inline add category dialog */
  private showAddCategoryDialog(): void {
    // Create a simple inline form
    const dialog = document.createElement('div');
    Object.assign(dialog.style, {
      marginTop: '6px',
      padding: '8px',
      background: 'rgba(0,0,0,0.2)',
      borderRadius: '4px',
    });

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Category name';
    Object.assign(nameInput.style, {
      width: '100%',
      background: 'rgba(255,255,255,0.1)',
      border: `1px solid ${this.theme.panelBorder}`,
      borderRadius: '3px',
      padding: '4px 6px',
      color: this.theme.panelText,
      fontSize: '11px',
      fontFamily: 'inherit',
      marginBottom: '6px',
      boxSizing: 'border-box',
    });
    dialog.appendChild(nameInput);

    const colorRow = document.createElement('div');
    colorRow.style.display = 'flex';
    colorRow.style.gap = '6px';
    colorRow.style.alignItems = 'center';

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    colorInput.style.width = '28px';
    colorInput.style.height = '24px';
    colorInput.style.border = 'none';
    colorInput.style.cursor = 'pointer';
    colorRow.appendChild(colorInput);

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Add';
    Object.assign(saveBtn.style, {
      flex: '1',
      background: this.theme.buttonBg,
      border: `1px solid ${this.theme.buttonBorder}`,
      color: this.theme.buttonText,
      padding: '3px 8px',
      borderRadius: '3px',
      fontSize: '10px',
      cursor: 'pointer',
      fontFamily: 'inherit',
    });
    colorRow.appendChild(saveBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    Object.assign(cancelBtn.style, {
      background: 'transparent',
      border: `1px solid ${this.theme.panelBorder}`,
      color: this.theme.textMuted,
      padding: '3px 8px',
      borderRadius: '3px',
      fontSize: '10px',
      cursor: 'pointer',
      fontFamily: 'inherit',
    });
    colorRow.appendChild(cancelBtn);

    dialog.appendChild(colorRow);

    saveBtn.addEventListener('click', () => {
      const label = nameInput.value.trim();
      if (label) {
        this.callbacks.onAddCategory?.(label, colorInput.value);
      }
      dialog.remove();
    });

    cancelBtn.addEventListener('click', () => {
      dialog.remove();
    });

    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const label = nameInput.value.trim();
        if (label) {
          this.callbacks.onAddCategory?.(label, colorInput.value);
        }
        dialog.remove();
      }
      if (e.key === 'Escape') dialog.remove();
    });

    this.el.appendChild(dialog);
    nameInput.focus();
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

  /** Generate a darker variant of a hex color */
  private darkenColor(hex: string, amount: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const dr = Math.round(r * (1 - amount));
    const dg = Math.round(g * (1 - amount));
    const db = Math.round(b * (1 - amount));
    return `#${dr.toString(16).padStart(2, '0')}${dg.toString(16).padStart(2, '0')}${db.toString(16).padStart(2, '0')}`;
  }

  // ─── Public API ───────────────────────────────────────

  /** Adjust right offset (e.g. when controls panel is open) */
  setRightOffset(px: number): void {
    this.el.style.right = `${12 + px}px`;
  }

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
