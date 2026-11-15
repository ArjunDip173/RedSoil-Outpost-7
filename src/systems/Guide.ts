/**
 * "Where do I go next?" for young players.
 *
 * Keeps the current goal (the mission step, folding the solar panels before a storm, or going
 * home when the air or the rover battery runs low) and a route to it that the astronaut, or the
 * rover, really fits through. The HUD draws it as a glowing path on the ground, an arrow next to
 * the astronaut, a beacon on the goal and an arrow at the screen edge.
 */
import { TILE } from '../config';
import type { Game } from '../Game';
import type { TileMap } from '../world/TileMap';
import { clearLine, findPath, pathLength, type Pt, pointAlong, smoothPath } from '../world/pathfind';

export interface GuideTarget {
  x: number;
  y: number;
  /** What it is, for the beacon and the screen-edge arrow ("SOLAR PANELS"). */
  label: string;
  /** A safety goal (air or battery running out, a storm coming): drawn in red. */
  urgent?: boolean;
}

/** Closer than this (px) counts as "you are there": the path and the near arrow hide. */
export const ARRIVED = 22;

/**
 * How a body moves on the route grid. The astronaut uses tiles; the rover (30×16 px) uses
 * spots on the line between two tiles, so a node is free only if both tiles under it are.
 */
interface BodyProfile {
  w: number;
  h: number;
  /** Grid node under a world point. */
  node(x: number, y: number): [number, number];
  /** World point of a grid node (the middle of the body). */
  point(nx: number, ny: number): Pt;
}

const WALKER: BodyProfile = {
  w: 10,
  h: 8,
  node: (x, y) => [Math.floor(x / TILE), Math.floor(y / TILE)],
  point: (nx, ny) => ({ x: nx * TILE + TILE / 2, y: ny * TILE + TILE / 2 }),
};

const ROVER: BodyProfile = {
  w: 30,
  h: 16,
  node: (x, y) => [Math.round(x / TILE), Math.floor(y / TILE)],
  point: (nx, ny) => ({ x: nx * TILE, y: ny * TILE + TILE / 2 }),
};

export class Guide {
  target: GuideTarget | null = null;
  /** The route in world pixels; the first point is the astronaut (or the rover). */
  path: Pt[] = [];
  /** Walking (or driving) distance left, in px. */
  distance = 0;
  /** The rover can't fit all the way: the path ends where to park and walk the rest. */
  parkAndWalk = false;
  /** Seconds since the goal changed: the path shines brighter at first so it gets noticed. */
  sinceNew = 99;
  private game: Game;
  private key = '';
  private label = '';
  private refresh = 0;

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
      this.parkAndWalk = false;
      return;
    }
    if (t.label !== this.label) {
      this.label = t.label;
      this.sinceNew = 0;
      // the first time ever: tell the player what the dots are (once per save)
      g.hint(
        'guide_path',
        'See the glowing yellow dots on the ground? Follow them, and the arrow next to you, to your next job!',
        'happy',
        3600,
        2,
      );
    }
    const driving = g.rover.driving;
    const body = driving ? g.rover : g.player;
    const from = { x: body.x + body.w / 2, y: body.y + body.h / 2 };
    const profile = driving ? ROVER : WALKER;
    const [sx, sy] = profile.node(from.x, from.y);
    const [gx, gy] = profile.node(t.x, t.y);
    const key = `${driving}|${sx},${sy}>${gx},${gy}`;
    this.refresh -= dt;
    if (key !== this.key || this.refresh <= 0) {
      this.key = key;
      this.refresh = 1.2;
      this.route(profile, from, sx, sy, gx, gy, t);
      if (this.parkAndWalk)
        g.hint(
          'parkwalk',
          'The rover is too big to fit all the way there! Drive to the end of the path, hop out and walk the rest.',
          'think',
          3600,
          2,
        );
    } else if (this.path.length) this.path[0] = from; // keep the start under the body between updates
    this.distance = pathLength(this.path);
  }

  private route(profile: BodyProfile, from: Pt, sx: number, sy: number, gx: number, gy: number, t: GuideTarget): void {
    const map = this.game.map;
    const fits = (x: number, y: number) => !map.rectSolid(x - profile.w / 2, y - profile.h / 2, profile.w, profile.h);
    const blocked = memoGrid(map, (nx, ny) => {
      const p = profile.point(nx, ny);
      return !fits(p.x, p.y);
    });
    const isRover = profile === ROVER;
    const nodes = findPath(blocked, map.w + 1, map.h, sx, sy, gx, gy, 40000, isRover);
    if (!nodes) {
      // no way found (or very far): point straight at it
      this.parkAndWalk = false;
      this.path = [from, { x: t.x, y: t.y }];
      return;
    }
    const [ex, ey] = nodes[nodes.length - 1];
    this.parkAndWalk = isRover && Math.max(Math.abs(ex - gx), Math.abs(ey - gy)) > 2;
    const pts = nodes.map(([nx, ny]) => profile.point(nx, ny));
    pts[0] = from;
    this.path = smoothPath(pts, (a, b) => clearLine(fits, a, b));
    // finish on the goal itself when the body fits there, so the dots lead right up to it
    if (!this.parkAndWalk && fits(t.x, t.y)) this.path.push({ x: t.x, y: t.y });
  }

  /** A point a little way along the route: where the arrow next to the astronaut points. */
  ahead(dist = 3 * TILE): Pt | null {
    return pointAlong(this.path, dist);
  }

  get arrived(): boolean {
    return !!this.target && !this.parkAndWalk && this.distance < ARRIVED;
  }
}

/** Remembers each node's answer for one route search (the same node is asked about many times). */
function memoGrid(map: TileMap, test: (x: number, y: number) => boolean): (x: number, y: number) => boolean {
  const w = map.w + 1;
  const seen = new Uint8Array(w * map.h); // 0 = not asked yet, 1 = free, 2 = blocked
  return (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= map.h) return true;
    const i = y * w + x;
    if (!seen[i]) seen[i] = test(x, y) ? 2 : 1;
    return seen[i] === 2;
  };
}
