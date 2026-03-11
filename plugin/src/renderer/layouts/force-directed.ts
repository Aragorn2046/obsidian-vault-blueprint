// ─── Force-Directed Layout — Live physics simulation ─────────
// Continuous simulation that runs every frame.
// Dragging a node pins it; other nodes react in real-time.
// Zero Obsidian dependencies. Pure computation.

import type { BlueprintData, NodeDef, WireDef, OrganicForceSettings, DEFAULT_ORGANIC_FORCES } from '../../types';
import { getWireNodeIds } from '../canvas';

/**
 * Get the organic radius for a node based on connection count.
 * nodeSize parameter (0-1) scales the result.
 */
export function organicRadius(
  nodeId: string,
  wires: WireDef[],
  sizing: boolean,
  nodeSize: number = 0.4,
): number {
  const baseMin = 15;
  const baseMax = 70;
  const sizeScale = 0.5 + nodeSize * 1.5; // 0.5x at 0, 2x at 1

  if (!sizing) return Math.max(15, 30 * sizeScale);

  let count = 0;
  for (const w of wires) {
    const ends = getWireNodeIds(w);
    if (ends.from === nodeId || ends.to === nodeId) count++;
  }
  const raw = baseMin + Math.sqrt(count) * 12;
  return Math.max(baseMin, Math.min(baseMax, raw)) * sizeScale;
}

// ─── Simulation State ───────────────────────────────────────

interface NodeState {
  vx: number;
  vy: number;
  fx: number; // accumulated force this tick
  fy: number;
  pinned: boolean; // true while being dragged
}

export class ForceSimulation {
  private data: BlueprintData;
  private nodeMap: Record<string, NodeDef>;
  private states: Map<string, NodeState> = new Map();
  private adjacency: Map<string, Set<string>> = new Map();
  private radii: Map<string, number> = new Map();

  // Runtime params (updated by sliders)
  private forces: OrganicForceSettings;
  private sizing: boolean;
  private alpha = 1.0;          // energy level (decays toward 0)
  private alphaTarget = 0.0;    // target energy (0 = settle, >0 = active)
  private alphaDecay = 0.02;    // how fast alpha decays
  private alphaMin = 0.001;     // below this, simulation sleeps
  private velocityDecay = 0.6;  // velocity damping per tick
  private initialized = false;

  constructor(
    data: BlueprintData,
    nodeMap: Record<string, NodeDef>,
    sizing: boolean,
    forces: OrganicForceSettings,
  ) {
    this.data = data;
    this.nodeMap = nodeMap;
    this.sizing = sizing;
    this.forces = { ...forces };
    this.initialize();
  }

  private initialize(): void {
    const nodes = this.data.nodes;

    // Spread nodes in a circle if all at origin
    const allAtOrigin = nodes.every(n => n.x === 0 && n.y === 0);
    if (allAtOrigin) {
      const radius = Math.sqrt(nodes.length) * 100;
      for (let i = 0; i < nodes.length; i++) {
        const angle = (2 * Math.PI * i) / nodes.length;
        nodes[i].x = 500 + Math.cos(angle) * radius;
        nodes[i].y = 500 + Math.sin(angle) * radius;
      }
    }

    // Build adjacency
    this.adjacency.clear();
    for (const n of nodes) {
      this.adjacency.set(n.id, new Set());
    }
    for (const w of this.data.wires) {
      const ends = getWireNodeIds(w);
      this.adjacency.get(ends.from)?.add(ends.to);
      this.adjacency.get(ends.to)?.add(ends.from);
    }

    // Init node states
    this.states.clear();
    for (const n of nodes) {
      this.states.set(n.id, { vx: 0, vy: 0, fx: 0, fy: 0, pinned: false });
    }

    // Compute radii
    this.updateRadii();

    // Start with high energy
    this.alpha = 1.0;
    this.alphaTarget = 0.0;
    this.initialized = true;

    // Clear groups for organic mode
    this.data.groups = [];
  }

  /** Recompute radii (call when sizing or nodeSize changes) */
  updateRadii(): void {
    this.radii.clear();
    for (const n of this.data.nodes) {
      this.radii.set(
        n.id,
        organicRadius(n.id, this.data.wires, this.sizing, this.forces.nodeSize),
      );
    }
  }

  /** Get computed radii map */
  getRadii(): Map<string, number> {
    return this.radii;
  }

