/**
 * The drivable Mars rover (top-down): WASD drives in 8 directions.
 * Battery, a mobile O2 tether for the suit, and a big trunk. Hop in (E) and your backpack
 * goes into the trunk; park on the landing pad and the trunk unloads into base storage.
 */
import {
  LANDMARKS,
  ROVER_ACCEL,
  ROVER_CHARGE,
  ROVER_DRAIN,
  ROVER_MAX_SPEED,
  ROVER_TETHER_RANGE,
  ROVER_TRUNK_CAP,
  SUIT_REFILL_COST,
  TILE,
} from '../config';
import { type Ctx } from '../core/canvas';
import type { Game } from '../Game';
import type { Inventory, ItemId, RoverSave } from '../types';
import { type Body, moveBody } from './Physics';

export class Rover implements Body {
  x = 0;
  y = 0;
  w = 30;
  h = 16;
  vx = 0;
  vy = 0;
  facing: 1 | -1 = 1;
  dir: 'side' | 'up' | 'down' = 'side';
  battery = 100;
  drainMul = 1;
  o2 = 300;
  o2Max = 300;
  trunk: Inventory = {};
  driving = false;
  private wheelRot = 0;
  private distAcc = 0;
  private stuckT = 0;
  private game: Game;

  constructor(game: Game) {
    this.game = game;
    this.park();
  }

  get cx(): number {
    return this.x + this.w / 2;
  }
  get cy(): number {
    return this.y + this.h / 2;
  }

  park(): void {
    const P = LANDMARKS.roverPad;
    this.x = (P.x + P.w / 2) * TILE - this.w / 2;
    this.y = (P.y + P.h / 2) * TILE - this.h / 2;
    this.vx = 0;
    this.vy = 0;
    this.dir = 'side';
    this.facing = 1;
  }

  padCenter(): { x: number; y: number } {
    const P = LANDMARKS.roverPad;
    return { x: (P.x + P.w / 2) * TILE, y: (P.y + P.h / 2) * TILE };
  }

  onPad(): boolean {
    const P = LANDMARKS.roverPad;
    return this.cx > P.x * TILE && this.cx < (P.x + P.w) * TILE && this.cy > P.y * TILE && this.cy < (P.y + P.h) * TILE;
  }

  trunkCount(): number {
    return Object.values(this.trunk).reduce((a, b) => a + (b ?? 0), 0);
  }

  tetherReach(p: { x: number; y: number; w: number; h: number }): boolean {
    if (this.o2 <= 0) return false;
    if (this.driving) return true;
    return Math.hypot(p.x + p.w / 2 - this.cx, p.y + p.h / 2 - this.cy) < ROVER_TETHER_RANGE;
  }

  supplyO2(want: number): number {
    const give = Math.min(want, this.o2);
    this.o2 -= give;
    return give;
  }

  enter(): void {
    const g = this.game;
    const p = g.player;
    this.driving = true;
    p.hidden = true;
    let moved = 0;
    for (const [id, n] of Object.entries(p.pack) as [ItemId, number][]) {
      if (!n || id === 'antenna_part' || id === 'food' || id === 'brick') continue;
      const k = Math.min(ROVER_TRUNK_CAP - this.trunkCount(), n);
      if (k <= 0) continue;
      this.trunk[id] = (this.trunk[id] ?? 0) + k;
      p.pack[id] = n - k;
      moved += k;
    }
    if (moved > 0) g.toast(`Moved ${moved} items into the rover trunk`, '#ffd166', 'icon_rover');
    g.audio.select();
    g.emit('enter_rover');
    g.hint(
      'rover_tip',
      'Rover controls: WASD to drive, E to hop out, R for auto-pilot back to base. Your suit breathes from the rover tank!',
      'happy',
      99999,
    );
  }

  exit(): void {
    const g = this.game;
    const p = g.player;
    const spots: [number, number][] = [
      [this.cx, this.y + this.h + 10],
      [this.x - 10, this.cy],
      [this.x + this.w + 10, this.cy],
      [this.cx, this.y - 6],
    ];
    let placed = false;
    for (const [fx, fy] of spots) {
      if (!g.map.rectSolid(fx - p.w / 2, fy - p.h, p.w, p.h)) {
        p.placeAt(fx, fy);
        placed = true;
        break;
      }
    }
    if (!placed) p.placeAt(this.cx, this.y + this.h + 10);
    p.hidden = false;
    this.driving = false;
    this.vx = 0;
    this.vy = 0;
    g.audio.loop('rover', 0);
    if (this.onPad()) this.unloadToBase();
  }

  unloadToBase(): void {
    if (this.trunkCount() <= 0) return;
    this.game.res.deposit(this.trunk, 'rover trunk');
    this.trunk = {};
  }

  autopilotHome(): void {
    const g = this.game;
    this.park();
    if (this.driving) g.player.placeAt(this.cx, this.cy);
    g.toast('Auto-pilot: rover returned to the landing pad', '#7fe3ff', 'icon_rover');
    g.audio.hiss(false);
  }

