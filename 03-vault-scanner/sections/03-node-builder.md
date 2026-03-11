# 03 — Node Builder

## Summary

Second stage of the scanner pipeline. Takes the `FileInfo[]` from the file collector and applies smart selection heuristics to determine which files become nodes. Generates `NodeDef` objects with pins for each included file. This is the core intelligence of the scanner — it decides what's "important" in the vault.

## Files to Create

| File | Purpose |
|------|---------|
| `src/scanner/node-builder.ts` | `buildNodes()` function — smart file selection and node generation |

## Implementation Details

### Function Signature

```typescript
import { NodeDef, PinDef } from '../renderer/types';
import { FileInfo, ScannerOptions, InclusionReason } from './types';

export interface NodeBuildResult {
  nodes: NodeDef[];
  includedPaths: Set<string>;          // Quick lookup for wire-builder
  inclusionReasons: Map<string, InclusionReason>;  // For debugging/info panel
}

export function buildNodes(
  files: FileInfo[],
  options: ScannerOptions
): NodeBuildResult;
```

### Step 1: Count Incoming Links (Backlink Census)

Before selection, count how many times each file is linked to. Use the already-extracted `outgoingLinks` from `FileInfo`:

```typescript
const backlinkCounts = new Map<string, number>();

for (const file of files) {
  for (const targetPath of file.outgoingLinks) {
    backlinkCounts.set(targetPath, (backlinkCounts.get(targetPath) ?? 0) + 1);
  }
}

// Update FileInfo objects with their incoming link counts
for (const file of files) {
  file.incomingLinkCount = backlinkCounts.get(file.path) ?? 0;
}
```

**Performance alternative**: If available, use `app.metadataCache.resolvedLinks` which is a pre-computed `Record<sourcePath, Record<targetPath, count>>`. This avoids recomputing what Obsidian already knows. The file collector can pass this through, or the node builder can access it from `options.app`:

```typescript
// Faster path using Obsidian's pre-computed link graph
const resolvedLinks = options.app.metadataCache.resolvedLinks;
for (const [sourcePath, targets] of Object.entries(resolvedLinks)) {
  for (const targetPath of Object.keys(targets)) {
    backlinkCounts.set(targetPath, (backlinkCounts.get(targetPath) ?? 0) + 1);
  }
}
```

### Step 2: Selection Heuristics

Apply inclusion rules in priority order. A file is included if ANY rule matches.

#### Always Include (forced nodes)

```typescript
function getInclusionReason(file: FileInfo, minBacklinks: number): InclusionReason | null {
  const nameLower = file.name.toLowerCase();
  const pathLower = file.path.toLowerCase();

  // 1. MOC files: 10+ outgoing wikilinks
  if (file.outgoingLinks.length >= 10) return 'moc';

  // 2. Config files
  if (file.name === 'CLAUDE' || file.name === 'MEMORY' ||
      file.path.includes('.config.') ||
      file.isRoot) {
    return 'config';
  }

  // 3. Command files (in any commands/ folder)
  if (pathLower.includes('/commands/') || pathLower.startsWith('commands/')) {
    return 'command';
  }

  // 4. Template files
  if (pathLower.includes('/templates/') || pathLower.startsWith('templates/')) {
    return 'template';
  }

  // 5. Canvas files
  if (file.extension === 'canvas') return 'canvas';

  // 6. TODO/Inbox/Cortex files
  if (/todo|inbox|cortex/i.test(file.name)) return 'todo-inbox';

  // 7. Well-connected notes: >= minBacklinks incoming links
  if (file.incomingLinkCount >= minBacklinks) return 'well-connected';

  // 8. Hub notes: 5+ outgoing AND 3+ incoming
  if (file.outgoingLinks.length >= 5 && file.incomingLinkCount >= 3) return 'hub';

  return null;  // Not included
}
```

#### Selection Pass

```typescript
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
```

### Step 3: Generate Node IDs

Node IDs must be stable, unique, and URL-safe. Use a sanitized version of the file path:

```typescript
function pathToNodeId(path: string): string {
  return path
    .replace(/[^a-zA-Z0-9_-]/g, '-')  // Replace non-alphanumeric with dashes
    .replace(/-+/g, '-')               // Collapse multiple dashes
    .replace(/^-|-$/g, '');            // Trim leading/trailing dashes
}
```

### Step 4: Generate Pins

Pins represent connection points. Each outgoing link gets an "out" pin; each incoming link gets an "in" pin. Both endpoints must be included nodes.

