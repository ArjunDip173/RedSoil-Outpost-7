/**
 * The player's collection book: NASA facts (DONKI, RadLab, OSDR, CSA…),
 * Mars rock samples, mission patches & badges, and stats. Persists across new games.
 */
import { BADGES } from '../config';
import { type Sprites } from '../core/Sprites';
import type { FactSource, GameData, ScienceLogState, Stats } from '../types';
import { button, el, type ModalStack, spriteCanvas } from './Dom';

const SOURCE_INFO: Record<FactSource, string> = {
  DONKI: 'NASA DONKI — space weather database',
  RadLab: 'Radiation science (Curiosity RAD, ISS)',
  OSDR: 'NASA Open Science Data Repository — space biology',
  CSA: 'Canadian Space Agency',
  'NASA Mars': 'NASA Mars exploration',
  NASA: 'NASA human spaceflight & technology',
};

export function openScienceLog(stack: ModalStack, art: Sprites, data: GameData, science: ScienceLogState, stats: Stats | null, onCertificate?: () => void): void {
  const m = stack.open({ title: 'SCIENCE LOG', size: 'xl', cls: 'log-modal' });
  const tabs = el('div', 'tabs');
  const pages = { facts: el('div', 'page'), samples: el('div', 'page'), patches: el('div', 'page'), stats: el('div', 'page') };
  type K = keyof typeof pages;
  const labels: Record<K, string> = {
    facts: `FACTS ${science.facts.length}/${data.facts.facts.length}`,
    samples: `SAMPLES ${science.samples.length}/${data.facts.samples.length}`,
    patches: `PATCHES ${science.badges.length}/${BADGES.length}`,
    stats: 'STATS',
  };
  const btns: Partial<Record<K, HTMLButtonElement>> = {};
  const show = (k: K) => {
    for (const key of Object.keys(pages) as K[]) {
      pages[key].classList.toggle('hidden', key !== k);
      btns[key]?.classList.toggle('active', key === k);
    }
  };
  const tabIcons: Record<string, string> = { facts: 'icon_dish', samples: 'icon_basalt', patches: 'icon_star', stats: 'ui_chart' };
  for (const k of Object.keys(pages) as K[]) {
    if (k === 'stats' && !stats) continue;
    const b = button(labels[k], () => show(k), 'tab', tabIcons[k]);
    btns[k] = b;
    tabs.appendChild(b);
  }
  m.body.append(tabs, ...Object.values(pages));

  // facts grouped by source
  const sources = Array.from(new Set(data.facts.facts.map((f) => f.source)));
  pages.facts.appendChild(el('p', 'muted', 'Facts unlock as you play: LUNA shares them, missions teach them, and the base reveals them. All facts come from real NASA and partner-agency science.'));
  for (const s of sources) {
    const all = data.facts.facts.filter((f) => f.source === s);
    const got = all.filter((f) => science.facts.includes(f.id));
    const sec = el('div', 'fact-section');
    sec.appendChild(el('h3', `src src-${s.replace(/\s/g, '')}`, `${s} · ${got.length}/${all.length}`));
    sec.appendChild(el('div', 'muted small', SOURCE_INFO[s]));
    for (const f of all) {
      const unlocked = science.facts.includes(f.id);
      const card = el('div', `fact ${unlocked ? '' : 'locked'}`);
      card.appendChild(el('b', '', unlocked ? f.title : '??? Locked fact'));
      card.appendChild(el('p', '', unlocked ? f.text : 'Keep exploring Outpost 7 to unlock this fact!'));
      sec.appendChild(card);
    }
    pages.facts.appendChild(sec);
  }

  // samples
  const sg = el('div', 'sample-grid');
  for (const s of data.facts.samples) {
    const got = science.samples.includes(s.id);
    const card = el('div', `sample ${got ? '' : 'locked'}`);
    const sw = el('div', 'swatch');
    sw.style.background = got ? s.color : '#2a2230';
    card.append(sw, el('b', '', got ? s.name : '??? Unknown rock'), el('p', '', got ? s.text : 'Find a sparkly rock and brush it with the Dust Brush.'));
    sg.appendChild(card);
  }
  pages.samples.append(el('p', 'muted', 'Sparkly rocks hide all over Mars — on the surface, in craters, at the poles and in caves.'), sg);

  // patches
  const pg = el('div', 'badge-grid');
  for (const b of BADGES) {
    const got = science.badges.includes(b.id);
    const card = el('div', `badge ${got ? '' : 'locked'}`);
    const c = spriteCanvas(art.get(b.art), 3, 'patch');
    card.append(c, el('b', '', got ? b.name : '???'), el('small', '', got ? b.text : 'Not earned yet'));
    pg.appendChild(card);
  }
  pages.patches.appendChild(pg);
  if (onCertificate && science.badges.includes('badge_graduate')) pages.patches.appendChild(button('View my graduation certificate', onCertificate, 'btn primary', 'ui_cap'));

  // stats
  if (stats) {
    const rows: [string, string][] = [
      ['Ice chunks mined', `${stats.iceMined}`],
      ['Blocks dug', `${stats.tilesDug}`],
            ['Crops harvested', `${stats.cropsHarvested}`],
      ['Solar panels cleaned', `${stats.panelsCleaned}`],
      ['Science samples', `${stats.samplesFound}`],
      ['Rover distance', `${stats.distanceDriven} m`],
      ['Sprint time', `${Math.floor(stats.jetSeconds)} s`],
      ['Flags planted', `${stats.flagsPlanted}`],
      ['Meteorites found', `${stats.meteoritesFound}`],
      ['Dust storms survived', `${stats.stormsSurvived}`],
      ['Solar flares survived', `${stats.flaresSurvived}`],
      ['Quiz answers right', `${stats.quizzesRight}`],
      ['Bounties completed', `${stats.bountiesDone}`],
      ['Med-evacs (that’s OK!)', `${stats.medEvacs}`],
    ];
    const t = el('div', 'stats-grid');
    for (const [k, v] of rows) {
      const r = el('div', 'stat-row');
      r.append(el('span', '', k), el('b', '', v));
      t.appendChild(r);
    }
    pages.stats.appendChild(t);
  }
  show('facts');
}
