/**
 * The opening cutscene for a new game: launch from Earth, the cruise through space,
 * landing next to Outpost 7, and the astronaut walking into the airlock.
 *
 * It draws into a 320×180 canvas that is scaled up with crisp pixels. Any key or click
 * skips it. All art comes from the sprite sheet (cs_* sprites).
 */
import type { AudioEngine } from '../core/AudioEngine';
import { makeCanvas, rect } from '../core/canvas';
import { forTouch } from '../core/touch';
import type { Sprites } from '../core/Sprites';
import { el } from './Dom';

const W = 320;
const H = 180;
/** Scene start times in seconds. */
const LAUNCH = 0;
const CRUISE = 5;
const LANDING = 10;
const ARRIVE = 15.5;
const END = 19;

interface Star {
  x: number;
  y: number;
  z: number;
}

function rotate90(src: HTMLCanvasElement): HTMLCanvasElement {
  const [c, g] = makeCanvas(src.height, src.width);
  g.translate(src.height, 0);
  g.rotate(Math.PI / 2);
  g.drawImage(src, 0, 0);
  return c;
}

const ease = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

export function playIntro(host: HTMLElement, art: Sprites, audio: AudioEngine, playerName: string): Promise<void> {
  return new Promise((resolve) => {
    const root = el('div', 'intro');
    const [canvas, g] = makeCanvas(W, H);
    canvas.className = 'intro-canvas';
    const skip = el('div', 'intro-skip', forTouch('Click or press any key to skip'));
    root.append(canvas, skip);
    host.appendChild(root);

    const rocketSide = rotate90(art.get('cs_rocket'));
    const flameSide = [0, 1, 2].map((i) => rotate90(art.get(`cs_flame${i}`)));
    const stars: Star[] = Array.from({ length: 90 }, (_, i) => ({ x: (i * 97.3) % W, y: (i * 53.7) % H, z: 0.3 + ((i * 7) % 10) / 10 }));
    const puffs: { x: number; y: number; vx: number; vy: number; life: number; kind: 'smoke' | 'dust' }[] = [];
    const said = new Set<string>();
    let start = 0;
    let last = 0;
    let done = false;

    const once = (key: string, fn: () => void) => {
      if (!said.has(key)) {
        said.add(key);
        fn();
      }
    };

    const finish = () => {
      if (done) return;
      done = true;
      audio.loop('thruster', 0);
      window.removeEventListener('keydown', onSkip);
      root.removeEventListener('mousedown', onSkip);
      root.classList.add('fade-out');
      setTimeout(() => {
        root.remove();
        resolve();
      }, 450);
    };
    const onSkip = (e: Event) => {
      if (performance.now() - start < 400) return;
      e.preventDefault();
      finish();
    };
    window.addEventListener('keydown', onSkip);
    root.addEventListener('mousedown', onSkip);

    const caption = (text: string, sub?: string, alpha = 1) => {
      g.globalAlpha = alpha;
      g.font = '8px "Press Start 2P", monospace';
      g.textAlign = 'left';
      g.textBaseline = 'top';
      g.fillStyle = 'rgba(12,6,8,0.7)';
      const w = Math.max(g.measureText(text).width, sub ? g.measureText(sub).width : 0);
      g.fillRect(8, 8, w + 12, sub ? 30 : 18);
      g.fillStyle = '#ffd166';
      g.fillText(text, 14, 13);
      if (sub) {
        g.fillStyle = '#e8ecf2';
        g.fillText(sub, 14, 25);
      }
      g.globalAlpha = 1;
    };

    const big = (text: string) => {
      g.font = '16px "Press Start 2P", monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#0c0608';
      g.fillText(text, W / 2 + 2, 62);
      g.fillStyle = '#ffd166';
      g.fillText(text, W / 2, 60);
    };

    const sky = (top: string, bottom: string) => {
      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, top);
      grad.addColorStop(1, bottom);
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
    };

    const drawStars = (alpha: number, dx = 0) => {
      if (alpha <= 0) return;
      g.globalAlpha = alpha;
      for (const s of stars) {
        const x = (((s.x - dx * s.z) % W) + W) % W;
        rect(g, Math.round(x), Math.round(s.y), 1, 1, s.z > 0.8 ? '#ffffff' : '#9aa2ae');
      }
      g.globalAlpha = 1;
    };

    const ground = (tile: string, y: number, fill: string) => {
      const img = art.get(tile);
      rect(g, 0, Math.round(y) + img.height, W, H, fill);
      for (let x = 0; x < W; x += img.width) g.drawImage(img, x, Math.round(y));
    };

    const updatePuffs = (dt: number) => {
      for (const p of puffs) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.97;
        p.life -= dt;
      }
      for (let i = puffs.length - 1; i >= 0; i--) if (puffs[i].life <= 0) puffs.splice(i, 1);
      for (const p of puffs) {
        const frame = p.life > 1.2 ? 0 : p.life > 0.6 ? 1 : 2;
        g.globalAlpha = clamp01(p.life);
        g.drawImage(art.get(`cs_${p.kind}${frame}`), Math.round(p.x - 6), Math.round(p.y - 6));
      }
      g.globalAlpha = 1;
    };

    // ── 1. launch from Earth ──
    const launchScene = (t: number, dt: number) => {
      const lift = Math.max(0, t - 2.6);
      const rise = 26 * lift * lift + 8 * lift; // slow start, then faster and faster
      const space = clamp01((rise - 60) / 140);
      sky(space > 0 ? `rgb(${Math.round(95 * (1 - space))},${Math.round(168 * (1 - space))},${Math.round(232 * (1 - space)) + 8})` : '#5fa8e8', space > 0 ? `rgb(${Math.round(191 * (1 - space))},${Math.round(227 * (1 - space))},${Math.round(255 * (1 - space)) + 12})` : '#bfe3ff');
      drawStars(space);
      const cam = Math.max(0, rise - 70); // the camera follows the rocket up
      const groundY = 140 + cam;
      g.drawImage(art.get('cs_hills_earth'), 0, groundY - 26 + cam * 0.2);
      g.drawImage(art.get('cs_hills_earth'), 128, groundY - 24 + cam * 0.2);
      g.drawImage(art.get('cs_hills_earth'), 256, groundY - 26 + cam * 0.2);
      ground('cs_ground_earth', groundY, '#3f7a3a');
      const padX = 140;
      g.drawImage(art.get('cs_tower'), padX - 22, groundY - 52);
      g.drawImage(art.get('cs_pad'), padX - 14, groundY - 6);
      const rocket = art.get('cs_rocket');
      const rx = padX - rocket.width / 2 + 6;
      const ry = groundY - 6 - rocket.height - rise + cam;
      if (t > 2.2) {
        const f = art.get(`cs_flame${Math.floor(t * 18) % 3}`);
        g.drawImage(f, Math.round(rx + rocket.width / 2 - f.width / 2), Math.round(ry + rocket.height - 2));
        if (Math.random() < dt * 30 && rise < 120) puffs.push({ x: padX + 6 + (Math.random() - 0.5) * 6, y: groundY - 6, vx: (Math.random() - 0.5) * 80, vy: -10 - Math.random() * 10, life: 1.8, kind: 'smoke' });
      }
      g.drawImage(rocket, Math.round(rx), Math.round(ry));
      updatePuffs(dt);
      if (t < 2.6) {
        const n = 3 - Math.floor(t / 0.8);
        if (n >= 1) {
          once(`count${n}`, () => audio.blip());
          big(String(n));
        } else big('LIFT-OFF!');
      }
      if (t > 2.2) once('ignite', () => audio.loop('thruster', 0.6));
      caption('EARTH', 'Launch day');
    };

    // ── 2. cruise through space ──
    const cruiseScene = (t: number) => {
      const p = t / (LANDING - CRUISE);
      sky('#05040c', '#120a1e');
      drawStars(1, t * 40);
      const earth = art.get('cs_earth');
      const mars = art.get('cs_mars');
      // Earth falls behind, Mars grows ahead
      const es = 2 - p * 1.4;
      g.drawImage(earth, Math.round(-20 - p * 140), Math.round(80 - (earth.height * es) / 2), Math.round(earth.width * es), Math.round(earth.height * es));
      g.drawImage(art.get('cs_moon'), Math.round(70 - p * 160), 40);
      const ms = 0.4 + ease(p) * 1.6;
      g.drawImage(mars, Math.round(W - 30 - (mars.width * ms) / 2 + (1 - p) * 40), Math.round(96 - (mars.height * ms) / 2), Math.round(mars.width * ms), Math.round(mars.height * ms));
      const rx = 120 + Math.sin(t * 1.3) * 6;
      const ry = 84 + Math.sin(t * 2.1) * 3;
      const f = flameSide[Math.floor(t * 18) % 3];
      g.drawImage(f, Math.round(rx - f.width + 2), Math.round(ry + rocketSide.height / 2 - f.height / 2));
      g.drawImage(rocketSide, Math.round(rx), Math.round(ry));
      audio.loop('thruster', 0.15);
      caption('THE JOURNEY', p < 0.5 ? 'Earth to Mars: about 7 months' : 'Mars is getting closer!');
    };

    // ── 3. landing next to the outpost ──
    const landingScene = (t: number, dt: number) => {
      sky('#d99a5f', '#f2cfa0');
      g.drawImage(art.get('cs_hills_mars'), 0, 112);
      g.drawImage(art.get('cs_hills_mars'), 128, 114);
      g.drawImage(art.get('cs_hills_mars'), 256, 112);
      ground('cs_ground_mars', 138, '#a8481c');
      g.drawImage(art.get('cs_habitat'), 206, 105);
      const rocket = art.get('cs_rocket');
      const land = clamp01(t / 4.2);
      const ry = -40 + ease(land) * (138 - rocket.height - 4 + 40);
      const rx = 110;
      if (land < 1) {
        const f = art.get(`cs_flame${Math.floor(t * 18) % 3}`);
        g.drawImage(f, Math.round(rx + rocket.width / 2 - f.width / 2), Math.round(ry + rocket.height - 2));
        audio.loop('thruster', 0.5);
        if (ry > 70 && Math.random() < dt * 40) puffs.push({ x: rx + 6 + (Math.random() - 0.5) * 10, y: 138, vx: (Math.random() - 0.5) * 120, vy: -6 - Math.random() * 12, life: 1.6, kind: 'dust' });
      } else {
        once('touchdown', () => {
          audio.loop('thruster', 0);
          audio.place();
          for (let i = 0; i < 14; i++) puffs.push({ x: rx + 6, y: 136, vx: (Math.random() - 0.5) * 160, vy: -4 - Math.random() * 14, life: 1.8, kind: 'dust' });
        });
      }
      if (land > 0.6) g.drawImage(art.get('cs_legs'), rx, Math.round(ry + rocket.height - 4));
      g.drawImage(rocket, rx, Math.round(ry));
      updatePuffs(dt);
      caption('MARS', 'Landing at Outpost 7');
    };

    // ── 4. walk into the airlock ──
    const arriveScene = (t: number, dt: number) => {
      landingScene(LANDING + 4.5 + t, dt);
      const walk = clamp01((t - 0.4) / 2.2);
      const ax = 122 + walk * 120;
      const frame = walk > 0 && walk < 1 ? (Math.floor(t * 8) % 2 ? 'walkA' : 'walkC') : 'idle';
      if (walk < 1) art.draw(g, `astro_eva_${frame}_down`, Math.round(ax - 12), 114);
      if (walk >= 1) once('door', () => audio.hiss(false));
      if (t > 2.9) {
        once('welcome', () => audio.chime());
        big('WELCOME TO MARS');
        g.font = '8px "Press Start 2P", monospace';
        g.fillStyle = '#e8ecf2';
        g.fillText(`Good luck, ${playerName}!`, W / 2, 82);
      }
      const fade = clamp01((t - (END - ARRIVE - 0.8)) / 0.8);
      if (fade > 0) {
        g.fillStyle = `rgba(0,0,0,${fade})`;
        g.fillRect(0, 0, W, H);
      }
    };

    const frame = (now: number) => {
      if (done) return;
      if (!start) {
        start = now;
        last = now;
      }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = (now - start) / 1000;
      g.imageSmoothingEnabled = false;
      if (t < CRUISE) launchScene(t - LAUNCH, dt);
      else if (t < LANDING) cruiseScene(t - CRUISE);
      else if (t < ARRIVE) landingScene(t - LANDING, dt);
      else if (t < END) arriveScene(t - ARRIVE, dt);
      else return finish();
      // quick fade between scenes
      for (const cut of [CRUISE, LANDING]) {
        const d = Math.abs(t - cut);
        if (d < 0.35) {
          g.fillStyle = `rgba(0,0,0,${1 - d / 0.35})`;
          g.fillRect(0, 0, W, H);
        }
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

