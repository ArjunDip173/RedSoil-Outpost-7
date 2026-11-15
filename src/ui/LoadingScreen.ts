/**
 * An Outpost 7 "telemetry boot sequence" with a spinning pixel Mars,
 * shown while sprites bake and mission data loads. Ends with "press any key"
 * (which also unlocks Web Audio in the browser).
 */
import { touch } from '../core/touch';
import { el } from './Dom';

export class LoadingScreen {
  private root: HTMLDivElement;
  private logEl: HTMLDivElement;
  private fill: HTMLDivElement;
  private press: HTMLDivElement;
  private globe: HTMLCanvasElement;
  private raf = 0;

  constructor(host: HTMLElement) {
    this.root = el('div', 'loading');
    const head = el('div', 'boot-head');
    this.globe = el('canvas', 'globe');
    this.globe.width = 48;
    this.globe.height = 48;
    const titles = el('div', 'boot-titles');
    titles.append(el('div', 'boot-title', 'OUTPOST-7 HABITAT OS'), el('div', 'boot-sub', 'v2.026 · Junior Astronaut Mission Trainer'));
    head.append(this.globe, titles);
    this.logEl = el('div', 'boot-log');
    const bar = el('div', 'boot-bar');
    this.fill = el('div', 'boot-fill');
    bar.appendChild(this.fill);
    this.press = el('div', 'boot-press hidden', touch.active ? '▶ TAP TO START ◀' : '▶ PRESS ANY KEY OR CLICK TO START ◀');
    this.root.append(head, this.logEl, bar, this.press);
    host.appendChild(this.root);
    this.spin();
  }

  private spin(): void {
    const g = this.globe.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    let t = 0;
    const R = 22;
    const draw = () => {
      t += 0.012;
      g.clearRect(0, 0, 48, 48);
      for (let y = -R; y <= R; y++) {
        for (let x = -R; x <= R; x++) {
          const d = x * x + y * y;
          if (d > R * R) continue;
          const z = Math.sqrt(R * R - d);
          const lon = Math.atan2(x, z) + t;
          const lat = y / R;
          const n = Math.sin(lon * 3 + lat * 4) + Math.sin(lon * 7 - lat * 2) * 0.5 + Math.cos(lat * 9 + lon) * 0.3;
          let col = n > 0.6 ? '#8a2c0a' : n > -0.2 ? '#c1440e' : '#e07a3f';
          if (Math.abs(lat) > 0.86) col = '#f2efe6';
          const shade = x / R;
          if (shade > 0.55) col = n > 0.6 ? '#5a1c06' : '#7d2a0a';
          g.fillStyle = col;
          g.fillRect(x + 24, y + 24, 1, 1);
        }
      }
      this.raf = requestAnimationFrame(draw);
    };
    draw();
  }

  log(text: string, status: 'ok' | 'warn' | 'info' = 'ok'): void {
    const line = el('div', `boot-line ${status}`);
    const tag = status === 'ok' ? '[ OK ]' : status === 'warn' ? '[WARN]' : '[ .. ]';
    line.append(el('span', 'tag', tag), el('span', '', ` ${text}`));
    this.logEl.appendChild(line);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  progress(f: number): void {
    this.fill.style.width = `${Math.round(Math.max(0, Math.min(1, f)) * 100)}%`;
  }

  error(text: string): void {
    const line = el('div', 'boot-line bad', text);
    this.logEl.appendChild(line);
  }

  waitForStart(): Promise<void> {
    this.press.classList.remove('hidden');
    return new Promise((resolve) => {
      const go = (e: Event) => {
        e.preventDefault();
        window.removeEventListener('keydown', go);
        window.removeEventListener('pointerdown', go);
        resolve();
      };
      window.addEventListener('keydown', go);
      window.addEventListener('pointerdown', go);
    });
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.root.classList.add('closing');
    setTimeout(() => this.root.remove(), 400);
  }
}

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
