// ─── Embed Wire Scanner ─────────────────────────────────────
// Detects ![[embed]] references and creates typed wires for them.

import type { App, TFile } from "obsidian";
import type { WireDef, NodeDef } from "../types";

/**
 * Scan included nodes for ![[embed]] references and generate
 * embed-typed wires. Embeds are transclusions — they pull
 * content from another note into the current note.
 */
export async function buildEmbedWires(
  app: App,
  nodes: NodeDef[],
  nodeIdMap: Map<string, string>,
  existingWireKeys: Set<string>,
): Promise<WireDef[]> {
  const wires: WireDef[] = [];

  // Build path → nodeId lookup
  const pathToNodeId = new Map<string, string>();
  for (const [path, nodeId] of nodeIdMap.entries()) {
    pathToNodeId.set(path.toLowerCase(), nodeId);
    const basename = path.split("/").pop()?.toLowerCase().replace(/\.\w+$/, "") ?? "";
    if (basename && !pathToNodeId.has(basename)) {
      pathToNodeId.set(basename, nodeId);
    }
  }

  for (const node of nodes) {
    if (!node.path) continue;
    const file = app.vault.getAbstractFileByPath(node.path);
    if (!file) continue;

    let content: string;
    try {
      content = await app.vault.cachedRead(file as TFile);
    } catch {
      continue;
    }

    // Match ![[filename]] or ![[filename#heading]] or ![[filename|alias]]
    const embedRegex = /!\[\[([^\]#|]+)(?:[#|][^\]]*)?]]/g;
    let m;
    while ((m = embedRegex.exec(content)) !== null) {
      const target = m[1].trim().toLowerCase();

      // Try to resolve to a node
      const targetId = pathToNodeId.get(target)
        ?? pathToNodeId.get(target + ".md")
        ?? pathToNodeId.get(target.split("/").pop() ?? "");

      if (!targetId || targetId === node.id) continue;

      const wireKey = `${node.id}→${targetId}`;
      if (existingWireKeys.has(wireKey)) continue;
      existingWireKeys.add(wireKey);

      wires.push({
        from: node.id,
        fromPin: `${node.id}-out-${targetId}`,
        to: targetId,
        toPin: `${targetId}-in-${node.id}`,
        type: 'embed',
      });
    }
  }

  return wires;
}
