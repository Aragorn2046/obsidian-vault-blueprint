// ─── Tag Wire Scanner ───────────────────────────────────────
// Creates wires between nodes that share tags.
// Only creates wires when nodes share 2+ tags to avoid noise.

import type { WireDef, NodeDef } from "../types";
import type { FileInfo } from "./types";

/**
 * Build tag-based wires: nodes sharing 2+ tags get a connection.
 * Uses the tags extracted during file collection.
 */
export function buildTagWires(
  nodes: NodeDef[],
  files: FileInfo[],
  nodeIdMap: Map<string, string>,
  existingWireKeys: Set<string>,
  minSharedTags: number = 2,
): WireDef[] {
  const wires: WireDef[] = [];

  // Build nodeId → tags lookup
  const fileTagMap = new Map<string, Set<string>>();
  for (const file of files) {
    const nodeId = nodeIdMap.get(file.path);
    if (!nodeId) continue;
    if (file.tags.length > 0) {
      fileTagMap.set(nodeId, new Set(file.tags.map(t => t.toLowerCase())));
    }
  }

  // Compare all pairs of nodes with tags
  const nodeIds = [...fileTagMap.keys()];
  for (let i = 0; i < nodeIds.length; i++) {
    const aId = nodeIds[i];
    const aTags = fileTagMap.get(aId)!;

    for (let j = i + 1; j < nodeIds.length; j++) {
      const bId = nodeIds[j];
      const bTags = fileTagMap.get(bId)!;

      // Count shared tags
      let shared = 0;
      for (const tag of aTags) {
        if (bTags.has(tag)) shared++;
      }

      if (shared >= minSharedTags) {
        // Check both directions
        const wireKey1 = `${aId}→${bId}`;
        const wireKey2 = `${bId}→${aId}`;
        if (existingWireKeys.has(wireKey1) || existingWireKeys.has(wireKey2)) continue;
        existingWireKeys.add(wireKey1);

        wires.push({
          from: aId,
          to: bId,
          type: 'tag',
        });
      }
    }
  }

  return wires;
}
