# Vault Blueprint Plugin — Feature Plan

## Current State (v0.3)
- Canvas renderer with nodes, pins, wires, groups
- Vault scanner: wikilinks + semantic path references
- Click to highlight, Ctrl+click to open, Shift+click for path trace
- Category-based grouping with shelf-pack layout
- Search, legend, info panel, stats bar
- Dark/light theme, zoom/pan, node drag
- Cache with settings-hash invalidation
- Auto-rescan on vault changes (debounced)
- **Persistent pinned layout** — node positions save on drag, survive rescans
- **Right-click context menu** — Open, Open New Pane, Reveal, Copy Link, Backlinks, Reset Position, Delete
- **Wire-drag link creation** — drag from output pin to node to create [[wikilink]]
- **Organic view mode** — circular nodes sized by connections, force-directed layout, toggle via toolbar/settings

---

## TIER 1 — Game Changers

### 1.1 Wire-Drag Link Creation
**Goal:** Drag a wire from one node's output pin to another node's input pin to create a `[[wikilink]]` in the source file's markdown.

**Implementation:**
- Add drag state tracking in `interaction.ts`: when mousedown on a pin circle (not node body), enter "wire-drawing" mode
- Render a temporary bezier curve from the source pin to the mouse cursor during drag
- On mouseup over a target pin/node: insert `[[target-note]]` at the end of the source file via `app.vault.modify()`
- Pin hit-testing: extend `getNodeAt` to also return which pin was hit (check pin circle positions)
- Visual feedback: highlight valid drop targets (pins glow), show invalid cursor when over empty space
- Undo support: store the modification so Obsidian's undo works
- **Edge case:** If the link already exists, show a brief toast "Link already exists" and don't duplicate
- **Config option:** Where to insert the link — end of file (default), under a `## Links` heading, or in YAML frontmatter `links:` array

**Files to modify:**
- `renderer/interaction.ts` — pin hit testing, wire-draw mode, drag rendering
- `renderer/canvas.ts` — draw temporary wire during drag, pin hover highlight
- `renderer/index.ts` — handle wire creation callback, call back to view
- `view.ts` — new method `createLink(sourcePath, targetPath)` using `app.vault.modify()`
- `types.ts` — add `onLinkCreate` callback to renderer options

**Estimated scope:** Medium-large. Core interaction change.

---

### 1.2 Persistent Pinned Layout
**Goal:** Save node positions so the graph stays stable across reloads. Users can manually arrange nodes and the layout persists.

**Implementation:**
- After layout runs or after user drags a node, save positions to plugin data
- Store as `Record<nodeId, {x, y}>` in a `positions` key in `data.json`
- On load: if saved positions exist for a node, use them instead of computed layout
- Add a "Reset Layout" button to toolbar that clears saved positions and re-runs layout
- Node drag in `interaction.ts` already moves nodes — add a `onNodeDragEnd` callback that triggers position save
- Debounce saves (500ms) so rapid dragging doesn't spam disk
- **Cache interaction:** Positions are separate from the blueprint cache. Positions persist even when scan data refreshes.
- **New nodes:** If a new node has no saved position, layout engine places it near its category group

**Files to modify:**
- `view.ts` — load/save positions, pass to renderer, handle drag-end callback
- `renderer/index.ts` — apply saved positions after layout, expose `onNodeDragEnd` callback
- `renderer/interaction.ts` — fire `onNodeDragEnd` on mouseup after drag
- `cache.ts` — separate positions storage from blueprint cache

**Estimated scope:** Medium. Mostly plumbing.

---

### 1.3 Typed/Colored Wires
**Goal:** Different wire colors and styles for different relationship types (wikilink, tag co-occurrence, YAML property, embed, semantic reference).

**Implementation:**
- Extend `WireDef` with a `type` field: `'link' | 'backlink' | 'tag' | 'embed' | 'semantic' | 'property'`
- In `wire-builder.ts`: tag each wire with `type: 'link'`
- In `semantic-wires.ts`: tag each wire with `type: 'semantic'`
- New scanner pass: detect `![[embeds]]` and create wires with `type: 'embed'`
- New scanner pass: detect shared tags between nodes and create wires with `type: 'tag'` (configurable threshold — e.g., 2+ shared tags)
- New scanner pass: detect YAML frontmatter references (e.g., `related: [[note]]`) and create wires with `type: 'property'`
- In `canvas.ts` `drawWire`: use wire type to determine color and dash pattern
  - `link`: category color, solid
  - `semantic`: category color, dashed
  - `embed`: white/bright, dotted
  - `tag`: muted gray, thin solid
  - `property`: purple, solid
- Legend extension: show wire type toggles (show/hide each type)
- Wire tooltip: show the relationship type on hover

