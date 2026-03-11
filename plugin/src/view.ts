import { ItemView, Notice, TFile, WorkspaceLeaf, type SplitDirection } from "obsidian";
import { VIEW_TYPE_BLUEPRINT } from "./types";
import type { BlueprintData, OrganicForceSettings } from "./types";
import type VaultBlueprintPlugin from "./main";
import { BlueprintRenderer } from "./renderer/index";
import { VaultScanner } from "./scanner/index";
import { BlueprintCache, type SavedPositions } from "./cache";

export class BlueprintView extends ItemView {
  private plugin: VaultBlueprintPlugin;
  private wrapper: HTMLDivElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private toolbarEl: HTMLDivElement | null = null;
  private renderer: BlueprintRenderer | null = null;
  private themeObserver: MutationObserver | null = null;
  private rescanTimer: ReturnType<typeof setTimeout> | null = null;
  private positionSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private lastScanTime = 0;
  private savedPositions: SavedPositions = {};
  private currentData: BlueprintData | null = null;

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

    // DOM structure
    this.toolbarEl = contentEl.createDiv({ cls: "blueprint-toolbar" });
    this.wrapper = contentEl.createDiv({ cls: "blueprint-wrapper" });
    this.canvas = this.wrapper.createEl("canvas");
    this.canvas.addClass("blueprint-canvas");

    // Prevent scroll wheel from propagating to Obsidian's scroll container
    // This stops the whole view from scrolling when wheeling over overlay panels
    this.wrapper.addEventListener('wheel', (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false });

    // Loading state
    this.showLoading();

