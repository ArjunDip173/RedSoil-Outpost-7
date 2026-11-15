/**
 * Entry point & screen state machine:  LOADING → MENU ⇄ GAME.
 * Owns the canvas (rendered at a low "virtual" resolution and scaled up crisply),
 * the requestAnimationFrame loop, and the shared engine services.
 */
import '@fontsource/press-start-2p/latin-400.css';
import '@fontsource/vt323/latin-400.css';
import './style.css';
// Game data is bundled into the build so the game runs from a double-clicked .html file.
import factsJson from '../public/resources/data/nasa_facts.json';
import missionsJson from '../public/resources/data/missions.json';
import { HAIR_COLORS, SKIN_TONES, SUIT_COLORS } from './config';
import { AudioEngine } from './core/AudioEngine';
import { InputManager } from './core/InputManager';
import { Sprites } from './core/Sprites';
import { StorageManager } from './core/StorageManager';
import { Game } from './Game';
import type { FactsData, GameData, MissionsData, Profile, SaveData } from './types';
import { applyTextSize, ModalStack, useIconSheet } from './ui/Dom';
import { voice } from './core/Voice';
import { LoadingScreen, wait } from './ui/LoadingScreen';
import { playIntro } from './ui/IntroCutscene';
import { MainMenu } from './ui/MainMenu';

type Screen = 'loading' | 'menu' | 'intro' | 'game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const root = document.getElementById('ui-root') as HTMLDivElement;
const ctx = canvas.getContext('2d', { alpha: false })!;

let screen: Screen = 'loading';
/** World view (zoomed in) and HUD (less zoomed) are drawn on two small pixel canvases,
 *  then scaled up crisply onto the full-size screen canvas. */
const worldBuf = document.createElement('canvas');
const wctx = worldBuf.getContext('2d')!;
const hudBuf = document.createElement('canvas');
const hctx = hudBuf.getContext('2d')!;
let vw = 360;
let vh = 225;
let scale = 4;
let hw = 720;
let hh = 450;
let hudScale = 2;
let game: Game | null = null;
let menu: MainMenu | null = null;

const input = new InputManager(canvas);
const audio = new AudioEngine();
const storage = new StorageManager();
const settings = storage.loadSettings();
applyTextSize(settings.textSize);
voice.configure(() => settings.voice && !settings.muted, () => settings.volume, () => settings.voiceName ?? '');
const stack = new ModalStack(root);
stack.onBlip = () => audio.blip();

/** Pick an integer pixel scale so the virtual screen is roughly 560×320 or larger. */
const ZOOM_WIDTH = { far: 600, normal: 440, close: 320 } as const;

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  hudScale = Math.max(2, Math.floor(Math.min(w / 560, h / 320)));
  if (w < 700) hudScale = Math.max(1, Math.floor(Math.min(w / 360, h / 220)));
  // world zoom: about 26–30 tiles across on "normal", never less zoomed than the HUD
  scale = Math.max(hudScale, Math.round(w / ZOOM_WIDTH[settings.zoom ?? 'normal']));
  scale = Math.min(scale, Math.max(hudScale, Math.floor(h / 150)));
  vw = Math.ceil(w / scale);
  vh = Math.ceil(h / scale);
  hw = Math.ceil(w / hudScale);
  hh = Math.ceil(h / hudScale);
  canvas.width = w;
  canvas.height = h;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  worldBuf.width = vw;
  worldBuf.height = vh;
  hudBuf.width = hw;
  hudBuf.height = hh;
  for (const c of [ctx, wctx, hctx]) c.imageSmoothingEnabled = false;
  input.setScales(hudScale, scale);
  document.documentElement.style.setProperty('--px', `${hudScale}px`);
  game?.resize(vw, vh, scale, hw, hh, hudScale);
}
/** Let the Settings screen change the zoom live. */
(window as unknown as Record<string, unknown>).__op7resize = resize;
window.addEventListener('resize', resize);
resize();

/** Show any unexpected error on screen instead of failing silently. */
function showError(msg: string): void {
  let box = document.getElementById('err-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'err-box';
    box.className = 'err-box';
    document.body.appendChild(box);
  }
  box.textContent = `Something went wrong: ${msg}`;
  setTimeout(() => box?.remove(), 9000);
}
window.addEventListener('error', (e) => showError(e.message));
window.addEventListener('unhandledrejection', (e) => showError(String((e as PromiseRejectionEvent).reason)));

let art: Sprites;
let data: GameData;

