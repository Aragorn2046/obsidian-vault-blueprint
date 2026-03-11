# 06 — Path Tracer

## Summary

Port the BFS path tracing algorithm from index.html's `findPath()` function. Given two node IDs, finds the shortest path through visible wires and returns the set of node IDs and wire indices on the path. Used for Shift+click path highlighting.

## Files to Create

### `src/renderer/path-tracer.ts`

## Implementation Details

### Public API

```typescript
export interface PathResult {
  nodes: Set<string>;        // Node IDs on the path (for highlighting)
  wires: Set<number>;        // Wire indices on the path (for highlighting)
  orderedNodes: string[];    // Node IDs in path order (start → end)
  orderedWires: number[];    // Wire indices in path order
}

/**
 * BFS shortest path between two nodes through visible wires.
 * Returns null if no path exists.
 */
export function findPath(
  startId: string,
  endId: string,
  nodes: NodeDef[],
  wires: WireDef[],
  nodeMap: Record<string, NodeDef>,
  categories: Record<string, CategoryDef>
): PathResult | null;
```

### Algorithm (direct port of lines 283-307)

```javascript
// Existing BFS — preserve exactly:
function findPath(startId, endId) {
  // Step 1: Build adjacency list (bidirectional, only visible nodes)
  var adj = {};
  N.forEach(function(n) { adj[n.id] = []; });
  W.forEach(function(w, idx) {
    var ends = getWireNodeIds(w);
    if (!nodeMap[ends.from] || !nodeMap[ends.to]) return;
    if (!CAT[nodeMap[ends.from].cat].visible || !CAT[nodeMap[ends.to].cat].visible) return;
    adj[ends.from].push({ to: ends.to, wireIdx: idx });
    adj[ends.to].push({ to: ends.from, wireIdx: idx });
  });

  // Step 2: BFS from start
  var visited = {};
  var queue = [{ id: startId, path: [startId], wires: [] }];
  visited[startId] = true;
  while (queue.length > 0) {
    var cur = queue.shift();
    if (cur.id === endId) return { nodes: cur.path, wires: cur.wires };
    (adj[cur.id] || []).forEach(function(edge) {
      if (!visited[edge.to]) {
        visited[edge.to] = true;
        queue.push({
          id: edge.to,
          path: cur.path.concat(edge.to),
          wires: cur.wires.concat(edge.wireIdx)
        });
      }
    });
  }
  return null;
}
```

### TypeScript Port Notes

1. **Bidirectional edges**: The existing code adds both `from→to` and `to→from` edges (lines 291-292). This makes the graph undirected for path finding — a path can traverse wires in either direction. Preserve this behavior.

2. **Visibility filtering**: Wires connecting hidden-category nodes are excluded from the adjacency list (lines 289-290). The path cannot traverse invisible nodes.

3. **Return format change**: The existing code returns `{ nodes: string[], wires: number[] }`. The new version wraps these in `Set<>` objects for O(1) lookup during rendering (the canvas.ts drawNode/drawWire functions check `pathNodes[n.id]` and `pathWires[idx]`). The ordered arrays are also returned for UI display (e.g., showing the path sequence in the info panel).

4. **Edge case — same node**: If `startId === endId`, return a PathResult with just that node and no wires.

5. **Edge case — missing nodes**: If either ID is not in `nodeMap`, return null immediately.

6. **Edge case — hidden nodes**: If either the start or end node's category is hidden, return null.

### Integration with Rendering

The renderer class (section 07) stores the `PathResult` and passes its sets to the drawing functions:

```typescript
// In canvas.ts drawNode:
if (pathResult && pathResult.nodes.has(n.id)) {
  // Node is on the path — draw at full alpha
}

// In canvas.ts drawWire:
if (pathResult && pathResult.wires.has(wireIndex)) {
  // Wire is on the path — draw highlighted
}
```

### Path Hint UI

The existing index.html shows a hint message (lines 849-861):
- When a node is selected: "Shift+click another node to trace path from [title]"
- When a path is shown: "Path shown. Click anywhere or press Esc to clear."

This text is provided by the renderer class to the stats bar or a dedicated hint element — not part of the path-tracer module itself.

## Acceptance Criteria

- [ ] BFS finds shortest path between two nodes
- [ ] Graph is treated as undirected (bidirectional traversal)
- [ ] Hidden categories are excluded from pathfinding
- [ ] Returns null when no path exists
- [ ] Returns null when either node doesn't exist
- [ ] Returns null when either node's category is hidden
- [ ] Same-node case returns single-node result
- [ ] Result includes both Set (for O(1) render lookups) and ordered arrays (for UI)
- [ ] Algorithm matches index.html's BFS exactly (same traversal order, same shortest path)
- [ ] No Obsidian imports, no DOM access
- [ ] Deterministic: same input always returns same path
