/**
 * Drag-and-connect circuit repair. Each wire has a colour AND a shape
 * symbol (colour-blind friendly). Drag from a plug on the left to the matching socket on the right.
 */
import type { AudioEngine } from '../core/AudioEngine';
import { button, el, type ModalStack } from './Dom';

interface WireDef {
  color: string;
  name: string;
  shape: 'circle' | 'square' | 'triangle' | 'diamond' | 'star' | 'cross';
}

const WIRES: WireDef[] = [
  { color: '#ff5a5a', name: 'RED', shape: 'circle' },
  { color: '#4fb3ff', name: 'BLUE', shape: 'square' },
  { color: '#ffd166', name: 'YELLOW', shape: 'triangle' },
  { color: '#5fd068', name: 'GREEN', shape: 'diamond' },
  { color: '#c58cff', name: 'PURPLE', shape: 'star' },
  { color: '#ff9a3a', name: 'ORANGE', shape: 'cross' },
];

export interface WiringOptions {
  title: string;
  subtitle: string;
  wires: number;
  /** Labels for the left (sources) and right (destinations). */
  left?: string[];
  right?: string[];
}

function drawShape(g: CanvasRenderingContext2D, shape: WireDef['shape'], x: number, y: number, r: number, color: string): void {
  g.fillStyle = color;
  g.strokeStyle = '#1b1012';
  g.lineWidth = 3;
  g.beginPath();
  switch (shape) {
    case 'circle':
      g.arc(x, y, r, 0, Math.PI * 2);
      break;
    case 'square':
      g.rect(x - r, y - r, r * 2, r * 2);
      break;
    case 'triangle':
      g.moveTo(x, y - r);
      g.lineTo(x + r, y + r);
      g.lineTo(x - r, y + r);
      g.closePath();
      break;
    case 'diamond':
      g.moveTo(x, y - r - 2);
      g.lineTo(x + r + 2, y);
      g.lineTo(x, y + r + 2);
      g.lineTo(x - r - 2, y);
      g.closePath();
      break;
    case 'star':
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 === 0 ? r + 3 : r / 2;
        if (i === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      g.closePath();
      break;
    case 'cross':
      g.rect(x - r, y - r / 3, r * 2, (r * 2) / 3);
      g.rect(x - r / 3, y - r, (r * 2) / 3, r * 2);
      break;
  }
  g.fill();
  g.stroke();
}

export function openWiring(stack: ModalStack, audio: AudioEngine, opts: WiringOptions, onSuccess: () => void, onCancel?: () => void): void {
  let solved = false;
  const m = stack.open({ title: opts.title, size: 'lg', cls: 'wiring-modal', onClose: () => !solved && onCancel?.() });
  const sub = el('p', 'muted', opts.subtitle);
  const W = 640;
  const H = 70 + opts.wires * 62;
  const canvas = el('canvas', 'wiring-canvas');
  canvas.width = W;
  canvas.height = H;
  const status = el('div', 'wiring-status', `0 / ${opts.wires} wires connected`);
  m.body.append(sub, canvas, status);
  const g = canvas.getContext('2d')!;

  const wires = WIRES.slice(0, opts.wires);
  const rightOrder = wires.map((_, i) => i);
  // shuffle so the puzzle is never already solved
  do {
    for (let i = rightOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rightOrder[i], rightOrder[j]] = [rightOrder[j], rightOrder[i]];
    }
  } while (rightOrder.every((v, i) => v === i) && wires.length > 1);

  const leftPos = (i: number) => ({ x: 120, y: 60 + i * 62 });
  const rightPos = (slot: number) => ({ x: W - 120, y: 60 + slot * 62 });
  const connected = new Set<number>();
  let drag: { wire: number; x: number; y: number } | null = null;
  let flash = 0;
  let sparkAt: { x: number; y: number; t: number } | null = null;

  const toLocal = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  const draw = () => {
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#141820';
    g.fillRect(0, 0, W, H);
    // panel grid
    g.strokeStyle = '#1f2633';
    for (let x = 0; x < W; x += 20) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, H);
      g.stroke();
    }
    g.font = '16px VT323, monospace';
    g.textBaseline = 'middle';
    // sockets on the right
    rightOrder.forEach((wi, slot) => {
      const p = rightPos(slot);
      const w = wires[wi];
      g.fillStyle = '#2a303b';
      g.fillRect(p.x - 6, p.y - 22, 110, 44);
      drawShape(g, w.shape, p.x + 16, p.y, 11, connected.has(wi) ? w.color : '#3a4150');
      g.strokeStyle = w.color;
      g.lineWidth = 3;
      g.strokeRect(p.x + 3, p.y - 13, 26, 26);
      g.fillStyle = '#d9dde4';
      g.textAlign = 'left';
      g.fillText(opts.right?.[wi] ?? w.name, p.x + 36, p.y);
    });
    // plugs on the left
    wires.forEach((w, i) => {
      const p = leftPos(i);
      g.fillStyle = '#2a303b';
      g.fillRect(p.x - 104, p.y - 22, 110, 44);
      g.fillStyle = '#d9dde4';
      g.textAlign = 'right';
      g.fillText(opts.left?.[i] ?? w.name, p.x - 30, p.y);
      drawShape(g, w.shape, p.x - 12, p.y, 11, w.color);
    });
    // finished wires (curvy)
    const curve = (x0: number, y0: number, x1: number, y1: number, color: string, wobble: number) => {
      g.strokeStyle = '#0b0d12';
      g.lineWidth = 12;
      g.beginPath();
      g.moveTo(x0, y0);
      g.bezierCurveTo((x0 + x1) / 2, y0 + wobble, (x0 + x1) / 2, y1 - wobble, x1, y1);
      g.stroke();
      g.strokeStyle = color;
      g.lineWidth = 8;
      g.stroke();
    };
    for (const wi of connected) {
      const a = leftPos(wi);
      const b = rightPos(rightOrder.indexOf(wi));
      curve(a.x, a.y, b.x + 16, b.y, wires[wi].color, 30);
    }
    if (drag) {
      const a = leftPos(drag.wire);
      curve(a.x, a.y, drag.x, drag.y, wires[drag.wire].color, 20);
      drawShape(g, wires[drag.wire].shape, drag.x, drag.y, 9, wires[drag.wire].color);
    }
    if (sparkAt && sparkAt.t > 0) {
      g.fillStyle = `rgba(255,240,150,${sparkAt.t})`;
      for (let k = 0; k < 10; k++) g.fillRect(sparkAt.x + (Math.random() - 0.5) * 40, sparkAt.y + (Math.random() - 0.5) * 40, 4, 4);
    }
    if (flash > 0) {
      g.fillStyle = `rgba(95,208,104,${flash * 0.35})`;
      g.fillRect(0, 0, W, H);
    }
  };

  let raf = 0;
  const loop = () => {
    if (sparkAt) sparkAt.t -= 0.05;
    flash = Math.max(0, flash - 0.02);
    draw();
    if (!m.closed) raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  canvas.addEventListener('pointerdown', (e) => {
    if (solved) return;
    const p = toLocal(e);
    wires.forEach((_, i) => {
      if (connected.has(i)) return;
      const lp = leftPos(i);
      if (Math.hypot(p.x - (lp.x - 12), p.y - lp.y) < 30) {
        drag = { wire: i, x: p.x, y: p.y };
        audio.blip();
        canvas.setPointerCapture(e.pointerId);
      }
    });
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = toLocal(e);
    drag.x = p.x;
    drag.y = p.y;
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const p = toLocal(e);
    let hitSlot = -1;
    rightOrder.forEach((_, slot) => {
      const rp = rightPos(slot);
      if (Math.hypot(p.x - (rp.x + 16), p.y - rp.y) < 34) hitSlot = slot;
    });
    if (hitSlot >= 0) {
      if (rightOrder[hitSlot] === drag.wire) {
        connected.add(drag.wire);
        audio.wireConnect();
        status.textContent = `${connected.size} / ${opts.wires} wires connected`;
        if (connected.size === wires.length) {
          solved = true;
          flash = 1;
          audio.chime();
          status.textContent = 'POWER RESTORED!';
          status.classList.add('ok');
          setTimeout(() => {
            cancelAnimationFrame(raf);
            m.opts.onClose = undefined;
            m.close();
            onSuccess();
          }, 900);
        }
      } else {
        const rp = rightPos(hitSlot);
        sparkAt = { x: rp.x + 16, y: rp.y, t: 1 };
        audio.spark();
        audio.error();
        status.textContent = 'Zap! Wrong plug — match the colour AND the shape.';
      }
    }
    drag = null;
  });

  const tip = el('div', 'row');
  tip.append(button('Give up for now', () => m.close(), 'btn ghost'));
  m.body.appendChild(tip);
}
