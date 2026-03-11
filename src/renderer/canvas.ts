// ─── Canvas Core — Stateless drawing functions ──────────────
// Zero Obsidian dependencies. Pure Canvas2D rendering.

import type { NodeDef, WireDef, GroupDef, CategoryDef, PinDef, OrganicForceSettings } from '../types';
import type { ThemeColors } from './theme';

// ─── Constants ──────────────────────────────────────────────

export const NODE_W = 220;
export const PIN_H = 18;
export const HEADER_H = 26;
export const PIN_R = 5;

// ─── View Transform ─────────────────────────────────────────

export interface ViewTransform {
  panX: number;
  panY: number;
  zoom: number;
}

/** Convert world coords to screen coords */
export function toScreen(wx: number, wy: number, vt: ViewTransform): { x: number; y: number } {
  return { x: wx * vt.zoom + vt.panX, y: wy * vt.zoom + vt.panY };
}

/** Convert screen coords to world coords */
export function toWorld(sx: number, sy: number, vt: ViewTransform): { x: number; y: number } {
  return { x: (sx - vt.panX) / vt.zoom, y: (sy - vt.panY) / vt.zoom };
}

// ─── Selection State ────────────────────────────────────────

export interface SelectionState {
  selectedNodeId: string | null;
  pathNodes: Set<string> | null;
  pathWires: Set<number> | null;
  searchQuery: string;
  hoveredWireIdx: number | null;
}

// ─── Draw State interfaces ──────────────────────────────────

export interface NodeDrawState {
  isActive: boolean;
  isSelected: boolean;
  isPathTarget: boolean;
  isSearchMatch: boolean;
}

export interface WireDrawState {
  isActive: boolean;
  isPathWire: boolean;
  isHovered: boolean;
  hasSelection: boolean;
}

// ─── Wire/Node Helpers ──────────────────────────────────────

/** Parse wire endpoint spec to extract node IDs */
export function getWireNodeIds(wire: WireDef): { from: string; to: string } {
  return {
    from: wire.from.split('.')[0],
    to: wire.to.split('.')[0],
  };
}

/** Check if a node is visible (category enabled) */
export function isNodeVisible(
  node: NodeDef,
  categories: Record<string, CategoryDef>,
): boolean {
  const cat = categories[node.cat];
  return !!cat && cat.visible !== false;
}

/** Check if a wire connects to a given node */
export function isWireConnected(wire: WireDef, nodeId: string): boolean {
  const ends = getWireNodeIds(wire);
  return ends.from === nodeId || ends.to === nodeId;
}

/** Get all node IDs connected to the given node (including itself) */
export function getConnectedNodeIds(
  nodeId: string,
  wires: WireDef[],
): Record<string, boolean> {
  const ids: Record<string, boolean> = { [nodeId]: true };
  for (const w of wires) {
    const ends = getWireNodeIds(w);
    if (ends.from === nodeId) ids[ends.to] = true;
    if (ends.to === nodeId) ids[ends.from] = true;
  }
  return ids;
}

/** Count connections for a node */
export function countConnections(nodeId: string, wires: WireDef[]): number {
  let c = 0;
  for (const w of wires) {
    const ends = getWireNodeIds(w);
    if (ends.from === nodeId || ends.to === nodeId) c++;
  }
  return c;
}

/** Connection info for info panel */
export interface ConnectionInfo {
  node: NodeDef;
  label: string;
  wireIdx: number;
}

export interface ConnectionList {
  outgoing: ConnectionInfo[];
  incoming: ConnectionInfo[];
}

