/** Small canvas helpers shared by the renderer and the HUD. */

export type Ctx = CanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  return [c, g];
}

export function rect(g: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
}

/** 1 px outline. */
export function box(g: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  rect(g, x, y, w, 1, color);
  rect(g, x, y + h - 1, w, 1, color);
  rect(g, x, y, 1, h, color);
  rect(g, x + w - 1, y, 1, h, color);
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h,
    16,
  );
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** Darken (f < 1) or lighten (f > 1) a colour. */
export function shadeRgb([r, g, b]: [number, number, number], f: number): [number, number, number] {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  if (f <= 1) return [c(r * f), c(g * f), c(b * f)];
  const k = f - 1;
  return [c(r + (255 - r) * k), c(g + (255 - g) * k), c(b + (255 - b) * k)];
}
