# 04-integration — Spec

## Summary

Wire the vault scanner, canvas renderer, and plugin shell together into a working Obsidian plugin. Add caching, vault change event handling, file navigation, and settings reactivity. This is the final assembly split.

## Dependencies

- **01-plugin-shell**: BlueprintView, settings, plugin lifecycle
- **02-canvas-renderer**: BlueprintRenderer class and all rendering modules
- **03-vault-scanner**: VaultScanner class and analysis engine

## Integration Points

### 1. BlueprintView ← Scanner + Renderer

When the BlueprintView opens:

```typescript
async onOpen() {
  // 1. Create DOM structure
  this.container = contentEl.createDiv({ cls: 'blueprint-wrapper' });
  this.canvas = this.container.createEl('canvas');

  // 2. Load data (cache or fresh scan)
  const data = await this.loadOrScan();

  // 3. Initialize renderer
  this.renderer = new BlueprintRenderer({
    canvas: this.canvas,
    container: this.container,
    data: data,
    theme: this.detectTheme(),
    onNodeClick: (nodeId, filePath) => this.navigateToFile(filePath),
  });
  this.renderer.render();

  // 4. Register event listeners
  this.registerVaultEvents();
  this.registerThemeListener();
}
```

### 2. File Navigation

When a user clicks a node:

```typescript
private navigateToFile(filePath?: string) {
  if (!filePath) return;
  const file = this.app.vault.getAbstractFileByPath(filePath);
  if (file instanceof TFile) {
    this.app.workspace.openLinkText(filePath, '', false);
  }
}
```

This opens the note in a new tab (or focuses existing tab). The `filePath` comes from the node's `path` field set by the scanner.

### 3. Theme Detection

Detect Obsidian's current theme and pass to renderer:

```typescript
private detectTheme(): 'dark' | 'light' {
  return document.body.classList.contains('theme-dark') ? 'dark' : 'light';
}

private registerThemeListener() {
  // MutationObserver on document.body class changes
  this.themeObserver = new MutationObserver(() => {
    this.renderer?.setTheme(this.detectTheme());
  });
  this.themeObserver.observe(document.body, {
    attributes: true, attributeFilter: ['class']
  });
}
```

## Caching Layer

### Cache Storage

Use Obsidian's plugin data API:

```typescript
// Save
await this.plugin.saveData({ blueprint: data, scannedAt: Date.now() });

// Load
const cached = await this.plugin.loadData();
if (cached?.blueprint && cached?.scannedAt) { ... }
```

Data stored in `.obsidian/plugins/vault-blueprint/data.json`.

### Cache Invalidation

Cache is invalidated (re-scan triggered) when:

1. **File created**: `this.registerEvent(app.vault.on('create', ...))`
2. **File deleted**: `this.registerEvent(app.vault.on('delete', ...))`
3. **File renamed**: `this.registerEvent(app.vault.on('rename', ...))`
4. **Manual refresh**: User clicks refresh button or runs "Vault Blueprint: Refresh" command
5. **Settings changed**: When scan-affecting settings change (excludePaths, minBacklinks, categoryOverrides)

### Debouncing

Vault events fire rapidly during bulk operations (e.g., git pull, bulk rename). Debounce re-scans:

```typescript
private scheduleRescan() {
  if (this.rescanTimer) clearTimeout(this.rescanTimer);
  this.rescanTimer = setTimeout(async () => {
    const data = await this.scanner.scan();
    await this.cacheData(data);
    this.renderer?.setData(data);
  }, 1000);  // 1 second debounce
}
```

### Event Registration

```typescript
private registerVaultEvents() {
  this.registerEvent(this.app.vault.on('create', () => this.scheduleRescan()));
  this.registerEvent(this.app.vault.on('delete', () => this.scheduleRescan()));
  this.registerEvent(this.app.vault.on('rename', () => this.scheduleRescan()));
}
```

Using `this.registerEvent()` ensures cleanup when the view closes (Obsidian's `Component` base class handles this).

## Settings Reactivity

When settings change, the scanner needs to re-run:

```typescript
// In settings.ts, after saving settings:
plugin.settingsChanged();

// In main.ts:
settingsChanged() {
  // Notify any open blueprint views to re-scan
  this.app.workspace.getLeavesOfType(VIEW_TYPE_BLUEPRINT).forEach(leaf => {
    const view = leaf.view as BlueprintView;
    view.onSettingsChanged();
  });
}
```

### Settings That Trigger Re-scan
- `excludePaths` — changes which files are included
- `minBacklinks` — changes node threshold
- `categoryOverrides` — changes node categories
- `showFolderGroups` — changes group generation

### Settings That Don't Trigger Re-scan
- Visual-only settings (when added later): colors, zoom defaults

## Commands

Register in main.ts:

| Command ID | Name | Action |
|------------|------|--------|
| `open-vault-blueprint` | Open Vault Blueprint | Open/focus the blueprint view |
| `refresh-vault-blueprint` | Vault Blueprint: Refresh | Force re-scan and re-render |

## Toolbar / Status

Add a small toolbar in the blueprint view (top-left, below HUD):

```
[Refresh] [Zoom to Fit]   {N} nodes · {M} connections · Scanned: {time}
```

- **Refresh button**: Triggers re-scan
- **Zoom to Fit button**: Calls `renderer.zoomToFit()`
- **Stats**: From the blueprint data
- **Scanned time**: From cache metadata

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Empty vault | Show message: "No notes found. Start adding notes to your vault." |
| Scanner error | Show message: "Scan failed: {error}. Click Refresh to retry." Log error to console. |
| No cache + slow scan | Show loading spinner while scanning. Target: < 2s. |
| Renderer error | Catch and log. Show fallback message in view. |

## Performance Budget

| Operation | Target |
|-----------|--------|
| Open cached blueprint | < 200ms (load JSON + render) |
| Fresh scan (300 notes) | < 500ms |
| Fresh scan (1000 notes) | < 2s |
| Re-scan on file change | < 500ms (debounced, incremental if possible) |
| Canvas render | 60fps during interaction (zoom/pan) |

## Lifecycle

```
Plugin loads
  → onload(): register view, commands, ribbon icon
  → User clicks ribbon icon
    → activateView(): create or focus leaf
      → BlueprintView.onOpen()
        → loadOrScan(): check cache → scan if stale → return data
        → new BlueprintRenderer(canvas, container, data)
        → renderer.render()
        → registerVaultEvents()
  → Vault file changes
    → scheduleRescan() (debounced 1s)
      → scanner.scan()
      → cacheData()
      → renderer.setData(newData)
  → User closes view
    → BlueprintView.onClose()
      → renderer.destroy()
      → clean up observers
  → Plugin unloads
    → onunload(): view unregistered automatically
```

## Acceptance Criteria

1. Install plugin → click ribbon → see vault graph (zero config, full pipeline)
2. Click a node → opens the corresponding file in Obsidian
3. Adding/deleting a file triggers auto-refresh of the blueprint
4. Cached blueprint loads in < 200ms on re-open
5. Settings changes (exclude paths, backlink threshold) reflect immediately
6. Theme switching (dark ↔ light) updates renderer colors
7. Refresh command and button work correctly
8. No memory leaks: opening and closing the view repeatedly doesn't leak listeners
9. Works with both small (10 notes) and large (500+ notes) vaults
10. Stats bar shows accurate counts and scan timestamp
