/**
 * Outpost 7's pressurized habitat seen from above.
 * When you are outside you see its roof; step through the airlock and the roof
 * disappears so you can walk around the rooms (like a doll's house).
 *
 * Room layout (tile offsets from BASE_X, BASE_Y; the outer wall is the 30×17 border):
 *   north row  : COMMAND (1–10) | LIFE SUPPORT (12–18) | ALGAE LAB (20–28)     dy 1–6
 *   corridor   : dy 7–8
 *   south row  : AIRLOCK (1–5) | GREENHOUSE (7–19) | STORM SHELTER (21–28)      dy 10–15
 *   outer airlock door: south wall at dx 3.  Shelter shield slots: 8 tiles outside the east wall.
 */
import { BASE_H, BASE_W, BASE_X, BASE_Y, CROPS, G, LANDMARKS, O, SHELTER_SLOTS, TILE } from '../config';
import { type Ctx, rect, rgba } from '../core/canvas';
import type { Game } from '../Game';
import type { Interactable, Rect } from '../types';
import type { TileMap } from './TileMap';

const BX = BASE_X * TILE;
const BY = BASE_Y * TILE;
const tx = (dx: number) => BX + dx * TILE;
const ty = (dy: number) => BY + dy * TILE;

interface Room {
  name: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  tint: string;
}
const ROOMS: Room[] = [
  { name: 'COMMAND', x0: 1, y0: 1, x1: 10, y1: 6, tint: '#34405a' },
  { name: 'LIFE SUPPORT', x0: 12, y0: 1, x1: 18, y1: 6, tint: '#2f4a55' },
  { name: 'ALGAE LAB', x0: 20, y0: 1, x1: 28, y1: 6, tint: '#2c4b48' },
  { name: 'AIRLOCK', x0: 1, y0: 10, x1: 5, y1: 15, tint: '#3b4352' },
  { name: 'GREENHOUSE', x0: 7, y0: 10, x1: 19, y1: 15, tint: '#2f4a3a' },
  { name: 'STORM SHELTER', x0: 21, y0: 10, x1: 28, y1: 15, tint: '#4a3a3a' },
];

/** Machine anchors in world px: x = left edge, y = bottom (where it touches the floor). */
export const SPOTS = {
  airlockIn: { x: tx(3) + 8, y: ty(15) + 12 },
  airlockOut: { x: tx(3) + 8, y: ty(17) + 12 },
  console: { x: tx(2), y: ty(2) + 2 },
  pdu: { x: tx(7) - 1, y: ty(1) + 6 },
  science: { x: tx(8) + 2, y: ty(2) + 2 },
  sleeppod: { x: tx(1) + 4, y: ty(6) },
  medbay: { x: tx(6) + 8, y: ty(5) + 8 },
  melter: { x: tx(12) + 1, y: ty(2) + 2 },
  electrolysis: { x: tx(14) + 10, y: ty(2) + 2 },
  o2station: { x: tx(17) + 2, y: ty(2) + 2 },
  algae: [
    { x: tx(20) + 6, y: ty(2) + 2 },
    { x: tx(22) + 6, y: ty(2) + 2 },
  ],
  fabricator: { x: tx(25), y: ty(2) + 2 },
  suitrack: { x: tx(1) + 2, y: ty(11) + 2 },
  locker: { x: tx(1) + 4, y: ty(14) + 4 },
  beds: [
    { x: tx(8), y: ty(11) },
    { x: tx(12), y: ty(11) },
    { x: tx(16), y: ty(11) },
    { x: tx(8), y: ty(14) },
    { x: tx(12), y: ty(14) },
    { x: tx(16), y: ty(14) },
  ],
  shelter: { x: tx(21), y: ty(10), w: 8 * TILE, h: 6 * TILE },
  charger: { x: (LANDMARKS.roverPad.x + LANDMARKS.roverPad.w) * TILE + 2, y: (LANDMARKS.roverPad.y + 4) * TILE },
};

export interface Drawable {
  y: number;
  draw: () => void;
}

export class BaseHabitat {
  readonly interior: Rect;
  readonly footprint: Rect;
  readonly shelterSlots: { x: number; y: number }[] = [];
  private roof: HTMLCanvasElement;
  private game: Game;

  constructor(game: Game) {
    this.game = game;
    this.interior = { x: tx(1), y: ty(1), w: 28 * TILE, h: 15 * TILE };
    this.footprint = { x: BX, y: BY, w: BASE_W * TILE, h: BASE_H * TILE };
    const S = LANDMARKS.shelterSlots;
    for (let k = 0; k < S.n; k++) this.shelterSlots.push({ x: S.x, y: S.y + k });
    this.roof = game.art.get('roof');
  }

