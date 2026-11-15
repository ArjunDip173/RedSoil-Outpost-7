/**
 * Mission briefings: portrait, speaker name and typewriter text.
 * Advance with click, Space, Enter or E.
 */
import { voice } from '../core/Voice';
import type { AudioEngine } from '../core/AudioEngine';
import { type Sprites } from '../core/Sprites';
import type { DialogueLine } from '../types';
import { el, spriteCanvas } from './Dom';

const PORTRAIT: Record<string, string> = {
  LUNA: 'luna_happy',
  CAPCOM: 'icon_dish',
  DONKI: 'icon_rad',
  YOU: 'portrait_player',
};
const NAMES: Record<string, string> = {
  LUNA: 'LUNA · AI Drone',
  CAPCOM: 'MISSION CONTROL · Earth',
  DONKI: 'NASA DONKI · Space Weather',
  YOU: 'YOU',
};

export class DialogueBox {
  private root: HTMLDivElement;
  private portrait: HTMLDivElement;
  private name: HTMLDivElement;
  private text: HTMLDivElement;
  private more: HTMLDivElement;
  private lines: DialogueLine[] = [];
  private i = 0;
  private shown = 0;
  private timer = 0;
  private done?: () => void;
  active = false;
  private art: Sprites;
  private audio: AudioEngine;

  constructor(host: HTMLElement, art: Sprites, audio: AudioEngine) {
    this.art = art;
    this.audio = audio;
    this.root = el('div', 'dialogue hidden');
    this.portrait = el('div', 'dlg-portrait');
    const right = el('div', 'dlg-main');
    this.name = el('div', 'dlg-name');
    this.text = el('div', 'dlg-text');
    this.more = el('div', 'dlg-more', '▼ click / SPACE');
    right.append(this.name, this.text, this.more);
    this.root.append(this.portrait, right);
    host.appendChild(this.root);
    this.root.addEventListener('click', () => this.advance());
    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (e.key === ' ' || e.key === 'Enter' || e.key.toLowerCase() === 'e') {
        e.preventDefault();
        this.advance();
      }
    });
  }

  show(lines: DialogueLine[], onDone?: () => void): void {
    if (!lines.length) {
      onDone?.();
      return;
    }
    this.lines = lines;
    this.i = 0;
    this.done = onDone;
    this.active = true;
    this.root.classList.remove('hidden');
    this.renderLine();
  }

  private renderLine(): void {
    const line = this.lines[this.i];
    this.shown = 0;
    this.name.textContent = NAMES[line.who] ?? line.who;
    this.root.dataset.who = line.who;
    this.portrait.innerHTML = '';
    let key = PORTRAIT[line.who] ?? 'luna_happy';
    if (line.who === 'LUNA' && line.mood) key = `luna_${line.mood}`;
    const img = this.art.get(key);
    this.portrait.appendChild(spriteCanvas(img, Math.max(3, Math.floor(64 / img.width))));
    this.text.textContent = '';
    this.more.style.visibility = 'hidden';
    clearInterval(this.timer);
    voice.speak(line.text, line.who);
    this.timer = window.setInterval(() => {
      this.shown += 2;
      const t = line.text;
      this.text.textContent = t.slice(0, this.shown);
      if (this.shown % 4 === 0 && !voice.active) this.audio.talk();
      if (this.shown >= t.length) {
        clearInterval(this.timer);
        this.more.style.visibility = 'visible';
        this.more.textContent = this.i < this.lines.length - 1 ? '▼ click / SPACE' : '✔ click / SPACE to continue';
      }
    }, 22);
  }

  advance(): void {
    if (!this.active) return;
    const line = this.lines[this.i];
    if (this.shown < line.text.length) {
      this.shown = line.text.length;
      clearInterval(this.timer);
      this.text.textContent = line.text;
      this.more.style.visibility = 'visible';
      return;
    }
    this.audio.blip();
    this.i++;
    if (this.i >= this.lines.length) {
      this.close();
      const cb = this.done;
      this.done = undefined;
      cb?.();
    } else this.renderLine();
  }

  close(): void {
    clearInterval(this.timer);
    voice.stop();
    this.active = false;
    this.root.classList.add('hidden');
  }

  destroy(): void {
    this.close();
    this.root.remove();
  }
}
