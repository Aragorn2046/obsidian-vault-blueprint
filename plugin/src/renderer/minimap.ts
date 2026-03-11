// ─── Minimap — Small overview panel with viewport rectangle ──
// Shows the full graph in a corner, allows click-to-pan.
// DOM canvas overlay. Zero Obsidian dependencies.

import type { ThemeColors } from './theme';
import type { BlueprintData, NodeDef, GroupDef, CategoryDef } from '../types';
import { isNodeVisible } from './canvas';

export interface MinimapCallbacks {
  onPan: (worldX: number, worldY: number) => void;
}

export class Minimap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private container: HTMLDivElement;
  private wrapper: HTMLDivElement;
  private theme: ThemeColors;
  private callbacks: MinimapCallbacks;
  private visible = true;
  private dragging = false;

  // Cached data
  private data: BlueprintData | null = null;
  private organicRadii: Map<string, number> | null = null;
  private viewMode: 'schematic' | 'organic' = 'schematic';

  // Computed bounds
  private worldMinX = 0;
  private worldMinY = 0;
  private worldW = 1;
  private worldH = 1;

  // Minimap sizing
  private mapW = 200;
  private mapH = 140;

  constructor(
    container: HTMLDivElement,
    callbacks: MinimapCallbacks,
    theme: ThemeColors,
  ) {
    this.container = container;
    this.callbacks = callbacks;
    this.theme = theme;

    // Create wrapper div
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'blueprint-minimap';
    this.container.appendChild(this.wrapper);

    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.mapW * 2; // 2x for retina
    this.canvas.height = this.mapH * 2;
    this.canvas.style.width = this.mapW + 'px';
    this.canvas.style.height = this.mapH + 'px';
    this.wrapper.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;

    // Interaction
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    this.canvas.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('mouseup', this.onMouseUp);
    this.canvas.addEventListener('mouseleave', this.onMouseUp);
  }

  /** Update data for minimap rendering */
  setData(
    data: BlueprintData,
    viewMode: 'schematic' | 'organic',
    organicRadii?: Map<string, number>,
  ): void {
    this.data = data;
    this.viewMode = viewMode;
    this.organicRadii = organicRadii ?? null;
    this.computeBounds();
  }

  /** Draw the minimap with current viewport */
  draw(panX: number, panY: number, zoom: number, canvasW: number, canvasH: number): void {
    if (!this.visible || !this.data) return;

    const ctx = this.ctx;
    const dpr = 2;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.mapW, this.mapH);

    // Background
    ctx.fillStyle = this.theme.background;
    ctx.fillRect(0, 0, this.mapW, this.mapH);
    ctx.strokeStyle = this.theme.gridMajor;
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, this.mapW, this.mapH);

    if (this.worldW <= 0 || this.worldH <= 0) return;

    // Scale factor: fit entire graph into minimap
    const pad = 10;
    const scaleX = (this.mapW - pad * 2) / this.worldW;
    const scaleY = (this.mapH - pad * 2) / this.worldH;
    const scale = Math.min(scaleX, scaleY);
    const offsetX = pad + ((this.mapW - pad * 2) - this.worldW * scale) / 2;
    const offsetY = pad + ((this.mapH - pad * 2) - this.worldH * scale) / 2;

    const toMapX = (wx: number) => (wx - this.worldMinX) * scale + offsetX;
    const toMapY = (wy: number) => (wy - this.worldMinY) * scale + offsetY;

    // Draw nodes as small dots/rectangles
    for (const node of this.data.nodes) {
      if (!isNodeVisible(node, this.data.categories)) continue;

      const cat = this.data.categories[node.cat];
      const color = cat?.color ?? '#888';

      if (this.viewMode === 'organic') {
        const r = Math.max(1.5, (this.organicRadii?.get(node.id) ?? 35) * scale);
        ctx.beginPath();
        ctx.arc(toMapX(node.x), toMapY(node.y), r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      } else {
        const nw = Math.max(2, 220 * scale);
        const nh = Math.max(1.5, 60 * scale);
        ctx.fillStyle = color;
        ctx.fillRect(toMapX(node.x), toMapY(node.y), nw, nh);
      }
    }

    // Draw viewport rectangle
    const vpWorldX = -panX / zoom;
    const vpWorldY = -panY / zoom;
    const vpWorldW = canvasW / zoom;
    const vpWorldH = canvasH / zoom;

    const vpX = toMapX(vpWorldX);
    const vpY = toMapY(vpWorldY);
    const vpW = vpWorldW * scale;
    const vpH = vpWorldH * scale;

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.8;
    ctx.strokeRect(vpX, vpY, vpW, vpH);
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.05;
    ctx.fillRect(vpX, vpY, vpW, vpH);
    ctx.globalAlpha = 1;
  }

  show(): void {
    this.visible = true;
    this.wrapper.style.display = 'block';
  }

  hide(): void {
    this.visible = false;
    this.wrapper.style.display = 'none';
  }

  toggle(): void {
    if (this.visible) this.hide();
    else this.show();
  }

  setTheme(theme: ThemeColors): void {
    this.theme = theme;
  }

  destroy(): void {
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mouseup', this.onMouseUp);
    this.canvas.removeEventListener('mouseleave', this.onMouseUp);
    if (this.wrapper.parentNode) {
      this.wrapper.parentNode.removeChild(this.wrapper);
    }
  }

  // ─── Internal ──────────────────────────────────────

  private computeBounds(): void {
    if (!this.data) return;

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const node of this.data.nodes) {
      if (!isNodeVisible(node, this.data.categories)) continue;

      if (this.viewMode === 'organic') {
        const r = this.organicRadii?.get(node.id) ?? 35;
        minX = Math.min(minX, node.x - r);
        minY = Math.min(minY, node.y - r);
        maxX = Math.max(maxX, node.x + r);
        maxY = Math.max(maxY, node.y + r);
      } else {
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
        maxX = Math.max(maxX, node.x + 220);
        maxY = Math.max(maxY, node.y + 60);
      }
    }

    if (minX === Infinity) {
      this.worldMinX = 0;
      this.worldMinY = 0;
      this.worldW = 1;
      this.worldH = 1;
      return;
    }

    this.worldMinX = minX - 50;
    this.worldMinY = minY - 50;
    this.worldW = maxX - minX + 100;
    this.worldH = maxY - minY + 100;
  }

  private screenToWorld(mx: number, my: number): { x: number; y: number } {
    const pad = 10;
    const scaleX = (this.mapW - pad * 2) / this.worldW;
    const scaleY = (this.mapH - pad * 2) / this.worldH;
    const scale = Math.min(scaleX, scaleY);
    const offsetX = pad + ((this.mapW - pad * 2) - this.worldW * scale) / 2;
    const offsetY = pad + ((this.mapH - pad * 2) - this.worldH * scale) / 2;

    return {
      x: (mx - offsetX) / scale + this.worldMinX,
      y: (my - offsetY) / scale + this.worldMinY,
    };
  }

  private onMouseDown = (e: MouseEvent): void => {
    e.stopPropagation();
    this.dragging = true;
    this.panToMouse(e);
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.dragging) return;
    e.stopPropagation();
    this.panToMouse(e);
  };

  private onMouseUp = (): void => {
    this.dragging = false;
  };

  private panToMouse(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const world = this.screenToWorld(mx, my);
    this.callbacks.onPan(world.x, world.y);
  }
}
