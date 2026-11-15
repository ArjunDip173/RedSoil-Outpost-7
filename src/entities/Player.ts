/**
 * The junior astronaut in top-down view: 8-way walking, sprinting, suit swap
 * (EVA spacesuit outside ↔ jumpsuit inside), backpack inventory and mouse-aimed hotbar tools
 * (mining laser, dust brush, building blocks, seeds, flag, snacks).
 */
import {
  ACCEL,
  BULKY_ITEMS,
  CROP_ORDER,
  HEALTH_MAX,
  LASER_POWER,
  O,
  PACK_CAP,
  REACH,
  SNACK_HEAL,
  SPRINT_MULT,
  STAMINA_DRAIN,
  STAMINA_REGEN,
  SUIT_O2_DRAIN,
  SUIT_O2_EXERTION,
  SUIT_O2_MAX,
  TILE,
  TOOLS,
  WALK_SPEED,
} from '../config';
import { type Ctx, rect } from '../core/canvas';
import { type ArmFrame, ASTRO_H, ASTRO_W, type LegFrame } from '../core/Sprites';
import type { Game } from '../Game';
import type { CropId, Inventory, ItemId, PlayerSave } from '../types';
import type { SolarPanel } from '../world/WorldObjects';
import { type Body, moveBody, overlaps } from './Physics';

export type Dir = 'down' | 'up' | 'side';
const SIDE_CYCLE: LegFrame[] = ['walkA', 'walkB', 'walkC', 'walkB'];
const FRONT_CYCLE = ['walkA', 'idle', 'walkB', 'idle'] as const;

export class Player implements Body {
  /** Feet hitbox (top-left corner). */
  x = 0;
  y = 0;
  w = 10;
  h = 8;
  vx = 0;
  vy = 0;
  facing: 1 | -1 = 1;
  dir: Dir = 'down';

  o2 = SUIT_O2_MAX;
  o2Max = SUIT_O2_MAX;
  health = HEALTH_MAX;
  /** Sprint stamina. */
  jet = 100;
  jetMax = 100;
  sprintBoost = 1;
  laserPower = LASER_POWER;
  pack: Inventory = {};
  hotbar = 0;
  seed: CropId = 'lettuce';

  inBase = true;
  hidden = false;
  sprinting = false;
  firing = false;
  brushing = false;
  target: { tx: number; ty: number; px: number; py: number } | null = null;
  private walkDist = 0;
  private lastFrame = '';
  private brushT = 0;
  private placeCooldown = 0;
  private hurtFlash = 0;
  private autoBrush: SolarPanel | null = null;
  private game: Game;

  constructor(game: Game) {
    this.game = game;
  }

  get cx(): number {
    return this.x + this.w / 2;
  }
  get cy(): number {
    return this.y + this.h / 2;
  }
  get suit(): 'eva' | 'iva' {
    return this.inBase ? 'iva' : 'eva';
  }

  /** Put the astronaut's feet at (px, footY). */
  placeAt(px: number, footY: number): void {
    this.x = px - this.w / 2;
    this.y = footY - this.h;
    this.vx = 0;
    this.vy = 0;
  }

  // ───────────────────────── inventory ─────────────────────────

  packCount(): number {
    let n = 0;
    for (const id of BULKY_ITEMS) n += this.pack[id] ?? 0;
    return n;
  }

  addItem(id: ItemId, n = 1): number {
    let fit = n;
    if (BULKY_ITEMS.includes(id)) fit = Math.max(0, Math.min(n, PACK_CAP - this.packCount()));
    if (fit > 0) this.pack[id] = (this.pack[id] ?? 0) + fit;
    return fit;
  }

  take(id: ItemId, n = 1): boolean {
    const have = this.pack[id] ?? 0;
    if (have < n) return false;
    this.pack[id] = have - n;
    return true;
  }

  hurt(amount: number): void {
    if (amount <= 0) return;
    this.health = Math.max(0, this.health - amount);
    this.hurtFlash = 0.25;
  }

  startBrushPanel(p: SolarPanel): void {
    this.autoBrush = p;
  }

  /** The tile under the mouse, accounting for rocks drawn 8px taller than their tile. */
  pickTile(mx: number, my: number): { tx: number; ty: number } {
    const map = this.game.map;
    const tx = Math.floor(mx / TILE);
    let ty = Math.floor(my / TILE);
    if (map.getObj(tx, ty) === O.NONE && map.getObj(tx, ty + 1) !== O.NONE && my >= (ty + 1) * TILE - 8) ty += 1;
    return { tx, ty };
  }

