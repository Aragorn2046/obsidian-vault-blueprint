# Project Manifest — Vault Blueprint Plugin

## Overview

Obsidian community plugin that auto-scans a vault and renders an interactive process-flow graph (blueprint) showing how notes, commands, and workflows connect.

## Split Structure

<!-- SPLIT_MANIFEST
01-plugin-shell
02-canvas-renderer
03-vault-scanner
04-integration
END_MANIFEST -->

## Execution Order

**Phase 1 (parallel):** Splits 01, 02, 03 can be built independently
- 01 creates the plugin structure and build pipeline
- 02 converts the renderer to importable TypeScript (no Obsidian dependency)
- 03 builds the scanner logic (uses Obsidian API types but can be unit tested separately)

**Phase 2 (sequential):** Split 04 integrates everything
- Wires scanner output into renderer
- Adds caching layer
- Registers vault change event listeners
- Final integration testing inside Obsidian

## Split Details

### 01-plugin-shell
Create the Obsidian plugin skeleton:
- `manifest.json` (id: vault-blueprint, name: Vault Blueprint)
- `main.ts` — onload/onunload, settings tab, ribbon icon, command palette
- `package.json` + `tsconfig.json` + `esbuild.config.mjs` (build system)
- `styles.css` — base styles for the blueprint view
- Settings interface: scan include/exclude paths, category overrides
- Custom `ItemView` subclass (`BlueprintView`) with canvas container
- GitHub repo + MIT license

### 02-canvas-renderer
Port the existing `index.html` Canvas engine to TypeScript:
- `renderer.ts` — main render loop, zoom/pan, hit testing
- `graph.ts` — node/wire/group data structures and layout calculations
- `layout.ts` — hierarchical tree layout algorithm (new: replaces manual positioning)
- `legend.ts` — category legend with All/None buttons
- `search.ts` — search bar with title/description/path matching
- `info-panel.ts` — node detail panel on selection
- `path-tracer.ts` — BFS path tracing between selected nodes
- `theme.ts` — color management, dark/light mode support
- All modules export clean APIs, no DOM globals, no `document.getElementById`
- Must accept a `<canvas>` element + container div as constructor params

### 03-vault-scanner
Build the vault analysis engine:
- `scanner.ts` — main scan orchestrator
- `node-builder.ts` — file → node conversion with smart defaults:
  - Detect "important" notes: MOCs (notes with 10+ outgoing links), config files, templates
  - Notes with 3+ backlinks become nodes
  - Folders become groups
  - Category auto-detection from: folder name, frontmatter `type`, tags
- `wire-builder.ts` — wikilink → wire conversion:
  - Wikilinks as directional flows (from linking note → to linked note)
  - Special handling for command files: links = process flow ("reads/writes")
  - Folder containment as implicit parent-child wires
- `categorizer.ts` — auto-assign categories based on heuristics:
  - Default categories: Config, Commands, Knowledge Base, Content, Automation, Vault Structure
  - Folder-based rules (e.g., `commands/` → Commands category)
  - Tag-based overrides
  - Frontmatter `type` field overrides
- Output: Blueprint JSON matching the existing schema (nodes, wires, groups, categories)

### 04-integration
Wire everything together inside Obsidian:
- `BlueprintView` creates canvas, instantiates renderer, feeds scanner data
- `cache.ts` — save/load blueprint JSON to plugin data folder
- `events.ts` — listen for vault changes (create/delete/rename), trigger re-scan
- Node click → `app.workspace.openLinkText()` navigation
- Ribbon icon → open/focus blueprint view
- Command palette: "Vault Blueprint: Open", "Vault Blueprint: Refresh"
- Settings apply live (category colors, include/exclude paths)
- Performance: debounce re-scan on rapid vault changes (500ms)

## Dependencies

```
01-plugin-shell ─┐
02-canvas-renderer ─┤── 04-integration
03-vault-scanner ─┘
```

## Tech Stack

- TypeScript (strict mode)
- Obsidian API (`obsidian` package)
- esbuild (bundler — Obsidian standard)
- No runtime dependencies beyond Obsidian itself
- HTML5 Canvas API for rendering

## Success Criteria

1. Install plugin → click ribbon icon → see vault graph immediately (zero config)
2. Nodes represent important vault files, wires show process flows
3. Click a node → navigate to that file
4. Search works across node titles and descriptions
5. Category filter toggles node visibility
6. View survives Obsidian restarts (cached data loads instantly)
7. Vault changes trigger automatic re-scan
