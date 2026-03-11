# 03 — Vault Events

## Summary

Register vault change listeners so the blueprint auto-refreshes when files are created, deleted, or renamed. Uses a 1-second debounce to handle bulk operations (git pull, batch rename) without hammering the scanner. All event registrations use Obsidian's `this.registerEvent()` for automatic cleanup on view close.

## Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/view.ts` | **Modify** | Add `registerVaultEvents()`, `scheduleRescan()`, and debounce logic |

## Implementation Details

### registerVaultEvents()

```typescript
private registerVaultEvents(): void {
  this.registerEvent(
    this.app.vault.on('create', (file) => {
      if (file instanceof TFile) this.scheduleRescan();
    })
  );

  this.registerEvent(
    this.app.vault.on('delete', (file) => {
      if (file instanceof TFile) this.scheduleRescan();
    })
  );

  this.registerEvent(
    this.app.vault.on('rename', (file, oldPath) => {
      if (file instanceof TFile) this.scheduleRescan();
    })
  );
}
```

**Why only `TFile` checks:**
- Folder create/delete/rename events also fire on these hooks. We filter to files only because folder changes are already captured through their contained files' events. A folder rename triggers rename events for all its children.
- Attachment files (images, PDFs) will pass the `TFile` check but the scanner's `excludePaths` and file-type filters will ignore them. The re-scan is cheap enough that filtering at the event level isn't necessary.

**Why NOT `modify` events:**
- `app.vault.on('modify')` fires on every file save — including when the user types in any note. This would trigger constant re-scans during normal editing.
- The scanner reads metadata (links, tags, frontmatter) from Obsidian's metadata cache, which is updated asynchronously. A `modify` event doesn't guarantee the metadata cache is current yet.
- Content changes that affect the blueprint (adding/removing wikilinks) are rare and low-urgency. The manual refresh button and settings-change triggers cover this.
- If needed later, `modify` support can be added with a longer debounce (5-10s) and a check against `metadataCache` changes specifically.

### scheduleRescan()

```typescript
private scheduleRescan(): void {
  // Don't schedule if renderer doesn't exist (view not fully initialized)
  if (!this.renderer) return;

  if (this.rescanTimer) {
    clearTimeout(this.rescanTimer);
  }

  this.rescanTimer = setTimeout(async () => {
    this.rescanTimer = null;
    try {
      const scanner = this.createScanner();
      const data = await scanner.scan();
      await this.cacheData(data);

      if (data.nodes.length === 0) {
        this.renderer?.destroy();
        this.renderer = null;
        this.showEmptyState();
        return;
      }

      this.renderer?.setData(data);
      this.updateToolbarStats(data);
    } catch (error) {
      console.error('Vault Blueprint: Re-scan failed', error);
      // Don't replace current view with error — keep showing stale data
      // Log the error so the user can check console if something looks wrong
    }
  }, 1000);
}
```

**Debounce behavior:**

1. First vault event starts a 1-second timer.
2. Subsequent events within that 1-second window reset the timer.
3. After 1 second of silence, the re-scan fires.
4. During a `git pull` that touches 50 files, this collapses to a single re-scan.

**Error handling during re-scan:**
- On re-scan failure, keep showing the current (stale) data rather than replacing it with an error screen. The data is still useful — it's just not current.
- Log the error to console for debugging.
- The manual refresh button provides a retry path.

### Debounce Timer Cleanup

The timer is cleaned up in three places:

1. **`onClose()`** — prevents orphaned timer from firing after view is destroyed.
2. **`scheduleRescan()` itself** — previous timer cleared before setting a new one.
3. **Automatic** — if the timer fires and `this.renderer` is null (view partially torn down), it returns early.

### Edge Cases

**Rapid open/close:**
If the user opens the view, triggers a vault event, and closes the view within 1 second:
- `onClose()` clears the timer, preventing the re-scan.
- `registerEvent()` listeners are removed by Obsidian's `Component` teardown.
- No dangling callbacks.

**Scan in progress during new event:**
If a scan is running when a new vault event fires:
- The debounce timer resets. The new timer will fire 1 second after the latest event.
- The in-flight scan continues to completion. Its result is applied via `renderer.setData()`.
- The subsequent scan triggered by the debounce will produce a fresher result, overwriting the previous.
- This is slightly wasteful (two scans instead of one) but keeps the logic simple. For a 300-note vault, a scan takes < 500ms — doubling up is negligible.

**Multiple open views:**
Each `BlueprintView` instance registers its own vault events. If two blueprint views are open, both get events and both re-scan independently. This is correct — they may have different settings in the future.

### Integration with scheduleRescan Callers

`scheduleRescan()` is called from three sources:

1. **Vault events** (this section) — `create`, `delete`, `rename`
2. **Settings changes** (section 05) — `onSettingsChanged()` calls `scheduleRescan()`
3. **Manual refresh** (section 06) — refresh button/command calls `scheduleRescan()` (or a force variant that bypasses debounce)

For manual refresh, use a `forceRescan()` that skips the debounce:

```typescript
async forceRescan(): Promise<void> {
  if (this.rescanTimer) {
    clearTimeout(this.rescanTimer);
    this.rescanTimer = null;
  }

  try {
    this.showLoading();
    const scanner = this.createScanner();
    const data = await scanner.scan();
    await this.cacheData(data);

    if (data.nodes.length === 0) {
      this.renderer?.destroy();
      this.renderer = null;
      this.showEmptyState();
      return;
    }

    if (this.renderer) {
      this.renderer.setData(data);
    } else {
      // Renderer was destroyed (e.g., was showing empty state) — recreate
      this.renderer = new BlueprintRenderer({
        canvas: this.canvas,
        container: this.container,
        data: data,
        theme: this.detectTheme(),
        onNodeClick: (nodeId: string, filePath?: string) => this.navigateToFile(filePath),
      });
      this.renderer.render();
    }

    this.updateToolbarStats(data);
  } catch (error) {
    console.error('Vault Blueprint: Force re-scan failed', error);
    this.showError(error instanceof Error ? error.message : 'Re-scan failed');
  }
}
```

## Acceptance Criteria

- [ ] Creating a new `.md` file triggers a blueprint refresh after ~1 second
- [ ] Deleting a file removes its node from the blueprint after ~1 second
- [ ] Renaming a file updates the blueprint after ~1 second
- [ ] Creating 20 files rapidly (e.g., pasting into vault) produces only 1 re-scan
- [ ] Closing the view cancels any pending re-scan timer
- [ ] Re-scan errors don't crash the view or replace the current graph with a blank screen
- [ ] No event listeners leak after opening and closing the view
- [ ] `forceRescan()` runs immediately without debounce delay
