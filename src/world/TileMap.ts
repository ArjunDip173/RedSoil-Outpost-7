/**
 * The top-down Mars map.
 *
 * Three layers per tile:
 *   ground  - what you walk on (regolith, dunes, polar frost, crater floor, lava-tube floor, habitat floor…)
 *   obj     - things that stand up and block you (boulders, basalt, hematite, crystals, ice, walls you build)
 *   buried  - hidden subsurface ice under the soil (LUNA's scan reveals it; dig the ground to collect it)
 * Player edits are stored as a small diff so saves stay tiny.
 */
import { BASE_H, BASE_W, BASE_X, BASE_Y, G, GROUND_INFO, LANDMARKS, O, OBJ_INFO, TILE, WORLD_H, WORLD_SEED, WORLD_W } from '../config';
import { type Ctx } from '../core/canvas';
import { type Sprites } from '../core/Sprites';
import { clamp, fbm2, hash2, mulberry32 } from '../core/Rng';
import type { Rect } from '../types';

const DARK_STEPS = 24;
const darkCache: string[] = [];
for (let i = 0; i <= DARK_STEPS; i++) darkCache.push(`rgba(6,3,10,${(i / DARK_STEPS).toFixed(3)})`);

export type DigResult = { kind: 'obj'; id: number } | { kind: 'ground'; id: number; ice: boolean } | null;

export class TileMap {
  readonly w = WORLD_W;
  readonly h = WORLD_H;
  ground = new Uint8Array(WORLD_W * WORLD_H);
  obj = new Uint8Array(WORLD_W * WORLD_H);
  buried = new Uint8Array(WORLD_W * WORLD_H);
  revealed = new Uint8Array(WORLD_W * WORLD_H);
  caveMask = new Uint8Array(WORLD_W * WORLD_H);
  damage = new Map<number, number>();
  /** Player edits: index → ground*256 + obj. */
  changes = new Map<number, number>();
  /** Tile rectangles that can't be dug or built on. */
  protectedRects: Rect[] = [];
  /** Habitat interior (tiles). */
  interiorRects: Rect[] = [];
  /** Extra collision boxes in world px (machines, panels, antenna…). */
  blockers: Rect[] = [];
  scanUntil = 0;
  scanX = 0;
  scanY = 0;

  constructor() {
    this.generate();
  }

  idx(x: number, y: number): number {
    return y * this.w + x;
  }
  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  getGround(x: number, y: number): number {
    return this.inBounds(x, y) ? this.ground[y * this.w + x] : G.ROCKY;
  }
  getObj(x: number, y: number): number {
    return this.inBounds(x, y) ? this.obj[y * this.w + x] : O.BEDROCK;
  }
  isSolid(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return true;
    return this.obj[y * this.w + x] !== O.NONE;
  }
  isSolidPx(px: number, py: number): boolean {
    return this.isSolid(Math.floor(px / TILE), Math.floor(py / TILE));
  }

