# 02 — Manifest and Entry Point

## Summary

Create `manifest.json` (Obsidian plugin metadata) and `src/main.ts` (plugin entry point). The entry point registers the custom view, ribbon icon, command palette entry, and settings tab. It also handles view activation logic (reuse existing leaf or create new tab).

## Files to Create

| File | Purpose |
|------|---------|
| `manifest.json` | Plugin metadata — Obsidian reads this to identify the plugin |
| `src/main.ts` | Plugin class: lifecycle, view registration, commands, settings |

## Implementation Details

### manifest.json

```json
{
  "id": "vault-blueprint",
  "name": "Vault Blueprint",
  "version": "0.1.0",
  "minAppVersion": "1.0.0",
  "description": "Interactive node-graph visualization of your vault's architecture and workflow connections.",
  "author": "Aragorn Meulendijks",
  "authorUrl": "https://github.com/Aragorn2046",
  "isDesktopOnly": false
}
```

Notes:
- `id` must match the plugin folder name.
- `minAppVersion` 1.0.0 is conservative — uses only stable ItemView APIs.
- `isDesktopOnly: false` — canvas rendering works on mobile too (though interaction may differ in later splits).

### src/main.ts

```typescript
import { Plugin, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_BLUEPRINT } from "./types";
import { VaultBlueprintSettings } from "./types";
import { BlueprintView } from "./view";
import { VaultBlueprintSettingTab } from "./settings";

const DEFAULT_SETTINGS: VaultBlueprintSettings = {
  excludePaths: [".obsidian", "node_modules"],
  minBacklinks: 3,
  showFolderGroups: true,
  categoryOverrides: {},
};

export default class VaultBlueprintPlugin extends Plugin {
  settings: VaultBlueprintSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(
      VIEW_TYPE_BLUEPRINT,
      (leaf: WorkspaceLeaf) => new BlueprintView(leaf, this)
    );

    this.addRibbonIcon("network", "Open Vault Blueprint", () => {
      this.activateView();
    });

    this.addCommand({
      id: "open-vault-blueprint",
      name: "Open Vault Blueprint",
      callback: () => {
        this.activateView();
      },
    });

    this.addSettingTab(new VaultBlueprintSettingTab(this.app, this));
  }

  onunload(): void {
    // Cleanup handled by Obsidian's view lifecycle.
    // Future splits may add renderer/scanner disposal here.
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;

    // Reuse existing leaf if the view is already open
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_BLUEPRINT)[0];

    if (!leaf) {
      // Open in a new tab (not split — less intrusive)
      const newLeaf = workspace.getLeaf("tab");
      await newLeaf.setViewState({
        type: VIEW_TYPE_BLUEPRINT,
        active: true,
      });
      leaf = newLeaf;
    }

    workspace.revealLeaf(leaf);
  }

  async loadSettings(): Promise<void> {
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
```

Key implementation decisions:

1. **`DEFAULT_SETTINGS` lives in `main.ts`**, not `types.ts`. The types file defines the interface shape; the default values are a runtime concern belonging to the plugin entry.

2. **`Object.assign({}, DEFAULT_SETTINGS, data)`** — shallow merge. This means if a user has saved settings and we add a new field in a future version, the new field gets its default. If `data` is `null` (first load), we get all defaults.

3. **`activateView()` reuses existing leaves** — prevents duplicate Blueprint tabs. Uses `workspace.getLeaf("tab")` to open in a new tab rather than splitting the current pane.

4. **`onunload()` is intentionally minimal** — Obsidian automatically cleans up registered views, commands, ribbon icons, and setting tabs when a plugin unloads. Future splits (renderer, scanner) may add disposal logic here.

5. **Ribbon icon is `"network"`** — this is a built-in Lucide icon in Obsidian (nodes connected by lines). Matches the graph/blueprint metaphor.

6. **Command ID `"open-vault-blueprint"`** — prefixed automatically by Obsidian with the plugin ID, so the full command becomes `vault-blueprint:open-vault-blueprint`.

## Acceptance Criteria

1. Plugin loads in Obsidian without console errors.
2. Ribbon icon (network icon) appears in the left sidebar.
3. Clicking the ribbon icon opens a new tab with the BlueprintView.
4. Clicking the ribbon icon again when the view is already open reveals the existing tab (does not create a duplicate).
5. Command palette contains "Vault Blueprint: Open Vault Blueprint".
6. Running the command opens/reveals the view identically to the ribbon icon.
7. Settings tab appears in Obsidian's settings under "Vault Blueprint".
8. Plugin survives disable/enable cycle without errors.
9. Plugin survives Obsidian restart — if the view was open, it re-opens correctly (Obsidian serializes view state).

## Test Approach

- **Manual in Obsidian**: Install plugin to a test vault, verify ribbon icon, command, settings tab.
- **Duplicate tab test**: Open view, click ribbon again — should reveal same tab, not create second.
- **Restart test**: Open view, restart Obsidian — view should reappear.
- **Console check**: Open developer tools, verify zero errors/warnings from the plugin on load.
- **Disable/enable**: Toggle the plugin off and on in settings — verify clean unload and reload.
- **Type safety**: `npx tsc --noEmit` passes — all imports resolve, all types match.
