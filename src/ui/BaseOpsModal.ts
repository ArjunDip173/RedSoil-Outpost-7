/**
 * Base Ops, opened at the Mission Console. Kept simple for young players:
 *  POWER    big ON/OFF switches; auto power shares the electricity between machines
 *  WATER    the main trade-off: water for oxygen (electrolysis) or for the plants
 *  STORAGE  what the base has, and bricks/ice to carry outside
 * Expert power (Settings) brings back kW numbers and manual power levels for older players.
 * Also contains the Fabricator. These windows don't pause time, so players can watch their
 * choices change things live.
 */
import { ITEMS, MAX_POWER_LEVEL, POWER_SYSTEMS, RECIPES } from '../config';
import type { Game } from '../Game';
import type { ItemId } from '../types';
import { button, el, icon, iconText, spriteCanvas } from './Dom';

export type OpsTab = 'power' | 'water' | 'status';

function bar(cls = ''): { root: HTMLDivElement; fill: HTMLDivElement; label: HTMLDivElement } {
  const root = el('div', `meter ${cls}`);
  const fill = el('div', 'meter-fill');
  const label = el('div', 'meter-label');
  root.append(fill, label);
  return { root, fill, label };
}

function bigCard(iconName: string): { root: HTMLDivElement; title: HTMLDivElement; value: HTMLDivElement; sub: HTMLDivElement } {
  const root = el('div', 'big-card');
  const title = el('div', 'bc-title');
  const value = el('div', 'bc-value');
  const sub = el('div', 'bc-sub');
  const head = el('div', 'bc-head');
  const ic = el('span', 'bc-icon');
  ic.appendChild(icon(iconName, 2));
  head.append(ic, title);
  root.append(head, value, sub);
  return { root, title, value, sub };
}

