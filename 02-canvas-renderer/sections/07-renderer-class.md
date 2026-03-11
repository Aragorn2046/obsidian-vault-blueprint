# 07 — Renderer Class

## Summary

The `BlueprintRenderer` class is the public API that ties all modules together. It owns the render loop, manages state, coordinates between the interaction handler, drawing functions, UI panels, and layout engine. This is the single entry point consumers import and instantiate.

## Files to Create

### `src/renderer/index.ts`

## Implementation Details

### Class Structure

```typescript
import { BlueprintData, NodeDef, WireDef, CategoryDef, BlueprintRendererOptions,
         SearchResult, NODE_W, PIN_H, HEADER_H, ThemeColors } from './types';
import { getTheme } from './theme';
import { renderFrame, ViewTransform, isNodeVisible, getWireNodeIds,
         countConnections, getConnectionList, toWorld } from './canvas';
import { InteractionManager } from './interaction';
import { applyLayout } from './layout';
import { Legend } from './legend';
import { SearchPanel } from './search';
import { InfoPanel } from './info-panel';
import { StatsBar } from './stats';
import { findPath, PathResult } from './path-tracer';

export class BlueprintRenderer {
  // --- Configuration ---
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private container: HTMLDivElement;
  private themeMode: 'dark' | 'light';
  private theme: ThemeColors;
  private onNodeClick?: (nodeId: string, filePath?: string) => void;
  private onNodeHover?: (nodeId: string | null) => void;

  // --- Data ---
  private data: BlueprintData;
  private nodeMap: Record<string, NodeDef> = {};

  // --- View State ---
  private panX = -300;
  private panY = -50;
  private zoom = 0.55;
  private canvasW = 0;
  private canvasH = 0;
  private dpr = 1;

  // --- Selection State ---
  private selectedNodeId: string | null = null;
  private pathTargetId: string | null = null;
  private pathResult: PathResult | null = null;
  private hoveredWireIdx: number | null = null;
  private searchQuery = '';

  // --- Sub-modules ---
  private interaction: InteractionManager;
  private legend: Legend;
  private searchPanel: SearchPanel;
  private infoPanel: InfoPanel;
  private statsBar: StatsBar;

  // --- Render Loop ---
  private animFrameId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private dirty = true;  // Redraw flag

  constructor(options: BlueprintRendererOptions) { /* ... */ }
}
```

### Constructor Flow

```typescript
constructor(options: BlueprintRendererOptions) {
  // 1. Store references
  this.canvas = options.canvas;
  this.ctx = this.canvas.getContext('2d')!;
  this.container = options.container;
  this.themeMode = options.theme ?? 'dark';
  this.theme = getTheme(this.themeMode);
  this.onNodeClick = options.onNodeClick;
  this.onNodeHover = options.onNodeHover;

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
    onResultClick: (nodeId) => this.selectNode(nodeId),
    onClear: () => this.clearSearch(),
    onFocusRequest: () => {},
  }, this.theme);

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
    Object.keys(this.data.categories).length
  );

  // 6. Create interaction manager
  this.interaction = new InteractionManager(this.canvas, /* callbacks */);

  // 7. Set up ResizeObserver
  this.resizeObserver = new ResizeObserver(() => this.resize());
  this.resizeObserver.observe(this.container);
}
```

### `initializeData()`

Port of `initializeData()` from index.html (lines 209-234). Computes node dimensions and builds the node map:

```typescript
private initializeData(): void {
  // Ensure all categories start visible
  for (const key of Object.keys(this.data.categories)) {
    if (this.data.categories[key].visible === undefined) {
      this.data.categories[key].visible = true;
    }
  }

  // Build node map and compute dimensions
  this.nodeMap = {};
  for (const node of this.data.nodes) {
    if (!node.pins) node.pins = { in: [], out: [] };
    if (!node.pins.in) node.pins.in = [];
    if (!node.pins.out) node.pins.out = [];
    const maxPins = Math.max(node.pins.in.length, node.pins.out.length, 1);
    node.w = NODE_W;
    node.h = HEADER_H + maxPins * PIN_H + 8;
    this.nodeMap[node.id] = node;
  }
}
```

