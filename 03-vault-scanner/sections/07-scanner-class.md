# 07 — Scanner Class (Orchestrator)

## Summary

The `VaultScanner` class in `src/scanner/index.ts` is the public entry point. Its `scan()` method chains the five pipeline stages — file-collector, node-builder, wire-builder, categorizer, group-builder — and assembles the final `BlueprintData` object. It also provides `rescan()` for incremental updates.

## Files to Create

| File | Purpose |
|------|---------|
| `src/scanner/index.ts` | `VaultScanner` class — public API, pipeline orchestration |

## Implementation Details

### Class Structure

```typescript
import { App } from 'obsidian';
import { BlueprintData } from '../renderer/types';
import { ScannerOptions } from './types';
import { collectFiles, CollectorResult } from './file-collector';
import { buildNodes, NodeBuildResult } from './node-builder';
import { buildWires, resolveWirePins, WireBuildResult } from './wire-builder';
import { categorizeNodes } from './categorizer';
import { buildGroups } from './group-builder';

export class VaultScanner {
  private options: ScannerOptions;
  private lastResult: BlueprintData | null = null;

  constructor(options: ScannerOptions) {
    this.options = {
      ...options,
      excludePaths: options.excludePaths ?? ['.obsidian'],
      minBacklinks: options.minBacklinks ?? 3,
      categoryOverrides: options.categoryOverrides ?? {},
      showFolderGroups: options.showFolderGroups ?? true,
    };
  }

  async scan(): Promise<BlueprintData> {
    const result = this.executePipeline();
    this.lastResult = result;
    return result;
  }

  async rescan(changedPaths: string[]): Promise<BlueprintData> {
    // Phase 1: full rescan (incremental optimization is a future enhancement)
    // The overhead of a full scan is low enough (< 2s for 1000 notes) that
    // incremental updates can be deferred to a later iteration.
    return this.scan();
  }
}
```

### Pipeline Execution

The core `executePipeline()` method chains all stages:

```typescript
private executePipeline(): BlueprintData {
  const app = this.options.app;

  // Stage 1: Collect files
  const collected: CollectorResult = collectFiles(app, this.options);

  // Stage 2: Build nodes (smart selection + pin generation)
  const nodeResult: NodeBuildResult = buildNodes(collected.files, this.options);

  // Stage 3: Build wires (link → wire conversion)
  const wireResult: WireBuildResult = buildWires(
    collected.files,
    nodeResult.includedPaths,
    nodeResult.nodeIdMap,
    app
  );

  // Stage 3b: Resolve wire pin references (handle collapsed "multiple" pins)
  resolveWirePins(wireResult.wires, nodeResult.nodes);

  // Stage 4: Categorize nodes (assign cat field)
  const catResult = categorizeNodes(
    nodeResult.nodes,
    collected.files,
    this.options
  );

  // Stage 5: Build groups (folder structure → group boxes)
  const groups = buildGroups(
    nodeResult.nodes,
    collected.folders,
    collected.topFolders,
    this.options
  );

  // Assemble final BlueprintData
  const nodeCount = nodeResult.nodes.length;
  const wireCount = wireResult.wireCount;

  return {
    meta: {
      title: this.getVaultName(),
      subtitle: `${nodeCount} nodes · ${wireCount} connections`,
    },
    categories: catResult.categories,
    groups,
    nodes: nodeResult.nodes,
    wires: wireResult.wires,
  };
}
```

### Vault Name Resolution

```typescript
private getVaultName(): string {
  // Obsidian exposes the vault name through app.vault.getName()
  const vaultName = this.options.app.vault.getName();
  return vaultName ? `${vaultName} Blueprint` : 'Vault Blueprint';
}
```

### Node ID Map

The node-builder needs to export `nodeIdMap` alongside nodes and includedPaths. Update `NodeBuildResult`:

```typescript
// In node-builder.ts (update from section 03)
export interface NodeBuildResult {
  nodes: NodeDef[];
  includedPaths: Set<string>;
  inclusionReasons: Map<string, InclusionReason>;
  nodeIdMap: Map<string, string>;    // path → nodeId — needed by wire-builder
}
```

### Data Flow Diagram