export function openBaseOps(game: Game, tab: OpsTab = 'power'): void {
  const m = game.ui.stack.open({ title: 'BASE OPS', size: 'lg', pauses: false, cls: 'ops-modal' });
  game.emit('opened_ops');
  const tabs = el('div', 'tabs');
  const pages: Record<OpsTab, HTMLDivElement> = { power: el('div', 'page'), water: el('div', 'page'), status: el('div', 'page') };
  const names: Record<OpsTab, [string, string]> = { power: ['POWER', 'icon_power'], water: ['WATER', 'icon_water'], status: ['STORAGE', 'ui_box'] };
  const tabBtns: Partial<Record<OpsTab, HTMLButtonElement>> = {};
  const show = (t: OpsTab) => {
    for (const k of Object.keys(pages) as OpsTab[]) {
      pages[k].classList.toggle('hidden', k !== t);
      tabBtns[k]?.classList.toggle('active', k === t);
    }
    game.audio.blip();
  };
  for (const k of Object.keys(pages) as OpsTab[]) {
    const b = button(names[k][0], () => show(k), 'tab', names[k][1]);
    tabBtns[k] = b;
    tabs.appendChild(b);
  }
  m.body.append(tabs, ...Object.values(pages));
  const updaters: (() => void)[] = [];
  const res = game.res;

  // ───────────── POWER ─────────────
  {
    const p = pages.power;
    const expert = () => game.settings.expertPower;
    const pduWarn = el('div', 'callout bad hidden', 'The Power Unit is broken! Fix the wires first: it is the yellow box in the Command room.');
    const cards = el('div', 'ops-cards two');
    const sun = bigCard('ui_sun');
    const batt = bigCard('icon_battery');
    const use = bigCard('ui_home');
    cards.append(sun.root, batt.root, use.root);
    const hint = el('div', 'kid-hint', 'Switch machines ON or OFF. The base shares the power for you!');
    const autoRow = el('div', 'auto-row');
    const autoBtn = button('', () => {
      res.setAutoPower(!res.autoPower);
      game.audio.select();
      refresh();
    }, 'auto-btn');
    const autoText = el('div', 'auto-text');
    autoRow.append(autoBtn, autoText);
    const grid = el('div', 'machine-grid');
    const machineUpdaters: (() => void)[] = [];
    for (const sys of POWER_SYSTEMS) {
      const card = el('div', 'machine');
      const top = el('div', 'machine-top');
      top.append(spriteCanvas(game.art.get(sys.icon), 3), el('div', 'machine-name', sys.name.replace(/ \(.*\)/, '')));
      const blurb = el('div', 'machine-blurb', sys.blurb);
      const status = el('div', 'machine-status');
      const sw = button('', () => {
        res.setSwitch(sys.id, !res.isOn(sys.id));
        game.audio.select();
        refresh();
      }, 'switch');
      const manual = el('div', 'machine-manual');
      const minus = button('−', () => {
        res.setPower(sys.id, res.power[sys.id] - 1);
        game.audio.blip();
        refresh();
      }, 'btn small');
      const plus = button('+', () => {
        res.setPower(sys.id, res.power[sys.id] + 1);
        game.audio.select();
        refresh();
      }, 'btn small');
      const pips = el('div', 'pips');
      const pipEls = Array.from({ length: MAX_POWER_LEVEL }, () => pips.appendChild(el('span', 'pip')));
      manual.append(minus, pips, plus);
      const row = el('div', 'machine-row');
      row.append(status, sw);
      card.append(top, blurb, row, manual);
      grid.appendChild(card);
      machineUpdaters.push(() => {
        const on = res.isOn(sys.id);
        sw.textContent = on ? 'ON' : 'OFF';
        sw.className = `switch ${on ? 'on' : 'off'}`;
        sw.setAttribute('aria-pressed', String(on));
        manual.classList.toggle('hidden', res.autoPower);
        const lvl = res.effectiveLevel(sys.id);
        pipEls.forEach((pe, i) => pe.classList.toggle('on', i < res.power[sys.id]));
        let text: string;
        if (game.objects.pduBroken) text = 'No power';
        else if (res.autoPower) text = res.autoReason[sys.id];
        else text = !on ? 'Off' : res.shed.has(sys.id) ? 'Battery empty!' : lvl >= 3 ? 'Full speed' : lvl === 2 ? 'Running' : 'Running slowly';
        status.textContent = text;
        const good = /Running|Full/.test(text);
        status.className = `machine-status ${good ? 'ok' : /Saving|Needs|empty|No power/.test(text) ? 'warn' : ''}`;
        card.classList.toggle('is-on', on);
      });
    }
    p.append(pduWarn, cards, hint, autoRow, grid);
    const refresh = () => {
      const ex = expert();
      pduWarn.classList.toggle('hidden', !game.objects.pduBroken);
      cards.classList.toggle('two', !ex);
      use.root.classList.toggle('hidden', !ex);
      hint.classList.toggle('hidden', ex);
      autoRow.classList.toggle('hidden', !ex);
      const panels = game.objects.panels.length;
      const dust = panels ? Math.round((game.objects.panels.reduce((a, b) => a + b.dust, 0) / panels) * 100) : 0;
      const peak = Math.max(0.1, panels * 2.2);
      const frac = res.gen / peak;
      sun.title.textContent = 'SUNLIGHT';
      sun.value.textContent = ex ? `${res.gen.toFixed(1)} kW` : game.weather.isNight ? 'Night' : frac > 0.6 ? 'Lots!' : frac > 0.25 ? 'Some' : 'A little';
      sun.sub.textContent = game.weather.isNight
        ? 'No sun: the battery keeps us going'
        : game.weather.storm.active
          ? 'Dust storm: less sun'
          : dust > 30
            ? 'Panels are dusty: brush them!'
            : 'Panels are clean ✔';
      const pct = Math.round(res.batteryPct);
      batt.title.textContent = 'BATTERY';
      batt.value.textContent = `${pct}%`;
      batt.value.className = `bc-value ${pct < 20 ? 'bad' : pct < 45 ? 'warn' : 'ok'}`;
      batt.sub.textContent = res.net >= 0 ? '▲ filling up' : '▼ going down';
      batt.root.classList.toggle('alarm', pct < 20);
      use.title.textContent = 'BASE USES';
      use.value.textContent = `${res.demand.toFixed(1)} kW`;
      use.sub.textContent = 'incl. Life Support (always on)';
      autoBtn.textContent = res.autoPower ? 'AUTO POWER: ON' : 'AUTO POWER: OFF';
      autoBtn.className = `auto-btn ${res.autoPower ? 'on' : 'off'}`;
      autoText.textContent = res.autoPower
        ? 'The base computer shares the power. Turn AUTO off to set each machine yourself.'
        : 'Manual mode: choose how much power each machine gets with − and +.';
      for (const u of machineUpdaters) u();
    };
    updaters.push(refresh);
  }

  // ───────────── WATER ─────────────
  {
    const p = pages.water;
    const tank = bar('water');
    const valveWrap = el('div', 'valve');
    valveWrap.appendChild(el('h3', '', 'SHARE THE WATER'));
    valveWrap.appendChild(el('p', 'muted small', 'Water can become OXYGEN to breathe, or help PLANTS grow food. Slide to choose!'));
    const lbl = el('div', 'valve-labels');
    lbl.append(iconText('ui_plant', 'PLANTS'), iconText('icon_o2', 'OXYGEN'));
    const slider = el('input', 'valve-slider');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.value = String(Math.round(res.valve * 100));
    slider.setAttribute('aria-label', 'Water valve: plants versus oxygen');
    slider.addEventListener('input', () => {
      res.valve = Number(slider.value) / 100;
      game.emit('valve_set');
    });
    const valveText = el('div', 'valve-text');
    valveWrap.append(lbl, slider, valveText);
    const cards = el('div', 'ops-cards two');
    const air = bigCard('icon_o2');
    const plants = bigCard('ui_plant');
    cards.append(air.root, plants.root);
    const ice = el('div', 'callout');
    p.append(tank.root, valveWrap, cards, ice);
    updaters.push(() => {
      tank.fill.style.width = `${(res.water / 300) * 100}%`;
      tank.fill.className = `meter-fill ${res.water < 10 ? 'bad' : 'water'}`;
      tank.label.textContent = `WATER TANK: ${Math.round(res.water)} litres`;
      const v = Math.round(res.valve * 100);
      valveText.textContent = `${100 - v}% to plants · ${v}% to oxygen`;
      if (document.activeElement !== slider) slider.value = String(v);
      air.title.textContent = 'BASE AIR';
      air.value.textContent = `${Math.round(res.o2)}%`;
      air.value.className = `bc-value ${res.o2 < 25 ? 'bad' : res.o2 < 50 ? 'warn' : 'ok'}`;
      air.sub.textContent = res.flows.electroWater > 0.001 ? '▲ O2 Maker is working' : res.isOn('electrolysis') ? 'O2 Maker waiting' : 'O2 Maker is OFF';
      const growing = res.beds.filter((b) => b.crop && b.growth < 1).length;
      plants.title.textContent = 'PLANTS';
      plants.value.textContent = growing ? `${growing} growing` : 'none';
      plants.sub.textContent = growing ? (res.flows.irrigation > 0.001 ? 'getting water' : 'thirsty! slide toward plants') : 'plant seeds in the Greenhouse';
      const iceN = res.storage.ice ?? 0;
      ice.textContent = res.isOn('melter')
        ? iceN > 0
          ? `The Ice Melter is turning ${iceN} ice chunks into water.`
          : 'The Ice Melter is ON but has no ice. Dig some glowing ice outside!'
        : 'Switch ON the Ice Melter (POWER tab) to turn ice into water.';
    });
  }

  // ───────────── STORAGE ─────────────
  {
    const p = pages.status;
    const store = el('div', 'store-grid');
    const grab = el('div', 'row wrap');
    for (const id of ['brick', 'regolith', 'ice'] as ItemId[]) {
      grab.appendChild(
        button(`Take 10 ${ITEMS[id].name}s`, () => {
          const n = Math.min(10, res.storage[id] ?? 0);
          if (n <= 0) {
            game.audio.error();
            return;
          }
          const fit = game.player.addItem(id, n);
          res.storage[id] = (res.storage[id] ?? 0) - fit;
          game.audio.pickup();
          if (fit < n) game.toast('Backpack is full!', '#ff5a5a');
        }, 'btn small'),
      );
    }
    p.append(el('h3', '', 'IN STORAGE'), store, el('p', 'muted small', 'Need bricks or ice outside? Put some in your backpack:'), grab);
    let last = '';
    updaters.push(() => {
      const key = JSON.stringify(res.storage);
      if (key === last) return;
      last = key;
      store.innerHTML = '';
      const list = res.storageList();
      if (!list.length) store.appendChild(el('div', 'muted', 'Empty. Dig things outside and bring them in!'));
      for (const it of list) {
        const cell = el('div', 'store-cell');
        cell.title = it.name;
        cell.append(spriteCanvas(game.art.get(it.icon), 3), el('span', '', `${it.n}`), el('small', '', it.name));
        store.appendChild(cell);
      }
    });
  }

  show(tab);
  let acc = 1;
  m.tick = (dt) => {
    acc += dt;
    if (acc < 0.25) return;
    acc = 0;
    for (const u of updaters) u();
  };
  m.tick(1);

}

