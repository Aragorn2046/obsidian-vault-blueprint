# 02 — Canvas Core

## Summary

Port all Canvas2D drawing functions from index.html to a stateless module of pure rendering functions. Each function takes a `CanvasRenderingContext2D`, the data to draw, and a `ThemeColors` object — no globals, no side effects beyond canvas pixels.

## Files to Create

### `src/renderer/canvas.ts`

## Implementation Details

### Rendering Constants and Transform

All drawing uses world-space coordinates transformed by `zoom` and `pan`. The existing code applies this inline:

```javascript
// index.html pattern — repeated everywhere
var x = n.x * zoom + panX;
var y = n.y * zoom + panY;
var w = n.w * zoom;
var h = n.h * zoom;
```

Instead, pass a `ViewTransform` object:

```typescript
export interface ViewTransform {
  panX: number;
  panY: number;
  zoom: number;
}

/** Convert world coords to screen coords */
export function toScreen(wx: number, wy: number, vt: ViewTransform): { x: number; y: number } {
  return { x: wx * vt.zoom + vt.panX, y: wy * vt.zoom + vt.panY };
}

/** Convert screen coords to world coords */
export function toWorld(sx: number, sy: number, vt: ViewTransform): { x: number; y: number } {
  return { x: (sx - vt.panX) / vt.zoom, y: (sy - vt.panY) / vt.zoom };
}
```

### Drawing Functions

#### `drawGrid(ctx, vt, canvasW, canvasH, theme)`

Port of lines 336-348. Draws minor grid (40px spacing) and major grid (200px spacing):

```javascript
// Existing code to port:
var gs = 40 * zoom;
var ox = panX % gs, oy = panY % gs;
ctx.strokeStyle = '#1f2228';  // → theme.gridMinor
ctx.lineWidth = 1;
for (var x = ox; x < CW; x += gs) { /* vertical lines */ }
for (var y = oy; y < CH; y += gs) { /* horizontal lines */ }
// Major grid at 200px intervals with theme.gridMajor
```

#### `drawGroup(ctx, group, vt, theme)`

Port of `drawCommentBoxes()` (lines 350-371). Draws a single group box:

```javascript
// Existing code:
ctx.fillStyle = c + '08';       // Very transparent fill
ctx.strokeStyle = c + '18';     // Slightly more visible stroke
ctx.lineWidth = 1;
roundRect(ctx, x, y, w, h, 6 * zoom);
ctx.fill();
ctx.stroke();
// Label above the box
ctx.font = '600 ' + fs + 'px system-ui';
ctx.fillStyle = c + '50';
ctx.fillText(g.label, x + 10 * zoom, y - 4 * zoom);
```

#### `drawWire(ctx, wire, index, state, vt, theme)`

Port of the wire drawing loop (lines 373-407). The `state` parameter encodes:

```typescript
export interface WireDrawState {
  isActive: boolean;      // Connected to selected node or on path
  isPathWire: boolean;    // Part of BFS path trace
  isHovered: boolean;     // Wire under cursor
  hasSelection: boolean;  // Any node is selected (affects dimming)
}
```

Key bezier curve logic to preserve exactly:

```javascript
// Existing bezier calculation (lines 382-383, 393-396):
var dx = Math.abs(x2 - x1) * 0.5;
ctx.beginPath();
ctx.moveTo(x1, y1);
ctx.bezierCurveTo(x1 + dx, y1, x2 - dx, y2, x2, y2);
```

Alpha logic (lines 398-404):
- Hovered wire: `globalAlpha = 1`, thicker line
- Active wire (selected node or path): `globalAlpha = 0.85`, medium line
- Inactive wire with selection: `globalAlpha = 0.07`, thin line
- No selection: `globalAlpha = 0.5`, normal line

#### `drawNode(ctx, node, state, vt, categories, theme)`

The largest function — port of lines 409-539. The `state` parameter:

