/**
 * Keyboard (WASD / arrows, E, Q, Space, 1–8) and mouse, in virtual-pixel coords.
 * "pressed" flags last exactly one frame; call endFrame() after each update.
 */

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
  private hudScale = 1;
  private worldScale = 1;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    window.addEventListener('keydown', (e) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const k = this.norm(e.key);
      if (!this.held.has(k)) this.pressedSet.add(k);
      this.held.add(k);
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'tab'].includes(k) && !this.blocked) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.held.delete(this.norm(e.key)));
    window.addEventListener('blur', () => {
      this.held.clear();
      this.mouseDown = false;
      this.rightDown = false;
    });
    canvas.addEventListener('mousemove', (e) => this.move(e));
    canvas.addEventListener('mousedown', (e) => {
      this.move(e);
      if (e.button === 0) {
        this.mouseDown = true;
        this.mousePressed = true;
      } else if (e.button === 2) {
        this.rightDown = true;
        this.rightPressed = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
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
  }

  setScales(hud: number, world: number): void {
    this.hudScale = hud;
    this.worldScale = world;
  }

  private move(e: MouseEvent): void {
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    this.mouseX = x / this.hudScale;
    this.mouseY = y / this.hudScale;
    this.worldX = x / this.worldScale;
    this.worldY = y / this.worldScale;
  }

  private norm(key: string): string {
    return key.length === 1 ? key.toLowerCase() : key.toLowerCase();
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

  get left(): boolean {
    return this.isDown('a', 'arrowleft');
  }
  get right(): boolean {
    return this.isDown('d', 'arrowright');
  }
  get up(): boolean {
    return this.isDown('w', 'arrowup');
  }
  get down(): boolean {
    return this.isDown('s', 'arrowdown');
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
  }
}
