// ─── BlueprintRenderer — Main orchestrator ──────────────────
// Zero Obsidian dependencies. Canvas + DOM container only.

import type {
  BlueprintData,
  NodeDef,
  WireDef,
  CategoryDef,
  PinDef,
  GroupDef,
} from '../types';

import { getTheme, type ThemeColors } from './theme';
import {
  type ViewTransform,
  type SelectionState,
  renderFrameFull,
  isNodeVisible,
  getWireNodeIds,
  countConnections,
  getConnectionList,
  type ConnectionList,
  NODE_W,
  PIN_H,
  HEADER_H,
  wrapText,
  headerHeight,
} from './canvas';
import { InteractionManager } from './interaction';
import { applyLayout } from './layout';
import { Legend } from './legend';
import { SearchPanel, type SearchResult } from './search';
import { InfoPanel } from './info-panel';
import { StatsBar } from './stats';
import { ContextMenu, type ContextMenuCallbacks } from './context-menu';
import { findPath, type PathResult } from './path-tracer';

// ─── Options ────────────────────────────────────────────────

export interface BlueprintRendererOptions {
  canvas: HTMLCanvasElement;
  container: HTMLDivElement;
  data: BlueprintData;
  theme?: 'dark' | 'light';
  onNodeClick?: (nodeId: string, filePath?: string) => void;
  onNodeHover?: (nodeId: string | null) => void;
  onNodeDragEnd?: (nodeId: string, x: number, y: number) => void;
  onContextMenuAction?: (action: string, nodeId: string) => void;
  onLinkCreate?: (sourceNodeId: string, targetNodeId: string) => void;
}

// ─── BlueprintRenderer ──────────────────────────────────────

export class BlueprintRenderer {
  // Configuration
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private container: HTMLDivElement;
  private themeMode: 'dark' | 'light';
  private theme: ThemeColors;
  private onNodeClickCb?: (nodeId: string, filePath?: string) => void;
  private onNodeHoverCb?: (nodeId: string | null) => void;
  private onNodeDragEndCb?: (nodeId: string, x: number, y: number) => void;
  private onContextMenuActionCb?: (action: string, nodeId: string) => void;
  private onLinkCreateCb?: (sourceNodeId: string, targetNodeId: string) => void;

  // Data
  private data: BlueprintData;
  private nodeMap: Record<string, NodeDef> = {};

  // View state
  private panX = -300;
  private panY = -50;
  private zoom = 0.55;
  private canvasW = 0;
  private canvasH = 0;
  private dpr = 1;

  // Selection state
  private selectedNodeId: string | null = null;
  private pathTargetId: string | null = null;
  private pathResult: PathResult | null = null;
  private hoveredWireIdx: number | null = null;
  private searchQuery = '';

  // Sub-modules
  private interaction: InteractionManager;
  private legend: Legend;
  private searchPanel: SearchPanel;
  private infoPanel: InfoPanel;
  private statsBar: StatsBar;
  private contextMenu: ContextMenu;

  // Render loop
  private animFrameId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private dirty = true;

