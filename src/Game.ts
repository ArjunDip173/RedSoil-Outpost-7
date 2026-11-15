/**
 * One play session on Mars. Owns the world, entities and systems,
 * runs the fixed update order, routes events to missions, and draws each frame.
 */
import {
  BADGES,
  BULKY_ITEMS,
  CROPS,
  G,
  GROUND_INFO,
  ITEMS,
  OBJ_INFO,
  ROVER_DRAIN,
  ROVER_MAX_SPEED,
  SOL_DOSE_BUDGET,
  SOL_SECONDS,
  SAVE_VERSION,
  SUIT_O2_DRAIN,
  SUIT_O2_EXERTION,
  SUIT_REFILL_COST,
  TILE,
  TOOLS,
  WALK_SPEED,
} from './config';
import type { AudioEngine } from './core/AudioEngine';
import type { InputManager } from './core/InputManager';
import { type Ctx } from './core/canvas';
import { type Sprites } from './core/Sprites';
import { touch } from './core/touch';
import type { StorageManager } from './core/StorageManager';
import { LunaDrone } from './entities/LunaDrone';
import { Player } from './entities/Player';
import { Rover } from './entities/Rover';
import { Lighting } from './systems/Lighting';
import { MissionManager } from './systems/MissionManager';
import { ParticleSystem } from './systems/ParticleSystem';
import { Guide, type GuideTarget } from './systems/Guide';
import { ResourceManager } from './systems/ResourceManager';
import { type ChatTurn, type GameContext, LunaAI } from './systems/LunaAI';
import { WeatherSystem } from './systems/WeatherSystem';
import type {
  CropId,
  DialogueLine,
  GameData,
  Interactable,
  LunaMood,
  Profile,
  SaveData,
  ScienceLogState,
  Settings,
  Stats,
} from './types';
import { openAirlockModal } from './ui/AirlockModal';
import { openDishAlign } from './ui/DishAlignModal';
import type { ModalStack } from './ui/Dom';
import { type CertificateInfo, type EvacCause, showEarthContact, showMedEvac } from './ui/GraduationModal';
import { Hud } from './ui/Hud';
import { UIManager } from './ui/UIManager';
import { openWiring } from './ui/WiringMiniGame';
import { BaseHabitat, type Drawable, SPOTS } from './world/BaseHabitat';
import { type DigResult, TileMap } from './world/TileMap';
import { panelCenter, type Pickup, type SampleSpot, type SolarPanel, WorldObjects } from './world/WorldObjects';

export interface GameDeps {
  /** World view (zoomed in). */
  ctx: Ctx;
  /** HUD layer (less zoomed, transparent). */
  hudCtx: Ctx;
  art: Sprites;
  audio: AudioEngine;
  input: InputManager;
  storage: StorageManager;
  data: GameData;
  profile: Profile;
  settings: Settings;
  root: HTMLElement;
  stack: ModalStack;
  onQuit: () => void;
  onLoadRequest: () => void;
}

export interface FocusInfo {
  label: string;
  x: number;
  y: number;
  act: () => void;
}

export function newStats(): Stats {
  return {
    iceMined: 0,
    tilesDug: 0,
    cropsHarvested: 0,
    panelsCleaned: 0,
    samplesFound: 0,
    distanceDriven: 0,
    jetSeconds: 0,
    deepest: 0,
    flagsPlanted: 0,
    medEvacs: 0,
    flaresSurvived: 0,
    stormsSurvived: 0,
    meteoritesFound: 0,
    bountiesDone: 0,
    quizzesRight: 0,
  };
}

const MORNING_TIPS = [
  'Good morning! Dust settles on the panels every day. Give them a brush to keep the power up.',
  'Rise and shine! Check Base Ops: is the battery charging now that the Sun is up?',
  'New Sol, new science! Sparkly rocks are hiding out there. Brush them for the Science Log.',
  'Morning! Remember: the rover refills your suit O2, so take it on long trips.',
];

/** Names shown on the guide beacon and the screen-edge arrow. */
const TARGET_LABEL: Record<string, string> = {
  airlock: 'AIRLOCK',
  airlock_out: 'AIRLOCK',
  panels: 'SOLAR PANELS',
  pdu: 'POWER UNIT',
  console: 'MISSION CONSOLE',
  melter: 'ICE MELTER',
  fabricator: 'FABRICATOR',
  beds: 'GREENHOUSE',
  shelter: 'STORM SHELTER',
  shelter_roof: 'SHIELD WALL',
  ice: 'BURIED ICE',
  rover: 'ROVER',
  antenna: 'ANTENNA',
  nearest_part: 'ANTENNA PART',
};

export class Game {
  vw = 640;
  vh = 360;
  /** World pixels → screen pixels. */
  scale = 4;
  /** HUD layer size and scale. */
  hw = 720;
  hh = 450;
  hudScale = 2;
  g: Ctx;
  hg: Ctx;
  art: Sprites;
  audio: AudioEngine;
  input: InputManager;
  storage: StorageManager;
  data: GameData;
  profile: Profile;
  settings: Settings;
  science: ScienceLogState;
  stats: Stats = newStats();

  map: TileMap;
  base: BaseHabitat;
  objects: WorldObjects;
  player: Player;
  rover: Rover;
  luna: LunaDrone;
  res: ResourceManager;
  missions: MissionManager;
  weather: WeatherSystem;
  particles = new ParticleSystem();
  lighting = new Lighting();
  hud: Hud;
  /** Where to go next: the goal and a walkable route to it. */
  guide: Guide;
  ui: UIManager;
  /** "Ask LUNA" chat (AI server or offline answers). */
  lunaAI: LunaAI;
  lunaChat: ChatTurn[] = [];
  lunaLog: { who: 'you' | 'luna'; text: string; note?: string; source?: 'ai' | 'offline' }[] = [];
  minimap: HTMLCanvasElement;

  camX = 0;
  camY = 0;
  time = 0;
  focus: FocusInfo | null = null;
  private interactCache: Interactable[] = [];
  private interactAge = 99;
  private scanCooldown = 0;
  private badgeT = 0;
  private iceCache: { x: number; y: number } | null = null;
  private iceCacheT = 0;
  private evacuating = false;
  get evacuatingNow(): boolean {
    return this.evacuating;
  }
  private fadeEl: HTMLDivElement;
  private onQuit: () => void;
  private onLoadRequest: () => void;

