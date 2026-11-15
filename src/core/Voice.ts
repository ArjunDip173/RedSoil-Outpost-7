/**
 * LUNA reads her lines and the mission briefings aloud with the browser's
 * built-in speech (Web Speech API). No server or key needed. It picks the most natural
 * English voice the computer has (Edge "Natural", Chrome "Google", macOS Premium/Enhanced
 * voices…), speaks at a normal pitch and a calm speed, and skips the novelty voices.
 * Players can pick another voice (and test it) in Settings, or turn it off.
 */

/** Words that should be spelled out or said a special way. */
const SAY_AS: [RegExp, string][] = [
  [/\bLUNA\b/g, 'Luna'],
  [/\bDONKI\b/g, 'Donkey'],
  [/\bWASD\b/g, 'W A S D'],
  [/\bH2O\b/g, 'H 2 O'],
  [/\bO2\b/g, 'O 2'],
  [/\bCO2\b/g, 'C O 2'],
  [/\bkW\b/g, 'kilowatts'],
  [/\bSOL\b/g, 'Sol'],
  [/\bEVA\b/g, 'E V A'],
  [/\bPDU\b/g, 'P D U'],
];
const KEEP_CAPS = new Set(['NASA', 'MOXIE', 'ESA', 'CSA', 'JAXA', 'ISS', 'RAD', 'MAVEN']);

/** macOS joke/robot voices and the old "Eloquence" voices sound robotic: never pick them. */
const AVOID = /bad news|bahh|bells|boing|bubbles|cellos|wobble|good news|jester|organ|superstar|whisper|zarvox|trinoids|albert|fred|junior|ralph|kathy|eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley|novelty/i;

/** Higher = sounds more natural. */
function rank(v: SpeechSynthesisVoice): number {
  const n = v.name;
  if (AVOID.test(n)) return -1;
  let r = 0;
  if (/natural|neural|premium|enhanced|siri/i.test(n)) r += 100;
  if (/^Google/i.test(n)) r += 60;
  if (/aria|jenny|ava|allison|susan|zoe|serena|samantha|libby|sonia|emma|ana\b/i.test(n)) r += 30;
  if (/karen|moira|daniel|tessa|catherine|google uk english female/i.test(n)) r += 15;
  if (v.lang === 'en-US') r += 5;
  if (v.lang.startsWith('en-GB')) r += 4;
  if (v.localService) r += 2;
  return r;
}

function clean(text: string): string {
  let t = text.replace(/\p{Extended_Pictographic}/gu, ' ').replace(/[▶▼✔✖★☢⏳⚠•·→←↑↓✓○■□●]/g, ' ');
  for (const [re, rep] of SAY_AS) t = t.replace(re, rep);
  // ALL-CAPS words are read as words (not spelled out), except real acronyms
  t = t.replace(/\b[A-Z]{4,}\b/g, (w) => (KEEP_CAPS.has(w) ? w : w.toLowerCase()));
  return t.replace(/\s+/g, ' ').trim();
}

class VoiceEngine {
  private enabled: () => boolean = () => false;
  private volume: () => number = () => 1;
  private preferred: () => string = () => '';
  private voices: SpeechSynthesisVoice[] = [];
  private readonly synth: SpeechSynthesis | null = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;

  configure(enabled: () => boolean, volume: () => number, preferred: () => string = () => ''): void {
    this.enabled = enabled;
    this.volume = volume;
    this.preferred = preferred;
    if (!this.synth) return;
    const load = () => {
      this.voices = this.synth!.getVoices()
        .filter((v) => v.lang.toLowerCase().startsWith('en') && rank(v) >= 0)
        .sort((a, b) => rank(b) - rank(a));
    };
    load();
    this.synth.addEventListener?.('voiceschanged', load);
  }

  /** English voices worth offering in Settings, best first. */
  list(): { name: string; lang: string }[] {
    return this.voices.map((v) => ({ name: v.name, lang: v.lang }));
  }

  /** The voice LUNA will use (the player's pick, else the most natural one). */
  current(): SpeechSynthesisVoice | null {
    const want = this.preferred();
    return (want && this.voices.find((v) => v.name === want)) || this.voices[0] || null;
  }

  /** True when lines will be spoken (so the typewriter blips can stay quiet). */
  get active(): boolean {
    return !!this.synth && this.enabled() && this.voices.length > 0;
  }

  speak(text: string, who = 'LUNA', force = false): void {
    if (!this.synth || (!force && !this.enabled())) return;
    const t = clean(text);
    if (!t) return;
    this.synth.cancel();
    const say = (voice: SpeechSynthesisVoice | null) => {
      const u = new SpeechSynthesisUtterance(t);
      if (voice) u.voice = voice;
      u.lang = voice?.lang ?? 'en-US';
      u.rate = 0.93; // calm and clear for young listeners
      u.pitch = who === 'LUNA' ? 1.05 : 0.9; // natural pitch (no chipmunk voice)
      u.volume = Math.max(0, Math.min(1, this.volume()));
      // online voices (e.g. Google) fail without internet: fall back to a voice on this computer
      u.onerror = (e) => {
        if (voice && !voice.localService && e.error !== 'interrupted' && e.error !== 'canceled') say(this.voices.find((v) => v.localService) ?? null);
      };
      this.synth!.speak(u);
    };
    say(this.current());
  }

  stop(): void {
    this.synth?.cancel();
  }
}

export const voice = new VoiceEngine();
