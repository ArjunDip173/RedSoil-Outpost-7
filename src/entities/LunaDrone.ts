/**
 * LUNA, the floating AI helper. Follows the player, speaks in a typewriter
 * speech bubble, gives hints and safety warnings, shares NASA facts and pops quiz questions.
 */
import { voice } from '../core/Voice';
import { type Ctx } from '../core/canvas';
import type { Game } from '../Game';
import type { LunaMood } from '../types';

interface Speech {
  text: string;
  mood: LunaMood;
  priority: number;
  shown: number;
  life: number;
}

/** Hints with a cooldown this long are tutorial tips that are only given once per save. */
const ONE_TIME = 3600;

export class LunaDrone {
  x = 0;
  y = 0;
  private vx = 0;
  private vy = 0;
  mood: LunaMood = 'happy';
  private speech: Speech | null = null;
  private queue: Speech[] = [];
  private cooldowns = new Map<string, number>();
  /** One-time tips already given (saved with the game, so they are not repeated after loading). */
  seen = new Set<string>();
  private blinkT = 3;
  private idleT = 0;
  factTimer = 70;
  quizTimer = 200;
  private scanRing = -1;
  factsShared: string[] = [];
  private bubble: HTMLDivElement;
  private bubbleText: HTMLSpanElement;
  private game: Game;

  constructor(game: Game, root: HTMLElement) {
    this.game = game;
    this.bubble = document.createElement('div');
    this.bubble.className = 'luna-bubble hidden';
    const name = document.createElement('b');
    name.textContent = 'LUNA';
    this.bubbleText = document.createElement('span');
    this.bubble.append(name, this.bubbleText);
    root.appendChild(this.bubble);
  }

  destroy(): void {
    this.bubble.remove();
  }

  snapTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  get speaking(): boolean {
    return !!this.speech;
  }

  /**
   * priority 0 = fun extra (facts, flavour) · 1 = guidance (mission steps, tips)
   * 2 = important · 3 = urgent safety. In "important only" mode, priority 0 is skipped.
   */
  say(text: string, mood: LunaMood = 'happy', priority = 1): void {
    if (priority <= 0 && !this.game.settings.lunaChatty) return;
    const s: Speech = { text, mood, priority, shown: 0, life: 3.2 + text.length * 0.055 };
    if (!this.speech || priority > this.speech.priority) {
      if (this.speech && this.speech.shown < this.speech.text.length) this.queue.unshift(this.speech);
      this.speech = s;
      this.mood = mood;
    } else if (this.queue.length < 4 && !this.queue.some((q) => q.text === text) && this.speech.text !== text) this.queue.push(s);
  }

  /** Say something at most once per `cooldown` seconds. A cooldown of an hour or more means "only ever once". */
  hint(key: string, text: string, mood: LunaMood = 'think', cooldown = 30, priority = 1): void {
    if (cooldown >= ONE_TIME) {
      if (this.seen.has(key)) return;
      this.seen.add(key);
    }
    const now = this.game.time;
    const until = this.cooldowns.get(key) ?? -Infinity;
    if (now < until) return;
    this.cooldowns.set(key, now + cooldown);
    this.say(text, mood, priority);
  }

  stopVoice(): void {
    voice.stop();
  }

  clear(): void {
    this.speech = null;
    this.queue = [];
    this.bubble.classList.add('hidden');
  }

  scan(): void {
    this.scanRing = 0;
    this.mood = 'wow';
  }