  constructor(d: GameDeps) {
    this.g = d.ctx;
    this.hg = d.hudCtx;
    this.art = d.art;
    this.audio = d.audio;
    this.input = d.input;
    this.storage = d.storage;
    this.data = d.data;
    this.profile = d.profile;
    this.settings = d.settings;
    this.onQuit = d.onQuit;
    this.onLoadRequest = d.onLoadRequest;
    this.science = d.storage.loadScience();

    this.map = new TileMap();
    BaseHabitat.build(this.map);
    this.base = new BaseHabitat(this);
    this.objects = new WorldObjects(this);
    this.player = new Player(this);
    this.rover = new Rover(this);
    this.res = new ResourceManager(this);
    this.missions = new MissionManager(this);
    this.weather = new WeatherSystem(this);
    this.guide = new Guide(this);
    this.ui = new UIManager(this, d.root, d.stack);
    this.hud = new Hud(this, d.root);
    this.luna = new LunaDrone(this, d.root);
    this.minimap = this.map.bakeMinimap();
    this.lunaAI = new LunaAI(this.settings, this.data.facts);
    this.fadeEl = document.createElement('div');
    this.fadeEl.className = 'fade';
    d.root.appendChild(this.fadeEl);
  }

  destroy(): void {
    this.hud.destroy();
    this.luna.destroy();
    this.ui.dialogue.destroy();
    this.ui.stack.closeAll();
    this.audio.stopAllLoops();
    this.fadeEl.remove();
  }

  get dialogueActive(): boolean {
    return this.ui.dialogue.active;
  }

  resize(vw: number, vh: number, scale: number, hw: number, hh: number, hudScale: number): void {
    this.vw = vw;
    this.vh = vh;
    this.scale = scale;
    this.hw = hw;
    this.hh = hh;
    this.hudScale = hudScale;
    this.snapCamera();
  }

  /** Inside the habitat the outside world is blacked out. */
  get blackout(): boolean {
    return this.player.inBase && !this.rover.driving;
  }

  // Session start

  startNew(): void {
    this.player.inBase = true;
    this.player.placeAt(SPOTS.medbay.x, SPOTS.medbay.y);
    this.player.dir = 'down';
    this.snapCamera();
    this.dialogue(this.data.missions.intro, () => {
      this.unlockFact('sol', true);
      this.unlockFact('gravity', true);
      this.missions.begin(true);
    });
  }

  loadSave(s: SaveData): void {
    this.map.applyChanges(s.world.tiles);
    this.minimap = this.map.bakeMinimap();
    this.objects.load(s.world);
    this.player.load(s.player);
    this.rover.load(s.rover);
    this.res.load(s.res);
    this.res.applyUpgrades();
    this.weather.load(s.weather);
    this.missions.load(s.mission);
    this.stats = { ...newStats(), ...s.stats };
    this.luna.factsShared = s.luna.factsShared.slice();
    this.luna.seen = new Set(s.luna.seen ?? []);
    this.snapCamera();
    this.missions.begin(false);
    const next = this.missions.currentObjective();
    setTimeout(
      () =>
        this.luna.say(
          `Welcome back, ${this.profile.name}! ${next ? `Next step: ${next.text}.` : 'Mission Control has bonus jobs for us!'}`,
          'happy',
          1,
        ),
      600,
    );
  }

  serialize(label: string): SaveData {
    return {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      label,
      profile: { ...this.profile },
      player: this.player.serialize(),
      rover: this.rover.serialize(),
      res: this.res.serialize(),
      weather: this.weather.serialize(),
      mission: this.missions.serialize(),
      world: { tiles: this.map.serializeChanges(), shelterSlots: [], ...this.objects.serialize() },
      stats: { ...this.stats },
      luna: { factsShared: this.luna.factsShared.slice(), seen: [...this.luna.seen] },
    };
  }

  save(slot: 'auto' | 'manual'): boolean {
    if (this.rover.driving) this.rover.exit();
    return this.storage.save(slot, this.serialize(slot === 'auto' ? `Sol ${this.weather.sol}` : 'Manual save'));
  }

  autosave(label = 'Autosave'): void {
    this.storage.save('auto', this.serialize(label));
  }

  requestLoad(): void {
    this.onLoadRequest();
  }

  saveScience(): void {
    this.storage.saveScience(this.science);
  }

  // Messaging helpers

  toast(text: string, color = '#e8e6df', icon?: string): void {
    this.hud.toast(text, color, icon);
  }

  hint(key: string, text: string, mood: LunaMood = 'think', cooldown = 30, priority = 1): void {
    this.luna.hint(key, text, mood, cooldown, priority);
  }

  emit(event: string, n = 1): void {
    this.missions.emit(event, n);
  }

  dialogue(lines: DialogueLine[], onDone?: () => void): void {
    const name = this.profile.name;
    this.luna.clear();
    this.ui.dialogue.show(
      lines.map((l) => ({ ...l, text: l.text.replace(/\{name\}/g, name) })),
      onDone,
    );
  }

  unlockFact(id: string, silent = false): void {
    if (this.science.facts.includes(id)) return;
    const f = this.data.facts.facts.find((x) => x.id === id);
    if (!f) return;
    this.science.facts.push(id);
    this.saveScience();
    if (!silent && this.settings.lunaChatty)
      this.toast(`Science Log: “${f.title}” (${f.source})`, '#7fe3ff', 'ui_book');
  }

  awardBadge(id: string, silent = false): void {
    if (this.science.badges.includes(id)) return;
    this.science.badges.push(id);
    this.saveScience();
    const b = BADGES.find((x) => x.id === id);
    if (!silent && b) {
      this.toast(`PATCH EARNED: ${b.name}!`, b.color, b.art);
      this.audio.chime();
    }
  }

  checkBadges(): void {
    const s = this.stats;
    const total = this.data.facts.samples.length;
    if (this.science.samples.length >= total) this.awardBadge('badge_geologist');
    if (s.distanceDriven >= 1000) this.awardBadge('badge_driver');
    if (s.tilesDug >= 40) this.awardBadge('badge_deep');
    if (s.meteoritesFound >= 1) this.awardBadge('badge_meteor');
    if (s.jetSeconds >= 60) this.awardBadge('badge_rocket');
    if (s.flagsPlanted >= 5) this.awardBadge('badge_flag');
    if (s.stormsSurvived >= 1) this.awardBadge('badge_storm');
    if (s.quizzesRight >= 5) this.awardBadge('badge_quiz');
    if (s.cropsHarvested >= 10) this.awardBadge('badge_farmer');
  }

  /** What LUNA's AI is told about the game right now (no personal details). */
  aiContext(): GameContext {
    const m = this.missions.active;
    const obj = this.missions.currentObjective();
    const r = this.res;
    return {
      mission: m
        ? `Mission ${m.id} of 6, "${m.title}"`
        : 'All training missions are done; the player is doing bonus jobs',
      objective: obj ? obj.text : 'explore Mars and complete Mission Control bounties',
      status: `Base air ${Math.round(r.o2)}%, water ${Math.round(r.water)} L, food ${Math.floor(r.food)} meals, battery ${Math.round(r.batteryPct)}%. It is ${this.weather.isNight ? 'night' : 'day'} on Sol ${this.weather.sol}. The player is ${this.locationLabel().toLowerCase()}.${touch.active ? ' The player is on a touchscreen (phone or tablet): they walk with the joystick on the left side of the screen, tap the USE button instead of pressing E, hold RUN to sprint, touch and hold a spot to use their tool there, and tap the on-screen buttons instead of keys.' : ''}`,
    };
  }

