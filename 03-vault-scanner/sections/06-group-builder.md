# 06 — Group Builder

## Summary

Fifth stage of the scanner pipeline. Generates `GroupDef` objects from the vault's folder structure. Top-level folders always become groups; subfolders only become groups if they contain 3+ nodes. Groups get their position/size from the bounding box of contained nodes (plus padding), their color from the majority category, and their label from the cleaned folder name.

## Files to Create

| File | Purpose |
|------|---------|
| `src/scanner/group-builder.ts` | `buildGroups()` function — folder-to-group conversion |

## Implementation Details

### Function Signature

```typescript
import { NodeDef, GroupDef } from '../renderer/types';
import { ScannerOptions } from './types';

export function buildGroups(
  nodes: NodeDef[],
  folders: Map<string, string[]>,   // folderPath → file paths (from collector)
  topFolders: string[],             // Top-level folder names (from collector)
  options: ScannerOptions
): GroupDef[];
```

### Step 1: Map Nodes to Folders

Build a lookup from folder path to the nodes contained in that folder:

```typescript
function mapNodesToFolders(
  nodes: NodeDef[],
  folders: Map<string, string[]>
): Map<string, NodeDef[]> {
  const nodeByPath = new Map(nodes.map(n => [n.path, n]));
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
```

### Step 2: Determine Which Folders Become Groups

```typescript
function selectGroupFolders(
  folderNodes: Map<string, NodeDef[]>,
  topFolders: string[]
): Map<string, NodeDef[]> {
  const groups = new Map<string, NodeDef[]>();
  const topFolderSet = new Set(topFolders);

  for (const [folderPath, nodes] of folderNodes) {
    const isTopLevel = topFolderSet.has(folderPath);
    const isSubfolder = !isTopLevel && folderPath.includes('/');

    if (isTopLevel) {
      // Top-level folders: always become groups (even with 1 node)
      // Also collect nodes from subfolders into the top-level group
      groups.set(folderPath, nodes);
    } else if (isSubfolder && nodes.length >= 3) {
      // Subfolders: only if they have 3+ nodes
      groups.set(folderPath, nodes);
    }
    // Root-level files (folder = '' or no folder) don't form a group
  }

  return groups;
}
```

### Step 2b: Roll Up Subfolder Nodes into Parent Groups

Nodes in subfolders that don't qualify as their own group should be included in their top-level parent group:

```typescript
function rollUpSubfolderNodes(
  folderNodes: Map<string, NodeDef[]>,
  topFolders: string[],
  qualifiedGroups: Map<string, NodeDef[]>
): void {
  for (const [folderPath, nodes] of folderNodes) {
    if (qualifiedGroups.has(folderPath)) continue;  // Already a group
    if (!folderPath.includes('/')) continue;          // Not a subfolder

    // Find the top-level parent
    const topFolder = folderPath.split('/')[0];
    if (qualifiedGroups.has(topFolder)) {
      // Add these nodes to the parent group
      const parentNodes = qualifiedGroups.get(topFolder)!;
      for (const node of nodes) {
        if (!parentNodes.includes(node)) {
          parentNodes.push(node);
        }
      }
    }
  }
}
```

### Step 3: Calculate Group Bounding Box

