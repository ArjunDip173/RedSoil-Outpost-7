/**
 * Every tunable number in one place.
 *
 * The game is a TOP-DOWN (2.5D, "eagle eye") view: x = east, y = south, 1 tile ≈ 1 metre.
 * Game time vs. real time: one Martian Sol (24h 39m 35s) is squeezed into SOL_SECONDS
 * of real play. Power is in kW / kWh, water in litres, radiation in mSv - real units, so
 * kids learn the vocabulary - but the *rates* are sped up so things happen while you play.
 */
import type { BadgeDef, CropId, ItemId, PowerSystemId, ToolId } from './types';

// World & rendering
export const TILE = 16; // world pixels per tile
export const WORLD_W = 240; // tiles (east–west)
export const WORLD_H = 180; // tiles (north–south)
export const WORLD_SEED = 7_2026;

/** Habitat footprint (top-left tile + size, walls included). */
export const BASE_X = 104;
export const BASE_Y = 76;
export const BASE_W = 30;
export const BASE_H = 17;

/** Named places in the world (tile coordinates). */
export const LANDMARKS = {
  roverPad: { x: BASE_X - 15, y: BASE_Y + 6, w: 11, h: 7 },
  solarField: { x: BASE_X + 3, y: BASE_Y + 20, dx: 5, dy: 4, cols: 5, rows: 2 },
  maxPanels: 10,
  shelterSlots: { x: BASE_X + BASE_W, y: BASE_Y + 8, n: 8 },
  cave: { x: 22, y: 44, w: 42, h: 22, entranceX: 62, entranceY: 54 },
  cavePart: { x: 27, y: 53 },
  crater: { x: 190, y: 122, r: 15 },
  lander: { x: 40, y: 150 },
  antenna: { x: 206, y: 30 },
  polarRows: 14,
} as const;

/** Ground tiles (what you walk on). */
export const G = {
  REGOLITH: 1,
  DUNE: 2,
  ROCKY: 3,
  PIT: 4,
  POLAR: 5,
  CRATER: 6,
  CAVE: 7,
  FLOOR: 8,
  PAD: 9,
} as const;

/** Object tiles (things that stand up and block movement). 0 = none. */
export const O = {
  NONE: 0,
  BOULDER: 1,
  BASALT: 2,
  HEMATITE: 3,
  CRYSTAL: 4,
  ICE: 5,
  BRICK: 6,
  MOUND: 7,
  ICEBLOCK: 8,
  HULL: 9,
  WINDOW: 10,
  CLIFF: 11,
  BEDROCK: 12,
  DOOR: 13,
} as const;

export interface GroundInfo {
  name: string;
  /** Seconds of laser to excavate (Infinity = can't dig). */
  dig: number;
  map: string;
}
export const GROUND_INFO: Record<number, GroundInfo> = {
  [G.REGOLITH]: { name: 'Regolith', dig: 0.45, map: '#b8602f' },
  [G.DUNE]: { name: 'Dusty dune', dig: 0.35, map: '#d4824a' },
  [G.ROCKY]: { name: 'Rocky ground', dig: 0.7, map: '#8e4a2a' },
  [G.PIT]: { name: 'Dug pit', dig: Infinity, map: '#5c2b17' },
  [G.POLAR]: { name: 'Polar frost', dig: 0.5, map: '#e9f5fb' },
  [G.CRATER]: { name: 'Crater floor', dig: 0.55, map: '#7b3c22' },
  [G.CAVE]: { name: 'Lava tube floor', dig: 0.8, map: '#3a2a2a' },
  [G.FLOOR]: { name: 'Habitat floor', dig: Infinity, map: '#9aa2ae' },
  [G.PAD]: { name: 'Landing pad', dig: Infinity, map: '#6b6e78' },
};