  /** Where the astronaut is, for the HUD. */
  locationLabel(): string {
    const p = this.player;
    if (p.inBase) return this.base.isInShelter(p.cx, p.cy) ? 'STORM SHELTER' : 'IN HABITAT';
    if (this.rover.driving) return 'DRIVING';
    if (this.map.inCavePx(p.cx, p.cy)) return 'LAVA TUBE';
    const gnd = this.map.getGround(Math.floor(p.cx / TILE), Math.floor(p.cy / TILE));
    if (gnd === G.POLAR) return 'POLAR CAP';
    if (gnd === G.CRATER) return 'CRATER';
    return 'SURFACE';
  }

  minimapDirty(x: number, y: number): void {
    this.map.updateMinimap(this.minimap, x, y);
  }

  fade(cb: () => void): void {
    this.fadeEl.classList.add('on');
    setTimeout(() => {
      cb();
      this.snapCamera();
      this.fadeEl.classList.remove('on');
    }, 260);
  }

  // Interactions

  /** Show the "NEW TOOL!" card for tools that unlock at this mission, and pick the first one. */
  announceNewTools(missionId: number): void {
    const fresh = TOOLS.map((t, i) => ({ t, i })).filter(({ t }) => t.unlock === missionId);
    if (!fresh.length) return;
    this.ui.showNewTools(
      fresh.map(({ t, i }) => ({ name: t.name, icon: t.icon, hint: t.hint, key: i + 1 })),
      () => {
        this.player.hotbar = fresh[0].i;
      },
    );
  }

  /** How many tools are in the bar right now (they unlock one by one with the missions). */
  toolsUnlocked(): number {
    const m = this.missions.activeId();
    return TOOLS.filter((t) => t.unlock <= m).length;
  }

  selectTool(i: number): void {
    if (i >= this.toolsUnlocked()) return;
    const p = this.player;
    if (i === p.hotbar && TOOLS[i].id === 'seeds') p.cycleSeed();
    p.hotbar = i;
    this.audio.blip();
  }

  openPause(): void {
    this.ui.openPause(this.onQuit);
  }

  openAirlock(): void {
    openAirlockModal(this, () => this.fade(() => this.exitBase()));
  }

  exitBase(): void {
    const p = this.player;
    p.inBase = false;
    p.placeAt(SPOTS.airlockOut.x, SPOTS.airlockOut.y);
    p.dir = 'down';
    this.luna.snapTo(p.cx + 20, p.y);
    this.emit('airlock_exit');
    this.hint(
      'firstEva',
      'You are outside on Mars! Your blue O2 ring is in the bottom-left. Come back before it runs out. Hold SHIFT to sprint.',
      'happy',
      99999,
      2,
    );
  }

  enterBase(): void {
    if (this.rover.driving) return;
    this.fade(() => {
      const p = this.player;
      p.inBase = true;
      p.placeAt(SPOTS.airlockIn.x, SPOTS.airlockIn.y - 6);
      p.dir = 'up';
      this.luna.snapTo(p.cx - 20, p.y);
      this.audio.hiss(false);
      this.res.depositPack();
      this.emit('enter_base');
    });
  }

  refillSuitAtStation(silent = false): void {
    const p = this.player;
    const need = p.o2Max - p.o2;
    if (need <= 0.5) {
      if (!silent) this.toast('Suit O2 tank is already full', '#7fe3ff', 'icon_o2');
      return;
    }
    const avail = Math.max(0, this.res.o2 - 5) / SUIT_REFILL_COST;
    const fill = Math.min(need, avail);
    p.o2 += fill;
    this.res.o2 -= fill * SUIT_REFILL_COST;
    this.audio.hiss(false);
    if (fill < need) this.toast('Base air is too low to fill the tank completely!', '#ff9a3a', 'icon_o2');
    else if (!silent)
      this.toast(`Suit O2 refilled (used ${(fill * SUIT_REFILL_COST).toFixed(0)}% base air)`, '#7fe3ff', 'icon_o2');
  }

  private plantBed(k: number, crop: CropId): void {
    const p = this.player;
    p.seed = crop;
    if (!this.res.plant(k, crop)) return;
    const bx = SPOTS.beds[k].x + 16;
    const by = SPOTS.beds[k].y;
    this.emit('plant');
    this.audio.place();
    this.particles.burst(bx, by, 8, '#7ad35a', 40);
    this.toast(`Planted ${CROPS[crop].name}`, '#5fd068', `icon_seed_${crop}`);
    this.hint(`crop_${crop}`, CROPS[crop].note, 'think', 99999, 0);
  }

  useBed(k: number): void {
    const res = this.res;
    const bed = res.beds[k];
    const bx = SPOTS.beds[k].x + 16;
    const by = SPOTS.beds[k].y;
    if (!bed.crop) {
      const have = (Object.keys(CROPS) as (keyof typeof CROPS)[]).filter((c) => res.have(CROPS[c].seedItem) > 0);
      if (!have.length) {
        this.hint('noseeds', 'No seeds left! Harvest ripe crops to get more seeds.', 'think', 8);
        return;
      }
      if (have.length > 1) this.ui.openSeedPicker((crop) => this.plantBed(k, crop));
      else this.plantBed(k, have[0]);
      return;
    }
    if (bed.growth >= 1) {
      const def = CROPS[bed.crop];
      const seeds = res.harvest(k);
      this.emit('harvest');
      this.stats.cropsHarvested++;
      this.audio.harvest();
      this.particles.burst(bx, by, 14, def.color, 60);
      this.particles.floatText(bx, by - 10, `+${def.meals} meals`, '#ffd166');
      this.toast(`Harvested ${def.name}: +${def.meals} meals, +${seeds} seeds`, '#ffd166', 'icon_food');
      this.unlockFact('veggie');
      this.checkBadges();
      return;
    }
    const name = CROPS[bed.crop].name;
    if (bed.water < 0.25)
      this.hint('thirsty', `The ${name} is thirsty! Move the WATER VALVE toward the plants in Base Ops.`, 'alert', 10);
    else if (res.effectiveLevel('greenhouse') === 0)
      this.hint('dark', 'Plants grow slowly without light. Turn on the Greenhouse Lights in Base Ops!', 'think', 10);
    else
      this.toast(
        `${name} is ${Math.floor(bed.growth * 100)}% grown. Keep the water and lights on!`,
        '#9be36a',
        `icon_seed_${bed.crop}`,
      );
  }

