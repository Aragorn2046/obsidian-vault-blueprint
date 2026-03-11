import type { BlueprintData } from "../types";
import type { ScannerOptions } from "./types";
import { collectFiles } from "./file-collector";
import { buildNodes } from "./node-builder";
import { buildWires, resolveWirePins } from "./wire-builder";
import { buildSemanticWires } from "./semantic-wires";
import { buildEmbedWires } from "./embed-wires";
import { buildTagWires } from "./tag-wires";
import { categorizeNodes } from "./categorizer";
import { buildGroups } from "./group-builder";

export type { ScannerOptions } from "./types";

export class VaultScanner {
  private options: ScannerOptions;

  constructor(options: ScannerOptions) {
    this.options = {
      ...options,
      excludePaths: options.excludePaths ?? [".obsidian"],
      minBacklinks: options.minBacklinks ?? 3,
      categoryOverrides: options.categoryOverrides ?? {},
      categoryColors: options.categoryColors ?? {},
      customCategories: options.customCategories ?? [],
      showFolderGroups: options.showFolderGroups ?? true,
    };
  }

  async scan(): Promise<BlueprintData> {
    return this.executePipeline();
  }

  async rescan(_changedPaths: string[]): Promise<BlueprintData> {
    return this.scan();
  }

  private async executePipeline(): Promise<BlueprintData> {
    try {
      const app = this.options.app;

      // Stage 1: Collect files
      const collected = collectFiles(app, this.options);

      // Stage 2: Build nodes (smart selection + pin generation)
      const nodeResult = buildNodes(collected.files, this.options);

      // Stage 3: Build wires from wikilinks (resolvedLinks)
      const wireResult = buildWires(
        collected.files,
        nodeResult.includedPaths,
        nodeResult.nodeIdMap,
        app
      );

      // Stage 3b: Build semantic wires from content path references
      const existingWireKeys = new Set<string>();
      for (const w of wireResult.wires) {
        existingWireKeys.add(`${w.from}→${w.to}`);
      }

      const semanticWires = await buildSemanticWires(
        app,
        nodeResult.nodes,
        nodeResult.nodeIdMap,
        nodeResult.includedPaths,
        existingWireKeys,
      );
      wireResult.wires.push(...semanticWires);

      // Stage 3c: Build embed wires (![[embed]] references)
      const embedWires = await buildEmbedWires(
        app,
        nodeResult.nodes,
        nodeResult.nodeIdMap,
        existingWireKeys,
      );
      wireResult.wires.push(...embedWires);

      // Stage 3d: Build tag wires (shared tags between nodes)
      const tagWires = buildTagWires(
        nodeResult.nodes,
        collected.files,
        nodeResult.nodeIdMap,
        existingWireKeys,
      );
      wireResult.wires.push(...tagWires);

      wireResult.wireCount = wireResult.wires.length;

      // Stage 3e: Resolve wire pin references (handle collapsed "multiple" pins)
      resolveWirePins(wireResult.wires, nodeResult.nodes);

      // Stage 4: Categorize nodes (assign cat field)
      const catResult = categorizeNodes(
        nodeResult.nodes,
        collected.files,
        this.options,
        this.options.categoryColors,
      );

      // Stage 5: Build groups (folder structure → group boxes)
      const groups = buildGroups(
        nodeResult.nodes,
        collected.folders,
        collected.topFolders,
        this.options,
        catResult.categories
      );

      const nodeCount = nodeResult.nodes.length;
      const wireCount = wireResult.wireCount;

      return {
        meta: {
          title: this.getVaultName(),
          subtitle: `${nodeCount} nodes · ${wireCount} connections`,
        },
        categories: catResult.categories,
        groups,
        nodes: nodeResult.nodes,
        wires: wireResult.wires,
      };
    } catch (error) {
      console.error("[VaultBlueprint] Scanner error:", error);
      return {
        meta: {
          title: "Vault Blueprint",
          subtitle: "Scan failed — check console for details",
        },
        categories: {},
        groups: [],
        nodes: [],
        wires: [],
      };
    }
  }

  private getVaultName(): string {
    const vaultName = this.options.app.vault.getName();
    return vaultName ? `${vaultName} Blueprint` : "Vault Blueprint";
  }
}
