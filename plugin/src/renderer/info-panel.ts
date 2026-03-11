// ─── Info Panel — Node detail display ────────────────────────
// Zero Obsidian dependencies. DOM-only UI.

import type { NodeDef, CategoryDef } from '../types';
import type { ThemeColors } from './theme';
import type { ConnectionList, ConnectionInfo } from './canvas';

// ─── Types ──────────────────────────────────────────────────

export interface InfoPanelCallbacks {
  onConnectionClick: (nodeId: string) => void;
}

// ─── Helpers ────────────────────────────────────────────────

/** Returns a readable text color for a given category color against dark backgrounds */
function readableColor(hex: string): string {
  // Parse hex
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  // Relative luminance (WCAG)
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // If too dark for a dark background, lighten it
  if (lum < 0.25) {
    const boost = Math.round(Math.min(255, (r * 255) + 120));
    const boostG = Math.round(Math.min(255, (g * 255) + 120));
    const boostB = Math.round(Math.min(255, (b * 255) + 120));
    return `rgb(${boost}, ${boostG}, ${boostB})`;
  }
  return hex;
}

// ─── InfoPanel ──────────────────────────────────────────────

export class InfoPanel {
  private container: HTMLDivElement;
  private el: HTMLDivElement;
  private callbacks: InfoPanelCallbacks;
  private theme: ThemeColors;

  constructor(
    container: HTMLDivElement,
    callbacks: InfoPanelCallbacks,
    theme: ThemeColors,
  ) {
    this.container = container;
    this.callbacks = callbacks;
    this.theme = theme;

    this.el = document.createElement('div');
    this.el.className = 'bp-info-panel';
    this.applyStyles();
    this.el.style.display = 'none';
    this.container.appendChild(this.el);
  }

  // ─── Styles ───────────────────────────────────────────

  private applyStyles(): void {
    Object.assign(this.el.style, {
      position: 'absolute',
      bottom: '12px',
      left: '12px',
      zIndex: '15',
      background: this.theme.panelBg,
      border: `1px solid ${this.theme.panelBorder}`,
      borderRadius: '6px',
      padding: '12px 16px',
      maxWidth: '520px',
      minWidth: '320px',
      color: this.theme.panelText,
      fontSize: '11px',
      maxHeight: '240px',
      overflowY: 'auto',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      transition: 'right 0.15s ease',
    });
  }

  // ─── Show/Hide ────────────────────────────────────────

  /** Show info for a node, or hide if null */
  show(
    node: NodeDef | null,
    categories: Record<string, CategoryDef>,
    connections: ConnectionList,
    connectionCount: number,
  ): void {
    // Clear existing content
    while (this.el.firstChild) {
      this.el.removeChild(this.el.firstChild);
    }

    if (!node) {
      this.el.style.display = 'none';
      return;
    }

    this.el.style.display = 'block';
    const cat = categories[node.cat];
    if (!cat) return;

    const safeColor = readableColor(cat.color);

    // ─── Header row (title + category + path) ───
    const header = document.createElement('div');
    Object.assign(header.style, {
      marginBottom: '8px',
      paddingBottom: '8px',
      borderBottom: `1px solid ${this.theme.panelBorder}`,
    });

    // Title
    const h2 = document.createElement('h2');
    Object.assign(h2.style, {
      fontSize: '14px',
      fontWeight: '600',
      marginBottom: '2px',
      color: safeColor,
    });
    h2.textContent = node.title;
    header.appendChild(h2);

    // Category + connection count on same line
    const metaRow = document.createElement('div');
    Object.assign(metaRow.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      marginBottom: '2px',
    });

    const catDiv = document.createElement('span');
    Object.assign(catDiv.style, {
      fontSize: '10px',
      textTransform: 'uppercase',
      letterSpacing: '1px',
      color: safeColor + 'bb',
    });
    catDiv.textContent = cat.label;
    metaRow.appendChild(catDiv);

