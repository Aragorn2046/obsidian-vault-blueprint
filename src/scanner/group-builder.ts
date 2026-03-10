import type { NodeDef, GroupDef, CategoryDef } from "../types";
import type { ScannerOptions } from "./types";

export function buildGroups(
  nodes: NodeDef[],
  folders: Map<string, string[]>,
  topFolders: string[],
  options: ScannerOptions,
  categories?: Record<string, CategoryDef>
): GroupDef[] {
  if (!options.showFolderGroups) return [];

  const folderNodes = mapNodesToFolders(nodes, folders);
  const qualifiedGroups = selectGroupFolders(folderNodes, topFolders);
  rollUpSubfolderNodes(folderNodes, topFolders, qualifiedGroups);

  const groups: GroupDef[] = [];

  for (const [folderPath, groupNodes] of qualifiedGroups) {
    if (groupNodes.length === 0) continue;

    groups.push({
      label: cleanFolderLabel(folderPath),
      color: majorityColor(groupNodes, categories),
      x: 0,
      y: 0,
      w: 0,
      h: 0,
    });
  }

  return groups;
}

function mapNodesToFolders(
  nodes: NodeDef[],
  folders: Map<string, string[]>
): Map<string, NodeDef[]> {
  const nodeByPath = new Map(nodes.map((n) => [n.path, n]));
  const folderNodes = new Map<string, NodeDef[]>();

  for (const [folderPath, filePaths] of folders) {
    const nodesInFolder: NodeDef[] = [];
    for (const filePath of filePaths) {
      const node = nodeByPath.get(filePath);
      if (node) nodesInFolder.push(node);
    }
    if (nodesInFolder.length > 0) {
      folderNodes.set(folderPath, nodesInFolder);
    }
  }

  return folderNodes;
}

function selectGroupFolders(
  folderNodes: Map<string, NodeDef[]>,
  topFolders: string[]
): Map<string, NodeDef[]> {
  const groups = new Map<string, NodeDef[]>();
  const topFolderSet = new Set(topFolders);

  for (const [folderPath, nodes] of folderNodes) {
    const isTopLevel = topFolderSet.has(folderPath);
    const isSubfolder = !isTopLevel && folderPath.includes("/");

    if (isTopLevel) {
      groups.set(folderPath, [...nodes]);
    } else if (isSubfolder && nodes.length >= 3) {
      groups.set(folderPath, [...nodes]);
    }
  }

  return groups;
}

function rollUpSubfolderNodes(
  folderNodes: Map<string, NodeDef[]>,
  topFolders: string[],
  qualifiedGroups: Map<string, NodeDef[]>
): void {
  for (const [folderPath, nodes] of folderNodes) {
    if (qualifiedGroups.has(folderPath)) continue;
    if (!folderPath.includes("/")) continue;

    const topFolder = folderPath.split("/")[0];
    if (qualifiedGroups.has(topFolder)) {
      const parentNodes = qualifiedGroups.get(topFolder)!;
      for (const node of nodes) {
        if (!parentNodes.includes(node)) {
          parentNodes.push(node);
        }
      }
    }
  }
}

function majorityColor(
  nodes: NodeDef[],
  categories?: Record<string, CategoryDef>
): string {
  if (nodes.length === 0) return "#8899aa";

  const counts = new Map<string, number>();
  for (const node of nodes) {
    counts.set(node.cat, (counts.get(node.cat) ?? 0) + 1);
  }

  let maxCount = 0;
  let maxCat = "default";
  for (const [cat, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      maxCat = cat;
    }
  }

  return categories?.[maxCat]?.color ?? "#8899aa";
}

function cleanFolderLabel(folderPath: string): string {
  const segments = folderPath.split("/");
  const name = segments[segments.length - 1];
  return name.replace(/^\d+[\s._-]+/, "").trim() || name;
}
