# 05 — Settings Reactivity

## Summary

When the user changes scan-affecting settings in the plugin's settings tab, all open blueprint views must re-scan and re-render. This section wires the settings tab's save callback to the view's re-scan mechanism via the plugin instance.

## Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/main.ts` | **Modify** | Add `settingsChanged()` method |
| `src/settings.ts` | **Modify** | Call `plugin.settingsChanged()` after saving settings |
| `src/view.ts` | **Modify** | Add public `onSettingsChanged()` method |

## Implementation Details

### main.ts — settingsChanged()

```typescript
// In VaultBlueprintPlugin class:

settingsChanged(): void {
  this.app.workspace.getLeavesOfType(VIEW_TYPE_BLUEPRINT).forEach(leaf => {
    const view = leaf.view;
    if (view instanceof BlueprintView) {
      view.onSettingsChanged();
    }
  });
}
```

**Why `instanceof` check instead of cast:**
- `leaf.view as BlueprintView` would work but bypasses runtime safety. If another plugin somehow registers the same view type (unlikely but defensive), an `instanceof` check prevents calling methods on the wrong object.

### settings.ts — Trigger on Save

```typescript
// In VaultBlueprintSettingTab class:

// Each setting's onChange handler:
new Setting(containerEl)
  .setName('Exclude paths')
  .setDesc('Folders to exclude from scanning (comma-separated)')
  .addText(text => text
    .setValue(this.plugin.settings.excludePaths.join(', '))
    .onChange(async (value) => {
      this.plugin.settings.excludePaths = value
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);
      await this.plugin.saveSettings();
      this.plugin.settingsChanged();
    }));

new Setting(containerEl)
  .setName('Minimum backlinks')
  .setDesc('Minimum incoming links for a note to appear as a node')
  .addSlider(slider => slider
    .setLimits(1, 10, 1)
    .setValue(this.plugin.settings.minBacklinks)
    .setDynamicTooltip()
    .onChange(async (value) => {
      this.plugin.settings.minBacklinks = value;
      await this.plugin.saveSettings();
      this.plugin.settingsChanged();
    }));

// Same pattern for showFolderGroups (toggle) and categoryOverrides (text/JSON)
```

**Debounce consideration for settings:**
- `settingsChanged()` calls `view.onSettingsChanged()` which calls `scheduleRescan()`.
- `scheduleRescan()` already has a 1-second debounce.
- If the user drags the `minBacklinks` slider from 3 to 7 (firing onChange for 4, 5, 6, 7), the debounce collapses these to a single re-scan with the final value of 7.
- No additional debounce needed in the settings layer.

### view.ts — onSettingsChanged()

```typescript
// Public method called by plugin when settings change:
onSettingsChanged(): void {
  this.scheduleRescan();
}
```

This is intentionally simple — it reuses the same debounced re-scan path as vault events. The scanner is created fresh each time with current settings (via `createScanner()`), so it automatically picks up the new values.

### Settings Classification

Settings are classified by whether they require a re-scan:

| Setting | Re-scan? | Why |
|---------|----------|-----|
| `excludePaths` | Yes | Changes which files are included in the scan |
| `minBacklinks` | Yes | Changes the backlink threshold for node inclusion |
| `categoryOverrides` | Yes | Changes node category assignments |
| `showFolderGroups` | Yes | Changes whether folder groups are generated |

All current MVP settings require a re-scan. When visual-only settings are added later (e.g., color overrides, default zoom level), they should call `renderer.setOption()` directly instead of triggering a re-scan.

### saveSettings() — Preserve Cache Data

The settings save must not overwrite cached blueprint data in `data.json`:

```typescript
// In VaultBlueprintPlugin:
async saveSettings(): Promise<void> {
  const existing = (await this.loadData()) || {};
  await this.saveData({
    ...existing,          // Preserves blueprint, scannedAt, settingsHash
    ...this.settings,     // Overwrites settings fields
  });
}

async loadSettings(): Promise<void> {
  const data = (await this.loadData()) || {};
  this.settings = Object.assign({}, DEFAULT_SETTINGS, {
    excludePaths: data.excludePaths,
    minBacklinks: data.minBacklinks,
    showFolderGroups: data.showFolderGroups,
    categoryOverrides: data.categoryOverrides,
  });
}
```

**Why explicit field extraction in `loadSettings()`:**
- `data.json` contains both settings and cache. Using `Object.assign({}, DEFAULT_SETTINGS, data)` would pull cache fields into settings. Explicit field extraction keeps them separate.

### Flow Diagram

```
User changes setting in Settings Tab
  → onChange fires
    → plugin.settings.X = newValue
    → plugin.saveSettings()        // Persist to data.json
    → plugin.settingsChanged()     // Notify views
      → for each open BlueprintView:
        → view.onSettingsChanged()
          → scheduleRescan()       // 1s debounce
            → createScanner()      // Uses current plugin.settings
            → scanner.scan()       // Fresh scan with new settings
            → cacheData()          // Update cache (with new settingsHash)
            → renderer.setData()   // Re-render with new data
```

### Edge Cases

- **No open views**: `settingsChanged()` iterates zero leaves — no re-scan happens. Next time a view opens, `loadOrScan()` detects the settings hash mismatch and triggers a fresh scan.
- **Settings changed during active scan**: The debounce handles this — the in-flight scan completes, but a new scan is scheduled 1 second after the last settings change. The newer scan uses the final settings values.
- **Category overrides format**: `categoryOverrides` is `Record<string, string>` — path patterns mapped to category IDs. In the settings UI, this could be a text area with `path: category` lines, parsed on save:

```typescript
// Parse: "Claude Config/*: config\nArticles/*: content"
// Into: { "Claude Config/*": "config", "Articles/*": "content" }
```

This parsing logic lives in `settings.ts` and converts to/from the record format on display/save.

## Acceptance Criteria

- [ ] Changing `excludePaths` triggers a re-scan and the blueprint updates to include/exclude files
- [ ] Changing `minBacklinks` triggers a re-scan and the node count changes accordingly
- [ ] Changing `showFolderGroups` toggles group boxes on the blueprint
- [ ] Changing `categoryOverrides` re-categorizes nodes with updated colors
- [ ] Rapidly changing settings (e.g., dragging slider) produces only one re-scan after settling
- [ ] Settings save preserves cached blueprint data in `data.json`
- [ ] Settings load does not pull cache fields into the settings object
- [ ] Changing settings with no open blueprint view works without errors (re-scan happens on next open)