### `render()` — Initial Render

Starts the animation frame loop:

```typescript
render(): void {
  if (this.animFrameId !== null) return;  // Already running
  const loop = () => {
    if (this.dirty) {
      this.drawFrame();
      this.dirty = false;
    }
    this.animFrameId = requestAnimationFrame(loop);
  };
  this.animFrameId = requestAnimationFrame(loop);
}
```

The `dirty` flag avoids redundant redraws. Any state change sets `this.dirty = true`.

### `drawFrame()` — Single Frame

Delegates to `renderFrame()` from canvas.ts:

```typescript
private drawFrame(): void {
  const vt: ViewTransform = { panX: this.panX, panY: this.panY, zoom: this.zoom };
  renderFrame(
    this.ctx,
    this.data,
    this.nodeMap,
    vt,
    this.canvasW,
    this.canvasH,
    this.theme,
    {
      selectedNodeId: this.selectedNodeId,
      pathResult: this.pathResult,
      searchQuery: this.searchQuery,
      hoveredWireIdx: this.hoveredWireIdx,
    }
  );
}
```

### `resize()`

Port of `resizeCanvas()` (lines 150-160), now using container dimensions instead of window:

```typescript
resize(): void {
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
  this.dirty = true;
}
```

Key difference from index.html: uses `container.getBoundingClientRect()` instead of `window.innerWidth/Height`. This makes the renderer work inside any sized container, not just full-screen.

### `destroy()`

```typescript
destroy(): void {
  // Stop render loop
  if (this.animFrameId !== null) {
    cancelAnimationFrame(this.animFrameId);
    this.animFrameId = null;
  }

  // Stop observing resize
  if (this.resizeObserver) {
    this.resizeObserver.disconnect();
    this.resizeObserver = null;
  }

  // Destroy sub-modules (removes all DOM elements and listeners)
  this.interaction.destroy();
  this.legend.destroy();
  this.searchPanel.destroy();
  this.infoPanel.destroy();
  this.statsBar.destroy();
}
```

### `setData(data)`

Replace blueprint data and re-render:

```typescript
setData(data: BlueprintData): void {
  this.data = data;
  this.initializeData();
  applyLayout(this.data, this.nodeMap);

  // Reset selection state
  this.selectedNodeId = null;
  this.pathTargetId = null;
  this.pathResult = null;
  this.searchQuery = '';

  // Update UI
  this.legend.update(this.data.categories);
  this.statsBar.update(
    this.data.nodes.length,
    this.data.wires.length,
    Object.keys(this.data.categories).length
  );
  this.infoPanel.show(null, this.data.categories, { outgoing: [], incoming: [] }, 0);
  this.searchPanel.clear();
  this.dirty = true;
}
```

### `zoomToFit()`

Port of btn-fit handler (lines 956-968):

```typescript
zoomToFit(): void {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of this.data.nodes) {
    if (!isNodeVisible(n, this.data.categories)) continue;
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + (n.w ?? NODE_W));
    maxY = Math.max(maxY, n.y + (n.h ?? 60));
  }
  if (minX === Infinity) return;
  const rw = maxX - minX + 100;
  const rh = maxY - minY + 100;
  this.zoom = Math.min((this.canvasW - 40) / rw, (this.canvasH - 80) / rh);
  this.panX = -minX * this.zoom + 20 + (this.canvasW - rw * this.zoom) / 2;
  this.panY = -minY * this.zoom + 50;
  this.dirty = true;
}
```

### `zoomToNode(nodeId)`

Port of `panToNode()` (lines 750-755):

```typescript
zoomToNode(nodeId: string): void {
  const n = this.nodeMap[nodeId];
  if (!n) return;
  const cx = n.x + (n.w ?? NODE_W) / 2;
  const cy = n.y + (n.h ?? 60) / 2;
  this.panX = this.canvasW / 2 - cx * this.zoom;
  this.panY = this.canvasH / 2 - cy * this.zoom;
  this.dirty = true;
}
```

### `selectNode(nodeId)` and Selection Management