  /** Update force parameters from sliders */
  setForces(forces: OrganicForceSettings): void {
    this.forces = { ...forces };
    this.updateRadii();
    // Wake up simulation when settings change
    this.alpha = Math.max(this.alpha, 0.3);
  }

  /** Pin a node (during drag) */
  pinNode(nodeId: string): void {
    const state = this.states.get(nodeId);
    if (state) {
      state.pinned = true;
      state.vx = 0;
      state.vy = 0;
    }
    // Wake up simulation during drag
    this.alpha = Math.max(this.alpha, 0.5);
    this.alphaTarget = 0.3;
  }

  /** Unpin a node (drag end) */
  unpinNode(nodeId: string): void {
    const state = this.states.get(nodeId);
    if (state) {
      state.pinned = false;
    }
    // Let simulation settle
    this.alphaTarget = 0.0;
  }

  /** Reheat the simulation (e.g. after pressing Animate) */
  reheat(): void {
    this.alpha = 1.0;
    this.alphaTarget = 0.0;
    // Give small random kicks to break symmetry
    for (const n of this.data.nodes) {
      const state = this.states.get(n.id);
      if (state && !state.pinned) {
        state.vx += (Math.random() - 0.5) * 10;
        state.vy += (Math.random() - 0.5) * 10;
      }
    }
  }

  /** Is the simulation still active? */
  isActive(): boolean {
    return this.alpha >= this.alphaMin;
  }

  /** Update data references (after rescan), preserving existing positions */
  setData(data: BlueprintData, nodeMap: Record<string, NodeDef>): void {
    // Save existing positions and states
    const oldPositions = new Map<string, { x: number; y: number }>();
    const oldStates = new Map<string, NodeState>();
    for (const n of this.data.nodes) {
      oldPositions.set(n.id, { x: n.x, y: n.y });
    }
    for (const [id, state] of this.states) {
      oldStates.set(id, { ...state });
    }

    this.data = data;
    this.nodeMap = nodeMap;

    // Rebuild adjacency
    this.adjacency.clear();
    for (const n of data.nodes) {
      this.adjacency.set(n.id, new Set());
    }
    for (const w of data.wires) {
      const ends = getWireNodeIds(w);
      this.adjacency.get(ends.from)?.add(ends.to);
      this.adjacency.get(ends.to)?.add(ends.from);
    }

    // Restore positions for existing nodes, scatter new ones near center
    let cx = 0, cy = 0, count = 0;
    for (const n of data.nodes) {
      const old = oldPositions.get(n.id);
      if (old) {
        n.x = old.x;
        n.y = old.y;
        cx += n.x; cy += n.y; count++;
      }
    }
    if (count > 0) { cx /= count; cy /= count; }

    // Init states — reuse old states, create new ones for new nodes
    this.states.clear();
    let hasNewNodes = false;
    for (const n of data.nodes) {
      const old = oldStates.get(n.id);
      if (old) {
        this.states.set(n.id, old);
      } else {
        // New node — place near centroid with jitter
        if (n.x === 0 && n.y === 0) {
          n.x = cx + (Math.random() - 0.5) * 200;
          n.y = cy + (Math.random() - 0.5) * 200;
        }
        this.states.set(n.id, { vx: 0, vy: 0, fx: 0, fy: 0, pinned: false });
        hasNewNodes = true;
      }
    }

    this.updateRadii();
    this.data.groups = [];

    // Only gently reheat if there are new nodes — otherwise don't disturb
    if (hasNewNodes) {
      this.alpha = Math.max(this.alpha, 0.3);
    }
    // Don't reset alpha to 1.0 — that's what caused the periodic redistribution
  }

