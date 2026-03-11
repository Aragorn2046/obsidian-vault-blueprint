// ─── Search Panel — Node search with fuzzy matching ─────────
// Zero Obsidian dependencies. DOM-only UI.

import type { NodeDef, CategoryDef } from '../types';
import type { ThemeColors } from './theme';

// ─── Types ──────────────────────────────────────────────────

export interface SearchResult {
  node: NodeDef;
  matchField: 'title' | 'desc' | 'path';
  score: number;
}

export interface SearchCallbacks {
  onSearch: (query: string) => SearchResult[];
  onResultClick: (nodeId: string) => void;
  onClear: () => void;
  onFocusRequest: () => void;
}

// ─── SearchPanel ────────────────────────────────────────────

export class SearchPanel {
  private container: HTMLDivElement;
  private el: HTMLDivElement;
  private input: HTMLInputElement;
  private resultsList: HTMLDivElement;
  private callbacks: SearchCallbacks;
  private theme: ThemeColors;
  private categories: Record<string, CategoryDef> = {};

  constructor(
    container: HTMLDivElement,
    callbacks: SearchCallbacks,
    theme: ThemeColors,
  ) {
    this.container = container;
    this.callbacks = callbacks;
    this.theme = theme;

    // Create wrapper
    this.el = document.createElement('div');
    this.el.className = 'bp-search';
    this.applyWrapperStyles();

    // Create input
    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.className = 'bp-search-box';
    this.input.placeholder = 'Search nodes... (Ctrl+F)';
    this.applyInputStyles();

    // Create results container
    this.resultsList = document.createElement('div');
    this.resultsList.className = 'bp-search-results';
    this.applyResultsStyles();

    this.el.appendChild(this.input);
    this.el.appendChild(this.resultsList);
    this.container.appendChild(this.el);

    // Bind events
    this.input.addEventListener('input', this.onInput);
    this.input.addEventListener('keydown', this.onKeyDown);
  }

  // ─── Styles ───────────────────────────────────────────

  private applyWrapperStyles(): void {
    Object.assign(this.el.style, {
      position: 'absolute',
      top: '12px',
      left: '12px',
      zIndex: '10',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
    });
  }

  private applyInputStyles(): void {
    Object.assign(this.input.style, {
      background: this.theme.inputBg,
      border: `1px solid ${this.theme.inputBorder}`,
      color: this.theme.textPrimary,
      padding: '5px 10px',
      borderRadius: '4px',
      fontSize: '12px',
      width: '220px',
      outline: 'none',
      fontFamily: 'inherit',
    });

    // Focus style
    this.input.addEventListener('focus', () => {
      this.input.style.borderColor = this.theme.inputFocusBorder;
    });
    this.input.addEventListener('blur', () => {
      this.input.style.borderColor = this.theme.inputBorder;
    });
  }

  private applyResultsStyles(): void {
    Object.assign(this.resultsList.style, {
      marginTop: '4px',
      fontSize: '11px',
      color: this.theme.panelTextMuted,
      maxHeight: '180px',
      overflowY: 'auto',
    });
  }

  // ─── Event Handlers ───────────────────────────────────

  private onInput = (): void => {
    const query = this.input.value.trim();
    if (!query) {
      this.clearResults();
      this.callbacks.onClear();
      return;
    }
    const results = this.callbacks.onSearch(query);
    this.renderResults(results);
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      this.input.value = '';
      this.clearResults();
      this.callbacks.onClear();
      this.input.blur();
    }
    if (e.key === 'Enter') {
      const query = this.input.value.trim();
      if (query) {
        const results = this.callbacks.onSearch(query);
        if (results.length > 0) {
          this.callbacks.onResultClick(results[0].node.id);
        }
      }
    }
    e.stopPropagation();
  };

  // ─── Rendering ────────────────────────────────────────

  private renderResults(results: SearchResult[]): void {
    this.clearResults();

    if (results.length === 0) {
      const none = document.createElement('div');
      Object.assign(none.style, {
        padding: '4px 6px',
        color: this.theme.textMuted,
      });
      none.textContent = 'No matches';
      this.resultsList.appendChild(none);
      return;
    }

    for (const result of results) {
      const item = document.createElement('div');
      item.className = 'bp-search-item';
      Object.assign(item.style, {
        padding: '3px 6px',
        cursor: 'pointer',
        borderRadius: '3px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        color: this.theme.panelTextMuted,
      });

      item.addEventListener('mouseenter', () => {
        item.style.background = 'rgba(99,102,241,0.2)';
        item.style.color = this.theme.textPrimary;
      });
      item.addEventListener('mouseleave', () => {
        item.style.background = 'transparent';
        item.style.color = this.theme.panelTextMuted;
      });

      // Category color dot
      const dot = document.createElement('span');
      Object.assign(dot.style, {
        width: '6px',
        height: '6px',
        borderRadius: '2px',
        flexShrink: '0',
        display: 'inline-block',
      });
      const cat = this.categories[result.node.cat];
      dot.style.background = cat ? cat.color : '#888';
      item.appendChild(dot);

      // Node title
      item.appendChild(document.createTextNode(result.node.title));

      const nodeId = result.node.id;
      item.addEventListener('click', () => {
        this.callbacks.onResultClick(nodeId);
      });

      this.resultsList.appendChild(item);
    }
  }

  private clearResults(): void {
    while (this.resultsList.firstChild) {
      this.resultsList.removeChild(this.resultsList.firstChild);
    }
  }

  // ─── Public API ───────────────────────────────────────

  /** Focus the search input */
  focus(): void {
    this.input.focus();
    this.input.select();
  }

  /** Clear search input and results */
  clear(): void {
    this.input.value = '';
    this.clearResults();
  }

  /** Update the categories reference (for dot colors) */
  setCategories(categories: Record<string, CategoryDef>): void {
    this.categories = categories;
  }

  /** Update theme colors */
  setTheme(theme: ThemeColors): void {
    this.theme = theme;
    this.applyInputStyles();
    this.applyResultsStyles();
  }

  /** Remove all DOM elements and listeners */
  destroy(): void {
    this.input.removeEventListener('input', this.onInput);
    this.input.removeEventListener('keydown', this.onKeyDown);
    if (this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
  }
}
