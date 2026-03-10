// ─── Path Tracer — BFS shortest path between nodes ──────────
// Zero Obsidian dependencies. Pure computation.

import type { NodeDef, WireDef, CategoryDef } from '../types';

// ─── Types ──────────────────────────────────────────────────

export interface PathResult {
  nodes: Set<string>;
  wires: Set<number>;
  orderedNodes: string[];
  orderedWires: number[];
}

// ─── BFS Path Finding ───────────────────────────────────────

/**
 * BFS shortest path between two nodes through visible wires.
 * The graph is treated as undirected (wires can be traversed in either direction).
 * Returns null if no path exists.
 */
export function findPath(
  startId: string,
  endId: string,
  nodes: NodeDef[],
  wires: WireDef[],
  nodeMap: Record<string, NodeDef>,
  categories: Record<string, CategoryDef>,
): PathResult | null {
  // Edge case: missing nodes
  if (!nodeMap[startId] || !nodeMap[endId]) return null;

  // Edge case: hidden categories
  const startCat = categories[nodeMap[startId].cat];
  const endCat = categories[nodeMap[endId].cat];
  if (!startCat || startCat.visible === false) return null;
  if (!endCat || endCat.visible === false) return null;

  // Edge case: same node
  if (startId === endId) {
    return {
      nodes: new Set([startId]),
      wires: new Set(),
      orderedNodes: [startId],
      orderedWires: [],
    };
  }

  // Build bidirectional adjacency list (only visible nodes)
  const adj: Record<string, Array<{ to: string; wireIdx: number }>> = {};
  for (const n of nodes) {
    adj[n.id] = [];
  }

  for (let idx = 0; idx < wires.length; idx++) {
    const w = wires[idx];
    const fromId = w.from.split('.')[0];
    const toId = w.to.split('.')[0];

    const fromNode = nodeMap[fromId];
    const toNode = nodeMap[toId];
    if (!fromNode || !toNode) continue;

    const fromCat = categories[fromNode.cat];
    const toCat = categories[toNode.cat];
    if (!fromCat || fromCat.visible === false) continue;
    if (!toCat || toCat.visible === false) continue;

    if (adj[fromId]) adj[fromId].push({ to: toId, wireIdx: idx });
    if (adj[toId]) adj[toId].push({ to: fromId, wireIdx: idx });
  }

  // BFS
  const visited: Record<string, boolean> = {};
  const queue: Array<{ id: string; path: string[]; wires: number[] }> = [
    { id: startId, path: [startId], wires: [] },
  ];
  visited[startId] = true;

  while (queue.length > 0) {
    const cur = queue.shift()!;

    if (cur.id === endId) {
      return {
        nodes: new Set(cur.path),
        wires: new Set(cur.wires),
        orderedNodes: cur.path,
        orderedWires: cur.wires,
      };
    }

    const edges = adj[cur.id] || [];
    for (const edge of edges) {
      if (!visited[edge.to]) {
        visited[edge.to] = true;
        queue.push({
          id: edge.to,
          path: cur.path.concat(edge.to),
          wires: cur.wires.concat(edge.wireIdx),
        });
      }
    }
  }

  return null;
}
