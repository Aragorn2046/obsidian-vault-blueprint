// ─── Filter Panel — Tag & Property filtering ─────────────────
// DOM-based overlay for filtering nodes by tags and frontmatter.

import type { NodeDef } from '../types';
import type { ThemeColors } from './theme';

// ─── Types ──────────────────────────────────────────────────

export interface FilterState {
  activeTags: Set<string>;         // selected tags (OR logic)
  propertyKey: string;             // active property key filter
  propertyValue: string;           // substring match for property value
  tagMode: 'any' | 'all';         // any = OR, all = AND
}

export interface FilterCallbacks {
  onFilterChange: (state: FilterState) => void;
}

// ─── Filter Panel ───────────────────────────────────────────

export class FilterPanel {
  private container: HTMLDivElement;
  private el: HTMLDivElement;
  private callbacks: FilterCallbacks;
  private theme: ThemeColors;
  private visible = false;

  // State
  private state: FilterState = {
    activeTags: new Set(),
    propertyKey: '',
    propertyValue: '',
    tagMode: 'any',
  };

  // Available options (computed from node data)
  private allTags: string[] = [];
  private allPropertyKeys: string[] = [];
  private tagCounts: Map<string, number> = new Map();

  constructor(
    container: HTMLDivElement,
    callbacks: FilterCallbacks,
    theme: ThemeColors,
  ) {
    this.container = container;
    this.callbacks = callbacks;
    this.theme = theme;

    this.el = document.createElement('div');
    this.el.className = 'bp-filter-panel';
    this.applyStyles();
    this.el.style.display = 'none';
    this.container.appendChild(this.el);
  }

  // ─── Styles ───────────────────────────────────────────

  private applyStyles(): void {
    Object.assign(this.el.style, {
      position: 'absolute',
      top: '12px',
      left: '12px',
      zIndex: '15',
      background: this.theme.panelBg,
      border: `1px solid ${this.theme.panelBorder}`,
      borderRadius: '6px',
      padding: '10px 14px',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      fontSize: '11px',
      color: this.theme.panelText,
      maxHeight: '400px',
      maxWidth: '260px',
      overflowY: 'auto',
      userSelect: 'none',
    });
  }

  // ─── Data ─────────────────────────────────────────────

  /** Rebuild available tags and properties from node data */
  setNodes(nodes: NodeDef[]): void {
    const tagSet = new Map<string, number>();
    const propKeys = new Set<string>();

    for (const n of nodes) {
      if (n.tags) {
        for (const t of n.tags) {
          tagSet.set(t, (tagSet.get(t) ?? 0) + 1);
        }
      }
      if (n.properties) {
        for (const key of Object.keys(n.properties)) {
          // Skip internal/obsidian metadata keys
          if (key === 'position' || key === 'cssclasses') continue;
          propKeys.add(key);
        }
      }
    }

    // Sort tags by frequency (most common first)
    this.allTags = [...tagSet.keys()].sort((a, b) => (tagSet.get(b) ?? 0) - (tagSet.get(a) ?? 0));
    this.tagCounts = tagSet;
    this.allPropertyKeys = [...propKeys].sort();

    // Remove stale active tags
    for (const t of this.state.activeTags) {
      if (!tagSet.has(t)) this.state.activeTags.delete(t);
    }

    if (this.visible) this.rebuild();
  }

  // ─── Build UI ─────────────────────────────────────────

