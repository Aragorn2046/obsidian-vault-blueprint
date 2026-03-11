import type { NodeDef, PinDef } from "../types";
import type { FileInfo, ScannerOptions, InclusionReason } from "./types";

export interface NodeBuildResult {
  nodes: NodeDef[];
  includedPaths: Set<string>;
  inclusionReasons: Map<string, InclusionReason>;
  nodeIdMap: Map<string, string>;
}

export function buildNodes(
  files: FileInfo[],
  options: ScannerOptions
): NodeBuildResult {
  // Build reverse link index for backlink counting
  const backlinkCounts = new Map<string, number>();
  const reverseLinks = new Map<string, string[]>();

  for (const file of files) {
    for (const targetPath of file.outgoingLinks) {
      backlinkCounts.set(targetPath, (backlinkCounts.get(targetPath) ?? 0) + 1);
      if (!reverseLinks.has(targetPath)) reverseLinks.set(targetPath, []);
      reverseLinks.get(targetPath)!.push(file.path);
    }
  }

  // Update incoming link counts
  for (const file of files) {
    file.incomingLinkCount = backlinkCounts.get(file.path) ?? 0;
  }

  // Selection pass
  const included: FileInfo[] = [];
  const includedPaths = new Set<string>();
  const inclusionReasons = new Map<string, InclusionReason>();

  for (const file of files) {
    const reason = getInclusionReason(file, options.minBacklinks);
    if (reason) {
      included.push(file);
      includedPaths.add(file.path);
      inclusionReasons.set(file.path, reason);
    }
  }

  // Generate node IDs
  const nodeIdMap = new Map<string, string>();
  for (const file of included) {
    nodeIdMap.set(file.path, pathToNodeId(file.path));
  }

  // Build file lookup for pin generation
  const fileByPath = new Map(files.map((f) => [f.path, f]));

  // Build NodeDef objects
  const nodes: NodeDef[] = included.map((file) => {
    const nodeId = nodeIdMap.get(file.path)!;
    const pins = generatePins(file, includedPaths, reverseLinks, fileByPath, nodeIdMap);

    return {
      id: nodeId,
      cat: "default",
      title: file.name,
      x: 0,
      y: 0,
      path: file.path,
      desc: buildDescription(file, inclusionReasons.get(file.path)!),
      tags: file.tags.length > 0 ? [...file.tags] : undefined,
      properties: file.frontmatter ? { ...file.frontmatter } : undefined,
      pins,
    };
  });

  return { nodes, includedPaths, inclusionReasons, nodeIdMap };
}

function getInclusionReason(
  file: FileInfo,
  minBacklinks: number
): InclusionReason | null {
  const pathLower = file.path.toLowerCase();

  // 1. MOC files: 10+ outgoing wikilinks
  if (file.outgoingLinks.length >= 10) return "moc";

  // 2. Config files
  if (
    file.name === "CLAUDE" ||
    file.name === "MEMORY" ||
    file.path.includes(".config.") ||
    file.isRoot
  ) {
    return "config";
  }

  // 3. Command files
  if (pathLower.includes("/commands/") || pathLower.startsWith("commands/")) {
    return "command";
  }

  // 4. Template files
  if (pathLower.includes("/templates/") || pathLower.startsWith("templates/")) {
    return "template";
  }

  // 5. Canvas files
  if (file.extension === "canvas") return "canvas";

  // 6. TODO/Inbox/Cortex files
  if (/todo|inbox|cortex/i.test(file.name)) return "todo-inbox";

  // 7. Well-connected notes
  if (file.incomingLinkCount >= minBacklinks) return "well-connected";

  // 8. Hub notes: 5+ outgoing AND 3+ incoming
  if (file.outgoingLinks.length >= 5 && file.incomingLinkCount >= 3) return "hub";

  return null;
}

function pathToNodeId(path: string): string {
  return path
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function generatePins(
  file: FileInfo,
  includedPaths: Set<string>,
  reverseLinks: Map<string, string[]>,
  fileByPath: Map<string, FileInfo>,
  nodeIdMap: Map<string, string>
): { in: PinDef[]; out: PinDef[] } {
  const nodeId = nodeIdMap.get(file.path)!;

  // Out pins: outgoing links to included nodes
  const outTargets = file.outgoingLinks.filter((p) => includedPaths.has(p));
  let outPins: PinDef[];

  if (outTargets.length > 6) {
    outPins = [{ id: `${nodeId}-out-multiple`, label: `${outTargets.length} connections` }];
  } else {
    outPins = outTargets.map((targetPath) => {
      const targetName = fileByPath.get(targetPath)?.name ?? targetPath;
      return {
        id: `${nodeId}-out-${nodeIdMap.get(targetPath) ?? "unknown"}`,
        label: targetName,
      };
    });
  }

  // In pins: incoming links from included nodes
  const inSources = (reverseLinks.get(file.path) ?? []).filter((p) =>
    includedPaths.has(p)
  );
  let inPins: PinDef[];

  if (inSources.length > 6) {
    inPins = [{ id: `${nodeId}-in-multiple`, label: `${inSources.length} connections` }];
  } else {
    inPins = inSources.map((sourcePath) => {
      const sourceName = fileByPath.get(sourcePath)?.name ?? sourcePath;
      return {
        id: `${nodeId}-in-${nodeIdMap.get(sourcePath) ?? "unknown"}`,
        label: sourceName,
      };
    });
  }

  return { in: inPins, out: outPins };
}

function buildDescription(file: FileInfo, reason: InclusionReason): string {
  const reasonLabels: Record<InclusionReason, string> = {
    moc: "Map of Content",
    config: "Configuration",
    command: "Command",
    template: "Template",
    canvas: "Canvas",
    "todo-inbox": "TODO / Inbox",
    "well-connected": `${file.incomingLinkCount} backlinks`,
    hub: `Hub (${file.outgoingLinks.length} out, ${file.incomingLinkCount} in)`,
  };

  return `${file.path} · ${reasonLabels[reason]}`;
}