export interface ObjInfo {
  name: string;
  hardness: number; // seconds of laser (Infinity = unbreakable)
  drop?: ItemId;
  drops?: number;
  map: string;
  glow?: string;
  /** Visual height of the block in pixels (3/4 view). */
  height: number;
}
export const OBJ_INFO: Record<number, ObjInfo> = {
  [O.BOULDER]: { name: 'Boulder', hardness: 0.6, drop: 'regolith', drops: 2, map: '#7b3c22', height: 8 },
  [O.BASALT]: { name: 'Basalt rock', hardness: 0.9, drop: 'basalt', map: '#4b3a3a', height: 9 },
  [O.HEMATITE]: { name: 'Hematite rock', hardness: 0.85, drop: 'iron', map: '#6a6d84', height: 8 },
  [O.CRYSTAL]: {
    name: 'Olivine crystals',
    hardness: 1.0,
    drop: 'crystal',
    map: '#9be36a',
    glow: '#b6ff7a',
    height: 10,
  },
  [O.ICE]: { name: 'Ice block', hardness: 0.55, drop: 'ice', drops: 2, map: '#9fe8ff', glow: '#7fe3ff', height: 9 },
  [O.BRICK]: { name: 'Brick wall', hardness: 0.45, drop: 'brick', map: '#c4703f', height: 10 },
  [O.MOUND]: { name: 'Regolith mound', hardness: 0.3, drop: 'regolith', map: '#c0643a', height: 7 },
  [O.ICEBLOCK]: { name: 'Ice wall', hardness: 0.45, drop: 'ice', map: '#bfefff', glow: '#7fe3ff', height: 10 },
  [O.HULL]: { name: 'Habitat wall', hardness: Infinity, map: '#d8dde6', height: 12 },
  [O.WINDOW]: { name: 'Habitat window', hardness: Infinity, map: '#8fd3ff', height: 12 },
  [O.CLIFF]: { name: 'Lava rock wall', hardness: Infinity, map: '#2a1a1a', height: 12 },
  [O.BEDROCK]: { name: 'Canyon wall', hardness: Infinity, map: '#2a1712', height: 12 },
  [O.DOOR]: { name: 'Airlock door', hardness: Infinity, map: '#ffd166', height: 12 },
};

// Time
export const SOL_SECONDS = 480; // one Sol = 8 real minutes
export const GAME_HOURS_PER_SOL = 24.66;
export const HOURS_PER_SECOND = GAME_HOURS_PER_SOL / SOL_SECONDS;
export const START_TIME_OF_SOL = 0.31; // just after sunrise

// Movement (world px, seconds)
export const WALK_SPEED = 78;
export const SPRINT_MULT = 1.65;
export const ACCEL = 900;
export const STAMINA_DRAIN = 30; // per second while sprinting
export const STAMINA_REGEN = 22;

export const ROVER_MAX_SPEED = 170;
export const ROVER_ACCEL = 260;
export const ROVER_DRAIN = 0.65; // % battery per second at full throttle
export const ROVER_CHARGE = 9; // % per second on the garage pad
export const ROVER_TETHER_RANGE = 3.2 * TILE;
export const ROVER_TRUNK_CAP = 160;

// Astronaut
export const SUIT_O2_MAX = 100;
export const SUIT_O2_DRAIN = 0.42; // per second outside
export const SUIT_O2_EXERTION = 0.22; // extra per second while sprinting / mining
export const HEALTH_MAX = 100;
export const PACK_CAP = 60;
export const REACH = 4.5 * TILE; // mining / building reach
export const LASER_POWER = 1;
export const SNACK_HEAL = 35;

// Radiation (mSv)
/** Curiosity's RAD instrument measured roughly 0.64–0.7 mSv per Sol on the surface. */
export const SURFACE_DOSE_RATE = 0.67; // mSv/Sol
export const FLARE_PEAK_RATE = 120; // mSv/Sol at the peak of an in-game SEP event
export const SOL_DOSE_BUDGET = 4; // game training budget per Sol
export const SHIELD_BASE = 0.42; // habitat walls
export const SHIELD_ROVER = 0.6;
export const SHIELD_LAVA_TUBE = 0.08; // a lava tube's rock roof is a great natural shelter
export const SHELTER_SLOTS = 8;

// Base resources
export const BATTERY_START_KWH = 32;
export const BATTERY_BASE_KWH = 40;
export const BATTERY_UPGRADE_KWH = 30;
export const PANEL_PEAK_KW = 2.2;
export const PANEL_DUST_RATE = 0.0022; // dust per second
export const PANEL_W = 52; // px; panels are drawn in code so they can fold
export const PANEL_FOLD_SPEED = 0.9; // share of a full fold per second
export const STORM_WARNING = 40; // seconds between the storm warning and the storm
export const STORM_PANEL_BREAK = 18; // seconds of full storm an open panel survives
export const LIFE_SUPPORT_KW = 2;
export const KILOPOWER_KW = 5;

