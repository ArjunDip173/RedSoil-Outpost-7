/**
 * Top-down movement: axis-separated AABB collision against standing objects
 * (rocks, walls, machines). No gravity - you walk across the Martian surface.
 */
import type { TileMap } from '../world/TileMap';

export interface Body {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
}

export function moveBody(map: TileMap, b: Body, dt: number): { hit: boolean } {
  let hit = false;
  if (b.vx !== 0) {
    const nx = b.x + b.vx * dt;
    if (!map.rectSolid(nx, b.y, b.w, b.h)) b.x = nx;
    else {
      // slide along: step in smaller increments until blocked
      const step = Math.sign(b.vx);
      for (let k = 0; k < Math.ceil(Math.abs(b.vx * dt)); k++) {
        if (map.rectSolid(b.x + step, b.y, b.w, b.h)) break;
        b.x += step;
      }
      b.vx = 0;
      hit = true;
    }
  }
  if (b.vy !== 0) {
    const ny = b.y + b.vy * dt;
    if (!map.rectSolid(b.x, ny, b.w, b.h)) b.y = ny;
    else {
      const step = Math.sign(b.vy);
      for (let k = 0; k < Math.ceil(Math.abs(b.vy * dt)); k++) {
        if (map.rectSolid(b.x, b.y + step, b.w, b.h)) break;
        b.y += step;
      }
      b.vy = 0;
      hit = true;
    }
  }
  return { hit };
}

export function overlaps(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