  // ───────────────────────── update ─────────────────────────

  update(dt: number): void {
    const g = this.game;
    const input = g.input;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.placeCooldown = Math.max(0, this.placeCooldown - dt);
    if (this.hidden) {
      this.firing = false;
      this.brushing = false;
      this.sprinting = false;
      this.updateLifeSupport(dt);
      return;
    }

    // keys or the touch joystick (a small push walks slowly)
    const { x: ix, y: iy } = input.axis();
    const moving = ix !== 0 || iy !== 0;
    this.sprinting = moving && input.isDown('shift') && this.jet > 1;
    const speed = WALK_SPEED * (this.sprinting ? SPRINT_MULT * this.sprintBoost : 1);
    const k = Math.min(1, (ACCEL * dt) / Math.max(1, speed));
    this.vx += (ix * speed - this.vx) * k;
    this.vy += (iy * speed - this.vy) * k;
    if (!moving && Math.hypot(this.vx, this.vy) < 4) {
      this.vx = 0;
      this.vy = 0;
    }
    if (this.sprinting) {
      this.jet = Math.max(0, this.jet - STAMINA_DRAIN * dt);
      g.stats.jetSeconds += dt;
    } else this.jet = Math.min(this.jetMax, this.jet + STAMINA_REGEN * dt);
    if (moving) this.autoBrush = null;

    moveBody(g.map, this, dt);

    if (moving) {
      if (Math.abs(ix) >= Math.abs(iy) - 0.01) {
        this.dir = 'side';
        this.facing = ix >= 0 ? 1 : -1;
      } else this.dir = iy > 0 ? 'down' : 'up';
    }
    const v = Math.hypot(this.vx, this.vy);
    if (v > 5) {
      this.walkDist += v * dt;
      const frame = this.frameName();
      if (frame !== this.lastFrame && /walkA|walkC/.test(frame)) {
        g.audio.step();
        if (!this.inBase && Math.random() < 0.6) g.particles.dust(this.cx, this.y + this.h, 1);
      }
      this.lastFrame = frame;
      if (this.sprinting && !this.inBase && Math.random() < 0.3) g.particles.dust(this.cx, this.y + this.h, 1);
    }

    this.updateTools(dt);
    this.updateLifeSupport(dt);
  }

  private updateLifeSupport(dt: number): void {
    const g = this.game;
    if (this.inBase) {
      this.health = Math.min(HEALTH_MAX, this.health + 3 * dt);
      return;
    }
    if (g.rover.tetherReach(this)) {
      this.o2 += Math.min(this.o2Max - this.o2, g.rover.supplyO2(9 * dt));
    } else {
      const ease = g.settings.easyMode ? 0.75 : 1;
      const exert = this.sprinting || this.firing ? SUIT_O2_EXERTION : 0;
      this.o2 = Math.max(0, this.o2 - (SUIT_O2_DRAIN + exert) * ease * dt);
    }
    if (this.o2 <= 0) this.hurt(7 * dt);
    else if (!g.weather.solDoseOver()) this.health = Math.min(HEALTH_MAX, this.health + 0.6 * dt);
  }

  private faceToward(wx: number, wy: number): void {
    const dx = wx - this.cx;
    const dy = wy - (this.cy - 8);
    if (Math.abs(dx) > Math.abs(dy)) {
      this.dir = 'side';
      this.facing = dx >= 0 ? 1 : -1;
    } else this.dir = dy > 0 ? 'down' : 'up';
  }