  /** Stamp walls, floor, pad and machine collision into the map. */
  static build(map: TileMap): void {
    for (let dy = 0; dy < BASE_H; dy++) {
      for (let dx = 0; dx < BASE_W; dx++) {
        const x = BASE_X + dx;
        const y = BASE_Y + dy;
        map.setGround(x, y, G.FLOOR, false);
        map.buried[map.idx(x, y)] = 0;
        const outer = dx === 0 || dy === 0 || dx === BASE_W - 1 || dy === BASE_H - 1;
        map.setObj(x, y, outer ? O.HULL : O.NONE, false);
      }
    }
    const wall = (dx: number, dy: number, id: number = O.HULL) => map.setObj(BASE_X + dx, BASE_Y + dy, id, false);
    for (const dx of [8, 9, 14, 15, 22, 23]) wall(dx, BASE_H - 1, O.WINDOW);
    for (const dx of [5, 15, 24]) wall(dx, 0, O.WINDOW);
    wall(3, BASE_H - 1, O.DOOR);
    for (let dy = 1; dy <= 6; dy++) {
      wall(11, dy);
      wall(19, dy);
    }
    for (let dx = 1; dx <= 28; dx++) if (![3, 4, 12, 13, 24, 25].includes(dx)) wall(dx, 9);
    for (let dy = 9; dy <= 15; dy++) {
      wall(6, dy);
      wall(20, dy);
    }
    // rover landing pad
    const P = LANDMARKS.roverPad;
    for (let y = P.y; y < P.y + P.h; y++) for (let x = P.x; x < P.x + P.w; x++) map.setGround(x, y, G.PAD, false);

    map.interiorRects.push({ x: BASE_X + 1, y: BASE_Y + 1, w: BASE_W - 2, h: BASE_H - 2 });
    map.protectedRects.push({ x: BASE_X, y: BASE_Y, w: BASE_W, h: BASE_H });
    map.protectedRects.push({ x: BASE_X + 2, y: BASE_Y + BASE_H, w: 3, h: 2 });
    map.protectedRects.push({ x: P.x, y: P.y, w: P.w, h: P.h });

    // machine footprints block movement
    const block = (x: number, bottom: number, w: number, depth = 10) => map.blockers.push({ x, y: bottom - depth, w, h: depth });
    block(SPOTS.console.x, SPOTS.console.y, 40);
    block(SPOTS.science.x, SPOTS.science.y, 28);
    block(SPOTS.sleeppod.x, SPOTS.sleeppod.y, 36, 14);
    block(SPOTS.melter.x, SPOTS.melter.y, 30);
    block(SPOTS.electrolysis.x, SPOTS.electrolysis.y, 26);
    block(SPOTS.o2station.x, SPOTS.o2station.y, 16);
    for (const a of SPOTS.algae) block(a.x, a.y, 22);
    block(SPOTS.fabricator.x, SPOTS.fabricator.y, 32);
    block(SPOTS.suitrack.x, SPOTS.suitrack.y, 18);
    block(SPOTS.locker.x, SPOTS.locker.y, 24);
    for (const b of SPOTS.beds) block(b.x, b.y + 20, 32, 14);
    block(SPOTS.shelter.x + 20, ty(16) - 2, 70, 9);
    block(SPOTS.charger.x, SPOTS.charger.y, 8, 6);
  }

  isInside(px: number, py: number): boolean {
    const r = this.interior;
    return px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h;
  }

  isInShelter(px: number, py: number): boolean {
    const s = SPOTS.shelter;
    return px >= s.x && px < s.x + s.w && py >= s.y + 6 && py < s.y + s.h;
  }

  shelterFilled(): number {
    let n = 0;
    for (const s of this.shelterSlots) if (this.game.map.getObj(s.x, s.y) !== O.NONE) n++;
    return n;
  }

  /** 0..1 radiation that still reaches the shelter (1 = no protection). */
  shelterFactor(): number {
    return 0.42 - (this.shelterFilled() / SHELTER_SLOTS) * 0.37;
  }

  firstEmptySlot(): { x: number; y: number } | null {
    for (const s of this.shelterSlots) if (this.game.map.getObj(s.x, s.y) === O.NONE) return { x: s.x * TILE + 8, y: s.y * TILE + 8 };
    return null;
  }

  // ───────────────────────── interactions ─────────────────────────

