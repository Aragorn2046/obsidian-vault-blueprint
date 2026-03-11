# Obsidian Vault Blueprint Plugin — Requirements

## Overview

Build a community plugin for Obsidian that automatically scans a user's vault and generates an interactive node-graph visualization (blueprint) of the vault's complete architecture.

## Goals

1. **Auto-scan**: Scan the vault's folder structure, note types, wikilinks, tags, and YAML frontmatter to auto-generate nodes and wires representing the vault's architecture
2. **Interactive visualization**: Render an HTML5 Canvas-based interactive node-graph inside an Obsidian view — zoom, pan, search, filter by category, click to navigate
3. **Customizable**: Allow users to customize categories, colors, grouping rules, and layout
4. **Community plugin**: Package as a standard Obsidian community plugin that anyone can install from the community plugin browser

## Existing Assets

The standalone rendering engine already exists at `~/projects/obsidian-vault-blueprint/index.html`. It handles:
- HTML5 Canvas rendering of node-pin-wire graphs
- Category-based coloring with legend (Select All / None buttons)
- Search across titles, descriptions, and file paths
- Zoom/pan with mouse wheel and drag
- Node selection with info panel
- BFS path tracing between selected nodes
- Stats bar showing node/wire/category counts
- JSON-driven data architecture (loads from `blueprint.json` or `window.BLUEPRINT_DATA`)
- Groups (comment boxes) for visual organization
- Responsive dark theme

## What Needs To Be Built

### 1. Plugin Wrapper
- `manifest.json` (plugin ID, name, version, min Obsidian version)
- `main.ts` — plugin entry point (onload/onunload, settings tab, ribbon icon, command registration)
- Settings tab UI for configuring scan rules, categories, colors, layout preferences
- Ribbon icon to open the blueprint view
- Command palette entry: "Open Vault Blueprint"

### 2. Vault Scanner (TypeScript, Obsidian API)
- Traverse `app.vault.getFiles()` and `app.vault.getAllFolders()`
- Read YAML frontmatter via `app.metadataCache`
- Detect note types from: folder location, frontmatter `type` field, tags, naming conventions
- Extract wikilinks (`[[...]]`) from `app.metadataCache.getFileCache()`
- Build node objects from files/folders with auto-categorization
- Build wire objects from wikilinks and folder containment
- Auto-generate groups from top-level folders or frontmatter categories
- Configurable rules: which folders to include/exclude, how to categorize, custom pin definitions

### 3. Renderer Adaptation
- Port the existing Canvas rendering engine from standalone HTML to work inside an Obsidian `ItemView`
- The renderer currently lives in a single HTML file with inline CSS and JS
- It needs to be refactored into TypeScript modules that can be imported
- Must render into a container `<canvas>` element provided by the Obsidian view
- Must integrate with Obsidian's theming (respect light/dark mode)
- Node click should navigate to the actual file in the vault (`app.workspace.openLinkText()`)
- Search should work with Obsidian's existing search patterns

### 4. Data Pipeline
- Scanner output → Blueprint JSON schema (same format as existing `blueprint.json`)
- Cache the generated blueprint to avoid re-scanning on every open
- Invalidation: re-scan when vault changes (file create/delete/rename) via `app.vault.on('create'|'delete'|'rename')`
- Export: allow users to export their blueprint as JSON or standalone HTML

## Constraints

- Must work with Obsidian API (no direct filesystem access — use `app.vault` and `app.metadataCache`)
- Must follow Obsidian community plugin guidelines for submission
- No external dependencies that require network access at runtime
- Must handle large vaults (1000+ notes) without hanging the UI — use incremental rendering or web workers
- Must respect `.obsidian/` and other hidden folders (exclude from scan)
- TypeScript required (Obsidian plugin standard)
- Must work on desktop (Electron) — mobile support is nice-to-have but not required

## User Stories

1. **First-time user**: Install plugin → click ribbon icon → see their vault visualized as a node graph immediately (zero config)
2. **Power user**: Open settings → customize categories (e.g., "all notes in `Concepts/` are category 'concept' with color yellow") → re-scan → see updated visualization
3. **Navigator**: Click any node → jump to that file in the vault → use path tracing to see how two notes are connected
4. **Exporter**: Generate a standalone HTML blueprint to share with others (no Obsidian needed to view)

## Technical Reference

- Obsidian Plugin API: https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin
- Existing renderer: `~/projects/obsidian-vault-blueprint/index.html` (single HTML file, ~26K tokens)
- Existing data schema: `~/projects/obsidian-vault-blueprint/demo-blueprint.json`
- Target: Obsidian community plugin registry (https://obsidian.md/plugins)
