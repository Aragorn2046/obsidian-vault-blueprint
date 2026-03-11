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
  renderFrameOrganic,
  drawCollapsedGroup,
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
import { ForceSimulation, organicRadius } from './layouts/force-directed';
import type { ViewMode, OrganicForceSettings } from '../types';
import { OrganicControlsPanel } from './organic-controls';
import { Legend } from './legend';
import { SearchPanel, type SearchResult } from './search';
import { InfoPanel } from './info-panel';
import { StatsBar } from './stats';
import { ContextMenu, type ContextMenuCallbacks } from './context-menu';
import { PreviewTooltip } from './preview-tooltip';
import { Minimap } from './minimap';
import { FilterPanel, type FilterState } from './filter-panel';
import { findPath, type PathResult } from './path-tracer';

// ─── Options ────────────────────────────────────────────────

export interface BlueprintRendererOptions {
  canvas: HTMLCanvasElement;
  container: HTMLDivElement;
  data: BlueprintData;
  theme?: 'dark' | 'light';
  viewMode?: ViewMode;
  organicSizing?: boolean;
  organicForces?: OrganicForceSettings;
  onNodeClick?: (nodeId: string, filePath?: string) => void;
  onNodeHover?: (nodeId: string | null) => void;
  onNodePreview?: (nodeId: string) => Promise<string | null>;
  onNodeDragEnd?: (nodeId: string, x: number, y: number) => void;
  onContextMenuAction?: (action: string, nodeId: string) => void;
  onLinkCreate?: (sourceNodeId: string, targetNodeId: string) => void;
  onViewModeChange?: (mode: ViewMode) => void;
  onForceSettingsChange?: (forces: OrganicForceSettings) => void;
  onColorChange?: (catKey: string, color: string, dark: string) => void;
}

// ─── BlueprintRenderer ──────────────────────────────────────

export class BlueprintRenderer {
  // Configuration
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private container: HTMLDivElement;
  private themeMode: 'dark' | 'light';
  private theme: ThemeColors;
  private viewMode: ViewMode;
  private organicSizing: boolean;
  private organicRadii: Map<string, number> = new Map();
  private onNodeClickCb?: (nodeId: string, filePath?: string) => void;
  private onNodeHoverCb?: (nodeId: string | null) => void;
  private onNodeDragEndCb?: (nodeId: string, x: number, y: number) => void;
  private onContextMenuActionCb?: (action: string, nodeId: string) => void;
  private onLinkCreateCb?: (sourceNodeId: string, targetNodeId: string) => void;
  private onViewModeChangeCb?: (mode: ViewMode) => void;
  private onForceSettingsChangeCb?: (forces: OrganicForceSettings) => void;
  private onColorChangeCb?: (catKey: string, color: string, dark: string) => void;
  private organicForces: OrganicForceSettings;

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
  private organicControls: OrganicControlsPanel | null = null;
  private simulation: ForceSimulation | null = null;
  private previewTooltip: PreviewTooltip;
  private minimap: Minimap;
  private filterPanel: FilterPanel;
  private filterState: FilterState = {
    activeTags: new Set(),
    propertyKey: '',
    propertyValue: '',
    tagMode: 'any',
  };

  // Collapsed groups
  private collapsedGroups: Set<string> = new Set();
  private collapsedNodeIds: Set<string> = new Set();

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
    this.viewMode = options.viewMode ?? 'schematic';
    this.organicSizing = options.organicSizing ?? true;
    this.onNodeClickCb = options.onNodeClick;
    this.onNodeHoverCb = options.onNodeHover;
    this.onNodeDragEndCb = options.onNodeDragEnd;
    this.onContextMenuActionCb = options.onContextMenuAction;
    this.onLinkCreateCb = options.onLinkCreate;
    this.onViewModeChangeCb = options.onViewModeChange;
    this.onForceSettingsChangeCb = options.onForceSettingsChange;
    this.onColorChangeCb = options.onColorChange;
    this.organicForces = options.organicForces ?? {
      centerForce: 0.3, repelForce: 0.5, linkForce: 0.4, linkDistance: 0.5,
      nodeSize: 0.4, linkThickness: 0.3, arrows: true, textFadeThreshold: 0.3,
    };

    // Ensure container has relative positioning for absolute children
    if (getComputedStyle(this.container).position === 'static') {
      this.container.style.position = 'relative';
    }

    // 2. Initialize data
    this.data = options.data;
    this.initializeData();

    // 3. Run layout (skips if nodes have positions)
    this.runLayout();

    // 4. Set up canvas sizing
    this.resizeCanvas();