  /** Does a rectangle (px) overlap a solid tile or a machine? */
  rectSolid(x: number, y: number, w: number, h: number): boolean {
    const x0 = Math.floor(x / TILE);
    const x1 = Math.floor((x + w - 0.001) / TILE);
    const y0 = Math.floor(y / TILE);
    const y1 = Math.floor((y + h - 0.001) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (this.isSolid(tx, ty)) return true;
    for (const b of this.blockers) if (x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y) return true;
    return false;
  }

  private record(i: number): void {
    this.changes.set(i, this.ground[i] * 256 + this.obj[i]);
  }
  setGround(x: number, y: number, t: number, record = true): void {
    if (!this.inBounds(x, y)) return;
    const i = this.idx(x, y);
    this.ground[i] = t;
    if (record) this.record(i);
  }
  setObj(x: number, y: number, t: number, record = true): void {
    if (!this.inBounds(x, y)) return;
    const i = this.idx(x, y);
    this.obj[i] = t;
    this.damage.delete(i);
    if (record) this.record(i);
  }

  isProtected(x: number, y: number): boolean {
    for (const r of this.protectedRects) if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return true;
    return false;
  }
  isInterior(x: number, y: number): boolean {
    for (const r of this.interiorRects) if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return true;
    return false;
  }
  inCavePx(px: number, py: number): boolean {
    const x = Math.floor(px / TILE);
    const y = Math.floor(py / TILE);
    return this.inBounds(x, y) && this.caveMask[this.idx(x, y)] === 1;
  }

  canMine(x: number, y: number): boolean {
    if (!this.inBounds(x, y) || this.isProtected(x, y)) return false;
    const o = this.getObj(x, y);
    if (o !== O.NONE) return isFinite(OBJ_INFO[o].hardness);
    return isFinite(GROUND_INFO[this.getGround(x, y)].dig);
  }

  /** Building rule: an empty, buildable tile outside the habitat. */
  canPlace(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    if (this.getObj(x, y) !== O.NONE) return false;
    const gnd = this.getGround(x, y);
    if (gnd === G.FLOOR || gnd === G.PAD) return false;
    return !this.isProtected(x, y) && !this.isInterior(x, y);
  }

  /** Add laser damage. Breaking an object removes it; digging bare ground leaves a pit. */
  dig(x: number, y: number, amount: number): DigResult {
    if (!this.canMine(x, y)) return null;
    const i = this.idx(x, y);
    const o = this.obj[i];
    const hard = o !== O.NONE ? OBJ_INFO[o].hardness : GROUND_INFO[this.ground[i]].dig;
    const d = (this.damage.get(i) ?? 0) + amount / hard;
    if (d < 1) {
      this.damage.set(i, d);
      return null;
    }
    this.damage.delete(i);
    if (o !== O.NONE) {
      this.setObj(x, y, O.NONE);
      return { kind: 'obj', id: o };
    }
    const gnd = this.ground[i];
    const ice = this.buried[i] === 1 || gnd === G.POLAR;
    this.buried[i] = 0;
    this.setGround(x, y, G.PIT);
    return { kind: 'ground', id: gnd, ice };
  }

  healDamage(dt: number, except: number): void {
    for (const [i, d] of this.damage) {
      if (i === except) continue;
      const nd = d - dt * 0.6;
      if (nd <= 0) this.damage.delete(i);
      else this.damage.set(i, nd);
    }
  }

  /** LUNA's scan: reveal buried ice around a point. Returns how many ice tiles were found. */
  scan(px: number, py: number, radius: number, now: number): number {
    const cx = Math.floor(px / TILE);
    const cy = Math.floor(py / TILE);
    let found = 0;
    for (let y = cy - radius; y <= cy + radius; y++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        if (!this.inBounds(x, y) || (x - cx) ** 2 + (y - cy) ** 2 > radius * radius) continue;
        const i = this.idx(x, y);
        if (this.buried[i]) {
          this.revealed[i] = 1;
          found++;
        }
      }
    }
    this.scanUntil = now + 6;
    this.scanX = px;
    this.scanY = py;
    return found;
  }

  // ───────────────────────── generation ─────────────────────────

