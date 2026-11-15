/**
 * LocalStorage persistence.
 *  • autosave slot (written every new Sol, after missions, and when sleeping)
 *  • manual save slot (Pause menu → Save)
 *  • settings + profile + Science Log (persist across new games)
 * Every access is wrapped in try/catch so private browsing never crashes the game.
 */
import { AI_SERVER_URL, isOfficialAiUrl, SAVE_VERSION } from '../config';
import type { Profile, SaveData, ScienceLogState, Settings } from '../types';

const KEY = {
  auto: 'redsoil.o7.autosave',
  manual: 'redsoil.o7.manual',
  settings: 'redsoil.o7.settings',
  profile: 'redsoil.o7.profile',
  science: 'redsoil.o7.sciencelog',
  certificate: 'redsoil.o7.certificate',
};

export type SaveSlot = 'auto' | 'manual';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const DEFAULT_SETTINGS: Settings = {
  muted: false,
  music: true,
  volume: 0.7,
  easyMode: true,
  quickAirlock: false,
  zoom: 'normal',
  lunaChatty: false,
  expertPower: false,
  textSize: 'big',
  voice: true,
  aiEnabled: true,
  aiAuto: true,
  aiUrl: AI_SERVER_URL,
  aiCloud: true,
  aiModel: 'luna',
  aiKey: '',
};

export class StorageManager {
  save(slot: SaveSlot, data: SaveData): boolean {
    return write(KEY[slot], data);
  }

  load(slot: SaveSlot): SaveData | null {
    const d = read<SaveData>(KEY[slot]);
    if (!d || d.version !== SAVE_VERSION) return null;
    return d;
  }

  hasSave(slot: SaveSlot): boolean {
    return this.load(slot) !== null;
  }

  /** Most recent of the two slots (for "Continue"). */
  latest(): SaveData | null {
    const a = this.load('auto');
    const m = this.load('manual');
    if (a && m) return a.savedAt >= m.savedAt ? a : m;
    return a ?? m;
  }

  deleteSaves(): void {
    try {
      localStorage.removeItem(KEY.auto);
      localStorage.removeItem(KEY.manual);
    } catch {
      /* ignore */
    }
  }

  loadSettings(): Settings {
    const saved = read<Partial<Settings>>(KEY.settings) ?? {};
    const s = { ...DEFAULT_SETTINGS, ...saved };
    // v3: AI connects by itself now (no key), and LUNA's voice is calmer - turn both on once
    if (!saved.aiAuto) {
      s.aiEnabled = true;
      s.aiAuto = true;
      s.voice = true;
    }
    // LUNA's AI moved from a local LiteLLM server to the cloud server
    if (!saved.aiCloud) {
      s.aiUrl = AI_SERVER_URL;
      s.aiKey = '';
      s.aiCloud = true;
    }
    // our server moved (Cloud Run → Cloudflare Workers): follow it, but keep a teacher's own server
    if (!s.aiUrl.trim() || isOfficialAiUrl(s.aiUrl)) s.aiUrl = AI_SERVER_URL;
    return s;
  }
  saveSettings(s: Settings): void {
    write(KEY.settings, s);
  }

  loadProfile(): Profile | null {
    return read<Profile>(KEY.profile);
  }
  saveProfile(p: Profile): void {
    write(KEY.profile, p);
  }

  loadScience(): ScienceLogState {
    const s = read<Partial<ScienceLogState>>(KEY.science) ?? {};
    return { facts: s.facts ?? [], samples: s.samples ?? [], badges: s.badges ?? [], quizCorrect: s.quizCorrect ?? [] };
  }
  saveScience(s: ScienceLogState): void {
    write(KEY.science, s);
  }

  /** The last graduation certificate (so it can be re-opened from the main menu). */
  loadCertificate<T>(): T | null {
    return read<T>(KEY.certificate);
  }
  saveCertificate(c: unknown): void {
    write(KEY.certificate, c);
  }
}
