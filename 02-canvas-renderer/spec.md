# 02-canvas-renderer — Spec

## Summary

Port the existing standalone HTML5 Canvas rendering engine (`index.html`) to TypeScript modules that can be imported and instantiated inside any container element. The renderer must have zero dependencies on Obsidian or the DOM beyond a canvas element and a container div.

## Source Reference

The existing renderer lives at `~/projects/obsidian-vault-blueprint/index.html`. It's a single HTML file (~26K tokens) with inline CSS and JS containing:
- Canvas rendering of nodes (rounded rectangles with pins), wires (bezier curves), groups (dashed boxes)
- Zoom/pan via mouse wheel and drag
- Node selection with info panel (connections, pins, description)
- BFS path tracing between two selected nodes
- Search with title/description/path matching
- Category legend with All/None toggle buttons
- Stats bar (node/wire/category counts)
- Hit testing for nodes, pins, and wires

## Module Structure

```
src/renderer/
├── index.ts           # Public API: BlueprintRenderer class
├── types.ts           # Blueprint data interfaces (Node, Wire, Group, Category)
├── canvas.ts          # Core Canvas rendering (draw nodes, wires, groups)
├── interaction.ts     # Mouse/keyboard events: zoom, pan, click, hover
├── layout.ts          # Hierarchical tree layout algorithm (NEW)
├── search.ts          # Search engine: fuzzy match titles, descriptions, paths
├── legend.ts          # Category legend DOM: checkboxes, All/None buttons
├── info-panel.ts      # Node detail panel DOM: title, desc, connections
├── path-tracer.ts     # BFS path tracing between two nodes
├── theme.ts           # Color resolution: dark/light mode, category colors
└── stats.ts           # Stats bar: node/wire/category counts
```

## Public API

```typescript
interface BlueprintRendererOptions {
  canvas: HTMLCanvasElement;
  container: HTMLDivElement;        // Parent for legend, search, info panel
  data: BlueprintData;             // The blueprint JSON
  theme?: 'dark' | 'light';       // Default: 'dark'
  onNodeClick?: (nodeId: string, filePath?: string) => void;  // Navigation callback
  onNodeHover?: (nodeId: string | null) => void;
}

class BlueprintRenderer {
  constructor(options: BlueprintRendererOptions);

  // Lifecycle
  render(): void;           // Initial render
  resize(): void;           // Handle container resize
  destroy(): void;          // Clean up event listeners and animation frames

  // Data
  setData(data: BlueprintData): void;   // Replace blueprint data, re-render
  getData(): BlueprintData;

  // View
  zoomToFit(): void;        // Fit entire graph in view
  zoomToNode(nodeId: string): void;     // Center on a specific node
  setTheme(theme: 'dark' | 'light'): void;

  // Search
  search(query: string): SearchResult[];
  clearSearch(): void;

  // Categories
  setCategoryVisible(catId: string, visible: boolean): void;
  setAllCategoriesVisible(visible: boolean): void;

  // Selection
  selectNode(nodeId: string): void;
  clearSelection(): void;
  getSelectedNodes(): string[];         // For path tracing (2 nodes)
}
```

## Data Interfaces

```typescript
interface BlueprintData {
  meta: { title: string; subtitle?: string };
  categories: Record<string, CategoryDef>;
  groups: GroupDef[];
  nodes: NodeDef[];
  wires: WireDef[];
}

interface CategoryDef {
  color: string;      // Hex color, e.g., "#6366f1"
  dark: string;       // Darker variant for fills
  label: string;      // Display name
  visible?: boolean;  // Default true
}

interface NodeDef {
  id: string;
  cat: string;                     // Category key
  title: string;
  x: number; y: number;           // Position (may be 0,0 if layout needed)
  path?: string;                   // File path (for navigation)
  desc?: string;                   // Description text
  pins: {
    in: PinDef[];
    out: PinDef[];
  };
}

interface PinDef {
  id: string;
  label: string;
}

interface WireDef {
  from: string;      // "nodeId" or "nodeId.pinId"
  fromPin?: string;  // Pin ID (if not embedded in from)
  to: string;
  toPin?: string;
  color?: string;    // Override wire color
}

interface GroupDef {
  label: string;
  color: string;
  x: number; y: number;
  w: number; h: number;
}
```

## Layout Algorithm (NEW — `layout.ts`)

The existing renderer uses manual x/y positions. For auto-generated blueprints, we need a hierarchical tree layout:

1. **Input**: Nodes and wires (no positions set — all x=0, y=0)
2. **Group detection**: Nodes are grouped by their `cat` field or by an explicit `group` field
3. **Layer assignment**: Nodes with no incoming wires go to layer 0 (left). Each subsequent layer contains nodes reachable from the previous layer.
4. **Vertical ordering**: Within each layer, nodes are sorted by group, then alphabetically
5. **Spacing**: Configurable `nodeWidth`, `nodeHeight`, `layerGap`, `nodeGap`
6. **Group boxes**: Auto-calculated from the bounding box of contained nodes + padding
7. **Output**: Mutates node x/y positions and group x/y/w/h in place

The layout must be deterministic: same input always produces same output.

**Fallback**: If nodes already have non-zero x/y positions (e.g., loaded from a hand-crafted blueprint.json), skip layout and use existing positions.

## Porting Notes

### What to Keep From index.html
- Node rendering: rounded rectangles, pin dots, title text, category color fill
- Wire rendering: bezier curves with arrowheads, color from source node's category
- Group rendering: dashed border boxes with label
- Zoom/pan math: transform matrix (scale + translate)
- Hit testing: point-in-rect for nodes, distance-to-bezier for wires
- BFS path tracing algorithm
- Search matching logic
- Select All/None legend buttons

### What to Change
- All `document.getElementById()` calls → constructor params (canvas, container)
- All global variables → class instance properties
- `requestAnimationFrame` loop → managed by the renderer instance, stopped on destroy
- CSS → injected via `container.createDiv()` or passed as styles (no global stylesheet dependency)
- Colors → resolve through theme module (support both dark and light mode)
- `window.addEventListener` → scoped to canvas/container, cleaned up on destroy

### What to Add
- TypeScript types for everything
- Hierarchical layout algorithm
- Theme support (dark + light, using CSS variables when available)
- `onNodeClick` callback (instead of hardcoded behavior)
- `destroy()` method for cleanup
- ResizeObserver for responsive canvas sizing

## Acceptance Criteria

1. `BlueprintRenderer` can be instantiated with a canvas + container + data
2. Renders nodes, wires, groups matching the visual style of the existing index.html
3. Zoom/pan works via mouse wheel + drag
4. Clicking a node triggers the `onNodeClick` callback
5. Search filters and highlights matching nodes
6. Category legend toggles node visibility (including All/None)
7. BFS path tracing works between two selected nodes
8. Info panel shows node details on click
9. `destroy()` cleans up all listeners and stops the render loop
10. Hierarchical layout produces readable graphs when nodes have no positions
11. Existing hand-positioned blueprints (with x/y set) render correctly
12. Stats bar shows accurate counts
13. No DOM leaks — all created elements removed on destroy
