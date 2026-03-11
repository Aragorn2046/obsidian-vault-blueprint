# 01 — Cache Layer

## Summary

Implement a caching layer using Obsidian's `saveData`/`loadData` API so that reopening the blueprint view loads instantly from disk instead of re-scanning the vault. Cache is stored in `.obsidian/plugins/vault-blueprint/data.json` alongside the plugin's settings data.

## Files to Modify/Create

| File | Action | Purpose |
|------|--------|---------|
| `src/cache.ts` | **Create** | Cache manager: load, save, validate, invalidate |
| `src/view.ts` | **Modify** | Add `loadOrScan()` method, wire cache into lifecycle |
| `src/types.ts` | **Modify** | Add `CachedData` interface |

## Implementation Details

### types.ts — Add Cache Interface

```typescript
export interface CachedData {
  blueprint: BlueprintData;
  scannedAt: number;           // Date.now() at scan time
  settingsHash: string;        // Hash of scan-affecting settings for invalidation
}
```

The `settingsHash` is a simple JSON hash of `{ excludePaths, minBacklinks, categoryOverrides, showFolderGroups }`. If settings change between sessions, the cache is stale even without file changes.

### cache.ts — Cache Manager

```typescript
import { Plugin } from 'obsidian';
import { BlueprintData, CachedData, VaultBlueprintSettings } from './types';

export class BlueprintCache {
  constructor(private plugin: Plugin) {}

  async load(): Promise<CachedData | null> {
    const raw = await this.plugin.loadData();
    if (!raw?.blueprint || !raw?.scannedAt) return null;
    return raw as CachedData;
  }

  async save(data: BlueprintData, settings: VaultBlueprintSettings): Promise<void> {
    const cached: CachedData = {
      blueprint: data,
      scannedAt: Date.now(),
      settingsHash: this.hashSettings(settings),
    };
    await this.plugin.saveData(cached);
  }

  isFresh(cached: CachedData, currentSettings: VaultBlueprintSettings): boolean {
    return cached.settingsHash === this.hashSettings(currentSettings);
  }

  private hashSettings(settings: VaultBlueprintSettings): string {
    const relevant = {
      excludePaths: settings.excludePaths,
      minBacklinks: settings.minBacklinks,
      categoryOverrides: settings.categoryOverrides,
      showFolderGroups: settings.showFolderGroups,
    };
    return JSON.stringify(relevant);
  }
}
```

**Key design decisions:**

1. **Settings hash over timestamp**: Comparing a settings hash catches changes even if the user modifies settings in `data.json` directly. Simple `JSON.stringify` is sufficient since the settings object is small and order-stable.

2. **No TTL expiry**: Cache never expires on its own. It's invalidated by vault events (create/delete/rename), settings changes, or manual refresh. This avoids unnecessary re-scans when reopening Obsidian after days — the vault hasn't changed, so the cache is still valid.

3. **Coexistence with settings**: Obsidian's `saveData` writes the entire `data.json`. Since plugin settings are loaded via `loadData` too, the cache fields (`blueprint`, `scannedAt`, `settingsHash`) live alongside settings fields in the same JSON file. The settings tab must be careful not to overwrite cache data when saving — use `Object.assign` pattern:

```typescript
// In main.ts saveSettings():
async saveSettings() {
  const existing = await this.loadData() || {};
  await this.saveData({ ...existing, ...this.settings });
}
```

This preserves cache fields when settings are saved, and vice versa.

### view.ts — loadOrScan() Method

```typescript
private async loadOrScan(): Promise<BlueprintData> {
  const cache = new BlueprintCache(this.plugin);
  const cached = await cache.load();

  if (cached && cache.isFresh(cached, this.plugin.settings)) {
    this.lastScanTime = cached.scannedAt;
    return cached.blueprint;
  }

  // Cache miss or stale — fresh scan
  const scanner = new VaultScanner({
    app: this.app,
    excludePaths: this.plugin.settings.excludePaths,
    minBacklinks: this.plugin.settings.minBacklinks,
    categoryOverrides: this.plugin.settings.categoryOverrides,
    showFolderGroups: this.plugin.settings.showFolderGroups,
  });

  const data = await scanner.scan();
  await cache.save(data, this.plugin.settings);
  this.lastScanTime = Date.now();
  return data;
}
```

### cacheData() Helper

Used by `scheduleRescan()` and other re-scan paths:

```typescript
private async cacheData(data: BlueprintData): Promise<void> {
  const cache = new BlueprintCache(this.plugin);
  await cache.save(data, this.plugin.settings);
  this.lastScanTime = Date.now();
}
```

### data.json Structure

After a scan, `.obsidian/plugins/vault-blueprint/data.json` looks like:

```json
{
  "excludePaths": [".obsidian", "node_modules"],
  "minBacklinks": 3,
  "showFolderGroups": true,
  "categoryOverrides": {},
  "blueprint": {
    "meta": { "title": "Vault Blueprint", "subtitle": "42 nodes..." },
    "categories": { ... },
    "groups": [ ... ],
    "nodes": [ ... ],
    "wires": [ ... ]
  },
  "scannedAt": 1741512345678,
  "settingsHash": "{\"excludePaths\":[\".obsidian\",...}"
}
```

## Acceptance Criteria

- [ ] First open triggers a fresh scan and caches result to `data.json`
- [ ] Second open loads from cache without scanning (verifiable via console timing or absence of scan log)
- [ ] Changing a scan-affecting setting (e.g., `excludePaths`) invalidates cache on next open
- [ ] Cache load completes in < 200ms for a 300-node blueprint (~500KB JSON)
- [ ] `saveData` does not overwrite plugin settings; `saveSettings` does not overwrite cache data
- [ ] Cache gracefully handles corrupted/missing `data.json` (falls back to fresh scan)
- [ ] `lastScanTime` is correctly set from cache or from fresh scan