Since node x/y are all 0 at this stage (layout hasn't run yet), the group positions are also set to 0. The renderer's layout algorithm will recompute group bounds after positioning nodes. However, we still define the structure so the layout knows which nodes belong to which group.

For groups to work with the layout algorithm, we set placeholder dimensions:

```typescript
const GROUP_PADDING = 40;  // px padding around contained nodes

function calculateGroupBounds(nodes: NodeDef[]): { x: number; y: number; w: number; h: number } {
  if (nodes.length === 0) return { x: 0, y: 0, w: 0, h: 0 };

  // All nodes are x=0, y=0 at scan time — layout will recompute
  // Set placeholder bounds that the layout algorithm will override
  return {
    x: 0,
    y: 0,
    w: 0,
    h: 0,
  };
}
```

**Note**: The renderer's `layout.ts` (from split 02) handles actual positioning. The scanner provides the grouping structure; the renderer provides the geometry. After layout runs, group x/y/w/h are recalculated from the bounding box of their positioned nodes + 40px padding.

### Step 4: Determine Group Color (Majority Category)

```typescript
function majorityColor(nodes: NodeDef[], categories: Record<string, { color: string }>): string {
  if (nodes.length === 0) return '#8899aa';

  // Count category occurrences
  const counts = new Map<string, number>();
  for (const node of nodes) {
    counts.set(node.cat, (counts.get(node.cat) ?? 0) + 1);
  }

  // Find the most common category
  let maxCount = 0;
  let maxCat = 'default';
  for (const [cat, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      maxCat = cat;
    }
  }

  return categories[maxCat]?.color ?? '#8899aa';
}
```

### Step 5: Clean Folder Name for Label

Strip leading numbers and separators used for sort ordering in Obsidian:

```typescript
function cleanFolderLabel(folderPath: string): string {
  // Use the last segment of the path (actual folder name)
  const segments = folderPath.split('/');
  const name = segments[segments.length - 1];

  // Strip leading numbers + separator: "1 Worldview" → "Worldview"
  // Patterns: "1 Name", "01 Name", "1-Name", "01_Name", "1. Name"
  return name.replace(/^\d+[\s._-]+/, '').trim() || name;
}
```

### Step 6: Build GroupDef Objects

```typescript
export function buildGroups(
  nodes: NodeDef[],
  folders: Map<string, string[]>,
  topFolders: string[],
  options: ScannerOptions
): GroupDef[] {
  if (!options.showFolderGroups) return [];

  const folderNodes = mapNodesToFolders(nodes, folders);
  const qualifiedGroups = selectGroupFolders(folderNodes, topFolders);
  rollUpSubfolderNodes(folderNodes, topFolders, qualifiedGroups);

  // Need category defs for color lookup — import from categorizer or use node.cat directly
  const groups: GroupDef[] = [];

  for (const [folderPath, groupNodes] of qualifiedGroups) {
    if (groupNodes.length === 0) continue;

    const bounds = calculateGroupBounds(groupNodes);
    const color = majorityColor(groupNodes, {}); // Color resolved from node categories

    groups.push({
      label: cleanFolderLabel(folderPath),
      color,
      x: bounds.x,
      y: bounds.y,
      w: bounds.w,
      h: bounds.h,
    });
  }

  return groups;
}
```

### Integration with Layout

The group builder's output feeds into the renderer's layout algorithm:

1. Scanner: `buildGroups()` → `GroupDef[]` with `x=0, y=0, w=0, h=0` and correct labels/colors
2. Scanner: `scan()` returns `BlueprintData` with these groups
3. Renderer: `layout.ts` positions nodes, then recalculates group bounds from node positions + 40px padding
4. Renderer: renders groups as dashed bounding boxes

The scanner must tag each node with its group membership. This can be done via a `group` field on `NodeDef` (if the renderer supports it) or by the layout algorithm using the node's `path` to determine folder membership.

**Implementation decision**: Add a `_groupFolder` transient property to nodes during scanning (prefixed with `_` to indicate it's internal). The layout algorithm reads this to assign nodes to groups, then strips it.

### Edge Cases

- **Empty groups**: Folders that exist but have no included nodes are skipped.
- **Root-level files**: Files with no parent folder don't belong to any group.
- **Deeply nested folders**: `A/B/C/file.md` — file is in group `A` (top-level). If `A/B/C` has 3+ nodes, it also gets its own subgroup.
- **Overlapping groups**: A node can appear in both a top-level group and a subfolder group if the subfolder qualifies. The renderer handles overlapping group boxes visually.
- **`showFolderGroups: false`**: Returns empty array — no groups generated.

## Acceptance Criteria

1. Top-level folders always become groups (regardless of node count).
2. Subfolders become groups only if they contain 3+ included nodes.
3. Nodes in non-qualifying subfolders are rolled up into their top-level parent group.
4. Group labels are cleaned: `"1 Worldview"` → `"Worldview"`, `"03_Templates"` → `"Templates"`.
5. Group color matches the majority category of contained nodes.
6. Group x/y/w/h are set to placeholder values (0) — layout algorithm handles positioning.
7. `showFolderGroups: false` returns an empty array.
8. Empty folders (no included nodes) don't produce groups.
9. Root-level files are not assigned to any group.
10. Group building is deterministic — same input produces same groups.