    try {
      // Load saved positions first
      const cache = new BlueprintCache(this.plugin);
      this.savedPositions = await cache.loadPositions();

      const data = await this.loadOrScan();

      if (data.nodes.length === 0) {
        this.showEmptyState();
        return;
      }

      // Apply saved positions to nodes
      this.applySavedPositions(data);
      this.currentData = data;

      // Initialize renderer
      this.renderer = new BlueprintRenderer({
        canvas: this.canvas,
        container: this.wrapper,
        data,
        theme: this.detectTheme(),
        viewMode: this.plugin.settings.viewMode,
        organicSizing: this.plugin.settings.organicSizing,
        organicForces: this.plugin.settings.organicForces,
        onNodeClick: (_nodeId: string, filePath?: string) =>
          this.navigateToFile(filePath),
        onNodeDragEnd: (nodeId: string, x: number, y: number) =>
          this.handleNodeDragEnd(nodeId, x, y),
        onContextMenuAction: (action: string, nodeId: string) =>
          this.handleContextMenuAction(action, nodeId),
        onLinkCreate: (sourceNodeId: string, targetNodeId: string) =>
          this.handleLinkCreate(sourceNodeId, targetNodeId),
        onForceSettingsChange: (forces) =>
          this.handleForceSettingsChange(forces),
        onColorChange: (catKey, color, dark) =>
          this.handleColorChange(catKey, color, dark),
        onNodePreview: (nodeId) => this.fetchNodePreview(nodeId),
        onSplitView: (nodeId) => this.openSplitView(nodeId),
        onLinkCreate2: (fromId, toId) => this.handleLinkCreate(fromId, toId),
        onAddCategory: (label, color) => this.handleAddCategory(label, color),
      });
      this.renderer.render();

      // Toolbar
      this.buildToolbar(data);

      // Event listeners
      this.registerVaultEvents();
      this.registerThemeListener();
    } catch (error) {
      console.error("[VaultBlueprint] Failed to initialize:", error);
      this.showError(
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }

  async onClose(): Promise<void> {
    if (this.rescanTimer) {
      clearTimeout(this.rescanTimer);
      this.rescanTimer = null;
    }

    if (this.positionSaveTimer) {
      clearTimeout(this.positionSaveTimer);
      this.positionSaveTimer = null;
    }

    if (this.forceSaveTimer) {
      clearTimeout(this.forceSaveTimer);
      this.forceSaveTimer = null;
    }

    if (this.colorSaveTimer) {
      clearTimeout(this.colorSaveTimer);
      this.colorSaveTimer = null;
    }

    if (this.renderer) {
      this.renderer.destroy();
      this.renderer = null;
    }

    if (this.themeObserver) {
      this.themeObserver.disconnect();
      this.themeObserver = null;
    }

    this.contentEl.empty();
    this.wrapper = null;
    this.canvas = null;
    this.toolbarEl = null;
  }

  // ─── Public API ──────────────────────────────────────────────

  refresh(): void {
    this.forceRescan();
  }

  forceRescan(): void {
    if (this.rescanTimer) {
      clearTimeout(this.rescanTimer);
      this.rescanTimer = null;
    }
    this.doRescan();
  }

  onSettingsChanged(): void {
    // Check if view mode changed — if so, switch directly
    if (this.renderer) {
      const currentMode = this.renderer.getViewMode();
      if (currentMode !== this.plugin.settings.viewMode) {
        this.renderer.setViewMode(
          this.plugin.settings.viewMode,
          this.plugin.settings.organicSizing,
        );
        if (this.currentData && this.toolbarEl) {
          this.buildToolbar(this.currentData);
        }
        return;
      }
    }
    this.scheduleRescan();
  }

  // ─── Position Persistence ──────────────────────────────────

  private applySavedPositions(data: BlueprintData): void {
    if (Object.keys(this.savedPositions).length === 0) return;

    let anyApplied = false;
    for (const node of data.nodes) {
      const saved = this.savedPositions[node.id];
      if (saved) {
        node.x = saved.x;
        node.y = saved.y;
        anyApplied = true;
      }
    }

    // If some nodes have saved positions, mark them so layout
    // knows to skip auto-layout (layout checks for non-zero x/y)
    if (anyApplied) {
      // Nodes without saved positions stay at 0,0 — layout would
      // skip if ANY node has positions. We need to place unsaved
      // nodes near their category group.
      // For now, just let the layout skip entirely when there are
      // saved positions. New nodes default to 0,0 and get placed
      // on the next reset.
    }
  }

  private handleNodeDragEnd(nodeId: string, x: number, y: number): void {
    this.savedPositions[nodeId] = { x, y };
    this.debouncedSavePositions();
  }

  private debouncedSavePositions(): void {
    if (this.positionSaveTimer) clearTimeout(this.positionSaveTimer);
    this.positionSaveTimer = setTimeout(async () => {
      const cache = new BlueprintCache(this.plugin);
      await cache.savePositions(this.savedPositions);
    }, 500);
  }

  private async resetAllPositions(): Promise<void> {
    this.savedPositions = {};
    const cache = new BlueprintCache(this.plugin);
    await cache.clearAllPositions();
    // Also expand any lasso-collapsed groups
    this.renderer?.expandAllLassoGroups();
    // Force rescan to re-run layout from scratch
    this.forceRescan();
    new Notice("Layout reset — positions cleared, groups expanded");
  }

  private async resetNodePosition(nodeId: string): Promise<void> {
    delete this.savedPositions[nodeId];
    const cache = new BlueprintCache(this.plugin);
    await cache.clearNodePosition(nodeId);
    new Notice("Node position reset");
    // A full rescan would re-layout. For now just notify.
    // The node will get auto-positioned on next rescan.
    this.forceRescan();
  }

  // ─── Force Settings Persistence ────────────────────────────

  private forceSaveTimer: ReturnType<typeof setTimeout> | null = null;

  private handleForceSettingsChange(forces: OrganicForceSettings): void {
    this.plugin.settings.organicForces = { ...forces };
    // Debounce save — sliders fire many events
    if (this.forceSaveTimer) clearTimeout(this.forceSaveTimer);
    this.forceSaveTimer = setTimeout(async () => {
      await this.plugin.saveSettings();
    }, 300);
  }

  // ─── Color Persistence ─────────────────────────────────────

  private colorSaveTimer: ReturnType<typeof setTimeout> | null = null;

  private handleColorChange(catKey: string, color: string, dark: string): void {
    if (!this.plugin.settings.categoryColors) {
      this.plugin.settings.categoryColors = {};
    }
    this.plugin.settings.categoryColors[catKey] = { color, dark };
    // Debounce save — color picker fires many events while dragging
    if (this.colorSaveTimer) clearTimeout(this.colorSaveTimer);
    this.colorSaveTimer = setTimeout(async () => {
      await this.plugin.saveSettings();
    }, 300);
  }

  // ─── Node Preview ───────────────────────────────────────────

  private async fetchNodePreview(nodeId: string): Promise<string | null> {
    const node = this.findNodeById(nodeId);
    if (!node?.path) return null;

    const file = this.app.vault.getAbstractFileByPath(node.path);
    if (!(file instanceof TFile)) return null;

    try {
      const content = await this.app.vault.cachedRead(file);
      // Strip YAML frontmatter
      let text = content;
      if (text.startsWith('---')) {
        const endIdx = text.indexOf('---', 3);
        if (endIdx !== -1) {
          text = text.slice(endIdx + 3).trimStart();
        }
      }
      // Strip markdown headings and formatting
      text = text.replace(/^#+\s+/gm, '');
      // Truncate to ~200 chars
      if (text.length > 200) {
        text = text.slice(0, 200).trimEnd() + '...';
      }
      return text || null;
    } catch {
      return null;
    }
  }

  // ─── View Mode Toggle ─────────────────────────────────────

  private async toggleViewMode(): Promise<void> {
    const newMode = this.plugin.settings.viewMode === 'schematic' ? 'organic' : 'schematic';
    this.plugin.settings.viewMode = newMode;
    await this.plugin.saveSettings();

    if (this.renderer) {
      // Clear saved positions when switching modes (layouts are incompatible)
      this.savedPositions = {};
      const cache = new BlueprintCache(this.plugin);
      await cache.clearAllPositions();

      this.renderer.setViewMode(newMode, this.plugin.settings.organicSizing, this.plugin.settings.organicForces);
    }

    // Rebuild toolbar to update button label
    if (this.currentData && this.toolbarEl) {
      this.buildToolbar(this.currentData);
    }

    new Notice(`Switched to ${newMode} view`);
  }

  // ─── Group Collapse/Expand ──────────────────────────────────

  private toggleAllGroups(): void {
    if (!this.renderer) return;
    const states = this.renderer.getGroupStates();
    const anyCollapsed = states.some(g => g.collapsed);
    // If any are collapsed, expand all. Otherwise collapse all.
    if (anyCollapsed) {
      this.renderer.setCollapsedGroups([]);
    } else {
      this.renderer.setCollapsedGroups(states.map(g => g.label));
    }
    // Rebuild toolbar to update button text
    if (this.currentData && this.toolbarEl) {
      this.buildToolbar(this.currentData);
    }
  }

  // ─── Link Creation (Wire-Drag) ──────────────────────────────

  private async handleLinkCreate(sourceNodeId: string, targetNodeId: string): Promise<void> {
    const sourceNode = this.findNodeById(sourceNodeId);
    const targetNode = this.findNodeById(targetNodeId);

    if (!sourceNode?.path || !targetNode?.path) {
      new Notice("Cannot create link — file path not found");
      return;
    }

    const sourceFile = this.app.vault.getAbstractFileByPath(sourceNode.path);
    if (!(sourceFile instanceof TFile)) {
      new Notice("Source file not found");
      return;
    }

    const targetBasename = targetNode.path.replace(/\.md$/, '').split('/').pop() ?? '';
    const linkText = `[[${targetBasename}]]`;

    // Check if link already exists in the file
    const content = await this.app.vault.read(sourceFile);
    if (content.includes(linkText)) {
      new Notice(`Link ${linkText} already exists`);
      return;
    }

    // Append link at the end of the file under a ## Links heading
    let newContent: string;
    if (content.includes('## Links')) {
      // Add to existing Links section
      newContent = content.replace(
        /## Links\n/,
        `## Links\n- ${linkText}\n`
      );
    } else if (content.includes('## Related Concepts')) {
      // Add to existing Related Concepts section
      newContent = content.replace(
        /## Related Concepts\n/,
        `## Related Concepts\n- ${linkText}\n`
      );
    } else {
      // Append new Links section
      newContent = content.trimEnd() + `\n\n## Links\n- ${linkText}\n`;
    }

    await this.app.vault.modify(sourceFile, newContent);
    new Notice(`Created link: ${sourceNode.title} → ${linkText}`);

    // Rescan to show the new wire
    this.scheduleRescan();
  }

  // ─── Context Menu Actions ──────────────────────────────────

  private handleContextMenuAction(action: string, nodeId: string): void {
    const node = this.renderer
      ? this.findNodeById(nodeId)
      : null;

    switch (action) {
      case 'open':
        if (node?.path) {
          this.app.workspace.openLinkText(node.path, "", false);
        }
        break;

      case 'open-new-pane':
        if (node?.path) {
          this.app.workspace.openLinkText(node.path, "", true);
        }
        break;

      case 'reveal': {
        if (!node?.path) break;
        const file = this.app.vault.getAbstractFileByPath(node.path);
        if (file instanceof TFile) {
          // Reveal in file explorer
          const fileExplorer = this.app.workspace.getLeavesOfType('file-explorer')[0];
          if (fileExplorer) {
            (fileExplorer.view as any).revealInFolder?.(file);
          }
        }
        break;
      }

      case 'copy-link': {
        if (!node?.path) break;
        const basename = node.path.replace(/\.md$/, '').split('/').pop() ?? '';
        navigator.clipboard.writeText(`[[${basename}]]`).then(() => {
          new Notice(`Copied [[${basename}]]`);
        });
        break;
      }

      case 'delete': {
        if (!node?.path) break;
        const file = this.app.vault.getAbstractFileByPath(node.path);
        if (file instanceof TFile) {
          // Obsidian's built-in confirm + trash
          this.app.vault.trash(file, true).then(() => {
            new Notice(`Moved "${node.title}" to trash`);
            this.forceRescan();
          });
        }
        break;
      }

      case 'reset-position':
        this.resetNodePosition(nodeId);
        break;

      default:
        // Handle set-category:<catId> actions
        if (action.startsWith('set-category:')) {
          const catId = action.slice('set-category:'.length);
          this.setCategoryOnNode(nodeId, catId);
        }
        break;
    }
  }

  /** Write category to a note's frontmatter `type` field */
  private async setCategoryOnNode(nodeId: string, categoryId: string): Promise<void> {
    const node = this.findNodeById(nodeId);
    if (!node?.path) return;

    const file = this.app.vault.getAbstractFileByPath(node.path);
    if (!(file instanceof TFile)) return;

    try {
      const content = await this.app.vault.read(file);

      let newContent: string;
      if (content.startsWith('---')) {
        const endIdx = content.indexOf('---', 3);
        if (endIdx !== -1) {
          const frontmatter = content.slice(3, endIdx);
          // Check if type field exists
          if (/^type\s*:/m.test(frontmatter)) {
            // Replace existing type field
            const updatedFm = frontmatter.replace(/^type\s*:.*$/m, `type: ${categoryId}`);
            newContent = '---' + updatedFm + content.slice(endIdx);
          } else {
            // Add type field to existing frontmatter
            newContent = '---\ntype: ' + categoryId + frontmatter + content.slice(endIdx);
          }
        } else {
          // Malformed frontmatter — add new one
          newContent = `---\ntype: ${categoryId}\n---\n` + content;
        }
      } else {
        // No frontmatter — add one
        newContent = `---\ntype: ${categoryId}\n---\n` + content;
      }

      await this.app.vault.modify(file, newContent);

      // Find category label for notice
      const catLabel = this.currentData?.categories[categoryId]?.label ?? categoryId;
      new Notice(`Set "${node.title}" → ${catLabel}`);

      // Rescan to reflect change
      this.scheduleRescan();
    } catch (e) {
      new Notice("Failed to set category: " + (e instanceof Error ? e.message : "unknown error"));
    }
  }

  private findNodeById(nodeId: string): { path?: string; title: string } | null {
    if (!this.currentData) return null;
    return this.currentData.nodes.find(n => n.id === nodeId) ?? null;
  }

  // ─── Data Loading ────────────────────────────────────────────

  private async loadOrScan(): Promise<BlueprintData> {
    const cache = new BlueprintCache(this.plugin);
    const cached = await cache.load();

    if (cached && cache.isFresh(cached, this.plugin.settings)) {
      this.lastScanTime = cached.scannedAt;
      return cached.blueprint;
    }

    const scanner = this.createScanner();
    const data = await scanner.scan();
    await cache.save(data, this.plugin.settings);
    this.lastScanTime = Date.now();
    return data;
  }

  private createScanner(): VaultScanner {
    return new VaultScanner({
      app: this.app,
      excludePaths: this.plugin.settings.excludePaths,
      minBacklinks: this.plugin.settings.minBacklinks,
      categoryOverrides: this.plugin.settings.categoryOverrides,
      categoryColors: this.plugin.settings.categoryColors ?? {},
      customCategories: this.plugin.settings.customCategories ?? [],
      showFolderGroups: this.plugin.settings.showFolderGroups,
    });
  }

  // ─── Rescan (debounced) ──────────────────────────────────────

  private scheduleRescan(): void {
    if (this.rescanTimer) clearTimeout(this.rescanTimer);
    this.rescanTimer = setTimeout(() => {
      this.doRescan();
    }, 1000);
  }

  private async doRescan(): Promise<void> {
    try {
      const scanner = this.createScanner();
      const data = await scanner.scan();
      const cache = new BlueprintCache(this.plugin);
      await cache.save(data, this.plugin.settings);
      this.lastScanTime = Date.now();

      // Re-apply saved positions to new scan data
      this.applySavedPositions(data);
      this.currentData = data;

      if (this.renderer) {
        this.renderer.setData(data);
      }
      if (this.toolbarEl) {
        this.buildToolbar(data);
      }
    } catch (error) {
      console.error("[VaultBlueprint] Rescan failed:", error);
    }
  }

  // ─── Vault Events ───────────────────────────────────────────

  private registerVaultEvents(): void {
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof TFile) this.scheduleRescan();
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file instanceof TFile) this.scheduleRescan();
      })
    );
    this.registerEvent(
      this.app.vault.on("rename", (file) => {
        if (file instanceof TFile) this.scheduleRescan();
      })
    );
  }

  // ─── Theme ──────────────────────────────────────────────────

  private detectTheme(): "dark" | "light" {
    return document.body.classList.contains("theme-dark") ? "dark" : "light";
  }

  private registerThemeListener(): void {
    this.themeObserver = new MutationObserver(() => {
      this.renderer?.setTheme(this.detectTheme());
    });
    this.themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });
  }

  // ─── Navigation ─────────────────────────────────────────────

  private navigateToFile(filePath?: string): void {
    if (!filePath) return;
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (file instanceof TFile) {
      this.app.workspace.openLinkText(filePath, "", false);
    }
  }

  // ─── Custom Categories ──────────────────────────────────────

  private async handleAddCategory(label: string, color: string): Promise<void> {
    const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!id) return;

    // Check if already exists
    const existing = this.plugin.settings.customCategories ?? [];
    if (existing.some(c => c.id === id)) {
      new Notice(`Category "${label}" already exists`);
      return;
    }

    // Generate darker variant
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    const dark = '#' + [r, g, b].map(c => Math.round(c * 0.7).toString(16).padStart(2, '0')).join('');

    const newCat = {
      id,
      label,
      color,
      dark,
      folderPatterns: [],
      tags: [`#${id}`],
    };

    if (!this.plugin.settings.customCategories) {
      this.plugin.settings.customCategories = [];
    }
    this.plugin.settings.customCategories.push(newCat);
    await this.plugin.saveSettings();

    new Notice(`Category "${label}" added — use type: ${id} in frontmatter or #${id} tag`);
    this.forceRescan();
  }

  // ─── Split View ─────────────────────────────────────────────

  private openSplitView(nodeId: string): void {
    const node = this.findNodeById(nodeId);
    if (!node?.path) return;
    const file = this.app.vault.getAbstractFileByPath(node.path);
    if (!(file instanceof TFile)) return;

    // Open the file in a new split pane to the right
    const newLeaf = this.app.workspace.getLeaf('split', 'vertical');
    newLeaf.openFile(file);
  }

  // ─── Toolbar ────────────────────────────────────────────────

  private buildToolbar(data: BlueprintData): void {
    if (!this.toolbarEl) return;
    this.toolbarEl.empty();

    // Refresh button
    const refreshBtn = this.toolbarEl.createEl("button", {
      cls: "blueprint-toolbar-btn",
      text: "Refresh",
    });
    refreshBtn.addEventListener("click", () => this.forceRescan());

    // Zoom to fit button
    const zoomBtn = this.toolbarEl.createEl("button", {
      cls: "blueprint-toolbar-btn",
      text: "Zoom to Fit",
    });
    zoomBtn.addEventListener("click", () => this.renderer?.zoomToFit());

    // View Mode toggle
    const currentMode = this.plugin.settings.viewMode;
    const modeBtn = this.toolbarEl.createEl("button", {
      cls: "blueprint-toolbar-btn" + (currentMode === 'organic' ? " blueprint-toolbar-btn-active" : ""),
      text: currentMode === 'organic' ? "Organic" : "Schematic",
    });
    modeBtn.addEventListener("click", () => this.toggleViewMode());

    // Controls toggle (organic mode only)
    if (currentMode === 'organic') {
      const ctrlBtn = this.toolbarEl.createEl("button", {
        cls: "blueprint-toolbar-btn",
        text: "Controls",
      });
      ctrlBtn.addEventListener("click", () => this.renderer?.toggleControls());
    }

    // Collapse/Expand Groups button (schematic only)
    if (currentMode === 'schematic') {
      const groupStates = this.renderer?.getGroupStates() ?? [];
      const anyCollapsed = groupStates.some(g => g.collapsed);
      const collapseBtn = this.toolbarEl.createEl("button", {
        cls: "blueprint-toolbar-btn",
        text: anyCollapsed ? "Expand Groups" : "Collapse Groups",
      });
      collapseBtn.addEventListener("click", () => this.toggleAllGroups());
    }

    // Filter toggle
    const filterCount = this.renderer?.getActiveFilterCount() ?? 0;
    const filterBtn = this.toolbarEl.createEl("button", {
      cls: "blueprint-toolbar-btn" + (filterCount > 0 ? " blueprint-toolbar-btn-active" : ""),
      text: filterCount > 0 ? `Filters (${filterCount})` : "Filters",
    });
    filterBtn.addEventListener("click", () => this.renderer?.toggleFilters());

    // Minimap toggle
    const minimapBtn = this.toolbarEl.createEl("button", {
      cls: "blueprint-toolbar-btn",
      text: "Minimap",
    });
    minimapBtn.addEventListener("click", () => this.renderer?.toggleMinimap());

    // ─── Tier 3 buttons ─────────────────────────────

    // Clusters toggle (organic mode)
    if (currentMode === 'organic') {
      const clustersActive = this.renderer?.isClustersActive() ?? false;
      const clusterBtn = this.toolbarEl.createEl("button", {
        cls: "blueprint-toolbar-btn" + (clustersActive ? " blueprint-toolbar-btn-active" : ""),
        text: "Clusters",
      });
      clusterBtn.title = "Detect and highlight community clusters";
      clusterBtn.addEventListener("click", () => {
        this.renderer?.toggleClusters();
        if (this.currentData && this.toolbarEl) this.buildToolbar(this.currentData);
      });
    }

    // Gap Analysis
    const gapBtn = this.toolbarEl.createEl("button", {
      cls: "blueprint-toolbar-btn",
      text: "Gaps",
    });
    gapBtn.title = "Find notes sharing tags but with no direct link";
    gapBtn.addEventListener("click", () => this.renderer?.toggleGapAnalysis());

    // Node Sizing dropdown (organic mode)
    if (currentMode === 'organic') {
      const currentMetric = this.renderer?.getImportanceMetric();
      const sizingBtn = this.toolbarEl.createEl("button", {
        cls: "blueprint-toolbar-btn" + (currentMetric ? " blueprint-toolbar-btn-active" : ""),
        text: currentMetric ? `Size: ${currentMetric}` : "Node Size",
      });
      sizingBtn.title = "Scale nodes by importance metric";
      sizingBtn.addEventListener("click", () => {
        // Cycle through metrics: null → connections → betweenness → pagerank → null
        const metrics: (import('./renderer/index').ImportanceMetric | null)[] = [
          null, 'connections', 'betweenness', 'pagerank',
        ];
        const current = this.renderer?.getImportanceMetric() ?? null;
        const idx = metrics.indexOf(current);
        const next = metrics[(idx + 1) % metrics.length];
        this.renderer?.setImportanceMetric(next);
        if (next) new Notice(`Node sizing: ${next}`);
        else new Notice('Node sizing: default');
        if (this.currentData && this.toolbarEl) this.buildToolbar(this.currentData);
      });
    }

    // Lasso Select (organic mode)
    if (currentMode === 'organic') {
      const lassoBtn = this.toolbarEl.createEl("button", {
        cls: "blueprint-toolbar-btn",
        text: "Lasso",
      });
      lassoBtn.title = "Draw a lasso to select and collapse nodes into a group";
      lassoBtn.addEventListener("click", () => this.renderer?.startLassoMode());
    }

    // Export PNG
    const exportBtn = this.toolbarEl.createEl("button", {
      cls: "blueprint-toolbar-btn",
      text: "Export",
    });
    exportBtn.title = "Export current view as PNG";
    exportBtn.addEventListener("click", async () => {
      try {
        await this.renderer?.exportPng();
        new Notice("Blueprint exported as PNG");
      } catch (e) {
        new Notice("Export failed: " + (e instanceof Error ? e.message : "unknown error"));
      }
    });

    // Uncollapse lasso groups (only show if there are lasso groups)
    if (this.renderer?.hasLassoGroups()) {
      const uncollapseBtn = this.toolbarEl.createEl("button", {
        cls: "blueprint-toolbar-btn",
        text: "Uncollapse All",
      });
      uncollapseBtn.title = "Expand all lasso-collapsed groups and restore hidden nodes";
      uncollapseBtn.addEventListener("click", () => {
        this.renderer?.expandAllLassoGroups();
        if (this.currentData && this.toolbarEl) this.buildToolbar(this.currentData);
        new Notice("All lasso groups expanded");
      });
    }

    // Reset Layout button
    const resetBtn = this.toolbarEl.createEl("button", {
      cls: "blueprint-toolbar-btn",
      text: "Reset Layout",
    });
    resetBtn.addEventListener("click", () => this.resetAllPositions());

    // Stats
    const nodeCount = data.nodes.length;
    const wireCount = data.wires.length;
    const pinnedCount = Object.keys(this.savedPositions).length;
    const timeStr = this.formatScanTime();

    const statsText = pinnedCount > 0
      ? `${nodeCount} nodes · ${wireCount} connections · ${pinnedCount} pinned · Scanned: ${timeStr}`
      : `${nodeCount} nodes · ${wireCount} connections · Scanned: ${timeStr}`;

    this.toolbarEl.createSpan({
      cls: "blueprint-toolbar-stats",
      text: statsText,
    });
  }

  private formatScanTime(): string {
    if (!this.lastScanTime) return "never";
    const diff = Date.now() - this.lastScanTime;
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    return new Date(this.lastScanTime).toLocaleTimeString();
  }

  // ─── UI States ──────────────────────────────────────────────

  private showLoading(): void {
    if (!this.wrapper) return;
    const el = this.wrapper.createDiv({ cls: "blueprint-state" });
    el.createSpan({ text: "Scanning vault..." });
  }

  private showEmptyState(): void {
    if (!this.wrapper) return;
    this.wrapper.empty();
    const el = this.wrapper.createDiv({ cls: "blueprint-state" });
    el.createSpan({
      text: "No notes found. Start adding notes to your vault.",
    });
  }

  private showError(message: string): void {
    if (!this.wrapper) return;
    this.wrapper.empty();
    const el = this.wrapper.createDiv({ cls: "blueprint-state blueprint-error" });
    el.createSpan({ text: `Scan failed: ${message}` });
    const retryBtn = el.createEl("button", {
      cls: "blueprint-toolbar-btn",
      text: "Retry",
    });
    retryBtn.addEventListener("click", () => {
      el.remove();
      this.showLoading();
      this.doRescan();
    });
  }
}
