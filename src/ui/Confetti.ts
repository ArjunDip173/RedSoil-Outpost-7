/**
 * Pixel confetti for big moments (the graduation certificate): two cannons fire from the bottom
 * corners, then a short rain falls from the top. Skipped when the player prefers reduced motion.
 */

const COLORS = ['#ffd166', '#ff5a5a', '#5fd068', '#7fe3ff', '#e055a0', '#e07a3f', '#ffffff'];
const GRAVITY = 900; // px/s²

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  spin: number;
  turn: number;
  /** Seconds before it appears. */
  wait: number;
}

export function confetti(durationMs = 4500): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  document.body.appendChild(canvas);
  const g = canvas.getContext('2d')!;
  const W = (canvas.width = window.innerWidth);
  const H = (canvas.height = window.innerHeight);
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  const pieces: Piece[] = [];
  const base = (x: number, y: number, vx: number, vy: number, wait: number): Piece => ({
    x,
    y,
    vx,
    vy,
    wait,
    size: rnd(5, 10),
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    spin: rnd(0, Math.PI * 2),
    turn: rnd(-12, 12),
  });
  for (let i = 0; i < 160; i++) {
    const left = i % 2 === 0;
    pieces.push(
      base(
        left ? -10 : W + 10,
        H * rnd(0.75, 0.95),
        (left ? 1 : -1) * rnd(W * 0.25, W * 0.7),
        -rnd(H * 0.9, H * 1.6),
        rnd(0, 0.35),
      ),
    );
  }
  for (let i = 0; i < 90; i++) pieces.push(base(rnd(0, W), -20, rnd(-40, 40), rnd(0, 80), rnd(0.6, 2)));

  let last = performance.now();
  const start = last;
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const age = now - start;
    g.clearRect(0, 0, W, H);
    g.globalAlpha = age > durationMs - 800 ? Math.max(0, (durationMs - age) / 800) : 1;
    for (const p of pieces) {
      if (p.wait > 0) {
        p.wait -= dt;
        continue;
      }
      p.vy += GRAVITY * dt * 0.6;
      p.vx *= 1 - 1.4 * dt; // air drag, so the bursts slow down and flutter
      p.vy = Math.min(p.vy, 260);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.spin += p.turn * dt;
      // flipping paper: the width shrinks and grows as the piece turns
      const w = Math.max(1, Math.abs(Math.cos(p.spin)) * p.size);
      g.fillStyle = p.color;
      g.fillRect(Math.round(p.x - w / 2), Math.round(p.y), Math.round(w), Math.round(p.size * 0.6));
    }
    if (age < durationMs) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
