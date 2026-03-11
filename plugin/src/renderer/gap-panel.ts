// ─── Gap Panel — Gap analysis results overlay ─────────────────
// Zero Obsidian dependencies. DOM-only UI.

import type { NodeDef } from '../types';
import type { ThemeColors } from './theme';
import type { GapSuggestion } from './graph-analysis';

// ─── Types ──────────────────────────────────────────────────

export interface GapPanelCallbacks {
  onNodeClick: (nodeId: string) => void;
  onCreateLink: (fromId: string, toId: string) => void;
}

// ─── GapPanel ───────────────────────────────────────────────

export class GapPanel {
  private container: HTMLDivElement;
  private el: HTMLDivElement;
  private callbacks: GapPanelCallbacks;
  private theme: ThemeColors;
  private visible = false;
  private rightOffset = 12;

  constructor(
    container: HTMLDivElement,
    callbacks: GapPanelCallbacks,
    theme: ThemeColors,
  ) {
    this.container = container;
    this.callbacks = callbacks;
    this.theme = theme;

    this.el = document.createElement('div');
    this.el.className = 'bp-gap-panel';
    this.applyPanelStyles();
    this.el.style.display = 'none';

    this.container.appendChild(this.el);
  }

  // ─── Styles ───────────────────────────────────────────

  private applyPanelStyles(): void {
    Object.assign(this.el.style, {
      position: 'absolute',
      right: this.rightOffset + 'px',
      top: '50px',
      zIndex: '15',
      background: this.theme.panelBg,
      border: `1px solid ${this.theme.panelBorder}`,
      borderRadius: '6px',
      padding: '0',
      maxWidth: '360px',
      maxHeight: '500px',
      overflowY: 'auto',
      color: this.theme.panelText,
      fontSize: '12px',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      boxSizing: 'border-box',
    });
  }

  // ─── Render ───────────────────────────────────────────

