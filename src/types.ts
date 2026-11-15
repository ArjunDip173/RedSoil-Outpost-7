/**
 * Shared, strictly-typed interfaces used across the game.
 */

export type ItemId =
  | 'regolith'
  | 'ice'
  | 'iron'
  | 'basalt'
  | 'crystal'
  | 'brick'
  | 'meteorite'
  | 'seed_lettuce'
  | 'seed_tomato'
  | 'seed_pepper'
  | 'seed_potato'
  | 'food'
  | 'antenna_part';

export type Inventory = Partial<Record<ItemId, number>>;

export type ToolId = 'laser' | 'brush' | 'brick' | 'regolith' | 'ice' | 'seeds' | 'flag' | 'snack';
export type CropId = 'lettuce' | 'potato' | 'tomato' | 'pepper';
export type PowerSystemId = 'greenhouse' | 'electrolysis' | 'melter' | 'algae';

export type FactSource = 'DONKI' | 'RadLab' | 'OSDR' | 'CSA' | 'NASA Mars' | 'NASA';

export interface NasaFact {
  id: string;
  source: FactSource;
  title: string;
  text: string;
  tags?: string[];
}

export interface QuizQuestion {
  id: string;
  q: string;
  options: string[];
  answer: number;
  explain: string;
  source: FactSource;
}

export interface SampleDef {
  id: string;
  name: string;
  text: string;
  color: string;
  source: FactSource;
}

export interface FactsData {
  facts: NasaFact[];
  quiz: QuizQuestion[];
  samples: SampleDef[];
}

export type LunaMood = 'happy' | 'alert' | 'think' | 'wow' | 'sad';
export type Speaker = 'LUNA' | 'CAPCOM' | 'DONKI' | 'YOU';

export interface DialogueLine {
  who: Speaker;
  text: string;
  mood?: LunaMood;
}

export interface ObjectiveDef {
  id: string;
  text: string;
  /** Counted from MissionManager.emit(event). */
  event?: string;
  /** Polled predicate name (see MissionManager.STATE_CHECKS). */
  state?: string;
  count?: number;
  /** World target used for the on-screen guide arrow. */
  target?: string;
  /** Short kid-friendly tip LUNA gives if the player seems stuck. */
  hint?: string;
  /** Only counts once every earlier objective is complete. */
  ordered?: boolean;
}

export interface MissionDef {
  id: number;
  code: string;
  title: string;
  patch: string;
  summary: string;
  lesson: string;
  briefing: DialogueLine[];
  objectives: ObjectiveDef[];
  onStart?: string[];
  complete: DialogueLine[];
  fact?: string;
  rewards: { xp: number; items?: Inventory };
}

export interface BountyTemplate {
  id: string;
  text: string;
  event: string;
  min: number;
  max: number;
  xp: number;
  target?: string;
}

export interface MissionsData {
  intro: DialogueLine[];
  missions: MissionDef[];
  bounties: BountyTemplate[];
  graduation: DialogueLine[];
}

export interface GameData {
  missions: MissionsData;
  facts: FactsData;
}

export interface Profile {
  name: string;
  suitColor: string;
  skinTone: string;
  hairColor: string;
}

export interface Settings {
  muted: boolean;
  music: boolean;
  volume: number;
  easyMode: boolean;
  quickAirlock: boolean;
  /** How close the camera is. */
  zoom: 'far' | 'normal' | 'close';
  /** LUNA also shares fun facts and pop quizzes (off = only important steps and warnings). */
  lunaChatty: boolean;
  /** Older players can get manual power levels back (kids get simple ON/OFF + auto power). */
  expertPower: boolean;
  /** Size of all text in windows and LUNA's speech. */
  textSize: 'normal' | 'big' | 'huge';
  /** LUNA reads her lines and mission briefings aloud (browser speech). */
  voice: boolean;
  /** Which installed voice LUNA uses ('' = the most natural one available). */
  voiceName?: string;
  /** Settings were updated for automatic AI (v3 settings). */
  aiAuto?: boolean;
  /** Settings were moved to the cloud AI server. */
  aiCloud?: boolean;
  /** "Ask LUNA" AI answers: server address, model name and optional key. */
  aiEnabled: boolean;
  aiUrl: string;
  aiModel: string;
  aiKey: string;
}

export interface BadgeDef {
  id: string;
  name: string;
  text: string;
  /** Patch sprite name in the sprite sheet. */
  art: string;
  color: string;
}

/** Everything the Science Log remembers - persists across new games. */
export interface ScienceLogState {
  facts: string[];
  samples: string[];
  badges: string[];
  quizCorrect: string[];
}

export interface Stats {
  iceMined: number;
  tilesDug: number;
  cropsHarvested: number;
  panelsCleaned: number;
  samplesFound: number;
  distanceDriven: number; // tiles
  jetSeconds: number;
  deepest: number; // metres below surface
  flagsPlanted: number;
  medEvacs: number;
  flaresSurvived: number;
  stormsSurvived: number;
  meteoritesFound: number;
  bountiesDone: number;
  quizzesRight: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A thing you can press E on. */
export interface Interactable {
  id: string;
  /** World-space hit area (px). */
  x: number;
  y: number;
  w: number;
  h: number;
  label: () => string;
  enabled?: () => boolean;
  act: () => void;
}

// ───────────────────────── Save game ─────────────────────────

export interface PlayerSave {
  x: number;
  y: number;
  o2: number;
  health: number;
  /** Sprint stamina. */
  jet: number;
  pack: Inventory;
  hotbar: number;
  seed: CropId;
  inBase: boolean;
}

export interface RoverSave {
  x: number;
  y: number;
  battery: number;
  o2: number;
  trunk: Inventory;
}

export interface ResourceSave {
  o2: number;
  water: number;
  food: number;
  battery: number;
  storage: Inventory;
  power: Record<PowerSystemId, number>;
  valve: number;
  autoPower?: boolean;
  switches?: Record<PowerSystemId, boolean>;
  upgrades: Record<string, number>;
  beds: { crop: CropId | null; growth: number; water: number }[];
  algae: number;
  meltBuffer: number;
}

export interface WeatherSave {
  sol: number;
  time: number;
  solDose: number;
  storm: { active: boolean; t: number; duration: number; peak: number };
  flare: { phase: 'none' | 'warning' | 'active'; t: number; duration: number; cls: string; scripted: boolean };
}

export interface MissionSave {
  index: number;
  progress: Record<string, number>;
  done: boolean;
  graduated: boolean;
  bounties: { id: string; text: string; event: string; need: number; have: number; xp: number }[];
  xp: number;
  flags: Record<string, boolean>;
}

export interface WorldSave {
  tiles: [number, number][];
  panels: { dust: number; broken: boolean }[];
  pickups: { kind: string; x: number; y: number; taken: boolean; id: string; hidden?: boolean }[];
  samples: { id: string; taken: boolean }[];
  flags: { x: number; y: number }[];
  shelterSlots: number[];
  pduBroken: boolean;
  antenna: 'broken' | 'repaired' | 'online';
  partsInstalled: number;
}

export interface SaveData {
  version: number;
  savedAt: number;
  label: string;
  profile: Profile;
  player: PlayerSave;
  rover: RoverSave;
  res: ResourceSave;
  weather: WeatherSave;
  mission: MissionSave;
  world: WorldSave;
  stats: Stats;
  luna: { factsShared: string[]; seen?: string[] };
}
