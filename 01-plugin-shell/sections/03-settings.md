# 03 — Settings

## Summary

Create `src/settings.ts` with the `VaultBlueprintSettingTab` class. This renders a settings UI using Obsidian's `Setting` API for all four MVP settings: `excludePaths`, `minBacklinks`, `showFolderGroups`, and `categoryOverrides`. Settings are persisted via Obsidian's `plugin.saveData()` / `plugin.loadData()` (stored in `data.json` per vault).

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/settings.ts` | Create | Settings tab UI class |
| `src/types.ts` | Dependency | Uses `VaultBlueprintSettings` interface (defined in section 05) |
| `src/main.ts` | Dependency | Plugin instance passed to constructor for `loadSettings`/`saveSettings` |

## Implementation Details

### src/settings.ts

```typescript
import { App, PluginSettingTab, Setting } from "obsidian";
import type VaultBlueprintPlugin from "./main";

export class VaultBlueprintSettingTab extends PluginSettingTab {
  plugin: VaultBlueprintPlugin;

  constructor(app: App, plugin: VaultBlueprintPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // --- Exclude Paths ---
    new Setting(containerEl)
      .setName("Excluded paths")
      .setDesc(
        "Comma-separated folder paths to exclude from vault scanning. " +
        "Example: .obsidian, node_modules, templates"
      )
      .addText((text) =>
        text
          .setPlaceholder(".obsidian, node_modules")
          .setValue(this.plugin.settings.excludePaths.join(", "))
          .onChange(async (value) => {
            this.plugin.settings.excludePaths = value
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            await this.plugin.saveSettings();
          })
      );

    // --- Minimum Backlinks ---
    new Setting(containerEl)
      .setName("Minimum backlinks")
      .setDesc(
        "Notes with fewer incoming backlinks than this threshold " +
        "will be excluded from the blueprint. Set to 0 to show all notes."
      )
      .addText((text) =>
        text
          .setPlaceholder("3")
          .setValue(String(this.plugin.settings.minBacklinks))
          .onChange(async (value) => {
            const parsed = parseInt(value, 10);
            if (!isNaN(parsed) && parsed >= 0) {
              this.plugin.settings.minBacklinks = parsed;
              await this.plugin.saveSettings();
            }
          })
      );

    // --- Show Folder Groups ---
    new Setting(containerEl)
      .setName("Show folder groups")
      .setDesc(
        "When enabled, top-level vault folders are rendered as " +
        "visual group boxes containing their notes."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showFolderGroups)
          .onChange(async (value) => {
            this.plugin.settings.showFolderGroups = value;
            await this.plugin.saveSettings();
          })
      );

    // --- Category Overrides ---
    new Setting(containerEl)
      .setName("Category overrides")
      .setDesc(
        "Map folder path patterns to custom category names. " +
        'One per line, format: "path pattern = Category Name". ' +
        "Example:\n  1 Worldview = Core Concepts\n  3 Business = Business"
      )
      .addTextArea((area) => {
        const current = Object.entries(
          this.plugin.settings.categoryOverrides
        )
          .map(([k, v]) => `${k} = ${v}`)
          .join("\n");

        area
          .setPlaceholder("folder/path = Category Name")
          .setValue(current)
          .onChange(async (value) => {
            const overrides: Record<string, string> = {};
            for (const line of value.split("\n")) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.includes("=")) continue;
              const eqIndex = trimmed.indexOf("=");
              const key = trimmed.slice(0, eqIndex).trim();
              const val = trimmed.slice(eqIndex + 1).trim();
              if (key && val) {
                overrides[key] = val;
              }
            }
            this.plugin.settings.categoryOverrides = overrides;
            await this.plugin.saveSettings();
          });

        area.inputEl.rows = 6;
        area.inputEl.cols = 40;
      });
  }
}
```

### Design Decisions

1. **`excludePaths` as comma-separated text** — Obsidian's Setting API doesn't have a native list/tag input. Comma-separated is the simplest UX. Values are trimmed and empty strings filtered out on every change.

2. **`minBacklinks` with validation** — Uses a text input (not a slider) because the range is open-ended. Parses as integer, ignores non-numeric input (preserves previous value). Only accepts `>= 0`.

3. **`categoryOverrides` as textarea** — A `Record<string, string>` maps naturally to `key = value` lines. Parsing uses first `=` as delimiter (allowing `=` in category names, though unlikely). Empty/malformed lines are silently skipped.

4. **Save on every change** — Each setting calls `saveSettings()` immediately on change. This is standard Obsidian plugin behavior (no "save" button). The data is written to `data.json` in the plugin's vault folder.

5. **No debouncing** — `saveData()` is fast (writes to local disk). Debouncing would add complexity for no real benefit in this context.

6. **`display()` calls `containerEl.empty()`** — Required by Obsidian convention. The settings tab is re-rendered every time the user navigates to it.

## Acceptance Criteria

1. Settings tab appears under "Vault Blueprint" in Obsidian Settings > Community Plugins.
2. "Excluded paths" renders as a text input, pre-populated with `.obsidian, node_modules`.
3. Editing excluded paths and reopening settings preserves the change (persisted to `data.json`).
4. "Minimum backlinks" renders as a text input with value `3`.
5. Entering a non-numeric value in minBacklinks does not crash or corrupt settings.
6. "Show folder groups" renders as a toggle, default on.
7. "Category overrides" renders as a textarea.
8. Adding `1 Worldview = Core Concepts` in the textarea and checking `data.json` shows the correct `categoryOverrides` object.
9. All settings survive plugin reload and Obsidian restart.

## Test Approach

- **Manual UI test**: Open settings tab, verify all 4 fields render with correct defaults.
- **Persistence test**: Change each setting, reload plugin, verify values preserved.
- **Edge cases for excludePaths**: Test with trailing commas, extra spaces, empty string — should produce clean array.
- **Edge cases for minBacklinks**: Test with `0`, `-1`, `abc`, `3.5`, empty string — only valid non-negative integers should be accepted.
- **Edge cases for categoryOverrides**: Test with empty lines, lines without `=`, multiple `=` signs — should parse gracefully.
- **data.json inspection**: After changing settings, read the plugin's `data.json` file and verify the JSON structure matches `VaultBlueprintSettings`.
- **Type check**: `npx tsc --noEmit` passes with all settings code.
