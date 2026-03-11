import { ItemView, Notice, TFile, WorkspaceLeaf } from "obsidian";
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
    // Force rescan to re-run layout from scratch
    this.forceRescan();
    new Notice("Layout reset — positions cleared");
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