  interactables(): Interactable[] {
    const g = this.game;
    const res = g.res;
    const inside = () => g.player.inBase;
    const list: Interactable[] = [];
    const add = (id: string, x: number, y: number, w: number, h: number, label: () => string, act: () => void, enabled: () => boolean = inside) =>
      list.push({ id, x, y, w, h, label, act, enabled });
    const around = (x: number, bottom: number, w: number) => [x - 6, bottom - 22, w + 12, 34] as const;

    add('airlock_in', tx(2), ty(14), 48, 32, () => 'Airlock: Go outside (spacewalk)', () => g.openAirlock());
    add('airlock_out', tx(1), ty(17) - 4, 64, 30, () => 'Airlock: Go back inside', () => g.enterBase(), () => !g.player.inBase && !g.rover.driving);
    add('locker', ...around(SPOTS.locker.x, SPOTS.locker.y, 24), () => 'Storage Locker: see base storage', () => g.ui.openBaseOps('status'));
    add('console', ...around(SPOTS.console.x, SPOTS.console.y, 40), () => 'Mission Console: open BASE OPS', () => g.ui.openBaseOps('power'));
    add('pdu', SPOTS.pdu.x - 8, ty(1), 34, 32, () => (g.objects.pduBroken ? 'PDU: Fix the jumbled wires!' : 'Power Distribution Unit (all good)'), () => g.openPduRepair());
    add('science', ...around(SPOTS.science.x, SPOTS.science.y, 28), () => 'Science Station: open SCIENCE LOG', () => g.ui.openScienceLog());
    add('sleeppod', ...around(SPOTS.sleeppod.x, SPOTS.sleeppod.y, 36), () => (g.weather.isNight ? 'Sleep Pod: sleep until morning' : 'Sleep Pod (you can sleep at night)'), () => g.sleep());
    add('melter', ...around(SPOTS.melter.x, SPOTS.melter.y, 30), () => `Ice Melter: ${res.storage.ice ?? 0} ice waiting · ${Math.round(res.water)} L water`, () => g.ui.openBaseOps('water'));
    add('electrolysis', ...around(SPOTS.electrolysis.x, SPOTS.electrolysis.y, 26), () => `O2 Maker: base air ${Math.round(res.o2)}%`, () => g.ui.openBaseOps('water'));
    add('o2station', ...around(SPOTS.o2station.x, SPOTS.o2station.y, 16), () => `O2 Station: fill suit tank (${Math.round(g.player.o2)}/${g.player.o2Max})`, () => g.refillSuitAtStation());
    SPOTS.beds.forEach((b, k) => {
      add(
        `bed${k}`,
        b.x - 4,
        b.y - 10,
        40,
        36,
        () => {
          const bed = res.beds[k];
          if (!bed.crop) {
            const seeds = Object.values(CROPS).reduce((n, c) => n + res.have(c.seedItem), 0);
            return seeds > 0 ? 'Plant a seed' : 'Empty tray (no seeds left)';
          }
          const c = CROPS[bed.crop];
          if (bed.growth >= 1) return `Harvest ${c.name}!`;
          return `${c.name}: ${Math.floor(bed.growth * 100)}% grown${bed.water < 0.25 ? ' · THIRSTY! (water valve)' : ''}`;
        },
        () => g.useBed(k),
      );
    });
    SPOTS.algae.forEach((a, k) => add(`algae${k}`, ...around(a.x, a.y, 22), () => `Spirulina tank: ${Math.round(res.algae * 100)}% culture`, () => g.ui.openBaseOps('power')));
    add('fabricator', ...around(SPOTS.fabricator.x, SPOTS.fabricator.y, 32), () => 'Fabricator: build bricks & upgrades', () => g.ui.openFabricator());
    return list;
  }

  // ───────────────────────── rendering ─────────────────────────

