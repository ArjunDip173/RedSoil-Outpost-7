/** Small DOM helpers, pixel icons and the modal stack used by every window. */
import type { Sprites } from '../core/Sprites';

let iconSheet: Sprites | null = null;

/** Give the UI access to the loaded sprite sheet (called once at startup). */
export function useIconSheet(s: Sprites): void {
  iconSheet = s;
  // 9-slice window and button frames, used by style.css through border-image
  const root = document.documentElement.style;
  for (const name of ['ui_panel', 'ui_button', 'ui_button_primary', 'ui_button_hover']) {
    if (s.has(name)) root.setProperty(`--${name.replace(/_/g, '-')}`, `url(${s.get(name).toDataURL()})`);
  }
}

/** A pixel icon from the sprite sheet, scaled up crisply for the DOM. */
export function icon(name: string, scale = 2): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.className = 'ico';
  const src = iconSheet?.get(name);
  if (!src) return c;
  c.width = src.width * scale;
  c.height = src.height * scale;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/** Text with a pixel icon in front of it. */
export function iconText(iconName: string, text: string, cls = 'with-ico'): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = cls;
  s.append(icon(iconName), document.createTextNode(text));
  return s;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function button(label: string, onClick: () => void, cls = 'btn', iconName?: string): HTMLButtonElement {
  const b = el('button', cls, iconName ? undefined : label);
  if (iconName) b.append(icon(iconName), document.createTextNode(label));
  b.type = 'button';
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

/** Copy a small sprite canvas into a bigger, crisp DOM canvas. */
export function spriteCanvas(src: HTMLCanvasElement, scale: number, cls = 'sprite'): HTMLCanvasElement {
  const c = el('canvas', cls);
  c.width = src.width * scale;
  c.height = src.height * scale;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

export interface ModalOptions {
  title?: string;
  /** Freeze the game simulation while open (default true). */
  pauses?: boolean;
  /** Show an ✕ and allow Escape (default true). */
  closable?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  cls?: string;
  onClose?: () => void;
}

export class Modal {
  root: HTMLDivElement;
  panel: HTMLDivElement;
  body: HTMLDivElement;
  opts: ModalOptions;
  closed = false;
  private stack: ModalStack;
  /** Called every frame while open (for live readouts). */
  tick?: (dt: number) => void;

  constructor(stack: ModalStack, opts: ModalOptions) {
    this.stack = stack;
    this.opts = opts;
    this.root = el('div', `modal-backdrop ${opts.cls ?? ''}`);
    this.panel = el('div', `modal panel size-${opts.size ?? 'md'}`);
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-modal', 'true');
    if (opts.title) {
      const head = el('div', 'modal-head');
      const h = el('h2', '', opts.title);
      head.appendChild(h);
      if (opts.closable !== false) head.appendChild(button('✕', () => this.close(), 'btn-x'));
      this.panel.appendChild(head);
      this.panel.setAttribute('aria-label', opts.title);
    }
    this.body = el('div', 'modal-body');
    this.panel.appendChild(this.body);
    this.root.appendChild(this.panel);
    this.root.addEventListener('mousedown', (e) => {
      if (e.target === this.root && opts.closable !== false) this.close();
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.root.classList.add('closing');
    setTimeout(() => this.root.remove(), 120);
    this.stack.remove(this);
    this.opts.onClose?.();
  }
}

export class ModalStack {
  private stack: Modal[] = [];
  private host: HTMLElement;
  /** Fires on open/close so the game can block input. */
  onChange?: () => void;
  onBlip?: () => void;

  constructor(host: HTMLElement) {
    this.host = host;
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.stack.length) {
        const top = this.stack[this.stack.length - 1];
        if (top.opts.closable !== false) {
          e.preventDefault();
          e.stopImmediatePropagation();
          top.close();
        }
      }
    });
  }

  open(opts: ModalOptions): Modal {
    const m = new Modal(this, opts);
    this.stack.push(m);
    this.host.appendChild(m.root);
    this.onBlip?.();
    this.onChange?.();
    return m;
  }

  remove(m: Modal): void {
    this.stack = this.stack.filter((x) => x !== m);
    this.onChange?.();
  }

  closeAll(): void {
    for (const m of [...this.stack]) {
      m.opts.onClose = undefined;
      m.close();
    }
  }

  get count(): number {
    return this.stack.length;
  }

  /** Any open modal that pauses the simulation. */
  get pausing(): boolean {
    return this.stack.some((m) => m.opts.pauses !== false);
  }

  tick(dt: number): void {
    for (const m of this.stack) m.tick?.(dt);
  }
}

/** Text size setting → CSS scale for every window, button and LUNA's speech. */
export const TEXT_SCALE = { normal: 1, big: 1.15, huge: 1.32 } as const;
export function applyTextSize(size: keyof typeof TEXT_SCALE | undefined): void {
  document.documentElement.style.setProperty('--ts', String(TEXT_SCALE[size ?? 'big'] ?? 1.15));
}
