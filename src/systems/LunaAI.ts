/**
 * The "Ask LUNA" chat.
 *
 * Questions go to LUNA's AI server (server/ in this repo, or any OpenAI-compatible server such
 * as LiteLLM) at `/chat/completions`. If the server can't be reached, LUNA answers offline from
 * the game's NASA facts, the game guide below and a little chit-chat, so the game never
 * depends on the internet.
 *
 * Safety for players aged 7-12: the system prompt keeps answers short, kind and about space;
 * answers use the game's fact file; the player's name is never sent; questions and answers
 * are length-limited. The server adds its own guard rules and rate limits on top.
 */
import type { FactsData, NasaFact, Settings } from '../types';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface LunaAnswer {
  text: string;
  source: 'ai' | 'offline';
  /** Why the AI wasn't used (shown small under the answer). */
  note?: string;
  /** A Science Log fact this answer came from. */
  factId?: string;
}

export interface GameContext {
  mission: string;
  objective: string;
  status: string;
}

export const MAX_QUESTION = 200;
const MAX_ANSWER = 520;
const TIMEOUT_MS = 22000; // the server gives up after 18 s

/** Game-help topics: used for offline answers and given to the AI as a guide. */
const HELP: { keys: string[]; text: string }[] = [
  { keys: ['water', 'ice', 'melt', 'thirsty', 'drink', 'dig', 'laser', 'mine'], text: 'To make water: go outside and press the SCAN button (or Q) so buried ice glows blue. Pick the Mining Laser in your tool bar and hold the mouse on the blue ground. Walk back inside (the ice unloads by itself), then switch ON the Ice Melter in Base Ops.' },
  { keys: ['valve', 'share', 'split', 'slider', 'electrolysis'], text: 'The WATER VALVE is in Base Ops (Mission Console in the Command room, WATER tab). Slide it toward PLANTS to water the crops, or toward OXYGEN so the O2 Maker splits more water into air.' },
  { keys: ['oxygen', 'o2', 'air', 'breathe', 'breathing', 'suit'], text: 'Base air comes from the O2 Maker, which splits water with electricity, and from the algae tanks. Your suit air is the blue ring in the bottom-left: refill it at the O2 Station inside, or stand next to the rover outside.' },
  { keys: ['power', 'battery', 'solar', 'panel', 'electricity', 'energy', 'dust', 'dusty'], text: 'Solar panels make power in the daytime. Stand next to a dusty panel and press E to brush it clean. AUTO POWER shares the power for you: just switch machines ON or OFF in Base Ops.' },
  { keys: ['ops', 'console', 'machine', 'machines', 'switch', 'light', 'melter', 'algae'], text: 'Base Ops opens at the Mission Console in the Command room, or with the BASE OPS button inside the base. Its POWER tab has big ON/OFF switches for the Greenhouse Lights, O2 Maker, Ice Melter and Algae Lab.' },
  { keys: ['food', 'plant', 'seed', 'crop', 'grow', 'lettuce', 'potato', 'tomato', 'pepper', 'hungry', 'greenhouse', 'harvest'], text: 'Plant seeds in the Greenhouse trays: stand by a tray, press E and pick a seed. Plants need water from the water valve and light from the Greenhouse Lights. When a plant sparkles, press E to harvest it.' },
  { keys: ['radiation', 'flare', 'shelter', 'geiger', 'donki', 'storm', 'shield', 'wall'], text: 'When a SOLAR FLARE warning flashes, hide in the Storm Shelter room (bottom-right of the base) or deep in the lava tube cave. Rock, soil and water block radiation.' },
  { keys: ['brick', 'build', 'fabricator', 'upgrade', 'craft', 'glowing', 'square'], text: 'The Fabricator (3D printer in the Algae Lab) turns regolith into bricks and builds upgrades. For the shield wall, walk to the glowing squares on the right side of the base and click each one while carrying bricks.' },
  { keys: ['rover', 'drive', 'car', 'driving', 'home'], text: 'The rover is on the landing pad to the left of the base. Press E next to it to drive with WASD. Standing next to it refills your suit air, and the GO HOME button (or R) drives it back to the pad by itself.' },
  { keys: ['antenna', 'earth', 'call', 'radio', 'signal', 'part', 'dish'], text: 'The Deep Space Antenna is far up and to the right on a rocky ridge. In Mission 6 you find 3 parts by following the yellow arrow, fix its wires and turn the dish toward the blue Earth.' },
  { keys: ['move', 'walk', 'control', 'key', 'sprint', 'run', 'play', 'button', 'stuck', 'lost'], text: 'Walk with WASD or the arrow keys. Press E to use the thing you are next to, and hold the mouse to use your tool. Follow the yellow arrow and the mission box at the top-right. The buttons in the bottom-right are Scan, Map, Log, Ask LUNA, Base Ops and Fast.' },
  { keys: ['fast', 'wait', 'waiting', 'time', 'night', 'slow', 'speed'], text: 'Inside the base, hold the FAST button to speed up time when you are safe. During training missions the night is skipped.' },
  { keys: ['sample', 'rock', 'sparkly', 'mineral', 'science', 'log'], text: 'Sparkly rocks are science samples! Pick the Dust Brush in your tool bar and hold the mouse on them to add them to your Science Log.' },
];

