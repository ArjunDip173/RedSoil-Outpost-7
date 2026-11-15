/**
 * Time of Sol (day/night light), dust storms, dust devils, meteor strikes
 * and DONKI-style solar flare (SEP) alerts with live radiation dose tracking.
 */
import {
  BASE_W,
  BASE_X,
  BASE_Y,
  FLARE_PEAK_RATE,
  G,
  LANDMARKS,
  O,
  SHIELD_BASE,
  SHIELD_LAVA_TUBE,
  SHIELD_ROVER,
  SOL_DOSE_BUDGET,
  SOL_SECONDS,
  START_TIME_OF_SOL,
  STORM_WARNING,
  SURFACE_DOSE_RATE,
  TILE,
} from '../config';
import { type Ctx, rgba } from '../core/canvas';
import { clamp, mulberry32 } from '../core/Rng';
import type { Game } from '../Game';
import type { Drawable } from '../world/BaseHabitat';
import { panelCenter } from '../world/WorldObjects';
import type { WeatherSave } from '../types';

type FlarePhase = 'none' | 'warning' | 'active';

interface Devil {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  spin: number;
}

interface Meteor {
  tx: number;
  ty: number;
  t: number;
  dur: number;
}

const FLARE_CLASSES = ['M2.4', 'M5.1', 'M8.7', 'X1.2', 'X2.8'];

export class WeatherSystem {
  sol = 1;
  time = START_TIME_OF_SOL;
  solDose = 0;
  doseRate = SURFACE_DOSE_RATE;
  shieldFactor = 1;
  /** `warn` counts down the seconds until a storm that is on its way arrives. */
  storm = { active: false, t: 0, duration: 0, peak: 0, warn: 0 };
  flare: { phase: FlarePhase; t: number; duration: number; cls: string; scripted: boolean } = {
    phase: 'none',
    t: 0,
    duration: 0,
    cls: 'M5.1',
    scripted: false,
  };
  flareDose = 0;
  flareSheltered = 0;
  flareTotal = 0;
  devils: Devil[] = [];
  meteors: Meteor[] = [];
  shake = 0;
  private rng = mulberry32(Date.now() & 0xffff);
  private eventT = 20;
  private game: Game;

  constructor(game: Game) {
    this.game = game;
  }

  // Derived values

