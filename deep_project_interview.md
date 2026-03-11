# Deep Project Interview — Vault Blueprint Plugin

## Decision Log

### 1. Node Scope → Smart Defaults
- Auto-detect "important" notes: MOCs, config, templates, notes with 3+ backlinks
- Folders become groups
- Users can expand to see all files in a folder
- Avoids overwhelming graphs on large vaults (265+ notes in Aragorn's, could be 1000+ for others)

### 2. Renderer → Port Existing Engine
- Convert vanilla JS Canvas renderer to TypeScript modules
- We own every line, zero dependencies, full control
- Already has: zoom/pan, search, filtering, node-pin-wire model, groups, BFS path tracing, category legend

### 3. Layout → Hierarchical Tree
- Folder hierarchy drives layout: root folders as columns/rows, children nested within
- Groups auto-sized around folders
- Predictable, reflects vault structure directly
- Deterministic: same vault always produces same layout

### 4. MVP Scope → Phase 1 First
- Scanner + renderer + basic settings
- No export, no custom categories, no manual position saving in Phase 1
- Get a working plugin that shows the vault graph, ship fast, iterate

### 5. Wire Rules → Wikilinks as Process Flows
- Wikilinks are the primary connection signal
- **Critical user insight**: The blueprint is a PROCESS FLOW graph, not a static file map
- "If this, then that" — when you activate a command, which parts of the vault get engaged?
- Wikilinks in command files encode process flow: `command.md` containing `[[Session Log]]` means "this command writes to Session Log"
- Scanner treats wikilinks as directional flows, especially in commands/ folders
- The goal is to let users visually trace the chain of events through their vault

### 6. Caching → Cache + Smart Invalidation
- Save generated blueprint to plugin data folder
- Re-scan only on vault change events (create/delete/rename)
- Fast reopens, always fresh data

### 7. Plugin Identity → vault-blueprint
- ID: `vault-blueprint`
- Display name: "Vault Blueprint"
- Clean, descriptive, matches the project name

## Architecture Summary

The plugin has 4 major components:
1. **Plugin shell** — manifest, settings, view registration, ribbon icon, commands
2. **Vault scanner** — traverses vault via Obsidian API, builds blueprint JSON from files/links/frontmatter
3. **Canvas renderer** — ported from existing standalone engine, renders into Obsidian ItemView
4. **Data pipeline** — caching, invalidation, schema translation between scanner output and renderer input