  private generate(): void {
    const S = WORLD_SEED;
    const r = mulberry32(S);
    const W = this.w;
    const H = this.h;
    const clear = { x0: LANDMARKS.roverPad.x - 5, y0: BASE_Y - 5, x1: BASE_X + BASE_W + 6, y1: LANDMARKS.solarField.y + LANDMARKS.solarField.dy * 2 + 5 };
    const inClear = (x: number, y: number) => x >= clear.x0 && x <= clear.x1 && y >= clear.y0 && y <= clear.y1;
    const distBase = (x: number, y: number) => Math.hypot(x - (BASE_X + BASE_W / 2), y - (BASE_Y + BASE_H / 2));

    // 1) ground
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        let gnd: number = G.REGOLITH;
        if (fbm2(x / 18, y / 18, 3, S) > 0.6) gnd = G.DUNE;
        if (fbm2(x / 9, y / 9, 3, S + 3) > 0.68) gnd = G.ROCKY;
        const north = LANDMARKS.polarRows + Math.round((fbm2(x / 10, 0, 3, S + 8) - 0.5) * 8);
        const south = H - 8 + Math.round((fbm2(x / 10, 5, 3, S + 9) - 0.5) * 4);
        if (y < north || y > south) gnd = G.POLAR;
        this.ground[i] = gnd;
      }
    }

    // 2) scattered rocks, minerals, polar ice and buried ice
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (inClear(x, y)) continue;
        const gnd = this.ground[i];
        const h = hash2(x, y, S);
        const rocky = fbm2(x / 12, y / 12, 3, S + 11);
        if (gnd === G.POLAR) {
          if (fbm2(x / 5, y / 5, 3, S + 12) > 0.6) this.obj[i] = O.ICE;
          continue;
        }
        if (h < 0.02 + Math.max(0, rocky - 0.5) * 0.35) this.obj[i] = hash2(x, y, S + 1) < 0.3 ? O.BASALT : O.BOULDER;
        else if (fbm2(x / 5, y / 5, 3, S + 66) > 0.79 && distBase(x, y) > 18) this.obj[i] = O.HEMATITE;
        else if (fbm2(x / 4, y / 4, 3, S + 77) > 0.83 && distBase(x, y) > 55) this.obj[i] = O.CRYSTAL;
        const pole = Math.max(0, 1 - Math.min(y, H - y) / 60);
        if (fbm2(x / 6, y / 6, 3, S + 55) > 0.72 - pole * 0.15) this.buried[i] = 1;
      }
    }

    // 3) small craters
    for (let k = 0; k < 14; k++) {
      const cx = 10 + Math.floor(r() * (W - 20));
      const cy = 20 + Math.floor(r() * (H - 40));
      if (Math.hypot(cx - (BASE_X + 15), cy - (BASE_Y + 12)) < 30) continue;
      this.crater(cx, cy, 2 + Math.floor(r() * 3), false);
    }

    // 4) the big crater (exposed ice in the middle)
    const C = LANDMARKS.crater;
    this.crater(C.x, C.y, C.r, true);
    for (let y = C.y - 2; y <= C.y + 2; y++) for (let x = C.x - 1; x <= C.x + 4; x++) if (hash2(x, y, 4) < 0.55) this.obj[y * W + x] = O.ICE;

    // 5) lava tube cave: solid lava rock with a winding tunnel carved through it
    const cv = LANDMARKS.cave;
    for (let y = cv.y; y < cv.y + cv.h; y++) {
      for (let x = cv.x; x < cv.x + cv.w; x++) {
        const edge = Math.min(x - cv.x, cv.x + cv.w - 1 - x, y - cv.y, cv.y + cv.h - 1 - y);
        if (edge < 2 && hash2(x, y, 31) < 0.35) continue; // ragged outline
        this.obj[y * W + x] = O.CLIFF;
        this.ground[y * W + x] = G.CAVE;
        this.buried[y * W + x] = 0;
      }
    }
    let ty: number = cv.entranceY;
    for (let x = cv.x + cv.w + 1; x >= LANDMARKS.cavePart.x - 1; x--) {
      ty += Math.round(Math.sin(x / 5) * 0.6);
      ty = clamp(ty, cv.y + 4, cv.y + cv.h - 5);
      for (let dy = -2; dy <= 2; dy++) for (let dx = 0; dx <= 1; dx++) this.carveCave(x + dx, ty + dy);
    }
    for (let y = -4; y <= 4; y++) for (let x = -5; x <= 5; x++) if (x * x + y * y * 1.6 <= 26) this.carveCave(LANDMARKS.cavePart.x + x, LANDMARKS.cavePart.y + y);
    for (let y = cv.y; y < cv.y + cv.h; y++) {
      for (let x = cv.x; x < cv.x + cv.w; x++) {
        const i = y * W + x;
        if (!this.caveMask[i]) continue;
        if (hash2(x, y, 41) < 0.04 && Math.abs(x - LANDMARKS.cavePart.x) > 3) this.obj[i] = O.CRYSTAL;
        if (hash2(x, y, 42) < 0.25) this.buried[i] = 1;
      }
    }

    // 6) antenna ridge: a ring of basalt with an opening to the south
    const A = LANDMARKS.antenna;
    for (let y = A.y - 7; y <= A.y + 7; y++) {
      for (let x = A.x - 7; x <= A.x + 7; x++) {
        if (!this.inBounds(x, y)) continue;
        const d = Math.hypot(x - A.x, y - A.y);
        const i = y * W + x;
        if (d < 5.5) {
          this.obj[i] = O.NONE;
          this.ground[i] = G.ROCKY;
        } else if (d < 7 && !(y > A.y + 3 && Math.abs(x - A.x) < 3)) this.obj[i] = O.BASALT;
      }
    }

    // 7) clear zones: lander site and the outpost itself
    const L = LANDMARKS.lander;
    for (let y = L.y - 6; y <= L.y + 6; y++) for (let x = L.x - 7; x <= L.x + 7; x++) if (this.inBounds(x, y)) this.obj[y * W + x] = O.NONE;
    for (let y = clear.y0; y <= clear.y1; y++) {
      for (let x = clear.x0; x <= clear.x1; x++) {
        const i = y * W + x;
        this.obj[i] = O.NONE;
        this.buried[i] = 0;
        if (this.ground[i] === G.ROCKY) this.ground[i] = G.REGOLITH;
      }
    }

    // 8) guaranteed ice pockets & ore near the base (Mission 3)
    const pockets: [number, number, number][] = [
      [BASE_X + BASE_W + 14, BASE_Y + 22, 3],
      [BASE_X - 18, BASE_Y - 10, 3],
      [BASE_X + 12, BASE_Y + 36, 4],
      [BASE_X + BASE_W + 20, BASE_Y - 6, 3],
    ];
    for (const [cx, cy, rad] of pockets) {
      for (let y = cy - rad; y <= cy + rad; y++) {
        for (let x = cx - rad; x <= cx + rad; x++) {
          if (!this.inBounds(x, y) || (x - cx) ** 2 + (y - cy) ** 2 > rad * rad) continue;
          const i = y * W + x;
          this.obj[i] = O.NONE;
          this.buried[i] = 1;
        }
      }
    }
    const cluster = (cx: number, cy: number, id: number, n: number) => {
      for (let k = 0; k < n; k++) {
        const x = cx + Math.floor(r() * 5) - 2;
        const y = cy + Math.floor(r() * 5) - 2;
        if (this.inBounds(x, y) && !inClear(x, y)) this.obj[y * W + x] = id;
      }
    };
    cluster(BASE_X + BASE_W + 12, BASE_Y + 4, O.HEMATITE, 7);
    cluster(BASE_X - 24, BASE_Y + 20, O.BASALT, 7);
    cluster(BASE_X + 20, BASE_Y - 12, O.HEMATITE, 5);
    cluster(BASE_X - 10, BASE_Y + 40, O.BASALT, 6);

    // 9) canyon walls around the edge of the world
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) this.obj[y * W + x] = O.BEDROCK;
  }

  private carveCave(x: number, y: number): void {
    if (!this.inBounds(x, y)) return;
    const i = this.idx(x, y);
    this.obj[i] = O.NONE;
    this.ground[i] = G.CAVE;
    this.caveMask[i] = 1;
  }

  private crater(cx: number, cy: number, rad: number, big: boolean): void {
    for (let y = cy - rad - 2; y <= cy + rad + 2; y++) {
      for (let x = cx - rad - 2; x <= cx + rad + 2; x++) {
        if (!this.inBounds(x, y)) continue;
        const d = Math.hypot(x - cx, y - cy);
        const i = y * this.w + x;
        if (d <= rad) {
          this.ground[i] = G.CRATER;
          this.obj[i] = O.NONE;
          if (big && d > rad - 3 && hash2(x, y, 9) < 0.3) this.buried[i] = 1;
        } else if (d <= rad + 1.5) {
          this.ground[i] = G.ROCKY;
          // rocky rim with a gap on the west side so you can walk in
          if (big && hash2(x, y, 7) < 0.55 && !(Math.abs(y - cy) < 3 && x < cx)) this.obj[i] = hash2(x, y, 8) < 0.5 ? O.BOULDER : O.BASALT;
        }
      }
    }
  }

  applyChanges(list: [number, number][]): void {
    for (const [i, v] of list) {
      if (i < 0 || i >= this.ground.length) continue;
      this.ground[i] = v >> 8;
      this.obj[i] = v & 255;
      if (this.ground[i] === G.PIT) this.buried[i] = 0;
      this.changes.set(i, v);
    }
  }

  serializeChanges(): [number, number][] {
    return Array.from(this.changes.entries());
  }

  /** Nearest ice to a point: exposed ice blocks or buried ice. */
  nearestIce(px: number, py: number, radius = 45, revealedOnly = false): { x: number; y: number } | null {
    const cx = Math.floor(px / TILE);
    const cy = Math.floor(py / TILE);
    let best: { x: number; y: number } | null = null;
    let bd = Infinity;
    for (let y = Math.max(0, cy - radius); y < Math.min(this.h, cy + radius); y++) {
      for (let x = Math.max(0, cx - radius); x < Math.min(this.w, cx + radius); x++) {
        const i = y * this.w + x;
        const isIce = this.obj[i] === O.ICE || (this.buried[i] === 1 && (!revealedOnly || this.revealed[i] === 1) && this.obj[i] === O.NONE);
        if (!isIce) continue;
        const d = (x - cx) ** 2 + (y - cy) ** 2;
        if (d < bd) {
          bd = d;
          best = { x: x * TILE + 8, y: y * TILE + 8 };
        }
      }
    }
    return best;
  }

  // ───────────────────────── rendering ─────────────────────────

  renderGround(g: Ctx, art: Sprites, camX: number, camY: number, vw: number, vh: number, time: number): void {
    const x0 = Math.max(0, Math.floor(camX / TILE));
    const y0 = Math.max(0, Math.floor(camY / TILE));
    const x1 = Math.min(this.w - 1, Math.floor((camX + vw) / TILE));
    const y1 = Math.min(this.h - 1, Math.floor((camY + vh) / TILE) + 1);
    const scanning = time < this.scanUntil;
    const ring = (6 - (this.scanUntil - time)) * 160;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const i = ty * this.w + tx;
        const v = art.ground[this.ground[i]];
        const sx = tx * TILE - Math.round(camX);
        const sy = ty * TILE - Math.round(camY);
        g.drawImage(v[(hash2(tx, ty, 3) * v.length) | 0], sx, sy);
        // revealed subsurface ice glimmers through the soil
        if (this.buried[i] && this.revealed[i] && this.obj[i] === O.NONE) {
          // icy crystals peeking through the soil, twinkling
          const pulse = 0.55 + 0.35 * Math.sin(time * 3 + tx * 0.7 + ty * 0.4);
          g.fillStyle = 'rgba(120,210,255,0.18)';
          g.fillRect(sx + 1, sy + 1, 14, 14);
          for (let k = 0; k < 3; k++) {
            const ox = 2 + (((tx * 7 + ty * 3 + k * 5) % 10) | 0);
            const oy = 2 + (((ty * 5 + tx * 2 + k * 4) % 10) | 0);
            g.fillStyle = `rgba(150,235,255,${pulse})`;
            g.fillRect(sx + ox, sy + oy, 3, 2);
            g.fillStyle = `rgba(255,255,255,${pulse})`;
            g.fillRect(sx + ox, sy + oy, 1, 1);
          }
        }
        if (scanning && Math.abs(Math.hypot(tx * TILE + 8 - this.scanX, ty * TILE + 8 - this.scanY) - ring) < 10) {
          g.fillStyle = 'rgba(127,227,255,0.25)';
          g.fillRect(sx, sy, TILE, TILE);
        }
        const dmg = this.obj[i] === O.NONE ? this.damage.get(i) : undefined;
        if (dmg) this.drawCracks(g, sx, sy, dmg, tx, ty);
      }
    }
  }

  private drawCracks(g: Ctx, sx: number, sy: number, dmg: number, tx: number, ty: number): void {
    g.fillStyle = 'rgba(20,6,4,0.75)';
    const steps = Math.ceil(dmg * 5);
    for (let k = 0; k < steps; k++) {
      const a = hash2(tx + k, ty, 11) * 12;
      const b = hash2(tx, ty + k, 12) * 12;
      g.fillRect(sx + 2 + (a | 0), sy + 2 + (b | 0), 3, 1);
      g.fillRect(sx + 4 + (a | 0), sy + 3 + (b | 0), 1, 3);
    }
  }

  /** Draw one standing object (called from the y-sorted draw list). */
  drawObject(g: Ctx, art: Sprites, tx: number, ty: number, camX: number, camY: number, time: number): void {
    const i = ty * this.w + tx;
    const id = this.obj[i];
    const v = art.objs[id];
    if (!v) return;
    const sx = tx * TILE - Math.round(camX);
    const sy = ty * TILE - 8 - Math.round(camY);
    g.drawImage(v[(hash2(tx, ty, 5) * v.length) | 0], sx, sy);
    const dmg = this.damage.get(i);
    if (dmg) this.drawCracks(g, sx, sy + 4, dmg, tx, ty);
    if (time < this.scanUntil && (id === O.ICE || id === O.CRYSTAL || id === O.HEMATITE)) {
      const pulse = 0.25 + 0.25 * Math.sin(time * 6 + tx);
      g.fillStyle = id === O.ICE ? `rgba(160,240,255,${pulse})` : id === O.CRYSTAL ? `rgba(180,255,120,${pulse})` : `rgba(220,220,255,${pulse})`;
      g.fillRect(sx + 1, sy + 1, 14, 22);
    }
  }

  /** Visit every object tile in view (for the y-sorted draw list). */
  forEachObject(camX: number, camY: number, vw: number, vh: number, fn: (tx: number, ty: number) => void): void {
    const x0 = Math.max(0, Math.floor(camX / TILE));
    const y0 = Math.max(0, Math.floor(camY / TILE));
    const x1 = Math.min(this.w - 1, Math.floor((camX + vw) / TILE));
    const y1 = Math.min(this.h - 1, Math.floor((camY + vh) / TILE) + 1);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (this.obj[ty * this.w + tx] !== O.NONE) fn(tx, ty);
  }

  /** Darkness for the lighting pass: night outside, always dark in the lava tube, bright inside the hab. */
  renderDarkness(g: Ctx, camX: number, camY: number, vw: number, vh: number, night: number): void {
    const x0 = Math.max(0, Math.floor(camX / TILE) - 1);
    const y0 = Math.max(0, Math.floor(camY / TILE) - 1);
    const x1 = Math.min(this.w - 1, Math.floor((camX + vw) / TILE) + 1);
    const y1 = Math.min(this.h - 1, Math.floor((camY + vh) / TILE) + 1);
    const outside = night * 0.8;
    if (outside > 0.01) {
      g.fillStyle = darkCache[Math.round(outside * DARK_STEPS)];
      g.fillRect(0, 0, vw, vh);
    }
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const i = ty * this.w + tx;
        let a = -1;
        if (this.caveMask[i]) a = Math.max(0.82, outside);
        else if (this.isInterior(tx, ty)) a = night * 0.12;
        if (a < 0 || Math.abs(a - outside) < 0.01) continue;
        const sx = tx * TILE - Math.round(camX);
        const sy = ty * TILE - Math.round(camY);
        g.clearRect(sx, sy, TILE, TILE);
        if (a > 0.01) {
          g.fillStyle = darkCache[Math.round(clamp(a, 0, 1) * DARK_STEPS)];
          g.fillRect(sx, sy, TILE, TILE);
        }
      }
    }
  }

  glowTiles(camX: number, camY: number, vw: number, vh: number): { x: number; y: number; color: string }[] {
    const out: { x: number; y: number; color: string }[] = [];
    this.forEachObject(camX, camY, vw, vh, (tx, ty) => {
      const info = OBJ_INFO[this.obj[ty * this.w + tx]];
      if (info.glow && (tx + ty) % 2 === 0) out.push({ x: tx * TILE + 8, y: ty * TILE + 4, color: info.glow });
    });
    return out;
  }

  private colorAt(i: number): string {
    const o = this.obj[i];
    if (o !== O.NONE) return OBJ_INFO[o].map;
    return GROUND_INFO[this.ground[i]].map;
  }

  bakeMinimap(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = this.w;
    c.height = this.h;
    const g = c.getContext('2d')!;
    const img = g.createImageData(this.w, this.h);
    for (let i = 0; i < this.w * this.h; i++) {
      const n = parseInt(this.colorAt(i).slice(1), 16);
      img.data[i * 4] = (n >> 16) & 255;
      img.data[i * 4 + 1] = (n >> 8) & 255;
      img.data[i * 4 + 2] = n & 255;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  updateMinimap(c: HTMLCanvasElement, x: number, y: number): void {
    if (!this.inBounds(x, y)) return;
    const g = c.getContext('2d')!;
    g.fillStyle = this.colorAt(this.idx(x, y));
    g.fillRect(x, y, 1, 1);
  }
}
