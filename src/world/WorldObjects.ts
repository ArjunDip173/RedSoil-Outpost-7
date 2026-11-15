/**
 * Things on the map that aren't tiles: solar panels, the Deep Space Antenna,
 * the old lander, sparkly science-sample rocks, pickups (antenna parts, meteorites, O2 caches)
 * and the player's explorer flags. Everything is drawn in 3/4 view and y-sorted.
 */
import { LANDMARKS, O, PANEL_DUST_RATE, PANEL_FOLD_SPEED, PANEL_W, STORM_PANEL_BREAK, TILE } from '../config';
import { type Ctx, rect } from '../core/canvas';
import type { Game } from '../Game';
import type { Interactable, WorldSave } from '../types';
import { SPOTS, type Drawable } from './BaseHabitat';

export interface SolarPanel {
  x: number; // px (left)
  y: number; // px (ground line)
  dust: number;
  broken: boolean;
  /** Folded away for a dust storm (makes no power, but the wind can't hurt it). */
  folded: boolean;
  /** 0 = folded flat, 1 = fully open; eases toward `folded`. */
  open: number;
  /** Storm damage while open; the panel cracks at 1. */
  wear: number;
  /** What cracked it, for the repair window. */
  cause?: 'meteor' | 'storm';
  shine: number;
}

/** Middle of the panel, roughly where the player stands to work on it. */
export function panelCenter(p: SolarPanel): { x: number; y: number } {
  return { x: p.x + PANEL_W / 2, y: p.y - 8 };
}

export type PickupKind = 'part' | 'meteorite' | 'o2cache';
export interface Pickup {
  id: string;
  kind: PickupKind;
  x: number;
  y: number;
  taken: boolean;
  sprite: string;
  hidden: boolean;
}

export interface SampleSpot {
  id: string;
  x: number;
  y: number;
  taken: boolean;
  progress: number;
}

/** Sample id → tile position. */
const SAMPLE_PLACES: Record<string, [number, number]> = {
  hematite: [150, 82],
  basalt: [70, 96],
  jarosite: [60, 130],
  mudstone: [168, 104],
  clay: [220, 140],
  carbonate: [95, 136],
  gypsum: [212, 70],
  silica: [40, 100],
  perchlorate: [46, 153],
  polar_ice: [120, 9],
  sulfur: [194, 126],
  olivine: [LANDMARKS.cavePart.x - 2, LANDMARKS.cavePart.y + 2],
};

export class WorldObjects {
  panels: SolarPanel[] = [];
  pickups: Pickup[] = [];
  samples: SampleSpot[] = [];
  flags: { x: number; y: number }[] = [];
  antenna: { x: number; y: number; state: 'broken' | 'repaired' | 'online'; partsInstalled: number };
  lander: { x: number; y: number };
  pduBroken = false;
  private game: Game;

  constructor(game: Game) {
    this.game = game;
    const map = game.map;
    const clearAround = (cx: number, cy: number, r = 1) => {
      for (let y = cy - r; y <= cy + r; y++)
        for (let x = cx - r; x <= cx + r; x++)
          if (map.inBounds(x, y) && map.getObj(x, y) !== O.BEDROCK) map.obj[map.idx(x, y)] = O.NONE;
    };
    for (let k = 0; k < 6; k++) this.addPanel(0.75);
    const A = LANDMARKS.antenna;
    this.antenna = { x: A.x * TILE + 8, y: (A.y + 1) * TILE, state: 'broken', partsInstalled: 0 };
    map.blockers.push({ x: this.antenna.x - 14, y: this.antenna.y - 10, w: 28, h: 10 });
    const L = LANDMARKS.lander;
    this.lander = { x: L.x * TILE - 20, y: (L.y + 1) * TILE };
    map.blockers.push({ x: this.lander.x + 12, y: this.lander.y - 8, w: 32, h: 8 });

    for (const def of game.data.facts.samples) {
      const p = SAMPLE_PLACES[def.id];
      if (!p) continue;
      clearAround(p[0], p[1]);
      if (def.id === 'olivine') map.caveMask[map.idx(p[0], p[1])] = 1;
      this.samples.push({ id: def.id, x: p[0] * TILE + 2, y: p[1] * TILE + 12, taken: false, progress: 0 });
    }

    // O2 caches (refilled every Sol) far from base
    const caches: [number, number][] = [
      [LANDMARKS.lander.x + 8, LANDMARKS.lander.y - 3],
      [LANDMARKS.cavePart.x + 4, LANDMARKS.cavePart.y - 2],
      [176, 118],
      [200, 42],
      [120, 22],
      [60, 100],
    ];
    caches.forEach(([cx, cy], i) => {
      clearAround(cx, cy);
      this.pickups.push({
        id: `o2_${i}`,
        kind: 'o2cache',
        x: cx * TILE + 1,
        y: cy * TILE + 3,
        taken: false,
        sprite: 'o2cache',
        hidden: false,
      });
    });

    // antenna parts (hidden until Mission 6): lava tube, crater, lander
    const parts: [string, number, number][] = [
      ['part_panel', LANDMARKS.cavePart.x, LANDMARKS.cavePart.y],
      ['part_horn', LANDMARKS.crater.x - 4, LANDMARKS.crater.y + 1],
      ['part_board', LANDMARKS.lander.x + 4, LANDMARKS.lander.y + 3],
    ];
    parts.forEach(([sprite, px, py], i) => {
      clearAround(px, py);
      this.pickups.push({
        id: `part_${i}`,
        kind: 'part',
        x: px * TILE + 1,
        y: py * TILE + 1,
        taken: false,
        sprite,
        hidden: true,
      });
    });
  }

