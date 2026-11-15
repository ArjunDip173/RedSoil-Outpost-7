/**
 * The outpost's life-support maths and engineering trade-offs.
 *
 *  POWER  solar panels (sunlight × cleanliness × dust-storm haze) + optional Kilopower reactor
 *         → battery bank → Life Support (always on) + 4 switchable systems.
 *         If the battery runs flat, systems shut down in priority order (brown-out).
 *  WATER  ice → Ice Melter → tank. A WATER VALVE splits the pump flow between
 *         the O2 Maker (electrolysis: water → oxygen) and crop IRRIGATION.
 *  AIR    O2 from electrolysis + Spirulina algae + plants; breathed by the crew; refills suits.
 *  FOOD   harvested crops + algae; eaten by the crew.
 */
import {
  ALGAE_FOOD_PER_LEVEL,
  ALGAE_O2_PER_LEVEL,
  ALGAE_WATER_PER_LEVEL,
  BASE_FOOD_START,
  BASE_O2_START,
  BASE_WATER_CAP,
  BASE_WATER_START,
  BATTERY_BASE_KWH,
  BATTERY_START_KWH,
  BATTERY_UPGRADE_KWH,
  BED_WATER_NEED,
  BULKY_ITEMS,
  CREW_FOOD_USE,
  CREW_O2_USE,
  CREW_WATER_USE,
  CROPS,
  ELECTROLYSIS_WATER_PER_LEVEL,
  HOURS_PER_SECOND,
  ITEMS,
  KILOPOWER_KW,
  LIFE_SUPPORT_KW,
  MAX_POWER_LEVEL,
  MELT_ICE_PER_LEVEL,
  O2_PER_LITRE,
  PANEL_PEAK_KW,
  POWER_SYSTEMS,
  PUMP_FLOW,
  RECIPES,
  type RecipeDef,
  WATER_PER_ICE,
} from '../config';
import type { Game } from '../Game';
import type { CropId, Inventory, ItemId, PowerSystemId, ResourceSave } from '../types';

export interface Bed {
  crop: CropId | null;
  growth: number;
  water: number;
}

/** Which systems switch off first when the battery is flat. */
const SHED_ORDER: PowerSystemId[] = ['electrolysis', 'melter', 'algae', 'greenhouse'];

export class ResourceManager {
  o2 = BASE_O2_START;
  water = BASE_WATER_START;
  food = BASE_FOOD_START;
  battery = BATTERY_START_KWH;
  storage: Inventory = { regolith: 2, seed_lettuce: 3, seed_tomato: 1, seed_pepper: 1 };
  power: Record<PowerSystemId, number> = { greenhouse: 0, electrolysis: 1, melter: 0, algae: 0 };
  valve = 0.6; // share of water flow sent to the O2 maker
  /** Semi-auto power: kids flip switches, the base computer picks the power levels. */
  autoPower = true;
  switches: Record<PowerSystemId, boolean> = { greenhouse: false, electrolysis: true, melter: false, algae: false };
  /** Short explanation per machine for the Base Ops screen ("Waiting for ice", "Saving power"...). */
  autoReason: Record<PowerSystemId, string> = { greenhouse: 'Off', electrolysis: 'Starting…', melter: 'Off', algae: 'Off' };
  private autoT = 0;
  upgrades: Record<string, number> = {};
  beds: Bed[] = Array.from({ length: 6 }, () => ({ crop: null, growth: 0, water: 0.5 }));
  algae = 0.3;
  meltBuffer = 0;

  // live readouts
  gen = 0;
  demand = 0;
  net = 0;
  solarKw = 0;
  shed = new Set<PowerSystemId>();
  backupPower = false;
  flows = { electroWater: 0, irrigation: 0, algaeWater: 0, o2In: 0, o2Out: 0, foodIn: 0, waterIn: 0 };
  private candleSol = -1;
  private game: Game;

  constructor(game: Game) {
    this.game = game;
  }

  get batteryMax(): number {
    return BATTERY_BASE_KWH + (this.upgrades.battery ?? 0) * BATTERY_UPGRADE_KWH;
  }
  get batteryPct(): number {
    return (this.battery / this.batteryMax) * 100;
  }

  /** Level a system is actually running at (0 if the PDU is broken or it was shed). */
  effectiveLevel(id: PowerSystemId): number {
    if (this.game.objects.pduBroken) return 0;
    return this.shed.has(id) ? 0 : this.power[id];
  }

