# 05 — Categorizer

## Summary

Fourth stage of the scanner pipeline. Assigns a category to each node based on a priority-ordered rule cascade: user overrides, frontmatter `type` field, tag detection, folder pattern matching, and finally the default category. Also builds the `categories` record for `BlueprintData`.

## Files to Create

| File | Purpose |
|------|---------|
| `src/scanner/categorizer.ts` | `categorizeNodes()` function and `buildCategoryDefs()` helper |

## Implementation Details

### Function Signature

```typescript
import { NodeDef, CategoryDef } from '../renderer/types';
import { FileInfo, ScannerOptions, CategoryRule, DEFAULT_CATEGORIES } from './types';

export interface CategorizationResult {
  categories: Record<string, CategoryDef>;   // Category ID → definition (for BlueprintData)
}

/**
 * Mutates nodes in place — sets each node's `cat` field.
 * Returns the category definitions for BlueprintData.
 */
export function categorizeNodes(
  nodes: NodeDef[],
  files: FileInfo[],
  options: ScannerOptions
): CategorizationResult;
```

### The 10 Categories

| ID | Label | Color | Dark Variant | Detection |
|----|-------|-------|-------------|-----------|
| `config` | Config | `#6366f1` | `#4338ca` | Root files, CLAUDE.md, MEMORY.md, *.config.*, .json |
| `cmd` | Commands | `#22d3ee` | `#0891b2` | Files in `commands/` folders |
| `kb` | Knowledge Base | `#a78bfa` | `#7c3aed` | Files in `Knowledge Base/`, `KB/`, `knowledge-base/` |
| `vault` | Vault Structure | `#34d399` | `#059669` | MOCs, TODOs, Inbox, Cortex, structural notes |
| `content` | Content | `#f59e0b` | `#d97706` | Files in `Articles/`, `Content/`, `Drafts/`, `Posts/` |
| `concept` | Concepts | `#fbbf24` | `#f59e0b` | Files in `Concepts/`, tagged `#concept` |
| `auto` | Automation | `#fb923c` | `#ea580c` | Scripts, `.sh`, `.py`, hook configs, cron |
| `rules` | Rules | `#f43f5e` | `#e11d48` | Files in `rules/` folders |
| `people` | People | `#ec4899` | `#db2777` | Tagged `#person`, `#thinker`, in `People/` folder |
| `default` | Other | `#8899aa` | `#64748b` | Fallback — anything unmatched |

### Override Order (highest priority first)

The categorizer applies rules in strict priority order. The first match wins.

#### Priority 1: User `categoryOverrides`

```typescript
function matchOverride(
  filePath: string,
  overrides: Record<string, string>
): string | null {
  for (const [pattern, categoryId] of Object.entries(overrides)) {
    if (pattern.includes('*')) {
      // Glob-style: convert to regex
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      if (regex.test(filePath)) return categoryId;
    } else {
      // Exact or prefix match
      if (filePath === pattern ||
          filePath.startsWith(pattern.endsWith('/') ? pattern : pattern + '/')) {
        return categoryId;
      }
    }
  }
  return null;
}
```

#### Priority 2: Frontmatter `type` Field

```typescript
function matchFrontmatterType(
  frontmatter: Record<string, unknown> | null,
  validCategories: Set<string>
): string | null {
  if (!frontmatter?.type) return null;
  const type = String(frontmatter.type).toLowerCase();
  // Only match if the type value is a valid category ID
  if (validCategories.has(type)) return type;
  return null;
}
```

#### Priority 3: Tag-Based Detection

```typescript
function matchTags(tags: string[], categories: CategoryRule[]): string | null {
  for (const cat of categories) {
    if (cat.tags.length === 0) continue;
    for (const tag of tags) {
      if (cat.tags.includes(tag.toLowerCase())) return cat.id;
    }
  }
  return null;
}
```

#### Priority 4: Folder Pattern Matching