  constructor(options: BlueprintRendererOptions) {
    // 1. Store references
    this.canvas = options.canvas;
    this.ctx = this.canvas.getContext('2d')!;
    this.container = options.container;
    this.themeMode = options.theme ?? 'dark';
    this.theme = getTheme(this.themeMode);
    this.onNodeClickCb = options.onNodeClick;
    this.onNodeHoverCb = options.onNodeHover;
    this.onNodeDragEndCb = options.onNodeDragEnd;
    this.onContextMenuActionCb = options.onContextMenuAction;
    this.onLinkCreateCb = options.onLinkCreate;

    // Ensure container has relative positioning for absolute children
    if (getComputedStyle(this.container).position === 'static') {
      this.container.style.position = 'relative';
    }

    // 2. Initialize data
    this.data = options.data;
    this.initializeData();

    // 3. Run layout (skips if nodes have positions)
    applyLayout(this.data, this.nodeMap);

    // 4. Set up canvas sizing
    this.resizeCanvas();

    // 5. Create UI panels
    this.legend = new Legend(this.container, {
      onCategoryToggle: (catKey, visible) => this.setCategoryVisible(catKey, visible),
      onAllCategories: (visible) => this.setAllCategoriesVisible(visible),
    }, this.theme);
    this.legend.update(this.data.categories);

    this.searchPanel = new SearchPanel(this.container, {
      onSearch: (query) => this.search(query),
      onResultClick: (nodeId) => {
        this.selectNode(nodeId);
        this.zoomToNode(nodeId);
      },
      onClear: () => this.clearSearch(),
      onFocusRequest: () => this.searchPanel.focus(),
    }, this.theme);
    this.searchPanel.setCategories(this.data.categories);

    this.infoPanel = new InfoPanel(this.container, {
      onConnectionClick: (nodeId) => {
        this.selectNode(nodeId);
        this.zoomToNode(nodeId);
      },
    }, this.theme);

    this.statsBar = new StatsBar(this.container, this.theme);
    this.statsBar.update(
      this.data.nodes.length,
      this.data.wires.length,
      Object.keys(this.data.categories).length,
    );

    // 5b. Create context menu
    const ctxCallbacks: ContextMenuCallbacks = {
      onOpen: (id) => this.fireContextAction('open', id),
      onOpenNewPane: (id) => this.fireContextAction('open-new-pane', id),
      onRevealInExplorer: (id) => this.fireContextAction('reveal', id),
      onCopyWikiLink: (id) => this.fireContextAction('copy-link', id),
      onShowBacklinks: (id) => {
        this.selectNode(id);
        this.updateInfoPanel();
      },
      onDeleteNote: (id) => this.fireContextAction('delete', id),
      onResetNodePosition: (id) => this.fireContextAction('reset-position', id),
    };
    this.contextMenu = new ContextMenu(this.container, ctxCallbacks, this.theme);

    // 6. Create interaction manager
    this.interaction = new InteractionManager(
      this.canvas,
      this.container,
      {
        getViewTransform: () => this.getViewTransform(),
        setViewTransform: (vt) => this.setViewTransformInternal(vt),
        getNodes: () => this.data.nodes,
        getWires: () => this.data.wires,
        getNodeMap: () => this.nodeMap,
        getCategories: () => this.data.categories,
      },
      {
        onNodeClick: (nodeId, shiftKey, ctrlKey) => this.handleNodeClick(nodeId, shiftKey, ctrlKey),
        onNodeHover: (nodeId) => this.handleNodeHover(nodeId),
        onWireHover: (wireIdx) => this.handleWireHover(wireIdx),
        onPanZoomChange: () => { this.dirty = true; },
        onBackgroundClick: () => this.handleBackgroundClick(),
        onEscape: () => this.handleEscape(),
        onSearchFocus: () => this.searchPanel.focus(),
        onNodeDragEnd: (nodeId, x, y) => this.handleNodeDragEnd(nodeId, x, y),
        onContextMenu: (nodeId, sx, sy) => this.handleContextMenu(nodeId, sx, sy),
        onWireDraw: (fromNodeId, toNodeId) => this.handleWireDraw(fromNodeId, toNodeId),
        requestRedraw: () => { this.dirty = true; },
      },
    );

    // 7. Set up ResizeObserver
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
  }

  // ─── Data Initialization ──────────────────────────────

  private initializeData(): void {
    // Ensure all categories start visible
    for (const key of Object.keys(this.data.categories)) {
      if (this.data.categories[key].visible === undefined) {
        this.data.categories[key].visible = true;
      }
    }

    // Build node map and compute dimensions (with title wrapping)
    this.nodeMap = {};
    // Use a consistent font for measuring title widths
    this.ctx.font = 'bold 11px system-ui';
    const titlePadding = 20; // horizontal padding inside header
    const maxTitleWidth = NODE_W - titlePadding;

    for (const node of this.data.nodes) {
      if (!node.pins) node.pins = { in: [], out: [] };
      if (!node.pins.in) node.pins.in = [];
      if (!node.pins.out) node.pins.out = [];

      // Wrap title text to fit within node width
      const titleLines = wrapText(this.ctx, node.title, maxTitleWidth);
      const hh = headerHeight(titleLines.length);
      (node as any).titleLines = titleLines;
      (node as any).headerH = hh;

      const maxPins = Math.max(node.pins.in.length, node.pins.out.length, 1);
      (node as any).w = NODE_W;
      (node as any).h = hh + maxPins * PIN_H + 8;
      this.nodeMap[node.id] = node;
    }
  }

  // ─── View Transform ───────────────────────────────────