  private render(gaps: GapSuggestion[], nodeMap: Record<string, NodeDef>): void {
    // Clear safely
    while (this.el.firstChild) {
      this.el.removeChild(this.el.firstChild);
    }

    // ─── Header ──────────────────────────────────────
    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 12px 8px',
      borderBottom: `1px solid ${this.theme.panelBorder}`,
      position: 'sticky',
      top: '0',
      background: this.theme.panelBg,
      zIndex: '1',
    });

    const titleEl = document.createElement('span');
    Object.assign(titleEl.style, {
      fontSize: '13px',
      fontWeight: '600',
      color: this.theme.panelText,
      letterSpacing: '0.2px',
    });
    titleEl.textContent = 'Gap Analysis';
    header.appendChild(titleEl);

    const closeBtn = document.createElement('button');
    Object.assign(closeBtn.style, {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      color: this.theme.panelTextMuted,
      fontSize: '16px',
      lineHeight: '1',
      padding: '0 2px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    });
    closeBtn.textContent = '×';
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.color = this.theme.panelText;
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.color = this.theme.panelTextMuted;
    });
    closeBtn.addEventListener('click', () => this.hide());
    header.appendChild(closeBtn);

    this.el.appendChild(header);

    // ─── Subtitle ─────────────────────────────────────
    const subtitle = document.createElement('div');
    Object.assign(subtitle.style, {
      padding: '5px 12px 8px',
      fontSize: '11px',
      color: this.theme.panelTextMuted,
      borderBottom: `1px solid ${this.theme.panelBorder}`,
    });
    subtitle.textContent =
      gaps.length === 0
        ? 'No potential connections found'
        : `${gaps.length} potential connection${gaps.length !== 1 ? 's' : ''} found`;
    this.el.appendChild(subtitle);

    // ─── Gap Cards ────────────────────────────────────
    if (gaps.length === 0) {
      const empty = document.createElement('div');
      Object.assign(empty.style, {
        padding: '16px 12px',
        color: this.theme.panelTextMuted,
        fontSize: '11px',
        textAlign: 'center',
        fontStyle: 'italic',
      });
      empty.textContent = 'Run the analysis on a graph with tagged notes.';
      this.el.appendChild(empty);
      return;
    }

    const list = document.createElement('div');
    Object.assign(list.style, {
      padding: '6px 8px 8px',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
    });

    for (const gap of gaps) {
      list.appendChild(this.buildGapCard(gap, nodeMap));
    }

    this.el.appendChild(list);
  }

  // ─── Gap Card ─────────────────────────────────────────

  private buildGapCard(
    gap: GapSuggestion,
    nodeMap: Record<string, NodeDef>,
  ): HTMLDivElement {
    const nodeA = nodeMap[gap.nodeA];
    const nodeB = nodeMap[gap.nodeB];

    const card = document.createElement('div');
    Object.assign(card.style, {
      background: this.theme.buttonBg,
      border: `1px solid ${this.theme.panelBorder}`,
      borderRadius: '5px',
      padding: '8px 10px',
      display: 'flex',
      flexDirection: 'column',
      gap: '5px',
    });

    // ─── Node names row ──────────────────────────────
    const nodesRow = document.createElement('div');
    Object.assign(nodesRow.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      flexWrap: 'wrap',
    });

    const makeNodeLabel = (nodeId: string, node: NodeDef | undefined): HTMLSpanElement => {
      const span = document.createElement('span');
      Object.assign(span.style, {
        cursor: 'pointer',
        color: this.theme.panelText,
        fontSize: '12px',
        fontWeight: '500',
        borderBottom: `1px dotted ${this.theme.panelBorder}`,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: '130px',
        display: 'inline-block',
      });
      span.textContent = node ? node.title : nodeId;
      span.title = node ? node.title : nodeId;
      span.addEventListener('mouseenter', () => {
        span.style.color = this.theme.textPrimary;
        span.style.borderBottomColor = this.theme.panelText;
      });
      span.addEventListener('mouseleave', () => {
        span.style.color = this.theme.panelText;
        span.style.borderBottomColor = this.theme.panelBorder;
      });
      span.addEventListener('click', () => {
        this.callbacks.onNodeClick(nodeId);
      });
      return span;
    };

    nodesRow.appendChild(makeNodeLabel(gap.nodeA, nodeA));

    const arrowEl = document.createElement('span');
    Object.assign(arrowEl.style, {
      color: this.theme.panelTextMuted,
      fontSize: '11px',
      flexShrink: '0',
    });
    arrowEl.textContent = '↔';
    nodesRow.appendChild(arrowEl);

    nodesRow.appendChild(makeNodeLabel(gap.nodeB, nodeB));

    card.appendChild(nodesRow);

    // ─── Shared tags ──────────────────────────────────
    if (gap.sharedTags.length > 0) {
      const tagsRow = document.createElement('div');
      Object.assign(tagsRow.style, {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '3px',
      });

      for (const tag of gap.sharedTags) {
        const badge = document.createElement('span');
        Object.assign(badge.style, {
          display: 'inline-block',
          padding: '1px 5px',
          borderRadius: '3px',
          fontSize: '10px',
          background: this.theme.inputBg,
          border: `1px solid ${this.theme.panelBorder}`,
          color: this.theme.panelTextMuted,
          lineHeight: '1.5',
        });
        badge.textContent = '#' + tag;
        tagsRow.appendChild(badge);
      }

      card.appendChild(tagsRow);
    }

    // ─── Reason text ──────────────────────────────────
    if (gap.reason) {
      const reasonEl = document.createElement('div');
      Object.assign(reasonEl.style, {
        fontSize: '10px',
        color: this.theme.textMuted,
        fontStyle: 'italic',
        lineHeight: '1.4',
      });
      reasonEl.textContent = gap.reason;
      card.appendChild(reasonEl);
    }

    // ─── Link button row ──────────────────────────────
    const actionRow = document.createElement('div');
    Object.assign(actionRow.style, {
      display: 'flex',
      justifyContent: 'flex-end',
      marginTop: '2px',
    });

    const linkBtn = document.createElement('button');
    Object.assign(linkBtn.style, {
      background: this.theme.buttonBg,
      border: `1px solid ${this.theme.buttonBorder}`,
      borderRadius: '4px',
      padding: '3px 10px',
      cursor: 'pointer',
      color: this.theme.buttonText,
      fontSize: '11px',
      fontFamily: 'inherit',
      lineHeight: '1.4',
      transition: 'background 0.1s',
    });
    linkBtn.textContent = 'Link';
    linkBtn.addEventListener('mouseenter', () => {
      linkBtn.style.background = this.theme.buttonHoverBg;
      linkBtn.style.color = this.theme.panelText;
    });
    linkBtn.addEventListener('mouseleave', () => {
      linkBtn.style.background = this.theme.buttonBg;
      linkBtn.style.color = this.theme.buttonText;
    });
    linkBtn.addEventListener('click', () => {
      this.callbacks.onCreateLink(gap.nodeA, gap.nodeB);
    });

    actionRow.appendChild(linkBtn);
    card.appendChild(actionRow);

    return card;
  }

  // ─── Public API ───────────────────────────────────────

  /** Populate and show the panel with gap analysis results. */
  show(gaps: GapSuggestion[], nodeMap: Record<string, NodeDef>): void {
    this.render(gaps, nodeMap);
    this.visible = true;
    this.el.style.display = 'block';
  }

  /** Hide the panel. */
  hide(): void {
    this.visible = false;
    this.el.style.display = 'none';
  }

  /** Toggle visibility. */
  toggle(): void {
    if (this.visible) this.hide();
    else this.el.style.display = 'block'; // show without re-rendering; caller should use show() with data
  }

  /** Whether the panel is currently visible. */
  isVisible(): boolean {
    return this.visible;
  }

  /** Update theme colors and re-apply panel-level styles. */
  setTheme(theme: ThemeColors): void {
    this.theme = theme;
    this.applyPanelStyles();
  }

  /** Shift the right position (e.g. when controls panel opens). */
  setRightOffset(px: number): void {
    this.rightOffset = px;
    this.el.style.right = px + 'px';
  }

  /** Remove the DOM element. */
  destroy(): void {
    if (this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
  }
}
