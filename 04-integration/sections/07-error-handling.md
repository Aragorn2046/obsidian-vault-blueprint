# 07 — Error Handling

## Summary

Implement error states, loading indicators, and fallback UI for all failure modes in the blueprint pipeline. Also define the performance budget verification approach for scan and render operations.

## Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/view.ts` | **Modify** | Add `showLoading()`, `showEmptyState()`, `showError()`, error wrapping in `loadOrScan()` and `scheduleRescan()` |
| `styles.css` | **Modify** | Add styles for loading, empty, and error states |

## Implementation Details

### State Management

The view has four visual states:

| State | Shown When | Content |
|-------|-----------|---------|
| **Loading** | Scan in progress (no cached data) | Spinner + "Scanning vault..." |
| **Ready** | Data loaded, renderer active | Canvas + toolbar |
| **Empty** | Scan completed, zero nodes | Message + suggestion |
| **Error** | Scan or render failed | Error message + retry button |

Only one state is active at a time. Transitions:

```
Loading → Ready (scan succeeded, nodes > 0)
Loading → Empty (scan succeeded, nodes == 0)
Loading → Error (scan threw)
Ready → Loading → Ready (re-scan, but see note below)
Error → Loading → Ready/Empty/Error (retry)
```

**Note on re-scan loading state:** During a background re-scan (triggered by vault events), do NOT show the loading state. The current graph remains visible while the new data is being scanned. Loading state is only shown on:
- First open with no cache.
- Manual force refresh (brief flash acceptable).

### State DOM Helpers

```typescript
private stateEl: HTMLDivElement | null = null;

private clearState(): void {
  if (this.stateEl) {
    this.stateEl.remove();
    this.stateEl = null;
  }
}

private showLoading(): void {
  this.clearState();
  this.stateEl = this.contentEl.createDiv({ cls: 'blueprint-state blueprint-loading' });

  const spinner = this.stateEl.createDiv({ cls: 'blueprint-spinner' });
  this.stateEl.createEl('p', { text: 'Scanning vault...' });
}

private showEmptyState(): void {
  this.clearState();
  // Hide canvas
  if (this.container) this.container.style.display = 'none';

  this.stateEl = this.contentEl.createDiv({ cls: 'blueprint-state blueprint-empty' });
  this.stateEl.createEl('p', {
    text: 'No notes found.',
    cls: 'blueprint-state-title',
  });
  this.stateEl.createEl('p', {
    text: 'Start adding notes to your vault, or adjust the minimum backlinks setting.',
    cls: 'blueprint-state-subtitle',
  });
}

private showError(message: string): void {
  this.clearState();
  // Hide canvas
  if (this.container) this.container.style.display = 'none';

  this.stateEl = this.contentEl.createDiv({ cls: 'blueprint-state blueprint-error' });
  this.stateEl.createEl('p', {
    text: `Scan failed: ${message}`,
    cls: 'blueprint-state-title',
  });

  const retryBtn = this.stateEl.createEl('button', {
    text: 'Retry',
    cls: 'mod-cta',  // Obsidian's call-to-action button style
  });
  retryBtn.addEventListener('click', () => {
    this.stateEl?.remove();
    this.stateEl = null;
    if (this.container) this.container.style.display = '';
    this.forceRescan();
  });
}
```

### Error Wrapping in loadOrScan()

```typescript
private async loadOrScan(): Promise<BlueprintData> {
  const cache = new BlueprintCache(this.plugin);

  // Try cache first
  try {
    const cached = await cache.load();
    if (cached && cache.isFresh(cached, this.plugin.settings)) {
      this.lastScanTime = cached.scannedAt;
      this.clearState();  // Remove loading spinner
      return cached.blueprint;
    }
  } catch (cacheError) {
    // Corrupted cache — continue to fresh scan
    console.warn('Vault Blueprint: Cache load failed, scanning fresh', cacheError);
  }

  // Fresh scan
  try {
    const scanner = this.createScanner();
    const data = await scanner.scan();
    this.clearState();

    // Cache the result (don't await — non-blocking)
    cache.save(data, this.plugin.settings).catch(err => {
      console.warn('Vault Blueprint: Failed to save cache', err);
    });

    this.lastScanTime = Date.now();
    return data;
  } catch (scanError) {
    console.error('Vault Blueprint: Scan failed', scanError);
    throw scanError;  // Propagates to onOpen()'s try/catch → showError()
  }
}
```

### Error Wrapping in Renderer Construction

```typescript
// In onOpen(), after loadOrScan():
try {
  this.renderer = new BlueprintRenderer({
    canvas: this.canvas,
    container: this.container,
    data: data,
    theme: this.detectTheme(),
    onNodeClick: (nodeId: string, filePath?: string) => this.navigateToFile(filePath),
  });
  this.renderer.render();
} catch (renderError) {
  console.error('Vault Blueprint: Renderer failed', renderError);
  this.showError(
    renderError instanceof Error
      ? `Render error: ${renderError.message}`
      : 'Failed to render blueprint'
  );
  return;  // Don't register events — nothing to update
}
```

