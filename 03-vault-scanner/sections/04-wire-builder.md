# 04 — Wire Builder

## Summary

Third stage of the scanner pipeline. Converts wikilinks between included nodes into directional `WireDef` objects. Uses Obsidian's `app.metadataCache` for link extraction and `resolvedLinks` for performance. Only creates wires where both endpoints are included nodes.

## Files to Create

| File | Purpose |
|------|---------|
| `src/scanner/wire-builder.ts` | `buildWires()` function — link extraction and wire generation |

## Implementation Details

### Function Signature

```typescript
import { App } from 'obsidian';
import { WireDef } from '../renderer/types';
import { FileInfo } from './types';

export interface WireBuildResult {
  wires: WireDef[];
  wireCount: number;
}

export function buildWires(
  files: FileInfo[],
  includedPaths: Set<string>,
  nodeIdMap: Map<string, string>,    // path → nodeId
  app: App
): WireBuildResult;
```

### Primary Strategy: Use resolvedLinks

Obsidian maintains a pre-computed link graph at `app.metadataCache.resolvedLinks`. This is a nested record: `Record<sourcePath, Record<targetPath, linkCount>>`. Using it avoids re-parsing each file's cache.

```typescript
export function buildWires(
  files: FileInfo[],
  includedPaths: Set<string>,
  nodeIdMap: Map<string, string>,
  app: App
): WireBuildResult {
  const wires: WireDef[] = [];
  const seen = new Set<string>();  // Deduplicate "sourceId→targetId"

  const resolvedLinks = app.metadataCache.resolvedLinks;

  for (const [sourcePath, targets] of Object.entries(resolvedLinks)) {
    // Skip if source is not an included node
    if (!includedPaths.has(sourcePath)) continue;

    const sourceId = nodeIdMap.get(sourcePath);
    if (!sourceId) continue;

    for (const targetPath of Object.keys(targets)) {
      // Skip if target is not an included node
      if (!includedPaths.has(targetPath)) continue;

      const targetId = nodeIdMap.get(targetPath);
      if (!targetId) continue;

      // Skip self-links
      if (sourceId === targetId) continue;

      // Deduplicate (a file may link to the same target multiple times)
      const wireKey = `${sourceId}→${targetId}`;
      if (seen.has(wireKey)) continue;
      seen.add(wireKey);

      wires.push(buildWireDef(sourceId, targetId, nodeIdMap));
    }
  }

  return { wires, wireCount: wires.length };
}
```

### Fallback Strategy: Per-file Cache

If `resolvedLinks` is empty or unavailable (edge case during vault load), fall back to per-file metadata cache:

```typescript
function buildWiresFromCache(
  files: FileInfo[],
  includedPaths: Set<string>,
  nodeIdMap: Map<string, string>,
  app: App
): WireDef[] {
  const wires: WireDef[] = [];
  const seen = new Set<string>();

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

      wires.push(buildWireDef(sourceId, targetId, nodeIdMap));
    }
  }

  return wires;
}
```

### Wire Definition Construction

Wire `from`/`to` reference pin IDs when pins exist, or node IDs when using collapsed "multiple" pins.

```typescript
function buildWireDef(
  sourceId: string,
  targetId: string,
  nodeIdMap: Map<string, string>
): WireDef {
  // Pin IDs follow the convention from node-builder:
  //   out pin: "{sourceId}-out-{targetId}"
  //   in pin:  "{targetId}-in-{sourceId}"
  // For collapsed pins: "{nodeId}-out-multiple" / "{nodeId}-in-multiple"

  return {
    from: sourceId,
    fromPin: `${sourceId}-out-${targetId}`,
    to: targetId,
    toPin: `${targetId}-in-${sourceId}`,
  };
}
```

### Pin Reference Resolution

After wires are built, resolve pin references against the actual pins on each node. If a node's pins were collapsed to "multiple", update the wire to reference the collapsed pin:

```typescript
import { NodeDef } from '../renderer/types';

export function resolveWirePins(wires: WireDef[], nodes: NodeDef[]): void {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  for (const wire of wires) {
    const sourceNode = nodeMap.get(wire.from);
    const targetNode = nodeMap.get(wire.to);

    if (sourceNode) {
      // Check if the specific out pin exists, otherwise use "multiple"
      const hasSpecificPin = sourceNode.pins.out.some(p => p.id === wire.fromPin);
      if (!hasSpecificPin) {
        const multiplePin = sourceNode.pins.out.find(p => p.id.endsWith('-out-multiple'));
        if (multiplePin) wire.fromPin = multiplePin.id;
      }
    }

    if (targetNode) {
      const hasSpecificPin = targetNode.pins.in.some(p => p.id === wire.toPin);
      if (!hasSpecificPin) {
        const multiplePin = targetNode.pins.in.find(p => p.id.endsWith('-in-multiple'));
        if (multiplePin) wire.toPin = multiplePin.id;
      }
    }
  }
}
```

### Wire Direction Semantics

The spec defines wires as process flows, not just "links exist":

| Source | Target | Semantic |
|--------|--------|----------|
| Command file | Session Log | "This command writes to Session Log" |
| MOC | Article | "This MOC indexes this article" |
| Config | Profile | "This config reads this profile" |
| Any file | Any file | "This file engages/references that file" |

Direction is always **from the file containing the `[[wikilink]]` to the linked file**. This matches the vault's actual information flow.

### Performance Notes

- `resolvedLinks` is O(1) access — it's a pre-computed object Obsidian maintains.
- Iterating all entries: O(total_links_in_vault) — one pass.
- The `includedPaths.has()` check is O(1) per link — Set lookup.
- Deduplication via `seen` Set: O(1) per wire.
- Total: O(L) where L = total links in vault. For a 1000-note vault with avg 5 links: ~5000 iterations. Negligible time.

## Acceptance Criteria

1. Wires are created only between included nodes (both endpoints in `includedPaths`).
2. Wire direction is from (file with wikilink) to (linked file) — never reversed.
3. Self-links (file linking to itself) are excluded.
4. Duplicate wires between the same source/target pair are deduplicated.
5. `fromPin` and `toPin` follow the `{nodeId}-out-{targetId}` / `{nodeId}-in-{sourceId}` convention.
6. When pins are collapsed to "multiple", wire pin references are updated to the collapsed pin ID.
7. Primary path uses `app.metadataCache.resolvedLinks` for performance.
8. Fallback path uses `file.outgoingLinks` from `FileInfo` if `resolvedLinks` is empty.
9. Wire count is accurate and returned alongside the wire array.
10. No wires reference non-existent nodes or pins after resolution.
