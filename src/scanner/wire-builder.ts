import type { App } from "obsidian";
import type { WireDef, NodeDef } from "../types";
import type { FileInfo } from "./types";

export interface WireBuildResult {
  wires: WireDef[];
  wireCount: number;
}

export function buildWires(
  files: FileInfo[],
  includedPaths: Set<string>,
  nodeIdMap: Map<string, string>,
  app: App
): WireBuildResult {
  const wires: WireDef[] = [];
  const seen = new Set<string>();

  // Primary strategy: use Obsidian's pre-computed resolved links
  const resolvedLinks = (app.metadataCache as unknown as Record<string, unknown>)
    .resolvedLinks as Record<string, Record<string, number>> | undefined;

  if (resolvedLinks && Object.keys(resolvedLinks).length > 0) {
    for (const [sourcePath, targets] of Object.entries(resolvedLinks)) {
      if (!includedPaths.has(sourcePath)) continue;
      const sourceId = nodeIdMap.get(sourcePath);
      if (!sourceId) continue;

      for (const targetPath of Object.keys(targets)) {
        if (!includedPaths.has(targetPath)) continue;
        const targetId = nodeIdMap.get(targetPath);
        if (!targetId || sourceId === targetId) continue;

        const wireKey = `${sourceId}→${targetId}`;
        if (seen.has(wireKey)) continue;
        seen.add(wireKey);

        wires.push({
          from: sourceId,
          fromPin: `${sourceId}-out-${targetId}`,
          to: targetId,
          toPin: `${targetId}-in-${sourceId}`,
          type: 'link',
        });
      }
    }
  } else {
    // Fallback: use FileInfo outgoing links
    for (const file of files) {
      if (!includedPaths.has(file.path)) continue;
      const sourceId = nodeIdMap.get(file.path);
      if (!sourceId) continue;

      for (const targetPath of file.outgoingLinks) {
        if (!includedPaths.has(targetPath)) continue;
        const targetId = nodeIdMap.get(targetPath);
        if (!targetId || sourceId === targetId) continue;

        const wireKey = `${sourceId}→${targetId}`;
        if (seen.has(wireKey)) continue;
        seen.add(wireKey);

        wires.push({
          from: sourceId,
          fromPin: `${sourceId}-out-${targetId}`,
          to: targetId,
          toPin: `${targetId}-in-${sourceId}`,
          type: 'link',
        });
      }
    }
  }

  return { wires, wireCount: wires.length };
}

export function resolveWirePins(wires: WireDef[], nodes: NodeDef[]): void {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  for (const wire of wires) {
    const sourceNode = nodeMap.get(wire.from);
    const targetNode = nodeMap.get(wire.to);

    if (sourceNode) {
      const hasSpecificPin = sourceNode.pins.out.some((p) => p.id === wire.fromPin);
      if (!hasSpecificPin) {
        const multiplePin = sourceNode.pins.out.find((p) =>
          p.id.endsWith("-out-multiple")
        );
        if (multiplePin) wire.fromPin = multiplePin.id;
      }
    }

    if (targetNode) {
      const hasSpecificPin = targetNode.pins.in.some((p) => p.id === wire.toPin);
      if (!hasSpecificPin) {
        const multiplePin = targetNode.pins.in.find((p) =>
          p.id.endsWith("-in-multiple")
        );
        if (multiplePin) wire.toPin = multiplePin.id;
      }
    }
  }
}