    // 5. Create UI panels
    this.legend = new Legend(this.container, {
      onCategoryToggle: (catKey, visible) => this.setCategoryVisible(catKey, visible),
      onAllCategories: (visible) => this.setAllCategoriesVisible(visible),
      onColorChange: (catKey, color, dark) => this.handleColorChange(catKey, color, dark),
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

    // 5c. Create organic controls panel
    this.organicControls = new OrganicControlsPanel(
      this.container,
      {
        onForceChange: (forces) => this.handleForceChange(forces),
        onAnimate: () => this.handleAnimate(),
      },
      this.organicForces,
      this.theme,
    );
    if (this.viewMode === 'organic') {
      this.organicControls.show();
    }
    // Defer offset sync until legend + minimap exist (called after construction)

    // 5d. Create preview tooltip
    this.previewTooltip = new PreviewTooltip(this.container, this.theme);
    if (options.onNodePreview) {
      this.previewTooltip.setFetcher(options.onNodePreview);
    }

    // 5e. Create minimap
    this.minimap = new Minimap(
      this.container,
      {
        onPan: (worldX, worldY) => this.handleMinimapPan(worldX, worldY),
      },
      this.theme,
    );
    this.minimap.setData(this.data, this.viewMode, this.organicRadii);

    // 5f. Create filter panel
    this.filterPanel = new FilterPanel(
      this.container,
      {
        onFilterChange: (state) => this.handleFilterChange(state),
      },
      this.theme,
    );
    this.filterPanel.setNodes(this.data.nodes);

    // 5g. Sync panel offsets (legend/minimap shift when controls sidebar is open)
    this.syncPanelOffsets();

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
        getViewMode: () => this.viewMode,
        getOrganicRadii: () => this.organicRadii,
        getGroups: () => this.data.groups,
        getCollapsedNodeIds: () => this.collapsedNodeIds,
      },
      {
        onNodeClick: (nodeId, shiftKey, ctrlKey) => this.handleNodeClick(nodeId, shiftKey, ctrlKey),
        onNodeHover: (nodeId) => this.handleNodeHover(nodeId),
        onWireHover: (wireIdx) => this.handleWireHover(wireIdx),
        onPanZoomChange: () => { this.dirty = true; },
        onBackgroundClick: () => this.handleBackgroundClick(),
        onEscape: () => this.handleEscape(),
        onSearchFocus: () => this.searchPanel.focus(),
        onNodeDragStart: (nodeId) => this.handleNodeDragStart(nodeId),
        onNodeDragEnd: (nodeId, x, y) => this.handleNodeDragEnd(nodeId, x, y),
        onContextMenu: (nodeId, sx, sy) => this.handleContextMenu(nodeId, sx, sy),
        onWireDraw: (fromNodeId, toNodeId) => this.handleWireDraw(fromNodeId, toNodeId),
        onGroupClick: (groupLabel) => this.handleGroupClick(groupLabel),
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

  /** Run appropriate layout based on view mode */
  private runLayout(): void {
    if (this.viewMode === 'organic') {
      // Create live simulation
      this.simulation = new ForceSimulation(
        this.data,
        this.nodeMap,
        this.organicSizing,
        this.organicForces,
      );
      this.organicRadii = this.simulation.getRadii();
    } else {
      this.simulation = null;
      applyLayout(this.data, this.nodeMap);
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
    if (nodeId) {
      // Get screen position of mouse for tooltip placement
      const mx = this.interaction.mouseX;
      const my = this.interaction.mouseY;
      const containerRect = this.container.getBoundingClientRect();
      this.previewTooltip.scheduleShow(nodeId, mx + containerRect.left, my + containerRect.top);
    } else {
      this.previewTooltip.hide();
    }
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

  // ─── Drag & Force Handlers ──────────────────────────

  private handleNodeDragStart(nodeId: string): void {
    if (this.simulation) {
      this.simulation.pinNode(nodeId);
    }
  }

  private handleNodeDragEnd(nodeId: string, x: number, y: number): void {
    if (this.simulation) {
      this.simulation.unpinNode(nodeId);
    }
    if (this.onNodeDragEndCb) {
      this.onNodeDragEndCb(nodeId, x, y);
    }
    this.dirty = true;
  }

  private handleForceChange(forces: OrganicForceSettings): void {
    this.organicForces = { ...forces };
    if (this.simulation) {
      this.simulation.setForces(forces);
      this.organicRadii = this.simulation.getRadii();
    }
    if (this.onForceSettingsChangeCb) {
      this.onForceSettingsChangeCb(forces);
    }
    this.dirty = true;
  }

  private handleAnimate(): void {
    if (this.simulation) {
      this.simulation.reheat();
    }
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

  // ─── Minimap ────────────────────────────────────────

  private handleMinimapPan(worldX: number, worldY: number): void {
    // Center the viewport on the clicked world position
    this.panX = this.canvasW / 2 - worldX * this.zoom;
    this.panY = this.canvasH / 2 - worldY * this.zoom;
    this.dirty = true;
  }

  /** Toggle minimap visibility */
  toggleMinimap(): void {
    this.minimap.toggle();
  }

  // ─── Filters ─────────────────────────────────────────

  private handleFilterChange(state: FilterState): void {
    this.filterState = state;
    this.dirty = true;
  }

  /** Toggle filter panel visibility */
  toggleFilters(): void {
    this.filterPanel.toggle();
  }

  /** Get active filter count for toolbar badge */
  getActiveFilterCount(): number {
    return this.filterPanel.getActiveFilterCount();
  }

  // ─── Color Change ────────────────────────────────────

  private handleColorChange(catKey: string, color: string, dark: string): void {
    // Update the category in the data model
    const cat = this.data.categories[catKey];
    if (cat) {
      cat.color = color;
      cat.dark = dark;
    }
    // Notify the view to persist
    if (this.onColorChangeCb) {
      this.onColorChangeCb(catKey, color, dark);
    }
    this.dirty = true;
  }

  // ─── Collapsible Groups ─────────────────────────────

  private handleGroupClick(groupLabel: string): void {
    const group = this.data.groups.find(g => g.label === groupLabel);
    if (!group) return;

    if (this.collapsedGroups.has(groupLabel)) {
      this.collapsedGroups.delete(groupLabel);
      group.collapsed = false;
    } else {
      this.collapsedGroups.add(groupLabel);
      group.collapsed = true;
    }

    this.rebuildCollapsedNodeIds();
    this.dirty = true;
  }

  /** Rebuild the set of node IDs that are in collapsed groups */
  private rebuildCollapsedNodeIds(): void {
    this.collapsedNodeIds.clear();
    for (const group of this.data.groups) {
      if (group.collapsed && group.nodeIds) {
        for (const id of group.nodeIds) {
          this.collapsedNodeIds.add(id);
        }
      }
    }
  }

  /** Toggle collapse state of a group by label (public API for toolbar/context menu) */
  toggleGroupCollapse(groupLabel: string): void {
    this.handleGroupClick(groupLabel);
  }

  /** Get list of group labels and their collapsed state */
  getGroupStates(): { label: string; collapsed: boolean }[] {
    return this.data.groups.map(g => ({
      label: g.label,
      collapsed: !!g.collapsed,
    }));
  }

  /** Set collapsed state from persisted data */
  setCollapsedGroups(labels: string[]): void {
    this.collapsedGroups = new Set(labels);
    for (const group of this.data.groups) {
      group.collapsed = this.collapsedGroups.has(group.label);
    }
    this.rebuildCollapsedNodeIds();
    this.dirty = true;
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

    // Build hidden set: collapsed nodes + filtered-out nodes
    let hidden: Set<string> | undefined;
    const hasFilters = this.filterPanel.hasActiveFilters();
    if (this.collapsedNodeIds.size > 0 || hasFilters) {
      hidden = new Set(this.collapsedNodeIds);
      if (hasFilters) {
        for (const n of this.data.nodes) {
          if (!FilterPanel.passesFilter(n, this.filterState)) {
            hidden.add(n.id);
          }
        }
      }
    }

    if (this.viewMode === 'organic') {
      renderFrameOrganic(
        this.ctx,
        this.data,
        this.nodeMap,
        this.organicRadii,
        vt,
        this.canvasW,
        this.canvasH,
        this.theme,
        selection,
        this.pathTargetId,
        this.organicForces,
        hidden,
      );
    } else {
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
        hidden,
      );
    }

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

    // Draw minimap overlay
    this.minimap.draw(this.panX, this.panY, this.zoom, this.canvasW, this.canvasH);
  }

  // ─── Public API ───────────────────────────────────────

  /** Start the render loop */
  render(): void {
    if (this.animFrameId !== null) return;
    const loop = (): void => {
      // Tick simulation if active — forces continuous redraw during physics
      if (this.simulation && this.simulation.isActive()) {
        const moved = this.simulation.tick();
        if (moved) {
          this.organicRadii = this.simulation.getRadii();
          this.dirty = true;
        }
      }

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
    if (this.organicControls) this.organicControls.destroy();
    this.minimap.destroy();
    this.filterPanel.destroy();
    this.previewTooltip.destroy();
    this.simulation = null;
  }

  /** Replace data, re-layout, re-render */
  setData(data: BlueprintData): void {
    this.data = data;
    this.initializeData();
    if (this.simulation && this.viewMode === 'organic') {
      this.simulation.setData(data, this.nodeMap);
      this.organicRadii = this.simulation.getRadii();
    } else {
      this.runLayout();
    }

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
    this.minimap.setData(this.data, this.viewMode, this.organicRadii);
    this.filterPanel.setNodes(this.data.nodes);
    this.previewTooltip.clearCache();
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
      if (this.viewMode === 'organic') {
        const r = this.organicRadii.get(n.id) ?? 35;
        minX = Math.min(minX, n.x - r);
        minY = Math.min(minY, n.y - r);
        maxX = Math.max(maxX, n.x + r);
        maxY = Math.max(maxY, n.y + r);
      } else {
        const nw = (n as any).w ?? NODE_W;
        const nh = (n as any).h ?? 60;
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + nw);
        maxY = Math.max(maxY, n.y + nh);
      }
    }
    if (minX === Infinity) return;

    const rw = maxX - minX + 100;
    const rh = maxY - minY + 100;
    this.zoom = Math.min((this.canvasW - 40) / rw, (this.canvasH - 80) / rh);
    this.panX = -minX * this.zoom + 20 + (this.canvasW - rw * this.zoom) / 2;
    this.panY = -minY * this.zoom + 50;
    this.dirty = true;
  }

  /** Switch between schematic and organic view modes */
  setViewMode(mode: ViewMode, sizing?: boolean, forces?: OrganicForceSettings): void {
    if (mode === this.viewMode && (sizing === undefined || sizing === this.organicSizing)) return;
    this.viewMode = mode;
    if (sizing !== undefined) this.organicSizing = sizing;
    if (forces) this.organicForces = { ...forces };

    // Reset positions so layout runs fresh
    for (const n of this.data.nodes) {
      n.x = 0;
      n.y = 0;
    }

    this.runLayout();
    this.clearSelection();

    // Show/hide organic controls
    if (this.organicControls) {
      if (mode === 'organic') {
        this.organicControls.setForces(this.organicForces);
        this.organicControls.show();
      } else {
        this.organicControls.hide();
      }
    }
    this.syncPanelOffsets();

    this.minimap.setData(this.data, this.viewMode, this.organicRadii);
    this.zoomToFit();
    this.dirty = true;
  }

  /** Get current view mode */
  getViewMode(): ViewMode {
    return this.viewMode;
  }

  /** Toggle organic controls panel visibility */
  toggleControls(): void {
    if (this.organicControls) {
      this.organicControls.toggle();
      this.syncPanelOffsets();
    }
  }

  /** Adjust right-positioned panels when controls sidebar is open */
  private syncPanelOffsets(): void {
    const isOpen = !!(this.organicControls && this.organicControls.isVisible());
    // CSS-driven offset via data attribute (survives re-renders)
    if (isOpen) {
      this.container.dataset.controlsOpen = '';
    } else {
      delete this.container.dataset.controlsOpen;
    }
    // Also set JS offsets as fallback
    const offset = isOpen ? 240 : 0;
    this.legend.setRightOffset(offset);
    this.minimap.setRightOffset(offset);
  }

  /** Center on a specific node */
  zoomToNode(nodeId: string): void {
    const n = this.nodeMap[nodeId];
    if (!n) return;
    let cx: number, cy: number;
    if (this.viewMode === 'organic') {
      // In organic mode, x/y IS the center
      cx = n.x;
      cy = n.y;
    } else {
      const nw = (n as any).w ?? NODE_W;
      const nh = (n as any).h ?? 60;
      cx = n.x + nw / 2;
      cy = n.y + nh / 2;
    }
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
    if (this.organicControls) this.organicControls.setTheme(this.theme);
    this.minimap.setTheme(this.theme);
    this.filterPanel.setTheme(this.theme);
    this.previewTooltip.setTheme(this.theme);
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
      if (!FilterPanel.passesFilter(n, this.filterState)) continue;
      if (n.title.toLowerCase().includes(q)) {
        results.push({ node: n, matchField: 'title', score: 0 });
      } else if (n.tags?.some(t => t.toLowerCase().includes(q))) {
        results.push({ node: n, matchField: 'desc', score: 1 });
      } else if (n.desc?.toLowerCase().includes(q)) {
        results.push({ node: n, matchField: 'desc', score: 2 });
      } else if (n.path?.toLowerCase().includes(q)) {
        results.push({ node: n, matchField: 'path', score: 3 });
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
