/**
 * Runs the 6 data-driven training missions (public/resources/data/missions.json)
 * and, after graduation, endless Mission Control BOUNTIES.
 *
 * Objectives are either EVENT counters (game code calls emit('mine_ice')) or STATE checks
 * polled from STATE_CHECKS below. Missions can run scripted ACTIONS when they start.
 */
import { RANKS, SHELTER_SLOTS } from '../config';
import type { Game } from '../Game';
import type { BountyTemplate, MissionDef, MissionSave, ObjectiveDef } from '../types';

export const STATE_CHECKS: Record<string, (g: Game) => boolean> = {
  greenhouse_on: (g) => !g.objects.pduBroken && g.res.isOn('greenhouse'),
  power_ok: (g) => !g.objects.pduBroken && g.res.isOn('greenhouse') && (g.res.autoPower || g.res.net >= 0 || (g.weather.isNight && g.res.batteryPct > 40)),
  melter_on: (g) => !g.objects.pduBroken && g.res.isOn('melter'),
  algae_on: (g) => !g.objects.pduBroken && g.res.isOn('algae'),
  base_o2_70: (g) => g.res.o2 >= 70,
  shelter_full: (g) => g.base.shelterFilled() >= SHELTER_SLOTS,
};

export interface Bounty {
  id: string;
  text: string;
  event: string;
  need: number;
  have: number;
  xp: number;
}

export class MissionManager {
  index = 0;
  progress: Record<string, number> = {};
  graduated = false;
  bounties: Bounty[] = [];
  xp = 0;
  flags: Record<string, boolean> = {};
  private pollT = 0;
  private stuckT = 0;
  private lastObjective = '';
  private completing = false;
  private game: Game;

  constructor(game: Game) {
    this.game = game;
  }

  get missions(): MissionDef[] {
    return this.game.data.missions.missions;
  }

  get active(): MissionDef | null {
    return this.missions[this.index] ?? null;
  }

  /** Mission id (1–6), or 7 once every training mission is done. */
  activeId(): number {
    return this.active?.id ?? 7;
  }

  completedCount(): number {
    return Math.min(this.index, this.missions.length);
  }

  private key(o: ObjectiveDef): string {
    return `${this.active?.id}:${o.id}`;
  }

  value(o: ObjectiveDef): number {
    return this.progress[this.key(o)] ?? 0;
  }

  need(o: ObjectiveDef): number {
    return o.count ?? 1;
  }

  isDone(o: ObjectiveDef): boolean {
    return this.value(o) >= this.need(o);
  }

  currentObjective(): ObjectiveDef | null {
    const m = this.active;
    if (!m) return null;
    return m.objectives.find((o) => !this.isDone(o)) ?? null;
  }

  // ───────────────────────── events ─────────────────────────

  emit(event: string, n = 1): void {
    const m = this.active;
    if (m && !this.completing) {
      let earlierDone = true;
      for (const o of m.objectives) {
        if (o.event === event && !this.isDone(o) && (!o.ordered || earlierDone)) {
          const k = this.key(o);
          this.progress[k] = Math.min(this.need(o), (this.progress[k] ?? 0) + n);
          if (this.isDone(o)) this.objectiveDone(o);
        }
        if (!this.isDone(o)) earlierDone = false;
      }
      this.checkComplete();
    }
    // bounties
    for (const b of this.bounties) {
      if (b.event !== event || b.have >= b.need) continue;
      b.have = event === 'depth' ? Math.max(b.have, n) : Math.min(b.need, b.have + n);
      if (b.have >= b.need) this.completeBounty(b);
    }
  }

  private objectiveDone(o: ObjectiveDef): void {
    const g = this.game;
    g.audio.chime();
    g.toast(`✓ ${o.text}`, '#5fd068', 'icon_star');
    this.stuckT = 0;
  }

  private checkComplete(): void {
    const m = this.active;
    if (!m || this.completing) return;
    if (m.objectives.every((o) => this.isDone(o))) this.completeMission();
  }

  // ───────────────────────── flow ─────────────────────────

  /** Begin the campaign (or resume the current mission after loading). */
  begin(showBriefing: boolean): void {
    const m = this.active;
    if (!m) {
      if (this.graduated && this.bounties.length === 0) this.fillBounties();
      return;
    }
    if (showBriefing) this.start(this.index);
    else if (!this.flags[`started_${m.id}`] && m.objectives.every((o) => this.value(o) === 0)) {
      // a save made between two missions: set the next mission up quietly (no repeated briefing)
      for (const a of m.onStart ?? []) this.runAction(a);
      this.flags[`started_${m.id}`] = true;
    }
  }

  start(i: number): void {
    this.index = i;
    const m = this.active;
    if (!m) return;
    this.stuckT = 0;
    for (const a of m.onStart ?? []) this.runAction(a);
    this.flags[`started_${m.id}`] = true;
    this.game.dialogue(m.briefing, () => this.game.announceNewTools(m.id));
  }

  private runAction(a: string): void {
    const g = this.game;
    switch (a) {
      case 'dust_panels':
        for (const p of g.objects.panels) p.dust = Math.max(p.dust, 0.8);
        break;
      case 'break_pdu':
        g.objects.pduBroken = true;
        g.audio.spark();
        break;
      case 'ice_hint':
        break;
      case 'give_seeds':
        if (g.res.have('seed_lettuce') + g.res.have('seed_tomato') + g.res.have('seed_pepper') + g.res.have('seed_potato') < 3) g.res.addStorage({ seed_lettuce: 3 });
        break;
      case 'prep_flare':
        this.flags.flareArmed = true;
        break;
      case 'spawn_parts':
        g.objects.revealParts();
        break;
    }
  }