```typescript
function matchFolder(filePath: string, categories: CategoryRule[]): string | null {
  const pathLower = filePath.toLowerCase();
  const segments = pathLower.split('/');

  for (const cat of categories) {
    for (const pattern of cat.folderPatterns) {
      // Check if any path segment matches the folder pattern
      if (segments.some(seg => seg === pattern)) return cat.id;
    }
  }

  // Additional folder-independent rules
  // Config: root-level files
  if (segments.length === 1) return 'config';

  return null;
}
```

#### Priority 4b: File Pattern Matching

```typescript
function matchFilePattern(fileName: string, categories: CategoryRule[]): string | null {
  const nameLower = fileName.toLowerCase();

  for (const cat of categories) {
    for (const pattern of cat.filePatterns) {
      const patternLower = pattern.toLowerCase();
      if (patternLower.includes('*')) {
        const regex = new RegExp('^' + patternLower.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
        if (regex.test(nameLower) || regex.test(nameLower + '.md')) return cat.id;
      } else {
        if (nameLower === patternLower.replace(/\.md$/, '') ||
            nameLower + '.md' === patternLower) return cat.id;
      }
    }
  }
  return null;
}
```

#### Priority 5: Default

If no rule matched, return `'default'`.

### Main Categorization Function

```typescript
export function categorizeNodes(
  nodes: NodeDef[],
  files: FileInfo[],
  options: ScannerOptions
): CategorizationResult {
  const fileMap = new Map(files.map(f => [f.path, f]));
  const validCategories = new Set(DEFAULT_CATEGORIES.map(c => c.id));

  for (const node of nodes) {
    const file = fileMap.get(node.path ?? '');
    if (!file) {
      node.cat = 'default';
      continue;
    }

    // Apply override cascade
    const category =
      matchOverride(file.path, options.categoryOverrides) ??
      matchFrontmatterType(file.frontmatter, validCategories) ??
      matchTags(file.tags, DEFAULT_CATEGORIES) ??
      matchFolder(file.path, DEFAULT_CATEGORIES) ??
      matchFilePattern(file.name, DEFAULT_CATEGORIES) ??
      'default';

    node.cat = category;
  }

  return {
    categories: buildCategoryDefs(),
  };
}
```

### Build CategoryDef Record

Convert the internal `CategoryRule[]` to the renderer's `Record<string, CategoryDef>`:

```typescript
function buildCategoryDefs(): Record<string, CategoryDef> {
  const result: Record<string, CategoryDef> = {};
  for (const cat of DEFAULT_CATEGORIES) {
    result[cat.id] = {
      color: cat.color,
      dark: cat.dark,
      label: cat.label,
      visible: true,
    };
  }
  return result;
}
```

### Edge Cases

- **Frontmatter `type` with unknown value**: Ignored — only matches if the value is a valid category ID. For example, `type: recipe` would not match any category and would fall through to folder/tag detection.
- **Multiple matching tags**: First matching category wins (categories are checked in `DEFAULT_CATEGORIES` order, which puts more specific categories first).
- **File in nested folder**: All path segments are checked against folder patterns. A file at `My Vault/Claude Knowledge Base/Session Log.md` matches `knowledge base` because one segment matches.
- **Root files**: Always get `config` category via the folder matcher (path has only 1 segment).

## Acceptance Criteria

1. `categoryOverrides` take highest priority — a file matching an override pattern gets that category regardless of other signals.
2. Frontmatter `type` field is checked second — `type: cmd` in frontmatter makes a file a command node.
3. Tags are checked third — a file tagged `#concept` gets the `concept` category.
4. Folder patterns are checked fourth — a file in `commands/` gets `cmd`.
5. File name patterns are checked as part of folder/file matching — `*TODO*` matches TODO files.
6. Unmatched files get `default` category.
7. All 10 categories are present in the output `categories` record with correct colors and labels.
8. Category assignment is deterministic — same input always produces same output.
9. Nodes are mutated in place (their `cat` field is updated).
10. Case-insensitive matching for all pattern types (folder names, file names, tags, frontmatter type).
