// ─── Layout — Group-based 2D layout for auto-positioning ────
// Distributes nodes by category/group across a 2D canvas with
// generous spacing and subtle stagger for organic feel.
// Zero Obsidian dependencies. Pure computation.

import type { BlueprintData, NodeDef, GroupDef } from '../types';
import { NODE_W, PIN_H, estimateTitleLines, headerHeight } from './canvas';

export interface LayoutOptions {
  nodeWidth?: number;
  layerGap?: number;
  nodeGap?: number;
  groupPadding?: number;
}

/**
 * Assign positions to nodes using a group-based 2D layout.
 * Nodes clustered by category, arranged in columns within groups,
 * groups shelf-packed into rows. Alternate columns are staggered
 * vertically for a more organic look.
 *
 * SKIP: If ALL nodes already have positions (from persistence).
 * PARTIAL: If some nodes have positions and some don't, only
 * layout the unpositioned nodes near their category group.
 */
export function applyLayout(
  data: BlueprintData,
  _nodeMap: Record<string, NodeDef>,
  options?: LayoutOptions,
): void {
  if (data.nodes.length === 0) return;

  const positioned = data.nodes.filter(n => n.x !== 0 || n.y !== 0);
  const unpositioned = data.nodes.filter(n => n.x === 0 && n.y === 0);

  // All nodes have saved positions — skip layout entirely
  if (unpositioned.length === 0) return;

  // Some nodes have positions — place unpositioned ones near their category peers
  if (positioned.length > 0 && unpositioned.length > 0) {
    placeNewNodes(data, unpositioned);
    return;
  }

  // No nodes have positions — full layout

  const GROUP_PAD = options?.groupPadding ?? 70;
  const NODE_GAP_X = 50;
  const NODE_GAP_Y = 30;
  const GROUP_GAP = 100;
  const NODES_PER_COL = 6;
  const STAGGER_Y = 18; // Alternate columns offset down by this much

  // ─── Step 1: Cluster nodes by category ───────────────────
  const catNodes: Record<string, NodeDef[]> = {};
  for (const node of data.nodes) {
    const key = node.cat || 'default';
    if (!catNodes[key]) catNodes[key] = [];
    catNodes[key].push(node);
  }

  const catKeys = Object.keys(catNodes).sort(
    (a, b) => catNodes[b].length - catNodes[a].length
  );

  for (const key of catKeys) {
    catNodes[key].sort((a, b) => a.title.localeCompare(b.title));
  }

  // ─── Step 2: Node height helper ────────────────────────────
  function nodeHeight(node: NodeDef): number {
    const titleLines = estimateTitleLines(node.title, NODE_W);
    const hh = headerHeight(titleLines);
    const pinRows = Math.max(node.pins.in.length, node.pins.out.length, 1);
    return hh + pinRows * PIN_H + 8;
  }

  // ─── Step 3: Layout each category group ────────────────────
  interface GroupBlock {
    catKey: string;
    nodes: NodeDef[];
    blockW: number;
    blockH: number;
  }

  const blocks: GroupBlock[] = [];

  for (const catKey of catKeys) {
    const nodes = catNodes[catKey];
    const numCols = Math.ceil(nodes.length / NODES_PER_COL);

    const colHeights: number[] = [];

    for (let col = 0; col < numCols; col++) {
      let colH = 0;
      const startIdx = col * NODES_PER_COL;
      const endIdx = Math.min(startIdx + NODES_PER_COL, nodes.length);
      for (let i = startIdx; i < endIdx; i++) {
        colH += nodeHeight(nodes[i]) + NODE_GAP_Y;
      }
      colH -= NODE_GAP_Y;
      colHeights.push(Math.max(colH, 0));
    }

    // Place nodes in staggered columns
    let xOff = GROUP_PAD;
    let maxColBottom = 0;
    for (let col = 0; col < numCols; col++) {
      const stagger = (col % 2 === 1) ? STAGGER_Y : 0;
      let yOff = GROUP_PAD + stagger;
      const startIdx = col * NODES_PER_COL;
      const endIdx = Math.min(startIdx + NODES_PER_COL, nodes.length);
      for (let i = startIdx; i < endIdx; i++) {
        nodes[i].x = xOff;
        nodes[i].y = yOff;
        yOff += nodeHeight(nodes[i]) + NODE_GAP_Y;
      }
      maxColBottom = Math.max(maxColBottom, yOff - NODE_GAP_Y);
      xOff += NODE_W + NODE_GAP_X;
    }

    const blockW = numCols * (NODE_W + NODE_GAP_X) - NODE_GAP_X + GROUP_PAD * 2;
    const blockH = maxColBottom - 0 + GROUP_PAD; // from top of group to bottom + pad

    blocks.push({ catKey, nodes, blockW, blockH });
  }

  // ─── Step 4: Shelf-pack group blocks ───────────────────────
  const totalArea = blocks.reduce((sum, b) => sum + b.blockW * b.blockH, 0);
  const targetWidth = Math.max(Math.sqrt(totalArea) * 1.5, 3500);

  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;

  const groupDefs: GroupDef[] = [];

  for (const block of blocks) {
    if (cursorX > 0 && cursorX + block.blockW > targetWidth) {
      cursorX = 0;
      cursorY += rowHeight + GROUP_GAP;
      rowHeight = 0;
    }

    for (const node of block.nodes) {
      node.x += cursorX;
      node.y += cursorY;
    }

    const cat = data.categories[block.catKey];
    if (cat && block.nodes.length >= 1) {
      groupDefs.push({
        label: cat.label,
        color: cat.color,
        x: cursorX,
        y: cursorY,
        w: block.blockW,
        h: block.blockH,
        catRef: block.catKey,
        nodeIds: block.nodes.map(n => n.id),
      });
    }

    cursorX += block.blockW + GROUP_GAP;
    rowHeight = Math.max(rowHeight, block.blockH);
  }

  // ─── Step 5: Apply group boxes ─────────────────────────────
  if (data.groups.every(g => g.w === 0 && g.h === 0)) {
    data.groups = groupDefs;
  } else {
    recalcGroupBounds(data);
  }
}

