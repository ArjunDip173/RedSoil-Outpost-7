/**
 * Kid-friendly heads-up display.
 *
 * Two layers: world overlays (tile cursor, the guide's glowing path and goal beacon) are drawn on
 * the zoomed-in world view; everything else (radial gauges, hotbar, minimap, the guide arrow at
 * the screen edge) is drawn on a separate, less-zoomed HUD layer so it stays small and tidy.
 * Text-heavy bits (current mission step, toasts, prompts, flashing warnings) are DOM overlays.
 */
import { BASE_WATER_CAP, CROPS, ITEMS, LANDMARKS, O, PACK_CAP, SOL_DOSE_BUDGET, TILE, TOOLS } from '../config';
import { type Ctx, rect } from '../core/canvas';
import { forTouch, touch } from '../core/touch';
import type { Game } from '../Game';
import { pointAlong } from '../world/pathfind';
import { el, icon, spriteCanvas } from './Dom';
import { TouchControls } from './TouchControls';

const FONT = '8px "Press Start 2P", monospace';

/** A chunky arrow pointing along `ang`, its tip `size` px ahead of (x, y), with a dark outline. */
function drawArrow(g: Ctx, x: number, y: number, ang: number, size: number, color: string): void {
  g.save();
  g.translate(Math.round(x), Math.round(y));
  g.rotate(ang);
  g.beginPath();
  g.moveTo(size, 0);
  g.lineTo(-size * 0.7, -size * 0.8);
  g.lineTo(-size * 0.3, 0);
  g.lineTo(-size * 0.7, size * 0.8);
  g.closePath();
  g.lineJoin = 'round';
  g.lineWidth = 2;
  g.strokeStyle = 'rgba(20,10,12,0.85)';
  g.stroke();
  g.fillStyle = color;
  g.fill();
  g.restore();
}

interface RingPx {
  x: number;
  y: number;
  a: number;
}

interface ToastEl {
  node: HTMLDivElement;
  life: number;
  text: string;
}

export interface Alert {
  id: string;
  level: 'bad' | 'warn';
  icon: string;
  text: string;
}

interface ActionDef {
  id: string;
  icon: string;
  label: string;
  key: string;
  show: () => boolean;
  act?: () => void;
  /** Hold-to-use button (fast-forward). */
  hold?: boolean;
}

export class Hud {
  bigMap = false;
  alerts: Alert[] = [];
  private ringCache = new Map<string, RingPx[]>();
  private hotbarRect = { x: 0, y: 0, w: 0, h: 0 };
  private minimapRect = { x: 0, y: 0, w: 0, h: 0 };
  private toolHintT = 0;
  private lastTool = -1;
  private tracker: HTMLDivElement;
  /** Visible "SI-assisted art & audio" watermark (Space Apps rules for SI images and audio). */
  private siMark: HTMLDivElement;
  private toastBox: HTMLDivElement;
  private prompt: HTMLDivElement;
  private toolHint: HTMLDivElement;
  private banner: HTMLDivElement;
  private toasts: ToastEl[] = [];
  private trackerKey = '';
  private alertKey = '';
  private seenAlerts = new Set<string>();
  private actionBar: HTMLDivElement;
  /** Hologram wrist-watch with all the stats (replaces the old top bar). */
  private watch: HTMLDivElement;
  private watchRows: Record<string, { row: HTMLDivElement; fill: HTMLDivElement; val: HTMLSpanElement }> = {};
  private watchHead!: HTMLSpanElement;
  private watchWeather!: HTMLDivElement;
  private watchT = 0;
  watchOpen = false;
  /** One message at a time: toasts wait here while another message is showing. */
  private pending: { text: string; color: string; icon?: string; age: number }[] = [];
  private actions: { def: ActionDef; btn: HTMLButtonElement; shown: boolean }[] = [];
  /** Joystick and buttons for phones and tablets. */
  private touchUi: TouchControls;
  private game: Game;

  constructor(game: Game, root: HTMLElement) {
    this.game = game;
    this.tracker = el('div', 'tracker');
    this.siMark = el('div', 'si-mark', 'SI-assisted art & audio');
    this.toastBox = el('div', 'toasts');
    this.prompt = el('div', 'prompt hidden');
    this.toolHint = el('div', 'tool-hint hidden');
    this.banner = el('div', 'banner hidden');
    this.banner.setAttribute('role', 'alert');
    this.actionBar = el('div', 'action-bar');
    this.watch = el('div', 'holo-watch hidden');
    root.append(
      this.tracker,
      this.toastBox,
      this.prompt,
      this.toolHint,
      this.banner,
      this.watch,
      this.actionBar,
      this.siMark,
    );
    this.buildActions();
    this.buildWatch();
    this.touchUi = new TouchControls(game, root);
    game.input.isUiAt = (x, y) => this.isTapTarget(x, y);
    // on a touchscreen the "[USE] …" label itself can be tapped
    this.prompt.addEventListener('pointerdown', (e) => {
      if (!touch.active || game.ui.blocking) return;
      e.preventDefault();
      game.input.tapKey('e');
    });
  }

