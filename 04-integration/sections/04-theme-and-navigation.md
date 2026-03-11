# 04 — Theme Detection and File Navigation

## Summary

Two integration features: (1) detect Obsidian's dark/light theme and keep the renderer in sync via MutationObserver, and (2) navigate to vault files when the user clicks a node on the blueprint canvas.

## Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/view.ts` | **Modify** | Add `detectTheme()`, `registerThemeListener()`, `navigateToFile()` |

## Implementation Details

### Theme Detection

#### detectTheme()

```typescript
private detectTheme(): 'dark' | 'light' {
  return document.body.classList.contains('theme-dark') ? 'dark' : 'light';
}
```

Obsidian toggles the `theme-dark` / `theme-light` class on `document.body` when the user switches themes (Settings > Appearance > Base theme, or via command palette "Use dark/light mode"). This is the canonical way to detect theme — same approach used by other Obsidian plugins.

#### registerThemeListener()

```typescript
private registerThemeListener(): void {
  this.themeObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.attributeName === 'class') {
        const newTheme = this.detectTheme();
        this.renderer?.setTheme(newTheme);
        break;  // Only need to process once per batch
      }
    }
  });

  this.themeObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['class'],
  });
}
```

**Why MutationObserver instead of Obsidian API:**
- Obsidian doesn't expose a theme-change event in its public API.
- `MutationObserver` on body class is lightweight — `attributeFilter: ['class']` ensures it only fires when the class attribute changes, not on any body attribute mutation.
- This is the standard pattern used across the Obsidian plugin ecosystem.

**Why manual cleanup is needed:**
- `MutationObserver` is a DOM API, not an Obsidian `EventRef`. It can't be registered via `this.registerEvent()`.
- Must be explicitly disconnected in `onClose()`:

```typescript
// In onClose():
if (this.themeObserver) {
  this.themeObserver.disconnect();
  this.themeObserver = null;
}
```

**What `renderer.setTheme()` does (split 02):**
- Updates the theme module's color palette (background, text, wire colors).
- Triggers a full canvas repaint.
- Does NOT re-layout — only recolors.

#### Edge Cases

- **Custom CSS themes**: Third-party themes still toggle `theme-dark`/`theme-light` on body. The class check works regardless of which theme is installed.
- **System theme auto-switch**: Obsidian can follow the OS dark/light preference. When the OS switches, Obsidian updates the body class — the observer catches it.
- **Multiple rapid toggles**: The observer fires for each toggle. `setTheme()` is a repaint (< 16ms), so rapid toggles are fine.

### File Navigation

#### navigateToFile()

```typescript
private navigateToFile(filePath?: string): void {
  if (!filePath) return;

  const file = this.app.vault.getAbstractFileByPath(filePath);
  if (file instanceof TFile) {
    // Open in a new leaf (tab), or focus if already open
    this.app.workspace.openLinkText(filePath, '', false);
  } else {
    console.warn(`Vault Blueprint: File not found: ${filePath}`);
  }
}
```

**API choice — `openLinkText` vs alternatives:**

| Method | Behavior | Why/why not |
|--------|----------|-------------|
| `openLinkText(path, '', false)` | Opens file in new tab or focuses existing | Best for navigation — matches how Obsidian handles link clicks. Third arg `false` = don't create if missing. |
| `workspace.getLeaf('tab').openFile(file)` | Always opens new tab | Would create duplicate tabs. Not desirable. |
| `workspace.getLeaf(false).openFile(file)` | Opens in current tab | Would replace the blueprint view. Definitely not. |

**Wire-up to renderer:**

The callback is passed to the renderer during construction:

```typescript
this.renderer = new BlueprintRenderer({
  // ...
  onNodeClick: (nodeId: string, filePath?: string) => this.navigateToFile(filePath),
});
```

The renderer calls `onNodeClick` when:
1. User single-clicks a node (not during drag/pan).
2. The click passes hit-testing (point is within the node's bounding rect).
3. The node has a `path` field (set by the scanner from the source file's vault path).

**What `filePath` looks like:**
- Set by the scanner's node-builder from `file.path` (Obsidian API).
- Format: `folder/subfolder/Note Name.md` (vault-relative, forward slashes).
- Example: `Claude Knowledge Base/Session Log.md`.
- Canvas files: `folder/file.canvas`.

#### Edge Cases

- **Deleted file**: If a file was deleted after the last scan, `getAbstractFileByPath` returns null. The `instanceof TFile` check catches this. The blueprint will update on the next debounced re-scan.
- **Renamed file**: Same as deleted — the old path won't resolve. Re-scan updates it.
- **Canvas files**: `.canvas` files are `TFile` instances. `openLinkText` opens them in Obsidian's canvas editor.
- **No path field**: Scanner-generated nodes always have a `path`. But if a hand-crafted blueprint is loaded with nodes that lack paths, `filePath` will be undefined — the early return handles this.
- **Blueprint view losing focus**: Opening a file via `openLinkText` shifts focus to the new tab. The blueprint view remains open in its tab. User can click back to it.

### Integration Point: onNodeClick vs Selection

The renderer has two behaviors on node click:
1. **Select the node** (show info panel, highlight connections) — internal to renderer.
2. **Fire `onNodeClick` callback** — for navigation.

Both happen on the same click. The renderer handles selection internally, then calls the callback. This means clicking a node both highlights it on the blueprint AND opens the file. This is the desired behavior — the user sees the node's context in the blueprint while also navigating to the file.

If this proves annoying (users want to inspect nodes without navigating), a future enhancement could use double-click for navigation and single-click for selection only.

## Acceptance Criteria

- [ ] Blueprint renders in correct colors on first open (matches current Obsidian theme)
- [ ] Switching theme (dark to light or vice versa) updates blueprint colors immediately
- [ ] Theme switch does not cause layout changes (only recolors)
- [ ] Clicking a node opens the corresponding file in a new tab
- [ ] Clicking a node for an already-open file focuses that tab instead of creating a duplicate
- [ ] Clicking a node with no `path` field does nothing (no error)
- [ ] Clicking a node for a deleted file logs a warning but doesn't crash
- [ ] MutationObserver is properly disconnected when the view closes
- [ ] Theme detection works with third-party Obsidian themes