/** Get categorized connection list for a node */
export function getConnectionList(
  nodeId: string,
  wires: WireDef[],
  nodeMap: Record<string, NodeDef>,
): ConnectionList {
  const outgoing: ConnectionInfo[] = [];
  const incoming: ConnectionInfo[] = [];

  wires.forEach((w, idx) => {
    const ends = getWireNodeIds(w);
    if (ends.from === nodeId && nodeMap[ends.to]) {
      const pinId = w.from.split('.')[1];
      const node = nodeMap[nodeId];
      let label = '';
      if (node) {
        for (const p of node.pins.out) {
          if (p.id === pinId) { label = p.label; break; }
        }
      }
      outgoing.push({ node: nodeMap[ends.to], label, wireIdx: idx });
    }
    if (ends.to === nodeId && nodeMap[ends.from]) {
      const pinId = w.to.split('.')[1];
      const node = nodeMap[nodeId];
      let label = '';
      if (node) {
        for (const p of node.pins.in) {
          if (p.id === pinId) { label = p.label; break; }
        }
      }
      incoming.push({ node: nodeMap[ends.from], label, wireIdx: idx });
    }
  });

  return { outgoing, incoming };
}

// ─── Text Wrapping ──────────────────────────────────────────

/** Wrap text into lines that fit within maxWidth */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/);
  if (words.length === 0) return [text];

  const lines: string[] = [];
  let current = words[0];

  for (let i = 1; i < words.length; i++) {
    const test = current + ' ' + words[i];
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);

  // If a single word is too wide, it stays on its own line (no mid-word break)
  return lines;
}

/** Estimate line count for a title without canvas context (for layout) */
export function estimateTitleLines(title: string, nodeWidth: number): number {
  // At bold 11px system-ui, average char width is ~7px
  const avgCharW = 7;
  const padding = 20;
  const maxChars = Math.floor((nodeWidth - padding) / avgCharW);
  if (maxChars <= 0) return 1;

  const words = title.split(/\s+/);
  let lines = 1;
  let lineLen = words[0]?.length ?? 0;

  for (let i = 1; i < words.length; i++) {
    if (lineLen + 1 + words[i].length <= maxChars) {
      lineLen += 1 + words[i].length;
    } else {
      lines++;
      lineLen = words[i].length;
    }
  }
  return lines;
}

/** Base header height for 1 line, extra per additional line */
export const HEADER_H_BASE = 26;
export const HEADER_LINE_H = 14;

/** Compute header height for a given number of title lines */
export function headerHeight(titleLines: number): number {
  return HEADER_H_BASE + Math.max(0, titleLines - 1) * HEADER_LINE_H;
}

// ─── Pin Position ───────────────────────────────────────────

/** Get pin position in world coordinates */
export function getPinPos(
  node: NodeDef,
  pinId: string,
  side: 'in' | 'out',
): { x: number; y: number } {
  const pins: PinDef[] = side === 'out' ? node.pins.out : node.pins.in;
  let idx = 0;
  for (let i = 0; i < pins.length; i++) {
    if (pins[i].id === pinId) { idx = i; break; }
  }
  const w = (node as any).w ?? NODE_W;
  const hh = (node as any).headerH ?? HEADER_H;
  const py = node.y + hh + idx * PIN_H + PIN_H / 2 + 4;
  const px = side === 'out' ? node.x + w : node.x;
  return { x: px, y: py };
}

/** Resolve wire endpoint spec to world coordinates */
export function resolveWireEndpoint(
  spec: string,
  nodeMap: Record<string, NodeDef>,
): { x: number; y: number } {
  const parts = spec.split('.');
  const nodeId = parts[0];
  const pinId = parts[1];
  const n = nodeMap[nodeId];
  if (!n) return { x: 0, y: 0 };

  let isOut = false;
  for (const p of n.pins.out) {
    if (p.id === pinId) { isOut = true; break; }
  }
  return getPinPos(n, pinId, isOut ? 'out' : 'in');
}

// ─── Path Utilities ─────────────────────────────────────────