**Files to modify:**
- `types.ts` — add `type` field to `WireDef`
- `scanner/wire-builder.ts` — tag wires as `'link'`
- `scanner/semantic-wires.ts` — tag wires as `'semantic'`
- New: `scanner/embed-wires.ts` — detect embeds
- New: `scanner/tag-wires.ts` — detect shared tags
- New: `scanner/property-wires.ts` — detect YAML references
- `renderer/canvas.ts` — wire color/style by type
- `renderer/legend.ts` — wire type toggles
- `scanner/index.ts` — integrate new wire passes

**Estimated scope:** Large. Multiple new scanner modules + rendering changes.

---

### 1.4 Collapsible Groups
**Goal:** Click a group header to collapse all its nodes into a single summary node. Expand to restore.

**Implementation:**
- Each `GroupDef` gets a `collapsed: boolean` state (default false)
- When collapsed: hide all nodes in the group, replace with a single "summary node" showing group label + node count
- Wires that connected to collapsed nodes re-route to the summary node
- Click the summary node (or a expand icon) to restore
- Store collapsed state in persistent layout data
- Visual: collapsed group is a smaller rounded rect with category color, label, and count badge
- **Wire rerouting:** Build a temporary wire map: for each collapsed group, collect all external wires, remap source/target to the summary node, deduplicate

**Files to modify:**
- `types.ts` — add `collapsed` to `GroupDef`
- `renderer/canvas.ts` — draw collapsed group variant, skip drawing hidden nodes
- `renderer/index.ts` — manage collapsed state, wire remapping, group click handler
- `renderer/interaction.ts` — group header hit testing (click on group label area)
- `view.ts` — persist collapsed state

**Estimated scope:** Large. Significant rendering and state management.

---

### 1.5 Right-Click Context Menu
**Goal:** Right-click a node to get: Open, Open in New Pane, Rename, Delete, Show Backlinks, Copy Link, Create Linked Note.

**Implementation:**
- Listen for `contextmenu` event on canvas in `interaction.ts`
- Hit-test to find which node was right-clicked
- Create a floating DOM menu (not canvas-rendered — DOM is better for menus)
- Menu items with Obsidian API calls:
  - "Open Note" → `app.workspace.openLinkText(path, "")`
  - "Open in New Pane" → `app.workspace.openLinkText(path, "", true)`
  - "Reveal in File Explorer" → `app.workspace.getLeaf().openFile(file)` with reveal
  - "Copy Wiki Link" → `navigator.clipboard.writeText("[[" + basename + "]]")`
  - "Show Backlinks" → select node + filter info panel to incoming only
  - "Delete Note" → confirm dialog + `app.vault.delete(file)`
  - "Create Linked Note" → prompt for name, create file, insert `[[link]]` in both
- Close menu on click-away, escape, or scroll
- Style menu to match Obsidian's native context menus (use CSS vars)

**Files to modify:**
- `renderer/interaction.ts` — contextmenu event listener, pass to callback
- New: `renderer/context-menu.ts` — DOM-based menu component
- `renderer/index.ts` — wire up context menu callback
- `view.ts` — implement Obsidian API actions for each menu item
- `styles.css` — context menu styling

**Estimated scope:** Medium. Mostly new DOM component + Obsidian API calls.

---

## TIER 2 — High Value

### 2.1 Node Preview on Hover
**Goal:** Show a tooltip with the first ~200 chars of note content when hovering a node.

**Implementation:**
- On node hover (with 300ms delay to avoid flicker): read first 200 chars via `app.vault.cachedRead()`
- Strip YAML frontmatter, markdown formatting
- Show in a floating DOM tooltip positioned near the node
- Cache previews in memory (Map<nodeId, string>) to avoid repeated reads
- Hide on mouse leave or when hovering a different node

**Files to modify:**
- New: `renderer/preview-tooltip.ts` — tooltip DOM component
- `renderer/index.ts` — hover delay logic, content fetching
- `view.ts` — provide content reading method
- `styles.css` — tooltip styling

**Estimated scope:** Small-medium.

---

### 2.2 Semantic Zoom (Level of Detail)
**Goal:** Show different detail levels based on zoom:
- Far out (zoom < 0.3): group boxes only, no individual nodes
- Medium (0.3-0.7): node titles visible, no pins
- Close (> 0.7): full detail with pins and wire labels

**Implementation:**
- In `drawNode`: check `vt.zoom` and skip pin/badge drawing at low zoom
- In `renderFrameFull`: skip individual nodes at very low zoom, draw group summaries instead
- Smooth transitions: fade pins in/out based on zoom range
- At very low zoom: draw group labels larger, show node count per group

**Files to modify:**
- `renderer/canvas.ts` — conditional drawing based on zoom level
- `renderer/index.ts` — zoom level thresholds (configurable)

**Estimated scope:** Small-medium. Mostly conditional rendering.

---

### 2.3 Minimap
**Goal:** Small overview panel in corner showing full graph with viewport rectangle.

**Implementation:**
- Render a scaled-down version of the graph to a separate small canvas (180x120)
- Draw viewport rectangle showing current visible area
- Click/drag on minimap to pan the main view
- Update minimap on every frame (or debounced)
- Toggle visibility via toolbar button

