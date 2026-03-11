// ─── Theme — Color resolution for dark/light mode ───────────
// Zero Obsidian dependencies. Pure color constants.

import type { CategoryDef } from '../types';

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
  wireInactiveAlpha: number;
  wireActiveAlpha: number;
  wireNormalAlpha: number;

  // Selection
  selectionGlowAlpha: number;
  pathColor: string;
  searchHighlight: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;

  // UI panels
  panelBg: string;
  panelBorder: string;
  panelText: string;
  panelTextMuted: string;
  buttonBg: string;
  buttonBorder: string;
  buttonText: string;
  buttonHoverBg: string;
  inputBg: string;
  inputBorder: string;
  inputFocusBorder: string;
}

const DARK_THEME: ThemeColors = {
  background: '#1a1d23',
  gridMinor: '#1f2228',
  gridMajor: '#252830',

  nodeFill: '#1e2028',
  nodeBorder: '#2a2d38',
  nodeShadow: 'rgba(0,0,0,0.4)',
  headerDivider: '#2a2d38',

  pinFill: '#556',
  pinStroke: '#889',
  pinLabel: '#778',

  wireDefault: '#555',
  wireInactiveAlpha: 0.07,
  wireActiveAlpha: 0.85,
  wireNormalAlpha: 0.5,

  selectionGlowAlpha: 0.9,
  pathColor: '#fbbf24',
  searchHighlight: '#ffffff',

  textPrimary: '#cdd',
  textSecondary: '#899',
  textMuted: '#556',

  panelBg: 'rgba(20,22,28,0.95)',
  panelBorder: '#2a2d35',
  panelText: '#899',
  panelTextMuted: '#667',
  buttonBg: 'rgba(30,33,40,0.9)',
  buttonBorder: '#2a2d35',
  buttonText: '#899',
  buttonHoverBg: '#2a2d35',
  inputBg: 'rgba(30,33,40,0.95)',
  inputBorder: '#2a2d35',
  inputFocusBorder: '#6366f1',
};

const LIGHT_THEME: ThemeColors = {
  background: '#f5f6f8',
  gridMinor: '#e8eaed',
  gridMajor: '#d5d8de',

  nodeFill: '#ffffff',
  nodeBorder: '#d0d3da',
  nodeShadow: 'rgba(0,0,0,0.1)',
  headerDivider: '#d0d3da',

  pinFill: '#aab',
  pinStroke: '#889',
  pinLabel: '#667',

  wireDefault: '#999',
  wireInactiveAlpha: 0.1,
  wireActiveAlpha: 0.9,
  wireNormalAlpha: 0.45,

  selectionGlowAlpha: 0.9,
  pathColor: '#d97706',
  searchHighlight: '#1a1d23',

  textPrimary: '#1a1d23',
  textSecondary: '#445',
  textMuted: '#889',

  panelBg: 'rgba(255,255,255,0.95)',
  panelBorder: '#d0d3da',
  panelText: '#445',
  panelTextMuted: '#889',
  buttonBg: 'rgba(240,242,245,0.9)',
  buttonBorder: '#d0d3da',
  buttonText: '#445',
  buttonHoverBg: '#e0e2e6',
  inputBg: 'rgba(255,255,255,0.95)',
  inputBorder: '#d0d3da',
  inputFocusBorder: '#6366f1',
};

/** Get theme colors for the given mode */
export function getTheme(mode: 'dark' | 'light'): ThemeColors {
  return mode === 'dark' ? DARK_THEME : LIGHT_THEME;
}

/** Resolve a category's colors with a helper to create alpha-suffixed hex strings */
export function resolveCategory(
  cat: CategoryDef,
  _mode: 'dark' | 'light',
): { color: string; dark: string; colorAlpha: (alpha: string) => string } {
  return {
    color: cat.color,
    dark: cat.dark,
    colorAlpha: (alpha: string) => cat.color + alpha,
  };
}