export interface PowerSystemDef {
  id: PowerSystemId;
  name: string;
  kwPerLevel: number;
  blurb: string;
  icon: string;
}
export const POWER_SYSTEMS: PowerSystemDef[] = [
  {
    id: 'greenhouse',
    name: 'Greenhouse Lights',
    kwPerLevel: 1.5,
    blurb: 'Grow lights help crops grow faster.',
    icon: 'icon_seed_lettuce',
  },
  {
    id: 'electrolysis',
    name: 'O2 Maker (Electrolysis)',
    kwPerLevel: 2,
    blurb: 'Splits water (H2O) into oxygen + hydrogen.',
    icon: 'icon_o2',
  },
  {
    id: 'melter',
    name: 'Ice Melter (Water Filter)',
    kwPerLevel: 1,
    blurb: 'Melts and cleans ice into drinkable water.',
    icon: 'icon_ice',
  },
  {
    id: 'algae',
    name: 'Algae Lab Lights',
    kwPerLevel: 0.8,
    blurb: 'Spirulina algae makes O2 and food from light.',
    icon: 'icon_algae',
  },
];
export const MAX_POWER_LEVEL = 3;

export const BASE_O2_START = 55; // %
export const BASE_WATER_START = 30; // L
export const BASE_WATER_CAP = 300;
export const BASE_FOOD_START = 12; // meals
export const CREW_O2_USE = 0.045; // % per second
export const CREW_WATER_USE = 0.008; // L/s (≈98% recycled, like the ISS)
export const CREW_FOOD_USE = 0.0025; // meals per second
export const PUMP_FLOW = 0.2; // L/s total split by the water valve
export const ELECTROLYSIS_WATER_PER_LEVEL = 0.06; // L/s
export const O2_PER_LITRE = 2; // % base O2 per litre electrolysed
export const ALGAE_O2_PER_LEVEL = 0.03; // %/s
export const ALGAE_FOOD_PER_LEVEL = 0.002; // meals/s
export const ALGAE_WATER_PER_LEVEL = 0.01;
export const MELT_ICE_PER_LEVEL = 0.22; // ice chunks per second
export const WATER_PER_ICE = 6; // L
export const SUIT_REFILL_COST = 0.12; // base % per suit O2 unit
export const BED_WATER_NEED = 0.015; // L/s per growing bed

// Crops
export interface CropDef {
  id: CropId;
  name: string;
  growSeconds: number;
  meals: number;
  seedsBack: [number, number];
  seedItem: ItemId;
  color: string;
  note: string;
}
export const CROPS: Record<CropId, CropDef> = {
  lettuce: {
    id: 'lettuce',
    name: 'Red Romaine Lettuce',
    growSeconds: 110,
    meals: 2,
    seedsBack: [1, 2],
    seedItem: 'seed_lettuce',
    color: '#c9504f',
    note: 'Astronauts first ate space-grown red romaine lettuce on the ISS in 2015.',
  },
  tomato: {
    id: 'tomato',
    name: 'Dwarf Tomato',
    growSeconds: 170,
    meals: 3,
    seedsBack: [1, 2],
    seedItem: 'seed_tomato',
    color: '#e0413a',
    note: 'Dwarf "Red Robin" tomatoes were grown on the ISS in the Veggie garden.',
  },
  pepper: {
    id: 'pepper',
    name: 'Chile Pepper',
    growSeconds: 190,
    meals: 3,
    seedsBack: [1, 2],
    seedItem: 'seed_pepper',
    color: '#3fa34d',
    note: 'In 2021, ISS astronauts grew and tasted chile peppers, a first in space!',
  },
  potato: {
    id: 'potato',
    name: 'Potato',
    growSeconds: 250,
    meals: 5,
    seedsBack: [1, 3],
    seedItem: 'seed_potato',
    color: '#b98b52',
    note: 'Potatoes pack lots of energy and are studied for growing in Mars-like soils.',
  },
};
export const CROP_ORDER: CropId[] = ['lettuce', 'tomato', 'pepper', 'potato'];