/**
 * Place unpositioned nodes near their category peers.
 * Finds the average position of same-category nodes and places
 * the new node below them with some offset.
 */
function placeNewNodes(data: BlueprintData, unpositioned: NodeDef[]): void {
  const catPositions: Record<string, { sumX: number; sumY: number; maxY: number; count: number }> = {};

  for (const node of data.nodes) {
    if (node.x === 0 && node.y === 0) continue;
    const cat = node.cat || 'default';
    if (!catPositions[cat]) catPositions[cat] = { sumX: 0, sumY: 0, maxY: 0, count: 0 };
    catPositions[cat].sumX += node.x;
    catPositions[cat].sumY += node.y;
    catPositions[cat].maxY = Math.max(catPositions[cat].maxY, node.y);
    catPositions[cat].count++;
  }

  let fallbackY = 0;
  for (const node of data.nodes) {
    const nh = (node as any).h ?? 60;
    fallbackY = Math.max(fallbackY, node.y + nh);
  }
  fallbackY += 100; // Place below all existing nodes

  let offsetIdx = 0;
  for (const node of unpositioned) {
    const cat = node.cat || 'default';
    const catPos = catPositions[cat];
    if (catPos && catPos.count > 0) {
      // Place below the group's lowest node
      node.x = catPos.sumX / catPos.count;
      node.y = catPos.maxY + 100 + offsetIdx * 80;
    } else {
      // No category peers — place at bottom
      node.x = offsetIdx * (NODE_W + 50);
      node.y = fallbackY;
    }
    offsetIdx++;
  }

  // Recalculate group bounds
  recalcGroupBounds(data);
}

/**
 * Recalculate group bounding boxes from actual node positions.
 */
function recalcGroupBounds(data: BlueprintData): void {
  const catNodes: Record<string, NodeDef[]> = {};
  for (const node of data.nodes) {
    const key = node.cat || 'default';
    if (!catNodes[key]) catNodes[key] = [];
    catNodes[key].push(node);
  }

  for (const group of data.groups) {
    const matchingCat = Object.entries(data.categories).find(
      ([, cat]) => cat.color === group.color || cat.label === group.label
    );
    if (!matchingCat) continue;

    const nodes = catNodes[matchingCat[0]];
    if (!nodes || nodes.length === 0) continue;

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const n of nodes) {
      const tl = estimateTitleLines(n.title, NODE_W);
      const nh = headerHeight(tl) + Math.max(n.pins.in.length, n.pins.out.length, 1) * PIN_H + 8;
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + NODE_W);
      maxY = Math.max(maxY, n.y + nh);
    }

    const pad = 70;
    group.x = minX - pad;
    group.y = minY - pad;
    group.w = maxX - minX + pad * 2;
    group.h = maxY - minY + pad * 2;
  }
}