  get sun(): number {
    const t = this.time;
    if (t < 0.25 || t > 0.75) return 0;
    return Math.pow(Math.sin(((t - 0.25) / 0.5) * Math.PI), 0.8);
  }
  get isNight(): boolean {
    return this.time < 0.24 || this.time > 0.76;
  }
  /** 0 = full day, 1 = deep night (smooth). */
  get night(): number {
    return this.time < 0.5 ? clamp((0.3 - this.time) / 0.1, 0, 1) : clamp((this.time - 0.7) / 0.1, 0, 1);
  }
  get stormIntensity(): number {
    if (!this.storm.active) return 0;
    const p = this.storm.t / this.storm.duration;
    const env = p < 0.2 ? p / 0.2 : p > 0.8 ? (1 - p) / 0.2 : 1;
    return env * this.storm.peak;
  }
  /** A storm has been forecast and will hit in `storm.warn` seconds. */
  get stormComing(): boolean {
    return !this.storm.active && this.storm.warn > 0;
  }
  get flareRate(): number {
    if (this.flare.phase !== 'active') return 0;
    return (
      Math.sin((this.flare.t / this.flare.duration) * Math.PI) *
      FLARE_PEAK_RATE *
      (this.flare.cls.startsWith('X') ? 1 : 0.75)
    );
  }
  get clock(): string {
    const hours = this.time * 24.66;
    const h = Math.floor(hours) % 24;
    const m = Math.floor((hours - Math.floor(hours)) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  solDoseOver(): boolean {
    return this.solDose > SOL_DOSE_BUDGET;
  }

  // Events

  /** Forecast a dust storm: it hits after STORM_WARNING seconds, giving time to fold the panels. */
  startStorm(duration = 70 + this.rng() * 60, peak = 0.6 + this.rng() * 0.4, warning = STORM_WARNING): void {
    if (this.storm.active || this.stormComing) return;
    this.storm = { active: false, t: 0, duration, peak, warn: warning };
    const g = this.game;
    g.toast(`DUST STORM in ${Math.round(warning)} seconds! Fold the solar panels`, '#e8b58a', 'icon_storm');
    if (g.objects.anyPanelOpen)
      g.luna.say(
        'A dust storm is coming! Fold the solar panels before the wind breaks them: use BASE OPS (Power), or press E next to a panel.',
        'alert',
        3,
      );
    g.audio.warn();
  }

  startFlare(scripted: boolean, lead = 35): void {
    if (this.flare.phase !== 'none') return;
    const cls = scripted ? 'X1.2' : FLARE_CLASSES[Math.floor(this.rng() * FLARE_CLASSES.length)];
    this.flare = { phase: 'warning', t: lead, duration: scripted ? 48 : 40, cls, scripted };
    this.flareDose = 0;
    this.flareSheltered = 0;
    this.flareTotal = 0;
    const g = this.game;
    g.audio.alarm();
    g.toast(`DONKI ALERT: ${cls} solar flare! Particles arrive in ${Math.round(lead)} s`, '#ff5a5a', 'icon_rad');
    g.luna.say(
      `NASA's DONKI space-weather feed reports a ${cls} flare! Get to the Storm Shelter or into the lava tube cave!`,
      'alert',
      3,
    );
    g.unlockFact('donki', true);
  }

  /** Is a tile part of the outpost (never hit by meteors)? */
  private nearOutpost(tx: number, ty: number): boolean {
    return (
      tx > LANDMARKS.roverPad.x - 6 && tx < BASE_X + BASE_W + 8 && ty > BASE_Y - 6 && ty < LANDMARKS.solarField.y + 10
    );
  }

  spawnMeteor(): void {
    const g = this.game;
    for (let k = 0; k < 12; k++) {
      const tx = Math.floor(g.player.cx / TILE + (this.rng() - 0.5) * 40);
      const ty = Math.floor(g.player.cy / TILE + (this.rng() - 0.5) * 24);
      if (!g.map.inBounds(tx, ty) || this.nearOutpost(tx, ty) || g.map.caveMask[g.map.idx(tx, ty)]) continue;
      this.meteors.push({ tx, ty, t: 0, dur: 1.8 });
      g.audio.meteor();
      return;
    }
  }

  private impact(m: Meteor): void {
    const g = this.game;
    const map = g.map;
    for (let y = m.ty - 2; y <= m.ty + 2; y++) {
      for (let x = m.tx - 2; x <= m.tx + 2; x++) {
        if ((x - m.tx) ** 2 + (y - m.ty) ** 2 > 5 || !map.inBounds(x, y) || map.isProtected(x, y)) continue;
        const o = map.getObj(x, y);
        if (o !== O.NONE && o !== O.BEDROCK && o !== O.CLIFF) map.setObj(x, y, O.NONE);
        if (map.getGround(x, y) !== G.FLOOR && map.getGround(x, y) !== G.PAD) map.setGround(x, y, G.CRATER);
        g.minimapDirty(x, y);
      }
    }
    const px = m.tx * TILE + 8;
    const py = m.ty * TILE + 8;
    g.objects.spawnMeteorite(px, py);
    g.particles.debris(px, py, '#b8673e', 24);
    g.particles.burst(px, py, 30, '#ffd166', 160);
    this.shake = 0.6;
    for (const p of g.objects.panels) {
      const c = panelCenter(p);
      if (Math.hypot(c.x - px, c.y - py) < 70 && !p.broken) {
        p.broken = true;
        p.cause = 'meteor';
        g.luna.say('A meteorite cracked a solar panel! Go fix its wiring: stand next to it and press E.', 'alert', 2);
      }
    }
    g.luna.hint(
      'meteor',
      'Whoa, a meteorite landed! Go find it. Scientists LOVE space rocks. Look for the glowing chunk.',
      'wow',
      20,
      2,
    );
  }

  // Update

  private skippingNight = false;

  update(dt: number): void {
    const g = this.game;
    this.time += dt / SOL_SECONDS;
    // Training missions skip the night (no long waits): dusk jumps to the next morning.
    if (
      this.time > 0.68 &&
      this.time < 0.9 &&
      g.missions.activeId() <= 6 &&
      !this.skippingNight &&
      this.flare.phase === 'none'
    ) {
      this.skippingNight = true;
      g.fade(() => {
        this.time = 0.3;
        this.sol++;
        this.solDose = 0;
        this.skippingNight = false;
        g.onNewSol();
      });
    }
    if (this.time >= 1) {
      this.time -= 1;
      this.sol++;
      this.solDose = 0;
      g.onNewSol();
    }
    this.shake = Math.max(0, this.shake - dt);

    if (this.stormComing) {
      const before = this.storm.warn;
      this.storm.warn = Math.max(0, before - dt);
      if (this.storm.warn < 10 && Math.floor(before) !== Math.floor(this.storm.warn)) g.audio.warn();
      if (this.storm.warn <= 0) {
        this.storm.active = true;
        g.toast('DUST STORM! Stay close to the base', '#e8b58a', 'icon_storm');
        g.luna.say(
          g.objects.anyPanelOpen
            ? 'The storm is here and the solar panels are still open! Fold them quickly!'
            : 'The storm is here. Good job folding the panels: they are safe!',
          g.objects.anyPanelOpen ? 'alert' : 'happy',
          3,
        );
      }
    }
    if (this.storm.active) {
      this.storm.t += dt;
      if (this.storm.t >= this.storm.duration) {
        this.storm.active = false;
        g.stats.stormsSurvived++;
        g.emit('storm_survived');
        g.luna.say(
          g.objects.allPanelsFolded
            ? 'The dust storm is over! Open the solar panels again (BASE OPS, Power) so we get power.'
            : 'The dust storm is over! Time to brush the panels clean again.',
          'happy',
          2,
        );
        g.unlockFact('dust_storm_2018', true);
        g.checkBadges();
      }
    }
    const f = this.flare;
    if (f.phase === 'warning') {
      f.t -= dt;
      if (Math.floor(f.t + dt) !== Math.floor(f.t) && f.t < 10 && f.t > 0) g.audio.warn();
      if (f.t <= 0) {
        f.phase = 'active';
        f.t = 0;
        g.toast('SOLAR PARTICLES ARRIVING! Take cover!', '#ff5a5a', 'icon_rad');
        g.audio.alarm();
      }
    } else if (f.phase === 'active') {
      f.t += dt;
      if (f.t >= f.duration) {
        f.phase = 'none';
        g.onFlareEnd(f.scripted, this.flareSheltered / Math.max(1, this.flareTotal), this.flareDose);
      }
    }

    // random events, unlocked as missions progress
    this.eventT -= dt;
    if (this.eventT <= 0) {
      this.eventT = 25 + this.rng() * 25;
      const done = g.missions.completedCount();
      const r = this.rng();
      if (done >= 2 && !this.storm.active && this.sun > 0.2 && r < 0.09) this.startStorm();
      else if (done >= 5 && f.phase === 'none' && r > 0.95) this.startFlare(false, 40);
      else if (done >= 3 && r > 0.88 && this.meteors.length === 0 && !g.player.inBase) this.spawnMeteor();
    }

    // dust devils on sunny afternoons
    if (this.sun > 0.4 && !this.storm.active && this.devils.length < 2 && this.rng() < dt * 0.02) {
      const ang = this.rng() * Math.PI * 2;
      const sx = g.player.cx + Math.cos(ang) * (g.vw * 0.6);
      const sy = g.player.cy + Math.sin(ang) * (g.vh * 0.6);
      this.devils.push({
        x: sx,
        y: sy,
        vx: -Math.cos(ang) * (18 + this.rng() * 18),
        vy: -Math.sin(ang) * (12 + this.rng() * 12),
        life: 30 + this.rng() * 20,
        spin: 0,
      });
    }
    for (const d of this.devils) {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.life -= dt;
      d.spin += dt * 9;
      for (const p of g.objects.panels) {
        const c = panelCenter(p);
        if (Math.hypot(c.x - d.x, c.y - d.y) < 24 && p.dust > 0.05) {
          const before = p.dust;
          p.dust = Math.max(0, p.dust - dt * 0.4);
          if (before > 0.2 && p.dust <= 0.2) {
            g.luna.hint(
              'devilclean',
              'A dust devil just blew a solar panel clean! NASA rovers called this a "cleaning event".',
              'wow',
              60,
              0,
            );
            g.unlockFact('dust_devils', true);
          }
        }
      }
      const pl = g.player;
      if (!pl.inBase && !g.rover.driving && Math.hypot(pl.cx - d.x, pl.cy - d.y) < 20) {
        pl.vx += (Math.random() - 0.5) * 300 * dt + d.vx * dt * 2;
        pl.vy += (Math.random() - 0.5) * 300 * dt + d.vy * dt * 2;
      }
    }
    this.devils = this.devils.filter((d) => d.life > 0);

    for (const m of this.meteors) {
      m.t += dt;
      if (m.t >= m.dur) this.impact(m);
    }
    this.meteors = this.meteors.filter((m) => m.t < m.dur);

    const storm = this.stormIntensity;
    if (storm > 0 && !g.player.inBase && !g.rover.driving) g.player.vx -= storm * 30 * dt;
    g.audio.loop('wind', g.player.inBase ? storm * 0.3 : 0.25 + storm * 1.2, storm);

    this.updateDose(dt);
  }

  private updateDose(dt: number): void {
    const g = this.game;
    const p = g.player;
    const surface = SURFACE_DOSE_RATE + this.flareRate;
    let factor = 1;
    let sheltered = false;
    if (p.inBase) {
      if (g.base.isInShelter(p.cx, p.cy)) {
        factor = g.base.shelterFactor();
        sheltered = true;
      } else factor = SHIELD_BASE;
    } else if (g.rover.driving) factor = SHIELD_ROVER;
    else if (g.map.inCavePx(p.cx, p.cy)) {
      factor = SHIELD_LAVA_TUBE;
      sheltered = true;
      if (this.flare.phase !== 'none') g.unlockFact('lava_tubes', true);
    }
    this.shieldFactor = factor;
    this.doseRate = surface * factor;
    const dose = (this.doseRate * dt) / SOL_SECONDS;
    this.solDose += dose;
    if (this.flare.phase === 'active') {
      this.flareDose += dose;
      this.flareTotal += dt;
      if (sheltered) this.flareSheltered += dt;
    }
    const cps = Math.min(45, this.doseRate * 1.3 + (p.inBase ? 0.1 : 0.3));
    if (Math.random() < cps * dt) g.audio.geiger();
    if (this.solDose > SOL_DOSE_BUDGET && this.doseRate > 1.5) {
      p.hurt(2.2 * dt);
      g.hint(
        'raddmg',
        "You've had too much radiation today! Get into the Storm Shelter or the lava tube cave NOW.",
        'alert',
        12,
        3,
      );
    } else if (this.flare.phase === 'active' && this.doseRate > 8) {
      g.hint(
        'radhigh',
        'Radiation is very high out here! Shelter inside the base, or in the lava tube cave. Rock blocks radiation.',
        'alert',
        10,
        3,
      );
    }
  }

  // Rendering

  /** Dust devils & incoming meteors go into the y-sorted world. */
  drawables(list: Drawable[], camX: number, camY: number, time: number): void {
    const g = this.game.g;
    for (const d of this.devils) {
      list.push({
        y: d.y,
        draw: () => {
          const fade = Math.min(1, d.life / 4);
          g.fillStyle = `rgba(30,8,4,${0.2 * fade})`;
          g.fillRect(Math.round(d.x - 10 - camX), Math.round(d.y - 2 - camY), 20, 4);
          for (let i = 0; i < 46; i++) {
            const t = i / 46;
            const r = 3 + t * 14;
            const ang = d.spin + i * 0.7;
            const x = d.x + Math.cos(ang) * r;
            const y = d.y - t * 70 + Math.sin(ang) * r * 0.3;
            g.fillStyle = rgba(i % 3 === 0 ? '#e8b58a' : '#c98a5b', (0.55 - t * 0.35) * fade);
            g.fillRect(Math.round(x - camX), Math.round(y - camY), 2, 2);
          }
        },
      });
    }
    for (const m of this.meteors) {
      const px = m.tx * TILE + 8;
      const py = m.ty * TILE + 8;
      list.push({
        y: py + 1000,
        draw: () => {
          const p = m.t / m.dur;
          // growing shadow + falling fireball from the sky
          const r = 2 + p * 10;
          g.fillStyle = `rgba(20,4,2,${0.2 + p * 0.3})`;
          g.beginPath();
          g.ellipse(Math.round(px - camX), Math.round(py - camY), r, r * 0.5, 0, 0, Math.PI * 2);
          g.fill();
          const fx = px + (1 - p) * 220;
          const fy = py - (1 - p) * 320;
          g.strokeStyle = 'rgba(255,200,120,0.7)';
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(Math.round(fx - camX), Math.round(fy - camY));
          g.lineTo(Math.round(fx + 30 - camX), Math.round(fy - 44 - camY));
          g.stroke();
          g.lineWidth = 1;
          g.fillStyle = '#fff6d0';
          g.fillRect(Math.round(fx - camX) - 2, Math.round(fy - camY) - 2, 4, 4);
          if (Math.random() < 0.6) this.game.particles.thrust(fx, fy);
          void time;
        },
      });
    }
  }

  /** Sunrise / sunset colour wash (Mars sunsets are blue!) and daytime haze. */
  renderTint(g: Ctx, vw: number, vh: number): void {
    const dusk =
      Math.max(0, 1 - Math.abs(this.time - 0.75) / 0.05) + Math.max(0, 1 - Math.abs(this.time - 0.25) / 0.05);
    if (dusk > 0) {
      g.fillStyle = `rgba(90,140,210,${Math.min(0.28, dusk * 0.28)})`;
      g.fillRect(0, 0, vw, vh);
    }
    const day = this.sun;
    if (day > 0) {
      g.fillStyle = `rgba(255,190,130,${day * 0.06})`;
      g.fillRect(0, 0, vw, vh);
    }
  }

  /** Full-screen storm haze, flare alert tint and the green aurora. */
  renderOverlay(g: Ctx, vw: number, vh: number, time: number): void {
    const st = this.stormIntensity;
    if (st > 0) {
      g.fillStyle = `rgba(180,110,60,${st * 0.42})`;
      g.fillRect(0, 0, vw, vh);
      g.fillStyle = `rgba(230,170,120,${st * 0.55})`;
      for (let i = 0; i < 90 * st; i++) {
        const x = (i * 97 + time * (240 + (i % 5) * 40)) % (vw + 20);
        const y = (i * 53 + Math.sin(time + i) * 10) % vh;
        g.fillRect(Math.round(vw - x), Math.round(y), 3, 1);
      }
    }
    const f = this.flare.phase;
    if (f !== 'none' && this.night > 0.3) {
      // Perseverance saw a green aurora on Mars after a solar storm in 2024
      for (let y = 0; y < vh; y += 3) {
        const a = 0.05 * this.night * (0.5 + 0.5 * Math.sin(y * 0.05 + time * 1.3));
        g.fillStyle = `rgba(90,255,150,${a})`;
        g.fillRect(0, y, vw, 2);
      }
    }
    if (f === 'active') {
      const a = 0.08 + 0.06 * Math.sin(time * 6);
      const grad = g.createRadialGradient(vw / 2, vh / 2, vh * 0.3, vw / 2, vh / 2, vh * 0.85);
      grad.addColorStop(0, 'rgba(255,40,60,0)');
      grad.addColorStop(1, `rgba(255,40,60,${a * 3})`);
      g.fillStyle = grad;
      g.fillRect(0, 0, vw, vh);
    }
  }

  serialize(): WeatherSave {
    return {
      sol: this.sol,
      time: this.time,
      solDose: this.solDose,
      storm: { ...this.storm },
      flare: { ...this.flare },
    };
  }

  load(s: WeatherSave): void {
    this.sol = s.sol;
    this.time = s.time;
    this.solDose = s.solDose;
    this.storm = { warn: 0, ...s.storm };
    this.flare = { ...s.flare };
  }
}