  /** Room tints, painted labels and shelter slot outlines (on the floor, under everything). */
  renderFloor(g: Ctx, camX: number, camY: number, time: number): void {
    const game = this.game;
    const f = this.footprint;
    if (f.x - camX > game.vw || f.x + f.w - camX < -40 || f.y - camY > game.vh || f.y + f.h - camY < -40) {
      this.renderSlots(g, camX, camY, time);
      return;
    }
    g.font = '8px "Press Start 2P", monospace';
    g.textBaseline = 'top';
    for (const r of ROOMS) {
      const x = Math.round(tx(r.x0) - camX);
      const y = Math.round(ty(r.y0) - camY);
      const w = (r.x1 - r.x0 + 1) * TILE;
      const h = (r.y1 - r.y0 + 1) * TILE;
      g.fillStyle = rgba(r.tint, 0.35);
      g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(30,40,60,0.55)';
      g.fillText(r.name, x + 4, y + h - 11);
    }
    // greenhouse grow-light glow
    const gh = game.res.effectiveLevel('greenhouse');
    if (gh > 0) {
      g.fillStyle = `rgba(255,90,200,${0.08 + gh * 0.05})`;
      g.fillRect(Math.round(tx(7) - camX), Math.round(ty(10) - camY), 13 * TILE, 6 * TILE);
    }
    // hazard stripes at the airlock
    for (let k = 0; k < 4; k++) rect(g, Math.round(tx(2) + k * 8 - camX), Math.round(ty(15) + 10 - camY), 4, 3, '#e0c02c');
    // shelter shielding tint
    const sh = SPOTS.shelter;
    const shield = this.shelterFilled() / SHELTER_SLOTS;
    g.fillStyle = rgba('#c4703f', 0.1 + shield * 0.2);
    g.fillRect(Math.round(sh.x - camX), Math.round(sh.y - camY), sh.w, sh.h);
    this.renderSlots(g, camX, camY, time);
  }

  private renderSlots(g: Ctx, camX: number, camY: number, time: number): void {
    const show = this.game.missions.activeId() === 5 || (this.shelterFilled() > 0 && this.shelterFilled() < SHELTER_SLOTS);
    if (!show) return;
    const slot = this.game.art.get('slot');
    for (const s of this.shelterSlots) {
      if (this.game.map.getObj(s.x, s.y) !== O.NONE) continue;
      this.game.art.draw(g, slot, s.x * TILE - camX, s.y * TILE - camY, false, 0.5 + 0.5 * Math.sin(time * 4 + s.y));
    }
  }

  /** Machines go into the y-sorted draw list so the astronaut can walk in front of / behind them. */
  drawables(list: Drawable[], camX: number, camY: number, time: number): void {
    const game = this.game;
    if (!game.player.inBase) return; // roof covers everything
    const art = game.art;
    const res = game.res;
    const cx = (x: number) => Math.round(x - camX);
    const cy = (y: number) => Math.round(y - camY);
    const put = (name: string, x: number, bottom: number, extra?: () => void) => {
      const img = art.get(name);
      list.push({
        y: bottom,
        draw: () => {
          g().drawImage(img, cx(x), cy(bottom - img.height));
          extra?.();
        },
      });
    };
    const g = () => game.g;
    put('console', SPOTS.console.x, SPOTS.console.y, () => {
      if (Math.sin(time * 3) > 0) rect(g(), cx(SPOTS.console.x + 3), cy(SPOTS.console.y - 28), 4, 1, '#5fd068');
    });
    put(game.objects.pduBroken ? 'pdu_broken' : 'pdu', SPOTS.pdu.x, SPOTS.pdu.y, () => {
      if (game.objects.pduBroken && Math.random() < 0.15) game.particles.sparks(SPOTS.pdu.x + 9, SPOTS.pdu.y - 14, 3);
    });
    put('science', SPOTS.science.x, SPOTS.science.y);
    put('sleeppod', SPOTS.sleeppod.x, SPOTS.sleeppod.y);
    put('melter', SPOTS.melter.x, SPOTS.melter.y, () => {
      const wl = Math.min(1, res.water / 150);
      rect(g(), cx(SPOTS.melter.x + 6), cy(SPOTS.melter.y - 11 - Math.round(20 * wl)), 10, Math.round(20 * wl), '#4fb3ff');
      if (res.effectiveLevel('melter') > 0 && (res.storage.ice ?? 0) > 0 && Math.random() < 0.1) game.particles.bubbles(SPOTS.melter.x + 11, SPOTS.melter.y - 14, 1, '#cfefff');
    });
    put('electrolysis', SPOTS.electrolysis.x, SPOTS.electrolysis.y, () => {
      if (res.flows.electroWater > 0.001 && Math.random() < 0.25) game.particles.bubbles(SPOTS.electrolysis.x + 6, SPOTS.electrolysis.y - 10, 1, '#cfe6ff');
    });
    put('o2station', SPOTS.o2station.x, SPOTS.o2station.y);
    SPOTS.algae.forEach((a, k) => {
      list.push({
        y: a.y,
        draw: () => {
          const lit = res.effectiveLevel('algae') > 0;
          const lvl = res.algae;
          g().fillStyle = lit ? `rgba(${40 + (1 - lvl) * 60},${150 + lvl * 80},110,0.9)` : 'rgba(40,90,80,0.85)';
          g().fillRect(cx(a.x + 3), cy(a.y - 38), 16, 32);
          g().fillStyle = 'rgba(255,255,255,0.12)';
          g().fillRect(cx(a.x + 3), cy(a.y - 38 + Math.sin(time * 2 + k) * 1.5), 16, 2);
          g().drawImage(art.get('algae_tank'), cx(a.x), cy(a.y - 42));
          if (lit && Math.random() < 0.18) game.particles.bubbles(a.x + 5 + Math.random() * 12, a.y - 8, 1, '#c8ffe6', a.y - 38);
        },
      });
    });
    put('fabricator', SPOTS.fabricator.x, SPOTS.fabricator.y);
    put('suitrack', SPOTS.suitrack.x, SPOTS.suitrack.y);
    put('locker', SPOTS.locker.x, SPOTS.locker.y);
    // hydroponic trays with crops
    const gh = res.effectiveLevel('greenhouse');
    SPOTS.beds.forEach((b, k) => {
      list.push({
        y: b.y + 20,
        draw: () => {
          const bed = res.beds[k];
          const x = cx(b.x);
          const y = cy(b.y);
          g().drawImage(art.get('bed'), x, y);
          if (gh > 0) {
            g().fillStyle = `rgba(255,120,220,${0.12 + gh * 0.06})`;
            g().fillRect(x + 2, y + 2, 28, 10);
          }
          if (bed.water < 0.25) rect(g(), x + 3, y + 7, 26, 1, '#6b4a2f');
          if (bed.crop) {
            const stage = bed.growth >= 1 ? 4 : Math.min(3, Math.floor(bed.growth * 4));
            const spr = art.get(`crop_${bed.crop}_${stage}`);
            g().drawImage(spr, x + 1, y - 7);
            g().drawImage(spr, x + 15, y - 7);
            if (bed.growth >= 1 && Math.sin(time * 5 + k) > 0.6) {
              rect(g(), x + 4, y - 10, 1, 3, '#fff6a0');
              rect(g(), x + 3, y - 9, 3, 1, '#fff6a0');
            }
            if (bed.water < 0.25 && Math.sin(time * 4) > 0) g().drawImage(art.get('icon_water'), x + 20, y - 18);
          }
        },
      });
    });
    // shelter bench + sign
    list.push({
      y: ty(16) - 2,
      draw: () => {
        const x = cx(SPOTS.shelter.x + 20);
        const y = cy(ty(16) - 12);
        rect(g(), x, y, 70, 6, '#7d8592');
        rect(g(), x, y, 70, 1, '#aab2be');
        rect(g(), x + 2, y + 6, 3, 4, '#55565e');
        rect(g(), x + 65, y + 6, 3, 4, '#55565e');
      },
    });
    list.push({
      y: ty(10),
      draw: () => {
        art.draw(g(), 'radsign', cx(tx(22)), cy(ty(9) + 3));
        g().font = '8px "Press Start 2P", monospace';
        g().textBaseline = 'top';
        g().fillStyle = '#ffd84a';
        g().fillText(`SHIELD ${Math.round((1 - this.shelterFactor()) * 100)}%`, cx(tx(23) + 4), cy(ty(10) + 6));
      },
    });
  }