  /**
   * Run one tick of the simulation.
   * Returns true if nodes moved (needs redraw).
   */
  tick(): boolean {
    if (!this.initialized) return false;
    if (this.alpha < this.alphaMin) return false;

    const nodes = this.data.nodes;
    const wires = this.data.wires;

    // Decay alpha toward target
    this.alpha += (this.alphaTarget - this.alpha) * this.alphaDecay;

    // Scale factors from 0-1 sliders to actual force magnitudes
    // Repulsion scales with sqrt(nodeCount) so large graphs auto-space
    const nodeScale = Math.sqrt(Math.max(nodes.length, 10));
    const centerStrength = this.forces.centerForce * 0.08;
    const repelStrength = this.forces.repelForce * 25000 * (nodeScale / 3);
    const linkStrength = this.forces.linkForce * 0.06;
    const idealDist = 80 + this.forces.linkDistance * 500;

    // Reset forces
    for (const state of this.states.values()) {
      state.fx = 0;
      state.fy = 0;
    }

    // ─── Center force: pull all nodes toward centroid ────
    if (centerStrength > 0) {
      let cx = 0, cy = 0;
      for (const n of nodes) { cx += n.x; cy += n.y; }
      cx /= nodes.length;
      cy /= nodes.length;

      for (const n of nodes) {
        const state = this.states.get(n.id)!;
        state.fx -= (n.x - cx) * centerStrength * this.alpha;
        state.fy -= (n.y - cy) * centerStrength * this.alpha;
      }
    }

    // ─── Repulsion: all pairs ────────────────────────────
    if (repelStrength > 0) {
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        const sa = this.states.get(a.id)!;
        const ra = this.radii.get(a.id) ?? 30;

        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const sb = this.states.get(b.id)!;
          const rb = this.radii.get(b.id) ?? 30;

          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 1) {
            // Jitter to prevent overlap at exact same position
            dx = (Math.random() - 0.5) * 2;
            dy = (Math.random() - 0.5) * 2;
            dist = Math.sqrt(dx * dx + dy * dy);
          }

          const minDist = ra + rb + 10;
          const sizeBoost = (ra + rb) / 50;
          const force = (repelStrength * sizeBoost * this.alpha) / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          sa.fx += fx;
          sa.fy += fy;
          sb.fx -= fx;
          sb.fy -= fy;

          // Extra strong repulsion when overlapping
          if (dist < minDist) {
            const overlap = (minDist - dist) * 0.5;
            const ox = (dx / dist) * overlap;
            const oy = (dy / dist) * overlap;
            sa.fx += ox;
            sa.fy += oy;
            sb.fx -= ox;
            sb.fy -= oy;
          }
        }
      }
    }

    // ─── Link force: attraction along wires ──────────────
    if (linkStrength > 0) {
      for (const w of wires) {
        const ends = getWireNodeIds(w);
        const a = this.nodeMap[ends.from];
        const b = this.nodeMap[ends.to];
        if (!a || !b) continue;

        const sa = this.states.get(a.id)!;
        const sb = this.states.get(b.id)!;

        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) dist = 1;

        const force = (dist - idealDist) * linkStrength * this.alpha;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        sa.fx += fx;
        sa.fy += fy;
        sb.fx -= fx;
        sb.fy -= fy;
      }
    }

    // ─── Apply forces ────────────────────────────────────
    let moved = false;
    for (const n of nodes) {
      const state = this.states.get(n.id)!;
      if (state.pinned) continue;

      state.vx = (state.vx + state.fx) * this.velocityDecay;
      state.vy = (state.vy + state.fy) * this.velocityDecay;

      // Clamp velocity
      const speed = Math.sqrt(state.vx * state.vx + state.vy * state.vy);
      const maxSpeed = 30;
      if (speed > maxSpeed) {
        state.vx = (state.vx / speed) * maxSpeed;
        state.vy = (state.vy / speed) * maxSpeed;
      }

      if (Math.abs(state.vx) > 0.01 || Math.abs(state.vy) > 0.01) {
        n.x += state.vx;
        n.y += state.vy;
        moved = true;
      }
    }

    return moved;
  }
}

/**
 * One-shot layout for initial positioning (backward compat).
 * Runs the simulation to completion.
 */
export function applyForceLayout(
  data: BlueprintData,
  nodeMap: Record<string, NodeDef>,
  sizing: boolean,
  forces?: OrganicForceSettings,
): void {
  const defaultForces: OrganicForceSettings = forces ?? {
    centerForce: 0.3,
    repelForce: 0.5,
    linkForce: 0.4,
    linkDistance: 0.5,
    nodeSize: 0.4,
    linkThickness: 0.3,
    arrows: true,
    textFadeThreshold: 0.3,
  };

  const sim = new ForceSimulation(data, nodeMap, sizing, defaultForces);
  // Run 300 ticks to converge
  for (let i = 0; i < 300; i++) {
    if (!sim.tick()) break;
  }
}