```typescript
selectNode(nodeId: string): void {
  this.selectedNodeId = nodeId;
  this.pathTargetId = null;
  this.pathResult = null;
  this.updateInfoPanel();
  this.dirty = true;

  // Fire callback
  const node = this.nodeMap[nodeId];
  if (node && this.onNodeClick) {
    this.onNodeClick(nodeId, node.path);
  }
}

clearSelection(): void {
  this.selectedNodeId = null;
  this.pathTargetId = null;
  this.pathResult = null;
  this.infoPanel.show(null, this.data.categories, { outgoing: [], incoming: [] }, 0);
  this.dirty = true;
}

getSelectedNodes(): string[] {
  const result: string[] = [];
  if (this.selectedNodeId) result.push(this.selectedNodeId);
  if (this.pathTargetId) result.push(this.pathTargetId);
  return result;
}
```

### Path Tracing Integration

When the interaction manager fires a shift+click:

```typescript
private handlePathTrace(targetId: string): void {
  if (!this.selectedNodeId || this.selectedNodeId === targetId) return;
  this.pathTargetId = targetId;
  this.pathResult = findPath(
    this.selectedNodeId,
    targetId,
    this.data.nodes,
    this.data.wires,
    this.nodeMap,
    this.data.categories
  );
  if (!this.pathResult) {
    this.pathTargetId = null;  // No path found
  }
  this.dirty = true;
}
```

### `search(query)` and `clearSearch()`

```typescript
search(query: string): SearchResult[] {
  this.searchQuery = query;
  if (!query) return [];
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

clearSearch(): void {
  this.searchQuery = '';
  this.searchPanel.clear();
  this.dirty = true;
}
```

### `setCategoryVisible()` and `setAllCategoriesVisible()`

```typescript
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
  this.legend.update(this.data.categories);
  this.dirty = true;
}

setAllCategoriesVisible(visible: boolean): void {
  for (const key of Object.keys(this.data.categories)) {
    this.data.categories[key].visible = visible;
  }
  if (!visible) this.clearSelection();
  this.legend.update(this.data.categories);
  this.dirty = true;
}
```

### `setTheme(theme)`

```typescript
setTheme(theme: 'dark' | 'light'): void {
  this.themeMode = theme;
  this.theme = getTheme(theme);
  this.legend.setTheme(this.theme);
  this.searchPanel.setTheme(this.theme);
  this.infoPanel.setTheme(this.theme);
  this.statsBar.setTheme(this.theme);
  this.dirty = true;
}
```

### Re-exports

The index.ts file should re-export key types for consumers:

```typescript
export { BlueprintRenderer };
export type {
  BlueprintData,
  BlueprintRendererOptions,
  NodeDef,
  WireDef,
  GroupDef,
  CategoryDef,
  PinDef,
  SearchResult,
} from './types';
```

## Acceptance Criteria

- [ ] `BlueprintRenderer` can be instantiated with canvas + container + data
- [ ] `render()` starts an animation frame loop; `destroy()` stops it
- [ ] `resize()` correctly adapts to container size (not window size)
- [ ] ResizeObserver auto-triggers resize when container dimensions change
- [ ] `setData()` replaces data, runs layout, resets selection, updates all panels
- [ ] `zoomToFit()` calculates bounding box and sets zoom/pan to show all visible nodes
- [ ] `zoomToNode()` centers the view on a specific node
- [ ] `selectNode()` fires the `onNodeClick` callback with node ID and file path
- [ ] `clearSelection()` resets all selection and path state
- [ ] `search()` returns ranked results matching title > desc > path
- [ ] `setCategoryVisible()` clears selection if selected node becomes hidden
- [ ] `setTheme()` propagates to all sub-modules
- [ ] `destroy()` cancels animation frame, disconnects ResizeObserver, destroys all sub-modules
- [ ] Dirty flag prevents redundant redraws (only draws when state changes)
- [ ] No Obsidian imports — only standard Web APIs
- [ ] All types re-exported for consumer use
- [ ] Path tracing integrates correctly: shift+click → BFS → highlight path
