/** Title screen: live view of the outpost behind the menu, profile creator, credits. */
import {
  BASE_X,
  BASE_Y,
  GAME_TITLE,
  HAIR_COLORS,
  LANDMARKS,
  PANEL_W,
  SKIN_TONES,
  SUIT_COLORS,
  TEAM_NAME,
  TILE,
} from '../config';
import type { AudioEngine } from '../core/AudioEngine';
import { type Ctx } from '../core/canvas';
import { Sprites } from '../core/Sprites';
import type { StorageManager } from '../core/StorageManager';
import type { GameData, Profile, SaveData, Settings } from '../types';
import { controlsTable } from './Controls';
import { button, el, icon, iconText, type ModalStack, spriteCanvas } from './Dom';
import { type CertificateInfo, showCertificate } from './GraduationModal';
import { openScienceLog } from './ScienceLogModal';
import { BaseHabitat } from '../world/BaseHabitat';
import { TileMap } from '../world/TileMap';
import { drawPanel } from '../world/WorldObjects';

export interface MenuHandlers {
  onNew: (profile: Profile) => void;
  onContinue: (save: SaveData) => void;
}

export class MainMenu {
  private root: HTMLDivElement;
  private map: TileMap;
  private roof: HTMLCanvasElement;
  private art: Sprites;
  private audio: AudioEngine;
  private storage: StorageManager;
  private stack: ModalStack;
  private data: GameData;
  private settings: Settings;
  private handlers: MenuHandlers;

  constructor(
    host: HTMLElement,
    art: Sprites,
    audio: AudioEngine,
    storage: StorageManager,
    stack: ModalStack,
    data: GameData,
    settings: Settings,
    handlers: MenuHandlers,
  ) {
    this.art = art;
    this.audio = audio;
    this.storage = storage;
    this.stack = stack;
    this.data = data;
    this.settings = settings;
    this.handlers = handlers;
    // a live top-down view of Outpost 7 slowly panning behind the menu
    this.map = new TileMap();
    BaseHabitat.build(this.map);
    this.roof = art.get('roof');
    this.root = el('div', 'menu');
    host.appendChild(this.root);
    this.build();
  }

  destroy(): void {
    this.root.remove();
  }

  private build(): void {
    this.root.innerHTML = '';
    const title = el('div', 'menu-title');
    title.append(
      el('div', 'title-top', 'RED SOIL'),
      el('div', 'title-main', 'OUTPOST 7'),
      el('div', 'title-sub', 'Junior Astronaut Mission Trainer'),
    );
    const col = el('div', 'menu-col');
    const latest = this.storage.latest();
    if (latest) {
      const mi = latest.mission.index < 6 ? `Mission ${latest.mission.index + 1}` : 'Bounties';
      col.appendChild(
        button(
          `CONTINUE · ${latest.profile.name} · Sol ${latest.weather.sol} · ${mi}`,
          () => this.handlers.onContinue(latest),
          'btn primary big',
          'ui_rocket',
        ),
      );
    }
    col.appendChild(
      button('NEW MISSION', () => this.newMission(!!latest), latest ? 'btn big' : 'btn primary big', 'icon_star'),
    );
    const manual = this.storage.load('manual');
    if (manual && latest !== manual)
      col.appendChild(
        button(
          `LOAD MANUAL SAVE · Sol ${manual.weather.sol}`,
          () => this.handlers.onContinue(manual),
          'btn',
          'ui_load',
        ),
      );
    const row = el('div', 'menu-row');
    row.append(
      button(
        'SCIENCE LOG',
        () => {
          const cert = this.storage.loadCertificate<CertificateInfo>();
          openScienceLog(
            this.stack,
            this.art,
            this.data,
            this.storage.loadScience(),
            null,
            cert ? () => showCertificate(this.stack, this.art, this.audio, cert) : undefined,
          );
        },
        'btn',
        'ui_book',
      ),
      button(
        'CONTROLS',
        () => {
          const m = this.stack.open({ title: 'CONTROLS', size: 'md' });
          m.body.appendChild(controlsTable());
        },
        'btn',
        'ui_gamepad',
      ),
      button('CREDITS', () => this.credits(), 'btn', 'ui_info'),
    );
    col.appendChild(row);
    const muteLabel = () => (this.settings.muted ? 'Sound off' : 'Sound on');
    const mute = button(
      muteLabel(),
      () => {
        this.settings.muted = !this.settings.muted;
        this.audio.setMuted(this.settings.muted);
        this.storage.saveSettings(this.settings);
        mute.replaceChildren(icon(this.settings.muted ? 'ui_mute' : 'ui_sound'), document.createTextNode(muteLabel()));
      },
      'btn ghost small',
      this.settings.muted ? 'ui_mute' : 'ui_sound',
    );
    col.appendChild(mute);
    const foot = el(
      'div',
      'menu-foot',
      `Developed by ${TEAM_NAME} · 2026 NASA Space Apps Challenge · SI-assisted art & audio`,
    );
    this.root.append(title, col, foot);
  }

