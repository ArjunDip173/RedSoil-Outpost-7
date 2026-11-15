/**
 * The game's window manager: opens modals and the dialogue box,
 * and tells the Game whether to pause / block input.
 */
import { voice } from '../core/Voice';
import type { Game } from '../Game';
import { openBaseOps, openFabricator, type OpsTab } from './BaseOpsModal';
import { showMissionComplete, showQuiz } from './Cards';
import { controlsTable } from './Controls';
import { DialogueBox } from './DialogueBox';
import { applyTextSize, button, el, iconText, spriteCanvas, type ModalStack } from './Dom';
import { showCertificate, type CertificateInfo } from './GraduationModal';
import { openScienceLog } from './ScienceLogModal';
import { openAskLuna } from './AskLunaModal';
import type { CropId, MissionDef } from '../types';
import { AI_SERVER_URL, CROPS } from '../config';

export class UIManager {
  stack: ModalStack;
  dialogue: DialogueBox;
  hideBubble = false;
  private game: Game;

  constructor(game: Game, root: HTMLElement, stack: ModalStack) {
    this.game = game;
    this.stack = stack;
    this.dialogue = new DialogueBox(root, game.art, game.audio);
  }

  /** Simulation should freeze. */
  get busy(): boolean {
    return this.stack.pausing || this.dialogue.active;
  }

  /** Keyboard/mouse should not reach the astronaut. */
  get blocking(): boolean {
    return this.stack.count > 0 || this.dialogue.active;
  }

  openBaseOps(tab: OpsTab): void {
    if (this.stack.count) return;
    openBaseOps(this.game, tab);
  }

  openFabricator(): void {
    if (this.stack.count) return;
    openFabricator(this.game);
  }

  openScienceLog(): void {
    const g = this.game;
    g.unlockFact('osdr', true);
    openScienceLog(
      this.stack,
      g.art,
      g.data,
      g.science,
      g.stats,
      g.missions.graduated ? () => this.openCertificate() : undefined,
    );
  }

  showQuiz(): void {
    if (this.stack.count || this.dialogue.active) return;
    showQuiz(this.game);
  }

  showMissionComplete(m: MissionDef, onDone: () => void): void {
    showMissionComplete(this.game, m, onDone);
  }

  openCertificate(onDone?: () => void): void {
    const info = this.game.storage.loadCertificate<CertificateInfo>();
    if (!info) return;
    showCertificate(this.stack, this.game.art, this.game.audio, info, onDone);
  }

  openPause(onQuit: () => void): void {
    if (this.stack.count || this.dialogue.active) return;
    const g = this.game;
    const m = this.stack.open({ title: 'PAUSED', size: 'sm', cls: 'pause-modal' });
    const col = el('div', 'menu-col');
    const toastSaved = (ok: boolean) =>
      g.toast(ok ? 'Game saved!' : 'Could not save (storage blocked)', ok ? '#5fd068' : '#ff5a5a');
    col.append(
      button('▶ Resume', () => m.close(), 'btn primary big'),
      button(
        'Save game',
        () => {
          toastSaved(g.save('manual'));
          m.close();
        },
        'btn',
        'ui_save',
      ),
      button(
        'Load last save',
        () => {
          m.close();
          g.requestLoad();
        },
        'btn',
        'ui_load',
      ),
      button(
        'Science Log',
        () => {
          m.close();
          this.openScienceLog();
        },
        'btn',
        'ui_book',
      ),
      ...(g.missions.graduated
        ? [
            button(
              'My certificate',
              () => {
                m.close();
                this.openCertificate();
              },
              'btn',
              'ui_cap',
            ),
          ]
        : []),
      button(
        'Settings',
        () => {
          m.close();
          this.openSettings();
        },
        'btn',
        'ui_gear',
      ),
      button(
        'Controls',
        () => {
          m.close();
          this.openControls();
        },
        'btn',
        'ui_gamepad',
      ),
      button(
        'Save & quit to menu',
        () => {
          g.save('auto');
          m.close();
          onQuit();
        },
        'btn ghost',
        'ui_home',
      ),
    );
    m.body.appendChild(col);
  }

