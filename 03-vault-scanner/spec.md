# 03-vault-scanner — Spec

## Summary

Build the vault analysis engine that scans an Obsidian vault via the plugin API and generates a Blueprint JSON object. The scanner detects important notes, maps wikilinks as process flows, auto-categorizes nodes, and creates groups from folders. It must work entirely through the Obsidian API (no direct filesystem access).

## Core Principle

The blueprint is a **process flow graph**, not a file map. The question it answers is: "If I trigger this, what happens next? Which parts of the vault are engaged?" Wikilinks are directional flows: a command file linking to `[[Session Log]]` means "this command writes to Session Log."

## Module Structure

```
src/scanner/
├── index.ts           # Public API: VaultScanner class
├── file-collector.ts  # Collect files and folders from vault
├── node-builder.ts    # Convert files → nodes with smart filtering
├── wire-builder.ts    # Convert wikilinks → directional wires
├── categorizer.ts     # Auto-assign categories from folder/tags/frontmatter
├── group-builder.ts   # Generate groups from folder structure
└── types.ts           # Scanner-specific types (intermediate representations)
```

## Public API

```typescript
interface ScannerOptions {
  app: App;                          // Obsidian App instance
  excludePaths: string[];            // Paths to exclude (e.g., [".obsidian"])
  minBacklinks: number;              // Min backlinks for a note to become a node (default: 3)
  categoryOverrides: Record<string, string>;  // Path pattern → category
  showFolderGroups: boolean;         // Generate group boxes for folders
}

class VaultScanner {
  constructor(options: ScannerOptions);

  // Main scan — returns blueprint data ready for the renderer
  async scan(): Promise<BlueprintData>;

  // Incremental update (for cache invalidation)
  async rescan(changedPaths: string[]): Promise<BlueprintData>;
}
```

## Smart Defaults — Node Selection

Not every file becomes a node. The scanner uses heuristics to identify "important" notes:

### Always Include (forced nodes)
1. **MOC files**: Notes with 10+ outgoing wikilinks (likely Maps of Content)
2. **Config files**: Files matching patterns: `CLAUDE.md`, `MEMORY.md`, `*.config.*`, files in root
3. **Command files**: Files inside any `commands/` folder
4. **Template files**: Files inside any `Templates/` or `templates/` folder
5. **Canvas files**: `.canvas` files
6. **TODO/Inbox files**: Files matching `*TODO*`, `*todo*`, `*Inbox*`, `*inbox*`, `*Cortex*`

### Include If Connected (backlink threshold)
7. **Well-connected notes**: Notes with `>= minBacklinks` incoming wikilinks from other notes
8. **Hub notes**: Notes that both link out (5+) AND receive links (3+)

### Always Exclude
- Files inside `.obsidian/`
- Files matching `excludePaths` setting
- Attachment files (images, PDFs, etc. — non-`.md` and non-`.canvas`)
- Empty files (0 bytes)

### Folder Nodes
- Top-level folders (depth 1) always become group boxes
- Subfolders become group boxes only if they contain 3+ nodes

## Wire Building — Wikilinks as Flows

For each included node, extract its outgoing wikilinks from `app.metadataCache`:

```typescript
const cache = app.metadataCache.getFileCache(file);
const links = cache?.links || [];       // [[wikilinks]]
const frontmatterLinks = cache?.frontmatterLinks || [];  // YAML references
```

### Wire Direction
- **From**: The file containing the wikilink
- **To**: The file being linked to
- Both endpoints must be included nodes (skip wires to excluded files)

### Wire Semantics
Wires represent "engages" / "reads/writes" / "triggers":
- A command file linking to `[[Session Log]]` = "this command writes to Session Log"
- A MOC linking to `[[Article]]` = "this MOC indexes this article"
- A config file linking to `[[Profile]]` = "this config reads this profile"

### Pin Generation
For nodes with wires:
- **Out pins**: One pin per unique outgoing wire, labeled with the target's title
- **In pins**: One pin per unique incoming wire, labeled with the source's title
- Pin IDs: `{nodeId}-out-{targetId}` and `{nodeId}-in-{sourceId}`

Simplification for Phase 1: if a node has more than 6 in or out connections, collapse into a single "multiple" pin to avoid visual clutter.

