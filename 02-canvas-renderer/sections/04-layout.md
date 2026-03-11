# 04 — Layout

## Summary

NEW module (no equivalent in index.html). Implements a deterministic hierarchical tree layout algorithm that assigns x/y positions to nodes when they arrive with all-zero coordinates. This is essential for auto-generated blueprints where the plugin creates the data but doesn't know how to position nodes.

## Files to Create

### `src/renderer/layout.ts`

## Implementation Details

### Public API

```typescript
export interface LayoutOptions {
  nodeWidth?: number;    // Default: NODE_W (220)
  nodeHeight?: number;   // Default: computed per node from pin count
  layerGap?: number;     // Horizontal gap between layers. Default: 280
  nodeGap?: number;      // Vertical gap between nodes in same layer. Default: 30
  groupPadding?: number; // Padding around group bounding boxes. Default: 40
}

/**
 * Assign positions to nodes using hierarchical layout.
 * Mutates node x/y in place. Also computes group x/y/w/h.
 *
 * SKIP CONDITION: If any node has non-zero x or y, returns immediately
 * (assumes positions are hand-crafted).
 */
export function applyLayout(
  data: BlueprintData,
  nodeMap: Record<string, NodeDef>,
  options?: LayoutOptions
): void;
```

### Algorithm Steps

#### Step 1: Skip Check

```typescript
const hasPositions = data.nodes.some(n => n.x !== 0 || n.y !== 0);
if (hasPositions) return;  // Use existing positions
```

#### Step 2: Build Adjacency

Build a directed adjacency list from wires. Parse `"nodeId.pinId"` to extract node IDs (same as `getWireNodeIds` in canvas.ts).

```typescript
const adj: Record<string, string[]> = {};     // nodeId → [downstream nodeIds]
const inDegree: Record<string, number> = {};   // nodeId → count of incoming edges
for (const node of data.nodes) {
  adj[node.id] = [];
  inDegree[node.id] = 0;
}
for (const wire of data.wires) {
  const fromId = wire.from.split('.')[0];
  const toId = wire.to.split('.')[0];
  adj[fromId].push(toId);
  inDegree[toId]++;
}
```

#### Step 3: Layer Assignment (Topological)

