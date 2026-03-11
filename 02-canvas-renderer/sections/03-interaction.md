# 03 — Interaction

## Summary

Port all mouse and keyboard event handling from index.html's global event listeners into a self-contained class that binds to a canvas element and emits structured callbacks. Includes hit testing for nodes and wires, zoom/pan transforms, and node selection with path tracing support.

## Files to Create

### `src/renderer/interaction.ts`

## Implementation Details

### InteractionManager Class

```typescript
export interface InteractionCallbacks {
  onNodeClick: (nodeId: string, shiftKey: boolean) => void;
  onNodeHover: (nodeId: string | null) => void;
  onWireHover: (wireIndex: number | null) => void;
  onPanZoomChange: (panX: number, panY: number, zoom: number) => void;
  onBackgroundClick: () => void;
  requestRedraw: () => void;
}

export class InteractionManager {
  private canvas: HTMLCanvasElement;
  private getViewTransform: () => ViewTransform;
  private setViewTransform: (vt: ViewTransform) => void;
  private getNodes: () => NodeDef[];
  private getWires: () => WireDef[];
  private getNodeMap: () => Record<string, NodeDef>;
  private getCategories: () => Record<string, CategoryDef>;
  private callbacks: InteractionCallbacks;
  private listeners: Array<{ target: EventTarget; event: string; handler: EventListener }>;

  // Drag state (ported from index.html globals, lines 166-174)
  private dragging: NodeDef | null = null;
  private dragOff = { x: 0, y: 0 };
  private isPanning = false;
  private panStart = { x: 0, y: 0 };
  private didDrag = false;
  private mouseX = 0;
  private mouseY = 0;

  constructor(canvas: HTMLCanvasElement, /* ... */);
  destroy(): void;  // Remove ALL event listeners
}
```

### Event Handlers

All event handlers are bound methods stored in `this.listeners` for cleanup.

#### Mouse Down (port of lines 864-876)

```javascript
// Existing code:
cvs.addEventListener('mousedown', function(e) {
  didDrag = false;
  var n = getNodeAt(e.clientX, e.clientY);
  if (n) {
    dragging = n;
    dragOff.x = (e.clientX - panX) / zoom - n.x;
    dragOff.y = (e.clientY - panY) / zoom - n.y;
  } else {
    isPanning = true;
    panStart.x = e.clientX - panX;
    panStart.y = e.clientY - panY;
  }
});
```

Port directly, replacing globals with `this.getViewTransform()`.

#### Mouse Move (port of lines 877-900)

Three modes:
1. **Dragging node** — update node position via world-space math
2. **Panning** — update panX/panY
3. **Idle** — run hit testing for hover effects (node → pointer cursor, wire → crosshair cursor)

```javascript
// Existing hover logic (lines 888-898):
var n = getNodeAt(e.clientX, e.clientY);
if (n) {
  cvs.style.cursor = 'pointer';
  hoveredWire = null;
} else {
  var wi = getWireAt(e.clientX, e.clientY);
  hoveredWire = wi;
  cvs.style.cursor = wi !== null ? 'crosshair' : 'default';
}
```

#### Mouse Up (port of lines 901-939)

Click logic (only fires if `!didDrag`):
- **Shift+click on node** with existing selection: trigger path trace
- **Click on selected node** (no path active): deselect (toggle)
- **Click on unselected node**: select it
- **Click on background**: clear all selection

The InteractionManager doesn't own selection state — it fires callbacks and lets the renderer class manage state.

#### Wheel (port of lines 940-948)

Zoom toward cursor position:

```javascript
// Existing zoom math — preserve exactly:
var mx = e.clientX, my = e.clientY;
var wx = (mx - panX) / zoom, wy = (my - panY) / zoom;
zoom *= e.deltaY < 0 ? 1.1 : 0.9;
zoom = Math.max(0.15, Math.min(2.5, zoom));
panX = mx - wx * zoom;
panY = my - wy * zoom;
```

Must use `{ passive: false }` and call `e.preventDefault()`.

#### Keyboard (port of lines 787-804)

- **Ctrl+F / Cmd+F**: focus search box (callback, not direct DOM access)
- **Escape**: clear selection, clear search, clear path

Keyboard listeners go on the **container**, not `document` — scoped cleanup.

### Hit Testing

#### `getNodeAt(mx, my)` (port of lines 567-576)

```javascript
// Existing: iterate in reverse (top nodes drawn last = clicked first)
function getNodeAt(mx, my) {
  var sx = (mx - panX) / zoom;
  var sy = (my - panY) / zoom;
  for (var i = N.length - 1; i >= 0; i--) {
    var n = N[i];
    if (!isNodeVisible(n)) continue;
    if (sx >= n.x && sx <= n.x + n.w && sy >= n.y && sy <= n.y + n.h) return n;
  }
  return null;
}
```

Port as a method that converts screen coords to world coords, then checks bounding rects.

#### `getWireAt(mx, my)` (port of lines 578-599)

Samples the bezier curve at `t` intervals of 0.05 and checks distance to cursor:

```javascript
// Existing bezier sampling — preserve exactly:
for (var t = 0; t <= 1; t += 0.05) {
  var it = 1 - t;
  var bx = it*it*it*x1 + 3*it*it*t*(x1+dx) + 3*it*t*t*(x2-dx) + t*t*t*x2;
  var by = it*it*it*y1 + 3*it*it*t*y1 + 3*it*t*t*y2 + t*t*t*y2;
  var d = Math.sqrt((mx - bx)*(mx - bx) + (my - by)*(my - by));
  if (d < threshold) return idx;  // threshold = 8
}
```

### Listener Cleanup Pattern

Every `addEventListener` is tracked:

```typescript
private addListener(target: EventTarget, event: string, handler: EventListener, options?: any): void {
  target.addEventListener(event, handler, options);
  this.listeners.push({ target, event, handler });
}

destroy(): void {
  for (const { target, event, handler } of this.listeners) {
    target.removeEventListener(event, handler);
  }
  this.listeners = [];
}
```

### Touch Support (optional, note for future)

The existing index.html has no touch support. Add a note/TODO for touch events (pinch-zoom, single-finger pan) but don't implement in this split.

## Acceptance Criteria

- [ ] All event listeners are scoped to canvas/container — nothing on `document` or `window`
- [ ] `destroy()` removes every registered listener (zero leaks)
- [ ] Zoom math matches exactly: zoom toward cursor, clamped to [0.15, 2.5]
- [ ] Pan works via click-drag on background
- [ ] Node drag works via click-drag on a node (updates node position)
- [ ] `getNodeAt` hit testing matches index.html: reverse iteration, world-space rect check
- [ ] `getWireAt` hit testing matches index.html: bezier sampling at t=0.05 intervals, threshold=8
- [ ] Click vs drag discrimination works (`didDrag` flag)
- [ ] Shift+click fires path trace callback (not implemented here — just the callback)
- [ ] Hover updates cursor: pointer (node), crosshair (wire), default (background)
- [ ] Wheel event uses `passive: false` and prevents default scroll
- [ ] No Obsidian imports, no global DOM access