```typescript
function generatePins(
  file: FileInfo,
  includedPaths: Set<string>,
  files: FileInfo[],
  nodeIdMap: Map<string, string>    // path → nodeId
): { in: PinDef[]; out: PinDef[] } {
  // Out pins: one per outgoing link that targets an included node
  const outTargets = file.outgoingLinks.filter(p => includedPaths.has(p));
  let outPins: PinDef[];

  if (outTargets.length > 6) {
    // Collapse to single "multiple" pin
    outPins = [{
      id: `${nodeIdMap.get(file.path)}-out-multiple`,
      label: `${outTargets.length} connections`
    }];
  } else {
    outPins = outTargets.map(targetPath => {
      const targetName = files.find(f => f.path === targetPath)?.name ?? targetPath;
      return {
        id: `${nodeIdMap.get(file.path)}-out-${nodeIdMap.get(targetPath)}`,
        label: targetName
      };
    });
  }

  // In pins: one per incoming link from an included node
  const inSources = files.filter(
    f => includedPaths.has(f.path) && f.outgoingLinks.includes(file.path)
  );
  let inPins: PinDef[];

  if (inSources.length > 6) {
    inPins = [{
      id: `${nodeIdMap.get(file.path)}-in-multiple`,
      label: `${inSources.length} connections`
    }];
  } else {
    inPins = inSources.map(source => ({
      id: `${nodeIdMap.get(file.path)}-in-${nodeIdMap.get(source.path)}`,
      label: source.name
    }));
  }

  return { in: inPins, out: outPins };
}
```

### Step 5: Build NodeDef Objects

```typescript
const nodeIdMap = new Map<string, string>();
for (const file of included) {
  nodeIdMap.set(file.path, pathToNodeId(file.path));
}

const nodes: NodeDef[] = included.map(file => {
  const nodeId = nodeIdMap.get(file.path)!;
  const pins = generatePins(file, includedPaths, files, nodeIdMap);

  return {
    id: nodeId,
    cat: 'default',      // Placeholder — categorizer assigns real category
    title: file.name,
    x: 0,                // Layout handled by renderer
    y: 0,
    path: file.path,
    desc: buildDescription(file, inclusionReasons.get(file.path)!),
    pins,
  };
});
```

### Description Generation

```typescript
function buildDescription(file: FileInfo, reason: InclusionReason): string {
  const parts: string[] = [];
  parts.push(file.path);

  const reasonLabels: Record<InclusionReason, string> = {
    'moc': 'Map of Content',
    'config': 'Configuration',
    'command': 'Command',
    'template': 'Template',
    'canvas': 'Canvas',
    'todo-inbox': 'TODO / Inbox',
    'well-connected': `${file.incomingLinkCount} backlinks`,
    'hub': `Hub (${file.outgoingLinks.length} out, ${file.incomingLinkCount} in)`,
  };

  parts.push(reasonLabels[reason]);
  return parts.join(' · ');
}
```

### Performance Notes

- Backlink counting: O(n * avg_links) — single pass over all files' outgoing links.
- Selection: O(n) — one pass through files with constant-time checks.
- Pin generation: O(n * avg_links) — for each node, check which links target included nodes.
- Using `resolvedLinks` from Obsidian avoids the backlink counting pass entirely.
- For the pin incoming-link scan: building a reverse index (`Map<targetPath, sourcePaths[]>`) in the backlink census avoids the inner filter loop — O(1) lookup instead of O(n).

### Optimization: Reverse Link Index

```typescript
const reverseLinks = new Map<string, string[]>();  // targetPath → [sourcePaths]

for (const file of files) {
  for (const targetPath of file.outgoingLinks) {
    if (!reverseLinks.has(targetPath)) reverseLinks.set(targetPath, []);
    reverseLinks.get(targetPath)!.push(file.path);
  }
}
```

Use `reverseLinks.get(file.path)` in pin generation instead of filtering all files.

## Acceptance Criteria

1. Files with 10+ outgoing links are always included (MOC detection).
2. `CLAUDE.md`, `MEMORY.md`, and root-level files are always included (config detection).
3. Files in `commands/` folders are always included.
4. Files in `templates/` or `Templates/` folders are always included.
5. `.canvas` files are always included.
6. Files matching `*TODO*`, `*Inbox*`, `*Cortex*` (case-insensitive) are always included.
7. Files with `>= minBacklinks` incoming links are included.
8. Files with 5+ outgoing AND 3+ incoming links are included (hub detection).
9. Files that match no inclusion rule are excluded.
10. Pins are generated correctly: one per connection, with proper IDs in `{nodeId}-out-{targetId}` format.
11. Pins collapse to a single "multiple" pin when a node has >6 connections in one direction.
12. All node `x` and `y` are set to `0`.
13. Node IDs are deterministic and unique for each file path.
14. `includedPaths` set is returned for use by wire-builder.