Use a modified BFS (Kahn's algorithm) to assign layers. Nodes with `inDegree === 0` start at layer 0. Each downstream node goes to `max(current layer, parent layer + 1)`.

```typescript
const layer: Record<string, number> = {};
const queue: string[] = [];

// Seed: all nodes with no incoming wires
for (const node of data.nodes) {
  if (inDegree[node.id] === 0) {
    layer[node.id] = 0;
    queue.push(node.id);
  }
}

// BFS to assign layers
while (queue.length > 0) {
  const nodeId = queue.shift()!;
  for (const downstreamId of adj[nodeId]) {
    const newLayer = layer[nodeId] + 1;
    if (layer[downstreamId] === undefined || newLayer > layer[downstreamId]) {
      layer[downstreamId] = newLayer;
    }
    inDegree[downstreamId]--;
    if (inDegree[downstreamId] === 0) {
      queue.push(downstreamId);
    }
  }
}

// Handle cycles: any unassigned nodes get layer = maxLayer + 1
const maxLayer = Math.max(0, ...Object.values(layer));
for (const node of data.nodes) {
  if (layer[node.id] === undefined) {
    layer[node.id] = maxLayer + 1;
  }
}
```

#### Step 4: Vertical Ordering Within Layers

Group nodes by layer, then within each layer sort by:
1. Category key (groups same-type nodes together)
2. Alphabetical by title (deterministic)

```typescript
const layers: Record<number, NodeDef[]> = {};
for (const node of data.nodes) {
  const l = layer[node.id];
  if (!layers[l]) layers[l] = [];
  layers[l].push(node);
}

for (const l of Object.keys(layers)) {
  layers[+l].sort((a, b) => {
    if (a.cat !== b.cat) return a.cat.localeCompare(b.cat);
    return a.title.localeCompare(b.title);
  });
}
```

#### Step 5: Position Assignment

```typescript
const layerGap = options?.layerGap ?? 280;
const nodeGap = options?.nodeGap ?? 30;

for (const [layerIdx, nodes] of Object.entries(layers)) {
  let yOffset = 0;
  for (const node of nodes) {
    node.x = +layerIdx * layerGap;
    node.y = yOffset;
    yOffset += (node.h ?? 60) + nodeGap;
  }
}
```

#### Step 6: Center Layers Vertically

After initial placement, center each layer vertically relative to the tallest layer to reduce visual skew:

```typescript
const layerHeights: Record<number, number> = {};
for (const [l, nodes] of Object.entries(layers)) {
  const last = nodes[nodes.length - 1];
  layerHeights[+l] = last.y + (last.h ?? 60);
}
const maxHeight = Math.max(...Object.values(layerHeights));

for (const [l, nodes] of Object.entries(layers)) {
  const offset = (maxHeight - layerHeights[+l]) / 2;
  for (const node of nodes) {
    node.y += offset;
  }
}
```

#### Step 7: Auto-Generate Group Boxes

Compute bounding boxes for each category that has 2+ nodes:

```typescript
const catNodes: Record<string, NodeDef[]> = {};
for (const node of data.nodes) {
  if (!catNodes[node.cat]) catNodes[node.cat] = [];
  catNodes[node.cat].push(node);
}

const padding = options?.groupPadding ?? 40;
const autoGroups: GroupDef[] = [];

for (const [catKey, nodes] of Object.entries(catNodes)) {
  if (nodes.length < 2) continue;
  const cat = data.categories[catKey];
  if (!cat) continue;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + (n.w ?? NODE_W));
    maxY = Math.max(maxY, n.y + (n.h ?? 60));
  }

  autoGroups.push({
    label: cat.label,
    color: cat.color,
    catRef: catKey,
    x: minX - padding,
    y: minY - padding,
    w: maxX - minX + 2 * padding,
    h: maxY - minY + 2 * padding,
  });
}

// Only set auto groups if no manual groups exist
if (data.groups.length === 0) {
  data.groups = autoGroups;
}
```

### Edge Cases

1. **No wires** — all nodes have inDegree 0, all go to layer 0. They stack vertically sorted by category then title.
2. **Cycles** — handled by the fallback in step 3. Nodes stuck in cycles get assigned to `maxLayer + 1`.
3. **Disconnected subgraphs** — BFS naturally handles these since all zero-inDegree nodes are seeded.
4. **Single node** — placed at (0, 0), no group box generated.
5. **Mixed positions** — if even one node has `x !== 0 || y !== 0`, skip layout entirely.

### Determinism Guarantee

The algorithm is deterministic because:
- Layer assignment uses stable BFS order (queue, not random iteration)
- Sorting uses `localeCompare` (deterministic string comparison)
- No randomness anywhere

Same input JSON always produces identical output positions.

## Acceptance Criteria

- [ ] `applyLayout` skips when any node has non-zero x or y
- [ ] Layer assignment correctly identifies root nodes (no incoming wires)
- [ ] Downstream nodes are always in higher layers than their parents
- [ ] Cycles don't crash — orphaned nodes get assigned a fallback layer
- [ ] Nodes within a layer are sorted by category then title (deterministic)
- [ ] Vertical centering reduces visual skew between layers
- [ ] Group boxes auto-generated for categories with 2+ nodes
- [ ] Group boxes have correct padding around contained nodes
- [ ] Existing manual groups are preserved (not overwritten)
- [ ] Same input produces identical output on every run
- [ ] No Obsidian imports, no DOM access
- [ ] Works correctly with zero wires (all nodes in layer 0)
- [ ] Works correctly with a single node