// ───────────────────────── Fabricator ─────────────────────────

export function openFabricator(game: Game): void {
  const m = game.ui.stack.open({ title: 'FABRICATOR · 3D PRINTER WORKSHOP', size: 'lg', pauses: false, cls: 'fab-modal' });
  m.body.appendChild(el('p', 'muted', 'Turn Mars rocks into useful things! Materials come from base storage first, then your backpack.'));
  const grid = el('div', 'recipe-grid');
  m.body.appendChild(grid);
  const res = game.res;
  const cards: (() => void)[] = [];
  for (const r of RECIPES) {
    const card = el('div', 'recipe');
    const head = el('div', 'recipe-head');
    head.append(spriteCanvas(game.art.get(r.icon), 3), el('div', 'recipe-name', r.name));
    const gives = el('div', 'recipe-gives', r.gives);
    const cost = el('div', 'recipe-cost');
    const btn = button('BUILD', () => {
      if (res.craft(r.id)) refreshAll();
    }, 'btn primary');
    const note = el('div', 'muted small');
    card.append(head, gives, cost, btn, note);
    grid.appendChild(card);
    cards.push(() => {
      const st = res.recipeState(r);
      cost.innerHTML = '';
      for (const [id, n] of Object.entries(r.cost) as [ItemId, number][]) {
        const have = res.have(id);
        const chip = el('span', `chip ${have >= n ? 'ok' : 'bad'}`);
        chip.append(spriteCanvas(game.art.get(ITEMS[id].icon), 2), el('span', '', `${have}/${n} ${ITEMS[id].name}`));
        cost.appendChild(chip);
      }
      btn.disabled = st.locked || st.maxed || !st.canAfford;
      note.textContent = st.locked ? `Unlocks after Mission ${r.requiresMission}` : st.maxed ? '✔ Fully built!' : r.max !== Infinity ? `Built ${st.built}/${r.id === 'solar_panel' ? 4 : r.max}` : st.built ? `Made ${st.built} times` : "";
    });
  }
  const refreshAll = () => cards.forEach((c) => c());
  let acc = 1;
  m.tick = (dt) => {
    acc += dt;
    if (acc < 0.4) return;
    acc = 0;
    refreshAll();
  };
  refreshAll();
}
