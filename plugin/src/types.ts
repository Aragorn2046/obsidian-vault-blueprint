// ─── View Type ───────────────────────────────────────────────

export const VIEW_TYPE_BLUEPRINT = "vault-blueprint-view";

// ─── Settings ────────────────────────────────────────────────

export type ViewMode = 'schematic' | 'organic';

export interface OrganicForceSettings {
  centerForce: number;    // 0-1, pull toward center
  repelForce: number;     // 0-1, push nodes apart
  linkForce: number;      // 0-1, attraction along wires
  linkDistance: number;    // 0-1, ideal distance between linked nodes
  nodeSize: number;       // 0-1, base node size multiplier
  linkThickness: number;  // 0-1, wire thickness
  arrows: boolean;        // show arrowheads on wires
  textFadeThreshold: number; // 0-1, zoom level below which text fades
}

export const DEFAULT_ORGANIC_FORCES: OrganicForceSettings = {
  centerForce: 0.3,
  repelForce: 0.5,
  linkForce: 0.4,
  linkDistance: 0.5,
  nodeSize: 0.4,
  linkThickness: 0.3,
  arrows: true,
  textFadeThreshold: 0.3,
};

export interface VaultBlueprintSettings {
  excludePaths: string[];
  minBacklinks: number;
  showFolderGroups: boolean;
  categoryOverrides: Record<string, string>;
  categoryColors: Record<string, { color: string; dark: string }>;
  viewMode: ViewMode;
  organicSizing: boolean; // scale node size by connection count
  organicForces: OrganicForceSettings;
}

export const DEFAULT_SETTINGS: VaultBlueprintSettings = {
  excludePaths: [".obsidian", "node_modules"],
  minBacklinks: 3,
  showFolderGroups: true,
  categoryOverrides: {},
  categoryColors: {},
  viewMode: 'schematic',
  organicSizing: true,
  organicForces: { ...DEFAULT_ORGANIC_FORCES },
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
  tags?: string[];
  properties?: Record<string, unknown>;
  pins: {
    in: PinDef[];
    out: PinDef[];
  };
}

export interface PinDef {
  id: string;
  label: string;
}

export type WireType = 'link' | 'semantic' | 'embed' | 'tag';

export interface WireDef {
  from: string;
  fromPin?: string;
  to: string;
  toPin?: string;
  color?: string;
  type?: WireType;
}

export interface GroupDef {
  label: string;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
  catRef?: string;       // category key this group represents
  nodeIds?: string[];    // IDs of nodes in this group
  collapsed?: boolean;   // whether the group is collapsed into a summary pill
}

// ─── Cache ───────────────────────────────────────────────────

export interface CachedData {
  blueprint: BlueprintData;
  scannedAt: number;
  settingsHash: string;
}