```typescript
export interface NodeDrawState {
  isActive: boolean;         // Connected to selected node or on path
  isSelected: boolean;       // This is the selected node
  isPathTarget: boolean;     // This is the path trace target
  isSearchMatch: boolean;    // Matches current search query
}
```

Drawing order within a node (must be preserved exactly):
1. **Drop shadow** — `fillStyle = 'rgba(0,0,0,0.4)'`, offset +3,+3
2. **Body background** — `fillStyle = theme.nodeFill`, rounded rect
3. **Body border** — `strokeStyle = theme.nodeBorder`
4. **Header fill** — `fillStyle = cat.dark`, top-only rounded rect (lines 443-448)
5. **Header divider line** — horizontal line at header bottom
6. **Title text** — `fillStyle = cat.color`, centered, bold
7. **Connection count badge** — top-right corner, `cat.color + '30'` background
8. **Input pins** — left edge circles with labels
9. **Output pins** — right edge circles with labels
10. **Selection highlight** — category-colored border if selected
11. **Path target highlight** — yellow border (`#fbbf24`) if path target
12. **Search highlight** — white border if search match

Pin position formula (matches `getPinPos`, line 310-318):
```javascript
var py = n.y + HEADER_H + idx * PIN_H + PIN_H/2 + 4;
var px = side === 'out' ? n.x + n.w : n.x;
```

#### `roundRect(ctx, x, y, w, h, r)` and `roundRectTop(ctx, x, y, w, h, r)`

Utility path functions (lines 541-565). These trace paths without filling/stroking — the caller does that.

### Helper Functions

```typescript
/** Resolve wire endpoint to screen coordinates */
export function resolveWireEndpoint(
  spec: string,
  nodeMap: Record<string, NodeDef>,
  vt: ViewTransform
): { x: number; y: number };

/** Get pin position in world coordinates */
export function getPinPos(
  node: NodeDef,
  pinId: string,
  side: 'in' | 'out'
): { x: number; y: number };

/** Check if a node is visible (category enabled) */
export function isNodeVisible(
  node: NodeDef,
  categories: Record<string, CategoryDef>
): boolean;

/** Count connections for a node */
export function countConnections(
  nodeId: string,
  wires: WireDef[]
): number;

/** Parse wire endpoint to extract node ID */
export function getWireNodeIds(wire: WireDef): { from: string; to: string };
```

### Full Render Composition

```typescript
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  data: BlueprintData,
  nodeMap: Record<string, NodeDef>,
  vt: ViewTransform,
  canvasW: number,
  canvasH: number,
  theme: ThemeColors,
  selection: SelectionState  // selectedNode, pathNodes, pathWires, searchQuery, hoveredWire
): void {
  ctx.clearRect(0, 0, canvasW, canvasH);
  drawGrid(ctx, vt, canvasW, canvasH, theme);
  for (const group of data.groups) drawGroup(ctx, group, vt, theme);
  for (let i = 0; i < data.wires.length; i++) drawWire(ctx, data.wires[i], i, ...);
  for (const node of data.nodes) drawNode(ctx, node, ...);
}
```

## Acceptance Criteria

- [ ] All drawing functions are pure: (ctx, data, theme) => void — no globals
- [ ] `drawNode` produces visually identical output to index.html's `drawNode` function
- [ ] `drawWire` bezier curves match exactly (same control point formula)
- [ ] `drawGroup` renders dashed boxes with labels matching index.html
- [ ] `drawGrid` renders minor (40px) and major (200px) grid lines
- [ ] `roundRect` and `roundRectTop` path functions match exactly
- [ ] `resolveWireEndpoint` correctly parses `"nodeId.pinId"` format
- [ ] Pin positions match the formula: `y = node.y + HEADER_H + idx * PIN_H + PIN_H/2 + 4`
- [ ] Alpha/opacity logic for active/inactive/hovered states matches index.html exactly
- [ ] `ViewTransform` is used everywhere instead of bare `panX`/`panY`/`zoom` globals
- [ ] No Obsidian imports, no DOM access (pure canvas rendering)
- [ ] Connection count badge renders identically (position, size, alpha)