function defaultProfile(): Profile {
  return { name: 'Cadet', suitColor: SUIT_COLORS[0], skinTone: SKIN_TONES[1], hairColor: HAIR_COLORS[0] };
}

async function boot(): Promise<void> {
  const ls = new LoadingScreen(root);
  ls.log('Booting habitat computer…', 'info');
  ls.progress(0.05);
  try {
    await Promise.race([Promise.all([document.fonts.load('8px "Press Start 2P"'), document.fonts.load('16px VT323')]), wait(2500)]);
  } catch {
    /* fonts are optional */
  }
  await wait(250);
  ls.log('Pressure hull integrity ............ 100%');
  ls.progress(0.2);
  await wait(200);
  art = await Sprites.load();
  art.tintProfile(storage.loadProfile() ?? defaultProfile());
  useIconSheet(art);
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__op7 = { art, audio, get game() { return game; } };
  ls.log(`Sprite sheets ....................... ${art.sprites.size} sprites`);
  ls.progress(0.45);
  await audio.load();
  ls.log(`Sound bank .......................... ${audio.soundCount} sounds`);
  data = { missions: missionsJson as unknown as MissionsData, facts: factsJson as unknown as FactsData };
  ls.progress(0.65);
  ls.log(`Mission plan ........................ ${data.missions.missions.length} training missions`);
  await wait(200);
  ls.log(`Science database .................... ${data.facts.facts.length} facts (DONKI · RadLab · OSDR · CSA)`);
  ls.progress(0.8);
  await wait(200);
  ls.log('Solar array ......................... 78% dust coverage', 'warn');
  await wait(160);
  ls.log('Deep Space Antenna .................. NO SIGNAL FROM EARTH', 'warn');
  await wait(160);
  ls.log('LUNA AI drone ....................... online');
  ls.progress(1);
  await ls.waitForStart();
  audio.unlock();
  audio.setMuted(settings.muted);
  audio.setVolume(settings.volume);
  audio.setMusic(settings.music);
  audio.chime();
  ls.destroy();
  showMenu();
  requestAnimationFrame(loop);
}

function showMenu(): void {
  game?.destroy();
  game = null;
  stack.closeAll();
  screen = 'menu';
  menu?.destroy();
  menu = new MainMenu(root, art, audio, storage, stack, data, settings, {
    onNew: (profile) => {
      // new game: the rocket trip from Earth plays first
      menu?.destroy();
      menu = null;
      screen = 'intro';
      void playIntro(root, art, audio, profile.name).then(() => startGame(profile, null));
    },
    onContinue: (save) => startGame(save.profile, save),
  });
}

function startGame(profile: Profile, save: SaveData | null): void {
  try {
    launch(profile, save);
  } catch (e) {
    console.error(e);
    showError((e as Error).message);
    showMenu();
  }
}

function launch(profile: Profile, save: SaveData | null): void {
  game?.destroy();
  game = null;
  menu?.destroy();
  menu = null;
  stack.closeAll();
  art.tintProfile(profile);
  game = new Game({
    ctx: wctx,
    hudCtx: hctx,
    art,
    audio,
    input,
    storage,
    data,
    profile,
    settings,
    root,
    stack,
    onQuit: () => showMenu(),
    onLoadRequest: () => {
      const s = storage.latest();
      if (s) startGame(s.profile, s);
    },
  });
  game.resize(vw, vh, scale, hw, hh, hudScale);
  if (save) game.loadSave(save);
  else {
    storage.deleteSaves();
    game.startNew();
  }
  screen = 'game';
  input.clear();
}

// pause automatically when the tab is hidden
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game && screen === 'game' && !game.ui.blocking) game.openPause();
});

let last = performance.now();
let menuT = 0;
function loop(now: number): void {
  const dt = Math.min(1 / 30, (now - last) / 1000);
  last = now;
  if (screen === 'menu' && menu) {
    menuT += dt;
    input.blocked = true;
    menu.render(wctx, vw, vh, menuT);
    audio.updateMusic(dt, 'calm');
    ctx.drawImage(worldBuf, 0, 0, vw * scale, vh * scale);
  } else if (screen === 'game' && game) {
    game.update(dt);
    if (game) {
      game.render();
      ctx.drawImage(worldBuf, 0, 0, vw * scale, vh * scale);
      ctx.drawImage(hudBuf, 0, 0, hw * hudScale, hh * hudScale);
    }
  }
  input.endFrame();
  requestAnimationFrame(loop);
}

void boot();
