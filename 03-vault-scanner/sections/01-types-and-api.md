# 01 — Types and Public API

## Summary

Define all scanner-specific TypeScript types (intermediate representations used during scanning) and the public `VaultScanner` class API shape. This module bridges Obsidian's native types (`App`, `TFile`, `TFolder`, `CachedMetadata`) with the renderer's `BlueprintData` output format.

## Files to Create

| File | Purpose |
|------|---------|
| `src/scanner/types.ts` | Scanner options, intermediate types, category definitions |

## Implementation Details

### ScannerOptions

```typescript
import { App } from 'obsidian';

export interface ScannerOptions {
  app: App;
  excludePaths: string[];                        // Glob-like patterns to exclude
  minBacklinks: number;                          // Default: 3
  categoryOverrides: Record<string, string>;     // Path pattern → category ID
  showFolderGroups: boolean;                     // Default: true
}
```

### Intermediate Representations

These types are internal to the scanner pipeline — they carry enriched data through the stages before being flattened to `BlueprintData`.

```typescript
/** Enriched file info collected in the first pass */
export interface FileInfo {
  path: string;                    // Full vault-relative path (e.g., "Claude Knowledge Base/Session Log.md")
  name: string;                    // Basename without extension
  extension: string;               // "md" or "canvas"
  size: number;                    // file.stat.size
  folder: string;                  // Parent folder path (e.g., "Claude Knowledge Base")
  topFolder: string;               // First path segment (e.g., "Claude Knowledge Base")
  isRoot: boolean;                 // true if file is at vault root (no parent folder)
  tags: string[];                  // Tags from frontmatter + inline (e.g., ["#concept", "#draft"])
  frontmatter: Record<string, unknown> | null;  // Parsed YAML frontmatter
  outgoingLinks: string[];         // Resolved target paths from wikilinks
  incomingLinkCount: number;       // Populated during wire-building phase
}

/** A resolved link between two files */
export interface LinkInfo {
  sourcePath: string;              // File containing the [[wikilink]]
  targetPath: string;              // File being linked to
  isFromFrontmatter: boolean;      // true if link was in YAML frontmatter
}

/** Category definition with detection metadata */
export interface CategoryRule {
  id: string;
  label: string;
  color: string;
  dark: string;
  folderPatterns: string[];        // Folder name patterns (lowercase match)
  filePatterns: string[];          // File name patterns (glob-like)
  tags: string[];                  // Tags that trigger this category
}

/** Result of node selection — why a file was included */
export type InclusionReason =
  | 'moc'           // 10+ outgoing links
  | 'config'        // Config file pattern match
  | 'command'       // In commands/ folder
  | 'template'      // In templates/ folder
  | 'canvas'        // .canvas file
  | 'todo-inbox'    // TODO/Inbox/Cortex pattern
  | 'well-connected' // >= minBacklinks incoming
  | 'hub'           // 5+ out AND 3+ in
  ;
```

### Default Category Definitions

```typescript
export const DEFAULT_CATEGORIES: CategoryRule[] = [
  { id: 'config',  label: 'Config',          color: '#6366f1', dark: '#4338ca', folderPatterns: [],                                          filePatterns: ['CLAUDE.md', 'MEMORY.md', '*.config.*'], tags: [] },
  { id: 'cmd',     label: 'Commands',        color: '#22d3ee', dark: '#0891b2', folderPatterns: ['commands'],                                filePatterns: [],                                       tags: [] },
  { id: 'kb',      label: 'Knowledge Base',  color: '#a78bfa', dark: '#7c3aed', folderPatterns: ['knowledge base', 'kb', 'knowledge-base'], filePatterns: [],                                       tags: [] },
  { id: 'vault',   label: 'Vault Structure', color: '#34d399', dark: '#059669', folderPatterns: [],                                          filePatterns: ['*MOC*', '*TODO*', '*Inbox*', '*Cortex*'], tags: [] },
  { id: 'content', label: 'Content',         color: '#f59e0b', dark: '#d97706', folderPatterns: ['articles', 'content', 'drafts', 'posts'], filePatterns: [],                                       tags: [] },
  { id: 'concept', label: 'Concepts',        color: '#fbbf24', dark: '#f59e0b', folderPatterns: ['concepts'],                               filePatterns: [],                                       tags: ['#concept'] },
  { id: 'auto',    label: 'Automation',      color: '#fb923c', dark: '#ea580c', folderPatterns: [],                                          filePatterns: ['*.sh', '*.py'],                         tags: [] },
  { id: 'rules',   label: 'Rules',           color: '#f43f5e', dark: '#e11d48', folderPatterns: ['rules'],                                  filePatterns: [],                                       tags: [] },
  { id: 'people',  label: 'People',          color: '#ec4899', dark: '#db2777', folderPatterns: ['people'],                                 filePatterns: [],                                       tags: ['#person', '#thinker'] },
  { id: 'default', label: 'Other',           color: '#8899aa', dark: '#64748b', folderPatterns: [],                                          filePatterns: [],                                       tags: [] },
];
```

### VaultScanner Class Shape (public API only — implementation in section 07)

```typescript
import { BlueprintData } from '../renderer/types';

export class VaultScanner {
  constructor(options: ScannerOptions);

  /** Full vault scan — returns BlueprintData ready for the renderer */
  async scan(): Promise<BlueprintData>;

  /** Incremental rescan for changed files — returns full updated BlueprintData */
  async rescan(changedPaths: string[]): Promise<BlueprintData>;
}
```

### Obsidian Type Interfaces

The scanner imports these from the `obsidian` package (they are runtime-provided):

- `App` — top-level application instance
- `TFile` — represents a file in the vault (has `path`, `name`, `extension`, `stat`, `parent`)
- `TFolder` — represents a folder (has `path`, `name`, `children`, `parent`)
- `TAbstractFile` — base class of TFile and TFolder
- `CachedMetadata` — metadata cache entry (has `links`, `frontmatterLinks`, `tags`, `frontmatter`)
- `LinkCache` — individual link entry (has `link`, `original`, `displayText`)
- `TagCache` — individual tag entry (has `tag`)
- `FrontMatterCache` — frontmatter as key-value pairs

No type stubs or shims needed — `obsidian` is a devDependency that provides all types.

## Acceptance Criteria

1. `types.ts` compiles with `strict: true` and zero errors.
2. All intermediate types (`FileInfo`, `LinkInfo`, `CategoryRule`, `InclusionReason`) are exported.
3. `ScannerOptions` references Obsidian's `App` type correctly.
4. `DEFAULT_CATEGORIES` array contains all 10 categories with correct IDs, colors, and detection patterns.
5. `VaultScanner` class signature returns `BlueprintData` from the renderer types module — no circular dependencies.
6. No runtime dependencies — all Obsidian types are import-only (erased at compile time).