  /** Big on-screen buttons, so kids don't have to remember the keyboard shortcuts. */
  private buildActions(): void {
    const g = this.game;
    const defs: ActionDef[] = [
      { id: 'ff', icon: 'ui_ff', label: 'FAST', key: '', show: () => g.player.inBase, hold: true },
      {
        id: 'ops',
        icon: 'icon_power',
        label: 'BASE OPS',
        key: 'B',
        show: () => g.player.inBase,
        act: () => g.ui.openBaseOps('power'),
      },
      {
        id: 'scan',
        icon: 'ui_scan',
        label: 'SCAN',
        key: 'Q',
        show: () => !g.player.inBase && !g.rover.driving,
        act: () => g.doScan(),
      },
      {
        id: 'home',
        icon: 'ui_home',
        label: 'GO HOME',
        key: 'R',
        show: () => g.rover.driving,
        act: () => g.rover.autopilotHome(),
      },
      { id: 'map', icon: 'ui_map', label: 'MAP', key: 'M', show: () => true, act: () => (this.bigMap = !this.bigMap) },
      { id: 'ask', icon: 'ui_chat', label: 'ASK LUNA', key: 'T', show: () => true, act: () => g.ui.openAskLuna() },
      { id: 'watch', icon: 'ui_watch', label: 'WATCH', key: 'TAB', show: () => true, act: () => this.toggleWatch() },
      { id: 'menu', icon: 'ui_pause', label: 'MENU', key: 'ESC', show: () => true, act: () => g.openPause() },
    ];
    for (const def of defs) {
      const btn = document.createElement('button');
      btn.className = `act-btn act-${def.id}`;
      btn.tabIndex = -1;
      btn.title = def.key ? `${def.label} (key ${def.key})` : def.label;
      const ic = el('span', 'act-icon');
      ic.appendChild(icon(def.icon, 3));
      btn.append(ic, el('span', 'act-label', def.label));
      if (def.key) btn.appendChild(el('span', 'act-key', def.key));
      // keep keyboard focus on the game (Space must not "click" the button again)
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      if (def.hold) {
        const stop = () => (g.ffHeld = false);
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          g.ffHeld = true;
          g.audio.blip();
        });
        btn.addEventListener('pointerup', stop);
        btn.addEventListener('pointerleave', stop);
        btn.addEventListener('pointercancel', stop);
        window.addEventListener('pointerup', stop);
      } else
        btn.addEventListener('click', () => {
          if (g.ui.blocking) return;
          g.audio.blip();
          def.act?.();
        });
      btn.classList.add('hidden');
      this.actionBar.appendChild(btn);
      this.actions.push({ def, btn, shown: false });
    }
  }

  private updateActions(): void {
    const g = this.game;
    const hideAll = g.ui.blocking || g.evacuatingNow;
    for (const a of this.actions) {
      const show = !hideAll && a.def.show();
      if (show !== a.shown) {
        a.shown = show;
        a.btn.classList.toggle('hidden', !show);
      }
    }
    const w = this.actions.find((a) => a.def.id === 'watch');
    if (w) {
      w.btn.classList.toggle('alarm', !this.watchOpen && this.alerts.some((a) => a.level === 'bad'));
      w.btn.classList.toggle('active', this.watchOpen);
    }
    const ff = this.actions.find((a) => a.def.id === 'ff');
    if (ff) {
      ff.btn.classList.toggle('active', g.fastForwarding);
      ff.btn.classList.toggle('blocked', g.ffHeld && !g.fastForwarding);
    }
  }

  /** HUD-layer size (in HUD pixels). */
  private get W(): number {
    return this.game.hw;
  }
  private get H(): number {
    return this.game.hh;
  }

  destroy(): void {
    for (const n of [this.tracker, this.toastBox, this.prompt, this.toolHint, this.banner, this.watch, this.actionBar])
      n.remove();
    this.siMark.remove();
    this.touchUi.destroy();
  }

  // Hologram watch

  private buildWatch(): void {
    const art = this.game.art;
    const frame = el('div', 'holo-frame');
    const head = el('div', 'holo-head');
    this.watchHead = el('span', 'holo-time');
    head.append(el('span', 'holo-title', 'OUTPOST 7'), this.watchHead);
    frame.appendChild(head);
    const section = (t: string) => frame.appendChild(el('div', 'holo-section', t));
    const row = (id: string, icon: string, label: string) => {
      const r = el('div', 'holo-row');
      const ic = el('span', 'holo-ic');
      if (art.has(icon)) ic.appendChild(spriteCanvas(art.get(icon), 2));
      const bar = el('div', 'holo-bar');
      const fill = el('div', 'holo-fill');
      bar.appendChild(fill);
      const val = el('span', 'holo-val');
      r.append(ic, el('span', 'holo-label', label), bar, val);
      frame.appendChild(r);
      this.watchRows[id] = { row: r, fill, val };
    };
    section('BASE');
    row('batt', 'icon_power', 'BATTERY');
    row('air', 'icon_o2', 'AIR');
    row('water', 'icon_water', 'WATER');
    row('food', 'icon_food', 'FOOD');
    section('YOU');
    row('suit', 'icon_o2', 'SUIT AIR');
    row('hp', 'icon_heart', 'HEALTH');
    row('rad', 'icon_rad', 'RADIATION');
    row('bag', 'icon_regolith', 'BACKPACK');
    row('rover', 'icon_rover', 'ROVER');
    this.watchWeather = el('div', 'holo-weather');
    frame.appendChild(this.watchWeather);
    frame.appendChild(el('div', 'holo-foot', 'TAB to close'));
    this.watch.appendChild(frame);
  }

  /** Open / close the hologram watch (TAB key or the ⌚ button). */
  toggleWatch(): void {
    this.watchOpen = !this.watchOpen;
    this.game.audio.select();
    // re-trigger the "materialise" animation each time it opens
    this.watch.classList.remove('opening');
    if (this.watchOpen) {
      void this.watch.offsetWidth;
      this.watch.classList.add('opening');
      this.watchT = 0;
      this.updateWatch();
    }
  }

  private updateWatch(): void {
    const g = this.game;
    const r = g.res;
    const p = g.player;
    const w = g.weather;
    const set = (id: string, frac: number, text: string, state: '' | 'warn' | 'bad', show = true) => {
      const x = this.watchRows[id];
      x.row.className = `holo-row ${state}${show ? '' : ' hidden'}`;
      x.fill.style.width = `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`;
      x.val.textContent = text;
    };
    const lvl = (v: number, bad: number, warn: number): '' | 'warn' | 'bad' =>
      v < bad ? 'bad' : v < warn ? 'warn' : '';
    this.watchHead.textContent = `SOL ${w.sol} · ${w.clock}`;
    const pct = r.batteryPct;
    set('batt', pct / 100, `${Math.round(pct)}% ${r.net >= 0 ? '▲' : '▼'}`, lvl(pct, 20, 45));
    set('air', r.o2 / 100, `${Math.round(r.o2)}%`, lvl(r.o2, 25, 50));
    set('water', r.water / BASE_WATER_CAP, `${Math.round(r.water)} L`, lvl(r.water, 10, 30));
    set('food', r.food / 40, `${Math.floor(r.food)} meals`, lvl(r.food, 2, 5));
    const suit = (p.o2 / p.o2Max) * 100;
    set('suit', suit / 100, p.inBase ? 'FULL' : `${Math.round(suit)}%`, p.inBase ? '' : lvl(suit, 25, 50));
    set('hp', p.health / 100, `${Math.round(p.health)}%`, lvl(p.health, 30, 60));
    const dose = w.solDose / SOL_DOSE_BUDGET;
    set(
      'rad',
      dose,
      dose > 1 ? 'TOO HIGH!' : dose > 0.6 ? 'HIGH' : dose > 0.3 ? 'MEDIUM' : 'LOW',
      dose > 1 ? 'bad' : dose > 0.6 ? 'warn' : '',
    );
    const pc = p.packCount();
    set('bag', pc / PACK_CAP, `${pc}/${PACK_CAP}`, pc >= PACK_CAP ? 'bad' : pc >= PACK_CAP * 0.8 ? 'warn' : '');
    set(
      'rover',
      g.rover.battery / 100,
      `${Math.round(g.rover.battery)}%`,
      lvl(g.rover.battery, 15, 35),
      g.rover.driving,
    );
    const [wIcon, wText] =
      w.flare.phase === 'active'
        ? ['icon_rad', 'SOLAR FLARE! Stay in the shelter']
        : w.flare.phase === 'warning'
          ? ['icon_rad', 'Solar flare coming! Go to the shelter']
          : w.storm.active
            ? ['icon_storm', 'Dust storm: less sunlight']
            : w.stormComing
              ? ['icon_storm', 'Dust storm coming: fold the panels!']
              : w.isNight
                ? ['ui_moon', 'Night: no sunlight']
                : ['ui_sun', 'Clear skies'];
    if (this.watchWeather.dataset.key !== wText) {
      this.watchWeather.dataset.key = wText;
      this.watchWeather.replaceChildren(icon(wIcon), document.createTextNode(wText));
    }
    this.watchWeather.className = `holo-weather ${w.flare.phase !== 'none' ? 'bad' : ''}`;
  }

  // Messages (one at a time)

  toast(text: string, color: string, icon?: string): void {
    if (this.pending.some((q) => q.text === text) || this.toasts.some((t) => t.text === text)) return;
    this.pending.push({ text, color, icon, age: 0 });
    while (this.pending.length > 4) this.pending.shift();
  }

  /** Something else is talking (LUNA's bubble or a dialogue), so messages wait. */
  private get busyTalking(): boolean {
    const g = this.game;
    return g.ui.blocking || g.luna.speaking;
  }

  private showToast(text: string, color: string, icon?: string): void {
    const node = el('div', 'toast');
    node.style.borderColor = color;
    if (icon && this.game.art.has(icon)) node.appendChild(spriteCanvas(this.game.art.get(icon), 2));
    const t = el('span', '', forTouch(text));
    t.style.color = color;
    node.appendChild(t);
    this.toastBox.appendChild(node);
    this.toasts.push({ node, life: 2.8, text });
    while (this.toasts.length > 1) this.toasts.shift()!.node.remove();
  }

  /** Is this HUD-pixel point on top of a HUD widget (so clicks shouldn't dig)? */
  isOverUi(mx: number, my: number): boolean {
    const inR = (r: { x: number; y: number; w: number; h: number }) =>
      mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;
    if (inR(this.hotbarRect) || inR(this.minimapRect)) return true;
    return mx < 96 && my > this.H - 70;
  }

  /** HUD widgets a finger taps (tool bar, minimap): a touch there must not start the joystick. */
  isTapTarget(mx: number, my: number): boolean {
    const inR = (r: { x: number; y: number; w: number; h: number }) =>
      r.w > 0 && mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;
    return inR(this.hotbarRect) || inR(this.minimapRect);
  }

  handleClick(mx: number, my: number): boolean {
    const g = this.game;
    const h = this.hotbarRect;
    if (!g.rover.driving && mx >= h.x && mx <= h.x + h.w && my >= h.y && my <= h.y + h.h) {
      const i = Math.floor((mx - h.x - 2) / 22);
      if (i >= 0 && i < g.toolsUnlocked()) g.selectTool(i);
      return true;
    }
    const mm = this.minimapRect;
    if (mx >= mm.x && mx <= mm.x + mm.w && my >= mm.y && my <= mm.y + mm.h) {
      this.bigMap = !this.bigMap;
      return true;
    }
    return false;
  }

  update(dt: number): void {
    this.updateActions();
    this.touchUi.update();
    // one message at a time: show the next waiting message only when nothing else is
    for (const q of this.pending) q.age += dt;
    this.pending = this.pending.filter((q) => q.age < 12);
    if (!this.toasts.length && this.pending.length && !this.busyTalking) {
      const q = this.pending.shift()!;
      this.showToast(q.text, q.color, q.icon);
    }
    const showWatch = this.watchOpen && !this.game.ui.blocking && !this.bigMap;
    this.watch.classList.toggle('hidden', !showWatch);
    if (showWatch) {
      this.watchT -= dt;
      if (this.watchT <= 0) {
        this.watchT = 0.2;
        this.updateWatch();
      }
    }
    for (const t of this.toasts) {
      t.life -= dt;
      if (t.life < 0.4) t.node.classList.add('fade');
    }
    this.toasts = this.toasts.filter((t) => {
      if (t.life <= 0) {
        t.node.remove();
        return false;
      }
      return true;
    });
    if (this.game.player.hotbar !== this.lastTool) {
      this.lastTool = this.game.player.hotbar;
      // the tool tip is a message too: skip it if something else is showing
      this.toolHintT = this.toasts.length || this.pending.length || this.busyTalking ? 0 : 2.6;
    }
    this.toolHintT -= dt;
    this.alerts = this.computeAlerts();
    // one short beep the first time each serious warning appears
    for (const a of this.alerts) if (a.level === 'bad' && !this.seenAlerts.has(a.id)) this.game.audio.warn();
    this.seenAlerts = new Set(this.alerts.map((a) => a.id));
  }

  // Warnings

  private computeAlerts(): Alert[] {
    const g = this.game;
    const p = g.player;
    const r = g.res;
    const w = g.weather;
    const out: Alert[] = [];
    if (w.flare.phase === 'active') {
      const safe = g.base.isInShelter(p.cx, p.cy) || g.map.inCavePx(p.cx, p.cy);
      out.push({
        id: 'flare',
        level: safe ? 'warn' : 'bad',
        icon: 'icon_rad',
        text: safe
          ? `Solar flare: ${Math.max(0, Math.ceil(w.flare.duration - w.flare.t))} s left. You are safe here!`
          : 'SOLAR FLARE! Hide in the Storm Shelter or the lava tube!',
      });
    } else if (w.flare.phase === 'warning')
      out.push({
        id: 'flarewarn',
        level: 'bad',
        icon: 'icon_rad',
        text: `Solar flare in ${Math.ceil(w.flare.t)} s! Go to the Storm Shelter!`,
      });
    const panelsOpen = g.objects.anyPanelOpen;
    if (w.stormComing && panelsOpen)
      out.push({
        id: 'stormwarn',
        level: 'bad',
        icon: 'icon_storm',
        text: `DUST STORM in ${Math.ceil(w.storm.warn)} s! Fold the solar panels (Base Ops, Power).`,
      });
    else if (w.storm.active && panelsOpen)
      out.push({
        id: 'stormopen',
        level: 'bad',
        icon: 'icon_storm',
        text: 'STORM! The open solar panels are getting damaged. Fold them!',
      });
    else if (w.stormComing)
      out.push({
        id: 'stormready',
        level: 'warn',
        icon: 'icon_storm',
        text: `Dust storm in ${Math.ceil(w.storm.warn)} s. Panels folded: well done!`,
      });
    else if (!w.storm.active && g.objects.allPanelsFolded && !w.isNight)
      out.push({
        id: 'panelsfolded',
        level: 'warn',
        icon: 'icon_solar',
        text: 'Solar panels are folded: no solar power. Open them in Base Ops.',
      });
    if (!p.inBase && p.o2 / p.o2Max < 0.25 && !g.rover.tetherReach(p))
      out.push({ id: 'suit', level: 'bad', icon: 'icon_o2', text: 'SUIT OXYGEN LOW! Go inside or to the rover.' });
    else if (g.turnBackNeeded())
      out.push({
        id: 'turnback',
        level: 'warn',
        icon: 'ui_hourglass',
        text: 'Time to head back! Follow the red path home.',
      });
    if (p.health < 30)
      out.push({ id: 'health', level: 'bad', icon: 'icon_heart', text: 'HEALTH LOW! Go inside, or eat a Meal Pack.' });
    if (w.solDoseOver() && w.doseRate > 1.5)
      out.push({ id: 'dose', level: 'bad', icon: 'icon_rad', text: 'Too much radiation! Go inside.' });
    if (r.o2 < 25)
      out.push({ id: 'air', level: 'bad', icon: 'icon_o2', text: 'BASE AIR LOW! Switch on the O2 Maker.' });
    if (r.batteryPct < 20 && !g.objects.pduBroken)
      out.push({
        id: 'battery',
        level: 'bad',
        icon: 'icon_battery',
        text: r.autoPower ? 'BATTERY LOW! Brush the solar panels clean.' : 'BATTERY LOW! Switch machines off.',
      });
    const thirsty = r.water < 5 && (r.effectiveLevel('electrolysis') > 0 || r.beds.some((b) => b.crop && b.growth < 1));
    if (thirsty) out.push({ id: 'water', level: 'warn', icon: 'icon_water', text: 'WATER LOW: dig ice and melt it.' });
    if (r.food < 2)
      out.push({
        id: 'food',
        level: 'warn',
        icon: 'icon_food',
        text: 'FOOD LOW: harvest crops or switch on the algae.',
      });
    if (g.rover.driving && (g.rover.battery < 15 || g.roverLowForTrip()))
      out.push({
        id: 'rover',
        level: 'bad',
        icon: 'icon_rover',
        text: 'ROVER BATTERY LOW! Press R to auto-drive home.',
      });
    if (g.objects.panels.some((pn) => pn.broken))
      out.push({
        id: 'panel',
        level: 'warn',
        icon: 'ui_wrench',
        text: 'A solar panel is cracked: press E next to it.',
      });
    return out;
  }

  // Helpers

  private ring(r: number, th: number): RingPx[] {
    const key = `${r}_${th}`;
    let list = this.ringCache.get(key);
    if (list) return list;
    list = [];
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        const d = Math.sqrt(x * x + y * y);
        if (d <= r + 0.3 && d >= r - th + 0.3)
          list.push({ x, y, a: ((Math.atan2(y, x) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) });
      }
    }
    this.ringCache.set(key, list);
    return list;
  }

  private drawRing(
    g: Ctx,
    cx: number,
    cy: number,
    r: number,
    th: number,
    frac: number,
    color: string,
    back = 'rgba(10,8,14,0.75)',
  ): void {
    const px = this.ring(r, th);
    g.fillStyle = back;
    for (const p of px) if (p.a > frac) g.fillRect(cx + p.x, cy + p.y, 1, 1);
    g.fillStyle = color;
    for (const p of px) if (p.a <= frac) g.fillRect(cx + p.x, cy + p.y, 1, 1);
  }

  private text(g: Ctx, s: string, x: number, y: number, color = '#e8e6df', align: CanvasTextAlign = 'left'): number {
    g.font = FONT;
    g.textAlign = align;
    g.textBaseline = 'top';
    g.fillStyle = '#120a0a';
    g.fillText(s, x + 1, y + 1);
    g.fillStyle = color;
    g.fillText(s, x, y);
    g.textAlign = 'left';
    return g.measureText(s).width;
  }

  private flashing(time: number): boolean {
    return Math.floor(time * 2.5) % 2 === 0;
  }

  // World layer

  /** Things that belong to the world: tile cursor and the "where to go" guide. */
  renderWorld(g: Ctx, time: number): void {
    const game = this.game;
    if (game.ui.blocking || this.bigMap) return;
    this.drawCursor(g, time);
    this.drawGuide(g, time);
  }

  /**
   * The guide, drawn on top of everything (also at night): glowing dots along the walking route
   * that flow toward the goal, an arrow next to the astronaut pointing the way, and a bouncing
   * beacon on the goal itself.
   */
  private drawGuide(g: Ctx, time: number): void {
    const game = this.game;
    const gd = game.guide;
    const t = gd.target;
    if (!t) return;
    const color = t.urgent ? '#ff6a4a' : '#ffd166';
    const bright = t.urgent ? '#ffe2d8' : '#fffbe6';
    const camX = Math.round(game.camX);
    const camY = Math.round(game.camY);
    const fresh = gd.sinceNew < 3; // a new goal: bigger dots for a moment
    const pts = gd.path;
    if (!gd.arrived && pts.length > 1) {
      const SPACING = 10;
      let d = 0;
      let next = 14 + ((time * 22) % SPACING);
      let drawn = 0;
      for (let i = 1; i < pts.length && drawn < 110; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const seg = Math.hypot(b.x - a.x, b.y - a.y);
        while (next <= d + seg && drawn < 110) {
          if (next > gd.distance - 8) break;
          const k = seg ? (next - d) / seg : 0;
          const x = Math.round(a.x + (b.x - a.x) * k - camX);
          const y = Math.round(a.y + (b.y - a.y) * k - camY);
          if (x > -4 && y > -4 && x < game.vw + 4 && y < game.vh + 4) {
            // a bright pulse runs along the dots toward the goal
            const wave = (((next - time * 70) % 70) + 70) % 70 < 14;
            const r = fresh || wave ? 2 : 1;
            g.fillStyle = 'rgba(20,10,12,0.6)';
            g.fillRect(x - r - 1, y - r - 1, r * 2 + 3, r * 2 + 3);
            g.fillStyle = wave ? bright : color;
            g.fillRect(x - r, y - r, r * 2 + 1, r * 2 + 1);
          }
          drawn++;
          next += SPACING;
        }
        d += seg;
      }
      // the arrow next to the astronaut: which way to walk right now
      if (gd.distance > 40) {
        const body = game.rover.driving ? game.rover : game.player;
        const bx = body.x + body.w / 2;
        const by = body.y + body.h / 2;
        const ahead = gd.ahead(game.rover.driving ? 52 : 34);
        if (ahead) {
          const ang = Math.atan2(ahead.y - by, ahead.x - bx);
          const r = (game.rover.driving ? 26 : 16) + 2 + Math.sin(time * 7) * 2;
          drawArrow(g, bx + Math.cos(ang) * r - camX, by - 2 + Math.sin(ang) * r - camY, ang, 7, color);
        }
      }
    }
    // the beacon on the goal
    const sx = t.x - camX;
    const sy = t.y - camY;
    if (sx > -20 && sx < game.vw + 20 && sy > -30 && sy < game.vh + 20) {
      const ph = (time * 0.8) % 1;
      g.strokeStyle = t.urgent ? `rgba(255,106,74,${1 - ph})` : `rgba(255,209,102,${1 - ph})`;
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(Math.round(sx) + 0.5, Math.round(sy) + 2.5, 3 + ph * 14, (3 + ph * 14) * 0.5, 0, 0, Math.PI * 2);
      g.stroke();
      const bounce = Math.abs(Math.sin(time * 4)) * 5;
      drawArrow(g, sx, sy - 12 - bounce, Math.PI / 2, 8, color);
    }
  }

  private drawCursor(g: Ctx, time: number): void {
    const game = this.game;
    const p = game.player;
    if (game.rover.driving || p.inBase) return;
    const tool = TOOLS[p.hotbar];
    if (!['laser', 'brick', 'regolith', 'ice'].includes(tool.id)) return;
    if (this.isOverUi(game.input.mouseX, game.input.mouseY)) return;
    // on a touchscreen the target square only shows while a finger is on the ground
    if (touch.active && !game.input.mouseDown) return;
    const { tx, ty } = p.pickTile(game.input.worldX + game.camX, game.input.worldY + game.camY);
    const inReach = Math.hypot(tx * TILE + 8 - p.cx, ty * TILE + 8 - (p.cy - 6)) <= 4.5 * TILE;
    const valid = tool.id === 'laser' ? game.map.canMine(tx, ty) : game.map.canPlace(tx, ty);
    const color = !inReach
      ? 'rgba(255,90,90,0.55)'
      : valid
        ? `rgba(255,255,255,${0.6 + 0.3 * Math.sin(time * 8)})`
        : 'rgba(255,255,255,0.25)';
    const sx = tx * TILE - Math.round(game.camX);
    const sy = ty * TILE - Math.round(game.camY);
    g.fillStyle = color;
    g.fillRect(sx, sy, TILE, 1);
    g.fillRect(sx, sy + TILE - 1, TILE, 1);
    g.fillRect(sx, sy, 1, TILE);
    g.fillRect(sx + TILE - 1, sy, 1, TILE);
    if (tool.id !== 'laser' && valid && inReach) {
      g.globalAlpha = 0.45;
      const t = tool.id === 'brick' ? O.BRICK : tool.id === 'ice' ? O.ICEBLOCK : O.MOUND;
      g.drawImage(game.art.objs[t][0], sx, sy - 8);
      g.globalAlpha = 1;
    }
  }

  // HUD layer

  render(g: Ctx, time: number): void {
    this.drawVignette(g, time);
    this.drawGauges(g, time);
    if (this.game.rover.driving) this.drawRoverHud(g, time);
    else this.drawHotbar(g);
    this.drawMinimap(g, time);
    this.drawGuideHud(g, time); // on top, so the minimap never hides it
    if (this.bigMap) this.drawBigMap(g, time);
    this.updateDom();
  }

  private drawGauges(g: Ctx, time: number): void {
    const game = this.game;
    const p = game.player;
    const H = this.H;
    const w = game.weather;
    g.fillStyle = 'rgba(14,9,14,0.55)';
    g.fillRect(2, H - 68, 92, 66);
    // O2 (big ring) + sprint stamina (outer thin ring)
    const cx = 32;
    const cy = H - 32;
    const o2f = p.o2 / p.o2Max;
    const low = o2f < 0.25 && !p.inBase;
    const o2c = low && this.flashing(time) ? '#ff5a5a' : '#7fe3ff';
    // sprint ring only shows while it is being used
    if (p.jet < p.jetMax - 0.5) this.drawRing(g, cx, cy, 26, 2, p.jet / p.jetMax, '#ff9a3a', 'rgba(10,8,14,0.4)');
    this.drawRing(g, cx, cy, 22, 5, o2f, o2c);
    game.art.draw(g, 'icon_o2', cx - 6, cy - 12);
    this.text(g, `${Math.round(o2f * 100)}`, cx, cy + 2, o2c, 'center');
    if (p.inBase) this.text(g, 'HAB', cx, cy + 11, '#9be36a', 'center');
    else if (game.rover.tetherReach(p)) this.text(g, 'ROVER', cx, cy + 11, '#9be36a', 'center');
    // health
    this.drawRing(g, 76, H - 18, 13, 3, p.health / 100, p.health < 30 && this.flashing(time) ? '#ff2a3a' : '#ff7a8a');
    game.art.draw(g, 'icon_heart', 70, H - 24);
    // radiation: today's dose vs. the safe budget (only shown when it matters)
    const dose = w.solDose / SOL_DOSE_BUDGET;
    if (!p.inBase || dose > 0.3 || w.flare.phase !== 'none') {
      const rc = dose > 1 ? (this.flashing(time) ? '#ff2a3a' : '#ff5a5a') : dose > 0.6 ? '#ff9a3a' : '#ffd84a';
      this.drawRing(g, 76, H - 50, 13, 3, Math.min(1, dose), rc);
      game.art.draw(g, 'icon_rad', 70, H - 56);
    }
    // backpack: only mention it when it is nearly full
    const pc = p.packCount();
    if (!p.inBase && pc >= PACK_CAP * 0.8)
      this.text(
        g,
        pc >= PACK_CAP ? 'BAG FULL!' : 'BAG ALMOST FULL',
        100,
        H - 12,
        pc >= PACK_CAP ? '#ff5a5a' : '#ffd166',
      );
  }

  private drawHotbar(g: Ctx): void {
    const game = this.game;
    const p = game.player;
    const n = game.toolsUnlocked(); // tools appear one by one with the missions
    if (n <= 0) {
      this.hotbarRect = { x: 0, y: 0, w: 0, h: 0 };
      return;
    }
    const w = n * 22 - 2;
    const x0 = Math.round(this.W / 2 - w / 2);
    const y0 = this.H - 24;
    this.hotbarRect = { x: x0 - 2, y: y0 - 2, w: w + 4, h: 24 };
    g.fillStyle = 'rgba(14,9,14,0.7)';
    g.fillRect(x0 - 2, y0 - 2, w + 4, 24);
    for (let i = 0; i < n; i++) {
      const t = TOOLS[i];
      const x = x0 + i * 22;
      const sel = p.hotbar === i;
      rect(g, x, y0, 20, 20, sel ? '#3a2a20' : '#1c1620');
      if (sel) {
        rect(g, x - 1, y0 - 1, 22, 1, '#ffd166');
        rect(g, x - 1, y0 + 20, 22, 1, '#ffd166');
        rect(g, x - 1, y0 - 1, 1, 22, '#ffd166');
        rect(g, x + 20, y0 - 1, 1, 22, '#ffd166');
      }
      let count: number | null = null;
      if (t.uses) count = p.pack[t.uses] ?? 0;
      if (t.id === 'snack') count = (p.pack.food ?? 0) + (p.inBase ? Math.floor(game.res.food) : 0);
      if (t.id === 'seeds') count = game.res.have(CROPS[p.seed].seedItem);
      // empty slots are greyed out instead of showing a scary red "0"
      if (count === 0) g.globalAlpha = 0.35;
      game.art.draw(g, t.id === 'seeds' ? `icon_seed_${p.seed}` : t.icon, x + 4, y0 + 4);
      g.globalAlpha = 1;
      this.text(g, `${i + 1}`, x + 1, y0 + 1, sel ? '#ffd166' : '#6b6670');
      if (count) this.text(g, `${count}`, x + 19, y0 + 12, '#ffffff', 'right');
    }
  }

  private drawRoverHud(g: Ctx, time: number): void {
    const game = this.game;
    const r = game.rover;
    const w = 170;
    const x0 = Math.round(this.W / 2 - w / 2);
    const y0 = this.H - 30;
    this.hotbarRect = { x: x0, y: y0, w, h: 28 };
    g.fillStyle = 'rgba(14,9,14,0.8)';
    g.fillRect(x0, y0, w, 28);
    game.art.draw(g, 'icon_rover', x0 + 4, y0 + 8);
    const barRow = (label: string, frac: number, color: string, y: number) => {
      this.text(g, label, x0 + 20, y, '#c9c7c0');
      rect(g, x0 + 52, y + 1, 70, 6, '#2a2230');
      rect(g, x0 + 52, y + 1, Math.round(70 * Math.max(0, frac)), 6, color);
    };
    barRow(
      'BAT',
      r.battery / 100,
      r.battery < 15 && this.flashing(time) ? '#ff2a3a' : r.battery < 20 ? '#ff5a5a' : '#5fd068',
      y0 + 4,
    );
    barRow('O2', r.o2 / r.o2Max, '#7fe3ff', y0 + 15);
    this.text(g, `BOX ${r.trunkCount()}`, x0 + 128, y0 + 10, '#e8b58a');
  }

  private drawMinimap(g: Ctx, time: number): void {
    const game = this.game;
    // about a quarter of the screen width, and never tiny on phones
    const mw = Math.round(Math.max(112, Math.min(168, this.W * 0.24)));
    const mh = Math.round(mw * 0.56);
    const x0 = 4;
    const y0 = 4;
    this.minimapRect = { x: x0, y: y0, w: mw, h: mh };
    const p = game.rover.driving ? game.rover : game.player;
    const ptx = Math.floor((p.x + p.w / 2) / TILE);
    const pty = Math.floor((p.y + p.h / 2) / TILE);
    const sx = Math.max(0, Math.min(game.map.w - mw, ptx - mw / 2));
    const sy = Math.max(0, Math.min(game.map.h - mh, pty - mh / 2));
    g.fillStyle = 'rgba(14,9,14,0.82)';
    g.fillRect(x0 - 1, y0 - 1, mw + 2, mh + 2);
    g.drawImage(game.minimap, sx, sy, mw, mh, x0, y0, mw, mh);
    const mark = (wx: number, wy: number, color: string, size = 2) => {
      const mx = Math.floor(wx / TILE) - sx;
      const my = Math.floor(wy / TILE) - sy;
      if (mx < 0 || my < 0 || mx >= mw || my >= mh) return;
      rect(g, x0 + mx - (size >> 1), y0 + my - (size >> 1), size, size, color);
    };
    for (const f of game.objects.flags) mark(f.x, f.y - 8, game.profile.suitColor);
    // the route to the goal, and the goal itself
    const gd = game.guide;
    if (gd.target) {
      const col = gd.target.urgent ? '#ff6a4a' : '#ffd166';
      for (let d = TILE; d < gd.distance; d += TILE * 1.5) {
        const pt = pointAlong(gd.path, d);
        if (pt) mark(pt.x, pt.y, col, 1);
      }
      if (Math.sin(time * 8) > -0.3) mark(gd.target.x, gd.target.y, col, 4);
    }
    for (const pk of game.objects.partsRemaining()) if (Math.sin(time * 8) > 0) mark(pk.x, pk.y, '#ffd166', 3);
    mark(game.objects.antenna.x, game.objects.antenna.y - 20, '#7fe3ff', 3);
    if (!game.rover.driving) mark(game.rover.cx, game.rover.y, '#ffd166', 3);
    if (Math.sin(time * 6) > -0.3) mark(p.x + p.w / 2, p.y + p.h / 2, '#ffffff', 3);
    rect(g, x0 - 1, y0 - 1, mw + 2, 1, '#c1440e');
    this.text(g, 'M', x0 + mw - 9, y0 + mh - 9, '#8f8d88');
  }

  private drawBigMap(g: Ctx, time: number): void {
    const game = this.game;
    const W = this.W;
    const H = this.H;
    g.fillStyle = 'rgba(8,5,10,0.92)';
    g.fillRect(0, 15, W, H - 15);
    const map = game.map;
    const scale = Math.min((W - 20) / map.w, (H - 46) / map.h);
    const ox = Math.round((W - map.w * scale) / 2);
    const oy = 20;
    g.imageSmoothingEnabled = false;
    g.drawImage(game.minimap, 0, 0, map.w, map.h, ox, oy, map.w * scale, map.h * scale);
    const mark = (wx: number, wy: number, color: string, label?: string) => {
      const x = ox + (wx / TILE) * scale;
      const y = oy + (wy / TILE) * scale;
      rect(g, Math.round(x) - 2, Math.round(y) - 2, 4, 4, color);
      if (label) this.text(g, label, Math.round(x) + 4, Math.round(y) - 12, color);
    };
    mark(game.base.interior.x + game.base.interior.w / 2, game.base.interior.y, '#5fd068', 'BASE');
    mark(game.objects.antenna.x, game.objects.antenna.y - 20, '#7fe3ff', 'ANTENNA');
    mark(game.objects.lander.x + 20, game.objects.lander.y - 10, '#e8b58a', 'LANDER');
    const goal = game.guide.target;
    if (goal && Math.sin(time * 6) > -0.4) mark(goal.x, goal.y, goal.urgent ? '#ff6a4a' : '#ffd166', `▶ ${goal.label}`);
    mark((LANDMARKS.cave.x + 8) * TILE, (LANDMARKS.cave.y + 4) * TILE, '#9be36a', 'LAVA TUBE');
    mark(LANDMARKS.crater.x * TILE, (LANDMARKS.crater.y - LANDMARKS.crater.r) * TILE, '#ff9a3a', 'CRATER');
    if (!game.rover.driving) mark(game.rover.cx, game.rover.y, '#ffd166', 'ROVER');
    for (const pk of game.objects.partsRemaining()) mark(pk.x, pk.y, '#ffd166', 'PART');
    for (const f of game.objects.flags) mark(f.x, f.y - 8, game.profile.suitColor);
    const p = game.player;
    if (Math.sin(time * 6) > 0) mark(p.cx, p.cy, '#ffffff', 'YOU');
    this.text(g, forTouch('MAP · press M to close'), W / 2, H - 16, '#ffd166', 'center');
  }

  /**
   * The goal's name above its beacon when it is on screen; when it is off screen, a big arrow at
   * the screen edge points to it with its name and how far it is to walk.
   */
  private drawGuideHud(g: Ctx, time: number): void {
    const game = this.game;
    if (game.ui.blocking || this.bigMap) return;
    const gd = game.guide;
    const t = gd.target;
    if (!t) return;
    const color = t.urgent ? '#ff6a4a' : '#ffd166';
    const k = game.scale / game.hudScale; // world px → HUD px
    const W = this.W;
    const H = this.H;
    const wsx = t.x - game.camX;
    const wsy = t.y - game.camY;
    const meters = Math.max(1, Math.round(gd.distance / TILE));
    if (gd.parkAndWalk) {
      // the rover can't fit the whole way: show where to stop and walk
      const end = gd.path[gd.path.length - 1];
      const ex = end.x - game.camX;
      const ey = end.y - game.camY;
      if (ex > 4 && ex < game.vw - 4 && ey > 4 && ey < game.vh - 4)
        this.tag(g, 'P · PARK HERE, THEN WALK', Math.round(ex * k), Math.round((ey - 20) * k) - 12, '#7fe3ff');
    }
    if (wsx > 4 && wsx < game.vw - 4 && wsy > 4 && wsy < game.vh - 4) {
      if (gd.arrived) return; // the "[E] …" label takes over
      this.tag(g, t.label, Math.round(wsx * k), Math.round((wsy - 30) * k) - 12, color);
      return;
    }
    const margin = 26;
    const cx = W / 2;
    const cy = H / 2;
    const ang = Math.atan2(wsy * k - cy, wsx * k - cx);
    const ex = Math.max(margin, Math.min(W - margin, cx + Math.cos(ang) * W));
    // keep clear of the corners (minimap, mission box, gauges and buttons)
    const mm = this.minimapRect;
    const ey = Math.max(24 + margin, H * 0.26, mm.y + mm.h + 22, Math.min(H - 84, cy + Math.sin(ang) * H));
    const pulse = 1 + Math.max(0, Math.sin(time * 6)) * 0.15;
    g.fillStyle = 'rgba(14,9,14,0.75)';
    g.beginPath();
    g.arc(Math.round(ex), Math.round(ey), 15, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.stroke();
    drawArrow(g, ex, ey, ang, 10 * pulse, color);
    // name and distance, nudged toward the middle of the screen so it never leaves it
    const label = `${t.label} · ${gd.parkAndWalk ? 'park in ' : ''}${meters}m`;
    g.font = FONT;
    const tw = g.measureText(label).width;
    const lx = Math.max(6 + tw / 2, Math.min(W - 6 - tw / 2, ex - Math.cos(ang) * 4));
    const ly = ey + (Math.sin(ang) > 0.5 ? -34 : 20);
    this.tag(g, label, Math.round(lx), Math.round(ly), color);
  }

  /** A small dark name tag with coloured text, centred on x (but always fully on screen). */
  private tag(g: Ctx, s: string, x: number, y: number, color: string): void {
    g.font = FONT;
    const w = Math.ceil(g.measureText(s).width);
    x = Math.round(Math.max(w / 2 + 6, Math.min(this.W - w / 2 - 6, x)));
    g.fillStyle = 'rgba(14,9,14,0.82)';
    g.fillRect(x - w / 2 - 4, y - 3, w + 8, 14);
    g.fillStyle = color;
    g.fillRect(x - w / 2 - 4, y + 10, w + 8, 1);
    this.text(g, s, x, y, color, 'center');
  }

  private drawVignette(g: Ctx, time: number): void {
    const p = this.game.player;
    if (!((!p.inBase && p.o2 / p.o2Max < 0.2) || p.health < 30)) return;
    const a = 0.22 + 0.12 * Math.sin(time * 6);
    const W = this.W;
    const H = this.H;
    const grad = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.8);
    grad.addColorStop(0, 'rgba(255,60,60,0)');
    grad.addColorStop(1, `rgba(255,60,60,${a})`);
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
  }

  // DOM overlays

  private updateDom(): void {
    const game = this.game;
    // the SI watermark sits just under the minimap
    const map = this.minimapRect;
    this.siMark.style.top = `${(map.y + map.h + 3) * game.hudScale}px`;
    this.siMark.style.left = `${map.x * game.hudScale}px`;
    this.siMark.classList.toggle('hidden', this.bigMap);
    // only the current mission step (keeps the screen calm)
    const mm = game.missions;
    const m = mm.active;
    const key =
      `${touch.active}|` +
      (m
        ? `${m.id}|${m.objectives.map((o) => `${mm.value(o)}`).join(',')}`
        : `b|${mm.bounties.map((b) => `${b.id}${b.have}`).join(',')}`);
    if (key !== this.trackerKey) {
      this.trackerKey = key;
      this.tracker.innerHTML = '';
      if (m) {
        const cur = mm.currentObjective();
        const idx = cur ? m.objectives.indexOf(cur) : m.objectives.length - 1;
        this.tracker.appendChild(el('div', 'tr-title', `MISSION ${m.id} · ${m.title}`));
        if (cur) {
          const n = cur.count ?? 1;
          this.tracker.appendChild(
            el('div', 'tr-obj cur', `▶ ${forTouch(cur.text)}${n > 1 ? ` (${Math.floor(mm.value(cur))}/${n})` : ''}`),
          );
        }
        this.tracker.appendChild(el('div', 'tr-step', `Step ${idx + 1} of ${m.objectives.length}`));
      } else if (mm.bounties.length) {
        this.tracker.appendChild(el('div', 'tr-title', '★ BONUS JOBS'));
        for (const b of mm.bounties)
          this.tracker.appendChild(
            el('div', `tr-obj ${b.have >= b.need ? 'done' : ''}`, `★ ${b.text} ${Math.floor(b.have)}/${b.need}`),
          );
      }
    }
    this.tracker.classList.toggle(
      'hidden',
      this.bigMap || game.ui.dialogue.active || this.tracker.childElementCount === 0,
    );
    // "[E] …" prompt next to whatever you can use
    const it = game.focus;
    if (it && !game.ui.blocking && !this.bigMap) {
      this.prompt.classList.remove('hidden');
      this.prompt.textContent = `${touch.active ? '[USE]' : '[E]'} ${it.label}`;
      const x = (it.x - game.camX) * game.scale;
      const y = (it.y - game.camY) * game.scale;
      const w = this.prompt.offsetWidth;
      this.prompt.style.transform = `translate(${Math.max(6, Math.min(window.innerWidth - w - 6, x - w / 2))}px, ${Math.max(50, y - 40)}px)`;
    } else this.prompt.classList.add('hidden');
    // tool hint above the hotbar for a moment after switching tools
    if (this.toolHintT > 0 && !game.rover.driving && !game.ui.blocking) {
      const t = TOOLS[game.player.hotbar];
      const extra = t.id === 'seeds' ? `: ${CROPS[game.player.seed].name}` : t.uses ? ` (${ITEMS[t.uses].name})` : '';
      this.toolHint.textContent = `${t.name}${extra}: ${forTouch(t.hint)}`;
      this.toolHint.classList.remove('hidden');
      this.toolHint.style.bottom = `${30 * game.hudScale}px`;
    } else this.toolHint.classList.add('hidden');
    // flashing warning banner: the most important problem first
    const top = this.alerts[0];
    const aKey = top ? `${top.id}|${top.level}|${top.text}|${this.alerts.length}|${touch.active}` : '';
    if (aKey !== this.alertKey) {
      this.alertKey = aKey;
      if (top) {
        this.banner.className = `banner ${top.level}`;
        this.banner.replaceChildren(
          icon(top.icon, 2),
          document.createTextNode(forTouch(top.text) + (this.alerts.length > 1 ? `  +${this.alerts.length - 1}` : '')),
        );
      } else this.banner.className = 'banner hidden';
    }
    this.banner.classList.toggle('hidden', !top || game.ui.blocking || this.bigMap);
  }
}
