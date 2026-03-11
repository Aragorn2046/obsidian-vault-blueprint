# 05 — Types

## Summary

Create `src/types.ts` with all shared TypeScript interfaces and constants for the plugin. This is the single source of truth for type definitions used across main, view, settings, and future splits (scanner, renderer, integration). Defines the view type constant, settings interface, and the full `BlueprintData` model that represents the scanned vault graph.

## Files to Create

| File | Purpose |
|------|---------|
| `src/types.ts` | All shared constants, interfaces, and type definitions |

## Implementation Details

### src/types.ts

```typescript
// ─── View Type ───────────────────────────────────────────────

/** Unique identifier for the BlueprintView. Used in registerView and setViewState. */
export const VIEW_TYPE_BLUEPRINT = "vault-blueprint-view";

// ─── Settings ────────────────────────────────────────────────

export interface VaultBlueprintSettings {
  /** Folder paths to exclude from vault scanning */
  excludePaths: string[];
  /** Minimum number of incoming backlinks for a note to appear as a node */
  minBacklinks: number;
  /** Whether to render top-level folders as visual group boxes */
  showFolderGroups: boolean;
  /** Manual path-pattern → category mappings (overrides auto-detection) */
  categoryOverrides: Record<string, string>;
}

// ─── Blueprint Data Model ────────────────────────────────────

/**
 * Complete blueprint graph data — output of the scanner, input to the renderer.
 * Immutable snapshot: scanner produces a new BlueprintData on each scan.
 */
export interface BlueprintData {
  /** All nodes (notes that passed filtering) */
  nodes: NodeDef[];
  /** All wires (connections between nodes) */
  wires: WireDef[];
  /** Folder-based visual groups */
  groups: GroupDef[];
  /** Category definitions (auto-detected + overrides) */
  categories: CategoryDef[];
}

/**
 * A single node in the blueprint — represents one vault note.
 */
export interface NodeDef {
  /** Unique identifier — the vault file path (e.g., "1 Worldview/AI Safety.md") */
  id: string;
  /** Display label — the note's basename without extension */
  label: string;
  /** Category this node belongs to (determines color/shape) */
  category: string;
  /** Number of incoming backlinks (determines node size/prominence) */
  backlinks: number;
  /** Node position — x coordinate in logical pixels (set by layout engine) */
  x: number;
  /** Node position — y coordinate in logical pixels (set by layout engine) */
  y: number;
  /** Pins attached to this node (connection points for wires) */
  pins: PinDef[];
  /** The folder path containing this note (for group assignment) */
  folder: string;
  /** Optional: tags from frontmatter */
  tags?: string[];
}

/**
 * A wire connecting two nodes — represents a backlink relationship.
 */
export interface WireDef {
  /** ID of the source node (the note containing the link) */
  source: string;
  /** ID of the target node (the note being linked to) */
  target: string;
  /** Pin ID on the source node */
  sourcePin: string;
  /** Pin ID on the target node */
  targetPin: string;
  /** Wire style hint — "backlink" for standard, future: "tag", "folder" */
  type: string;
}

/**
 * A visual group box — represents a folder in the vault.
 */
export interface GroupDef {
  /** Unique identifier — the folder path */
  id: string;
  /** Display label — the folder name */
  label: string;
  /** Bounding box — x coordinate (set by layout engine) */
  x: number;
  /** Bounding box — y coordinate (set by layout engine) */
  y: number;
  /** Bounding box — width (set by layout engine) */
  width: number;
  /** Bounding box — height (set by layout engine) */
  height: number;
  /** IDs of nodes contained in this group */
  nodeIds: string[];
}

/**
 * A category — determines visual style (color, shape) for a set of nodes.
 */
export interface CategoryDef {
  /** Unique category name (e.g., "Concepts", "Business", "Projects") */
  id: string;
  /** Display label */
  label: string;
  /** Color for nodes in this category (CSS color string) */
  color: string;
  /** Optional: icon name (Lucide icon ID) */
  icon?: string;
}

/**
 * A pin (connection point) on a node — where wires attach.
 * Blueprint-style: pins are on the edges of the node box.
 */
export interface PinDef {
  /** Unique pin ID (scoped to the parent node) */
  id: string;
  /** Pin direction — which edge of the node box */
  side: "top" | "bottom" | "left" | "right";
  /** Pin role — "in" for incoming wires, "out" for outgoing */
  direction: "in" | "out";
  /** Position along the edge (0.0 = start, 1.0 = end) */
  offset: number;
}
```

### Design Decisions

1. **`VIEW_TYPE_BLUEPRINT` as a constant** — Used by `registerView()`, `setViewState()`, and `getLeavesOfType()`. Must be identical everywhere. A single constant prevents typo bugs.

2. **`VaultBlueprintSettings` is flat** — No nested objects. Obsidian's `loadData()` / `saveData()` serializes to JSON. Flat structure makes `Object.assign()` merging reliable for forward compatibility (adding new fields to defaults works; nested objects would need deep merge).

3. **`BlueprintData` is an immutable snapshot** — The scanner produces a fresh `BlueprintData` on each scan; the renderer reads it. No shared mutable state between scanner and renderer. This keeps the architecture clean and makes future features (diffing, animation) straightforward.

4. **`NodeDef.id` is the file path** — Guarantees uniqueness within the vault. Used as lookup key in maps. The renderer uses `label` for display.

5. **`NodeDef.x` / `y` are set by the layout engine** — Initial values are 0. The layout algorithm (future split) assigns positions. This keeps the scanner decoupled from layout.

6. **`PinDef` with `side` and `offset`** — Blueprint-style pin placement. Pins sit on node edges, not at arbitrary positions. The `offset` (0 to 1) distributes multiple pins along one edge. `direction` determines whether wires flow in or out.

7. **`WireDef.type` is a string, not an enum** — Keeps the type system flexible for future wire types ("backlink", "tag-link", "folder-link") without requiring schema changes.

8. **`CategoryDef.color` is a CSS string** — Can be a hex color (`#4a90d9`), an HSL value, or an Obsidian CSS variable reference. The renderer decides how to use it.

9. **All position/size fields are logical pixels** — The view's `resizeCanvas()` handles DPR scaling. All type contracts use logical coordinates.

10. **`tags` is optional on `NodeDef`** — Not all notes have frontmatter tags. Making it optional avoids empty arrays everywhere. The scanner sets it only when tags exist.

## Acceptance Criteria

1. `npx tsc --noEmit` passes — all interfaces are well-formed TypeScript.
2. `VIEW_TYPE_BLUEPRINT` is exported and importable from `./types` in all other source files.
3. `VaultBlueprintSettings` is used by `main.ts` (DEFAULT_SETTINGS) and `settings.ts` (type annotation).
4. `BlueprintData`, `NodeDef`, `WireDef`, `GroupDef`, `CategoryDef`, `PinDef` are all exported (available for future splits).
5. No circular imports — `types.ts` imports nothing from the project (only stdlib types).
6. All interfaces have JSDoc comments explaining their purpose and field semantics.

## Test Approach

- **Type check**: `npx tsc --noEmit` is the primary test. If it passes, the types are structurally valid.
- **Import test**: Verify each source file (`main.ts`, `view.ts`, `settings.ts`) can import from `./types` without errors.
- **No circular deps**: Run `npx madge --circular src/` (optional — or manually verify `types.ts` has no imports from the project).
- **Future-proofing**: Ensure a new split can import `BlueprintData` and friends without touching `types.ts` — the interfaces should be complete enough for scanner and renderer use.
- **Documentation**: Verify all exported interfaces have JSDoc comments (code review check).