  /** "NEW TOOL!" card: big icon, what it does and its key. */
  showNewTools(tools: { name: string; icon: string; hint: string; key: number }[], onDone: () => void): void {
    const g = this.game;
    const m = this.stack.open({
      title: tools.length > 1 ? 'NEW TOOLS!' : 'NEW TOOL!',
      size: 'sm',
      cls: 'newtool-modal',
      onClose: onDone,
    });
    for (const t of tools) {
      const row = el('div', 'newtool');
      const icon = el('div', 'newtool-icon');
      icon.appendChild(spriteCanvas(g.art.get(t.icon), 6));
      const txt = el('div', 'newtool-text');
      txt.append(
        el('div', 'newtool-name', t.name),
        el('div', 'newtool-hint', t.hint),
        el('div', 'newtool-key', `It's in your tool bar: slot ${t.key}`),
      );
      row.append(icon, txt);
      m.body.appendChild(row);
    }
    const ok = button('GOT IT! ▶', () => m.close(), 'btn primary big');
    m.body.appendChild(ok);
    g.audio.chime();
    setTimeout(() => ok.focus(), 50);
  }

  /** Big seed buttons (replaces 'press 6 again to switch seeds'). */
  openSeedPicker(onPick: (crop: CropId) => void): void {
    const g = this.game;
    const m = this.stack.open({ title: 'PICK A SEED TO PLANT', size: 'md', cls: 'seed-modal' });
    const grid = el('div', 'seed-grid');
    for (const c of Object.values(CROPS)) {
      const n = g.res.have(c.seedItem);
      const b = button(
        '',
        () => {
          m.close();
          onPick(c.id);
        },
        'seed-btn',
      );
      b.disabled = n <= 0;
      b.append(
        spriteCanvas(g.art.get(`icon_seed_${c.id}`), 4),
        el('span', 'seed-name', c.name),
        el('span', 'seed-count', n > 0 ? `${n} seeds` : 'none left'),
        iconText('icon_food', `${c.meals} meals`, 'seed-meals'),
      );
      grid.appendChild(b);
    }
    m.body.appendChild(grid);
  }

  openControls(): void {
    const m = this.stack.open({ title: 'CONTROLS', size: 'md' });
    m.body.appendChild(controlsTable());
  }