  private completeMission(): void {
    const g = this.game;
    const m = this.active;
    if (!m) return;
    this.completing = true;
    g.audio.victory();
    this.addXp(m.rewards.xp);
    if (m.rewards.items) g.res.addStorage(m.rewards.items);
    g.awardBadge(m.patch, true);
    if (m.fact) g.unlockFact(m.fact, true);
    g.dialogue(m.complete, () => {
      g.ui.showMissionComplete(m, () => {
        this.completing = false;
        this.index++;
        if (m.id === 6) {
          g.autosave('Mission complete');
          g.graduate();
          return;
        }
        // set the next mission up first, so the autosave already includes it
        if (this.active) this.start(this.index);
        g.autosave('Mission complete');
      });
    });
  }

  /** Called after the graduation ceremony. */
  enterBountyMode(): void {
    this.graduated = true;
    this.fillBounties();
    this.game.announceNewTools(7);
  }

  private fillBounties(): void {
    while (this.bounties.length < 3) this.bounties.push(this.makeBounty());
  }

  private makeBounty(): Bounty {
    const pool = this.game.data.missions.bounties.filter((t) => !this.bounties.some((b) => b.id === t.id));
    const t: BountyTemplate = pool[Math.floor(Math.random() * pool.length)];
    const n = Math.round(t.min + Math.random() * (t.max - t.min));
    return { id: t.id, text: t.text.replace('{n}', String(n)), event: t.event, need: n, have: 0, xp: t.xp + Math.round(n * 2) };
  }

  private completeBounty(b: Bounty): void {
    const g = this.game;
    g.audio.chime();
    this.addXp(b.xp);
    g.stats.bountiesDone++;
    g.toast(`BOUNTY DONE: ${b.text} (+${b.xp} XP)`, '#ffd166', 'icon_star');
    g.luna.say(`Mission Control says thank you! Bounty complete: ${b.text}.`, 'wow', 1);
    setTimeout(() => {
      this.bounties = this.bounties.filter((x) => x !== b);
      this.fillBounties();
    }, 1500);
  }

  addXp(n: number): void {
    const before = this.rank().title;
    this.xp += n;
    const after = this.rank().title;
    this.game.particles.floatText(this.game.player.cx, this.game.player.y - 10, `+${n} XP`, '#ffd166');
    if (after !== before) {
      this.game.toast(`RANK UP! You are now a ${after}`, '#ffd166', 'icon_star');
      this.game.audio.victory();
    }
  }

  rank(): { title: string; next: number | null; frac: number; level: number } {
    let level = 0;
    for (let i = 0; i < RANKS.length; i++) if (this.xp >= RANKS[i].xp) level = i;
    const cur = RANKS[level];
    const nxt = RANKS[level + 1];
    return { title: cur.title, next: nxt ? nxt.xp : null, frac: nxt ? (this.xp - cur.xp) / (nxt.xp - cur.xp) : 1, level };
  }

  update(dt: number): void {
    const g = this.game;
    const m = this.active;
    if (!m || this.completing) return;
    // poll state objectives
    this.pollT -= dt;
    if (this.pollT <= 0) {
      this.pollT = 0.4;
      let earlierDone = true;
      for (const o of m.objectives) {
        if (o.state && !this.isDone(o) && (!o.ordered || earlierDone)) {
          const check = STATE_CHECKS[o.state];
          if (check && check(g)) {
            this.progress[this.key(o)] = 1;
            this.objectiveDone(o);
          }
        }
        if (!this.isDone(o)) earlierDone = false;
      }
      this.checkComplete();
    }
    // Mission 5 script: the shelter is ready → DONKI reports the particles are coming
    if (m.id === 5 && this.flags.flareArmed && g.weather.flare.phase === 'none' && STATE_CHECKS.shelter_full(g) && !g.dialogueActive) {
      this.flags.flareArmed = false;
      g.weather.startFlare(true, 32);
    }
    // gentle hints if the player seems stuck
    const cur = this.currentObjective();
    const key = cur ? this.key(cur) : '';
    if (key !== this.lastObjective) {
      this.lastObjective = key;
      this.stuckT = 0;
    }
    if (cur?.hint && !g.ui.busy && !g.dialogueActive) {
      this.stuckT += dt;
      if (this.stuckT > 70) {
        this.stuckT = 0;
        g.luna.say(`Tip: ${cur.hint}`, 'think', 1);
      }
    }
  }

  /** Called when a scripted flare ends. */
  flareResult(scripted: boolean, shelteredFrac: number, dose: number): void {
    const g = this.game;
    if (!scripted || this.activeId() !== 5) return;
    if (shelteredFrac > 0.6 && dose < 2.2) {
      g.stats.flaresSurvived++;
      this.emit('flare_sheltered');
    } else {
      g.luna.say(`Ouch, that was too much radiation! Let's practise again. Another flare is coming soon: go INTO the Storm Shelter room and wait there.`, 'sad', 3);
      setTimeout(() => {
        if (this.activeId() === 5) g.weather.startFlare(true, 30);
      }, 15000);
    }
  }

  serialize(): MissionSave {
    return { index: this.index, progress: { ...this.progress }, done: !this.active, graduated: this.graduated, bounties: this.bounties.map((b) => ({ ...b })), xp: this.xp, flags: { ...this.flags } };
  }

  load(s: MissionSave): void {
    this.index = s.index;
    this.progress = { ...s.progress };
    this.graduated = s.graduated;
    this.bounties = s.bounties.map((b) => ({ ...b }));
    this.xp = s.xp;
    this.flags = { ...s.flags };
  }
}