  systemKw(id: PowerSystemId, level = this.power[id]): number {
    return (POWER_SYSTEMS.find((p) => p.id === id)?.kwPerLevel ?? 0) * level;
  }

  setPower(id: PowerSystemId, level: number): void {
    this.power[id] = Math.max(0, Math.min(3, level));
    this.shed.delete(id);
  }

  /** Is this machine switched on (auto mode) / given power (manual mode)? */
  isOn(id: PowerSystemId): boolean {
    return this.autoPower ? this.switches[id] : this.power[id] >= 1;
  }

  setSwitch(id: PowerSystemId, on: boolean): void {
    this.switches[id] = on;
    if (!this.autoPower) this.setPower(id, on ? Math.max(1, this.power[id]) : 0);
    else this.autoBalance(true);
  }

  setAutoPower(on: boolean): void {
    this.autoPower = on;
    if (on) {
      for (const sys of POWER_SYSTEMS) if (this.power[sys.id] > 0) this.switches[sys.id] = true;
      this.autoBalance(true);
    }
  }

  /**
   * The base computer shares out the power: machines that are switched ON and have
   * something to do get power in priority order, as much as the Sun (and a healthy
   * battery) allows. At night or on a low battery it turns things down by itself.
   */
  autoBalance(instant = false): void {
    const ids: PowerSystemId[] = ['greenhouse', 'electrolysis', 'melter', 'algae'];
    if (this.game.objects.pduBroken) {
      for (const id of ids) {
        this.power[id] = 0;
        this.autoReason[id] = 'No power: fix the PDU';
      }
      return;
    }
    const growing = this.beds.some((b) => b.crop && b.growth < 1);
    const ice = this.storage.ice ?? 0;
    const need: Record<PowerSystemId, string | null> = {
      electrolysis: this.water <= 2 ? 'Needs water' : this.o2 >= 97 ? 'Air tank full' : null,
      melter: ice <= 0 ? 'Waiting for ice' : this.water >= BASE_WATER_CAP - WATER_PER_ICE ? 'Water tank full' : null,
      greenhouse: growing ? null : 'No plants growing',
      algae: this.water <= 1 ? 'Needs water' : null,
    };
    const pct = this.batteryPct;
    let budget = this.computeSolar() + (this.upgrades.kilopower ? KILOPOWER_KW : 0) - LIFE_SUPPORT_KW;
    budget += pct > 60 ? 4 : pct > 35 ? 1.5 : pct > 15 ? 0 : -0.5;
    const order: PowerSystemId[] = this.o2 < 40 ? ['electrolysis', 'greenhouse', 'melter', 'algae'] : ['greenhouse', 'electrolysis', 'melter', 'algae'];
    const target: Record<PowerSystemId, number> = { greenhouse: 0, electrolysis: 0, melter: 0, algae: 0 };
    for (let level = 1; level <= MAX_POWER_LEVEL; level++) {
      for (const id of order) {
        if (!this.switches[id] || need[id] || target[id] !== level - 1) continue;
        const kw = this.systemKw(id, 1);
        if (budget >= kw - 0.01) {
          target[id] = level;
          budget -= kw;
        }
      }
    }
    for (const id of ids) {
      const cur = this.power[id];
      const next = instant ? target[id] : cur + Math.sign(target[id] - cur);
      this.power[id] = next;
      if (next > 0) this.shed.delete(id);
      this.autoReason[id] = !this.switches[id]
        ? 'Off'
        : need[id] ?? (target[id] === 0 ? 'Saving power' : target[id] === 3 ? 'Full speed' : target[id] === 2 ? 'Running' : 'Running slowly');
    }
  }

  computeSolar(): number {
    const g = this.game;
    const sun = g.weather.sun;
    const haze = 1 - 0.78 * g.weather.stormIntensity;
    let kw = 0;
    for (const p of g.objects.panels) if (!p.broken) kw += PANEL_PEAK_KW * sun * (1 - 0.85 * p.dust) * haze;
    return kw;
  }