// Items
export interface ItemDef {
  id: ItemId;
  name: string;
  icon: string;
  color: string;
  bulky: boolean;
}
export const ITEMS: Record<ItemId, ItemDef> = {
  regolith: { id: 'regolith', name: 'Regolith', icon: 'icon_regolith', color: '#c0643a', bulky: true },
  ice: { id: 'ice', name: 'Ice Chunk', icon: 'icon_ice', color: '#9fe8ff', bulky: true },
  iron: { id: 'iron', name: 'Hematite Iron', icon: 'icon_iron', color: '#7c7f95', bulky: true },
  basalt: { id: 'basalt', name: 'Basalt', icon: 'icon_basalt', color: '#4b3a3a', bulky: true },
  crystal: { id: 'crystal', name: 'Olivine Crystal', icon: 'icon_crystal', color: '#9be36a', bulky: true },
  brick: { id: 'brick', name: 'Regolith Brick', icon: 'icon_brick', color: '#c4703f', bulky: true },
  meteorite: { id: 'meteorite', name: 'Iron Meteorite', icon: 'icon_meteorite', color: '#6e6a7a', bulky: false },
  seed_lettuce: {
    id: 'seed_lettuce',
    name: 'Lettuce Seeds',
    icon: 'icon_seed_lettuce',
    color: '#c9504f',
    bulky: false,
  },
  seed_tomato: { id: 'seed_tomato', name: 'Tomato Seeds', icon: 'icon_seed_tomato', color: '#e0413a', bulky: false },
  seed_pepper: { id: 'seed_pepper', name: 'Pepper Seeds', icon: 'icon_seed_pepper', color: '#3fa34d', bulky: false },
  seed_potato: { id: 'seed_potato', name: 'Potato Seeds', icon: 'icon_seed_potato', color: '#b98b52', bulky: false },
  food: { id: 'food', name: 'Meal Pack', icon: 'icon_food', color: '#ffd166', bulky: false },
  antenna_part: { id: 'antenna_part', name: 'Antenna Part', icon: 'icon_part', color: '#ffd166', bulky: false },
};
export const BULKY_ITEMS: ItemId[] = ['regolith', 'ice', 'iron', 'basalt', 'crystal', 'brick'];

// Hotbar tools
export interface ToolDef {
  id: ToolId;
  name: string;
  icon: string;
  hint: string;
  uses?: ItemId;
  /** Unlocked when this mission starts (7 = after graduation, 99 = never shown in the bar). */
  unlock: number;
}
/** Tools appear one by one, in this order, as the missions need them. */
export const TOOLS: ToolDef[] = [
  {
    id: 'brush',
    name: 'Dust Brush',
    icon: 'icon_brush',
    hint: 'Hold the mouse on dusty solar panels or sparkly rocks',
    unlock: 1,
  },
  {
    id: 'snack',
    name: 'Meal Pack',
    icon: 'icon_food',
    hint: 'Click to eat and heal (+35 health)',
    uses: 'food',
    unlock: 2,
  },
  {
    id: 'laser',
    name: 'Mining Laser',
    icon: 'icon_laser',
    hint: 'Hold the mouse on rocks or glowing blue ice to dig',
    unlock: 3,
  },
  {
    id: 'brick',
    name: 'Bricks',
    icon: 'icon_brick',
    hint: 'Click a glowing square to build a shield wall',
    uses: 'brick',
    unlock: 5,
  },
  { id: 'flag', name: 'Explorer Flag', icon: 'icon_flag', hint: 'Click to plant a flag on the map', unlock: 7 },
  {
    id: 'regolith',
    name: 'Dirt Mound',
    icon: 'icon_regolith',
    hint: 'Click a tile to pile up dirt',
    uses: 'regolith',
    unlock: 7,
  },
  {
    id: 'ice',
    name: 'Ice Block',
    icon: 'icon_ice',
    hint: 'Click a tile to place ice. Water blocks radiation!',
    uses: 'ice',
    unlock: 7,
  },
  {
    id: 'seeds',
    name: 'Seed Pouch',
    icon: 'icon_seed_lettuce',
    hint: 'Stand by a Greenhouse tray and press E to plant',
    unlock: 99,
  },
];