  private getViewTransform(): ViewTransform {
    return { panX: this.panX, panY: this.panY, zoom: this.zoom };
  }

  private setViewTransformInternal(vt: ViewTransform): void {
    this.panX = vt.panX;
    this.panY = vt.panY;
    this.zoom = vt.zoom;
  }

  // ─── Canvas Sizing ────────────────────────────────────

  private resizeCanvas(): void {
    this.dpr = window.devicePixelRatio || 1;
    const rect = this.container.getBoundingClientRect();
    this.canvasW = rect.width;
    this.canvasH = rect.height;
    this.canvas.width = this.canvasW * this.dpr;
    this.canvas.height = this.canvasH * this.dpr;
    this.canvas.style.width = this.canvasW + 'px';
    this.canvas.style.height = this.canvasH + 'px';
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(this.dpr, this.dpr);
  }

  // ─── Interaction Handlers ─────────────────────────────

  private handleNodeClick(nodeId: string, shiftKey: boolean, ctrlKey: boolean): void {
    if (ctrlKey) {
      // Ctrl+click: open the file in the vault
      const node = this.nodeMap[nodeId];
      if (node && this.onNodeClickCb) {
        this.onNodeClickCb(nodeId, node.path);
      }
    } else if (shiftKey) {
      // Shift+click: multi-select (path trace between two nodes)
      if (this.selectedNodeId && this.selectedNodeId !== nodeId) {
        this.handlePathTrace(nodeId);
      } else {
        // First shift-click or same node — just select it
        this.selectedNodeId = nodeId;
        this.pathTargetId = null;
        this.pathResult = null;
        this.updateInfoPanel();
      }
    } else {
      // Normal click: toggle highlight/selection (no file navigation)
      if (this.selectedNodeId === nodeId && !this.pathResult) {
        this.clearSelection();
      } else {
        this.selectedNodeId = nodeId;
        this.pathTargetId = null;
        this.pathResult = null;
        this.updateInfoPanel();
      }
    }
    this.dirty = true;
  }

  private handleNodeHover(nodeId: string | null): void {
    if (this.onNodeHoverCb) {
      this.onNodeHoverCb(nodeId);
    }
  }

  private handleWireHover(wireIdx: number | null): void {
    this.hoveredWireIdx = wireIdx;
    this.dirty = true;
  }

  private handleBackgroundClick(): void {
    this.clearSelection();
    this.dirty = true;
  }

  private handleEscape(): void {
    this.clearSelection();
    this.searchPanel.clear();
    this.searchQuery = '';
    this.dirty = true;
  }

  private handlePathTrace(targetId: string): void {
    if (!this.selectedNodeId || this.selectedNodeId === targetId) return;
    this.pathTargetId = targetId;
    this.pathResult = findPath(
      this.selectedNodeId,
      targetId,
      this.data.nodes,
      this.data.wires,
      this.nodeMap,
      this.data.categories,
    );
    if (!this.pathResult) {
      this.pathTargetId = null;
    }
    this.dirty = true;
  }

  // ─── Drag End & Context Menu Handlers ────────────────

  private handleNodeDragEnd(nodeId: string, x: number, y: number): void {
    if (this.onNodeDragEndCb) {
      this.onNodeDragEndCb(nodeId, x, y);
    }
    // Recalc group bounds after drag
    this.dirty = true;
  }

  private handleContextMenu(nodeId: string | null, screenX: number, screenY: number): void {
    if (nodeId) {
      this.contextMenu.show(nodeId, screenX, screenY);
    } else {
      this.contextMenu.hide();
    }
  }

  private fireContextAction(action: string, nodeId: string): void {
    if (this.onContextMenuActionCb) {
      this.onContextMenuActionCb(action, nodeId);
    }
  }

  private handleWireDraw(fromNodeId: string, toNodeId: string): void {
    // Check if link already exists
    const exists = this.data.wires.some(w => {
      const from = w.from.split('.')[0];
      const to = w.to.split('.')[0];
      return (from === fromNodeId && to === toNodeId) ||
             (from === toNodeId && to === fromNodeId);
    });

    if (exists) {
      // Link already exists — don't duplicate
      return;
    }

    if (this.onLinkCreateCb) {
      this.onLinkCreateCb(fromNodeId, toNodeId);
    }
  }

  // ─── Info Panel Update ────────────────────────────────