  update(dt: number): void {
    // auto power is always on unless an older player switched on Expert power in Settings
    if (!this.game.settings.expertPower && !this.autoPower) this.setAutoPower(true);
    const g = this.game;
    if (this.autoPower) {
      this.autoT -= dt;
      if (this.autoT <= 0) {
        this.autoT = 1;
        this.autoBalance();
      }
    }
    // ── power ──
    this.solarKw = this.computeSolar();
    this.gen = this.solarKw + (this.upgrades.kilopower ? KILOPOWER_KW : 0);
    const pduOk = !g.objects.pduBroken;
    const demandOf = () => {
      let d = LIFE_SUPPORT_KW;
      if (pduOk) for (const s of POWER_SYSTEMS) if (!this.shed.has(s.id)) d += this.systemKw(s.id);
      return d;
    };
    let demand = demandOf();
    if (this.battery <= 0.01 && demand > this.gen) {
      for (const id of SHED_ORDER) {
        if (demand <= this.gen) break;
        if (this.power[id] > 0 && !this.shed.has(id)) {
          this.shed.add(id);
          demand = demandOf();
          g.hint(`shed_${id}`, `Battery empty! I switched off the ${POWER_SYSTEMS.find((p) => p.id === id)!.name} to save power.`, 'alert', 40, 2);
        }
      }
    } else if (this.shed.size && this.battery > this.batteryMax * 0.08) {
      this.shed.clear();
      demand = demandOf();
    }
    this.demand = demand;
    this.net = this.gen - demand;
    this.battery = Math.max(0, Math.min(this.batteryMax, this.battery + this.net * HOURS_PER_SECOND * dt));
    this.backupPower = this.battery <= 0.01 && this.gen < LIFE_SUPPORT_KW;

    // ── water flows ──
    const lvlE = this.effectiveLevel('electrolysis');
    const lvlA = this.effectiveLevel('algae');
    const lvlM = this.effectiveLevel('melter');
    const lvlG = this.effectiveLevel('greenhouse');
    const growing = this.beds.filter((b) => b.crop && b.growth < 1).length;
    const hasWater = this.water > 0.01;
    let electro = hasWater ? Math.min(PUMP_FLOW * this.valve, lvlE * ELECTROLYSIS_WATER_PER_LEVEL) : 0;
    let irrig = hasWater ? Math.min(PUMP_FLOW * (1 - this.valve), growing * BED_WATER_NEED * 1.3) : 0;
    let algaeW = hasWater ? lvlA * ALGAE_WATER_PER_LEVEL : 0;
    const want = (electro + irrig + algaeW + CREW_WATER_USE) * dt;
    if (want > this.water && want > 0) {
      const k = this.water / want;
      electro *= k;
      irrig *= k;
      algaeW *= k;
    }
    this.water = Math.max(0, this.water - (electro + irrig + algaeW + CREW_WATER_USE) * dt);
    this.flows.electroWater = electro;
    this.flows.irrigation = irrig;
    this.flows.algaeWater = algaeW;

    // ── oxygen & food ──
    const o2Electro = electro * O2_PER_LITRE;
    const algaeTarget = lvlA > 0 && hasWater ? 0.35 + (lvlA / 3) * 0.65 : 0.08;
    this.algae += (algaeTarget - this.algae) * dt * 0.03;
    const o2Algae = ALGAE_O2_PER_LEVEL * lvlA * this.algae;
    const o2Plants = growing * 0.003 * (lvlG > 0 ? 1 : 0.4);
    const foodAlgae = ALGAE_FOOD_PER_LEVEL * lvlA * this.algae;
    this.flows.o2In = o2Electro + o2Algae + o2Plants;
    this.flows.o2Out = CREW_O2_USE;
    this.flows.foodIn = foodAlgae;
    this.o2 = Math.min(100, this.o2 + (this.flows.o2In - CREW_O2_USE) * dt);
    this.food = Math.max(0, Math.min(80, this.food + (foodAlgae - CREW_FOOD_USE) * dt));

    // ── ice melter ──
    this.flows.waterIn = 0;
    if (lvlM > 0 && (this.storage.ice ?? 0) > 0 && this.water < BASE_WATER_CAP) {
      this.meltBuffer += MELT_ICE_PER_LEVEL * lvlM * dt;
      this.flows.waterIn = MELT_ICE_PER_LEVEL * lvlM * WATER_PER_ICE;
      while (this.meltBuffer >= 1 && (this.storage.ice ?? 0) > 0) {
        this.meltBuffer -= 1;
        this.storage.ice = (this.storage.ice ?? 0) - 1;
        this.water = Math.min(BASE_WATER_CAP, this.water + WATER_PER_ICE);
        g.emit('water_made', WATER_PER_ICE);
        if (g.player.inBase && Math.abs(g.player.cx - (g.base.interior.x + 350)) < 200 && Math.random() < 0.5) g.audio.splash();
      }
    } else this.meltBuffer = 0;

    // ── crops ──
    const skylight = g.weather.sun * 0.22;
    const light = skylight + (lvlG / 3) * 0.85;
    const perBed = growing > 0 ? irrig / growing : 0;
    for (const b of this.beds) {
      if (!b.crop) continue;
      if (b.growth < 1) {
        b.water = Math.max(0, Math.min(1, b.water + (perBed / BED_WATER_NEED - 0.9) * dt * 0.08));
        // no long waits during training: faster growth and a little light even on a weak battery
        const training = this.game.missions.activeId() <= 6;
        const thirst = b.water > 0.25 ? 1 : training ? 0.5 : 0.15;
        const boost = training ? 4 : 1;
        const lit = training ? Math.max(light, 0.6) : light;
        b.growth = Math.min(1, b.growth + (lit * thirst * boost * dt) / CROPS[b.crop].growSeconds);
      }
    }

    // ── safety nets (kid-friendly) ──
    if (this.o2 <= 4 && this.candleSol !== g.weather.sol) {
      this.candleSol = g.weather.sol;
      this.o2 += 25;
      g.toast('Emergency oxygen candles lit: +25% base O2', '#7fe3ff', 'icon_o2');
      g.luna.say('Phew! I lit our emergency oxygen candles. The ISS carries these too! Now let\'s make more O2 with the O2 Maker.', 'alert', 3);
      g.unlockFact('o2_candles');
    }
    this.o2 = Math.max(0, this.o2);
    if (this.o2 < 25) g.hint('o2low', 'Base air is getting low! Switch ON the O2 Maker in Base Ops and make sure we have water.', 'alert', 45, 2);
    if (this.batteryPct < 15 && this.net < 0) g.hint('battlow', 'Battery low! Brush the solar panels clean, or switch some machines OFF in Base Ops.', 'alert', 50, 2);
    if (this.water < 3 && (lvlE > 0 || growing > 0)) g.hint('waterlow', "We're almost out of water! Mine ice and turn on the Ice Melter.", 'alert', 60, 2);
    if (this.food < 2) g.hint('foodlow', 'Food is running low! Harvest crops or turn on the Algae Lab.', 'alert', 70, 1);
  }