  addPanel(dust = 0): boolean {
    if (this.panels.length >= LANDMARKS.maxPanels) return false;
    const k = this.panels.length;
    const F = LANDMARKS.solarField;
    const col = k % F.cols;
    const row = Math.floor(k / F.cols);
    const center = (F.x + col * F.dx) * TILE + 9;
    const x = center - PANEL_W / 2;
    const y = (F.y + row * F.dy + 1) * TILE;
    const folded = this.panels.some((p) => p.folded);
    this.panels.push({ x, y, dust, broken: false, folded, open: folded ? 0 : 1, wear: 0, shine: 0 });
    this.game.map.blockers.push({ x: center - 7, y: y - 8, w: 14, h: 8 });
    return true;
  }

  // Update

  update(dt: number): void {
    const g = this.game;
    const storm = g.weather.stormIntensity;
    this.panels.forEach((p, i) => {
      const target = p.folded ? 0 : 1;
      p.open += Math.max(-PANEL_FOLD_SPEED * dt, Math.min(PANEL_FOLD_SPEED * dt, target - p.open));
      // only the open part collects dust; a folded panel is covered
      p.dust = Math.min(1, p.dust + PANEL_DUST_RATE * dt * (1 + storm * 6) * p.open);
      p.shine = Math.max(0, p.shine - dt);
      if (storm > 0.2 && p.open > 0.3 && !p.broken) {
        // some panels are a little sturdier than others, so they don't all crack at once
        const sturdiness = 0.75 + ((i * 37) % 10) / 20;
        p.wear += (dt * storm * p.open * sturdiness) / STORM_PANEL_BREAK;
        if (p.wear >= 1) {
          p.wear = 0;
          p.broken = true;
          p.cause = 'storm';
          g.onPanelStormDamage(p);
        }
      }
    });
    const body = g.rover.driving ? g.rover : g.player;
    const bx = body.x + body.w / 2;
    const by = body.y + body.h / 2;
    for (const pk of this.pickups) {
      if (pk.taken || pk.hidden) continue;
      if (Math.abs(bx - (pk.x + 7)) < body.w / 2 + 9 && Math.abs(by - (pk.y + 8)) < body.h / 2 + 10) {
        pk.taken = true;
        g.collectPickup(pk);
      }
    }
  }

  newSol(): void {
    for (const pk of this.pickups) if (pk.kind === 'o2cache') pk.taken = false;
  }

  revealParts(): void {
    for (const pk of this.pickups) if (pk.kind === 'part') pk.hidden = false;
  }

  partsRemaining(): Pickup[] {
    return this.pickups.filter((p) => p.kind === 'part' && !p.taken && !p.hidden);
  }

  dirtiestPanel(): SolarPanel | null {
    let best: SolarPanel | null = null;
    for (const p of this.panels) if ((p.dust > 0.25 || p.broken) && (!best || p.dust > best.dust)) best = p;
    return best;
  }

