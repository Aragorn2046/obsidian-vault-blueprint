import type { Plugin } from "obsidian";
import type { BlueprintData, CachedData, VaultBlueprintSettings } from "./types";

/** Saved node positions — persists separately from scan cache */
export type SavedPositions = Record<string, { x: number; y: number }>;

export class BlueprintCache {
  constructor(private plugin: Plugin) {}

  async load(): Promise<CachedData | null> {
    const raw = await this.plugin.loadData();
    if (!raw?.blueprint || !raw?.scannedAt) return null;
    return {
      blueprint: raw.blueprint,
      scannedAt: raw.scannedAt,
      settingsHash: raw.settingsHash ?? "",
    };
  }

  async save(data: BlueprintData, settings: VaultBlueprintSettings): Promise<void> {
    const existing = (await this.plugin.loadData()) || {};
    await this.plugin.saveData({
      ...existing,
      blueprint: data,
      scannedAt: Date.now(),
      settingsHash: this.hashSettings(settings),
    });
  }

  isFresh(cached: CachedData, currentSettings: VaultBlueprintSettings): boolean {
    return cached.settingsHash === this.hashSettings(currentSettings);
  }

  // ─── Position Persistence ──────────────────────────────

  async loadPositions(): Promise<SavedPositions> {
    const raw = await this.plugin.loadData();
    return raw?.savedPositions ?? {};
  }

  async savePositions(positions: SavedPositions): Promise<void> {
    const existing = (await this.plugin.loadData()) || {};
    await this.plugin.saveData({
      ...existing,
      savedPositions: positions,
    });
  }

  async saveNodePosition(nodeId: string, x: number, y: number): Promise<void> {
    const positions = await this.loadPositions();
    positions[nodeId] = { x, y };
    await this.savePositions(positions);
  }

  async clearNodePosition(nodeId: string): Promise<void> {
    const positions = await this.loadPositions();
    delete positions[nodeId];
    await this.savePositions(positions);
  }

  async clearAllPositions(): Promise<void> {
    await this.savePositions({});
  }

  private hashSettings(settings: VaultBlueprintSettings): string {
    return JSON.stringify({
      excludePaths: settings.excludePaths,
      minBacklinks: settings.minBacklinks,
      categoryOverrides: settings.categoryOverrides,
      showFolderGroups: settings.showFolderGroups,
    });
  }
}
