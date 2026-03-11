# 06 — Commands and Toolbar

## Summary

Register two Obsidian commands (`open-vault-blueprint` and `refresh-vault-blueprint`) and build a toolbar DOM element in the blueprint view with refresh/zoom buttons and live stats display.

## Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/main.ts` | **Modify** | Register `refresh-vault-blueprint` command (open command already exists from split 01) |
| `src/view.ts` | **Modify** | Add toolbar DOM creation, `buildToolbar()`, `updateToolbarStats()` |
| `styles.css` | **Modify** | Add toolbar styling |

## Implementation Details

### main.ts — Command Registration

The `open-vault-blueprint` command is already registered in split 01. Add the refresh command:

```typescript
// In onload():
this.addCommand({
  id: 'refresh-vault-blueprint',
  name: 'Vault Blueprint: Refresh',
  checkCallback: (checking: boolean) => {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_BLUEPRINT);
    if (leaves.length === 0) return false;  // Command hidden when no view is open

    if (!checking) {
      leaves.forEach(leaf => {
        const view = leaf.view;
        if (view instanceof BlueprintView) {
          view.forceRescan();
        }
      });
    }
    return true;
  },
});
```

**Why `checkCallback` instead of `callback`:**
- `checkCallback` allows the command to be conditionally shown in the command palette. When `checking` is true, return whether the command is available. When `checking` is false, execute it.
- The refresh command is only meaningful when a blueprint view is open. Hiding it otherwise keeps the command palette clean.

### view.ts — Toolbar DOM

#### buildToolbar()

```typescript
private buildToolbar(data: BlueprintData): void {
  this.toolbarEl.empty();
  this.toolbarEl.addClass('blueprint-toolbar');

  // Refresh button
  const refreshBtn = this.toolbarEl.createEl('button', {
    cls: 'blueprint-toolbar-btn',
    attr: { 'aria-label': 'Refresh blueprint' },
  });
  setIcon(refreshBtn, 'refresh-cw');
  refreshBtn.addEventListener('click', () => this.forceRescan());

  // Zoom to Fit button
  const zoomBtn = this.toolbarEl.createEl('button', {
    cls: 'blueprint-toolbar-btn',
    attr: { 'aria-label': 'Zoom to fit' },
  });
  setIcon(zoomBtn, 'maximize-2');
  zoomBtn.addEventListener('click', () => this.renderer?.zoomToFit());

  // Stats text
  this.statsEl = this.toolbarEl.createEl('span', { cls: 'blueprint-toolbar-stats' });
  this.updateToolbarStats(data);
}
```

**Icon choice:**
- `refresh-cw` and `maximize-2` are from Lucide icons, which Obsidian bundles. Using `setIcon()` (from `obsidian` module) ensures consistent icon rendering.
- No custom SVGs needed.

#### updateToolbarStats()

```typescript
private statsEl: HTMLSpanElement | null = null;

private updateToolbarStats(data: BlueprintData): void {
  if (!this.statsEl) return;

  const nodeCount = data.nodes.length;
  const wireCount = data.wires.length;
  const timeStr = this.formatScanTime(this.lastScanTime);

  this.statsEl.textContent = `${nodeCount} nodes \u00B7 ${wireCount} connections \u00B7 Scanned: ${timeStr}`;
}

private formatScanTime(timestamp: number): string {
  if (!timestamp) return 'never';

  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60_000) return 'just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;

  // Absolute time for old scans
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
```

**Stats update triggers:**
- After initial `loadOrScan()` in `onOpen()`.
- After every `scheduleRescan()` completes (in the setTimeout callback).
- After `forceRescan()` completes.

The `lastScanTime` is set by `loadOrScan()` (from cache or fresh) and by `cacheData()` (after re-scan).

### styles.css — Toolbar Styling

```css
.blueprint-toolbar {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: var(--background-secondary);
  border-radius: 6px;
  border: 1px solid var(--background-modifier-border);
  font-size: var(--font-ui-small);
  opacity: 0.9;
}

.blueprint-toolbar:hover {
  opacity: 1;
}

.blueprint-toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 4px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.blueprint-toolbar-btn:hover {
  background: var(--background-modifier-hover);
  color: var(--text-normal);
}

.blueprint-toolbar-btn:active {
  background: var(--background-modifier-active-hover);
}

.blueprint-toolbar-stats {
  color: var(--text-muted);
  padding: 0 4px;
  white-space: nowrap;
  user-select: none;
}
```

**Design decisions:**
- Uses Obsidian CSS variables throughout for theme compatibility.
- Semi-transparent by default (`opacity: 0.9`), fully opaque on hover — avoids covering the canvas unnecessarily.
- Absolute positioned top-left. The renderer's own legend/search/info-panel occupy other areas.
- `z-index: 10` — above the canvas (z-index 0) but below Obsidian's modals and popups.
- Small footprint — two icon buttons + one line of stats text.

### Toolbar Position vs Renderer Overlays

The renderer (split 02) creates its own DOM overlays:
- **Legend** — category checkboxes (typically bottom-left or bottom-right)
- **Search** — search input (typically top-right)
- **Info panel** — node details on selection (typically right side)
- **Stats bar** — the renderer's own stats bar (bottom)

The toolbar sits in the plugin's DOM layer (created in `view.ts`), above the renderer's container. Position: top-left. This avoids overlap with renderer overlays. The renderer's own stats bar (from split 02) shows category breakdowns; the toolbar stats show scan metadata (timestamp).

If there's visual conflict, the toolbar can be moved to a different corner or integrated into the renderer's stats bar in a future iteration.

### Button Event Listener Cleanup

Button click listeners are added via `addEventListener`. These are cleaned up when `this.toolbarEl.empty()` is called (removes child elements and their listeners) or when `contentEl.empty()` is called in `onClose()`.

No need for explicit `removeEventListener` — the DOM elements are destroyed, and their listeners are garbage collected.

## Acceptance Criteria

- [ ] Command palette shows "Open Vault Blueprint" always and "Vault Blueprint: Refresh" only when a view is open
- [ ] "Vault Blueprint: Refresh" triggers a fresh re-scan of all open blueprint views
- [ ] Toolbar appears in top-left corner of the blueprint view
- [ ] Refresh button triggers `forceRescan()` and updates stats after completion
- [ ] Zoom to Fit button calls `renderer.zoomToFit()` and the graph fits the viewport
- [ ] Stats show correct node count, wire count, and relative scan time
- [ ] Stats update after every re-scan
- [ ] Toolbar styling respects Obsidian dark/light theme via CSS variables
- [ ] Toolbar doesn't overlap with renderer's legend, search, or info panel
- [ ] Toolbar buttons show correct Lucide icons