// Fabricator recipes
export type UpgradeId =
  'brick' | 'solar_panel' | 'battery' | 'o2_tank' | 'jet_booster' | 'laser_upgrade' | 'rover_battery' | 'kilopower';
export interface RecipeDef {
  id: UpgradeId;
  name: string;
  cost: Partial<Record<ItemId, number>>;
  gives: string;
  max: number;
  requiresMission?: number;
  fact: string;
  icon: string;
}
export const RECIPES: RecipeDef[] = [
  {
    id: 'brick',
    name: '4 Regolith Bricks',
    cost: { regolith: 2 },
    gives: '+4 bricks for shielding & building',
    max: Infinity,
    fact: 'NASA tests 3D-printing habitats from Mars-like regolith so astronauts can build with local dirt.',
    icon: 'icon_brick',
  },
  {
    id: 'solar_panel',
    name: 'Extra Solar Panel',
    cost: { iron: 5, basalt: 3, crystal: 1 },
    gives: '+1 panel (+2.2 kW at noon)',
    max: 4,
    fact: 'Solar panels on Mars get only about 43% of the sunlight they would on Earth.',
    icon: 'icon_solar',
  },
  {
    id: 'battery',
    name: 'Battery Bank',
    cost: { iron: 5, basalt: 5 },
    gives: '+30 kWh storage for the night',
    max: 3,
    fact: 'Batteries store daytime solar energy so the base keeps running through the cold Martian night.',
    icon: 'icon_battery',
  },
  {
    id: 'o2_tank',
    name: 'Big O2 Tank',
    cost: { iron: 6, crystal: 2 },
    gives: 'Suit O2 capacity +50%',
    max: 1,
    fact: 'Spacesuits carry their own oxygen supply. On the ISS a spacewalk can last 6–8 hours.',
    icon: 'icon_o2',
  },
  {
    id: 'jet_booster',
    name: 'Sprint Boots',
    cost: { iron: 5, crystal: 2 },
    gives: 'Sprint 50% longer and faster',
    max: 1,
    fact: 'Apollo astronauts found that a bouncy "bunny hop" was often the easiest way to move in low gravity.',
    icon: 'icon_boot',
  },
  {
    id: 'laser_upgrade',
    name: 'Laser Focus Lens',
    cost: { iron: 4, crystal: 3 },
    gives: 'Dig 60% faster',
    max: 1,
    fact: 'Curiosity has a laser called ChemCam that zaps rocks from up to 7 metres away to learn what they are made of.',
    icon: 'icon_laser',
  },
  {
    id: 'rover_battery',
    name: 'Rover Power Pack',
    cost: { iron: 6, basalt: 4 },
    gives: 'Rover drives 60% longer',
    max: 1,
    fact: 'NASA’s three Apollo Lunar Roving Vehicles ran on batteries and together drove about 90 km on the Moon.',
    icon: 'icon_battery',
  },
  {
    id: 'kilopower',
    name: 'Kilopower Reactor',
    cost: { iron: 12, basalt: 8, crystal: 6 },
    gives: '+5 kW day AND night (no sunlight needed)',
    max: 1,
    requiresMission: 5,
    fact: 'NASA’s Kilopower project tested a small fission reactor that could power a Mars base through dust storms.',
    icon: 'icon_reactor',
  },
];

// Progression
export const RANKS: { xp: number; title: string }[] = [
  { xp: 0, title: 'Cadet' },
  { xp: 300, title: 'Junior Astronaut' },
  { xp: 900, title: 'Mission Specialist' },
  { xp: 1800, title: 'Flight Engineer' },
  { xp: 3000, title: 'Commander' },
  { xp: 5000, title: 'Mars Legend' },
];