**Files to modify:**
- New: `renderer/minimap.ts` — minimap canvas, viewport overlay, click-to-pan
- `renderer/index.ts` — create minimap, sync with main view
- `styles.css` — minimap container positioning

**Estimated scope:** Medium.

---

### 2.4 Multiple Layout Algorithms
**Goal:** Let users choose between layout styles: Grid (current), Hierarchical/Tree, Force-Directed, Radial.

**Implementation:**
- Extract current layout as `gridLayout()` in layout.ts
- Add `hierarchicalLayout()`: topological sort by link direction, layer assignment, crossing reduction
- Add `forceDirectedLayout()`: proper rectangle-aware force simulation (unlike the failed attempt — use node dimensions for repulsion)
- Add `radialLayout()`: most-connected node at center, layers radiating outward
- Settings dropdown to pick layout algorithm
- "Reset Layout" re-runs the selected algorithm
- Each algorithm respects category grouping

**Files to modify:**
- `renderer/layout.ts` — refactor into pluggable layout functions
- New: `renderer/layouts/hierarchical.ts`
- New: `renderer/layouts/force-directed.ts`
- New: `renderer/layouts/radial.ts`
- `settings.ts` — layout algorithm dropdown
- `types.ts` — add `layoutAlgorithm` to settings

**Estimated scope:** Large. Each layout algorithm is significant work.

---

### 2.5 Dataview/Property Filtering
**Goal:** Filter visible nodes by YAML properties, tags, or custom queries.

**Implementation:**
- Filter panel in UI: dropdowns for common properties (tags, type, status)
- Text input for property queries: `status = "draft"`, `tags contains #concept`
- Apply filters by toggling node visibility (similar to category toggles)
- If Dataview plugin is installed, allow DQL queries to select nodes
- Show active filter count in toolbar

**Files to modify:**
- New: `renderer/filter-panel.ts` — filter UI
- `renderer/index.ts` — apply filters to node visibility
- `scanner/file-collector.ts` — ensure frontmatter properties are preserved
- `types.ts` — add property data to NodeDef
- `styles.css` — filter panel styling

**Estimated scope:** Medium-large. UI + query parsing.

---

## TIER 3 — Polish & Delight

### 3.1 Cluster Detection
- Use modularity-based community detection on the link graph
- Auto-color clusters, optionally auto-group them
- Show "bridge nodes" connecting clusters
- Scope: Medium

### 3.2 Gap Analysis
- Find disconnected components that share tags but no links
- Highlight structural holes (high betweenness centrality nodes)
- Suggest potential links
- Scope: Medium

### 3.3 Node Sizing by Importance
- Scale node width/height by: link count, backlink count, word count, or centrality
- Settings toggle for sizing metric
- Scope: Small

### 3.4 SVG/PNG Export
- Render current view to an off-screen canvas at high DPI
- Export as PNG via `canvas.toBlob()`
- SVG export: re-render using SVG elements instead of canvas
- Scope: Medium

### 3.5 Sub-Graph Collapse
- Shift+drag to lasso-select multiple nodes
- "Collapse Selection" action creates a macro node
- Macro node shows aggregate pin count and external connections
- Expand to restore
- Scope: Large

### 3.6 Split View (Graph + Editor)
- Open graph in left pane, linked editor in right pane
- Click node → editor shows that note
- Editor changes → graph highlights active note
- Use Obsidian's workspace split API
- Scope: Medium

---

## Implementation Order

| Phase | Features | Est. Sessions |
|-------|----------|---------------|
| Phase 1 | ~~1.2 Persistent Layout + 1.5 Context Menu~~ | ✅ Done |
| Phase 2 | ~~1.1 Wire-Drag Link Creation~~ | ✅ Done |
| Phase 3 | ~~1.3 Typed/Colored Wires + Organic View Mode~~ | ✅ Done |
| Phase 4 | ~~1.4 Collapsible Groups~~ | ✅ Done |
| Phase 5 | ~~2.1 Node Preview + 2.2 Semantic Zoom~~ | ✅ Done |
| Phase 6 | ~~2.3 Minimap~~ | ✅ Done |
| Phase 7 | 2.4 Multiple Layouts | Deferred (organic/schematic covers main use) |
| Phase 8 | 2.5 Dataview Filtering | 1-2 |
| Phase 9 | Tier 3 features (as desired) | 1 each |

**Total estimated: 10-16 sessions for full feature set.**

---

## Technical Notes

- All rendering stays on HTML5 Canvas (no React Flow migration needed — our renderer is already capable)
- New DOM overlays (menus, tooltips, filters) use Obsidian's CSS variables for native look
- Scanner passes are modular — each wire type is a separate file
- Positions/collapsed state stored separately from scan cache so they survive rescans
- Performance target: smooth 60fps with 500+ nodes, acceptable at 2000+