  private updateInfoPanel(): void {
    if (!this.selectedNodeId) {
      this.infoPanel.show(null, this.data.categories, { outgoing: [], incoming: [] }, 0);
      return;
    }
    const node = this.nodeMap[this.selectedNodeId];
    if (!node) {
      this.infoPanel.show(null, this.data.categories, { outgoing: [], incoming: [] }, 0);
      return;
    }
    const connections = getConnectionList(node.id, this.data.wires, this.nodeMap);
    const connCount = countConnections(node.id, this.data.wires);
    this.infoPanel.show(node, this.data.categories, connections, connCount);
  }

  // ─── Render Loop ──────────────────────────────────────

  private drawFrame(): void {
    const vt: ViewTransform = { panX: this.panX, panY: this.panY, zoom: this.zoom };
    const selection: SelectionState = {
      selectedNodeId: this.selectedNodeId,
      pathNodes: this.pathResult ? this.pathResult.nodes : null,
      pathWires: this.pathResult ? this.pathResult.wires : null,
      searchQuery: this.searchQuery,
      hoveredWireIdx: this.hoveredWireIdx,
    };

    renderFrameFull(
      this.ctx,
      this.data,
      this.nodeMap,
      vt,
      this.canvasW,
      this.canvasH,
      this.theme,
      selection,
      this.pathTargetId,
    );

    // Draw temporary wire during wire-draw mode
    const wd = this.interaction.getWireDrawState();
    if (wd.active && wd.sourceNode) {
      const nw = (wd.sourceNode as any).w ?? NODE_W;
      const hh = (wd.sourceNode as any).headerH ?? 26;
      // Start from the right edge center of the source node
      const srcX = (wd.sourceNode.x + nw) * vt.zoom + vt.panX;
      const srcY = (wd.sourceNode.y + hh / 2 + (wd.sourceNode as any).h / 2) * vt.zoom + vt.panY;
      const endX = wd.endX;
      const endY = wd.endY;
      const dx = Math.abs(endX - srcX) * 0.5;

      this.ctx.beginPath();
      this.ctx.moveTo(srcX, srcY);
      this.ctx.bezierCurveTo(srcX + dx, srcY, endX - dx, endY, endX, endY);
      this.ctx.strokeStyle = this.theme.wireDefault;
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([6, 4]);
      this.ctx.globalAlpha = 0.7;
      this.ctx.stroke();
      this.ctx.setLineDash([]);
      this.ctx.globalAlpha = 1;

      // Draw a circle at the end point
      this.ctx.beginPath();
      this.ctx.arc(endX, endY, 5, 0, Math.PI * 2);
      this.ctx.fillStyle = this.theme.wireDefault;
      this.ctx.fill();
    }
  }

  // ─── Public API ───────────────────────────────────────

  /** Start the render loop */
  render(): void {
    if (this.animFrameId !== null) return;
    const loop = (): void => {
      if (this.dirty) {
        this.drawFrame();
        this.dirty = false;
      }
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  /** Handle container resize */
  resize(): void {
    this.resizeCanvas();
    this.dirty = true;
  }

  /** Clean up all listeners, observers, animation frames */
  destroy(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    this.interaction.destroy();
    this.legend.destroy();
    this.searchPanel.destroy();
    this.infoPanel.destroy();
    this.statsBar.destroy();
    this.contextMenu.destroy();
  }

  /** Replace data, re-layout, re-render */
  setData(data: BlueprintData): void {
    this.data = data;
    this.initializeData();
    applyLayout(this.data, this.nodeMap);

    this.selectedNodeId = null;
    this.pathTargetId = null;
    this.pathResult = null;
    this.searchQuery = '';

    this.legend.update(this.data.categories);
    this.searchPanel.setCategories(this.data.categories);
    this.statsBar.update(
      this.data.nodes.length,
      this.data.wires.length,
      Object.keys(this.data.categories).length,
    );
    this.infoPanel.show(null, this.data.categories, { outgoing: [], incoming: [] }, 0);
    this.searchPanel.clear();
    this.dirty = true;
  }

  /** Fit entire graph in view */
  zoomToFit(): void {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const n of this.data.nodes) {
      if (!isNodeVisible(n, this.data.categories)) continue;
      const nw = (n as any).w ?? NODE_W;
      const nh = (n as any).h ?? 60;
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + nw);
      maxY = Math.max(maxY, n.y + nh);
    }
    if (minX === Infinity) return;

    const rw = maxX - minX + 100;
    const rh = maxY - minY + 100;
    this.zoom = Math.min((this.canvasW - 40) / rw, (this.canvasH - 80) / rh);
    this.panX = -minX * this.zoom + 20 + (this.canvasW - rw * this.zoom) / 2;
    this.panY = -minY * this.zoom + 50;
    this.dirty = true;
  }

