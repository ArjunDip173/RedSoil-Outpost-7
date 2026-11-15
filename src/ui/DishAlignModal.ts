/**
 * Steer the Deep Space Antenna dish until it points at Earth
 * (the bright blue dot) and hold the signal steady to lock on.
 */
import type { Game } from '../Game';
import { button, el } from './Dom';

export function openDishAlign(game: Game, onSuccess: () => void): void {
  const m = game.ui.stack.open({ title: 'DEEP SPACE ANTENNA · POINT AT EARTH', size: 'lg', cls: 'dish-modal' });
  m.body.appendChild(
    el(
      'p',
      'muted',
      'Earth is the bright blue dot. Use ← → (or A / D, or the slider) to aim the dish. Keep the signal in the green zone to lock on!',
    ),
  );
  const W = 640;
  const H = 300;
  const canvas = el('canvas', 'dish-canvas');
  canvas.width = W;
  canvas.height = H;
  const slider = el('input', 'valve-slider');
  slider.type = 'range';
  slider.min = '10';
  slider.max = '170';
  slider.value = '40';
  slider.setAttribute('aria-label', 'Dish angle');
  const status = el('div', 'wiring-status', 'Signal: searching…');
  m.body.append(canvas, slider, status);
  const g = canvas.getContext('2d')!;
  let angle = 40;
  // Easy Mode: wider lock zone, shorter hold, slower drift and a gentle pull toward Earth
  const easy = game.settings.easyMode;
  const lockAt = easy ? 0.72 : 0.88;
  const holdFor = easy ? 1.2 : 2;
  let earth = 105 + Math.random() * 40;
  let lock = 0;
  let done = false;
  const keys = new Set<string>();
  const kd = (e: KeyboardEvent) => keys.add(e.key.toLowerCase());
  const ku = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);
  slider.addEventListener('input', () => (angle = Number(slider.value)));
  const stars = Array.from({ length: 80 }, () => ({ x: Math.random() * W, y: Math.random() * H * 0.7 }));
  let last = performance.now();
  let t = 0;

  const loop = (now: number) => {
    if (m.closed) {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      return;
    }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    if (keys.has('arrowleft') || keys.has('a')) angle = Math.min(170, angle + 50 * dt);
    if (keys.has('arrowright') || keys.has('d')) angle = Math.max(10, angle - 50 * dt);
    slider.value = String(Math.round(angle));
    earth += Math.sin(t * 0.7) * (easy ? 1.5 : 4) * dt; // Earth drifts as Mars rotates
    if (easy && Math.abs(angle - earth) < 14 && !keys.size) angle += (earth - angle) * Math.min(1, dt * 1.5);
    const diff = Math.abs(angle - earth);
    const signal = Math.max(0, 1 - diff / 35);
    if (!done) {
      if (signal > lockAt) lock += dt;
      else lock = Math.max(0, lock - dt * 2);
      status.textContent =
        signal > lockAt
          ? `LOCKING ON… ${Math.min(100, Math.round((lock / holdFor) * 100))}%`
          : signal > 0.4
            ? 'Getting warmer… keep turning!'
            : 'Signal: searching…';
      if (Math.random() < signal * 0.15) game.audio.talk();
      if (lock >= holdFor) {
        done = true;
        game.audio.victory();
        status.textContent = 'SIGNAL LOCKED! Connecting to Earth…';
        status.classList.add('ok');
        setTimeout(() => {
          m.opts.onClose = undefined;
          m.close();
          onSuccess();
        }, 1100);
      }
    }
    // draw
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#05040c');
    grad.addColorStop(1, '#2a1830');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffffff';
    for (const s of stars) g.fillRect(s.x, s.y, 2, 2);
    const cx = W / 2;
    const cy = H - 30;
    const er = (earth * Math.PI) / 180;
    const ex = cx + Math.cos(er) * 250;
    const ey = cy - Math.sin(er) * 220;
    g.fillStyle = 'rgba(100,170,255,0.25)';
    g.beginPath();
    g.arc(ex, ey, 14, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#6fb6ff';
    g.fillRect(ex - 4, ey - 4, 8, 8);
    g.fillStyle = '#ffffff';
    g.font = '18px VT323, monospace';
    g.fillText('EARTH', ex + 10, ey - 8);
    // ground
    g.fillStyle = '#8b4a2c';
    g.fillRect(0, cy, W, H - cy);
    g.fillStyle = '#a9603d';
    g.fillRect(0, cy, W, 3);
    // beam
    const ar = (angle * Math.PI) / 180;
    g.strokeStyle = `rgba(127,227,255,${0.25 + signal * 0.6})`;
    g.lineWidth = 2 + signal * 6;
    g.beginPath();
    g.moveTo(cx, cy - 30);
    g.lineTo(cx + Math.cos(ar) * 600, cy - 30 - Math.sin(ar) * 600);
    g.stroke();
    // dish
    g.save();
    g.translate(cx, cy - 30);
    g.rotate(-ar + Math.PI / 2);
    g.fillStyle = '#eef1f5';
    g.beginPath();
    g.ellipse(0, 0, 38, 12, 0, Math.PI, 0);
    g.fill();
    g.fillStyle = '#e0c02c';
    g.fillRect(-3, -30, 6, 22);
    g.restore();
    g.fillStyle = '#9aa2ae';
    g.fillRect(cx - 6, cy - 30, 12, 30);
    // signal meter
    g.fillStyle = '#141820';
    g.fillRect(20, 20, 30, 160);
    g.fillStyle = signal > lockAt ? '#5fd068' : signal > 0.4 ? '#ffd166' : '#ff5a5a';
    g.fillRect(24, 176 - signal * 152, 22, signal * 152);
    g.strokeStyle = '#5fd068';
    g.strokeRect(20, 20, 30, 20);
    g.fillStyle = '#ffffff';
    g.fillText('SIGNAL', 12, 196);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  m.body.appendChild(button('Cancel', () => m.close(), 'btn ghost small'));
}