### Error Handling in scheduleRescan()

Background re-scans (from vault events) should NOT replace the current view with an error:

```typescript
// In scheduleRescan() setTimeout callback:
try {
  const scanner = this.createScanner();
  const data = await scanner.scan();
  await this.cacheData(data);
  // ... apply data
} catch (error) {
  // Log but keep current view intact
  console.error('Vault Blueprint: Background re-scan failed', error);
  // Optionally show a subtle toast/notice:
  // new Notice('Vault Blueprint: Re-scan failed. Click Refresh to retry.');
}
```

For `forceRescan()` (manual refresh), errors ARE shown since the user explicitly requested it:

```typescript
// In forceRescan():
try {
  // ... scan and apply
} catch (error) {
  console.error('Vault Blueprint: Force re-scan failed', error);
  this.showError(error instanceof Error ? error.message : 'Re-scan failed');
}
```

### styles.css — State Styles

```css
.blueprint-state {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 5;
  background: var(--background-primary);
}

.blueprint-state-title {
  font-size: var(--font-ui-medium);
  color: var(--text-normal);
  margin-bottom: 4px;
}

.blueprint-state-subtitle {
  font-size: var(--font-ui-small);
  color: var(--text-muted);
}

.blueprint-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--background-modifier-border);
  border-top-color: var(--interactive-accent);
  border-radius: 50%;
  animation: blueprint-spin 0.8s linear infinite;
  margin-bottom: 12px;
}

@keyframes blueprint-spin {
  to { transform: rotate(360deg); }
}

.blueprint-error .blueprint-state-title {
  color: var(--text-error);
}
```

### Performance Budget Verification

The spec defines these performance targets:

| Operation | Target | How to Verify |
|-----------|--------|---------------|
| Open cached blueprint | < 200ms | `console.time('cache-load')` around `loadOrScan()` when cache hits |
| Fresh scan (300 notes) | < 500ms | `console.time('scan')` around `scanner.scan()` |
| Fresh scan (1000 notes) | < 2s | Same — test with large vault |
| Re-scan on file change | < 500ms | `console.time('rescan')` in `scheduleRescan()` |
| Canvas render | 60fps | Browser devtools Performance tab during zoom/pan |

**Verification approach:**

1. **Development logging**: Add `console.time`/`console.timeEnd` calls guarded by a `DEBUG` flag:

```typescript
const DEBUG = process.env.NODE_ENV === 'development';

// In loadOrScan():
if (DEBUG) console.time('vault-blueprint:loadOrScan');
const data = await scanner.scan();
if (DEBUG) console.timeEnd('vault-blueprint:loadOrScan');
```

2. **Production stripping**: esbuild can strip these via `define: { 'process.env.NODE_ENV': '"production"' }` in the build config, making dead code elimination remove the debug blocks.

3. **Performance regression test**: Create a test vault generator script that produces N random notes with wikilinks. Run the scanner against it and assert timing:

```typescript
// test/perf.test.ts (run manually, not in CI)
test('scan 300 notes < 500ms', async () => {
  const start = performance.now();
  await scanner.scan();
  expect(performance.now() - start).toBeLessThan(500);
});
```

4. **Canvas FPS**: Use `requestAnimationFrame` callback timing in the renderer to detect frame drops. Log a warning if frame time exceeds 20ms (< 50fps) during interaction.

### Defensive Patterns

**Null checks throughout:**
- Always check `this.renderer` before calling methods — it may be null if initialization failed.
- Always check `this.canvas` and `this.container` — they may not exist if DOM creation failed.

**Graceful degradation:**
- If the renderer fails but the scanner succeeds, show the stats (node/wire count) in a text-only fallback.
- If the cache is corrupted, silently fall back to a fresh scan.
- If `saveData` fails (disk full, permissions), log a warning but continue — the view still works, just without caching.

## Acceptance Criteria

- [ ] First open with no cache shows a loading spinner until scan completes
- [ ] Empty vault (or all files excluded) shows "No notes found" message with settings hint
- [ ] Scanner error shows error message with Retry button
- [ ] Clicking Retry after an error triggers a fresh scan attempt
- [ ] Renderer construction error shows a fallback error message
- [ ] Background re-scan failure does NOT replace the current view — logs to console only
- [ ] Manual refresh failure DOES show an error state
- [ ] Corrupted `data.json` falls back to fresh scan without crashing
- [ ] Loading spinner uses Obsidian's theme colors (via CSS variables)
- [ ] Performance: cached open < 200ms, fresh scan of 300 notes < 500ms (verified with console timing)
- [ ] Debug timing logs are present in development builds and stripped in production