  /** The roof hides the inside while you are outdoors (fades if you walk behind the building). */
  renderRoof(g: Ctx, camX: number, camY: number): void {
    const game = this.game;
    if (game.player.inBase) return;
    const x = Math.round(BX - camX);
    const y = Math.round(BY - 8 - camY);
    if (x > game.vw || x + this.roof.width < 0 || y > game.vh || y + this.roof.height < 0) return;
    const body = game.rover.driving ? game.rover : game.player;
    const behind = body.x + body.w > BX && body.x < BX + BASE_W * TILE && body.y + body.h < BY + (BASE_H - 1) * TILE + 8 && body.y + body.h > BY - 30;
    g.globalAlpha = behind ? 0.45 : 1;
    g.drawImage(this.roof, x, y);
    g.globalAlpha = 1;
    // the outer airlock door stays visible
  }

  /** Light sources for the lighting pass. */
  lights(add: (x: number, y: number, r: number, i: number) => void): void {
    if (this.game.player.inBase) {
      for (const r of ROOMS) add(tx((r.x0 + r.x1 + 1) / 2), ty((r.y0 + r.y1 + 1) / 2), 80, 0.9);
      add(tx(15), ty(8), 120, 0.9);
    } else {
      for (const dx of [8.5, 14.5, 22.5]) add(tx(dx) + 8, ty(17) + 2, 36, 0.8);
      add(SPOTS.airlockOut.x, SPOTS.airlockOut.y, 40, 0.8);
    }
    add(SPOTS.charger.x + 4, SPOTS.charger.y - 6, 30, 0.6);
  }
}