  // ───────────────────────── storage helpers ─────────────────────────

  /** Items available from storage + backpack. */
  have(id: ItemId): number {
    return (this.storage[id] ?? 0) + (this.game.player.pack[id] ?? 0);
  }

  /** Take from storage first, then the backpack. */
  takeAny(id: ItemId, n: number): boolean {
    if (this.have(id) < n) return false;
    const fromStore = Math.min(n, this.storage[id] ?? 0);
    this.storage[id] = (this.storage[id] ?? 0) - fromStore;
    const rest = n - fromStore;
    if (rest > 0) this.game.player.take(id, rest);
    return true;
  }

  addStorage(inv: Inventory): void {
    for (const [id, n] of Object.entries(inv) as [ItemId, number][]) if (n) this.storage[id] = (this.storage[id] ?? 0) + n;
  }

  /** Move a bag of items into base storage (fires delivery events). */
  deposit(inv: Inventory, from: string): number {
    let total = 0;
    for (const [id, n] of Object.entries(inv) as [ItemId, number][]) {
      if (!n || n <= 0) continue;
      this.storage[id] = (this.storage[id] ?? 0) + n;
      total += n;
      if (id === 'ice') this.game.emit('deposit_ice', n);
      inv[id] = 0;
    }
    if (total > 0) {
      this.game.toast(`Unloaded ${total} items from your ${from} into base storage`, '#ffd166', 'icon_regolith');
      this.game.audio.pickup();
    }
    return total;
  }

  /** Unload the backpack (keeps bricks, meal packs and antenna parts). */
  depositPack(): void {
    const p = this.game.player;
    const bag: Inventory = {};
    for (const id of BULKY_ITEMS) {
      if (id === 'brick') continue;
      if (p.pack[id]) {
        bag[id] = p.pack[id];
        p.pack[id] = 0;
      }
    }
    if (p.pack.meteorite) {
      bag.meteorite = p.pack.meteorite;
      p.pack.meteorite = 0;
    }
    this.deposit(bag, 'backpack');
  }

  // ───────────────────────── fabricator ─────────────────────────

  recipeState(r: RecipeDef): { built: number; canAfford: boolean; locked: boolean; maxed: boolean } {
    const built = this.upgrades[r.id] ?? 0;
    const locked = !!r.requiresMission && this.game.missions.completedCount() < r.requiresMission;
    const maxed = r.id === 'solar_panel' ? this.game.objects.panels.length >= 10 : built >= r.max;
    let canAfford = true;
    for (const [id, n] of Object.entries(r.cost) as [ItemId, number][]) if (this.have(id) < n) canAfford = false;
    return { built, canAfford, locked, maxed };
  }

