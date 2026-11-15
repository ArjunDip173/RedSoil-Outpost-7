/**
 * Keyboard (WASD / arrows, E, Q, Space, 1–8), mouse and touch, in virtual-pixel coords.
 * "pressed" flags last exactly one frame; call endFrame() after each update.
 *
 * Touch (phones, tablets): a finger that lands on the left part of the screen becomes a
 * floating joystick for walking; any other finger works like the mouse (touch and hold a spot
 * to use your tool there, tap HUD widgets). On-screen buttons hold keys with setKey().
 */
import { prefersTouch, setTouchMode } from './touch';

/** Fingers starting left of this fraction of the screen width steer (outside the tool reach). */
const STICK_ZONE = 0.3;
/** Joystick radius in CSS pixels: a bit bigger on tablets than on phones. */
export function stickRadius(): number {
  return Math.round(Math.max(44, Math.min(64, Math.min(window.innerWidth, window.innerHeight) * 0.13)));
}
const DEAD_ZONE = 0.18;

export interface StickState {
  active: boolean;
  /** Centre of the joystick and the thumb, in CSS pixels. */
  baseX: number;
  baseY: number;
  knobX: number;
  knobY: number;
}

export class InputManager {
  private held = new Set<string>();
  private pressedSet = new Set<string>();
  /** Mouse in HUD pixels. */
  mouseX = 0;
  mouseY = 0;
  /** Mouse in world-view pixels (add the camera to get world coordinates). */
  worldX = 0;
  worldY = 0;
  mouseDown = false;
  rightDown = false;
  mousePressed = false;
  rightPressed = false;
  wheel = 0;
  /** True while a DOM modal has focus - the game ignores input then. */
  blocked = false;
  /** Touch joystick: -1..1 on each axis (0 when not steering). */
  stickX = 0;
  stickY = 0;
  readonly stick: StickState = { active: false, baseX: 0, baseY: 0, knobX: 0, knobY: 0 };
  /** Set by the game: is this HUD-pixel point a HUD widget a finger should tap (not steer on)? */
  isUiAt: (hx: number, hy: number) => boolean = () => false;
  private hudScale = 1;
  private worldScale = 1;
  private canvas: HTMLCanvasElement;
  private stickId: number | null = null;
  private pointId: number | null = null;
  private lastTouch = -1e9;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    setTouchMode(prefersTouch());
    window.addEventListener('keydown', (e) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const k = this.norm(e.key);
      if (!this.held.has(k)) this.pressedSet.add(k);
      this.held.add(k);
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'tab'].includes(k) && !this.blocked)
        e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.held.delete(this.norm(e.key)));
    window.addEventListener('blur', () => {
      this.held.clear();
      this.mouseDown = false;
      this.rightDown = false;
      this.releaseStick();
      this.pointId = null;
    });
    // a real mouse click switches the touch controls off again; a touch anywhere switches them on
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType === 'mouse') {
          if (performance.now() - this.lastTouch > 1000) setTouchMode(false);
        } else {
          this.lastTouch = performance.now();
          setTouchMode(true);
        }
      },
      true,
    );
    canvas.addEventListener('mousemove', (e) => !this.fromTouch() && this.point(e.clientX, e.clientY));
    canvas.addEventListener('mousedown', (e) => {
      if (this.fromTouch()) return;
      this.point(e.clientX, e.clientY);
      if (e.button === 0) {
        this.mouseDown = true;
        this.mousePressed = true;
      } else if (e.button === 2) {
        this.rightDown = true;
        this.rightPressed = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (this.fromTouch()) return;
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.rightDown = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener(
      'wheel',
      (e) => {
        this.wheel += Math.sign(e.deltaY);
        e.preventDefault();
      },
      { passive: false },
    );

    // Touch and pen
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      e.preventDefault();
      this.lastTouch = performance.now();
      const hx = e.clientX / this.hudScale;
      const hy = e.clientY / this.hudScale;
      if (this.stickId === null && e.clientX < window.innerWidth * STICK_ZONE && !this.isUiAt(hx, hy)) {
        this.stickId = e.pointerId;
        const r = stickRadius();
        const s = this.stick;
        s.active = true;
        s.baseX = Math.max(r + 4, Math.min(window.innerWidth - r - 4, e.clientX));
        s.baseY = Math.max(r + 4, Math.min(window.innerHeight - r - 4, e.clientY));
        this.moveStick(e.clientX, e.clientY);
      } else if (this.pointId === null) {
        this.pointId = e.pointerId;
        this.point(e.clientX, e.clientY);
        this.mouseDown = true;
        this.mousePressed = true;
      } else return;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* not supported */
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickId) this.moveStick(e.clientX, e.clientY);
      else if (e.pointerId === this.pointId) this.point(e.clientX, e.clientY);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId === this.stickId) this.releaseStick();
      else if (e.pointerId === this.pointId) {
        this.pointId = null;
        this.mouseDown = false;
      }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    // no page zoom from pinches and double-taps while playing (Safari)
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  }

  /** Mouse events the browser makes up after a touch are ignored (the touch was handled already). */
  private fromTouch(): boolean {
    return performance.now() - this.lastTouch < 800;
  }

  /** Follow the thumb; the joystick slides along when the thumb goes past its edge. */
  private moveStick(x: number, y: number): void {
    const s = this.stick;
    const r = stickRadius();
    let dx = x - s.baseX;
    let dy = y - s.baseY;
    const len = Math.hypot(dx, dy);
    if (len > r) {
      s.baseX = x - (dx / len) * r;
      s.baseY = y - (dy / len) * r;
      dx = (dx / len) * r;
      dy = (dy / len) * r;
    }
    s.knobX = s.baseX + dx;
    s.knobY = s.baseY + dy;
    const m = Math.min(1, len / r);
    // small thumb wobbles don't move the astronaut
    const k = m < DEAD_ZONE ? 0 : (m - DEAD_ZONE) / (1 - DEAD_ZONE) / Math.max(m, 1e-6);
    this.stickX = (dx / r) * k;
    this.stickY = (dy / r) * k;
  }

  private releaseStick(): void {
    this.stickId = null;
    this.stick.active = false;
    this.stickX = 0;
    this.stickY = 0;
  }

  setScales(hud: number, world: number): void {
    this.hudScale = hud;
    this.worldScale = world;
  }

  private point(clientX: number, clientY: number): void {
    const r = this.canvas.getBoundingClientRect();
    const x = clientX - r.left;
    const y = clientY - r.top;
    this.mouseX = x / this.hudScale;
    this.mouseY = y / this.hudScale;
    this.worldX = x / this.worldScale;
    this.worldY = y / this.worldScale;
  }

  private norm(key: string): string {
    return key.toLowerCase();
  }

  /** Hold (or let go of) a key from an on-screen button. */
  setKey(key: string, down: boolean): void {
    if (down) {
      if (!this.held.has(key)) this.pressedSet.add(key);
      this.held.add(key);
    } else this.held.delete(key);
  }

  /** A one-frame key press from an on-screen button. */
  tapKey(key: string): void {
    this.pressedSet.add(key);
  }

  isDown(...keys: string[]): boolean {
    if (this.blocked) return false;
    return keys.some((k) => this.held.has(k));
  }

  pressed(...keys: string[]): boolean {
    if (this.blocked) return false;
    return keys.some((k) => this.pressedSet.has(k));
  }

  /** Raw check that ignores the modal block (used for Escape). */
  pressedRaw(key: string): boolean {
    return this.pressedSet.has(key);
  }

  private get stickOn(): boolean {
    return !this.blocked && this.stick.active;
  }

  get left(): boolean {
    return this.isDown('a', 'arrowleft') || (this.stickOn && this.stickX < -0.38);
  }
  get right(): boolean {
    return this.isDown('d', 'arrowright') || (this.stickOn && this.stickX > 0.38);
  }
  get up(): boolean {
    return this.isDown('w', 'arrowup') || (this.stickOn && this.stickY < -0.38);
  }
  get down(): boolean {
    return this.isDown('s', 'arrowdown') || (this.stickOn && this.stickY > 0.38);
  }

  /** Walking direction from the keys or the touch joystick: length 0..1 (a small push walks slowly). */
  axis(): { x: number; y: number } {
    let x = (this.isDown('d', 'arrowright') ? 1 : 0) - (this.isDown('a', 'arrowleft') ? 1 : 0);
    let y = (this.isDown('s', 'arrowdown') ? 1 : 0) - (this.isDown('w', 'arrowup') ? 1 : 0);
    if (!x && !y && this.stickOn) {
      x = this.stickX;
      y = this.stickY;
    }
    const len = Math.hypot(x, y);
    return len > 1 ? { x: x / len, y: y / len } : { x, y };
  }

  endFrame(): void {
    this.pressedSet.clear();
    this.mousePressed = false;
    this.rightPressed = false;
    this.wheel = 0;
  }

  clear(): void {
    this.held.clear();
    this.pressedSet.clear();
    this.mouseDown = false;
    this.rightDown = false;
    this.releaseStick();
    this.pointId = null;
  }
}
