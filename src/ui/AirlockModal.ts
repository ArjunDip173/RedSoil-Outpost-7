/**
 * The pre-EVA safety checklist. Every spacewalk starts with checks,
 * just like real astronauts do. Ends with the airlock depressurizing to Mars pressure.
 */
import { SOL_DOSE_BUDGET } from '../config';
import { forTouch } from '../core/touch';
import type { Game } from '../Game';
import { button, el, spriteCanvas } from './Dom';

interface Item {
  key: string;
  icon: string;
  label: () => string;
  detail: () => string;
  check: () => boolean | 'blocked';
}

export function openAirlockModal(game: Game, onExit: () => void): void {
  const m = game.ui.stack.open({ title: 'AIRLOCK · PRE-EVA SAFETY CHECKLIST', size: 'md', cls: 'airlock-modal' });
  const done = new Set<string>();
  const p = game.player;
  const w = game.weather;
  let forced = false;

  const items: Item[] = [
    {
      key: 'helmet',
      icon: 'portrait_player',
      label: () => 'Helmet on and locked',
      detail: () => forTouch('Click to twist the helmet ring until it clicks.'),
      check: () => true,
    },
    {
      key: 'o2',
      icon: 'icon_o2',
      label: () => `Suit O2 tank: ${Math.round((p.o2 / p.o2Max) * 100)}%`,
      detail: () => (p.o2 / p.o2Max >= 0.9 ? 'Tank is full. Good to go!' : forTouch(`Click to refill from base air (base O2: ${Math.round(game.res.o2)}%).`)),
      check: () => {
        if (p.o2 / p.o2Max < 0.9) game.refillSuitAtStation(true);
        return p.o2 / p.o2Max >= 0.5;
      },
    },
    {
      key: 'pressure',
      icon: 'icon_heart',
      label: () => 'Suit pressure & leak check',
      detail: () => 'The suit keeps you at a safe pressure — Mars air is less than 1% of Earth’s.',
      check: () => true,
    },
    {
      key: 'radio',
      icon: 'luna_happy',
      label: () => 'Radio check with LUNA',
      detail: () => 'LUNA: “Loud and clear, astronaut!”',
      check: () => true,
    },
    {
      key: 'weather',
      icon: 'icon_rad',
      label: () => {
        if (w.flare.phase === 'active') return 'Space weather: SOLAR FLARE ACTIVE ✖';
        if (w.flare.phase === 'warning') return `Space weather: FLARE ALERT (${Math.ceil(w.flare.t)} s) ✖`;
        if (w.storm.active) return 'Space weather: dust storm (safe, but windy)';
        return 'Space weather (NASA DONKI): all clear';
      },
      detail: () =>
        w.flare.phase !== 'none'
          ? 'Radiation is dangerous right now! Stay inside — the Storm Shelter is the safest room.'
          : w.solDose > SOL_DOSE_BUDGET * 0.6
            ? 'You already got lots of radiation today. Keep this trip short!'
            : 'Radiation is low today. Safe to go out!',
      check: () => (w.flare.phase !== 'none' && !forced ? 'blocked' : true),
    },
  ];

  const intro = el('p', 'muted', forTouch('Click each check. When everything is green, cycle the airlock!'));
  const list = el('div', 'checklist');
  const cycle = button('CYCLE AIRLOCK ▶', () => runCycle(), 'btn primary big');
  cycle.disabled = true;
  const gauge = el('div', 'pressure hidden');
  const gaugeBar = el('div', 'pressure-bar');
  const gaugeFill = el('div', 'pressure-fill');
  const gaugeText = el('div', 'pressure-text', '101.3 kPa');
  gaugeBar.appendChild(gaugeFill);
  gauge.append(el('div', 'muted', 'Pumping air back into the habitat tanks…'), gaugeBar, gaugeText);

  const rows: { item: Item; row: HTMLButtonElement; lab: HTMLSpanElement; det: HTMLSpanElement }[] = [];
  for (const it of items) {
    const row = el('button', 'check-row');
    row.type = 'button';
    const box = el('span', 'check-box', '');
    const ic = spriteCanvas(game.art.get(it.icon), 2, 'check-icon');
    const txt = el('span', 'check-txt');
    const lab = el('span', 'check-label', it.label());
    const det = el('span', 'check-detail', it.detail());
    txt.append(lab, det);
    row.append(box, ic, txt);
    row.addEventListener('click', () => {
      if (done.has(it.key)) return;
      const r = it.check();
      if (r === 'blocked') {
        game.audio.error();
        row.classList.add('bad');
        if (!row.querySelector('.force')) {
          const f = button('Go anyway (not safe!)', () => {
            forced = true;
            row.click();
          }, 'btn danger small force');
          txt.appendChild(f);
        }
      } else if (r) {
        done.add(it.key);
        row.classList.add('ok');
        row.classList.remove('bad');
        box.textContent = '✔';
        game.audio.wireConnect();
      } else game.audio.error();
      refresh();
    });
    rows.push({ item: it, row, lab, det });
    list.appendChild(row);
  }

  const refresh = () => {
    for (const r of rows) {
      r.lab.textContent = r.item.label();
      r.det.textContent = r.item.detail();
    }
    cycle.disabled = done.size < items.length;
  };
  m.tick = () => refresh();

  const actions = el('div', 'row');
  if (game.missions.completedCount() >= 1 || game.settings.quickAirlock) {
    actions.appendChild(
      button('✔ Quick check all', () => {
        for (const r of rows) if (!done.has(r.item.key)) r.row.click();
      }, 'btn'),
    );
  }
  actions.appendChild(cycle);
  m.body.append(intro, list, gauge, actions);

  function runCycle(): void {
    cycle.disabled = true;
    gauge.classList.remove('hidden');
    list.classList.add('dim');
    game.audio.hiss(true);
    const start = performance.now();
    const dur = 1800;
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / dur);
      const kpa = 101.3 - (101.3 - 0.6) * (1 - Math.pow(1 - t, 3));
      gaugeFill.style.width = `${(kpa / 101.3) * 100}%`;
      gaugeText.textContent = `${kpa.toFixed(1)} kPa${t >= 1 ? ' — Mars pressure! Outer door open.' : ''}`;
      if (t < 1) requestAnimationFrame(step);
      else
        setTimeout(() => {
          m.close();
          onExit();
        }, 450);
    };
    requestAnimationFrame(step);
    game.unlockFact('spacesuit', true);
  }
}