  private rebuild(): void {
    while (this.el.firstChild) {
      this.el.removeChild(this.el.firstChild);
    }

    // ── Header ──
    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '8px',
      paddingBottom: '6px',
      borderBottom: `1px solid ${this.theme.panelBorder}`,
    });

    const title = document.createElement('span');
    title.textContent = 'Filters';
    title.style.fontWeight = 'bold';
    title.style.fontSize = '12px';
    header.appendChild(title);

    const clearBtn = this.createButton('Clear All');
    clearBtn.addEventListener('click', () => this.clearAll());
    header.appendChild(clearBtn);

    this.el.appendChild(header);

    // ── Tags Section ──
    if (this.allTags.length > 0) {
      const tagSection = document.createElement('div');
      tagSection.style.marginBottom = '10px';

      const tagHeader = document.createElement('div');
      Object.assign(tagHeader.style, {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '4px',
      });

      const tagLabel = document.createElement('span');
      tagLabel.textContent = 'Tags';
      tagLabel.style.fontWeight = '600';
      tagLabel.style.fontSize = '11px';
      tagHeader.appendChild(tagLabel);

      // Mode toggle (Any/All)
      const modeBtn = this.createButton(this.state.tagMode === 'any' ? 'Any' : 'All');
      modeBtn.title = this.state.tagMode === 'any'
        ? 'Showing nodes with ANY selected tag'
        : 'Showing nodes with ALL selected tags';
      modeBtn.addEventListener('click', () => {
        this.state.tagMode = this.state.tagMode === 'any' ? 'all' : 'any';
        modeBtn.textContent = this.state.tagMode === 'any' ? 'Any' : 'All';
        modeBtn.title = this.state.tagMode === 'any'
          ? 'Showing nodes with ANY selected tag'
          : 'Showing nodes with ALL selected tags';
        this.fireChange();
      });
      tagHeader.appendChild(modeBtn);

      tagSection.appendChild(tagHeader);

      // Tag checkboxes
      const tagList = document.createElement('div');
      tagList.style.maxHeight = '180px';
      tagList.style.overflowY = 'auto';

      for (const tag of this.allTags) {
        const row = document.createElement('div');
        Object.assign(row.style, {
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '2px 0',
          cursor: 'pointer',
        });

        const check = document.createElement('div');
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
        const isActive = this.state.activeTags.has(tag);
        this.syncCheck(check, isActive);

        const label = document.createElement('span');
        label.textContent = tag;
        label.style.flex = '1';

        const count = document.createElement('span');
        count.textContent = String(this.tagCounts.get(tag) ?? 0);
        count.style.color = this.theme.textMuted;
        count.style.fontSize = '10px';

        row.appendChild(check);
        row.appendChild(label);
        row.appendChild(count);

        if (!isActive) {
          row.style.opacity = '0.6';
        }

        row.addEventListener('click', () => {
          if (this.state.activeTags.has(tag)) {
            this.state.activeTags.delete(tag);
            this.syncCheck(check, false);
            row.style.opacity = '0.6';
          } else {
            this.state.activeTags.add(tag);
            this.syncCheck(check, true);
            row.style.opacity = '1';
          }
          this.fireChange();
        });

        tagList.appendChild(row);
      }

      tagSection.appendChild(tagList);
      this.el.appendChild(tagSection);
    }

    // ── Property Filter Section ──
    if (this.allPropertyKeys.length > 0) {
      const propSection = document.createElement('div');

      const propLabel = document.createElement('span');
      propLabel.textContent = 'Property Filter';
      propLabel.style.fontWeight = '600';
      propLabel.style.fontSize = '11px';
      propLabel.style.display = 'block';
      propLabel.style.marginBottom = '4px';
      propSection.appendChild(propLabel);

      // Property key dropdown
      const keySelect = document.createElement('select');
      Object.assign(keySelect.style, {
        width: '100%',
        marginBottom: '4px',
        padding: '3px 4px',
        fontSize: '11px',
        background: this.theme.buttonBg,
        color: this.theme.buttonText,
        border: `1px solid ${this.theme.buttonBorder}`,
        borderRadius: '3px',
        fontFamily: 'inherit',
      });

      const emptyOpt = document.createElement('option');
      emptyOpt.value = '';
      emptyOpt.textContent = '— select property —';
      keySelect.appendChild(emptyOpt);

      for (const key of this.allPropertyKeys) {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = key;
        if (key === this.state.propertyKey) opt.selected = true;
        keySelect.appendChild(opt);
      }

      keySelect.addEventListener('change', () => {
        this.state.propertyKey = keySelect.value;
        this.fireChange();
      });
      propSection.appendChild(keySelect);

      // Property value input
      const valueInput = document.createElement('input');
      valueInput.type = 'text';
      valueInput.placeholder = 'value contains...';
      valueInput.value = this.state.propertyValue;
      Object.assign(valueInput.style, {
        width: '100%',
        padding: '3px 4px',
        fontSize: '11px',
        background: this.theme.buttonBg,
        color: this.theme.buttonText,
        border: `1px solid ${this.theme.buttonBorder}`,
        borderRadius: '3px',
        fontFamily: 'inherit',
        boxSizing: 'border-box',
      });

      let inputTimer: ReturnType<typeof setTimeout> | null = null;
      valueInput.addEventListener('input', () => {
        if (inputTimer) clearTimeout(inputTimer);
        inputTimer = setTimeout(() => {
          this.state.propertyValue = valueInput.value;
          this.fireChange();
        }, 200);
      });
      propSection.appendChild(valueInput);

      this.el.appendChild(propSection);
    }

    // ── Active filter count ──
    const activeCount = this.getActiveFilterCount();
    if (activeCount > 0) {
      const badge = document.createElement('div');
      Object.assign(badge.style, {
        marginTop: '8px',
        paddingTop: '6px',
        borderTop: `1px solid ${this.theme.panelBorder}`,
        fontSize: '10px',
        color: this.theme.textMuted,
      });
      badge.textContent = `${activeCount} active filter${activeCount > 1 ? 's' : ''}`;
      this.el.appendChild(badge);
    }
  }

  // ─── Helpers ──────────────────────────────────────────

  private createButton(text: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    Object.assign(btn.style, {
      background: this.theme.buttonBg,
      border: `1px solid ${this.theme.buttonBorder}`,
      color: this.theme.buttonText,
      padding: '2px 8px',
      borderRadius: '3px',
      fontSize: '10px',
      cursor: 'pointer',
      fontFamily: 'inherit',
    });
    btn.addEventListener('mouseenter', () => {
      btn.style.background = this.theme.buttonHoverBg;
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = this.theme.buttonBg;
    });
    return btn;
  }

  private syncCheck(check: HTMLDivElement, active: boolean): void {
    if (active) {
      check.textContent = '\u2713';
      check.style.background = 'rgba(255,255,255,0.1)';
    } else {
      check.textContent = '';
      check.style.background = 'transparent';
    }
  }

  private fireChange(): void {
    this.callbacks.onFilterChange({ ...this.state });
  }

  private clearAll(): void {
    this.state.activeTags.clear();
    this.state.propertyKey = '';
    this.state.propertyValue = '';
    this.fireChange();
    this.rebuild();
  }

  /** Count of active filters */
  getActiveFilterCount(): number {
    let count = 0;
    if (this.state.activeTags.size > 0) count++;
    if (this.state.propertyKey && this.state.propertyValue) count++;
    return count;
  }

  // ─── Public API ───────────────────────────────────────

  /** Check if a node passes the current filters */
  static passesFilter(node: NodeDef, state: FilterState): boolean {
    // Tag filter
    if (state.activeTags.size > 0) {
      const nodeTags = node.tags ?? [];
      if (state.tagMode === 'any') {
        // OR: node must have at least one of the active tags
        const match = nodeTags.some(t => state.activeTags.has(t));
        if (!match) return false;
      } else {
        // AND: node must have all active tags
        for (const t of state.activeTags) {
          if (!nodeTags.includes(t)) return false;
        }
      }
    }

    // Property filter
    if (state.propertyKey && state.propertyValue) {
      const props = node.properties;
      if (!props) return false;
      const val = props[state.propertyKey];
      if (val === undefined || val === null) return false;
      const valStr = String(val).toLowerCase();
      if (!valStr.includes(state.propertyValue.toLowerCase())) return false;
    }

    return true;
  }

  /** Get current filter state */
  getState(): FilterState {
    return { ...this.state };
  }

  /** Check if any filters are active */
  hasActiveFilters(): boolean {
    return this.state.activeTags.size > 0 ||
      (!!this.state.propertyKey && !!this.state.propertyValue);
  }

  toggle(): void {
    this.visible = !this.visible;
    if (this.visible) {
      this.rebuild();
      this.el.style.display = 'block';
    } else {
      this.el.style.display = 'none';
    }
  }

  show(): void {
    this.visible = true;
    this.rebuild();
    this.el.style.display = 'block';
  }

  hide(): void {
    this.visible = false;
    this.el.style.display = 'none';
  }

  setTheme(theme: ThemeColors): void {
    this.theme = theme;
    this.applyStyles();
    if (this.visible) this.rebuild();
  }

  destroy(): void {
    if (this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
  }
}
