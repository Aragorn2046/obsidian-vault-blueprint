// ─── Organic Controls Panel — Sliders for force parameters ───
// DOM-based overlay panel matching Obsidian's Graph View style.
// Zero Obsidian dependencies.

import type { OrganicForceSettings } from '../types';
import type { ThemeColors } from './theme';

export interface OrganicControlsCallbacks {
  onForceChange: (forces: OrganicForceSettings) => void;
  onAnimate: () => void;
}

export class OrganicControlsPanel {
  private el: HTMLDivElement;
  private container: HTMLDivElement;
  private callbacks: OrganicControlsCallbacks;
  private forces: OrganicForceSettings;
  private visible = false;

  constructor(
    container: HTMLDivElement,
    callbacks: OrganicControlsCallbacks,
    forces: OrganicForceSettings,
    theme: ThemeColors,
  ) {
    this.container = container;
    this.callbacks = callbacks;
    this.forces = { ...forces };

    this.el = document.createElement('div');
    this.el.className = 'blueprint-organic-controls';
    this.container.appendChild(this.el);

    this.render();
  }

  show(): void {
    this.visible = true;
    this.el.style.display = 'block';
  }

  hide(): void {
    this.visible = false;
    this.el.style.display = 'none';
  }

  toggle(): void {
    if (this.visible) this.hide();
    else this.show();
  }

  isVisible(): boolean {
    return this.visible;
  }

  setForces(forces: OrganicForceSettings): void {
    this.forces = { ...forces };
    this.render();
  }

  setTheme(_theme: ThemeColors): void {
    // Theme handled via CSS vars
  }

  destroy(): void {
    if (this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
  }

  private render(): void {
    // Clear existing content safely
    while (this.el.firstChild) {
      this.el.removeChild(this.el.firstChild);
    }

    // ─── Display section ─────────────────────────────
    this.addSectionHeader('Display');

    this.addToggle('Arrows', this.forces.arrows, (val) => {
      this.forces.arrows = val;
      this.emit();
    });

    this.addSlider('Text fade threshold', this.forces.textFadeThreshold, 0, 1, 0.01, (val) => {
      this.forces.textFadeThreshold = val;
      this.emit();
    });

    this.addSlider('Node size', this.forces.nodeSize, 0.1, 1, 0.01, (val) => {
      this.forces.nodeSize = val;
      this.emit();
    });

    this.addSlider('Link thickness', this.forces.linkThickness, 0.1, 1, 0.01, (val) => {
      this.forces.linkThickness = val;
      this.emit();
    });

    // Redistribute button
    const animBtn = document.createElement('button');
    animBtn.className = 'blueprint-organic-animate-btn';
    animBtn.textContent = 'Redistribute';
    animBtn.title = 'Restart physics simulation — nodes rearrange to reduce overlap and find optimal positions';
    animBtn.addEventListener('click', () => this.callbacks.onAnimate());
    this.el.appendChild(animBtn);

    // ─── Forces section ──────────────────────────────
    this.addSectionHeader('Forces');

    this.addSlider('Center force', this.forces.centerForce, 0, 1, 0.01, (val) => {
      this.forces.centerForce = val;
      this.emit();
    });

    this.addSlider('Repel force', this.forces.repelForce, 0, 1, 0.01, (val) => {
      this.forces.repelForce = val;
      this.emit();
    });

    this.addSlider('Link force', this.forces.linkForce, 0, 1, 0.01, (val) => {
      this.forces.linkForce = val;
      this.emit();
    });

    this.addSlider('Link distance', this.forces.linkDistance, 0, 1, 0.01, (val) => {
      this.forces.linkDistance = val;
      this.emit();
    });
  }

  private addSectionHeader(label: string): void {
    const header = document.createElement('div');
    header.className = 'blueprint-organic-section';
    header.textContent = label;
    this.el.appendChild(header);
  }

  private addSlider(
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (val: number) => void,
  ): void {
    const row = document.createElement('div');
    row.className = 'blueprint-organic-row';

    const labelEl = document.createElement('div');
    labelEl.className = 'blueprint-organic-label';
    labelEl.textContent = label;
    row.appendChild(labelEl);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'blueprint-organic-slider';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(value);
    slider.addEventListener('input', () => {
      onChange(parseFloat(slider.value));
    });
    row.appendChild(slider);

    this.el.appendChild(row);
  }

  private addToggle(
    label: string,
    value: boolean,
    onChange: (val: boolean) => void,
  ): void {
    const row = document.createElement('div');
    row.className = 'blueprint-organic-row blueprint-organic-toggle-row';

    const labelEl = document.createElement('div');
    labelEl.className = 'blueprint-organic-label';
    labelEl.textContent = label;
    row.appendChild(labelEl);

    const toggle = document.createElement('div');
    toggle.className = 'blueprint-organic-toggle' + (value ? ' is-active' : '');
    toggle.addEventListener('click', () => {
      const newVal = !toggle.classList.contains('is-active');
      if (newVal) toggle.classList.add('is-active');
      else toggle.classList.remove('is-active');
      onChange(newVal);
    });

    const knob = document.createElement('div');
    knob.className = 'blueprint-organic-toggle-knob';
    toggle.appendChild(knob);
    row.appendChild(toggle);

    this.el.appendChild(row);
  }

  private emit(): void {
    this.callbacks.onForceChange({ ...this.forces });
  }
}
