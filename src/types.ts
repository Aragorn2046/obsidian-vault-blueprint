// ─── View Type ───────────────────────────────────────────────

export const VIEW_TYPE_BLUEPRINT = "vault-blueprint-view";

// ─── Settings ────────────────────────────────────────────────

export interface VaultBlueprintSettings {
  excludePaths: string[];
  minBacklinks: number;
  showFolderGroups: boolean;
  categoryOverrides: Record<string, string>;
}

export const DEFAULT_SETTINGS: VaultBlueprintSettings = {
  excludePaths: [".obsidian", "node_modules"],
  minBacklinks: 3,
  showFolderGroups: true,
  categoryOverrides: {},
};

// ─── Blueprint Data Model ────────────────────────────────────
// Matches the existing index.html renderer's expected schema.

export interface BlueprintData {
  meta: { title: string; subtitle?: string };
  categories: Record<string, CategoryDef>;
  groups: GroupDef[];
  nodes: NodeDef[];
  wires: WireDef[];
}

export interface CategoryDef {
  color: string;
  dark: string;
  label: string;
  visible?: boolean;
}

export interface NodeDef {
  id: string;
  cat: string;
  title: string;
  x: number;
  y: number;
  path?: string;
  desc?: string;
  pins: {
    in: PinDef[];
    out: PinDef[];
  };
}

export interface PinDef {
  id: string;
  label: string;
}

export interface WireDef {
  from: string;
  fromPin?: string;
  to: string;
  toPin?: string;
  color?: string;
}

export interface GroupDef {
  label: string;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

// ─── Cache ───────────────────────────────────────────────────

export interface CachedData {
  blueprint: BlueprintData;
  scannedAt: number;
  settingsHash: string;
}