  /** Center on a specific node */
  zoomToNode(nodeId: string): void {
    const n = this.nodeMap[nodeId];
    if (!n) return;
    const nw = (n as any).w ?? NODE_W;
    const nh = (n as any).h ?? 60;
    const cx = n.x + nw / 2;
    const cy = n.y + nh / 2;
    this.panX = this.canvasW / 2 - cx * this.zoom;
    this.panY = this.canvasH / 2 - cy * this.zoom;
    this.dirty = true;
  }

  /** Switch dark/light theme */
  setTheme(theme: 'dark' | 'light'): void {
    this.themeMode = theme;
    this.theme = getTheme(theme);
    this.legend.setTheme(this.theme);
    this.searchPanel.setTheme(this.theme);
    this.infoPanel.setTheme(this.theme);
    this.statsBar.setTheme(this.theme);
    this.contextMenu.setTheme(this.theme);
    this.dirty = true;
  }

  /** Search nodes by query — returns ranked results */
  search(query: string): SearchResult[] {
    this.searchQuery = query;
    if (!query) {
      this.dirty = true;
      return [];
    }
    const q = query.toLowerCase();
    const results: SearchResult[] = [];

    for (const n of this.data.nodes) {
      if (!isNodeVisible(n, this.data.categories)) continue;
      if (n.title.toLowerCase().includes(q)) {
        results.push({ node: n, matchField: 'title', score: 0 });
      } else if (n.desc?.toLowerCase().includes(q)) {
        results.push({ node: n, matchField: 'desc', score: 1 });
      } else if (n.path?.toLowerCase().includes(q)) {
        results.push({ node: n, matchField: 'path', score: 2 });
      }
    }

    results.sort((a, b) => a.score - b.score);
    this.dirty = true;
    return results;
  }

  /** Clear search query and results */
  clearSearch(): void {
    this.searchQuery = '';
    this.searchPanel.clear();
    this.dirty = true;
  }

  /** Toggle visibility of a single category */
  setCategoryVisible(catId: string, visible: boolean): void {
    const cat = this.data.categories[catId];
    if (!cat) return;
    cat.visible = visible;

    // Clear selection if selected node is now hidden
    if (this.selectedNodeId) {
      const node = this.nodeMap[this.selectedNodeId];
      if (node && !isNodeVisible(node, this.data.categories)) {
        this.clearSelection();
      }
    }
    this.dirty = true;
  }

  /** Toggle visibility of all categories */
  setAllCategoriesVisible(visible: boolean): void {
    for (const key of Object.keys(this.data.categories)) {
      this.data.categories[key].visible = visible;
    }
    if (!visible) this.clearSelection();
    this.legend.update(this.data.categories);
    this.dirty = true;
  }

  /** Select a node by ID (highlight only, no navigation) */
  selectNode(nodeId: string): void {
    this.selectedNodeId = nodeId;
    this.pathTargetId = null;
    this.pathResult = null;
    this.updateInfoPanel();
    this.dirty = true;
  }

  /** Clear all selection and path state */
  clearSelection(): void {
    this.selectedNodeId = null;
    this.pathTargetId = null;
    this.pathResult = null;
    this.infoPanel.show(null, this.data.categories, { outgoing: [], incoming: [] }, 0);
    this.dirty = true;
  }
}

// ─── Re-exports ─────────────────────────────────────────────

export { BlueprintRenderer as default };
export type {
  BlueprintData,
  NodeDef,
  WireDef,
  GroupDef,
  CategoryDef,
  PinDef,
} from '../types';
export type { ThemeColors } from './theme';
export type { SearchResult } from './search';
export type { PathResult } from './path-tracer';
export type { ViewTransform, SelectionState } from './canvas';
export { getTheme, resolveCategory } from './theme';
export { applyLayout } from './layout';
export { findPath } from './path-tracer';
