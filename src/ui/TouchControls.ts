/**
 * On-screen controls for phones and tablets (shown only in touch mode):
 *  - a joystick that appears under your thumb on the left side of the screen (walk / drive)
 *  - a big USE button (the E key) that lights up when you are next to something
 *  - a RUN button (hold to sprint)
 *  - a "turn your phone sideways" note for phones held upright
 * Touching the world elsewhere works like the mouse: hold a spot to use your tool there.
 * The InputManager does the steering; this class only draws it and adds the buttons.
 */
import type { Game } from '../Game';
import { stickRadius } from '../core/InputManager';
import { touch } from '../core/touch';
import { el } from './Dom';

export class TouchControls {
  private game: Game;
  private layer: HTMLDivElement;
  private base: HTMLDivElement;
  private knob: HTMLDivElement;
  private ghost: HTMLDivElement;
  private use: HTMLButtonElement;
  private useLabel: HTMLSpanElement;
  private run: HTMLButtonElement;
  private rotate: HTMLDivElement;
  private shownKey = '';
  private radius = 0;

  constructor(game: Game, root: HTMLElement) {
    this.game = game;
    this.layer = el('div', 'touch-ui hidden');
    this.ghost = el('div', 'touch-stick ghost');
    this.ghost.appendChild(el('div', 'touch-knob'));
    this.ghost.appendChild(el('span', 'touch-stick-label', 'MOVE'));
    this.base = el('div', 'touch-stick hidden');
    this.knob = el('div', 'touch-knob live hidden');

    this.use = this.holdButton('touch-use', 'e', 'Use the thing you are next to (E)');
    this.use.appendChild(el('span', 'touch-key', 'E'));
    this.useLabel = el('span', 'touch-use-label', 'USE');
    this.use.appendChild(this.useLabel);
    this.run = this.holdButton('touch-run', 'shift', 'Hold to run');
    this.run.appendChild(el('span', 'touch-run-label', 'RUN'));

    this.layer.append(this.ghost, this.base, this.knob, this.run, this.use);
    this.rotate = el('div', 'rotate-hint');
    this.rotate.append(el('div', 'rotate-icon', '📱↻'), el('p', '', 'Turn your device sideways to play!'));
    root.append(this.layer, this.rotate);
  }

  /** A button that holds a key down while a finger is on it. */
  private holdButton(cls: string, key: string, label: string): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = `touch-btn ${cls}`;
    b.type = 'button';
    b.tabIndex = -1;
    b.setAttribute('aria-label', label);
    const input = this.game.input;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.game.ui.blocking) return;
      input.setKey(key, true);
      b.classList.add('down');
      try {
        b.setPointerCapture(e.pointerId);
      } catch {
        /* not supported */
      }
    });
    const up = () => {
      input.setKey(key, false);
      b.classList.remove('down');
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    return b;
  }

  update(): void {
    const g = this.game;
    // hidden while a window or the big map is open (the MAP button still closes the map)
    const on = touch.active && !g.ui.blocking && !g.evacuatingNow && !g.hud.bigMap;
    this.layer.classList.toggle('hidden', !on);
    if (!on) return;
    const r = stickRadius();
    if (r !== this.radius) {
      this.radius = r;
      this.layer.style.setProperty('--stick', `${r}px`);
    }
    const s = g.input.stick;
    const steering = s.active && !g.hud.bigMap;
    this.ghost.classList.toggle('hidden', steering || g.hud.bigMap);
    this.base.classList.toggle('hidden', !steering);
    this.knob.classList.toggle('hidden', !steering);
    if (steering) {
      this.base.style.transform = `translate(${s.baseX - r}px, ${s.baseY - r}px)`;
      this.knob.style.transform = `translate(${s.knobX}px, ${s.knobY}px) translate(-50%, -50%)`;
    }
    // USE lights up and says what it will do when something is in reach
    const f = g.focus;
    const label = f ? shortLabel(f.label) : 'USE';
    const key = `${label}|${!!f}`;
    if (key !== this.shownKey) {
      this.shownKey = key;
      this.useLabel.textContent = label;
      this.use.classList.toggle('ready', !!f);
    }
    this.run.classList.toggle('hidden', g.rover.driving);
  }

  destroy(): void {
    this.game.input.setKey('e', false);
    this.game.input.setKey('shift', false);
    this.layer.remove();
    this.rotate.remove();
  }
}

const VERB = /^(go|see|open|fill|build|plant|read|harvest|check|repair|fix|use|drive|hop|brush|pick|talk|sleep|switch|turn)\b/i;

/**
 * What the USE button will do, short enough for a round button:
 * "Science Station: open SCIENCE LOG" → "OPEN SCIENCE LOG", "Ice Melter: 3 ice waiting" → "ICE MELTER",
 * "Old robotic lander — read the plaque" → "READ THE PLAQUE".
 */
export function shortLabel(label: string): string {
  let t = label.replace(/\s*\(.*?\)/g, '').split(' · ')[0].trim();
  for (const sep of [' — ', ': ']) {
    const i = t.indexOf(sep);
    if (i > 0) {
      const after = t.slice(i + sep.length).trim();
      t = VERB.test(after) ? after : t.slice(0, i);
    }
  }
  t = t.trim();
  return (t.length > 22 ? `${t.slice(0, 21).trimEnd()}…` : t).toUpperCase();
}
