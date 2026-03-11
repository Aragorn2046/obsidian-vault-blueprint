/**
 * Graph analysis algorithms for cluster detection, gap analysis,
 * and node importance scoring.
 *
 * Pure computation — no DOM or Obsidian dependencies.
 */

import type { NodeDef, WireDef } from '../types';
import { getWireNodeIds } from './canvas';

// ─── Adjacency ──────────────────────────────────────────────

/** Build an undirected adjacency map from nodes and wires. */
export function buildAdjacency(
  nodes: NodeDef[],
  wires: WireDef[],
): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();

  // Seed every node so isolates appear in the map
  for (const n of nodes) {
    adj.set(n.id, new Set());
  }

  for (const w of wires) {
    const { from, to } = getWireNodeIds(w);
    if (!adj.has(from)) adj.set(from, new Set());
    if (!adj.has(to)) adj.set(to, new Set());
    adj.get(from)!.add(to);
    adj.get(to)!.add(from);
  }

  return adj;
}

// ─── Community Detection (Label Propagation) ────────────────

/**
 * Detect clusters via label propagation.
 *
 * Each node starts with its own label. On every iteration each node
 * adopts the most frequent label among its neighbours (ties broken
 * by smallest label). Converges after at most 20 iterations or when
 * no label changes.
 */
export function detectClusters(
  nodes: NodeDef[],
  wires: WireDef[],
): Map<string, number> {
  const adj = buildAdjacency(nodes, wires);
  const ids = nodes.map((n) => n.id);

  // Initial labels: index-based
  const idToIdx = new Map<string, number>();
  for (let i = 0; i < ids.length; i++) idToIdx.set(ids[i], i);

  const labels = new Map<string, number>();
  for (let i = 0; i < ids.length; i++) labels.set(ids[i], i);

  const MAX_ITER = 20;

  for (let iter = 0; iter < MAX_ITER; iter++) {
    let changed = false;

    // Shuffle order for better convergence
    const order = [...ids];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    for (const nodeId of order) {
      const neighbors = adj.get(nodeId);
      if (!neighbors || neighbors.size === 0) continue;

      // Count neighbour label frequencies
      const freq = new Map<number, number>();
      for (const nb of neighbors) {
        const lbl = labels.get(nb)!;
        freq.set(lbl, (freq.get(lbl) ?? 0) + 1);
      }

      // Pick the most frequent label (smallest label breaks ties)
      let bestLabel = labels.get(nodeId)!;
      let bestCount = 0;
      for (const [lbl, cnt] of freq) {
        if (cnt > bestCount || (cnt === bestCount && lbl < bestLabel)) {
          bestLabel = lbl;
          bestCount = cnt;
        }
      }

      if (bestLabel !== labels.get(nodeId)) {
        labels.set(nodeId, bestLabel);
        changed = true;
      }
    }

    if (!changed) break;
  }

  // Normalise labels to contiguous 0..k-1
  const uniqueLabels = [...new Set(labels.values())].sort((a, b) => a - b);
  const remap = new Map<number, number>();
  uniqueLabels.forEach((lbl, idx) => remap.set(lbl, idx));

  const result = new Map<string, number>();
  for (const [id, lbl] of labels) {
    result.set(id, remap.get(lbl)!);
  }

  return result;
}

// ─── Betweenness Centrality (Approximate, BFS-sampled) ──────

/**
 * Approximate betweenness centrality by running BFS from up to 50
 * randomly sampled source nodes. Returns normalised 0-1 scores.
 */
