/**
 * Route finding for the glowing "follow me" path: A* on a grid of nodes (8 directions, no
 * cutting past corners), then the route is straightened wherever the body still fits.
 * A node is usually a tile, but the caller decides what "blocked" means, so the same search
 * works for the astronaut (one tile) and the rover (two tiles wide).
 */

export type Blocked = (x: number, y: number) => boolean;
export interface Pt {
  x: number;
  y: number;
}

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
 * Nodes from (sx, sy) to the goal, or null if there is no way (or it is too far to search).
 * When the goal node itself is blocked (a machine, a dish), any free node within 2 counts.
 * With `partial`, an unreachable goal gives the route to the closest node that can be reached.
 */
export function findPath(
  blocked: Blocked,
  w: number,
  h: number,
  sx: number,
  sy: number,
  gx: number,
  gy: number,
  maxNodes = 40000,
  partial = false,
): [number, number][] | null {
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
  const trace = (end: number) => {
    const out: [number, number][] = [];
    for (let i = end; i !== -1; i = from[i]) out.push([i % w, Math.floor(i / w)]);
    return out.reverse();
  };
  let closest = s;
  let closestH = heur(sx, sy);
  let expanded = 0;
  while (open.size) {
    const cur = open.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % w;
    const cy = (cur - cx) / w;
    if (isGoal(cx, cy) && free(cx, cy)) return trace(cur);
    const hh = heur(cx, cy);
    if (hh < closestH) {
      closest = cur;
      closestH = hh;
    }
    if (++expanded > maxNodes) break;
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
  return partial && closest !== s ? trace(closest) : null;
}

/** Can the body move in a straight line from a to b? `fits(x, y)` checks one spot (world px). */
export function clearLine(fits: (x: number, y: number) => boolean, a: Pt, b: Pt): boolean {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4));
  for (let i = 0; i <= steps; i++)
    if (!fits(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps)) return false;
  return true;
}

/** Drops the corners of a route that are not needed: from each point, jump to the furthest one in a clear line. */
export function smoothPath(pts: Pt[], clear: (a: Pt, b: Pt) => boolean): Pt[] {
  if (pts.length <= 2) return pts.slice();
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    // look at most 24 nodes ahead: long straight lines are rare and each check costs a little
    let j = Math.min(pts.length - 1, i + 24);
    while (j > i + 1 && !clear(pts[i], pts[j])) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

/** Length of a polyline in world pixels. */
export function pathLength(pts: Pt[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return d;
}

/** The point `dist` pixels along a polyline (the end if it is shorter). */
export function pointAlong(pts: Pt[], dist: number): Pt | null {
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