  openSettings(): void {
    const g = this.game;
    const s = g.settings;
    const m = this.stack.open({ title: 'SETTINGS', size: 'sm', onClose: () => g.storage.saveSettings(s) });
    const toggle = (label: string, get: () => boolean, set: (v: boolean) => void) => {
      const row = el('label', 'toggle');
      const cb = el('input');
      cb.type = 'checkbox';
      cb.checked = get();
      cb.addEventListener('change', () => {
        set(cb.checked);
        g.audio.blip();
      });
      row.append(cb, el('span', '', label));
      return row;
    };
    // pick LUNA's voice (best-sounding first) and hear it
    const voiceRow = () => {
      const row = el('div', 'row wrap voice-row');
      const sel = el('select', 'voice-select');
      sel.setAttribute('aria-label', "LUNA's voice");
      const list = voice.list();
      if (!list.length) sel.appendChild(new Option('No voices on this computer', ''));
      for (const v of list) sel.appendChild(new Option(`${v.name} (${v.lang})`, v.name));
      sel.value = voice.current()?.name ?? '';
      sel.addEventListener('change', () => {
        s.voiceName = sel.value;
        g.storage.saveSettings(s);
        voice.speak("Hi! I'm LUNA, your helper drone. Let's explore Mars together!", 'LUNA', true);
      });
      const test = button(
        '▶ Test',
        () => voice.speak("Hi! I'm LUNA, your helper drone. Let's explore Mars together!", 'LUNA', true),
        'btn small',
      );
      row.append(el('span', 'field-label', 'VOICE'), sel, test);
      return row;
    };
    const vol = el('input', 'valve-slider');
    vol.type = 'range';
    vol.min = '0';
    vol.max = '100';
    vol.value = String(Math.round(s.volume * 100));
    vol.addEventListener('input', () => {
      s.volume = Number(vol.value) / 100;
      g.audio.setVolume(s.volume);
    });
    m.body.append(
      toggle(
        'Sound on',
        () => !s.muted,
        (v) => {
          s.muted = !v;
          g.audio.setMuted(s.muted);
        },
      ),
      toggle(
        'Music on',
        () => s.music,
        (v) => {
          s.music = v;
          g.audio.setMusic(v);
        },
      ),
      el('div', 'muted small', 'Volume'),
      vol,
      toggle(
        'Easy Mode (suit oxygen lasts longer)',
        () => s.easyMode,
        (v) => (s.easyMode = v),
      ),
      toggle(
        'Quick airlock (one-click checklist)',
        () => s.quickAirlock,
        (v) => (s.quickAirlock = v),
      ),
      toggle(
        'LUNA reads her words out loud',
        () => s.voice,
        (v) => {
          s.voice = v;
          if (!v) g.luna.stopVoice();
        },
      ),
      voiceRow(),
      toggle(
        'LUNA also shares fun facts and pop quizzes',
        () => s.lunaChatty,
        (v) => (s.lunaChatty = v),
      ),
      el('p', 'muted small', 'When this is off, LUNA only tells you the important steps and warnings.'),
    );
    // text size
    const sizeRow = el('div', 'row wrap zoom-row');
    sizeRow.appendChild(el('span', 'field-label', 'TEXT'));
    const sizeBtns: HTMLButtonElement[] = [];
    for (const [z, label] of [
      ['normal', 'Aa'],
      ['big', 'Aa+'],
      ['huge', 'Aa++'],
    ] as const) {
      const b = button(
        label,
        () => {
          s.textSize = z;
          applyTextSize(z);
          g.storage.saveSettings(s);
          sizeBtns.forEach((x) => x.classList.toggle('active', x === b));
          g.audio.blip();
        },
        `tab ${s.textSize === z ? 'active' : ''}`,
      );
      sizeBtns.push(b);
      sizeRow.appendChild(b);
    }
    m.body.appendChild(sizeRow);
    // camera zoom
    const zoomRow = el('div', 'row wrap zoom-row');
    zoomRow.appendChild(el('span', 'field-label', 'ZOOM'));
    const zoomBtns: HTMLButtonElement[] = [];
    for (const [z, label] of [
      ['far', 'Far'],
      ['normal', 'Normal'],
      ['close', 'Close'],
    ] as const) {
      const b = button(
        label,
        () => {
          s.zoom = z;
          g.storage.saveSettings(s);
          (window as unknown as { __op7resize?: () => void }).__op7resize?.();
          zoomBtns.forEach((x) => x.classList.toggle('active', x === b));
          g.audio.blip();
        },
        `tab ${s.zoom === z ? 'active' : ''}`,
      );
      zoomBtns.push(b);
      zoomRow.appendChild(b);
    }
    m.body.appendChild(zoomRow);
    // Optional AI chat through a LiteLLM proxy
    const field = (label: string, value: string, set: (v: string) => void, type = 'text', placeholder = '') => {
      const wrap = el('label', 'field');
      const inp = el('input', 'name-input small-input');
      inp.type = type;
      inp.value = value;
      inp.placeholder = placeholder;
      inp.autocomplete = 'off';
      inp.addEventListener('input', () => set(inp.value));
      wrap.append(el('span', 'field-label', label), inp);
      return wrap;
    };
    const result = el('div', 'muted small');
    const testBtn = button(
      'Test connection',
      async () => {
        g.storage.saveSettings(s);
        result.textContent = 'Testing…';
        const r = await g.lunaAI.test();
        result.textContent = `${r.ok ? '✔' : '✖'} ${r.message}`;
        result.className = `small ${r.ok ? 'ok' : 'bad'}`;
      },
      'btn small',
    );
    const adv = el('details', 'advanced');
    adv.appendChild(el('summary', '', 'Advanced (for older players and teachers)'));
    adv.append(
      toggle(
        'Expert power: show kW numbers and set each machine by hand',
        () => s.expertPower,
        (v) => {
          s.expertPower = v;
          if (!v) g.res.setAutoPower(true);
        },
      ),
      el('h3', '', 'AI answers for LUNA'),
      el(
        'p',
        'muted small',
        'Ask LUNA uses AI answers from our server when you are online. Offline, she answers from the Science Log. You can point her at your own LiteLLM server instead.',
      ),
      toggle(
        'Use AI answers when online',
        () => s.aiEnabled,
        (v) => (s.aiEnabled = v),
      ),
      field('SERVER', s.aiUrl, (v) => (s.aiUrl = v), 'text', AI_SERVER_URL),
      field('MODEL', s.aiModel, (v) => (s.aiModel = v), 'text', 'luna'),
      field('KEY', s.aiKey, (v) => (s.aiKey = v), 'password', 'leave empty for the local server'),
      el(
        'p',
        'muted small',
        'Only needed for a LiteLLM server that asks for a key. Never put a Google or Anthropic key here.',
      ),
      testBtn,
      result,
    );
    m.body.appendChild(adv);
  }

  openAskLuna(): void {
    if (this.stack.count || this.dialogue.active) return;
    openAskLuna(this.game);
  }
}