```
app.vault  ──→  file-collector  ──→  FileInfo[]
                                       │
                                       ▼
                                  node-builder  ──→  NodeDef[] + includedPaths + nodeIdMap
                                       │
                                       ▼
                                  wire-builder  ──→  WireDef[]
                                       │
                                       ▼
                                  resolveWirePins (mutates wires)
                                       │
                                       ▼
                                  categorizer   ──→  mutates NodeDef[].cat + categories record
                                       │
                                       ▼
                                  group-builder  ──→  GroupDef[]
                                       │
                                       ▼
                                  BlueprintData  ──→  renderer
```

### All Node Positions = 0

The scanner sets all `node.x = 0` and `node.y = 0`. The renderer's layout algorithm (from split 02) handles positioning. This is a deliberate architectural decision: the scanner determines WHAT is shown, the renderer determines WHERE.

### Meta Object

```typescript
meta: {
  title: "MyVault Blueprint",              // app.vault.getName() + " Blueprint"
  subtitle: "47 nodes · 123 connections"   // Dynamic counts
}
```

### Error Handling

The scanner should not throw on edge cases — it should degrade gracefully:

```typescript
private executePipeline(): BlueprintData {
  try {
    // ... pipeline stages ...
  } catch (error) {
    console.error('[VaultBlueprint] Scanner error:', error);

    // Return minimal valid BlueprintData
    return {
      meta: {
        title: 'Vault Blueprint',
        subtitle: 'Scan failed — check console for details',
      },
      categories: {},
      groups: [],
      nodes: [],
      wires: [],
    };
  }
}
```

### Async Considerations

The `scan()` method is `async` even though the current implementation is synchronous. This is intentional:

1. **Future-proofing**: Incremental scanning may use `app.vault.cachedRead()` which is async.
2. **Yielding to UI**: For very large vaults, the pipeline could be broken into chunks with `await sleep(0)` to avoid blocking the main thread.
3. **API contract**: Callers already handle the Promise — making it sync later would be a breaking change in the wrong direction.

For Phase 1, the async wrapper is simple:

```typescript
async scan(): Promise<BlueprintData> {
  const result = this.executePipeline();
  this.lastResult = result;
  return result;
}
```

### Rescan Strategy (Phase 1: Full Rescan)

```typescript
async rescan(changedPaths: string[]): Promise<BlueprintData> {
  // Log what changed for debugging
  console.debug(`[VaultBlueprint] Rescan triggered for ${changedPaths.length} changed files`);

  // Full rescan — the pipeline is fast enough for vaults up to 1000+ notes
  return this.scan();
}
```

A future optimization could:
1. Check if changed files affect included nodes
2. Only rebuild affected nodes and their wires
3. Reuse cached FileInfo for unchanged files

But this is unnecessary for Phase 1 given the < 2s target.

### Re-export

`src/scanner/index.ts` should re-export the public types:

```typescript
export { VaultScanner } from './index';
export { ScannerOptions } from './types';
```

Or more cleanly, the file IS the index, so just export directly:

```typescript
export class VaultScanner { /* ... */ }
export type { ScannerOptions } from './types';
```

## Acceptance Criteria

1. `VaultScanner` can be instantiated with a `ScannerOptions` object.
2. `scan()` returns a valid `BlueprintData` object with all required fields (`meta`, `categories`, `groups`, `nodes`, `wires`).
3. Default options are applied: `excludePaths` defaults to `['.obsidian']`, `minBacklinks` defaults to 3, `showFolderGroups` defaults to true.
4. `meta.title` includes the vault name from `app.vault.getName()`.
5. `meta.subtitle` shows accurate node and wire counts.
6. All nodes have `x: 0, y: 0` — no layout is performed.
7. Pipeline stages execute in correct order: collect → build nodes → build wires → resolve pins → categorize → build groups.
8. Scanner does not throw on empty vaults — returns valid BlueprintData with empty arrays.
9. Scanner does not throw on vaults with no qualifying nodes — returns valid BlueprintData with empty arrays.
10. `rescan()` produces correct output (full rescan in Phase 1).
11. Console error is logged if pipeline fails, with a fallback empty BlueprintData returned.
12. Scan completes in < 2 seconds for a 1000-note vault, < 500ms for a 300-note vault.