  update(dt: number): void {
    const g = this.game;
    const input = g.input;
    let ix = 0;
    let iy = 0;
    if (this.driving) {
      ({ x: ix, y: iy } = input.axis());
      if (input.pressed('r')) this.autopilotHome();
    }
    const maxV = ROVER_MAX_SPEED * (this.battery > 0 ? 1 : 0.3);
    const k = Math.min(1, (ROVER_ACCEL * dt) / maxV);
    this.vx += (ix * maxV - this.vx) * k;
    this.vy += (iy * maxV - this.vy) * k;
    if (ix || iy) this.battery = Math.max(0, this.battery - ROVER_DRAIN * this.drainMul * dt);
    if (!ix && !iy && Math.hypot(this.vx, this.vy) < 5) {
      this.vx = 0;
      this.vy = 0;
    }
    const bx = this.x;
    const by = this.y;
    moveBody(g.map, this, dt);
    const moved = Math.hypot(this.x - bx, this.y - by);
    this.wheelRot += moved * 0.25;
    if (Math.abs(this.vx) > Math.abs(this.vy) + 5) {
      this.dir = 'side';
      this.facing = this.vx > 0 ? 1 : -1;
    } else if (Math.abs(this.vy) > Math.abs(this.vx) + 5) this.dir = this.vy > 0 ? 'down' : 'up';

    if (this.driving) {
      this.distAcc += moved / TILE;
      if (this.distAcc >= 1) {
        const m = Math.floor(this.distAcc);
        this.distAcc -= m;
        g.stats.distanceDriven += m;
        g.emit('drive', m);
      }
      if ((ix || iy) && moved < 0.2) this.stuckT += dt;
      else this.stuckT = 0;
      if (this.stuckT > 2.5) {
        g.hint(
          'stuck',
          'Stuck against a rock? Drive around it, or press R and the auto-pilot takes the rover back to the pad.',
          'think',
          30,
        );
        this.stuckT = 0;
      }
      g.player.placeAt(this.cx, this.y + this.h);
      if (moved > 0.5 && Math.random() < 0.5) g.particles.dust(this.cx - this.vx * 0.08, this.y + this.h, 1);
      g.audio.loop('rover', 1, Math.hypot(this.vx, this.vy) / ROVER_MAX_SPEED);
      if (this.battery <= 0)
        g.hint(
          'rover_flat',
          'Rover battery is empty! It can only crawl now. Head back to the charging pad.',
          'alert',
          40,
        );
    }

    if (this.onPad() && Math.hypot(this.vx, this.vy) < 5) {
      this.battery = Math.min(100, this.battery + ROVER_CHARGE * dt);
      if (this.o2 < this.o2Max && g.res.o2 > 10) {
        const want = Math.min(this.o2Max - this.o2, 30 * dt);
        this.o2 += want;
        g.res.o2 -= want * SUIT_REFILL_COST * 0.5;
      }
    }
  }

  render(g: Ctx, camX: number, camY: number): void {
    const art = this.game.art;
    const bottom = Math.round(this.y + this.h - camY);
    const mid = Math.round(this.cx - camX);
    if (mid < -60 || mid > this.game.vw + 60) return;
    g.drawImage(art.get('shadow'), mid - 22, bottom - 4, 44, 8);
    if (this.dir === 'side') {
      g.save();
      g.translate(mid, bottom - 28);
      if (this.facing < 0) g.scale(-1, 1);
      g.drawImage(art.get('rover'), -28, 0);
      if (this.driving) {
        g.fillStyle = '#eeece5';
        g.fillRect(12, 5, 6, 5);
        g.fillStyle = '#1b2133';
        g.fillRect(15, 6, 3, 3);
      }
      const f = ((Math.floor(this.wheelRot) % 4) + 4) % 4;
      const wheel = art.get(`wheel_${f}`);
      for (const wx of [10, 28, 46]) g.drawImage(wheel, wx - 6 - 28, 16);
      g.restore();
    } else {
      const img = art.get(this.dir === 'down' ? 'rover_down' : 'rover_up');
      g.drawImage(img, mid - 20, bottom - 34);
      if (this.driving && this.dir === 'down') {
        g.fillStyle = '#eeece5';
        g.fillRect(mid - 2, bottom - 7, 5, 3);
      }
    }
    const p = this.game.player;
    if (!this.driving && !p.inBase && this.tetherReach(p)) {
      g.strokeStyle = 'rgba(127,227,255,0.6)';
      g.setLineDash([2, 2]);
      g.beginPath();
      g.moveTo(mid, bottom - 16);
      g.lineTo(Math.round(p.cx - camX), Math.round(p.y - 10 - camY));
      g.stroke();
      g.setLineDash([]);
    }
  }

  lights(add: (x: number, y: number, r: number, i: number) => void): void {
    const dx = this.dir === 'side' ? this.facing * 40 : 0;
    const dy = this.dir === 'down' ? 36 : this.dir === 'up' ? -40 : -4;
    add(this.cx + dx, this.cy + dy, 56, 0.95);
    add(this.cx, this.cy - 8, 28, 0.5);
  }

  serialize(): RoverSave {
    return { x: this.x, y: this.y, battery: this.battery, o2: this.o2, trunk: { ...this.trunk } };
  }

  load(s: RoverSave): void {
    this.x = s.x;
    this.y = s.y;
    this.battery = s.battery;
    this.o2 = s.o2;
    this.trunk = { ...s.trunk };
    this.driving = false;
  }
}
