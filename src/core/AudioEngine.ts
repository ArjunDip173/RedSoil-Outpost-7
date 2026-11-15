/**
 * Plays the sound files in src/assets/audio with the Web Audio API.
 *
 *  *.wav        one-shot effects (blip, chime, alarm…)
 *  loop_*.wav   held sounds that loop while something happens (laser, rover, wind…)
 *  music_*.mp3  background music: a calm loop and a tense loop for storms and flares
 *
 * Files are decoded once at start-up; the AudioContext itself starts on the first click
 * because browsers block sound until the player interacts with the page.
 */

const FILES = import.meta.glob('../assets/audio/*.{wav,mp3}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

type LoopName = 'thruster' | 'laser' | 'rover' | 'wind' | 'brush';
type Mood = 'calm' | 'tense';

/** Per-sound loudness, so the mix stays balanced. */
const GAIN: Record<string, number> = { geiger: 0.8, step: 0.7, talk: 0.8 };
const MUSIC_GAIN = 0.11;

interface PlayingLoop {
  src: AudioBufferSourceNode;
  gain: GainNode;
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  muted = false;
  musicOn = true;
  volume = 0.7;
  private buffers = new Map<string, AudioBuffer>();
  private master!: GainNode;
  private sfx!: GainNode;
  private musicBus!: GainNode;
  private loops = new Map<LoopName, PlayingLoop>();
  private music = new Map<Mood, GainNode>();
  private lastTalk = 0;

  get soundCount(): number {
    return this.buffers.size;
  }

  /** Decode every sound file (no AudioContext needed yet). */
  async load(): Promise<void> {
    const decoder = new OfflineAudioContext(1, 1, 44100);
    await Promise.all(
      Object.entries(FILES).map(async ([path, url]) => {
        const name = path.split('/').pop()!.replace(/\.(wav|mp3)$/, '');
        try {
          const data = await (await fetch(url)).arrayBuffer();
          this.buffers.set(name, await decoder.decodeAudioData(data));
        } catch {
          // a missing sound should never stop the game
        }
      }),
    );
  }

  /** Must be called from a user gesture (browser autoplay rules). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicOn ? 1 : 0;
    this.musicBus.connect(this.master);
    this.applyVolume();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyVolume();
  }

  setMusic(on: boolean): void {
    this.musicOn = on;
    if (this.ctx) this.musicBus.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.3);
  }

  setVolume(v: number): void {
    this.volume = v;
    this.applyVolume();
  }

  private applyVolume(): void {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.05);
  }

  private get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Play a one-shot sound. `rate` changes pitch and speed together. */
  private play(name: string, rate = 1): void {
    const buf = this.buffers.get(name);
    if (!this.ready || !buf) return;
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = GAIN[name] ?? 1;
    src.connect(g);
    g.connect(this.sfx);
    src.start();
  }

  // ───────────── one-shot effects ─────────────

  blip(): void {
    this.play('blip');
  }
  select(): void {
    this.play('select');
  }
  error(): void {
    this.play('error');
  }
  /** LUNA's typewriter voice, rate-limited so it never gets noisy. */
  talk(): void {
    if (!this.ready) return;
    const now = this.ctx!.currentTime;
    if (now - this.lastTalk < 0.05) return;
    this.lastTalk = now;
    this.play('talk', 0.85 + Math.random() * 0.4);
  }
  step(): void {
    this.play('step', 0.85 + Math.random() * 0.3);
  }
  mineBreak(): void {
    this.play('mine_break');
  }
  pickup(): void {
    this.play('pickup');
  }
  place(): void {
    this.play('place');
  }
  splash(): void {
    this.play('splash', 0.9 + Math.random() * 0.2);
  }
  /** Airlock / O2 refill hiss: `down` = pressure dropping. */
  hiss(down = true): void {
    this.play(down ? 'hiss_down' : 'hiss_up');
  }
  geiger(): void {
    this.play('geiger', 0.9 + Math.random() * 0.3);
  }
  alarm(): void {
    this.play('alarm');
  }
  warn(): void {
    this.play('warn');
  }
  spark(): void {
    this.play('spark');
  }
  wireConnect(): void {
    this.play('wire_connect');
  }
  chime(): void {
    this.play('chime');
  }
  victory(): void {
    this.play('victory');
  }
  meteor(): void {
    this.play('meteor');
  }
  harvest(): void {
    this.play('harvest');
  }
  scan(): void {
    this.play('scan');
  }
  craft(): void {
    this.play('craft');
  }

  // ───────────── held loops ─────────────

  /** Set a held sound's level (0 = silent). `pitch` (0..1) speeds up the rover engine and the wind. */
  loop(name: LoopName, level: number, pitch = 0.5): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    let l = this.loops.get(name);
    if (!l) {
      if (level <= 0) return;
      const buf = this.buffers.get(`loop_${name}`);
      if (!buf) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain);
      gain.connect(this.sfx);
      src.start();
      l = { src, gain };
      this.loops.set(name, l);
    }
    l.gain.gain.setTargetAtTime(Math.max(0, level), ctx.currentTime, 0.06);
    if (name === 'rover' || name === 'wind') l.src.playbackRate.setTargetAtTime(0.75 + pitch * 0.6, ctx.currentTime, 0.15);
  }

  stopAllLoops(): void {
    for (const name of this.loops.keys()) this.loop(name, 0);
  }

  // ───────────── music ─────────────

  /** Call every frame: starts the music once and cross-fades between the calm and tense loops. */
  updateMusic(_dt: number, mood: Mood = 'calm'): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    if (!this.music.size) {
      for (const m of ['calm', 'tense'] as Mood[]) {
        const buf = this.buffers.get(`music_${m}`);
        if (!buf) continue;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const g = ctx.createGain();
        g.gain.value = 0;
        src.connect(g);
        g.connect(this.musicBus);
        src.start();
        this.music.set(m, g);
      }
    }
    for (const [m, g] of this.music) g.gain.setTargetAtTime(m === mood ? MUSIC_GAIN : 0, ctx.currentTime, 1.2);
  }
}
