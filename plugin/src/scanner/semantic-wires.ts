// ─── Semantic Wire Scanner ───────────────────────────────────
// Extracts file-path references from note content (not wikilinks)
// to discover semantic relationships like "command X reads file Y".
// Catches references that Obsidian's resolvedLinks misses because
// they appear as plain-text paths rather than [[wikilinks]].

import type { App, TFile } from "obsidian";
import type { WireDef, NodeDef } from "../types";

/**
 * Scan included nodes' file content for vault path references
 * and generate additional wires for discovered relationships.
 * Returns a promise because reading file content is async.
 */
export async function buildSemanticWires(
  app: App,
  nodes: NodeDef[],
  nodeIdMap: Map<string, string>,
  includedPaths: Set<string>,
  existingWireKeys: Set<string>,
): Promise<WireDef[]> {
  const vaultRoot = getVaultRoot(app);
  const wires: WireDef[] = [];

  // Build a lookup: normalized vault-relative path → node ID
  const pathToNodeId = new Map<string, string>();
  for (const [path, nodeId] of nodeIdMap.entries()) {
    pathToNodeId.set(path.toLowerCase(), nodeId);
    // Also index by basename for bare filename matches
    const basename = path.split("/").pop()?.toLowerCase() ?? "";
    if (basename && !pathToNodeId.has(basename)) {
      pathToNodeId.set(basename, nodeId);
    }
    // Index without extension
    const noExt = basename.replace(/\.\w+$/, "");
    if (noExt && !pathToNodeId.has(noExt)) {
      pathToNodeId.set(noExt, nodeId);
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
    if (!content) continue;

    // Extract all vault path references from the content
    const refs = extractPathReferences(content, vaultRoot);

    for (const ref of refs) {
      const targetNodeId = resolveReference(ref, pathToNodeId);
      if (!targetNodeId) continue;
      if (targetNodeId === node.id) continue; // no self-wires

      const wireKey = `${node.id}→${targetNodeId}`;
      if (existingWireKeys.has(wireKey)) continue;
      existingWireKeys.add(wireKey);

      wires.push({
        from: node.id,
        fromPin: `${node.id}-out-${targetNodeId}`,
        to: targetNodeId,
        toPin: `${targetNodeId}-in-${node.id}`,
        type: 'semantic',
      });
    }
  }

  return wires;
}

/**
 * Get the vault root path for stripping absolute paths.
 */
function getVaultRoot(app: App): string {
  const adapter = app.vault.adapter as any;
  if (adapter?.basePath) {
    return adapter.basePath;
  }
  return "";
}

/**
 * Extract vault file path references from text content.
 * Matches patterns like:
 *   /home/arago/vault/Claude Knowledge Base/Session Log.md
 *   `Projects TO DO.md`
 *   `Claude Knowledge Base/Setup Guide - New Machine.md`
 *   `_Cortex.md`
 *   `Vault MOC.md`
 */
export function extractPathReferences(
  content: string,
  vaultRoot: string,
): string[] {
  const refs: string[] = [];
  const seen = new Set<string>();

  // Pattern 1: Absolute vault paths (with or without backticks)
  if (vaultRoot) {
    const escapedRoot = vaultRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const absRegex = new RegExp(
      escapedRoot + "[/\\\\]([^`\\n\"'\\)]+\\.(?:md|canvas))",
      "gi"
    );
    let m;
    while ((m = absRegex.exec(content)) !== null) {
      const relPath = m[1].trim();
      if (!seen.has(relPath.toLowerCase())) {
        seen.add(relPath.toLowerCase());
        refs.push(relPath);
      }
    }
  }

  // Pattern 2: Backtick-wrapped vault-relative paths
  const backtickRegex = /`([^`\n]+\.(?:md|canvas))`/gi;
  let m2;
  while ((m2 = backtickRegex.exec(content)) !== null) {
    const ref = m2[1].trim();
    // Skip if it looks like code
    if (/[=(){};<>|&]/.test(ref)) continue;
    if (!seen.has(ref.toLowerCase())) {
      seen.add(ref.toLowerCase());
      refs.push(ref);
    }
  }

  // Pattern 3: Bare well-known filenames mentioned in text
  const knownFiles = [
    "Vault MOC", "Content MOC", "Session Log", "Project Status",
    "Projects TO DO", "Personal TO DO", "_Cortex", "Worldview",
    "CLAUDE.md", "MEMORY.md",
  ];
  for (const name of knownFiles) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp("\\b" + escaped + "(?:\\.md)?\\b", "gi");
    if (regex.test(content)) {
      const key = name.toLowerCase();
      if (!seen.has(key) && !seen.has(key + ".md")) {
        seen.add(key);
        refs.push(name);
      }
    }
  }

  return refs;
}

/**
 * Resolve a path reference to a node ID.
 * Tries multiple matching strategies.
 */
function resolveReference(
  ref: string,
  pathToNodeId: Map<string, string>,
): string | null {
  const lower = ref.toLowerCase();

  // Try exact vault-relative path
  if (pathToNodeId.has(lower)) return pathToNodeId.get(lower)!;

  // Try with .md appended
  if (!lower.endsWith(".md") && pathToNodeId.has(lower + ".md")) {
    return pathToNodeId.get(lower + ".md")!;
  }

  // Try just the basename
  const basename = lower.split("/").pop() ?? lower;
  if (pathToNodeId.has(basename)) return pathToNodeId.get(basename)!;

  // Try basename without extension
  const noExt = basename.replace(/\.\w+$/, "");
  if (pathToNodeId.has(noExt)) return pathToNodeId.get(noExt)!;

  return null;
}