export function betweennessCentrality(
  nodes: NodeDef[],
  wires: WireDef[],
): Map<string, number> {
  const adj = buildAdjacency(nodes, wires);
  const ids = nodes.map((n) => n.id);
  const n = ids.length;

  if (n === 0) return new Map();

  const scores = new Map<string, number>();
  for (const id of ids) scores.set(id, 0);

  // Sample up to 50 source nodes
  const sampleSize = Math.min(50, n);
  const shuffled = [...ids];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const sources = shuffled.slice(0, sampleSize);

  // Brandes-style BFS from each source
  for (const s of sources) {
    const stack: string[] = [];
    const predecessors = new Map<string, string[]>();
    const sigma = new Map<string, number>(); // shortest-path counts
    const dist = new Map<string, number>();
    const delta = new Map<string, number>();

    for (const id of ids) {
      predecessors.set(id, []);
      sigma.set(id, 0);
      dist.set(id, -1);
      delta.set(id, 0);
    }

    sigma.set(s, 1);
    dist.set(s, 0);

    const queue: string[] = [s];
    let qi = 0;

    while (qi < queue.length) {
      const v = queue[qi++];
      stack.push(v);
      const dv = dist.get(v)!;

      const neighbors = adj.get(v);
      if (!neighbors) continue;

      for (const w of neighbors) {
        // First visit
        if (dist.get(w)! < 0) {
          dist.set(w, dv + 1);
          queue.push(w);
        }
        // Shortest path via v?
        if (dist.get(w) === dv + 1) {
          sigma.set(w, sigma.get(w)! + sigma.get(v)!);
          predecessors.get(w)!.push(v);
        }
      }
    }

    // Back-propagation
    while (stack.length > 0) {
      const w = stack.pop()!;
      for (const v of predecessors.get(w)!) {
        const contribution =
          (sigma.get(v)! / sigma.get(w)!) * (1 + delta.get(w)!);
        delta.set(v, delta.get(v)! + contribution);
      }
      if (w !== s) {
        scores.set(w, scores.get(w)! + delta.get(w)!);
      }
    }
  }

  // Normalise to 0-1
  let max = 0;
  for (const v of scores.values()) {
    if (v > max) max = v;
  }

  const result = new Map<string, number>();
  for (const [id, v] of scores) {
    result.set(id, max > 0 ? v / max : 0);
  }

  return result;
}

// ─── Bridge Node Detection ──────────────────────────────────

/**
 * Find nodes whose neighbours span 2 or more different clusters.
 * These are "bridge" nodes that connect different communities.
 */
export function findBridgeNodes(
  nodes: NodeDef[],
  wires: WireDef[],
  clusters: Map<string, number>,
): Set<string> {
  const adj = buildAdjacency(nodes, wires);
  const bridges = new Set<string>();

  for (const [nodeId, neighbors] of adj) {
    const clusterSet = new Set<number>();
    const myCluster = clusters.get(nodeId);
    if (myCluster !== undefined) clusterSet.add(myCluster);

    for (const nb of neighbors) {
      const c = clusters.get(nb);
      if (c !== undefined) clusterSet.add(c);
    }

    if (clusterSet.size >= 2) {
      bridges.add(nodeId);
    }
  }

  return bridges;
}

// ─── Gap Detection ──────────────────────────────────────────

export interface GapSuggestion {
  nodeA: string;
  nodeB: string;
  sharedTags: string[];
  reason: string;
}

/**
 * Find pairs of nodes that share 2+ tags but have no direct wire
 * between them and live in different connected components or clusters.
 * Returns top 20 suggestions sorted by shared tag count (descending).
 */
export function findGaps(
  nodes: NodeDef[],
  wires: WireDef[],
): GapSuggestion[] {
  // Build a set of existing direct connections
  const connected = new Set<string>();
  for (const w of wires) {
    const { from, to } = getWireNodeIds(w);
    connected.add(`${from}|${to}`);
    connected.add(`${to}|${from}`);
  }

  // Detect clusters for component/cluster info
  const clusters = detectClusters(nodes, wires);

  // Build tag index: tag → nodeIds
  const tagIndex = new Map<string, string[]>();
  for (const n of nodes) {
    if (!n.tags) continue;
    for (const tag of n.tags) {
      if (!tagIndex.has(tag)) tagIndex.set(tag, []);
      tagIndex.get(tag)!.push(n.id);
    }
  }

  // Build node tag sets for quick intersection
  const nodeTags = new Map<string, Set<string>>();
  for (const n of nodes) {
    if (n.tags && n.tags.length > 0) {
      nodeTags.set(n.id, new Set(n.tags));
    }
  }

  // Find candidate pairs
  const seen = new Set<string>();
  const gaps: GapSuggestion[] = [];

  for (const [, nodeIds] of tagIndex) {
    for (let i = 0; i < nodeIds.length; i++) {
      for (let j = i + 1; j < nodeIds.length; j++) {
        const a = nodeIds[i];
        const b = nodeIds[j];
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;

        if (seen.has(key)) continue;
        seen.add(key);

        // Skip if already connected
        if (connected.has(`${a}|${b}`)) continue;

        // Must be in different clusters
        if (clusters.get(a) === clusters.get(b)) continue;

        // Count shared tags
        const tagsA = nodeTags.get(a);
        const tagsB = nodeTags.get(b);
        if (!tagsA || !tagsB) continue;

        const shared: string[] = [];
        for (const t of tagsA) {
          if (tagsB.has(t)) shared.push(t);
        }

        if (shared.length < 2) continue;

        gaps.push({
          nodeA: a,
          nodeB: b,
          sharedTags: shared,
          reason: `Share ${shared.length} tags (${shared.join(', ')}) but are in different clusters with no direct link`,
        });
      }
    }
  }

  // Sort by shared tag count descending, limit to 20
  gaps.sort((a, b) => b.sharedTags.length - a.sharedTags.length);
  return gaps.slice(0, 20);
}