  private updateTools(dt: number): void {
    const g = this.game;
    const input = g.input;
    this.firing = false;
    this.brushing = false;
    this.target = null;
    const tool = TOOLS[this.hotbar];
    const mx = input.worldX + g.camX;
    const my = input.worldY + g.camY;
    const overHud = g.hud.isOverUi(input.mouseX, input.mouseY);
    const { tx, ty } = this.pickTile(mx, my);
    const inReach = Math.hypot(tx * TILE + 8 - this.cx, ty * TILE + 8 - (this.cy - 6)) <= REACH;

    if (this.autoBrush) {
      const p = this.autoBrush;
      if (Math.hypot(p.x + 17 - this.cx, p.y - 8 - this.cy) > 60 || this.inBase) this.autoBrush = null;
      else {
        this.brushing = true;
        this.faceToward(p.x + 17, p.y - 10);
        this.brushPanel(p, dt);
        if (p.dust <= 0) this.autoBrush = null;
      }
    }

    if (input.mouseDown && !overHud && !input.blocked) {
      this.faceToward(mx, my);
      switch (tool.id) {
        case 'laser': {
          if (this.inBase) {
            if (input.mousePressed) g.hint('nolaser', 'Safety rule: no mining lasers inside the habitat!', 'alert', 15);
            break;
          }
          this.firing = true;
          if (inReach && g.map.canMine(tx, ty)) {
            const hasObj = g.map.getObj(tx, ty) !== O.NONE;
            this.target = { tx, ty, px: tx * TILE + 8, py: ty * TILE + (hasObj ? 2 : 8) };
            const res = g.map.dig(tx, ty, this.laserPower * dt);
            if (Math.random() < 0.5) g.particles.sparks(this.target.px, this.target.py, 1);
            if (res) g.onDig(tx, ty, res);
          } else {
            const ang = Math.atan2(my - (this.cy - 8), mx - this.cx);
            const len = Math.min(REACH, Math.hypot(mx - this.cx, my - this.cy + 8));
            this.target = { tx: -1, ty: -1, px: this.cx + Math.cos(ang) * len, py: this.cy - 8 + Math.sin(ang) * len };
          }
          break;
        }
        case 'brush': {
          if (this.inBase) break;
          const panel = g.objects.panelAt(mx, my);
          if (panel && Math.hypot(panel.x + 17 - this.cx, panel.y - 8 - this.cy) < REACH + 20) {
            this.brushing = true;
            if (panel.broken) {
              if (input.mousePressed) g.openPanelRepair(panel);
            } else this.brushPanel(panel, dt);
            break;
          }
          const s = g.objects.sampleAt(mx, my);
          if (s && Math.hypot(s.x + 6 - this.cx, s.y - this.cy) < REACH + 10) {
            this.brushing = true;
            s.progress += dt / 1.6;
            if (Math.random() < 0.4) g.particles.dust(s.x + 6, s.y - 4, 1);
            if (s.progress >= 1) g.collectSample(s);
          }
          break;
        }
        case 'brick':
        case 'regolith':
        case 'ice': {
          if (this.placeCooldown > 0 || !inReach) break;
          const item = tool.uses!;
          if ((this.pack[item] ?? 0) <= 0) {
            if (input.mousePressed)
              g.hint(`no_${item}`, item === 'brick' ? 'No bricks in your backpack! Make them at the Fabricator (2 regolith = 4 bricks), then carry them out.' : `No ${item} in your backpack. Mine some first!`, 'think', 8);
            break;
          }
          if (!g.map.canPlace(tx, ty)) break;
          const cell = { x: tx * TILE, y: ty * TILE, w: TILE, h: TILE };
          if (overlaps(cell, this) || overlaps(cell, g.rover)) break;
          this.take(item, 1);
          g.map.setObj(tx, ty, item === 'brick' ? O.BRICK : item === 'ice' ? O.ICEBLOCK : O.MOUND);
          g.onTilePlaced(tx, ty);
          this.placeCooldown = 0.16;
          break;
        }
        case 'seeds':
          if (input.mousePressed) g.hint('seedhint', 'Seeds go in the Greenhouse trays inside the base. Stand next to a tray and press E!', 'think', 10);
          break;
        case 'flag':
          if (input.mousePressed) g.plantFlag();
          break;
        case 'snack':
          if (input.mousePressed) this.eatSnack();
          break;
      }
    }
    if (this.brushing) {
      this.brushT += dt;
      g.audio.loop('brush', 1);
    } else g.audio.loop('brush', 0);
    g.audio.loop('laser', this.firing ? 1 : 0);
    g.audio.loop('thruster', this.sprinting && !this.inBase ? 0.25 : 0);
  }

  private brushPanel(p: SolarPanel, dt: number): void {
    const before = p.dust;
    p.dust = Math.max(0, p.dust - dt * 0.55);
    if (Math.random() < 0.6) this.game.particles.dust(p.x + 4 + Math.random() * 28, p.y - 18, 1);
    if (before > 0 && p.dust <= 0) {
      p.shine = 1;
      this.game.onPanelCleaned(p);
    }
  }