/** Trace a rounded rectangle path (all four corners rounded) */
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** Trace a rounded rectangle path with only top corners rounded */
export function roundRectTop(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ─── Drawing Functions ──────────────────────────────────────

/** Draw background grid — minor (40px) and major (200px) lines */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  vt: ViewTransform,
  canvasW: number,
  canvasH: number,
  theme: ThemeColors,
): void {
  // Minor grid
  const gs = 40 * vt.zoom;
  const ox = vt.panX % gs;
  const oy = vt.panY % gs;
  ctx.strokeStyle = theme.gridMinor;
  ctx.lineWidth = 1;
  for (let x = ox; x < canvasW; x += gs) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvasH);
    ctx.stroke();
  }
  for (let y = oy; y < canvasH; y += gs) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvasW, y);
    ctx.stroke();
  }

  // Major grid
  const mgs = 200 * vt.zoom;
  const mox = vt.panX % mgs;
  const moy = vt.panY % mgs;
  ctx.strokeStyle = theme.gridMajor;
  for (let x = mox; x < canvasW; x += mgs) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvasH);
    ctx.stroke();
  }
  for (let y = moy; y < canvasH; y += mgs) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvasW, y);
    ctx.stroke();
  }
}

/** Draw a single group box */
export function drawGroup(
  ctx: CanvasRenderingContext2D,
  group: GroupDef,
  vt: ViewTransform,
  theme: ThemeColors,
  categories?: Record<string, CategoryDef>,
): void {
  // If group has a catRef and that category is hidden, skip
  const catRef = (group as any).catRef;
  if (catRef && categories) {
    const cat = categories[catRef];
    if (cat && cat.visible === false) return;
  }

  const x = group.x * vt.zoom + vt.panX;
  const y = group.y * vt.zoom + vt.panY;
  const w = group.w * vt.zoom;
  const h = group.h * vt.zoom;
  const c = group.color || '#555';

  ctx.fillStyle = c + '08';
  ctx.strokeStyle = c + '18';
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, 6 * vt.zoom);
  ctx.fill();
  ctx.stroke();

  const fs = Math.max(9, Math.min(14, 12 * vt.zoom));
  ctx.font = `600 ${fs}px system-ui`;
  ctx.fillStyle = c + '50';
  ctx.textAlign = 'left';
  ctx.fillText(group.label, x + 10 * vt.zoom, y - 4 * vt.zoom);
}