  private newMission(hasSave: boolean): void {
    this.audio.select();
    const prev = this.storage.loadProfile();
    const profile: Profile = prev ?? {
      name: 'Cadet',
      suitColor: SUIT_COLORS[0],
      skinTone: SKIN_TONES[1],
      hairColor: HAIR_COLORS[0],
    };
    const m = this.stack.open({ title: 'ASTRONAUT PROFILE', size: 'md', cls: 'profile-modal' });
    const preview = el('div', 'profile-preview');
    const drawPreview = () => {
      this.art.tintProfile(profile);
      preview.innerHTML = '';
      preview.append(
        spriteCanvas(this.art.get('astro_eva_idle_down'), 6),
        spriteCanvas(this.art.get('astro_iva_idle_down'), 6),
      );
    };
    const name = el('input', 'name-input');
    name.maxLength = 14;
    name.value = profile.name;
    name.placeholder = 'Your astronaut name';
    name.setAttribute('aria-label', 'Astronaut name');
    name.addEventListener('input', () => (profile.name = name.value.trim() || 'Cadet'));
    name.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') start.click();
    });
    const swatches = (label: string, colors: string[], key: 'suitColor' | 'skinTone' | 'hairColor') => {
      const wrap = el('div', 'swatch-row');
      wrap.appendChild(el('span', 'swatch-label', label));
      for (const c of colors) {
        const b = button(
          '',
          () => {
            profile[key] = c;
            wrap.querySelectorAll('.swatch-btn').forEach((x) => x.classList.remove('sel'));
            b.classList.add('sel');
            drawPreview();
            this.audio.blip();
          },
          `swatch-btn ${profile[key] === c ? 'sel' : ''}`,
        );
        b.style.background = c;
        b.setAttribute('aria-label', `${label} ${c}`);
        wrap.appendChild(b);
      }
      return wrap;
    };
    const easy = el('label', 'toggle');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = this.settings.easyMode;
    cb.addEventListener('change', () => (this.settings.easyMode = cb.checked));
    easy.append(cb, el('span', '', 'Easy Mode: suit oxygen lasts longer (recommended for first-timers)'));
    const warn = hasSave
      ? iconText(
          'ui_warn',
          'Starting a new mission replaces your current autosave. (Your Science Log collection is kept!)',
          'callout warn',
        )
      : el('div');
    const start = button(
      'LAUNCH TO MARS',
      () => {
        profile.name = name.value.trim() || 'Cadet';
        this.storage.saveProfile(profile);
        this.storage.saveSettings(this.settings);
        m.opts.onClose = undefined;
        m.close();
        this.handlers.onNew(profile);
      },
      'btn primary big',
      'ui_rocket',
    );
    const form = el('div', 'profile-form');
    form.append(
      el('label', 'field-label', 'NAME'),
      name,
      swatches('SUIT', SUIT_COLORS, 'suitColor'),
      swatches('SKIN', SKIN_TONES, 'skinTone'),
      swatches('HAIR', HAIR_COLORS, 'hairColor'),
      easy,
    );
    const wrap = el('div', 'profile-wrap');
    wrap.append(preview, form);
    m.body.append(wrap, warn, start);
    drawPreview();
    setTimeout(() => name.focus(), 50);
  }

  private credits(): void {
    const m = this.stack.open({ title: 'CREDITS', size: 'md', cls: 'credits-modal' });
    m.body.innerHTML = `
      <h3>${GAME_TITLE}</h3>
      <p>Developed by <b>${TEAM_NAME}</b> for the <b>2026 NASA Space Apps Challenge</b>: “Build a Junior Astronaut Mission Trainer”.</p>
      <h3>Science sources</h3>
      <ul>
        <li><b>NASA DONKI</b> (Space Weather Database Of Notifications, Knowledge, Information): solar flares, CMEs and SEP alerts.</li>
        <li><b>Radiation science</b>: Curiosity’s RAD instrument and ISS dosimetry (in-game “RadLab” facts).</li>
        <li><b>NASA OSDR</b> (Open Science Data Repository): space biology &amp; plant growth.</li>
        <li><b>Canadian Space Agency</b>: Canadarm2, Phoenix’s weather station, Curiosity’s APXS, Artemis II.</li>
        <li>NASA Mars Exploration Program missions: Phoenix, Spirit, Opportunity, Curiosity, Perseverance, InSight, MAVEN, Ingenuity.</li>
      </ul>
      <h3>Made with help from SI</h3>
      <p>The game idea, missions and story are by ${TEAM_NAME}: Arjun Dip Shrestha, Hardik Lamichhane, Aatish Karki, Aayushman Nidhi Tiwari and Sunny Kumar Gupta. We drew the original pixel art, which was later modified and enhanced with SI. Most of the sound effects and the music were generated with AI. Claude (by Anthropic) helped us rewrite the game in HTML5, combine our sprites into sprite sheets, build LUNA's AI chat and voice, fix bugs and add features. LUNA's chat answers are written live by Google Gemini and are marked "AI answer". LUNA's voice is your browser's built-in text-to-speech.</p>
      <h3>Fonts</h3>
      <p>Press Start 2P by CodeMan38 and VT323 by Peter Hull (SIL Open Font License).</p>
      <p class="muted small">Gameplay numbers are simplified and sped up for learning. ${GAME_TITLE} is a hackathon project and is not an official NASA product.</p>`;
  }

  render(g: Ctx, vw: number, vh: number, t: number): void {
    const art = this.art;
    const camX = Math.round(BASE_X * TILE - vw / 2 + 200 + Math.sin(t * 0.06) * 260);
    const camY = Math.round(BASE_Y * TILE - vh / 2 + 330 + Math.sin(t * 0.045) * 60);
    g.fillStyle = '#120a0a';
    g.fillRect(0, 0, vw, vh);
    this.map.renderGround(g, art, camX, camY, vw, vh, t);
    const list: { y: number; draw: () => void }[] = [];
    this.map.forEachObject(camX, camY, vw, vh, (tx, ty) =>
      list.push({ y: (ty + 1) * TILE, draw: () => this.map.drawObject(g, art, tx, ty, camX, camY, t) }),
    );
    // solar field
    const F = LANDMARKS.solarField;
    for (let k = 0; k < 6; k++) {
      const x = (F.x + (k % F.cols) * F.dx) * TILE + 9 - PANEL_W / 2;
      const y = (F.y + Math.floor(k / F.cols) * F.dy + 1) * TILE;
      const panel = { x, y, dust: 0.15, broken: false, folded: false, open: 1, wear: 0, shine: 0 };
      list.push({ y, draw: () => drawPanel(g, panel, x - camX, y - camY, t) });
    }
    // rover driving back and forth south of the base
    const rp = (t * 0.08) % 2;
    const dirRight = rp < 1;
    const rx = (BASE_X - 6) * TILE + (dirRight ? rp : 2 - rp) * 30 * TILE;
    const ry = (BASE_Y + 19) * TILE;
    list.push({
      y: ry,
      draw: () => {
        g.drawImage(art.get('shadow'), rx - 22 - camX, ry - 4 - camY, 44, 8);
        g.save();
        g.translate(Math.round(rx - camX), Math.round(ry - 28 - camY));
        if (!dirRight) g.scale(-1, 1);
        g.drawImage(art.get('rover'), -28, 0);
        const f = Math.floor(t * 8) % 4;
        for (const wx of [10, 28, 46]) g.drawImage(art.get(`wheel_${f}`), wx - 34, 16);
        g.restore();
      },
    });
    // astronaut walking on a loop + LUNA
    const ax = (BASE_X + 3) * TILE + 8 + Math.sin(t * 0.5) * 40;
    const ay = (BASE_Y + 18) * TILE + 4;
    const walkFrame = ['walkA', 'idle', 'walkB', 'idle'][Math.floor(t * 6) % 4];
    list.push({
      y: ay,
      draw: () => {
        g.drawImage(art.get('shadow'), ax - 8 - camX, ay - 4 - camY);
        const going = Math.cos(t * 0.5) > 0;
        art.draw(
          g,
          `astro_eva_${walkFrame === 'idle' ? 'idle' : walkFrame === 'walkA' ? 'walkA' : 'walkC'}_down`,
          ax - 12 - camX,
          ay - 24 - camY,
          !going,
        );
        g.drawImage(art.get('shadow'), ax + 14 - camX, ay - 3 - camY, 12, 5);
        art.draw(g, 'luna_happy', ax + 13 - camX, ay - 30 + Math.sin(t * 2.4) * 3 - camY);
      },
    });
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.draw();
    g.drawImage(this.roof, BASE_X * TILE - 8 * 0 - camX, BASE_Y * TILE - 8 - camY);
    // darken for the menu text
    const grad = g.createLinearGradient(0, 0, 0, vh);
    grad.addColorStop(0, 'rgba(10,5,12,0.75)');
    grad.addColorStop(0.5, 'rgba(10,5,12,0.45)');
    grad.addColorStop(1, 'rgba(10,5,12,0.7)');
    g.fillStyle = grad;
    g.fillRect(0, 0, vw, vh);
  }
}
