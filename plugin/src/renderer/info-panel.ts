// ─── Info Panel — Node detail display ────────────────────────
// Zero Obsidian dependencies. DOM-only UI.

import type { NodeDef, CategoryDef } from '../types';
import type { ThemeColors } from './theme';
import type { ConnectionList, ConnectionInfo } from './canvas';

// ─── Types ──────────────────────────────────────────────────

export interface InfoPanelCallbacks {
  onConnectionClick: (nodeId: string) => void;
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
      top: '50%',
      right: '12px',
      transform: 'translateY(-50%)',
      zIndex: '15',
      background: this.theme.panelBg,
      border: `1px solid ${this.theme.panelBorder}`,
      borderRadius: '6px',
      padding: '14px 16px',
      width: '280px',
      color: this.theme.panelText,
      fontSize: '11px',
      maxHeight: '70vh',
      overflowY: 'auto',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
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

    // Title
    const h2 = document.createElement('h2');
    Object.assign(h2.style, {
      fontSize: '14px',
      fontWeight: '600',
      marginBottom: '4px',
      color: cat.color,
    });
    h2.textContent = node.title;
    this.el.appendChild(h2);

    // Category label
    const catDiv = document.createElement('div');
    Object.assign(catDiv.style, {
      fontSize: '10px',
      textTransform: 'uppercase',
      letterSpacing: '1px',
      marginBottom: '10px',
      color: cat.color + 'aa',
    });
    catDiv.textContent = cat.label;
    this.el.appendChild(catDiv);

    // File path
    if (node.path) {
      const pathDiv = document.createElement('div');
      Object.assign(pathDiv.style, {
        color: this.theme.textMuted,
        fontSize: '10px',
        fontStyle: 'italic',
        marginBottom: '8px',
      });
      pathDiv.textContent = node.path;
      this.el.appendChild(pathDiv);
    }

    // Description
    if (node.desc) {
      const descP = document.createElement('p');
      Object.assign(descP.style, {
        color: '#aab',
        fontSize: '11px',
        lineHeight: '1.5',
        marginBottom: '6px',
      });
      descP.textContent = node.desc;
      this.el.appendChild(descP);
    }

    // Connection count badge
    const badge = document.createElement('span');
    Object.assign(badge.style, {
      display: 'inline-block',
      padding: '1px 6px',
      borderRadius: '3px',
      fontSize: '10px',
      marginRight: '4px',
      background: cat.color + '25',
      color: cat.color,
    });
    badge.textContent = connectionCount + ' connection' + (connectionCount !== 1 ? 's' : '');
    this.el.appendChild(badge);

    // Outgoing connections
    this.buildConnSection('Outgoing', connections.outgoing, '\u2192', categories);

    // Incoming connections
    this.buildConnSection('Incoming', connections.incoming, '\u2190', categories);
  }

  // ─── Connection Section Builder ───────────────────────

  private buildConnSection(
    title: string,
    items: ConnectionInfo[],
    arrowChar: string,
    categories: Record<string, CategoryDef>,
  ): void {
    if (items.length === 0) return;

    const sec = document.createElement('div');
    sec.style.marginTop = '10px';

    const h3 = document.createElement('h3');
    Object.assign(h3.style, {
      fontSize: '11px',
      color: this.theme.panelTextMuted,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      marginBottom: '4px',
      fontWeight: 'normal',
    });
    h3.textContent = title;
    sec.appendChild(h3);

    for (const conn of items) {
      const row = document.createElement('div');
      Object.assign(row.style, {
        padding: '3px 0',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        cursor: 'pointer',
        color: this.theme.panelText,
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
      nameSpan.textContent = conn.node.title;
      row.appendChild(nameSpan);

      // Pin label
      if (conn.label) {
        const labelSpan = document.createElement('span');
        Object.assign(labelSpan.style, {
          color: this.theme.textMuted,
          fontSize: '10px',
          marginLeft: 'auto',
        });
        labelSpan.textContent = conn.label;
        row.appendChild(labelSpan);
      }

      // Click to navigate
      const nodeId = conn.node.id;
      row.addEventListener('click', () => {
        this.callbacks.onConnectionClick(nodeId);
      });

      sec.appendChild(row);
    }

    this.el.appendChild(sec);
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
  }
}