    // Connection count badge
    const badge = document.createElement('span');
    Object.assign(badge.style, {
      display: 'inline-block',
      padding: '1px 6px',
      borderRadius: '3px',
      fontSize: '10px',
      background: safeColor + '20',
      color: safeColor,
    });
    badge.textContent = connectionCount + ' connection' + (connectionCount !== 1 ? 's' : '');
    metaRow.appendChild(badge);

    header.appendChild(metaRow);

    // File path
    if (node.path) {
      const pathDiv = document.createElement('div');
      Object.assign(pathDiv.style, {
        color: this.theme.textMuted,
        fontSize: '10px',
        fontStyle: 'italic',
      });
      pathDiv.textContent = node.path;
      header.appendChild(pathDiv);
    }

    this.el.appendChild(header);

    // ─── Connections: side-by-side columns ───
    const hasOutgoing = connections.outgoing.length > 0;
    const hasIncoming = connections.incoming.length > 0;

    if (hasOutgoing || hasIncoming) {
      const columns = document.createElement('div');
      Object.assign(columns.style, {
        display: 'flex',
        gap: '16px',
      });

      if (hasOutgoing) {
        const col = this.buildConnColumn('Outgoing', connections.outgoing, '\u2192', categories);
        col.style.flex = '1';
        col.style.minWidth = '0';
        columns.appendChild(col);
      }

      if (hasIncoming) {
        const col = this.buildConnColumn('Incoming', connections.incoming, '\u2190', categories);
        col.style.flex = '1';
        col.style.minWidth = '0';
        columns.appendChild(col);
      }

      this.el.appendChild(columns);
    }
  }

  // ─── Connection Column Builder ─────────────────────

  private buildConnColumn(
    title: string,
    items: ConnectionInfo[],
    arrowChar: string,
    categories: Record<string, CategoryDef>,
  ): HTMLDivElement {
    const col = document.createElement('div');

    const h3 = document.createElement('h3');
    Object.assign(h3.style, {
      fontSize: '10px',
      color: this.theme.panelTextMuted,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      marginBottom: '4px',
      fontWeight: 'normal',
    });
    h3.textContent = `${title} (${items.length})`;
    col.appendChild(h3);

    const list = document.createElement('div');
    list.style.maxHeight = '140px';
    list.style.overflowY = 'auto';

    for (const conn of items) {
      const row = document.createElement('div');
      Object.assign(row.style, {
        padding: '2px 0',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        cursor: 'pointer',
        color: this.theme.panelText,
        fontSize: '11px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      });

      row.addEventListener('mouseenter', () => {
        row.style.color = this.theme.textPrimary;
      });
      row.addEventListener('mouseleave', () => {
        row.style.color = this.theme.panelText;
      });

      // Arrow
      const arrow = document.createElement('span');
      arrow.style.color = this.theme.textMuted;
      arrow.style.flexShrink = '0';
      arrow.style.fontSize = '10px';
      arrow.textContent = arrowChar;
      row.appendChild(arrow);

      // Color dot
      const dot = document.createElement('span');
      Object.assign(dot.style, {
        width: '5px',
        height: '5px',
        borderRadius: '1px',
        flexShrink: '0',
        display: 'inline-block',
      });
      const connCat = categories[conn.node.cat];
      dot.style.background = connCat ? connCat.color : '#888';
      row.appendChild(dot);

      // Node name
      const nameSpan = document.createElement('span');
      nameSpan.style.overflow = 'hidden';
      nameSpan.style.textOverflow = 'ellipsis';
      nameSpan.textContent = conn.node.title;
      row.appendChild(nameSpan);

      // Click to navigate
      const nodeId = conn.node.id;
      row.addEventListener('click', () => {
        this.callbacks.onConnectionClick(nodeId);
      });

      list.appendChild(row);
    }

    col.appendChild(list);
    return col;
  }

  // ─── Public API ───────────────────────────────────────

  /** Adjust right offset (e.g. when controls panel is open) */
  setRightOffset(_px: number): void {
    // Info panel is now on the left — no right offset needed
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
  }
}
