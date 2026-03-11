# 02 — View Wiring

## Summary

Wire `BlueprintView.onOpen()` to create the scanner, cache, and renderer in the correct sequence. This is the central integration point — it connects the plugin shell (split 01), canvas renderer (split 02), and vault scanner (split 03) into a working pipeline. Also update `onClose()` to properly tear down all resources.

## Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/view.ts` | **Modify** | Full rewrite of `onOpen()` and `onClose()` with scanner + renderer wiring |
| `src/main.ts` | **Modify** | Pass plugin reference to view constructor for cache access |

## Implementation Details

### View Instance Properties

Add to `BlueprintView`:

```typescript
export class BlueprintView extends ItemView {
  private plugin: VaultBlueprintPlugin;
  private canvas: HTMLCanvasElement;
  private container: HTMLDivElement;
  private toolbarEl: HTMLDivElement;
  private renderer: BlueprintRenderer | null = null;
  private scanner: VaultScanner | null = null;
  private themeObserver: MutationObserver | null = null;
  private rescanTimer: ReturnType<typeof setTimeout> | null = null;
  private lastScanTime: number = 0;

  constructor(leaf: WorkspaceLeaf, plugin: VaultBlueprintPlugin) {
    super(leaf);
    this.plugin = plugin;
  }
}
```

### onOpen() — Full Pipeline

```typescript
async onOpen() {
  const { contentEl } = this;
  contentEl.empty();
  contentEl.addClass('vault-blueprint-container');

  // 1. Create DOM structure
  this.toolbarEl = contentEl.createDiv({ cls: 'blueprint-toolbar' });
  this.container = contentEl.createDiv({ cls: 'blueprint-wrapper' });
  this.canvas = this.container.createEl('canvas');

  // 2. Show loading state
  this.showLoading();

  try {
    // 3. Load data (cache hit or fresh scan)
    const data = await this.loadOrScan();

    // 4. Check for empty vault
    if (data.nodes.length === 0) {
      this.showEmptyState();
      return;
    }

    // 5. Initialize renderer
    this.renderer = new BlueprintRenderer({
      canvas: this.canvas,
      container: this.container,
      data: data,
      theme: this.detectTheme(),
      onNodeClick: (nodeId: string, filePath?: string) => this.navigateToFile(filePath),
    });
    this.renderer.render();

    // 6. Build toolbar (needs renderer reference for zoomToFit)
    this.buildToolbar(data);

    // 7. Register event listeners
    this.registerVaultEvents();
    this.registerThemeListener();

  } catch (error) {
    console.error('Vault Blueprint: Failed to initialize', error);
    this.showError(error instanceof Error ? error.message : 'Unknown error');
  }
}
```

**Ordering rationale:**

1. DOM first — toolbar and canvas must exist before renderer initializes (it measures container size).
2. Loading state shown immediately — user sees feedback while scan runs.
3. `loadOrScan()` handles cache logic (see section 01).
4. Empty check before renderer — avoids rendering an empty graph.
5. Renderer created with all dependencies injected.
6. Toolbar after renderer — needs renderer reference for zoom-to-fit.
7. Events last — nothing to re-scan until renderer exists.

### onClose() — Full Teardown

```typescript
async onClose() {
  // 1. Cancel pending re-scan
  if (this.rescanTimer) {
    clearTimeout(this.rescanTimer);
    this.rescanTimer = null;
  }

  // 2. Destroy renderer (cleans up canvas listeners, animation frames, DOM overlays)
  if (this.renderer) {
    this.renderer.destroy();
    this.renderer = null;
  }

  // 3. Disconnect theme observer
  if (this.themeObserver) {
    this.themeObserver.disconnect();
    this.themeObserver = null;
  }

  // 4. Null out references
  this.scanner = null;

  // 5. Clear DOM (Obsidian's Component base class handles registerEvent cleanup)
  this.contentEl.empty();
}
```

**Cleanup order matters:**

- Timer first — prevents a rescan firing during teardown.
- Renderer before DOM clear — `destroy()` may need to remove its own DOM elements from the container.
- Theme observer is manual (not via `registerEvent`), so must be explicitly disconnected.
- `registerEvent()` listeners are cleaned up automatically by Obsidian's `Component` class when the view is detached — no manual removal needed.

### main.ts — Plugin Modifications

Update the view registration to pass `this` (the plugin):

```typescript
this.registerView(VIEW_TYPE_BLUEPRINT, (leaf) => new BlueprintView(leaf, this));
```

Add `settingsChanged()` method (used by settings tab, detailed in section 05):

```typescript
settingsChanged() {
  this.app.workspace.getLeavesOfType(VIEW_TYPE_BLUEPRINT).forEach(leaf => {
    const view = leaf.view as BlueprintView;
    if (view.onSettingsChanged) view.onSettingsChanged();
  });
}
```

### Canvas Sizing

The canvas element must fill its container and have its `width`/`height` attributes set to actual pixel dimensions (not just CSS). The renderer's `ResizeObserver` (from split 02) handles this, but the initial size must be set before `render()`:

```typescript
// In onOpen(), before creating renderer:
const rect = this.container.getBoundingClientRect();
this.canvas.width = rect.width * window.devicePixelRatio;
this.canvas.height = rect.height * window.devicePixelRatio;
this.canvas.style.width = '100%';
this.canvas.style.height = '100%';
```

The renderer's internal `ResizeObserver` will keep this in sync on subsequent size changes.

### Scanner Instance Management

The scanner is created fresh for each scan, not stored long-term. This avoids stale references to settings:

```typescript
private createScanner(): VaultScanner {
  return new VaultScanner({
    app: this.app,
    excludePaths: this.plugin.settings.excludePaths,
    minBacklinks: this.plugin.settings.minBacklinks,
    categoryOverrides: this.plugin.settings.categoryOverrides,
    showFolderGroups: this.plugin.settings.showFolderGroups,
  });
}
```

This is called by `loadOrScan()` and `scheduleRescan()` — always with current settings.

## Acceptance Criteria

- [ ] Clicking the ribbon icon opens a view with a rendered vault graph (full pipeline, zero config)
- [ ] Closing and reopening the view works without errors or leaked listeners
- [ ] Opening the view 10 times in a row does not accumulate event listeners or DOM nodes
- [ ] Canvas fills the available space and is correctly sized on HiDPI displays
- [ ] Loading state is visible during first scan (before cache exists)
- [ ] Empty vault shows a friendly message instead of a blank canvas
- [ ] Scanner errors show an error state with retry option (not a blank screen)
- [ ] View correctly passes theme to renderer on initial open