  openPduRepair(): void {
    if (!this.objects.pduBroken) {
      this.ui.openBaseOps('power');
      return;
    }
    this.emit('pdu_opened');
    const labels = ['SOLAR IN', 'BATTERY', 'GREENHOUSE', 'O2 MAKER'];
    openWiring(
      this.ui.stack,
      this.audio,
      {
        title: 'PDU REPAIR · POWER DISTRIBUTION UNIT',
        subtitle:
          'The storm jumbled the cables! Drag each plug on the left to the socket with the SAME colour and shape.',
        wires: 4,
        left: labels,
        right: labels,
      },
      () => {
        this.objects.pduBroken = false;
        this.emit('pdu_repaired');
        this.particles.sparks(SPOTS.pdu.x + 9, SPOTS.pdu.y - 14, 20, '#5fd068');
        this.toast('PDU repaired! Power flows again.', '#5fd068', 'icon_power');
        this.luna.say(
          'Brilliant! Now open BASE OPS at the Mission Console and choose which machines get power.',
          'wow',
          2,
        );
        this.unlockFact('power_tradeoff');
      },
    );
  }

  /** Fold every solar panel away (dust storm) or open them again. Returns false if it isn't safe yet. */
  setPanelsFolded(fold: boolean): boolean {
    const panels = this.objects.panels;
    if (!panels.length || panels.every((p) => p.folded === fold)) return true;
    if (!fold && this.weather.storm.active) {
      this.luna.say('Not yet! The storm is still blowing. Open the panels when it is over.', 'alert', 3);
      this.audio.error();
      return false;
    }
    for (const p of panels) p.folded = fold;
    this.audio.hiss(fold);
    if (fold) {
      this.toast('Solar panels folded: safe from the storm', '#7fe3ff', 'icon_solar');
      this.emit('panels_folded');
    } else this.toast('Solar panels open: making power again', '#ffd166', 'icon_solar');
    return true;
  }

  onPanelStormDamage(p: SolarPanel): void {
    const c = panelCenter(p);
    this.particles.sparks(c.x, c.y - 20, 10);
    this.audio.spark();
    this.toast('The storm cracked a solar panel!', '#ff5a5a', 'icon_solar');
    this.luna.hint(
      'stormpanel',
      'Oh no, the wind cracked an open solar panel! Fold the panels before a storm hits next time.',
      'alert',
      30,
      3,
    );
  }

  openPanelRepair(p: SolarPanel): void {
    const labels = ['CELL STRING A', 'CELL STRING B', 'GROUND'];
    const why =
      p.cause === 'storm'
        ? 'The storm wind shook this panel’s wires loose.'
        : 'A meteorite shook this panel’s wires loose.';
    openWiring(
      this.ui.stack,
      this.audio,
      { title: 'SOLAR PANEL REPAIR', subtitle: `${why} Reconnect them!`, wires: 3, left: labels, right: labels },
      () => {
        p.broken = false;
        p.wear = 0;
        p.dust = 0;
        p.shine = 1;
        this.toast('Solar panel repaired!', '#5fd068', 'icon_solar');
        this.emit('panel_repaired');
      },
    );
  }

  antennaPartsHeld(): number {
    return this.player.pack.antenna_part ?? 0;
  }

  useAntenna(): void {
    const a = this.objects.antenna;
    if (a.state === 'online') {
      this.toast('Earth link ONLINE! Mission Control is listening.', '#7fe3ff', 'icon_dish');
      this.unlockFact('dsn');
      return;
    }
    if (this.missions.activeId() !== 6) {
      this.luna.say(
        'This is our Deep Space Antenna. The storm broke it, and we will fix it in Mission 6, once the base is running!',
        'think',
        1,
      );
      return;
    }
    if (a.state === 'broken') {
      if (this.antennaPartsHeld() < 3) {
        this.hint(
          'needparts',
          `We need 3 antenna parts and you have ${this.antennaPartsHeld()}. Follow the glowing yellow path to find the rest!`,
          'think',
          6,
        );
        return;
      }
      const labels = ['POWER', 'AMPLIFIER', 'RECEIVER', 'TRANSMITTER', 'FEED HORN'];
      openWiring(
        this.ui.stack,
        this.audio,
        {
          title: 'DEEP SPACE ANTENNA REPAIR',
          subtitle: 'Install the new parts and reconnect all 5 cables. Match colour + shape!',
          wires: 5,
          left: labels,
          right: labels,
        },
        () => {
          a.state = 'repaired';
          a.partsInstalled = 3;
          this.player.pack.antenna_part = 0;
          this.emit('antenna_repaired');
          this.toast('Antenna repaired! Now point the dish at Earth.', '#5fd068', 'icon_dish');
          this.particles.sparks(a.x, a.y - 40, 24, '#7fe3ff');
        },
      );
      return;
    }
    openDishAlign(this, () => {
      a.state = 'online';
      showEarthContact(this, () => this.emit('earth_contact'));
    });
  }

  readLanderPlaque(): void {
    this.dialogue(
      [
        {
          who: 'LUNA',
          mood: 'think',
          text: 'This old robotic lander explored here long before Outpost 7. Its plaque says it studied the weather and dug for ice, just like NASA’s Phoenix lander did in 2008!',
        },
        {
          who: 'LUNA',
          mood: 'wow',
          text: 'Phoenix carried a weather station built by the Canadian Space Agency. Its laser saw SNOW falling from Martian clouds!',
        },
      ],
      () => {
        this.unlockFact('csa_phoenix_snow');
        this.unlockFact('subsurface_ice', true);
      },
    );
  }

  plantFlag(): void {
    const p = this.player;
    if (p.inBase) {
      this.hint('flagin', 'Flags are for exploring! Plant them outside.', 'think', 8);
      return;
    }
    if (this.objects.flags.some((f) => Math.abs(f.x - p.cx) < 24)) {
      this.hint('flagnear', 'There is already a flag here!', 'think', 5);
      return;
    }
    this.objects.flags.push({ x: Math.round(p.cx + p.facing * 8), y: Math.round(p.y + p.h) });
    this.stats.flagsPlanted++;
    this.audio.place();
    this.particles.dust(p.cx + p.facing * 8, p.y + p.h, 6);
    const baseX = this.base.interior.x + this.base.interior.w / 2;
    if (Math.abs(p.cx - baseX) > 40 * TILE) this.emit('flag');
    this.toast(`Flag planted! (${this.stats.flagsPlanted})`, this.profile.suitColor, 'icon_flag');
    this.checkBadges();
  }

  sleep(): void {
    if (!this.weather.isNight) {
      this.hint('nap', 'It is daytime! You can sleep in the pod once the Sun sets.', 'think', 8);
      return;
    }
    this.fade(() => {
      const w = this.weather;
      const skip = (w.time > 0.5 ? 1 - w.time + 0.29 : 0.29 - w.time) * SOL_SECONDS;
      for (let s = 0; s < skip; s += 1) this.res.update(1);
      const crossed = w.time > 0.5;
      w.time = 0.29;
      this.player.health = 100;
      if (crossed) {
        w.sol++;
        w.solDose = 0;
        this.onNewSol();
      }
      this.luna.say(
        'Good morning! While you slept, the base ran on battery power and the plants kept growing.',
        'happy',
        2,
      );
    });
  }