  craft(id: string): boolean {
    const g = this.game;
    const r = RECIPES.find((x) => x.id === id);
    if (!r) return false;
    const st = this.recipeState(r);
    if (st.locked || st.maxed || !st.canAfford) {
      g.audio.error();
      return false;
    }
    for (const [item, n] of Object.entries(r.cost) as [ItemId, number][]) this.takeAny(item, n);
    this.upgrades[r.id] = (this.upgrades[r.id] ?? 0) + 1;
    const p = g.player;
    switch (r.id) {
      case 'brick': {
        const fit = p.addItem('brick', 4);
        if (fit < 4) this.storage.brick = (this.storage.brick ?? 0) + (4 - fit);
        g.emit('craft_brick', 4);
        break;
      }
      case 'solar_panel':
        g.objects.addPanel(0);
        break;
      case 'battery':
        this.battery += 10;
        break;
      case 'o2_tank':
        p.o2Max = 150;
        p.o2 = 150;
        break;
      case 'jet_booster':
        p.jetMax = 150;
        p.sprintBoost = 1.25;
        break;
      case 'laser_upgrade':
        p.laserPower = 1.6;
        break;
      case 'rover_battery':
        g.rover.drainMul = 0.62;
        break;
      case 'kilopower':
        break;
    }
    g.emit('craft');
    g.audio.craft();
    g.toast(`Built: ${r.name}`, '#5fd068', r.icon);
    if (r.id !== 'brick' || (this.upgrades.brick ?? 0) === 1) g.luna.say(r.fact, 'wow', 0);
    return true;
  }

  /** Re-apply upgrade effects after loading a save. */
  applyUpgrades(): void {
    const g = this.game;
    if (this.upgrades.o2_tank) g.player.o2Max = 150;
    if (this.upgrades.jet_booster) {
      g.player.jetMax = 150;
      g.player.sprintBoost = 1.25;
    }
    if (this.upgrades.laser_upgrade) g.player.laserPower = 1.6;
    if (this.upgrades.rover_battery) g.rover.drainMul = 0.62;
  }

  // ───────────────────────── greenhouse ─────────────────────────

  plant(k: number, crop: CropId): boolean {
    const bed = this.beds[k];
    if (bed.crop) return false;
    const seed = CROPS[crop].seedItem;
    if (!this.takeAny(seed, 1)) return false;
    bed.crop = crop;
    bed.growth = 0;
    bed.water = Math.max(bed.water, 0.4);
    return true;
  }

  harvest(k: number): number {
    const bed = this.beds[k];
    if (!bed.crop || bed.growth < 1) return 0;
    const def = CROPS[bed.crop];
    this.food += def.meals;
    const seeds = def.seedsBack[0] + Math.floor(Math.random() * (def.seedsBack[1] - def.seedsBack[0] + 1));
    this.storage[def.seedItem] = (this.storage[def.seedItem] ?? 0) + seeds;
    bed.crop = null;
    bed.growth = 0;
    return seeds;
  }

  storageList(): { id: ItemId; n: number; name: string; icon: string }[] {
    return (Object.keys(ITEMS) as ItemId[])
      .filter((id) => (this.storage[id] ?? 0) > 0)
      .map((id) => ({ id, n: this.storage[id] ?? 0, name: ITEMS[id].name, icon: ITEMS[id].icon }));
  }

  serialize(): ResourceSave {
    return {
      o2: this.o2,
      water: this.water,
      food: this.food,
      battery: this.battery,
      storage: { ...this.storage },
      power: { ...this.power },
      valve: this.valve,
      autoPower: this.autoPower,
      switches: { ...this.switches },
      upgrades: { ...this.upgrades },
      beds: this.beds.map((b) => ({ ...b })),
      algae: this.algae,
      meltBuffer: this.meltBuffer,
    };
  }

  load(s: ResourceSave): void {
    this.o2 = s.o2;
    this.water = s.water;
    this.food = s.food;
    this.battery = s.battery;
    this.storage = { ...s.storage };
    this.power = { ...s.power };
    this.valve = s.valve;
    if (s.autoPower !== undefined) this.autoPower = s.autoPower;
    if (s.switches) this.switches = { ...s.switches };
    this.upgrades = { ...s.upgrades };
    this.beds = s.beds.map((b) => ({ ...b }));
    this.algae = s.algae;
    this.meltBuffer = s.meltBuffer;
  }
}
