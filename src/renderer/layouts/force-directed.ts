// ─── Force-Directed Layout — Physics-based node positioning ──
// Nodes repel each other, wires attract connected nodes.
// Runs a fixed number of iterations to converge.
// Zero Obsidian dependencies. Pure computation.

import type { BlueprintData, NodeDef, WireDef } from '../../types';
import { getWireNodeIds } from '../canvas';

export interface ForceLayoutOptions {
  iterations?: number;
  repulsion?: number;
  attraction?: number;
  damping?: number;
  minDistance?: number;
  maxDisplacement?: number;
}

interface NodeVelocity {
  vx: number;
  vy: number;
}

/**
 * Get the organic radius for a node based on connection count.
 * Uses sqrt scaling for visual balance.
 */
export function organicRadius(nodeId: string, wires: WireDef[], sizing: boolean): number {
  if (!sizing) return 35;
  let count = 0;
  for (const w of wires) {
    const ends = getWireNodeIds(w);
    if (ends.from === nodeId || ends.to === nodeId) count++;
  }
  // Min 25, max 80, sqrt scaling
  return Math.max(25, Math.min(80, 20 + Math.sqrt(count) * 15));
}

/**
 * Apply force-directed layout to all nodes.
 * Nodes start at their current positions (or random if at 0,0).
 * After simulation, positions are updated in-place.
 */
export function applyForceLayout(
  data: BlueprintData,
  nodeMap: Record<string, NodeDef>,
  sizing: boolean,
  options?: ForceLayoutOptions,
): void {
  const nodes = data.nodes;
  if (nodes.length === 0) return;

  const iterations = options?.iterations ?? 300;
  const repulsion = options?.repulsion ?? 8000;
  const attraction = options?.attraction ?? 0.01;
  const damping = options?.damping ?? 0.92;
  const minDist = options?.minDistance ?? 30;
  const maxDisp = options?.maxDisplacement ?? 50;

  // Initialize positions if all at origin
  const allAtOrigin = nodes.every(n => n.x === 0 && n.y === 0);
  if (allAtOrigin) {
    // Spread in a circle
    const radius = Math.sqrt(nodes.length) * 80;
    for (let i = 0; i < nodes.length; i++) {
      const angle = (2 * Math.PI * i) / nodes.length;
      nodes[i].x = Math.cos(angle) * radius;
      nodes[i].y = Math.sin(angle) * radius;
    }
  }

  // Build adjacency for fast lookup
  const adjacency = new Map<string, Set<string>>();
  for (const n of nodes) {
    adjacency.set(n.id, new Set());
  }
  for (const w of data.wires) {
    const ends = getWireNodeIds(w);
    adjacency.get(ends.from)?.add(ends.to);
    adjacency.get(ends.to)?.add(ends.from);
  }

  // Velocity per node
  const vel = new Map<string, NodeVelocity>();
  for (const n of nodes) {
    vel.set(n.id, { vx: 0, vy: 0 });
  }

  // Get node radii
  const radii = new Map<string, number>();
  for (const n of nodes) {
    radii.set(n.id, organicRadius(n.id, data.wires, sizing));
  }

  // Simulation loop
  for (let iter = 0; iter < iterations; iter++) {
    const temp = 1 - iter / iterations; // cooling factor

    // Repulsion between all pairs
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      const va = vel.get(a.id)!;
      const ra = radii.get(a.id)!;

      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const vb = vel.get(b.id)!;
        const rb = radii.get(b.id)!;

        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) dist = minDist;

        // Increase repulsion based on node sizes
        const sizeBoost = (ra + rb) / 60;
        const force = (repulsion * sizeBoost) / (dist * dist);
        const fx = (dx / dist) * force * temp;
        const fy = (dy / dist) * force * temp;

        va.vx += fx;
        va.vy += fy;
        vb.vx -= fx;
        vb.vy -= fy;
      }
    }

    // Attraction along wires
    for (const w of data.wires) {
      const ends = getWireNodeIds(w);
      const a = nodeMap[ends.from];
      const b = nodeMap[ends.to];
      if (!a || !b) continue;

      const va = vel.get(a.id)!;
      const vb = vel.get(b.id)!;

      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) dist = 1;

      // Target distance based on combined radii
      const ra = radii.get(a.id)!;
      const rb = radii.get(b.id)!;
      const idealDist = (ra + rb) * 2.5;

      const force = attraction * (dist - idealDist) * temp;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      va.vx += fx;
      va.vy += fy;
      vb.vx -= fx;
      vb.vy -= fy;
    }

    // Apply velocities with damping and max displacement
    for (const n of nodes) {
      const v = vel.get(n.id)!;
      v.vx *= damping;
      v.vy *= damping;

      // Clamp displacement
      const disp = Math.sqrt(v.vx * v.vx + v.vy * v.vy);
      if (disp > maxDisp * temp) {
        const scale = (maxDisp * temp) / disp;
        v.vx *= scale;
        v.vy *= scale;
      }

      n.x += v.vx;
      n.y += v.vy;
    }
  }

  // Center the result around the origin
  let cx = 0, cy = 0;
  for (const n of nodes) {
    cx += n.x;
    cy += n.y;
  }
  cx /= nodes.length;
  cy /= nodes.length;
  for (const n of nodes) {
    n.x -= cx - 500;
    n.y -= cy - 500;
  }

  // Clear groups for organic mode (no category boxes)
  data.groups = [];
}