/** Mission patches and achievement badges (art lives in the sprite sheet). */
export const BADGES: BadgeDef[] = [
  {
    id: 'patch_m1',
    name: 'First Steps',
    text: 'Completed Mission 1: suited up safely and cleaned the solar panels.',
    art: 'patch_m1',
    color: '#e07a3f',
  },
  {
    id: 'patch_m2',
    name: 'Power Engineer',
    text: 'Completed Mission 2: repaired the PDU and balanced the grid.',
    art: 'patch_m2',
    color: '#e0c02c',
  },
  {
    id: 'patch_m3',
    name: 'Ice Miner',
    text: 'Completed Mission 3: found subsurface ice and made water.',
    art: 'patch_m3',
    color: '#4fb3ff',
  },
  {
    id: 'patch_m4',
    name: 'Life Support Pro',
    text: 'Completed Mission 4: balanced oxygen and food.',
    art: 'patch_m4',
    color: '#5fd068',
  },
  {
    id: 'patch_m5',
    name: 'Storm Survivor',
    text: 'Completed Mission 5: built a radiation shelter and rode out a solar flare.',
    art: 'patch_m5',
    color: '#ff5a5a',
  },
  {
    id: 'patch_m6',
    name: 'Comms Officer',
    text: 'Completed Mission 6: restored contact with Earth.',
    art: 'patch_m6',
    color: '#8fb5ff',
  },
  {
    id: 'badge_graduate',
    name: 'Junior Astronaut',
    text: 'Graduated from Outpost 7 training!',
    art: 'badge_graduate',
    color: '#ffd166',
  },
  {
    id: 'badge_geologist',
    name: 'Geologist',
    text: 'Brushed up all 12 science samples.',
    art: 'badge_geologist',
    color: '#9be36a',
  },
  {
    id: 'badge_driver',
    name: 'Road Tripper',
    text: 'Drove the rover 1,000 metres.',
    art: 'badge_driver',
    color: '#e98a1f',
  },
  {
    id: 'badge_deep',
    name: 'Excavator',
    text: 'Dug 40 pits in the Martian soil.',
    art: 'badge_deep',
    color: '#a5532b',
  },
  {
    id: 'badge_meteor',
    name: 'Meteor Hunter',
    text: 'Picked up a meteorite after an impact.',
    art: 'badge_meteor',
    color: '#b9b5c8',
  },
  {
    id: 'badge_rocket',
    name: 'Marathon Martian',
    text: 'Sprinted for 60 seconds in total.',
    art: 'badge_rocket',
    color: '#ffd166',
  },
  { id: 'badge_flag', name: 'Trailblazer', text: 'Planted 5 explorer flags.', art: 'badge_flag', color: '#e055a0' },
  {
    id: 'badge_storm',
    name: 'Storm Chaser',
    text: 'Survived a Martian dust storm.',
    art: 'badge_storm',
    color: '#c98a5b',
  },
  {
    id: 'badge_quiz',
    name: 'Quiz Whiz',
    text: "Answered 5 of LUNA's quiz questions correctly.",
    art: 'badge_quiz',
    color: '#7fe3ff',
  },
  { id: 'badge_farmer', name: 'Space Farmer', text: 'Harvested 10 crops.', art: 'badge_farmer', color: '#3fa34d' },
];

export const SUIT_COLORS = ['#c0443a', '#2f7dd1', '#e98a1f', '#3aa856', '#8b55d6', '#e0c02c', '#e055a0'];
export const SKIN_TONES = ['#f6d3b3', '#e7b48f', '#c98c62', '#9a6340', '#6b4128'];
export const HAIR_COLORS = ['#2b1a12', '#6b3a1e', '#c8862f', '#e8d17a', '#a33a24', '#3a3a48'];

/** LUNA's AI server (server/ in this repo, a free Cloudflare Worker). `bash server/deploy.sh` fills this in. */
export const AI_SERVER_URL = 'https://luna-ai.teamsideloader.workers.dev';
/** Our own AI server addresses, old and new: saved settings that point at one follow AI_SERVER_URL. */
export function isOfficialAiUrl(url: string): boolean {
  try {
    const host = new URL(url.trim()).hostname;
    return /^luna-ai[.-]/.test(host) && (host.endsWith('.run.app') || host.endsWith('.workers.dev'));
  } catch {
    return false;
  }
}
export const TEAM_NAME = 'SideLoaders';
export const GAME_TITLE = 'Red Soil: Outpost 7';
export const SAVE_VERSION = 2;
