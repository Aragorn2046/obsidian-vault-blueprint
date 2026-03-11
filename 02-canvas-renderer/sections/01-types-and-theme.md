# 01 — Types and Theme

## Summary

Define all TypeScript interfaces for the blueprint data model and build a theme module that resolves colors for dark and light mode. These are foundational — every other module imports from here.

## Files to Create

### `src/renderer/types.ts`

All data interfaces consumed by the renderer. Ported from the implicit shapes in `index.html`'s global variables and the spec's data interfaces.

```typescript
export interface BlueprintData {
  meta: { title: string; subtitle?: string };
  categories: Record<string, CategoryDef>;
  groups: GroupDef[];
  nodes: NodeDef[];
  wires: WireDef[];
}

export interface CategoryDef {
  color: string;      // Primary hex color, e.g. "#6366f1"
  dark: string;       // Darker variant for header fills
  label: string;      // Display name
  visible?: boolean;  // Runtime toggle, default true
}

export interface NodeDef {
  id: string;
  cat: string;                     // Category key
  title: string;
  x: number; y: number;           // World-space position
  w?: number; h?: number;         // Computed at init time
  path?: string;                   // Vault file path (for navigation callback)
  desc?: string;                   // Description text
  group?: string;                  // Optional explicit group key (for layout)
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
  from: string;      // "nodeId.pinId"
  fromPin?: string;  // Alternative: separate pin ID
  to: string;
  toPin?: string;
  color?: string;    // Override wire color
}

export interface GroupDef {
  label: string;
  color: string;
  catRef?: string;   // Optional category reference (hide group when category hidden)
  x: number; y: number;
  w: number; h: number;
}

export interface SearchResult {
  node: NodeDef;
  matchField: 'title' | 'desc' | 'path';
  score: number;     // Lower is better (0 = exact match)
}

export interface ConnectionInfo {
  node: NodeDef;
  label: string;
  wireIdx: number;
}

export interface ConnectionList {
  outgoing: ConnectionInfo[];
  incoming: ConnectionInfo[];
}
```

Also export rendering constants (ported from the globals in index.html):

```typescript
export const NODE_W = 220;
export const PIN_H = 18;
export const HEADER_H = 26;
export const PIN_R = 5;
```

And the renderer options interface:

```typescript
export interface BlueprintRendererOptions {
  canvas: HTMLCanvasElement;
  container: HTMLDivElement;
  data: BlueprintData;
  theme?: 'dark' | 'light';
  onNodeClick?: (nodeId: string, filePath?: string) => void;
  onNodeHover?: (nodeId: string | null) => void;
}
```

### `src/renderer/theme.ts`

Color resolution module. The existing index.html is dark-mode only with hardcoded hex values. This module extracts those into a theme object and adds a light-mode variant.

```typescript
export interface ThemeColors {
  // Canvas
  background: string;
  gridMinor: string;
  gridMajor: string;

  // Nodes
  nodeFill: string;
  nodeBorder: string;
  nodeShadow: string;
  headerDivider: string;

  // Pins
  pinFill: string;
  pinStroke: string;
  pinLabel: string;

  // Wires
  wireDefault: string;
  wireInactive: number;   // globalAlpha for dimmed wires
  wireActive: number;     // globalAlpha for active wires

  // Selection
  selectionGlow: number;  // globalAlpha
  pathColor: string;      // Path tracing highlight (yellow)
  searchHighlight: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;

  // UI panels (legend, info panel, search)
  panelBg: string;
  panelBorder: string;
  panelText: string;
  panelTextMuted: string;
  buttonBg: string;
  buttonBorder: string;
  buttonText: string;
  buttonHoverBg: string;
}

export function getTheme(mode: 'dark' | 'light'): ThemeColors;
export function resolveCategory(cat: CategoryDef, theme: 'dark' | 'light'): {
  color: string;
  dark: string;
  colorAlpha: (alpha: string) => string;
};
```

Dark theme values (extracted from index.html):
- `background: '#1a1d23'`
- `gridMinor: '#1f2228'`, `gridMajor: '#252830'`
- `nodeFill: '#1e2028'`, `nodeBorder: '#2a2d38'`
- `pinFill: '#556'`, `pinStroke: '#889'`, `pinLabel: '#778'`
- `panelBg: 'rgba(20,22,28,0.95)'`, `panelBorder: '#2a2d35'`

Light theme values (new — inverted palette):
- `background: '#f5f6f8'`
- `gridMinor: '#e8eaed'`, `gridMajor: '#d5d8de'`
- `nodeFill: '#ffffff'`, `nodeBorder: '#d0d3da'`
- Pin/text colors inverted to dark equivalents

The `resolveCategory` helper returns the primary and dark colors, plus a function that appends an alpha hex suffix (used throughout drawing code, e.g. `cat.color + '30'`).

## Implementation Details

1. **types.ts** is pure interfaces and constants — no runtime code except the constant values. Keep it as the single source of truth so all other modules import `NodeDef`, `WireDef`, etc. from here.

2. **theme.ts** exports two functions:
   - `getTheme(mode)` returns a frozen `ThemeColors` object. No class, no state — just a lookup.
   - `resolveCategory(cat, theme)` wraps a `CategoryDef` with theme-aware helpers. The `colorAlpha` function handles the `cat.color + '30'` pattern used in index.html (lines 475, 476, 682, 702).

3. The `NodeDef.w` and `NodeDef.h` fields are optional in the interface because they're computed at initialization time (see index.html line 222-224):
   ```javascript
   var maxPins = Math.max(n.pins.in.length, n.pins.out.length, 1);
   n.w = NODE_W;
   n.h = HEADER_H + maxPins * PIN_H + 8;
   ```
   This computation moves to the renderer's `initializeData` method (section 07), not into types.

4. `SearchResult.score` enables ranked results — exact title match = 0, substring title = 1, desc match = 2, path match = 3. Used by the search module (section 05).

## Acceptance Criteria

- [ ] All interfaces match the spec's data format exactly
- [ ] `getTheme('dark')` returns colors matching the existing index.html hardcoded values
- [ ] `getTheme('light')` returns a readable light-mode palette
- [ ] `resolveCategory` produces correct alpha-suffixed hex strings
- [ ] No runtime dependencies — types.ts is interfaces + constants only
- [ ] No Obsidian imports anywhere in either file
- [ ] Both files compile cleanly with `strict: true`
