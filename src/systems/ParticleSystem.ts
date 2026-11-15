/**
 * Tiny pixel particles: dust puffs, laser sparks, thruster flames,
 * bubbles, debris and floating "+1" text.
 */
import { type Ctx } from '../core/canvas';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  grav: number;
  drag: number;
  text?: string;
  ceil?: number;
}

const MAX = 700;

export class ParticleSystem {
  private list: Particle[] = [];

  private add(p: Particle): void {
    if (this.list.length >= MAX) this.list.shift();
    this.list.push(p);
  }

  dust(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      this.add({
        x: x + (Math.random() - 0.5) * 8,
        y: y - Math.random() * 2,
        vx: (Math.random() - 0.5) * 40,
        vy: -10 - Math.random() * 25,
        life: 0.6 + Math.random() * 0.6,
        max: 1.2,
        color: Math.random() < 0.5 ? '#d9925e' : '#b8673e',
        size: Math.random() < 0.3 ? 2 : 1,
        grav: 30,
        drag: 1.5,
      });
    }
  }

  sparks(x: number, y: number, n: number, color = '#ffe08a'): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 30 + Math.random() * 70;
      this.add({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 20,
        life: 0.25 + Math.random() * 0.3,
        max: 0.5,
        color: Math.random() < 0.5 ? color : '#ffffff',
        size: 1,
        grav: 200,
        drag: 1,
      });
    }
  }

  thrust(x: number, y: number): void {
    this.add({
      x: x + (Math.random() - 0.5) * 3,
      y,
      vx: (Math.random() - 0.5) * 20,
      vy: 60 + Math.random() * 40,
      life: 0.25 + Math.random() * 0.15,
      max: 0.4,
      color: Math.random() < 0.4 ? '#ffd166' : Math.random() < 0.5 ? '#ff9a3a' : '#fff3c4',
      size: Math.random() < 0.5 ? 2 : 1,
      grav: 0,
      drag: 2,
    });
  }

  bubbles(x: number, y: number, n: number, color: string, ceil?: number): void {
    for (let i = 0; i < n; i++) {
      this.add({
        x,
        y,
        vx: (Math.random() - 0.5) * 4,
        vy: -12 - Math.random() * 14,
        life: 1.6 + Math.random(),
        max: 2.6,
        color,
        size: 1,
        grav: -4,
        drag: 0.2,
        ceil: ceil ?? y - 30,
      });
    }
  }

  debris(x: number, y: number, color: string, n = 6): void {
    for (let i = 0; i < n; i++) {
      this.add({
        x: x + (Math.random() - 0.5) * 10,
        y: y + (Math.random() - 0.5) * 10,
        vx: (Math.random() - 0.5) * 90,
        vy: -40 - Math.random() * 70,
        life: 0.6 + Math.random() * 0.5,
        max: 1.1,
        color,
        size: Math.random() < 0.5 ? 2 : 1,
        grav: 380,
        drag: 0.5,
      });
    }
  }

  burst(x: number, y: number, n: number, color: string, speed = 80): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.add({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.5 + Math.random() * 0.6,
        max: 1.1,
        color,
        size: Math.random() < 0.4 ? 2 : 1,
        grav: 60,
        drag: 1.2,
      });
    }
  }

  floatText(x: number, y: number, text: string, color: string): void {
    this.add({ x, y, vx: 0, vy: -22, life: 1.2, max: 1.2, color, size: 1, grav: 0, drag: 1, text });
  }

  update(dt: number): void {
    const out: Particle[] = [];
    for (const p of this.list) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy += p.grav * dt;
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d;
      p.vy *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.ceil !== undefined && p.y < p.ceil) continue;
      out.push(p);
    }
    this.list = out;
  }

  render(g: Ctx, camX: number, camY: number): void {
    g.font = '8px "Press Start 2P", monospace';
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    for (const p of this.list) {
      const a = Math.min(1, p.life / (p.max * 0.5));
      g.globalAlpha = a;
      const x = Math.round(p.x - camX);
      const y = Math.round(p.y - camY);
      if (p.text) {
        g.fillStyle = '#1b1012';
        g.fillText(p.text, x + 1, y + 1);
        g.fillStyle = p.color;
        g.fillText(p.text, x, y);
      } else {
        g.fillStyle = p.color;
        g.fillRect(x, y, p.size, p.size);
      }
    }
    g.globalAlpha = 1;
    g.textAlign = 'left';
  }

  clear(): void {
    this.list = [];
  }
}
