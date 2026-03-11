# 01-plugin-shell — Spec

## Summary

Create the Obsidian plugin skeleton for Vault Blueprint: manifest, entry point, settings, custom view, build system, and GitHub repo. This is the scaffolding that the other splits plug into.

## Deliverables

### Files to Create

```
vault-blueprint-plugin/
├── manifest.json          # Plugin metadata for Obsidian
├── package.json           # Dependencies + build scripts
├── tsconfig.json          # TypeScript config (strict mode)
├── esbuild.config.mjs     # Bundler config (Obsidian standard)
├── .gitignore
├── LICENSE                # MIT
├── README.md
├── src/
│   ├── main.ts            # Plugin entry point
│   ├── settings.ts        # Settings tab UI
│   ├── view.ts            # BlueprintView (ItemView subclass)
│   └── types.ts           # Shared TypeScript interfaces
└── styles.css             # Base styles for the blueprint view
```

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

### main.ts — Plugin Entry Point

```typescript
export default class VaultBlueprintPlugin extends Plugin {
  settings: VaultBlueprintSettings;

  async onload() {
    await this.loadSettings();
    this.registerView(VIEW_TYPE_BLUEPRINT, (leaf) => new BlueprintView(leaf, this));
    this.addRibbonIcon('network', 'Open Vault Blueprint', () => this.activateView());
    this.addCommand({
      id: 'open-vault-blueprint',
      name: 'Open Vault Blueprint',
      callback: () => this.activateView(),
    });
    this.addSettingTab(new VaultBlueprintSettingTab(this.app, this));
  }

  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_BLUEPRINT)[0];
    if (!leaf) {
      leaf = workspace.getLeaf('tab');
      await leaf.setViewState({ type: VIEW_TYPE_BLUEPRINT, active: true });
    }
    workspace.revealLeaf(leaf);
  }
}
```

### view.ts — BlueprintView

```typescript
export class BlueprintView extends ItemView {
  private canvas: HTMLCanvasElement;
  private container: HTMLDivElement;

  getViewType(): string { return VIEW_TYPE_BLUEPRINT; }
  getDisplayText(): string { return 'Vault Blueprint'; }
  getIcon(): string { return 'network'; }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('vault-blueprint-container');

    this.container = contentEl.createDiv({ cls: 'blueprint-wrapper' });
    this.canvas = this.container.createEl('canvas');

    // Placeholder: renderer and scanner will be wired in 04-integration
  }

  async onClose() {
    this.contentEl.empty();
  }
}
```

### settings.ts — Settings Tab

Settings interface (Phase 1 MVP):

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `excludePaths` | string[] | `[".obsidian", "node_modules"]` | Folders to exclude from scan |
| `minBacklinks` | number | 3 | Minimum backlinks for a note to become a node |
| `showFolderGroups` | boolean | true | Show folders as group boxes |
| `categoryOverrides` | Record<string, string> | `{}` | Path pattern → category mapping |

Settings tab should render input fields for each setting using Obsidian's `Setting` API.

### styles.css

Base styles for the blueprint view:
- `.vault-blueprint-container` — full-height, overflow hidden
- `.blueprint-wrapper` — relative positioned, fills parent
- Canvas fills the wrapper
- Must respect Obsidian's CSS variables for theme compatibility:
  - `--background-primary` for canvas background
  - `--text-normal` for node text
  - `--interactive-accent` for highlights

### Build System

- `esbuild` as bundler (Obsidian ecosystem standard)
- `npm run build` → produces `main.js` + `styles.css`
- `npm run dev` → watch mode for development
- Output to root directory (Obsidian expects `main.js` at plugin root)

### GitHub Repo

- Repo: `Aragorn2046/vault-blueprint`
- License: MIT
- Description: "Obsidian plugin — interactive node-graph visualization of your vault's architecture"

## Dependencies

- `obsidian` (dev dependency — Obsidian API types)
- `@types/node` (dev dependency)
- `esbuild` (dev dependency)
- `typescript` (dev dependency)
- Zero runtime dependencies

## Acceptance Criteria

1. `npm run build` produces valid `main.js` and `styles.css`
2. Plugin loads in Obsidian without errors
3. Ribbon icon appears and opens the BlueprintView
4. Command palette shows "Open Vault Blueprint"
5. Settings tab renders with all MVP settings
6. BlueprintView shows an empty canvas (renderer not wired yet)
7. View survives Obsidian restart (re-opens correctly)
