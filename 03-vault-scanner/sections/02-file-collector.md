# 02 — File Collector

## Summary

First stage of the scanner pipeline. Collects all eligible files from the vault using Obsidian's `app.vault` API, filters out excluded paths and non-content files, and builds `FileInfo` intermediate representations enriched with folder hierarchy data.

## Files to Create

| File | Purpose |
|------|---------|
| `src/scanner/file-collector.ts` | `collectFiles()` function — vault traversal and filtering |

## Implementation Details

### Function Signature

```typescript
import { App, TFile, TFolder, TAbstractFile } from 'obsidian';
import { FileInfo, ScannerOptions } from './types';

export interface CollectorResult {
  files: FileInfo[];                   // All eligible files with enriched metadata
  folders: Map<string, string[]>;      // folderPath → array of file paths it contains
  topFolders: string[];                // Unique top-level folder names
}

export function collectFiles(app: App, options: ScannerOptions): CollectorResult;
```

### Step 1: Gather Raw Files

Two API calls to get the full picture:

```typescript
// All markdown files
const mdFiles: TFile[] = app.vault.getMarkdownFiles();

// All loaded files (includes .canvas, folders, attachments)
const allFiles: TAbstractFile[] = app.vault.getAllLoadedFiles();

// Extract canvas files from allFiles
const canvasFiles = allFiles.filter(
  (f): f is TFile => f instanceof TFile && f.extension === 'canvas'
);

// Extract folders from allFiles
const folders = allFiles.filter(
  (f): f is TFolder => f instanceof TFolder
);
```

### Step 2: Filter Out Excluded Files

Apply exclusion rules in order. A file is excluded if ANY rule matches:

1. **Hidden folders**: Path starts with `.obsidian/` or any `.`-prefixed folder segment.
2. **User excludePaths**: Path matches any pattern in `options.excludePaths`. Match logic:
   - Exact path match: `"Templates/"` excludes everything under Templates
   - Prefix match: check if `file.path.startsWith(pattern)` or `file.path.startsWith(pattern + '/')`
   - Simple glob: if pattern contains `*`, convert to regex (replace `*` with `.*`)
3. **Non-content files**: Extension is not `md` or `canvas` (filters out images, PDFs, audio, etc.).
4. **Empty files**: `file.stat.size === 0`.

```typescript
function isExcluded(file: TFile, excludePaths: string[]): boolean {
  const path = file.path;

  // Hidden folders
  if (path.startsWith('.') || path.includes('/.')) return true;

  // User exclude patterns
  for (const pattern of excludePaths) {
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*'));
      if (regex.test(path)) return true;
    } else {
      if (path === pattern || path.startsWith(pattern.endsWith('/') ? pattern : pattern + '/')) {
        return true;
      }
    }
  }

  // Non-content extensions (already filtered by source, but defensive)
  if (file.extension !== 'md' && file.extension !== 'canvas') return true;

  // Empty files
  if (file.stat.size === 0) return true;

  return false;
}
```

### Step 3: Build FileInfo Objects

For each non-excluded file, construct a `FileInfo`:

```typescript
function buildFileInfo(file: TFile, app: App): FileInfo {
  const cache = app.metadataCache.getFileCache(file);
  const pathSegments = file.path.split('/');
  const isRoot = pathSegments.length === 1;  // File at vault root

  return {
    path: file.path,
    name: file.basename,
    extension: file.extension,
    size: file.stat.size,
    folder: file.parent?.path ?? '',
    topFolder: isRoot ? '' : pathSegments[0],
    isRoot,
    tags: extractTags(cache),
    frontmatter: cache?.frontmatter ?? null,
    outgoingLinks: extractOutgoingLinks(cache, app, file),
    incomingLinkCount: 0,  // Populated later by wire-builder
  };
}
```

### Step 4: Extract Tags

Combine frontmatter tags and inline tags:

```typescript
function extractTags(cache: CachedMetadata | null): string[] {
  if (!cache) return [];
  const tags: string[] = [];

  // Inline tags (e.g., #concept in body text)
  if (cache.tags) {
    for (const t of cache.tags) {
      tags.push(t.tag);  // Already includes the #
    }
  }

  // Frontmatter tags array
  if (cache.frontmatter?.tags) {
    const fmTags = cache.frontmatter.tags;
    if (Array.isArray(fmTags)) {
      for (const t of fmTags) {
        const normalized = t.startsWith('#') ? t : '#' + t;
        tags.push(normalized);
      }
    }
  }

  return [...new Set(tags)];  // Deduplicate
}
```

### Step 5: Extract Outgoing Links (paths)

Use the metadata cache to get resolved link target paths:

```typescript
function extractOutgoingLinks(cache: CachedMetadata | null, app: App, file: TFile): string[] {
  if (!cache) return [];
  const paths: string[] = [];

  // Regular wikilinks in body
  if (cache.links) {
    for (const link of cache.links) {
      const resolved = app.metadataCache.getFirstLinkpathDest(link.link, file.path);
      if (resolved) paths.push(resolved.path);
    }
  }

  // Frontmatter links (YAML references)
  if (cache.frontmatterLinks) {
    for (const link of cache.frontmatterLinks) {
      const resolved = app.metadataCache.getFirstLinkpathDest(link.link, file.path);
      if (resolved) paths.push(resolved.path);
    }
  }

  return [...new Set(paths)];  // Deduplicate
}
```

### Step 6: Build Folder Map

Collect folder hierarchy for group building:

```typescript
const folderMap = new Map<string, string[]>();
for (const fi of files) {
  const folder = fi.folder || '(root)';
  if (!folderMap.has(folder)) folderMap.set(folder, []);
  folderMap.get(folder)!.push(fi.path);
}

const topFolders = [...new Set(files.map(fi => fi.topFolder).filter(Boolean))];
```

### Performance Notes

- `getMarkdownFiles()` and `getAllLoadedFiles()` are O(n) — single pass, returns arrays.
- `getFileCache()` is O(1) — Obsidian has already parsed and cached metadata.
- `getFirstLinkpathDest()` is O(1) — uses Obsidian's internal resolved links map.
- Total: O(n * avg_links_per_file) — dominated by link resolution.
- For a 1000-note vault with avg 5 links each: ~5000 link resolutions, each O(1). Well under 500ms.

## Acceptance Criteria

1. `collectFiles()` returns all `.md` and `.canvas` files from the vault.
2. Files inside `.obsidian/` are excluded.
3. Files matching any `excludePaths` pattern are excluded.
4. Files with `stat.size === 0` are excluded.
5. Non-markdown, non-canvas files (images, PDFs, etc.) are excluded.
6. Each `FileInfo` has correct `folder`, `topFolder`, and `isRoot` values.
7. Tags are collected from both inline and frontmatter sources, deduplicated, normalized with `#` prefix.
8. Outgoing links are resolved to actual file paths (not raw link text) via `getFirstLinkpathDest()`.
9. `folderMap` correctly maps each folder path to its contained file paths.
10. `topFolders` contains unique first-level folder names only.
