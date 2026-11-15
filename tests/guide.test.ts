// The "where to go" guide: walkable routes on the tile grid.
import { describe, expect, it } from 'vitest';
import { clearLine, findPath, pathLength, pointAlong, smoothPath } from '../src/world/pathfind';

/** A little map from text: '#' is solid, '.' is free. */
function grid(rows: string[]) {
  const h = rows.length;
  const w = rows[0].length;
  const blocked = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h || rows[y][x] === '#';
  return { w, h, blocked };
}

describe('guide route', () => {
  it('walks around a wall through its gap instead of through it', () => {
    const m = grid([
      '..........', //
      '.####.###.',
      '.#......#.',
      '.#......#.',
      '..........',
    ]);
    // from inside the room to below the wall's middle: must use the gap at x=5
    const p = findPath(m.blocked, m.w, m.h, 3, 2, 3, 0)!;
    expect(p).not.toBeNull();
    expect(p[0]).toEqual([3, 2]);
    expect(p.at(-1)).toEqual([3, 0]);
    for (const [x, y] of p) expect(m.blocked(x, y)).toBe(false);
    expect(p.some(([x, y]) => x === 5 && y === 1)).toBe(true);
  });

  it('never squeezes diagonally between two solid corners', () => {
    const m = grid([
      '.#', //
      '#.',
    ]);
    expect(findPath(m.blocked, m.w, m.h, 0, 0, 1, 1)).toBeNull();
  });

  it('stops next to a goal that is solid (a machine or a dish)', () => {
    const m = grid([
      '.....', //
      '.....',
      '..#..',
      '.....',
    ]);
    const p = findPath(m.blocked, m.w, m.h, 0, 0, 2, 2)!;
    const [ex, ey] = p.at(-1)!;
    expect(m.blocked(ex, ey)).toBe(false);
    expect(Math.max(Math.abs(ex - 2), Math.abs(ey - 2))).toBeLessThanOrEqual(2);
  });

  it('gives up (null) when there is no way, so the guide can point straight instead', () => {
    const m = grid([
      '..#..', //
      '..#..',
      '..#..',
    ]);
    expect(findPath(m.blocked, m.w, m.h, 0, 1, 4, 1)).toBeNull();
  });

  it('straightens the route where nothing is in the way', () => {
    const m = grid(['..........', '..........', '..........', '..........']);
    const tiles = findPath(m.blocked, m.w, m.h, 0, 0, 9, 3)!;
    const pts = smoothPath(m.blocked, 16, tiles, { x: 8, y: 8 });
    expect(pts.length).toBe(2);
    expect(pathLength(pts)).toBeCloseTo(Math.hypot(9 * 16, 3 * 16), 0);
  });

  it('keeps corners when a straight line would cut through a wall', () => {
    const m = grid([
      '......', //
      '.####.',
      '......',
    ]);
    const tiles = findPath(m.blocked, m.w, m.h, 0, 2, 5, 0)!;
    const pts = smoothPath(m.blocked, 16, tiles, { x: 8, y: 40 });
    for (let i = 1; i < pts.length; i++) expect(clearLine(m.blocked, 16, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, 0)).toBe(true);
    expect(pts.length).toBeGreaterThan(2);
  });

  it('finds the point a little way along the route (for the arrow next to the astronaut)', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    expect(pointAlong(pts, 5)).toEqual({ x: 5, y: 0 });
    expect(pointAlong(pts, 15)).toEqual({ x: 10, y: 5 });
    expect(pointAlong(pts, 99)).toEqual({ x: 10, y: 10 });
  });

  it('is fast enough to run every second on the real 240×180 map', () => {
    const w = 240;
    const h = 180;
    // scattered rocks, like the Mars surface
    const blocked = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h || ((x * 7 + y * 13) % 11 === 0 && (x + y) % 3 === 0);
    const t0 = performance.now();
    const p = findPath(blocked, w, h, 5, 5, 230, 170);
    expect(p).not.toBeNull();
    expect(performance.now() - t0).toBeLessThan(250);
  });
});
