/**
 * Finds a walkable route on the tile grid (A*, 8 directions, no cutting past corners), then
 * straightens it where nothing is in the way. Used for the glowing "follow me" path.
 */

export type Blocked = (tx: number, ty: number) => boolean;

class Heap {
  private items: number[] = [];
  private prio: number[] = [];
  get size(): number {
    return this.items.length;
  }
  push(item: number, p: number): void {
    const a = this.items;
    const pr = this.prio;
    a.push(item);
    pr.push(p);
    let i = a.length - 1;
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (pr[up] <= pr[i]) break;
      [a[up], a[i]] = [a[i], a[up]];
      [pr[up], pr[i]] = [pr[i], pr[up]];
      i = up;
    }
  }
  pop(): number {
    const a = this.items;
    const pr = this.prio;
    const top = a[0];
    const lastItem = a.pop()!;
    const lastPrio = pr.pop()!;
    if (a.length) {
      a[0] = lastItem;
      pr[0] = lastPrio;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && pr[l] < pr[m]) m = l;
        if (r < a.length && pr[r] < pr[m]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        [pr[m], pr[i]] = [pr[i], pr[m]];
        i = m;
      }
    }
    return top;
  }
}

const DIRS: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/**
 * Tiles from (sx, sy) to the goal, or null if there is no way (or it is too far to search).
 * When the goal tile itself is solid (a machine, a dish), any free tile within 2 tiles counts.
 */
export function findPath(blocked: Blocked, w: number, h: number, sx: number, sy: number, gx: number, gy: number, maxNodes = 40000): [number, number][] | null {
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;
  const free = (x: number, y: number) => inside(x, y) && !blocked(x, y);
  const reach = free(gx, gy) ? 0 : 2;
  const isGoal = (x: number, y: number) => Math.max(Math.abs(x - gx), Math.abs(y - gy)) <= reach;
  if (!inside(sx, sy)) return null;
  if (isGoal(sx, sy)) return [[sx, sy]];
  const n = w * h;
  const cost = new Float32Array(n).fill(Infinity);
  const from = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const heur = (x: number, y: number) => {
    const dx = Math.abs(x - gx);
    const dy = Math.abs(y - gy);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy) - reach;
  };
  const open = new Heap();
  const s = sy * w + sx;
  cost[s] = 0;
  open.push(s, heur(sx, sy));
  let expanded = 0;
  while (open.size) {
    const cur = open.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % w;
    const cy = (cur - cx) / w;
    if (isGoal(cx, cy) && free(cx, cy)) {
      const out: [number, number][] = [];
      for (let i = cur; i !== -1; i = from[i]) out.push([i % w, Math.floor(i / w)]);
      return out.reverse();
    }
    if (++expanded > maxNodes) return null;
    for (const [dx, dy, step] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!free(nx, ny)) continue;
      // a diagonal step may not squeeze between two solid corners
      if (dx && dy && (!free(cx + dx, cy) || !free(cx, cy + dy))) continue;
      const ni = ny * w + nx;
      if (closed[ni]) continue;
      const c = cost[cur] + step;
      if (c < cost[ni]) {
        cost[ni] = c;
        from[ni] = cur;
        open.push(ni, c + heur(nx, ny));
      }
    }
  }
  return null;
}

/** Can you walk in a straight line between two points (world px) without touching a solid tile? */
export function clearLine(blocked: Blocked, tile: number, ax: number, ay: number, bx: number, by: number, half = 5): boolean {
  const len = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(1, Math.ceil(len / 4));
  // also check a little to each side, so the straightened path keeps off walls and corners
  const nx = len ? (-(by - ay) / len) * half : 0;
  const ny = len ? ((bx - ax) / len) * half : 0;
  for (let i = 0; i <= steps; i++) {
    const x = ax + ((bx - ax) * i) / steps;
    const y = ay + ((by - ay) * i) / steps;
    for (const k of [0, 1, -1]) if (blocked(Math.floor((x + nx * k) / tile), Math.floor((y + ny * k) / tile))) return false;
  }
  return true;
}

/** Tile path → a few world-pixel points, skipping corners that are not needed. */
export function smoothPath(blocked: Blocked, tile: number, tiles: [number, number][], start: { x: number; y: number }): { x: number; y: number }[] {
  const pts = tiles.map(([x, y]) => ({ x: x * tile + tile / 2, y: y * tile + tile / 2 }));
  if (pts.length) pts[0] = { ...start };
  if (pts.length <= 2) return pts;
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    // look at most 24 tiles ahead: long straight lines are rare and the check is not free
    j = Math.min(j, i + 24);
    while (j > i + 1 && !clearLine(blocked, tile, pts[i].x, pts[i].y, pts[j].x, pts[j].y)) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

/** Length of a polyline in world pixels. */
export function pathLength(pts: { x: number; y: number }[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return d;
}

/** The point `dist` pixels along a polyline (the end if it is shorter). */
export function pointAlong(pts: { x: number; y: number }[], dist: number): { x: number; y: number } | null {
  if (!pts.length) return null;
  let left = dist;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= seg && seg > 0) return { x: a.x + ((b.x - a.x) * left) / seg, y: a.y + ((b.y - a.y) * left) / seg };
    left -= seg;
  }
  return { ...pts[pts.length - 1] };
}