  nearestPanel(x: number, y: number): SolarPanel | null {
    let best: SolarPanel | null = null;
    let bd = Infinity;
    for (const p of this.panels) {
      const c = panelCenter(p);
      const d = Math.hypot(c.x - x, c.y - y);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  get anyPanelOpen(): boolean {
    return this.panels.some((p) => !p.folded);
  }

  get allPanelsFolded(): boolean {
    return this.panels.length > 0 && this.panels.every((p) => p.folded);
  }

  panelAt(px: number, py: number): SolarPanel | null {
    for (const p of this.panels)
      if (px >= p.x - 2 && px <= p.x + PANEL_W + 2 && py >= p.y - 36 && py <= p.y + 2) return p;
    return null;
  }

  sampleAt(px: number, py: number): SampleSpot | null {
    for (const s of this.samples)
      if (!s.taken && px >= s.x - 6 && px <= s.x + 18 && py >= s.y - 14 && py <= s.y + 6) return s;
    return null;
  }

  spawnMeteorite(x: number, y: number): void {
    this.pickups.push({
      id: `met_${Date.now()}`,
      kind: 'meteorite',
      x: x - 6,
      y: y - 6,
      taken: false,
      sprite: 'meteorite',
      hidden: false,
    });
  }

  // Interactions

  interactables(): Interactable[] {
    const g = this.game;
    const list: Interactable[] = [];
    const stormy = () => g.weather.stormComing || g.weather.storm.active;
    this.panels.forEach((p, i) => {
      list.push({
        id: `panel${i}`,
        x: p.x - 4,
        y: p.y - 36,
        w: PANEL_W + 8,
        h: 48,
        label: () => {
          if (p.folded)
            return g.weather.storm.active ? 'Solar panels folded: safe from the storm' : 'Open the solar panels';
          if (stormy()) return 'Fold the solar panels (storm!)';
          if (p.broken) return 'Solar panel CRACKED: repair wiring';
          return p.dust > 0.05
            ? `Brush solar panel (${Math.round(p.dust * 100)}% dusty)`
            : 'Solar panel: sparkling clean!';
        },
        enabled: () => !g.player.inBase && !g.rover.driving,
        act: () => {
          if (p.folded) g.setPanelsFolded(false);
          else if (stormy()) g.setPanelsFolded(true);
          else if (p.broken) g.openPanelRepair(p);
          else g.player.startBrushPanel(p);
        },
      });
    });
    const a = this.antenna;
    list.push({
      id: 'antenna',
      x: a.x - 34,
      y: a.y - 40,
      w: 68,
      h: 60,
      label: () => {
        if (a.state === 'online') return 'Deep Space Antenna: ONLINE, Earth link';
        if (g.missions.activeId() !== 6) return 'Deep Space Antenna (broken in the storm)';
        if (a.state === 'repaired') return 'Point the dish at Earth!';
        const have = g.antennaPartsHeld();
        return have >= 3 ? 'Repair the antenna wiring' : `Antenna needs 3 parts (you have ${have})`;
      },
      enabled: () => !g.player.inBase,
      act: () => g.useAntenna(),
    });
    list.push({
      id: 'lander',
      x: this.lander.x,
      y: this.lander.y - 30,
      w: 56,
      h: 44,
      label: () => 'Old robotic lander: read the plaque',
      enabled: () => !g.player.inBase,
      act: () => g.readLanderPlaque(),
    });
    return list;
  }

  // Rendering

  drawables(list: Drawable[], camX: number, camY: number, time: number): void {
    const game = this.game;
    const art = game.art;
    const g = game.g;
    const vw = game.vw;
    const vh = game.vh;
    const vis = (x: number, y: number, m = 80) =>
      x - camX > -m && x - camX < vw + m && y - camY > -m && y - camY < vh + m;
    const cx = (x: number) => Math.round(x - camX);
    const cy = (y: number) => Math.round(y - camY);
    const shadow = (x: number, y: number, w = 16) => {
      g.globalAlpha = 1;
      g.drawImage(art.get('shadow'), cx(x - w / 2), cy(y - 3), w, 6);
    };

    if (vis(this.lander.x, this.lander.y))
      list.push({
        y: this.lander.y,
        draw: () => g.drawImage(art.get('lander'), cx(this.lander.x), cy(this.lander.y - 34)),
      });
    const a = this.antenna;
    if (vis(a.x, a.y, 100)) {
      list.push({
        y: a.y,
        draw: () => {
          art.draw(g, a.state === 'broken' ? 'antenna_broken' : 'antenna', cx(a.x - 26), cy(a.y - 64));
          if (a.state === 'online') {
            const t = (time * 40) % 60;
            g.strokeStyle = `rgba(127,227,255,${1 - t / 60})`;
            g.lineWidth = 1;
            g.beginPath();
            g.arc(cx(a.x + 10), cy(a.y - 52), t, -1.6, -0.2);
            g.stroke();
          } else if (a.state === 'broken' && Math.random() < 0.03) game.particles.sparks(a.x - 8, a.y - 40, 3);
        },
      });
    }
    for (const p of this.panels) {
      if (!vis(p.x, p.y)) continue;
      list.push({ y: p.y, draw: () => drawPanel(g, p, cx(p.x), cy(p.y), time) });
    }
    // rover charger post
    if (vis(SPOTS.charger.x, SPOTS.charger.y))
      list.push({
        y: SPOTS.charger.y,
        draw: () => g.drawImage(art.get('charger'), cx(SPOTS.charger.x), cy(SPOTS.charger.y - 22)),
      });
    for (const s of this.samples) {
      if (s.taken || !vis(s.x, s.y)) continue;
      list.push({
        y: s.y,
        draw: () => {
          const def = game.data.facts.samples.find((d) => d.id === s.id);
          const sx = cx(s.x);
          const sy = cy(s.y - 8);
          art.draw(g, 'sample_rock', sx, sy);
          rect(g, sx + 4, sy + 3, 3, 2, def?.color ?? '#ffffff');
          if (Math.sin(time * 5 + s.x) > 0.5) {
            rect(g, sx + 9, sy - 3, 1, 3, '#fff6a0');
            rect(g, sx + 8, sy - 2, 3, 1, '#fff6a0');
          }
          if (s.progress > 0) {
            rect(g, sx - 1, sy - 6, 14, 3, '#23242b');
            rect(g, sx, sy - 5, Math.round(12 * s.progress), 1, '#ffd166');
          }
        },
      });
    }
    for (const pk of this.pickups) {
      if (pk.taken || pk.hidden || !vis(pk.x, pk.y)) continue;
      list.push({
        y: pk.y + 14,
        draw: () => {
          const bob = pk.kind === 'part' ? Math.round(Math.sin(time * 3 + pk.x) * 2) - 3 : 0;
          shadow(pk.x + 7, pk.y + 14, 14);
          if (pk.kind === 'part') {
            g.fillStyle = `rgba(255,209,102,${0.25 + 0.15 * Math.sin(time * 4)})`;
            g.fillRect(cx(pk.x - 2), cy(pk.y - 2 + bob), 18, 18);
          }
          art.draw(g, pk.sprite, cx(pk.x), cy(pk.y + bob));
        },
      });
    }
    for (const f of this.flags)
      if (vis(f.x, f.y)) list.push({ y: f.y, draw: () => art.draw(g, 'flag', cx(f.x - 1), cy(f.y - 20)) });
  }

  lights(add: (x: number, y: number, r: number, i: number) => void): void {
    for (const pk of this.pickups)
      if (!pk.taken && !pk.hidden && pk.kind !== 'o2cache') add(pk.x + 7, pk.y + 7, 34, 0.7);
    for (const s of this.samples) if (!s.taken) add(s.x + 6, s.y - 4, 18, 0.45);
    add(this.antenna.x, this.antenna.y - 20, 50, 0.5);
  }

  serialize(): Pick<
    WorldSave,
    'panels' | 'pickups' | 'samples' | 'flags' | 'pduBroken' | 'antenna' | 'partsInstalled'
  > {
    return {
      panels: this.panels.map((p) => ({ dust: p.dust, broken: p.broken, folded: p.folded })),
      pickups: this.pickups.map((p) => ({ kind: p.kind, x: p.x, y: p.y, taken: p.taken, id: p.id, hidden: p.hidden })),
      samples: this.samples.map((s) => ({ id: s.id, taken: s.taken })),
      flags: this.flags.slice(),
      pduBroken: this.pduBroken,
      antenna: this.antenna.state,
      partsInstalled: this.antenna.partsInstalled,
    };
  }

  load(w: WorldSave): void {
    while (this.panels.length < w.panels.length) this.addPanel(0);
    w.panels.forEach((p, i) => {
      if (!this.panels[i]) return;
      this.panels[i].dust = p.dust;
      this.panels[i].broken = p.broken;
      this.panels[i].folded = !!p.folded;
      this.panels[i].open = p.folded ? 0 : 1;
    });
    for (const sp of w.pickups) {
      const existing = this.pickups.find((p) => p.id === sp.id);
      if (existing) {
        existing.taken = sp.taken;
        if (sp.hidden !== undefined) existing.hidden = sp.hidden;
      } else if (sp.kind === 'meteorite' && !sp.taken)
        this.pickups.push({
          id: sp.id,
          kind: 'meteorite',
          x: sp.x,
          y: sp.y,
          taken: false,
          sprite: 'meteorite',
          hidden: false,
        });
    }
    for (const s of w.samples) {
      const e = this.samples.find((x) => x.id === s.id);
      if (e) e.taken = s.taken;
    }
    this.flags = w.flags.slice();
    this.pduBroken = w.pduBroken;
    this.antenna.state = w.antenna;
    this.antenna.partsInstalled = w.partsInstalled;
  }
}

const PANEL_COLORS = {
  outline: '#151821',
  cell: '#2d5bb5',
  cellCracked: '#22396e',
  grid: '#6d9de6',
  glint: '#a9cbff',
  cover: '#9aa1ad',
  coverLight: '#c9ced8',
  mast: '#8b909c',
  mastDark: '#5d616c',
  plate: '#3a3e4a',
  plateTop: '#b9bdc7',
};

/**
 * A solar panel on a mast, drawn in code so it can fold: open, the blue cell array is wide and
 * tilted toward the sky; folded, it is a small silver box on a shorter mast.
 * (sx, sy) is the panel's left edge and ground line on screen.
 */
function drawPanel(g: Ctx, p: SolarPanel, sx: number, sy: number, time: number): void {
  const c = PANEL_COLORS;
  const o = p.open;
  const mid = sx + PANEL_W / 2;
  rect(g, mid - 10, sy - 4, 20, 4, c.outline);
  rect(g, mid - 9, sy - 3, 18, 3, c.plate);
  rect(g, mid - 9, sy - 3, 18, 1, c.plateTop);
  const mastH = Math.round(8 + 5 * o);
  const mastTop = sy - 3 - mastH;
  rect(g, mid - 2, mastTop, 4, mastH, c.outline);
  rect(g, mid - 1, mastTop, 2, mastH, c.mast);
  rect(g, mid, mastTop, 1, mastH, c.mastDark);
  // status light: green = making power, orange = folded, blinking red = cracked
  const led = p.broken ? (Math.sin(time * 8) > 0 ? '#ff5a5a' : '#5a1a1a') : p.folded ? '#ffb347' : '#5fd068';
  rect(g, mid - 1, sy - 8, 2, 2, led);

  const aw = Math.round(14 + (PANEL_W - 14) * o);
  const ah = Math.round(5 + 11 * o);
  const ax = Math.round(mid - aw / 2);
  const ay = mastTop - ah;
  rect(g, ax - 1, ay - 1, aw + 2, ah + 2, c.outline);
  if (o < 0.35) {
    // folded: the cells face inward and the silver back shows
    rect(g, ax, ay, aw, ah, c.cover);
    rect(g, ax, ay, aw, 1, c.coverLight);
    for (let x = ax + 4; x < ax + aw - 2; x += 5) rect(g, x, ay + 1, 1, ah - 1, c.mastDark);
    return;
  }
  rect(g, ax, ay, aw, ah, p.broken ? c.cellCracked : c.cell);
  // cell grid, then the three hinges between the four folding sections
  for (let x = ax + 6; x < ax + aw - 1; x += 6) rect(g, x, ay, 1, ah, c.grid);
  rect(g, ax, ay + Math.round(ah / 2), aw, 1, c.grid);
  for (let j = 1; j < 4; j++) rect(g, ax + Math.round((aw * j) / 4), ay, 1, ah, c.outline);
  rect(g, ax, ay, aw, 1, c.glint);
  if (p.dust > 0.02) {
    for (let row = 1; row < ah; row++) {
      g.fillStyle = `rgba(196,120,70,${Math.min(0.92, p.dust * (0.7 + ((row * 37) % 10) / 30))})`;
      g.fillRect(ax, ay + row, aw, 1);
    }
  }
  if (p.broken) {
    // a white crack zig-zagging across the cells
    g.fillStyle = 'rgba(235,240,255,0.9)';
    let y = ay + 2;
    for (let x = ax + 6; x < ax + aw - 6; x += 2) {
      g.fillRect(x, y, 2, 1);
      y += (x / 2) % 3 === 0 ? 1 : (x / 2) % 3 === 1 ? -1 : 0;
      y = Math.max(ay + 1, Math.min(ay + ah - 2, y));
    }
  }
  if (p.shine > 0) {
    g.fillStyle = `rgba(255,255,255,${p.shine})`;
    g.fillRect(ax + 3 + Math.round((1 - p.shine) * (aw - 8)), ay + 1, 3, ah - 2);
  }
}