  update(dt: number): void {
    const g = this.game;
    const body = g.rover.driving ? g.rover : g.player;
    const facing = g.rover.driving ? g.rover.facing : g.player.facing;
    // LUNA hovers beside you; (x, y) is the spot on the ground under the drone
    const tx = body.x + body.w / 2 - facing * 22;
    const ty = body.y + body.h - 4;
    this.vx += (tx - this.x) * 18 * dt;
    this.vy += (ty - this.y) * 18 * dt;
    this.vx *= Math.pow(0.02, dt);
    this.vy *= Math.pow(0.02, dt);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (Math.hypot(tx - this.x, ty - this.y) > 260) this.snapTo(tx, ty);

    this.blinkT -= dt;
    if (this.blinkT < -0.14) this.blinkT = 2.5 + Math.random() * 3;
    if (this.scanRing >= 0) {
      this.scanRing += dt * 260;
      if (this.scanRing > 480) this.scanRing = -1;
    }

    // speech typewriter
    if (this.speech) {
      const s = this.speech;
      if (s.shown < s.text.length) {
        if (s.shown === 0 && !g.ui.blocking) voice.speak(s.text, 'LUNA');
        const before = Math.floor(s.shown);
        s.shown = Math.min(s.text.length, s.shown + dt * 55);
        if (Math.floor(s.shown) !== before && s.text[Math.floor(s.shown) - 1] !== ' ' && !voice.active) g.audio.talk();
      } else {
        s.life -= dt;
        if (s.life <= 0) {
          this.speech = this.queue.shift() ?? null;
          if (this.speech) this.mood = this.speech.mood;
        }
      }
      this.idleT = 0;
    } else {
      this.idleT += dt;
      if (this.idleT > 3) this.mood = g.weather.flare.phase !== 'none' ? 'alert' : 'happy';
    }

    // ambient facts & quizzes (only when calm)
    if (!g.ui.busy && !g.dialogueActive && g.settings.lunaChatty) {
      this.factTimer -= dt;
      this.quizTimer -= dt;
      if (this.factTimer <= 0 && !this.speech && this.idleT > 6) {
        this.factTimer = 95 + Math.random() * 40;
        this.shareFact();
      }
      if (this.quizTimer <= 0 && !this.speech && (g.player.inBase || g.player.o2 > 60) && g.weather.flare.phase === 'none' && g.missions.activeId() >= 2) {
        this.quizTimer = 230 + Math.random() * 90;
        g.ui.showQuiz();
      }
    }
  }

  private shareFact(): void {
    const g = this.game;
    const facts = g.data.facts.facts;
    const unseen = facts.filter((f) => !this.factsShared.includes(f.id));
    const pool = unseen.length ? unseen : facts;
    const f = pool[Math.floor(Math.random() * pool.length)];
    this.factsShared.push(f.id);
    this.say(`Fun fact! ${f.text}`, 'think', 0);
    g.unlockFact(f.id);
  }

  render(g: Ctx, camX: number, camY: number): void {
    const game = this.game;
    const hover = 26 + Math.round(Math.sin(game.time * 2.4) * 3);
    g.drawImage(game.art.get('shadow'), Math.round(this.x - 6 - camX), Math.round(this.y - 3 - camY), 12, 5);
    const sx = Math.round(this.x - 7 - camX);
    const sy = Math.round(this.y - hover - camY);
    // thruster glow
    const flick = Math.random() < 0.5 ? 1 : 0;
    g.fillStyle = 'rgba(127,227,255,0.55)';
    g.fillRect(sx + 5, sy + 13, 4, 2 + flick);
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.fillRect(sx + 6, sy + 13, 2, 1);
    const alert = game.weather.flare.phase === 'active';
    const mood = this.blinkT < 0 ? 'blink' : this.mood;
    game.art.draw(g, `luna_${mood}${alert ? '_red' : ''}`, sx, sy);
    // scan ring
    if (this.scanRing >= 0) {
      g.strokeStyle = `rgba(127,227,255,${1 - this.scanRing / 480})`;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(Math.round(this.x - camX), Math.round(this.y - 6 - camY), this.scanRing, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 1;
    }
    // DOM speech bubble positioned over the canvas
    if (this.speech && !game.ui.hideBubble && !game.ui.blocking) {
      this.bubble.classList.remove('hidden');
      this.bubbleText.textContent = this.speech.text.slice(0, Math.ceil(this.speech.shown));
      const scale = game.scale;
      const left = (sx + 7) * scale;
      const top = sy * scale;
      const w = this.bubble.offsetWidth;
      const clampedLeft = Math.max(8, Math.min(window.innerWidth - w - 8, left - w / 2));
      this.bubble.style.transform = `translate(${clampedLeft}px, ${Math.max(40, top - this.bubble.offsetHeight - 10)}px)`;
      this.bubble.dataset.mood = this.speech.mood;
    } else this.bubble.classList.add('hidden');
  }

  light(add: (x: number, y: number, r: number, i: number) => void): void {
    add(this.x, this.y - 14, 40, 0.7);
  }
}
