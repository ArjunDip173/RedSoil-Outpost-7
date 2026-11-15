/**
 * Darkness for night-time and underground, with soft holes cut out by lamps
 * (helmet light, rover headlights, habitat windows, LUNA, glowing ice).
 */
import { type Ctx, makeCanvas } from '../core/canvas';
import type { TileMap } from '../world/TileMap';

interface Light {
  x: number;
  y: number;
  r: number;
  i: number;
}

export class Lighting {
  private canvas: HTMLCanvasElement;
  private g: Ctx;
  private lights: Light[] = [];
  private glows: { x: number; y: number; color: string }[] = [];

  constructor() {
    [this.canvas, this.g] = makeCanvas(16, 16);
  }

  begin(vw: number, vh: number): void {
    if (this.canvas.width !== vw || this.canvas.height !== vh) {
      this.canvas.width = vw;
      this.canvas.height = vh;
      this.g.imageSmoothingEnabled = false;
    }
    this.lights.length = 0;
    this.glows.length = 0;
  }

  add = (x: number, y: number, r: number, i: number): void => {
    this.lights.push({ x, y, r, i });
  };

  glow(x: number, y: number, color: string): void {
    this.glows.push({ x, y, color });
  }

  render(target: Ctx, map: TileMap, camX: number, camY: number, vw: number, vh: number, night: number): void {
    const g = this.g;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, vw, vh);
    map.renderDarkness(g, camX, camY, vw, vh, night);
    g.globalCompositeOperation = 'destination-out';
    for (const l of this.lights) {
      const x = l.x - camX;
      const y = l.y - camY;
      if (x < -l.r || y < -l.r || x > vw + l.r || y > vh + l.r) continue;
      const grad = g.createRadialGradient(x, y, 0, x, y, l.r);
      grad.addColorStop(0, `rgba(0,0,0,${l.i})`);
      grad.addColorStop(0.55, `rgba(0,0,0,${l.i * 0.6})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(x - l.r, y - l.r, l.r * 2, l.r * 2);
    }
    g.globalCompositeOperation = 'source-over';
    target.drawImage(this.canvas, 0, 0);
    // additive coloured glows on top
    if (this.glows.length) {
      target.save();
      target.globalCompositeOperation = 'lighter';
      for (const gl of this.glows) {
        const x = gl.x - camX;
        const y = gl.y - camY;
        const grad = target.createRadialGradient(x, y, 0, x, y, 14);
        grad.addColorStop(0, gl.color + '55');
        grad.addColorStop(1, gl.color + '00');
        target.fillStyle = grad;
        target.fillRect(x - 14, y - 14, 28, 28);
      }
      target.restore();
    }
  }
}