  eatSnack(): void {
    const g = this.game;
    if (this.health >= HEALTH_MAX) {
      g.hint('full', "You're already at full health!", 'happy', 4);
      return;
    }
    if ((this.pack.food ?? 0) > 0) this.take('food');
    else if (this.inBase && g.res.food >= 1) g.res.food -= 1;
    else {
      g.hint('nofood', 'No meal packs! Eat inside the base (it uses base food) or carry some.', 'think', 8);
      return;
    }
    this.health = Math.min(HEALTH_MAX, this.health + SNACK_HEAL);
    g.audio.harvest();
    g.particles.floatText(this.cx, this.y - 26, '+35', '#ff5a6a');
  }

  cycleSeed(): void {
    const i = CROP_ORDER.indexOf(this.seed);
    this.seed = CROP_ORDER[(i + 1) % CROP_ORDER.length];
  }

  // ───────────────────────── rendering ─────────────────────────

  private frameName(): string {
    const moving = Math.hypot(this.vx, this.vy) > 5;
    if (this.dir === 'side') return moving ? SIDE_CYCLE[Math.floor(this.walkDist / 7) % 4] : 'idle';
    return moving ? FRONT_CYCLE[Math.floor(this.walkDist / 8) % 4] : 'idle';
  }

  render(g: Ctx, camX: number, camY: number, time: number): void {
    if (this.hidden) return;
    const art = this.game.art;
    const sx = Math.round(this.cx - ASTRO_W / 2 - camX);
    const sy = Math.round(this.y + this.h - ASTRO_H - camY);
    g.drawImage(art.get('shadow'), sx + 4, sy + ASTRO_H - 4);
    const frame = this.frameName();
    let name: string;
    let flip = false;
    if (this.dir === 'side') {
      let arm: ArmFrame = 'down';
      if (this.firing) arm = 'fwd';
      else if (this.brushing) arm = Math.floor(this.brushT * 8) % 2 === 0 ? 'brush0' : 'brush1';
      name = `astro_${this.suit}_${frame}_${arm}`;
      flip = this.facing < 0;
    } else name = `astro_${this.suit}_${this.dir}_${frame}`;
    const bob = frame === 'idle' && Math.sin(time * 2.2) > 0.85 ? 1 : 0;
    if (this.hurtFlash > 0 && Math.floor(this.hurtFlash * 30) % 2 === 0) g.globalAlpha = 0.5;
    art.draw(g, name, sx, sy + bob, flip);
    g.globalAlpha = 1;

    let hx: number;
    let hy: number;
    if (this.dir === 'side') {
      hx = flip ? sx + 5 : sx + ASTRO_W - 5;
      hy = sy + 14;
    } else if (this.dir === 'down') {
      hx = sx + 18;
      hy = sy + 16;
    } else {
      hx = sx + 18;
      hy = sy + 11;
    }
    if (this.brushing) {
      const wob = Math.floor(this.brushT * 8) % 2;
      rect(g, hx - 1, hy + wob, 3, 2, '#8a5a32');
      rect(g, hx - 1, hy + 2 + wob, 4, 3, '#e8c26a');
    }
    if (this.firing && this.target) {
      rect(g, hx - 2, hy - 1, 5, 3, '#23242b');
      rect(g, hx - 1, hy, 3, 1, '#c9c7c0');
      const ex = Math.round(this.target.px - camX);
      const ey = Math.round(this.target.py - camY);
      const flick = 0.6 + Math.random() * 0.4;
      g.strokeStyle = `rgba(127,227,255,${flick})`;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(hx, hy);
      g.lineTo(ex, ey);
      g.stroke();
      g.strokeStyle = '#ffffff';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(hx, hy);
      g.lineTo(ex, ey);
      g.stroke();
      rect(g, ex - 2, ey - 2, 4, 4, `rgba(255,255,255,${flick})`);
    }
  }

  serialize(): PlayerSave {
    return { x: this.x, y: this.y, o2: this.o2, health: this.health, jet: this.jet, pack: { ...this.pack }, hotbar: this.hotbar, seed: this.seed, inBase: this.inBase };
  }

  load(s: PlayerSave): void {
    this.x = s.x;
    this.y = s.y;
    this.o2 = s.o2;
    this.health = s.health;
    this.jet = s.jet;
    this.pack = { ...s.pack };
    this.hotbar = s.hotbar;
    this.seed = s.seed;
    this.inBase = s.inBase;
  }
}