## Auto-Categorization

Default categories (same as existing blueprint):

| Category ID | Label | Color | Detection Rule |
|-------------|-------|-------|----------------|
| `config` | Config | `#6366f1` | Root files, `CLAUDE.md`, `MEMORY.md`, settings, `.json` config |
| `cmd` | Commands | `#22d3ee` | Files in `commands/` folders |
| `kb` | Knowledge Base | `#a78bfa` | Files in `Knowledge Base/`, `KB/`, `knowledge-base/` folders |
| `vault` | Vault Structure | `#34d399` | MOCs, TODOs, Inbox, Cortex, folder-level structural notes |
| `content` | Content | `#f59e0b` | Files in `Articles/`, `Content/`, `Drafts/`, `Posts/` |
| `concept` | Concepts | `#fbbf24` | Files in `Concepts/`, notes tagged `#concept` |
| `auto` | Automation | `#fb923c` | Scripts, cron files, `.sh`, `.py`, hook configs |
| `rules` | Rules | `#f43f5e` | Files in `rules/` folders |
| `people` | People | `#ec4899` | Notes tagged `#person`, `#thinker`, in `People/` folder |
| `default` | Other | `#8899aa` | Anything not matched by above rules |

### Override Order (highest priority first)
1. `categoryOverrides` setting (user-defined path patterns)
2. Frontmatter `type` field (if it matches a category ID)
3. Tag-based detection (`#concept`, `#person`, etc.)
4. Folder-based detection (path pattern matching)
5. Default category

## Group Building

Groups are visual bounding boxes around related nodes:

1. Collect all nodes per top-level folder
2. For each folder with 2+ nodes, create a group
3. Group position and size: calculated from the bounding box of contained nodes + 40px padding
4. Group color: matches the majority category of contained nodes
5. Group label: folder name (cleaned — remove leading numbers like `1 Worldview` → `Worldview`)

## Output Format

The scanner returns `BlueprintData` matching the renderer's expected schema:

```typescript
{
  meta: {
    title: "Vault Blueprint",           // Or vault name
    subtitle: `${nodeCount} nodes · ${wireCount} connections`
  },
  categories: { /* auto-generated */ },
  groups: [ /* auto-generated */ ],
  nodes: [ /* x=0, y=0 for all — layout handled by renderer */ ],
  wires: [ /* from/to with pin references */ ]
}
```

**Important**: Node x/y positions are all 0. The renderer's layout algorithm handles positioning. The scanner only determines WHAT is shown, not WHERE.

## Obsidian API Usage

| API | Purpose |
|-----|---------|
| `app.vault.getMarkdownFiles()` | List all .md files |
| `app.vault.getAllLoadedFiles()` | List all files including canvas, folders |
| `app.metadataCache.getFileCache(file)` | Get links, tags, frontmatter for a file |
| `app.metadataCache.getBacklinksForFile(file)` | Get incoming links (if available) |
| `app.vault.cachedRead(file)` | Read file content (fallback for link extraction) |
| `file.parent` | Get parent folder (TFolder) |
| `file.stat.size` | File size (for empty file detection) |

**No filesystem APIs** — everything through `app.vault` and `app.metadataCache`.

## Performance

For vaults with 1000+ notes:
- File collection: O(n) — single pass through `getMarkdownFiles()`
- Link extraction: O(n) — one `getFileCache()` per file (cached by Obsidian)
- Backlink counting: O(n*m) worst case — mitigate with Obsidian's resolved links cache
- Total scan time target: < 2 seconds for 1000 notes, < 500ms for 300 notes

Use `app.metadataCache.resolvedLinks` for pre-computed link graph when available.

## Acceptance Criteria

1. Scanner produces valid `BlueprintData` from any Obsidian vault
2. Smart defaults surface important notes without configuration
3. Wikilinks create directional wires (from → to)
4. Categories are auto-assigned correctly based on folder/tag/frontmatter
5. Groups generated from folder structure
6. Empty/hidden files are excluded
7. `excludePaths` setting works
8. `categoryOverrides` setting overrides auto-detection
9. Scan completes in < 2s for a 1000-note vault
10. Output matches the `BlueprintData` interface expected by the renderer
