/**
 * "Where do I go next?" for young players.
 *
 * Keeps the current goal (from the mission step, or "go home" when the air or the rover battery
 * is running low) and a walkable route to it, which the HUD draws as a glowing path on the
 * ground, an arrow next to the astronaut, a beacon on the goal and an arrow at the screen edge.
 */
import { TILE } from '../config';
import type { Game } from '../Game';
import { type Blocked, findPath, pathLength, pointAlong, smoothPath } from '../world/pathfind';

export interface GuideTarget {
  x: number;
  y: number;
  /** What it is, for the beacon and the screen-edge arrow ("SOLAR PANELS"). */
  label: string;
  /** A safety goal (air or battery running out): drawn in red. */
  urgent?: boolean;
}

/** Closer than this (px) counts as "you are there": the path and the near arrow hide. */
export const ARRIVED = 22;

export class Guide {
  target: GuideTarget | null = null;
  /** The route in world pixels; the first point is the astronaut (or the rover). */
  path: { x: number; y: number }[] = [];
  /** Walking distance left, in px. */
  distance = 0;
  /** Seconds since the goal changed: the path shines brighter at first so it gets noticed. */
  sinceNew = 99;
  private game: Game;
  private key = '';
  private label = '';
  private refresh = 0;
  private straight = false;

  constructor(game: Game) {
    this.game = game;
  }

  update(dt: number): void {
    const g = this.game;
    this.sinceNew += dt;
    const t = g.guideTarget();
    this.target = t;
    if (!t) {
      this.path = [];
      this.distance = 0;
      this.label = '';
      return;
    }
    if (t.label !== this.label) {
      this.label = t.label;
      this.sinceNew = 0;
      // the first time ever: tell the player what the dots are (once per save)
      g.hint('guide_path', 'See the glowing yellow dots on the ground? Follow them, and the arrow next to you, to your next job!', 'happy', 3600, 2);
    }
    const body = g.rover.driving ? g.rover : g.player;
    const from = { x: body.x + body.w / 2, y: body.y + body.h / 2 };
    const sx = Math.floor(from.x / TILE);
    const sy = Math.floor(from.y / TILE);
    const gx = Math.floor(t.x / TILE);
    const gy = Math.floor(t.y / TILE);
    const key = `${sx},${sy}>${gx},${gy}`;
    this.refresh -= dt;
    if (key !== this.key || this.refresh <= 0) {
      this.key = key;
      this.refresh = 1.2;
      this.route(from, sx, sy, gx, gy, t);
    } else if (this.path.length) this.path[0] = from; // keep the start under the astronaut between updates
    this.distance = this.straight ? Math.hypot(t.x - from.x, t.y - from.y) : pathLength(this.path);
  }

  private route(from: { x: number; y: number }, sx: number, sy: number, gx: number, gy: number, t: GuideTarget): void {
    const map = this.game.map;
    // machines inside the base block the way too (only where they cover a tile's middle)
    const solidMachine = new Set<number>();
    for (const b of map.blockers) {
      for (let ty = Math.floor(b.y / TILE); ty <= Math.floor((b.y + b.h) / TILE); ty++)
        for (let tx = Math.floor(b.x / TILE); tx <= Math.floor((b.x + b.w) / TILE); tx++) {
          const mx = tx * TILE + TILE / 2;
          const my = ty * TILE + TILE / 2;
          if (mx > b.x && mx < b.x + b.w && my > b.y && my < b.y + b.h) solidMachine.add(ty * map.w + tx);
        }
    }
    const blocked: Blocked = (x, y) => map.isSolid(x, y) || solidMachine.has(y * map.w + x);
    const tiles = findPath(blocked, map.w, map.h, sx, sy, gx, gy);
    if (tiles) {
      this.straight = false;
      this.path = smoothPath(blocked, TILE, tiles, from);
      // finish on the goal itself when it can be walked to, so the dots lead right up to it
      if (!blocked(gx, gy) && this.path.length) this.path.push({ x: t.x, y: t.y });
    } else {
      // no way found (or very far): point straight at it
      this.straight = true;
      this.path = [from, { x: t.x, y: t.y }];
    }
  }

  /** A point a little way along the route: where the arrow next to the astronaut points. */
  ahead(dist = 3 * TILE): { x: number; y: number } | null {
    return pointAlong(this.path, dist);
  }

  get arrived(): boolean {
    return !!this.target && this.distance < ARRIVED;
  }
}
