# 04 — View and Styles

## Summary

Create `src/view.ts` (the `BlueprintView` class extending Obsidian's `ItemView`) and `styles.css` (base layout styles). The view sets up the DOM structure: a full-height container with a canvas element. The canvas is the rendering target for the blueprint graph (wired in a later split). For now it's an empty canvas with correct sizing.

## Files to Create

| File | Purpose |
|------|---------|
| `src/view.ts` | BlueprintView — custom Obsidian view with canvas |
| `styles.css` | Layout styles for the blueprint container and canvas |

## Implementation Details

### src/view.ts

```typescript
import { ItemView, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_BLUEPRINT } from "./types";
import type VaultBlueprintPlugin from "./main";

export class BlueprintView extends ItemView {
  private plugin: VaultBlueprintPlugin;
  private wrapper: HTMLDivElement | null = null;
  private canvas: HTMLCanvasElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: VaultBlueprintPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_BLUEPRINT;
  }

  getDisplayText(): string {
    return "Vault Blueprint";
  }

  getIcon(): string {
    return "network";
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("vault-blueprint-container");

    this.wrapper = contentEl.createDiv({ cls: "blueprint-wrapper" });
    this.canvas = this.wrapper.createEl("canvas");
    this.canvas.addClass("blueprint-canvas");

    // Size canvas to fill container
    this.resizeCanvas();

    // Re-register on container resize (Obsidian pane resizing)
    this.registerEvent(
      this.app.workspace.on("resize", () => {
        this.resizeCanvas();
      })
    );
  }

  async onClose(): Promise<void> {
    // Remove DOM content — Obsidian calls this on view close
    this.contentEl.empty();
    this.wrapper = null;
    this.canvas = null;
  }

  /**
   * Resize the canvas to match its container's pixel dimensions.
   * Accounts for devicePixelRatio for crisp rendering on HiDPI displays.
   */
  private resizeCanvas(): void {
    if (!this.wrapper || !this.canvas) return;

    const rect = this.wrapper.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // Set the canvas drawing buffer size (actual pixels)
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;

    // Set CSS display size (logical pixels)
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;

    // Scale the context so drawing operations use logical coordinates
    const ctx = this.canvas.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
    }

    // Future: trigger re-render here when renderer is wired
  }

  /** Expose canvas for renderer integration (split 04) */
  getCanvas(): HTMLCanvasElement | null {
    return this.canvas;
  }

  /** Expose plugin for scanner integration (split 04) */
  getPlugin(): VaultBlueprintPlugin {
    return this.plugin;
  }
}
```

### Design Decisions

1. **`plugin` reference stored** — The view needs access to settings (e.g., `excludePaths` affects what the scanner shows). Passed via constructor, exposed via getter for later splits.

2. **Canvas resize with `devicePixelRatio`** — Critical for crisp rendering on Retina/HiDPI displays. The canvas drawing buffer is sized at `width * dpr` but displayed at CSS `width`. The 2D context is pre-scaled so drawing code can use logical (CSS) pixels.

3. **Resize listener via `this.registerEvent()`** — Uses Obsidian's event system so the listener is automatically cleaned up on view close. Handles pane resizing, sidebar toggle, window resize.

4. **Nullable `wrapper` and `canvas`** — Set to `null` in `onClose()` to prevent stale references. All methods that access them check for null first.

5. **`getCanvas()` and `getPlugin()` getters** — Clean API surface for the renderer and scanner splits to hook into. Avoids making internal fields public.

6. **`contentEl.empty()` on open** — Clears any previous content (e.g., if Obsidian recreates the view from serialized state).

### styles.css

```css
/* Vault Blueprint — Base Layout */

.vault-blueprint-container {
  height: 100%;
  overflow: hidden;
  background-color: var(--background-primary);
}

.blueprint-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
}

.blueprint-canvas {
  display: block;
  width: 100%;
  height: 100%;
  /* Remove default canvas border/padding */
  border: none;
  padding: 0;
  margin: 0;
}

/*
 * Future: node, wire, and group styles will be added by the renderer split.
 * Text colors should use:
 *   --text-normal       (node labels)
 *   --text-muted        (secondary info)
 *   --interactive-accent (highlights, selected nodes)
 *   --background-secondary (group backgrounds)
 */
```

### CSS Design Decisions

1. **`var(--background-primary)`** — Matches the editor background in any Obsidian theme (light or dark). The canvas will draw on top of this.

2. **`overflow: hidden`** — The canvas handles its own pan/zoom; we don't want browser scrollbars.

3. **`display: block` on canvas** — Removes the default inline layout gap below the canvas element.

4. **No fixed dimensions** — Everything uses `100%` / `height: 100%` to fill whatever pane size Obsidian gives us. The JS resize handler sets actual pixel dimensions.

5. **Obsidian CSS variable reference** (for future use):
   - `--background-primary` — main background
   - `--background-secondary` — slightly offset (for group boxes)
   - `--text-normal` — primary text color
   - `--text-muted` — secondary text
   - `--interactive-accent` — Obsidian's accent color (for selection, highlights)

## Acceptance Criteria

1. Opening the Blueprint view shows a full-height panel with no scrollbars.
2. The canvas fills the entire view area (no gaps, no overflow).
3. Resizing the Obsidian pane (drag divider, toggle sidebar) correctly resizes the canvas.
4. The canvas background matches the current Obsidian theme (light/dark).
5. Switching Obsidian themes updates the background color without reload.
6. No console errors on open, close, resize, or theme switch.
7. `getCanvas()` returns the canvas element (not null) when the view is open.
8. `getCanvas()` returns null after the view is closed.
9. DevicePixelRatio is respected — on a 2x display, `canvas.width` is 2x the CSS width.

## Test Approach

- **Visual test**: Open the view in Obsidian, verify canvas fills the pane. Resize pane, verify canvas follows.
- **HiDPI test**: On a Retina display (or with Chrome DevTools device emulation), verify canvas is crisp (not blurry).
- **Theme test**: Switch between default light and dark themes — background should change.
- **Open/close cycle**: Open view, close tab, open again — no errors, no stale state.
- **Multiple panes**: Open Blueprint in two panes (if possible) — each should have its own canvas and resize independently.
- **Inspector check**: In DevTools, verify `.vault-blueprint-container` has `height: 100%` and `overflow: hidden`. Verify canvas `width`/`height` attributes match container dimensions times `devicePixelRatio`.
- **Type check**: `npx tsc --noEmit` passes.