  // World event hooks

  /** Called when the laser finishes breaking a rock or digging a pit. */
  onDig(tx: number, ty: number, res: DigResult): void {
    if (!res) return;
    this.stats.tilesDug++;
    this.minimapDirty(tx, ty);
    this.audio.mineBreak();
    let drop: keyof typeof ITEMS | undefined;
    let count = 1;
    if (res.kind === 'obj') {
      const info = OBJ_INFO[res.id];
      this.particles.debris(tx * TILE + 8, ty * TILE + 4, info.map, 8);
      drop = info.drop;
      count = info.drops ?? 1;
    } else {
      this.particles.debris(tx * TILE + 8, ty * TILE + 8, GROUND_INFO[res.id].map, 6);
      drop = res.ice ? 'ice' : 'regolith';
      this.emit('dig');
    }
    if (!drop) return;
    const got = this.player.addItem(drop, count);
    if (!got) {
      this.hint(
        'packfull',
        'Backpack full (60 items)! Hop into the rover to store it in the trunk, or walk back into the base to unload.',
        'alert',
        20,
        2,
      );
      return;
    }
    this.particles.floatText(tx * TILE + 8, ty * TILE - 4, `+${got} ${ITEMS[drop].name}`, ITEMS[drop].color);
    if (drop === 'ice') {
      this.stats.iceMined += got;
      this.emit('mine_ice', got);
      if (this.stats.iceMined <= got) {
        this.luna.say(
          'Real Martian ice! NASA found water ice like this hiding just under the soil. Bring it back to the base to melt it.',
          'wow',
          2,
        );
        this.unlockFact('subsurface_ice');
      }
    } else if (drop === 'iron') this.emit('mine_iron', got);
    else if (drop === 'crystal') this.emit('mine_crystal', got);
  }

  onTilePlaced(tx: number, ty: number): void {
    this.minimapDirty(tx, ty);
    this.audio.place();
    this.particles.dust(tx * TILE + 8, ty * TILE + 14, 3);
    if (this.base.shelterSlots.some((s) => s.x === tx && s.y === ty)) {
      const n = this.base.shelterFilled();
      this.toast(`Shelter shield block ${n}/8`, '#ffd84a', 'icon_rad');
      if (n === 8) {
        this.unlockFact('radiation_shield');
        this.luna.say('The shelter roof is complete! Thick regolith and ice block radiation.', 'wow', 2);
      }
    }
  }

  onPanelCleaned(_p: SolarPanel): void {
    this.stats.panelsCleaned++;
    this.emit('panel_cleaned');
    this.audio.chime();
    this.toast('Solar panel clean! More sunlight = more power', '#ffd166', 'icon_solar');
    if (this.stats.panelsCleaned === 1) this.unlockFact('dust_solar');
  }

  collectSample(s: SampleSpot): void {
    s.taken = true;
    const def = this.data.facts.samples.find((d) => d.id === s.id);
    if (!this.science.samples.includes(s.id)) {
      this.science.samples.push(s.id);
      this.saveScience();
    }
    this.stats.samplesFound++;
    this.missions.addXp(40);
    this.emit('sample');
    this.audio.harvest();
    this.particles.burst(s.x + 6, s.y - 4, 12, def?.color ?? '#ffffff', 50);
    this.toast(`Science sample: ${def?.name ?? s.id}!`, '#9be36a', 'icon_crystal');
    if (def) this.luna.say(`${def.name}! ${def.text}`, 'wow', 0);
    this.checkBadges();
  }

  collectPickup(pk: Pickup): void {
    const p = this.player;
    if (pk.kind === 'part') {
      p.pack.antenna_part = (p.pack.antenna_part ?? 0) + 1;
      this.emit('antenna_part');
      this.audio.chime();
      this.particles.burst(pk.x + 7, pk.y + 7, 16, '#ffd166', 60);
      const have = this.antennaPartsHeld();
      this.toast(`Antenna part found! (${have}/3)`, '#ffd166', 'icon_part');
      this.luna.say(
        have >= 3
          ? 'That is all 3 parts! Now head EAST to the Deep Space Antenna on the ridge.'
          : `Antenna part ${have} of 3! Follow the glowing path to the next one.`,
        'wow',
        2,
      );
    } else if (pk.kind === 'meteorite') {
      p.addItem('meteorite', 1);
      this.stats.meteoritesFound++;
      this.missions.addXp(60);
      this.emit('meteorite');
      this.audio.harvest();
      this.toast('You found a meteorite: a rock from space!', '#b9b5c8', 'icon_meteorite');
      this.unlockFact('meteorite');
      this.checkBadges();
    } else {
      p.o2 = Math.min(p.o2Max, p.o2 + 60);
      this.audio.hiss(false);
      this.toast('O2 cache: +60 suit oxygen', '#7fe3ff', 'icon_o2');
    }
  }

  onNewSol(): void {
    this.objects.newSol();
    this.toast(`SOL ${this.weather.sol}: a new Martian day!`, '#ffd166', 'ui_sun');
    this.autosave(`Sol ${this.weather.sol}`);
    if (!this.dialogueActive) this.luna.say(MORNING_TIPS[this.weather.sol % MORNING_TIPS.length], 'happy', 0);
  }

  onFlareEnd(scripted: boolean, shelteredFrac: number, dose: number): void {
    this.missions.flareResult(scripted, shelteredFrac, dose);
    if (!scripted) {
      if (dose < 1.2) {
        this.stats.flaresSurvived++;
        this.luna.say(
          'The flare is over. You hid well and got only a tiny bit of radiation. Great sheltering!',
          'happy',
          2,
        );
      } else
        this.luna.say(
          'The flare is over, but you got too much radiation. Next time, hide in the Storm Shelter!',
          'think',
          2,
        );
      this.unlockFact('flare_classes');
    }
    this.toast('Solar flare has passed', '#9be36a', 'icon_rad');
  }