/** Draw a single wire (bezier curve) */
export function drawWire(
  ctx: CanvasRenderingContext2D,
  wire: WireDef,
  wireIndex: number,
  nodeMap: Record<string, NodeDef>,
  categories: Record<string, CategoryDef>,
  vt: ViewTransform,
  theme: ThemeColors,
  state: WireDrawState,
): void {
  const ends = getWireNodeIds(wire);
  const fromNode = nodeMap[ends.from];
  const toNode = nodeMap[ends.to];
  if (!fromNode || !toNode) return;
  if (!isNodeVisible(fromNode, categories) || !isNodeVisible(toNode, categories)) return;

  const p1 = resolveWireEndpoint(wire.from, nodeMap);
  const p2 = resolveWireEndpoint(wire.to, nodeMap);
  const x1 = p1.x * vt.zoom + vt.panX;
  const y1 = p1.y * vt.zoom + vt.panY;
  const x2 = p2.x * vt.zoom + vt.panX;
  const y2 = p2.y * vt.zoom + vt.panY;
  const dx = Math.abs(x2 - x1) * 0.5;

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.bezierCurveTo(x1 + dx, y1, x2 - dx, y2, x2, y2);

  ctx.strokeStyle = wire.color || theme.wireDefault;

  if (state.isHovered) {
    ctx.globalAlpha = 1;
    ctx.lineWidth = Math.max(2.5, 3.5 * vt.zoom);
  } else if (state.hasSelection) {
    ctx.lineWidth = state.isActive
      ? Math.max(1.5, 2.5 * vt.zoom)
      : Math.max(1, 2 * vt.zoom);
    ctx.globalAlpha = state.isActive ? theme.wireActiveAlpha : theme.wireInactiveAlpha;
  } else {
    ctx.lineWidth = Math.max(1, 2 * vt.zoom);
    ctx.globalAlpha = theme.wireNormalAlpha;
  }

  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Draw a single node */
export function drawNode(
  ctx: CanvasRenderingContext2D,
  node: NodeDef,
  categories: Record<string, CategoryDef>,
  wires: WireDef[],
  vt: ViewTransform,
  theme: ThemeColors,
  state: NodeDrawState,
  pathTargetId: string | null,
): void {
  if (!isNodeVisible(node, categories)) return;

  const cat = categories[node.cat];
  if (!cat) return;

  const nw = (node as any).w ?? NODE_W;
  const nh = (node as any).h ?? 60;
  const nodeHeaderH = (node as any).headerH ?? HEADER_H;
  const x = node.x * vt.zoom + vt.panX;
  const y = node.y * vt.zoom + vt.panY;
  const w = nw * vt.zoom;
  const h = nh * vt.zoom;
  const r = 4 * vt.zoom;
  const hh = nodeHeaderH * vt.zoom;

  ctx.globalAlpha = state.isActive ? 1.0 : 0.15;

  // 1. Drop shadow
  ctx.fillStyle = theme.nodeShadow;
  roundRect(ctx, x + 3, y + 3, w, h, r);
  ctx.fill();

  // 2. Body background
  ctx.fillStyle = theme.nodeFill;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();

  // 3. Body border
  ctx.strokeStyle = theme.nodeBorder;
  ctx.lineWidth = 1;
  ctx.stroke();

  // 4. Header fill (top-only rounded rect)
  ctx.save();
  ctx.beginPath();
  roundRectTop(ctx, x, y, w, hh, r);
  ctx.fillStyle = cat.dark;
  ctx.fill();
  ctx.restore();

  // 5. Header divider line
  ctx.beginPath();
  ctx.moveTo(x, y + hh);
  ctx.lineTo(x + w, y + hh);
  ctx.strokeStyle = theme.headerDivider;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Font sizes scaled by zoom
  const titleFs = Math.max(8, Math.min(16, 11 * vt.zoom));
  const pinFs = Math.max(7, Math.min(13, 9 * vt.zoom));
  const pinR = Math.max(3, Math.min(8, PIN_R * vt.zoom));
  const badgeFs = Math.max(7, Math.min(11, 8 * vt.zoom));

  // 6. Title text (white on colored header, wrapped)
  ctx.font = `bold ${titleFs}px system-ui`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  const titleLines: string[] = (node as any).titleLines ?? [node.title];
  const lineH = HEADER_LINE_H * vt.zoom;
  // Vertically center the lines within the header
  const totalTextH = titleLines.length * lineH;
  const textStartY = y + (hh - totalTextH) / 2 + lineH * 0.75;
  for (let li = 0; li < titleLines.length; li++) {
    ctx.fillText(titleLines[li], x + w / 2, textStartY + li * lineH);
  }

  // 7. Connection count badge
  const connCount = countConnections(node.id, wires);
  if (connCount > 0) {
    const badgeText = String(connCount);
    ctx.font = `bold ${badgeFs}px system-ui`;
    const bw = ctx.measureText(badgeText).width + 6;
    const bx = x + w - bw - 4 * vt.zoom;
    const by = y + 3 * vt.zoom;
    const bh = badgeFs + 4;
    ctx.fillStyle = cat.color + '30';
    roundRect(ctx, bx, by, bw, bh, 2);
    ctx.fill();
    ctx.fillStyle = cat.color;
    ctx.textAlign = 'center';
    ctx.fillText(badgeText, bx + bw / 2, by + bh - 3);
  }

  // 8. Input pins (left edge)
  const ph = PIN_H * vt.zoom;
  node.pins.in.forEach((pin: PinDef, i: number) => {
    const py = y + hh + i * ph + ph / 2 + 4 * vt.zoom;
    const px = x;
    ctx.beginPath();
    ctx.arc(px, py, pinR, 0, Math.PI * 2);
    ctx.fillStyle = theme.pinFill;
    ctx.fill();
    ctx.strokeStyle = theme.pinStroke;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = `${pinFs}px system-ui`;
    ctx.fillStyle = theme.pinLabel;
    ctx.textAlign = 'left';
    ctx.fillText(pin.label, px + 10 * vt.zoom, py + 3 * vt.zoom);
  });

  // 9. Output pins (right edge)
  node.pins.out.forEach((pin: PinDef, i: number) => {
    const py = y + hh + i * ph + ph / 2 + 4 * vt.zoom;
    const px = x + w;
    ctx.beginPath();
    ctx.arc(px, py, pinR, 0, Math.PI * 2);
    ctx.fillStyle = theme.pinFill;
    ctx.fill();
    ctx.strokeStyle = theme.pinStroke;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = `${pinFs}px system-ui`;
    ctx.fillStyle = theme.pinLabel;
    ctx.textAlign = 'right';
    ctx.fillText(pin.label, px - 10 * vt.zoom, py + 3 * vt.zoom);
  });

  // 10. Selection highlight
  if (state.isSelected) {
    ctx.strokeStyle = cat.color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = theme.selectionGlowAlpha;
    roundRect(ctx, x - 2, y - 2, w + 4, h + 4, r + 2);
    ctx.stroke();
  }

  // 11. Path target highlight
  if (state.isPathTarget) {
    ctx.strokeStyle = theme.pathColor;
    ctx.lineWidth = 2;
    ctx.globalAlpha = theme.selectionGlowAlpha;
    roundRect(ctx, x - 2, y - 2, w + 4, h + 4, r + 2);
    ctx.stroke();
  }

  // 12. Search highlight
  if (state.isSearchMatch) {
    ctx.strokeStyle = theme.searchHighlight;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6;
    roundRect(ctx, x - 3, y - 3, w + 6, h + 6, r + 3);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

// ─── Organic (Circular) Node Drawing ────────────────────────

/** Draw a single organic (circular) node */
export function drawOrganicNode(
  ctx: CanvasRenderingContext2D,
  node: NodeDef,
  radius: number,
  categories: Record<string, CategoryDef>,
  vt: ViewTransform,
  theme: ThemeColors,
  state: NodeDrawState,
  textFadeThreshold: number = 0.3,
): void {
  if (!isNodeVisible(node, categories)) return;

  const cat = categories[node.cat];
  if (!cat) return;

  const cx = node.x * vt.zoom + vt.panX;
  const cy = node.y * vt.zoom + vt.panY;
  const r = radius * vt.zoom;

  ctx.globalAlpha = state.isActive ? 1.0 : 0.15;

  // 1. Drop shadow
  ctx.beginPath();
  ctx.arc(cx + 2, cy + 2, r, 0, Math.PI * 2);
  ctx.fillStyle = theme.nodeShadow;
  ctx.fill();

  // 2. Outer glow / gradient fill
  const grad = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r);
  grad.addColorStop(0, cat.dark);
  grad.addColorStop(0.7, cat.color + 'cc');
  grad.addColorStop(1, cat.color + '40');
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // 3. Border
  ctx.strokeStyle = cat.color;
  ctx.lineWidth = state.isSelected ? 3 : 1.5;
  ctx.stroke();

  // 4. Inner highlight (top-left light source)
  const highlight = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
  highlight.addColorStop(0, 'rgba(255,255,255,0.25)');
  highlight.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = highlight;
  ctx.fill();

  // 5. Title text (centered, clipped to circle, fades at low zoom)
  const textAlpha = vt.zoom <= textFadeThreshold
    ? Math.max(0, vt.zoom / textFadeThreshold)
    : 1.0;

  if (textAlpha > 0.05) {
    const maxTextW = r * 1.4;
    const titleFs = Math.max(7, Math.min(14, Math.min(11 * vt.zoom, r * vt.zoom * 0.35)));
    ctx.font = `bold ${titleFs}px system-ui`;
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = (state.isActive ? 1.0 : 0.15) * textAlpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const lines = wrapText(ctx, node.title, maxTextW);
    const lineH = titleFs * 1.3;
    const startY = cy - ((lines.length - 1) * lineH) / 2;
    for (let i = 0; i < Math.min(lines.length, 3); i++) {
      let line = lines[i];
      if (i === 2 && lines.length > 3) line = line.slice(0, -3) + '...';
      ctx.fillText(line, cx, startY + i * lineH);
    }
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = state.isActive ? 1.0 : 0.15;
  }

  // 7. Selection highlight
  if (state.isSelected) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 8. Path target highlight
  if (state.isPathTarget) {
    ctx.strokeStyle = theme.pathColor;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 9. Search highlight
  if (state.isSearchMatch) {
    ctx.strokeStyle = theme.searchHighlight;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

/** Draw a wire in organic mode (line between circle edges with optional arrow) */
export function drawOrganicWire(
  ctx: CanvasRenderingContext2D,
  wire: WireDef,
  nodeMap: Record<string, NodeDef>,
  radii: Map<string, number>,
  categories: Record<string, CategoryDef>,
  vt: ViewTransform,
  theme: ThemeColors,
  state: WireDrawState,
  linkThickness: number = 0.3,
  showArrows: boolean = true,
): void {
  const ends = getWireNodeIds(wire);
  const fromNode = nodeMap[ends.from];
  const toNode = nodeMap[ends.to];
  if (!fromNode || !toNode) return;
  if (!isNodeVisible(fromNode, categories) || !isNodeVisible(toNode, categories)) return;

  const x1 = fromNode.x * vt.zoom + vt.panX;
  const y1 = fromNode.y * vt.zoom + vt.panY;
  const x2 = toNode.x * vt.zoom + vt.panX;
  const y2 = toNode.y * vt.zoom + vt.panY;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1) return;

  const r1 = (radii.get(ends.from) ?? 35) * vt.zoom;
  const r2 = (radii.get(ends.to) ?? 35) * vt.zoom;

  const startX = x1 + (dx / dist) * r1;
  const startY = y1 + (dy / dist) * r1;
  const endX = x2 - (dx / dist) * r2;
  const endY = y2 - (dy / dist) * r2;

  // Slight curve for organic feel
  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2;
  const perpX = -(endY - startY) * 0.05;
  const perpY = (endX - startX) * 0.05;

  // Thickness scaled by setting
  const baseThickness = 0.5 + linkThickness * 3;

  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.quadraticCurveTo(midX + perpX, midY + perpY, endX, endY);

  ctx.strokeStyle = wire.color || theme.wireDefault;

  if (state.isHovered) {
    ctx.globalAlpha = 1;
    ctx.lineWidth = Math.max(2, (baseThickness + 1.5) * vt.zoom);
  } else if (state.hasSelection) {
    ctx.lineWidth = state.isActive
      ? Math.max(1, baseThickness * vt.zoom)
      : Math.max(0.5, (baseThickness * 0.7) * vt.zoom);
    ctx.globalAlpha = state.isActive ? theme.wireActiveAlpha : theme.wireInactiveAlpha;
  } else {
    ctx.lineWidth = Math.max(0.5, baseThickness * vt.zoom);
    ctx.globalAlpha = theme.wireNormalAlpha * 0.7;
  }

  ctx.stroke();

  // Draw arrowhead at the end
  if (showArrows && ctx.globalAlpha > 0.1) {
    const arrowLen = Math.max(5, 8 * vt.zoom);
    const arrowW = Math.max(3, 5 * vt.zoom);
    // Direction from midpoint toward end
    const adx = endX - (midX + perpX);
    const ady = endY - (midY + perpY);
    const adist = Math.sqrt(adx * adx + ady * ady);
    if (adist > 1) {
      const ux = adx / adist;
      const uy = ady / adist;
      const ax = endX - ux * arrowLen;
      const ay = endY - uy * arrowLen;
      const px = -uy * arrowW;
      const py = ux * arrowW;

      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(ax + px, ay + py);
      ctx.lineTo(ax - px, ay - py);
      ctx.closePath();
      ctx.fillStyle = wire.color || theme.wireDefault;
      ctx.fill();
    }
  }

  ctx.globalAlpha = 1;
}

/** Render a complete organic frame */
export function renderFrameOrganic(
  ctx: CanvasRenderingContext2D,
  data: { groups: GroupDef[]; nodes: NodeDef[]; wires: WireDef[]; categories: Record<string, CategoryDef> },
  nodeMap: Record<string, NodeDef>,
  radii: Map<string, number>,
  vt: ViewTransform,
  canvasW: number,
  canvasH: number,
  theme: ThemeColors,
  selection: SelectionState,
  pathTargetId: string | null,
  forces?: OrganicForceSettings,
): void {
  ctx.clearRect(0, 0, canvasW, canvasH);

  // Background
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Subtle dot grid instead of lines for organic mode
  const gs = 60 * vt.zoom;
  const ox = vt.panX % gs;
  const oy = vt.panY % gs;
  ctx.fillStyle = theme.gridMinor;
  for (let x = ox; x < canvasW; x += gs) {
    for (let y = oy; y < canvasH; y += gs) {
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Compute connected IDs for dimming
  let connectedIds: Record<string, boolean> | null = null;
  if (selection.selectedNodeId && !selection.pathNodes) {
    connectedIds = getConnectedNodeIds(selection.selectedNodeId, data.wires);
  }
  const hasSelection = !!(selection.selectedNodeId || selection.pathNodes);

  // Wires (drawn first, behind nodes)
  for (let i = 0; i < data.wires.length; i++) {
    const wire = data.wires[i];
    let isActive = true;
    let isPathWire = false;

    if (selection.pathNodes && selection.pathWires) {
      isPathWire = selection.pathWires.has(i);
      isActive = isPathWire;
    } else if (selection.selectedNodeId) {
      isActive = isWireConnected(wire, selection.selectedNodeId);
    }

    drawOrganicWire(ctx, wire, nodeMap, radii, data.categories, vt, theme, {
      isActive,
      isPathWire,
      isHovered: selection.hoveredWireIdx === i,
      hasSelection,
    }, forces?.linkThickness ?? 0.3, forces?.arrows ?? true);
  }

  // Nodes
  const searchQ = selection.searchQuery?.toLowerCase() || '';
  const textFade = forces?.textFadeThreshold ?? 0.3;
  for (const node of data.nodes) {
    let isActive = true;
    if (selection.pathNodes) {
      isActive = selection.pathNodes.has(node.id);
    } else if (selection.selectedNodeId && connectedIds) {
      isActive = !!connectedIds[node.id];
    }

    const isSearchMatch = searchQ.length > 0 && node.title.toLowerCase().includes(searchQ);
    const r = radii.get(node.id) ?? 35;

    drawOrganicNode(ctx, node, r, data.categories, vt, theme, {
      isActive,
      isSelected: selection.selectedNodeId === node.id,
      isPathTarget: pathTargetId === node.id,
      isSearchMatch,
    }, textFade);
  }
}

// ─── Full Frame Render ──────────────────────────────────────

/** Render a complete frame — grid, groups, wires, nodes */
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  data: { groups: GroupDef[]; nodes: NodeDef[]; wires: WireDef[]; categories: Record<string, CategoryDef> },
  nodeMap: Record<string, NodeDef>,
  vt: ViewTransform,
  canvasW: number,
  canvasH: number,
  theme: ThemeColors,
  selection: SelectionState,
): void {
  ctx.clearRect(0, 0, canvasW, canvasH);

  // Background fill
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, canvasW, canvasH);

  drawGrid(ctx, vt, canvasW, canvasH, theme);

  // Groups
  for (const group of data.groups) {
    drawGroup(ctx, group, vt, theme, data.categories);
  }

  // Compute connected node IDs if there's a selection (for dimming)
  let connectedIds: Record<string, boolean> | null = null;
  if (selection.selectedNodeId && !selection.pathNodes) {
    connectedIds = getConnectedNodeIds(selection.selectedNodeId, data.wires);
  }

  const hasSelection = !!(selection.selectedNodeId || selection.pathNodes);

  // Wires
  for (let i = 0; i < data.wires.length; i++) {
    const wire = data.wires[i];
    const ends = getWireNodeIds(wire);

    let isActive = true;
    let isPathWire = false;

    if (selection.pathNodes && selection.pathWires) {
      isPathWire = selection.pathWires.has(i);
      isActive = isPathWire;
    } else if (selection.selectedNodeId) {
      isActive = isWireConnected(wire, selection.selectedNodeId);
    }

    drawWire(ctx, wire, i, nodeMap, data.categories, vt, theme, {
      isActive,
      isPathWire,
      isHovered: selection.hoveredWireIdx === i,
      hasSelection,
    });
  }

  // Nodes
  const searchQ = selection.searchQuery?.toLowerCase() || '';
  for (const node of data.nodes) {
    let isActive = true;
    if (selection.pathNodes) {
      isActive = selection.pathNodes.has(node.id);
    } else if (selection.selectedNodeId && connectedIds) {
      isActive = !!connectedIds[node.id];
    }

    const isSearchMatch = searchQ.length > 0 && node.title.toLowerCase().includes(searchQ);

    drawNode(ctx, node, data.categories, data.wires, vt, theme, {
      isActive,
      isSelected: selection.selectedNodeId === node.id,
      isPathTarget: false, // Set below
      isSearchMatch,
    }, selection.pathNodes ? null : null);

    // Re-draw path target highlight separately (needs to check pathTargetId from caller)
    // This is handled by passing pathTargetId through the state.isPathTarget flag
  }
}

/**
 * Render a complete frame with path target support.
 * This is the primary entry point used by BlueprintRenderer.
 */
export function renderFrameFull(
  ctx: CanvasRenderingContext2D,
  data: { groups: GroupDef[]; nodes: NodeDef[]; wires: WireDef[]; categories: Record<string, CategoryDef> },
  nodeMap: Record<string, NodeDef>,
  vt: ViewTransform,
  canvasW: number,
  canvasH: number,
  theme: ThemeColors,
  selection: SelectionState,
  pathTargetId: string | null,
): void {
  ctx.clearRect(0, 0, canvasW, canvasH);

  // Background fill
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, canvasW, canvasH);

  drawGrid(ctx, vt, canvasW, canvasH, theme);

  // Groups
  for (const group of data.groups) {
    drawGroup(ctx, group, vt, theme, data.categories);
  }

  // Compute connected node IDs if there's a selection (for dimming)
  let connectedIds: Record<string, boolean> | null = null;
  if (selection.selectedNodeId && !selection.pathNodes) {
    connectedIds = getConnectedNodeIds(selection.selectedNodeId, data.wires);
  }

  const hasSelection = !!(selection.selectedNodeId || selection.pathNodes);

  // Wires
  for (let i = 0; i < data.wires.length; i++) {
    const wire = data.wires[i];

    let isActive = true;
    let isPathWire = false;

    if (selection.pathNodes && selection.pathWires) {
      isPathWire = selection.pathWires.has(i);
      isActive = isPathWire;
    } else if (selection.selectedNodeId) {
      isActive = isWireConnected(wire, selection.selectedNodeId);
    }

    drawWire(ctx, wire, i, nodeMap, data.categories, vt, theme, {
      isActive,
      isPathWire,
      isHovered: selection.hoveredWireIdx === i,
      hasSelection,
    });
  }

  // Nodes
  const searchQ = selection.searchQuery?.toLowerCase() || '';
  for (const node of data.nodes) {
    let isActive = true;
    if (selection.pathNodes) {
      isActive = selection.pathNodes.has(node.id);
    } else if (selection.selectedNodeId && connectedIds) {
      isActive = !!connectedIds[node.id];
    }

    const isSearchMatch = searchQ.length > 0 && node.title.toLowerCase().includes(searchQ);

    drawNode(ctx, node, data.categories, data.wires, vt, theme, {
      isActive,
      isSelected: selection.selectedNodeId === node.id,
      isPathTarget: pathTargetId === node.id,
      isSearchMatch,
    }, pathTargetId);
  }
}