// ─── PageRank ───────────────────────────────────────────────

/**
 * Simplified PageRank. 20 iterations, damping factor 0.85.
 * Returns normalised 0-1 scores.
 */
export function pageRank(
  nodes: NodeDef[],
  wires: WireDef[],
): Map<string, number> {
  const ids = nodes.map((n) => n.id);
  const n = ids.length;

  if (n === 0) return new Map();

  const DAMPING = 0.85;
  const ITERATIONS = 20;

  // Build outgoing adjacency (directed)
  const outAdj = new Map<string, string[]>();
  for (const id of ids) outAdj.set(id, []);

  for (const w of wires) {
    const { from, to } = getWireNodeIds(w);
    if (outAdj.has(from)) {
      outAdj.get(from)!.push(to);
    }
  }

  // Build incoming adjacency
  const inAdj = new Map<string, string[]>();
  for (const id of ids) inAdj.set(id, []);

  for (const w of wires) {
    const { from, to } = getWireNodeIds(w);
    if (inAdj.has(to)) {
      inAdj.get(to)!.push(from);
    }
  }

  // Initialise scores
  const scores = new Map<string, number>();
  const initVal = 1 / n;
  for (const id of ids) scores.set(id, initVal);

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const newScores = new Map<string, number>();

    // Collect dangling node mass (nodes with no outgoing links)
    let danglingSum = 0;
    for (const id of ids) {
      if (outAdj.get(id)!.length === 0) {
        danglingSum += scores.get(id)!;
      }
    }

    const base = (1 - DAMPING) / n + (DAMPING * danglingSum) / n;

    for (const id of ids) {
      let inSum = 0;
      for (const src of inAdj.get(id)!) {
        const outCount = outAdj.get(src)!.length;
        if (outCount > 0) {
          inSum += scores.get(src)! / outCount;
        }
      }
      newScores.set(id, base + DAMPING * inSum);
    }

    // Update scores
    for (const [id, v] of newScores) scores.set(id, v);
  }

  // Normalise to 0-1
  let max = 0;
  for (const v of scores.values()) {
    if (v > max) max = v;
  }

  const result = new Map<string, number>();
  for (const [id, v] of scores) {
    result.set(id, max > 0 ? v / max : 0);
  }

  return result;
}

// ─── Node Importance ────────────────────────────────────────

export type ImportanceMetric = 'connections' | 'betweenness' | 'pagerank';

/**
 * Compute a normalised 0-1 importance score for a single node
 * using the specified metric.
 */
export function nodeImportance(
  nodeId: string,
  nodes: NodeDef[],
  wires: WireDef[],
  metric: ImportanceMetric,
): number {
  switch (metric) {
    case 'connections': {
      // (inDegree + outDegree) / maxDegree
      const degreeMap = new Map<string, number>();
      for (const n of nodes) degreeMap.set(n.id, 0);

      for (const w of wires) {
        const { from, to } = getWireNodeIds(w);
        if (degreeMap.has(from)) degreeMap.set(from, degreeMap.get(from)! + 1);
        if (degreeMap.has(to)) degreeMap.set(to, degreeMap.get(to)! + 1);
      }

      let maxDegree = 0;
      for (const d of degreeMap.values()) {
        if (d > maxDegree) maxDegree = d;
      }

      const nodeDegree = degreeMap.get(nodeId) ?? 0;
      return maxDegree > 0 ? nodeDegree / maxDegree : 0;
    }

    case 'betweenness': {
      const scores = betweennessCentrality(nodes, wires);
      return scores.get(nodeId) ?? 0;
    }

    case 'pagerank': {
      const scores = pageRank(nodes, wires);
      return scores.get(nodeId) ?? 0;
    }

    default:
      return 0;
  }
}