  graduate(): void {
    const info: CertificateInfo = {
      name: this.profile.name,
      date: new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }),
      sols: this.weather.sol,
      ice: this.stats.iceMined,
      crops: this.stats.cropsHarvested,
      samples: this.science.samples.length,
      rank: this.missions.rank().title,
      xp: this.missions.xp,
      id: `OP7-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      patches: this.data.missions.missions.map((m) => m.patch),
    };
    this.storage.saveCertificate(info);
    this.awardBadge('badge_graduate');
    this.dialogue(this.data.missions.graduation, () => {
      this.ui.openCertificate(() => {
        this.missions.enterBountyMode();
        this.autosave('Graduated');
        this.luna.say('Bounties are in the top-right corner. Keep exploring Mars, Junior Astronaut!', 'happy', 1);
      });
    });
  }

  private medEvac(cause: EvacCause): void {
    if (this.evacuating) return;
    this.evacuating = true;
    this.audio.stopAllLoops();
    const p = this.player;
    let lost = 0;
    for (const id of BULKY_ITEMS) {
      const n = p.pack[id] ?? 0;
      const drop = Math.floor(n * 0.3);
      p.pack[id] = n - drop;
      lost += drop;
    }
    this.stats.medEvacs++;
    if (this.rover.driving) this.rover.exit();
    showMedEvac(this, cause, lost, () => {
      p.inBase = true;
      p.placeAt(SPOTS.medbay.x, SPOTS.medbay.y);
      p.health = 100;
      p.o2 = p.o2Max;
      p.vx = 0;
      p.vy = 0;
      this.weather.solDose = Math.min(this.weather.solDose, SOL_DOSE_BUDGET * 0.5);
      this.snapCamera();
      this.evacuating = false;
      this.luna.say('You’re safe in the med bay. Let’s try again, carefully this time!', 'happy', 2);
    });
  }

  // Guide targets

  /** True when the suit only has enough air left to walk home (with a safety margin). */
  turnBackNeeded(): boolean {
    const p = this.player;
    if (p.inBase || this.rover.driving || this.rover.tetherReach(p)) return false;
    const home = Math.hypot(p.cx - SPOTS.airlockOut.x, p.cy - SPOTS.airlockOut.y);
    // kids rarely walk in a straight line, so allow extra time, and assume some digging on the way
    const walkSec = (home / WALK_SPEED) * 2.2 + 30;
    const airSec = p.o2 / ((SUIT_O2_DRAIN + SUIT_O2_EXERTION * 0.5) * (this.settings.easyMode ? 0.75 : 1));
    return home > 6 * TILE && airSec < walkSec;
  }

  /** True when the rover battery is only just enough to drive back to its charging pad. */
  roverLowForTrip(): boolean {
    const r = this.rover;
    if (!r.driving || r.onPad()) return false;
    const pad = this.rover.padCenter();
    const dist = Math.hypot(r.cx - pad.x, r.cy - pad.y);
    const batterySec = r.battery / (ROVER_DRAIN * r.drainMul);
    return batterySec < (dist / (ROVER_MAX_SPEED * 0.6)) * 1.5 + 12;
  }

  /** Where the guide should lead right now (null: nowhere in particular). */
  guideTarget(): GuideTarget | null {
    // safety first: point home when the air or rover battery is running out
    if (this.turnBackNeeded())
      return { x: SPOTS.airlockOut.x, y: SPOTS.airlockOut.y - 18, label: 'BASE · AIR LOW!', urgent: true };
    if (this.roverLowForTrip()) {
      const pad = this.rover.padCenter();
      return { x: pad.x, y: pad.y, label: 'CHARGING PAD', urgent: true };
    }
    const panels = this.panelGoal();
    if (panels) return panels;
    const obj = this.missions.currentObjective();
    if (!obj?.target) return null;
    const inside = ['airlock', 'pdu', 'console', 'melter', 'beds', 'fabricator', 'shelter'];
    const targetInside = inside.includes(obj.target);
    if (this.player.inBase && !targetInside)
      return { x: SPOTS.airlockIn.x, y: SPOTS.airlockIn.y - 4, label: 'AIRLOCK · GO OUTSIDE' };
    if (!this.player.inBase && targetInside) {
      if (this.rover.driving) return { x: SPOTS.charger.x - 40, y: SPOTS.charger.y, label: 'ROVER PAD' };
      return { x: SPOTS.airlockOut.x, y: SPOTS.airlockOut.y - 18, label: 'AIRLOCK · GO INSIDE' };
    }
    const at = this.resolveTarget(obj.target);
    return at ? { ...at, label: TARGET_LABEL[obj.target] ?? 'GO HERE' } : null;
  }

  /** Storm coming with the panels open, or the storm is over and they are still folded. */
  private panelGoal(): GuideTarget | null {
    const w = this.weather;
    const o = this.objects;
    const fold = (w.stormComing || w.storm.active) && o.anyPanelOpen;
    const unfold = !w.stormComing && !w.storm.active && o.allPanelsFolded && !w.isNight;
    if (!fold && !unfold) return null;
    const what = fold ? 'FOLD SOLAR PANELS' : 'OPEN SOLAR PANELS';
    if (this.player.inBase)
      return { x: SPOTS.console.x + 20, y: SPOTS.console.y - 26, label: `BASE OPS · ${what}`, urgent: fold };
    if (this.rover.driving) return null;
    const pn = o.nearestPanel(this.player.cx, this.player.cy);
    return pn ? { x: panelCenter(pn).x, y: pn.y - 36, label: what, urgent: fold } : null;
  }

  private resolveTarget(name: string): { x: number; y: number } | null {
    const p = this.player;
    switch (name) {
      case 'airlock':
        return { x: SPOTS.airlockIn.x, y: SPOTS.airlockIn.y - 4 };
      case 'airlock_out':
        return { x: SPOTS.airlockOut.x, y: SPOTS.airlockOut.y - 18 };
      case 'panels': {
        const pn = this.objects.dirtiestPanel();
        return pn ? { x: panelCenter(pn).x, y: pn.y - 36 } : null;
      }
      case 'pdu':
        return { x: SPOTS.pdu.x + 9, y: SPOTS.pdu.y - 20 };
      case 'console':
        return { x: SPOTS.console.x + 20, y: SPOTS.console.y - 26 };
      case 'melter':
        return { x: SPOTS.melter.x + 15, y: SPOTS.melter.y - 34 };
      case 'fabricator':
        return { x: SPOTS.fabricator.x + 16, y: SPOTS.fabricator.y - 26 };
      case 'beds': {
        const k = Math.max(
          0,
          this.res.beds.findIndex((b) => !b.crop || b.growth >= 1),
        );
        return { x: SPOTS.beds[k].x + 16, y: SPOTS.beds[k].y - 4 };
      }
      case 'shelter':
        return { x: SPOTS.shelter.x + SPOTS.shelter.w / 2, y: SPOTS.shelter.y + 48 };
      case 'shelter_roof':
        return this.base.firstEmptySlot();
      case 'ice': {
        if (this.time > this.iceCacheT) {
          this.iceCacheT = this.time + 1.5;
          this.iceCache = this.map.nearestIce(p.cx, p.cy);
        }
        return this.iceCache;
      }
      case 'rover':
        return this.rover.driving ? null : { x: this.rover.cx, y: this.rover.y - 4 };
      case 'antenna':
        return { x: this.objects.antenna.x, y: this.objects.antenna.y - 40 };
      case 'nearest_part': {
        let best: Pickup | null = null;
        let bd = Infinity;
        for (const pk of this.objects.partsRemaining()) {
          const d = Math.abs(pk.x - p.cx) + Math.abs(pk.y - p.cy);
          if (d < bd) {
            bd = d;
            best = pk;
          }
        }
        return best ? { x: best.x + 7, y: best.y } : { x: this.objects.antenna.x, y: this.objects.antenna.y - 40 };
      }
    }
    return null;
  }

  // Update

  private computeFocus(): void {
    this.focus = null;
    if (this.ui.blocking) return;
    const p = this.player;
    if (this.rover.driving) {
      const r = this.rover;
      this.focus = {
        label: r.onPad() ? 'Hop out (unloads trunk to base)' : 'Hop out of the rover',
        x: r.cx,
        y: r.y - 6,
        act: () => r.exit(),
      };
      return;
    }
    this.interactAge++;
    if (this.interactAge > 20) {
      this.interactAge = 0;
      const r = this.rover;
      this.interactCache = [
        ...this.base.interactables(),
        ...this.objects.interactables(),
        {
          id: 'rover',
          x: r.x - 6,
          y: r.y - 10,
          w: r.w + 12,
          h: r.h + 10,
          label: () =>
            `Drive the rover · battery ${Math.round(r.battery)}%${r.trunkCount() ? ` · trunk ${r.trunkCount()}` : ''}`,
          enabled: () => !this.player.inBase && !r.driving,
          act: () => r.enter(),
        },
      ];
    }
    const px0 = p.x - 8;
    const px1 = p.x + p.w + 8;
    const py0 = p.y - 6;
    const py1 = p.y + p.h + 4;
    let best: Interactable | null = null;
    let bd = Infinity;
    for (const it of this.interactCache) {
      if (it.enabled && !it.enabled()) continue;
      if (px1 < it.x || px0 > it.x + it.w || py1 < it.y || py0 > it.y + it.h) continue;
      const d = Math.abs(p.cx - (it.x + it.w / 2)) + Math.abs(p.cy - (it.y + it.h / 2)) * 0.5;
      if (d < bd) {
        bd = d;
        best = it;
      }
    }
    if (best) {
      const b = best;
      this.focus = { label: b.label(), x: b.x + b.w / 2, y: b.y, act: () => b.act() };
    }
  }

  private wasBlocked = false;
  /** The ⏩ button is held down. */
  ffHeld = false;
  /** Fast-forward is actually running this frame. */
  fastForwarding = false;

  /** Fast-forward only when the astronaut is safe inside and nothing needs attention. */
  canFastForward(): boolean {
    return (
      this.player.inBase &&
      !this.rover.driving &&
      this.weather.flare.phase === 'none' &&
      !this.ui.blocking &&
      !this.hud.alerts.some((a) => a.level === 'bad')
    );
  }
  private brickAssistArmed = true;

  /** Mission 5 helper: walking up to the shelter wall with bricks picks the brick tool for you. */
  private brickAssist(): void {
    const p = this.player;
    if (this.missions.activeId() !== 5 || p.inBase || this.rover.driving || (p.pack.brick ?? 0) <= 0) return;
    const slot = this.base.firstEmptySlot();
    if (!slot) return;
    if (Math.hypot(slot.x - p.cx, slot.y - p.cy) > 5 * TILE) {
      this.brickAssistArmed = true;
      return;
    }
    if (!this.brickAssistArmed) return;
    this.brickAssistArmed = false;
    const idx = TOOLS.findIndex((t) => t.id === 'brick');
    if (p.hotbar !== idx) {
      p.hotbar = idx;
      this.audio.blip();
    }
    this.hint('brickready', 'Brick tool ready! Click each glowing square to build the shield.', 'happy', 20, 2);
  }

  update(dt: number): void {
    this.time += dt;
    const input = this.input;
    // ignore the key press that closed a dialogue/modal so it doesn't also trigger an action
    input.blocked = this.ui.blocking || this.wasBlocked;
    this.wasBlocked = this.ui.blocking;
    this.ui.stack.tick(dt);
    this.hud.update(dt);

    if (!this.ui.blocking) {
      if (input.mousePressed && this.hud.handleClick(input.mouseX, input.mouseY)) input.mouseDown = false;
      if (input.pressed('escape', 'p')) {
        this.openPause();
        return;
      }
      if (input.pressed('m')) this.hud.bigMap = !this.hud.bigMap;
      if (input.pressed('tab')) this.hud.toggleWatch();
      if (input.pressed('l')) this.ui.openScienceLog();
      if (input.pressed('t')) this.ui.openAskLuna();
      if (input.pressed('b') && this.player.inBase) this.ui.openBaseOps('power');
      for (let i = 0; i < 8; i++) if (input.pressed(String(i + 1))) this.selectTool(i);
      const nTools = this.toolsUnlocked();
      if (input.wheel && nTools > 0)
        this.player.hotbar = (this.player.hotbar + (input.wheel > 0 ? 1 : nTools - 1)) % nTools;
      if (this.player.hotbar >= nTools) this.player.hotbar = 0;
    }

    if (this.ui.busy) {
      this.audio.stopAllLoops();
      this.particles.update(dt * 0.3);
      return;
    }

    this.weather.update(dt);
    if (this.rover.driving) {
      this.rover.update(dt);
      this.player.update(dt);
    } else {
      this.player.update(dt);
      this.rover.update(dt);
    }
    this.computeFocus();
    this.guide.update(dt);
    this.brickAssist();
    if (input.pressed('e') && this.focus) {
      this.focus.act();
      this.audio.blip();
    }
    this.scanCooldown -= dt;
    if (input.pressed('q')) this.doScan();
    if (input.pressed('r') && !this.rover.driving && !this.player.inBase) {
      this.rover.autopilotHome();
    }

    this.objects.update(dt);
    this.res.update(dt);
    this.missions.update(dt);
    this.fastForwarding = this.ffHeld && this.canFastForward();
    if (this.fastForwarding) {
      // 5× speed: run the world (not the player) four extra times this frame
      for (let k = 0; k < 4 && !this.ui.busy; k++) {
        this.weather.update(dt);
        this.objects.update(dt);
        this.res.update(dt);
        this.missions.update(dt);
      }
    }
    this.luna.update(dt);
    this.particles.update(dt);
    const t = this.player.target;
    this.map.healDamage(dt, t && t.tx >= 0 ? this.map.idx(t.tx, t.ty) : -1);

    // mission location checks
    const p = this.player;
    if (
      !p.inBase &&
      this.missions.activeId() === 6 &&
      Math.hypot(p.cx - this.objects.antenna.x, p.cy - this.objects.antenna.y) < 110
    )
      this.emit('reach_antenna');
    this.badgeT -= dt;
    if (this.badgeT <= 0) {
      this.badgeT = 2;
      this.checkBadges();
    }

    if (p.health <= 0 && !this.evacuating) {
      const cause: EvacCause = p.o2 <= 0 ? 'oxygen' : this.weather.solDoseOver() ? 'radiation' : 'injury';
      this.medEvac(cause);
    }

    this.updateCamera(dt);
    const tense = this.weather.flare.phase !== 'none' || this.weather.storm.active;
    this.audio.updateMusic(dt, tense ? 'tense' : 'calm');
  }

  doScan(): void {
    const p = this.player;
    if (p.inBase) {
      this.hint('scanin', 'My scanner only works outside: the habitat walls block it!', 'think', 8);
      return;
    }
    if (this.scanCooldown > 0) return;
    this.scanCooldown = 3;
    const found = this.map.scan(p.cx, p.cy, 24, this.time);
    this.luna.scan();
    this.audio.scan();
    this.emit('scan');
    const ice = this.map.nearestIce(p.cx, p.cy, 40, true) ?? this.map.nearestIce(p.cx, p.cy, 40);
    if (ice && found > 0) {
      const dx = Math.round((ice.x - p.cx) / TILE);
      const dy = Math.round((ice.y - p.cy) / TILE);
      const horiz = Math.abs(dx) < 2 ? '' : `${Math.abs(dx)} m ${dx > 0 ? 'EAST (right)' : 'WEST (left)'}`;
      const vert = Math.abs(dy) < 2 ? '' : `${Math.abs(dy)} m ${dy > 0 ? 'SOUTH (down)' : 'NORTH (up)'}`;
      this.luna.say(
        `Scan complete! I found ice under the soil ${[horiz, vert].filter(Boolean).join(' and ') || 'right here'}. It glows blue now. Dig it with the Mining Laser!`,
        'wow',
        2,
      );
    } else if (ice)
      this.luna.say(
        'Scan complete! No buried ice right here, but I can see ice further away. Follow the glowing path!',
        'think',
        2,
      );
    else
      this.luna.say(
        'Scan complete! No ice close by. Try somewhere else: ice is more common toward the poles (north and south).',
        'think',
        2,
      );
  }

  snapCamera(): void {
    const body = this.rover.driving ? this.rover : this.player;
    this.camX = body.x + body.w / 2 - this.vw / 2;
    this.camY = body.y + body.h / 2 - 10 - this.vh / 2;
    this.clampCamera();
    this.luna.snapTo(body.x + body.w / 2 - 20, body.y + body.h);
  }

  private clampCamera(): void {
    if (this.blackout) {
      // Indoors the camera follows the astronaut and may go up to a third of a screen past the
      // walls (black there), so the minimap, mission box and buttons never hide a room.
      const f = this.base.footprint;
      const padX = this.vw * 0.35;
      const padY = this.vh * 0.35;
      const x0 = f.x - 8 - padX;
      const x1 = f.x + f.w + 8 + padX;
      const y0 = f.y - 16 - padY;
      const y1 = f.y + f.h + 8 + padY;
      this.camX = x1 - x0 <= this.vw ? (x0 + x1) / 2 - this.vw / 2 : Math.max(x0, Math.min(x1 - this.vw, this.camX));
      this.camY = y1 - y0 <= this.vh ? (y0 + y1) / 2 - this.vh / 2 : Math.max(y0, Math.min(y1 - this.vh, this.camY));
      return;
    }
    this.camX = Math.max(0, Math.min(this.map.w * TILE - this.vw, this.camX));
    this.camY = Math.max(0, Math.min(this.map.h * TILE - this.vh, this.camY));
  }

  private updateCamera(dt: number): void {
    const body = this.rover.driving ? this.rover : this.player;
    const tx = body.x + body.w / 2 - this.vw / 2 + body.vx * 0.3;
    const ty = body.y + body.h / 2 - 10 - this.vh / 2 + body.vy * 0.3;
    const k = Math.min(1, dt * 6);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
    this.clampCamera();
  }

  // Render

  render(): void {
    const g = this.g;
    g.imageSmoothingEnabled = false;
    const shake = this.weather.shake > 0 ? (Math.random() - 0.5) * 6 * this.weather.shake : 0;
    const cx = Math.round(this.camX + shake);
    const cy = Math.round(this.camY + shake * 0.5);
    const vw = this.vw;
    const vh = this.vh;
    const t = this.time;

    g.fillStyle = '#120a0a';
    g.fillRect(0, 0, vw, vh);
    this.map.renderGround(g, this.art, cx, cy, vw, vh, t);
    this.base.renderFloor(g, cx, cy, t);

    // everything that stands up is drawn back-to-front by its foot position (2.5D)
    const list: Drawable[] = [];
    this.map.forEachObject(cx, cy, vw, vh, (tx, ty) =>
      list.push({ y: (ty + 1) * TILE, draw: () => this.map.drawObject(g, this.art, tx, ty, cx, cy, t) }),
    );
    this.base.drawables(list, cx, cy, t);
    this.objects.drawables(list, cx, cy, t);
    this.weather.drawables(list, cx, cy, t);
    list.push({ y: this.rover.y + this.rover.h, draw: () => this.rover.render(g, cx, cy) });
    if (!this.player.hidden)
      list.push({ y: this.player.y + this.player.h, draw: () => this.player.render(g, cx, cy, t) });
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.draw();

    this.base.renderRoof(g, cx, cy);
    this.luna.render(g, cx, cy);
    this.particles.render(g, cx, cy);
    this.weather.renderTint(g, vw, vh);

    // lighting pass
    const L = this.lighting;
    L.begin(vw, vh);
    const p = this.player;
    if (!p.inBase && !p.hidden) {
      const lx = p.dir === 'side' ? p.facing * 26 : 0;
      const ly = p.dir === 'down' ? 26 : p.dir === 'up' ? -34 : -8;
      L.add(p.cx + lx, p.cy + ly, 60, 0.95);
      L.add(p.cx, p.cy - 10, 34, 0.85);
    }
    if (p.firing && p.target) L.add(p.target.px, p.target.py, 26, 0.8);
    this.rover.lights(L.add);
    this.luna.light(L.add);
    this.base.lights(L.add);
    this.objects.lights(L.add);
    for (const gl of this.map.glowTiles(cx, cy, vw, vh)) L.glow(gl.x, gl.y, gl.color);
    L.render(g, this.map, cx, cy, vw, vh, this.weather.night);

    if (this.blackout) {
      // inside the habitat: everything outside the walls goes black
      const f = this.base.footprint;
      const x0 = Math.round(f.x - cx);
      const y0 = Math.round(f.y - 8 - cy);
      const x1 = Math.round(f.x + f.w - cx);
      const y1 = Math.round(f.y + f.h - cy);
      g.fillStyle = '#000000';
      g.fillRect(0, 0, vw, Math.max(0, y0));
      g.fillRect(0, y1, vw, Math.max(0, vh - y1));
      g.fillRect(0, y0, Math.max(0, x0), y1 - y0);
      g.fillRect(x1, y0, Math.max(0, vw - x1), y1 - y0);
      if (this.weather.flare.phase === 'active') this.weather.renderOverlay(g, vw, vh, t);
    } else this.weather.renderOverlay(g, vw, vh, t);
    this.hud.renderWorld(g, t);

    const hg = this.hg;
    hg.clearRect(0, 0, this.hw, this.hh);
    hg.imageSmoothingEnabled = false;
    this.hud.render(hg, t);
  }
}