const STOP = new Set(
  'the a an and or but is are was were be to of in on at for with what why how who when where which do does did can could would should i you me my we it its this that there their they them about from mars please tell explain really very'.split(' '),
);

function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w));
}

/** Strip markdown/links and keep answers short enough for a speech bubble. */
export function cleanAnswer(text: string): string {
  let t = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // [text](link) → text, before removing bare links
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_#`>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length > MAX_ANSWER) {
    const cut = t.slice(0, MAX_ANSWER);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    t = end > 120 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`;
  }
  return t;
}

export class LunaAI {
  private settings: Settings;
  private facts: FactsData;

  constructor(settings: Settings, facts: FactsData) {
    this.settings = settings;
    this.facts = facts;
  }

  get enabled(): boolean {
    return this.settings.aiEnabled && this.settings.aiUrl.trim().length > 0;
  }

  private avail: { ok: boolean; at: number } | null = null;

  /** Is the local AI server answering? Checked quickly and remembered for a little while. */
  async available(force = false): Promise<boolean> {
    if (!this.enabled) return false;
    const now = performance.now();
    if (!force && this.avail && now - this.avail.at < (this.avail.ok ? 60000 : 12000)) return this.avail.ok;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000); // the cloud server may need a few seconds to wake up
    let ok = false;
    try {
      const res = await fetch(`${this.base()}/models`, { headers: this.headers(), signal: controller.signal });
      ok = res.ok;
    } catch {
      ok = false;
    } finally {
      clearTimeout(timer);
    }
    this.avail = { ok, at: performance.now() };
    return ok;
  }

  private base(): string {
    return this.settings.aiUrl.trim().replace(/\/+$/, '');
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    const key = this.settings.aiKey.trim();
    if (key) h.Authorization = `Bearer ${key}`;
    return h;
  }

  // ───────────────────────── offline knowledge ─────────────────────────

  /** Facts that best match a question (simple keyword overlap). */
  relevantFacts(question: string, n = 4): NasaFact[] {
    const q = new Set(words(question));
    if (!q.size) return [];
    const scored = this.facts.facts
      .map((f) => {
        const title = words(f.title);
        const body = words(`${f.text} ${(f.tags ?? []).join(' ')}`);
        let s = 0;
        for (const w of title) if (q.has(w)) s += 3;
        for (const w of body) if (q.has(w)) s += 1;
        return { f, s };
      })
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s);
    return scored.slice(0, n).map((x) => x.f);
  }

  private helpFor(question: string): string | null {
    const q = new Set(words(question));
    let best: { text: string; s: number } | null = null;
    for (const h of HELP) {
      const s = h.keys.filter((k) => q.has(k)).length;
      if (s > 0 && (!best || s > best.s)) best = { text: h.text, s };
    }
    return best?.text ?? null;
  }

  /** Friendly replies to chit-chat ("hi", "how are you?", jokes…) and "what do I do next?". */
  private smallTalk(question: string, ctx?: GameContext): string | null {
    const q = question.toLowerCase().replace(/[^a-z' ]+/g, ' ').replace(/\s+/g, ' ').trim();
    const pick = (list: string[]) => list[Math.floor(Math.random() * list.length)];
    if (/^(hi+|hey+|hel+o+|hiya|yo+|howdy|sup|hola|greetings|good (morning|afternoon|evening))( luna)?$/.test(q))
      return pick(['Hi there, astronaut! Ask me anything about Mars, or tap a question below.', 'Hello! LUNA here, ready to help. What would you like to know?']);
    if (/how (are|r) (you|u)|how's it going|how is it going|how do you feel|are you ok/.test(q))
      return pick(["My circuits are buzzing happily, thanks! How's your mission going?", "I'm great! Floating around Mars with you is the best job ever."]);
    if (/who are you|what are you|your name|are you a robot|are you real/.test(q))
      return "I'm LUNA, your helper drone at Outpost 7. I know lots about Mars and how to keep our base running!";
    if (/\b(thanks|thank you|thx|ty)\b/.test(q)) return "You're welcome! Happy exploring, astronaut!";
    if (/\b(joke|funny|laugh)\b/.test(q))
      return pick([
        'Why did the astronaut break up with the rover? It needed more space!',
        "What's an astronaut's favourite key on the keyboard? The space bar!",
        'How do you throw a party on Mars? You planet!',
        "Why is the Sun so smart? It has over five billion degrees!",
      ]);
    if (/\b(bye|goodbye|see you|see ya|cya|good night)\b/.test(q)) return 'Bye for now! Fly safe, astronaut!';
    if (/\b(love you|you are (cool|awesome|great|smart|nice)|you're (cool|awesome|great|smart|nice))\b/.test(q)) return "Aww, thank you! You're a super astronaut too!";
    if (/what (should|do|can) i do|what now|what next|next step|what's next|what is next|i'm stuck|im stuck|i am stuck/.test(q))
      return ctx && ctx.objective && ctx.objective !== 'none' ? `Your next step: ${ctx.objective}. Follow the yellow arrow and I'll help along the way!` : 'Follow the yellow arrow and check the mission box in the top-right corner!';
    return null;
  }

  /** Offline LUNA: a game tip or the best-matching NASA fact. Always works. */
  offline(question: string, note?: string, ctx?: GameContext): LunaAnswer {
    const chat = this.smallTalk(question, ctx);
    if (chat) return { text: chat, source: 'offline', note };
    const gameWords = /\b(how do i|how can i|where is|where do|what do i|help|stuck|controls?)\b/i.test(question);
    const help = this.helpFor(question);
    const fact = this.relevantFacts(question, 1)[0];
    if (help && (gameWords || !fact)) return { text: help, source: 'offline', note };
    if (fact) return { text: `${fact.title}! ${fact.text}`, source: 'offline', note, factId: fact.id };
    if (help) return { text: help, source: 'offline', note };
    return {
      text: "Hmm, I'm not sure about that one. Tap a question below, or ask me about Mars, water, air, plants, the rover or the base!",
      source: 'offline',
      note,
    };
  }

  // ───────────────────────── AI server ─────────────────────────

  private systemPrompt(question: string, ctx: GameContext): string {
    const facts = this.relevantFacts(question)
      .map((f) => `- ${f.title}: ${f.text} (source: ${f.source})`)
      .join('\n');
    return [
      'You are LUNA, a cheerful floating AI drone helper in the educational game "Red Soil: Outpost 7".',
      'You are talking with a child aged 7 to 12 who is training as a junior astronaut at a base on Mars.',
      '',
      'How to answer:',
      '- Reply in 1 or 2 short sentences (under 35 words) with simple words a 9-year-old understands. Plain text only: no lists, markdown, emojis or links.',
      '- Only talk about Mars, space, science, astronauts, NASA missions and how to play this game. If asked about something else, kindly steer back to space.',
      '- Be accurate. Use the facts below when they help. If you are not sure, say so and suggest checking the Science Log in the game.',
      '- Never ask for or repeat personal information such as a real name, age, school, address or photos. If the child shares some, gently remind them not to share personal details online.',
      '- Keep it kind and safe: nothing scary, violent or grown-up. If the child seems upset or unsafe, encourage them to talk to a parent, teacher or another trusted adult.',
      '- You cannot change the game or give items; give tips instead.',
      '- For questions about how to play, ONLY use the game guide below. Never invent buttons, keys, places or steps. If the guide does not cover it, say you are not sure and suggest following the yellow arrow or the mission box at the top-right.',
      '',
      'Game guide:',
      ...HELP.map((h) => `- ${h.text}`),
      '',
      `Right now: ${ctx.mission}. Current goal: ${ctx.objective}. ${ctx.status}`,
      '',
      facts ? `Facts you can use:\n${facts}` : 'No specific facts matched this question.',
    ].join('\n');
  }

  /** Ask LUNA. Uses the AI server when it answers, otherwise (or on any error) answers offline. */
  async ask(question: string, history: ChatTurn[], ctx: GameContext): Promise<LunaAnswer> {
    const q = question.trim().slice(0, MAX_QUESTION);
    if (!this.enabled) return this.offline(q, undefined, ctx);
    // Ask straight away (no separate "are you there?" check first: that cost a whole extra round
    // trip per question). If the server could not be reached a moment ago, answer offline at once.
    if (this.avail && !this.avail.ok && performance.now() - this.avail.at < 12000) return this.offline(q, undefined, ctx);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${this.base()}/chat/completions`, {
        method: 'POST',
        headers: this.headers(),
        signal: controller.signal,
        body: JSON.stringify({
          model: this.settings.aiModel.trim() || 'luna',
          max_tokens: 1024,
          messages: [{ role: 'system', content: this.systemPrompt(q, ctx) }, ...history.slice(-6), { role: 'user', content: q }],
        }),
      });
      if (!res.ok) return this.offline(q, this.httpProblem(res.status, await res.text().catch(() => '')), ctx);
      const json = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
      const raw = json.choices?.[0]?.message?.content;
      const text = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.map((p) => (typeof p === 'object' && p && 'text' in p ? String((p as { text: unknown }).text) : '')).join(' ') : '';
      const clean = cleanAnswer(text);
      this.avail = { ok: true, at: performance.now() };
      if (!clean) return this.offline(q, undefined, ctx);
      return { text: clean, source: 'ai' };
    } catch (e) {
      this.avail = { ok: false, at: performance.now() };
      return this.offline(q, undefined, ctx);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Turn a server error into a short hint that points at the right fix. */
  private httpProblem(status: number, body = ''): string {
    const b = body.toLowerCase();
    const gemini = b.includes('gemini') || b.includes('vertex') || b.includes('google');
    // The provider account has no credit left (Anthropic: "credit balance is too low", OpenAI: insufficient_quota).
    if (b.includes('credit balance') || b.includes('insufficient_quota') || (b.includes('billing') && !gemini))
      return "The AI account is out of credits. Add credits in the provider's billing page.";
    // Gemini free tier: per-minute or per-day limit reached.
    if (status === 429 || b.includes('resource_exhausted') || b.includes('quota'))
      return gemini ? 'The free Gemini limit was reached for now. Wait a minute (or until tomorrow) and try again.' : 'Too many questions at once. Wait a moment and try again.';
    // The AI provider rejected the key stored on the server.
    if (b.includes('api key not valid') || b.includes('api_key_invalid') || ((/exception|x-api-key|invalid api key|authentication_error|permission_denied/.test(b)) && (status === 400 || status === 401 || status === 403)))
      return `The AI provider rejected the server's API key${gemini ? ' (Gemini)' : ''}. Update the key and redeploy the server.`;
    // The server itself rejected the game's key (LiteLLM without a database says "No connected db").
    if (b.includes('no connected db') || b.includes('proxy server token') || status === 401 || status === 403)
      return "The AI server did not accept the key in AI settings.";
    if (status === 404) return `The model "${this.settings.aiModel}" was not found. Check model_name in litellm/config.yaml.`;
    return `The AI server returned an error (${status}).`;
  }

  /** Settings → "Test connection": checks the server, the key and the model name. */
  async test(): Promise<{ ok: boolean; message: string }> {
    if (!this.settings.aiUrl.trim()) return { ok: false, message: 'Enter the AI server address first.' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(`${this.base()}/models`, { headers: this.headers(), signal: controller.signal });
      if (!res.ok) return { ok: false, message: this.httpProblem(res.status, await res.text().catch(() => '')) };
      const json = (await res.json()) as { data?: { id?: string }[] };
      const ids = (json.data ?? []).map((m) => m.id).filter((x): x is string => !!x);
      const model = this.settings.aiModel.trim();
      if (ids.length && !ids.includes(model)) return { ok: false, message: `Connected, but no model named "${model}". The server has: ${ids.join(', ')}.` };
      return { ok: true, message: `Connected. Model "${model}" is ready.` };
    } catch (e) {
      return { ok: false, message: (e as Error).name === 'AbortError' ? 'The server took too long to answer.' : `Can't reach ${this.base()}. Are you online?` };
    } finally {
      clearTimeout(timer);
    }
  }
}
