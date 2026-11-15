/**
 * "Earth Comms Restored" celebration, the printable Junior Astronaut
 * certificate (signed by SideLoaders), and the friendly Med-Evac rescue screen.
 */
import { GAME_TITLE, TEAM_NAME } from '../config';
import type { AudioEngine } from '../core/AudioEngine';
import { type Sprites } from '../core/Sprites';
import type { Game } from '../Game';
import { confetti } from './Confetti';
import { button, el, type ModalStack, iconText } from './Dom';

export interface CertificateInfo {
  name: string;
  date: string;
  sols: number;
  ice: number;
  crops: number;
  samples: number;
  rank: string;
  xp: number;
  id: string;
  patches: string[];
}

// Earth contact

export function showEarthContact(game: Game, onDone: () => void): void {
  const m = game.ui.stack.open({ title: 'EARTH COMMS RESTORED', size: 'lg', closable: false, cls: 'earth-modal' });
  const W = 640;
  const H = 220;
  const c = el('canvas', 'earth-canvas');
  c.width = W;
  c.height = H;
  // a believable distance for the lesson (Mars–Earth ranges ~55–400 million km)
  const distMkm = 140 + Math.round(Math.random() * 160);
  const delayMin = (distMkm * 1e6) / 299792 / 60;
  const log = el('div', 'earth-log');
  const lines = [
    `> Dish locked on Earth. Transmitting from Outpost 7…`,
    `> Earth is about ${distMkm} million km away today.`,
    `> Radio travels at the speed of light: 299,792 km every second.`,
    `> One-way delay: ${delayMin.toFixed(1)} minutes! (We fast-forwarded the wait for you.)`,
    `> NASA DEEP SPACE NETWORK: signal received ✔`,
    `> MESSAGE FROM EARTH: "Outpost 7, we hear you loud and clear. Welcome back, ${game.profile.name}!"`,
  ];
  const cont = button(
    'CONTINUE ▶',
    () => {
      m.close();
      onDone();
    },
    'btn primary big hidden',
  );
  m.body.append(c, log, cont);
  const g = c.getContext('2d')!;
  let t = 0;
  let shown = 0;
  let last = performance.now();
  const loop = (now: number) => {
    if (m.closed) return;
    const dt = (now - last) / 1000;
    last = now;
    t += dt;
    g.fillStyle = '#05040c';
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(255,255,255,${0.3 + ((i * 7) % 10) / 15})`;
      g.fillRect((i * 97) % W, (i * 53) % H, 2, 2);
    }
    // Mars
    g.fillStyle = '#c1440e';
    g.beginPath();
    g.arc(80, H / 2, 46, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e07a3f';
    g.fillRect(60, H / 2 - 20, 20, 8);
    // Earth
    g.fillStyle = '#2f7dd1';
    g.beginPath();
    g.arc(W - 80, H / 2, 38, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#5fd068';
    g.fillRect(W - 98, H / 2 - 12, 22, 14);
    g.fillRect(W - 70, H / 2 + 6, 16, 10);
    // signal pulses
    const prog = Math.min(1, t / 4);
    for (let k = 0; k < 6; k++) {
      const p = (prog - k * 0.08) % 1;
      if (p < 0 || prog >= 1) continue;
      const x = 130 + p * (W - 260);
      g.strokeStyle = `rgba(127,227,255,${1 - k * 0.15})`;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(x, H / 2, 14, -0.8, 0.8);
      g.stroke();
    }
    if (prog >= 1) {
      g.fillStyle = `rgba(95,208,104,${0.5 + 0.5 * Math.sin(t * 6)})`;
      g.font = '14px "Press Start 2P", monospace';
      g.textAlign = 'center';
      g.fillText('SIGNAL RECEIVED', W / 2, H / 2 + 6);
      g.textAlign = 'left';
    }
    const want = Math.min(lines.length, Math.floor(t / 0.9) + 1);
    while (shown < want) {
      log.appendChild(el('div', '', lines[shown]));
      shown++;
      game.audio.talk();
      if (shown === lines.length) {
        game.audio.victory();
        cont.classList.remove('hidden');
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  game.unlockFact('light_delay', true);
  game.unlockFact('dsn', true);
}

// Certificate

export function drawCertificate(art: Sprites, info: CertificateInfo): HTMLCanvasElement {
  const W = 1600;
  const H = 1130;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  // background
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#120a16');
  bg.addColorStop(1, '#2a1220');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 220; i++) {
    g.fillStyle = `rgba(255,255,255,${0.15 + ((i * 13) % 10) / 20})`;
    const s = i % 7 === 0 ? 4 : 2;
    g.fillRect((i * 389) % W, (i * 211) % H, s, s);
  }
  // Mars horizon
  g.fillStyle = '#7e3f27';
  g.beginPath();
  g.moveTo(0, H);
  for (let x = 0; x <= W; x += 20) g.lineTo(x, H - 120 - Math.sin(x / 140) * 20 - Math.sin(x / 47) * 6);
  g.lineTo(W, H);
  g.fill();
  // pixel border
  const border = (inset: number, size: number, color: string) => {
    g.fillStyle = color;
    g.fillRect(inset, inset, W - inset * 2, size);
    g.fillRect(inset, H - inset - size, W - inset * 2, size);
    g.fillRect(inset, inset, size, H - inset * 2);
    g.fillRect(W - inset - size, inset, size, H - inset * 2);
  };
  border(24, 12, '#c1440e');
  border(44, 6, '#ffd166');
  for (let x = 60; x < W - 60; x += 48) {
    g.fillStyle = '#ffd166';
    g.fillRect(x, 60, 12, 12);
    g.fillRect(x + 24, H - 72, 12, 12);
  }
  const center = (text: string, y: number, font: string, color: string) => {
    g.font = font;
    g.fillStyle = color;
    g.textAlign = 'center';
    g.fillText(text, W / 2, y);
  };
  center(GAME_TITLE.toUpperCase(), 150, '28px "Press Start 2P", monospace', '#e07a3f');
  center('CERTIFICATE OF COMPLETION', 230, '44px "Press Start 2P", monospace', '#ffd166');
  center('JUNIOR ASTRONAUT MISSION TRAINER', 285, '24px "Press Start 2P", monospace', '#7fe3ff');
  center('This certifies that', 360, '42px VT323, monospace', '#e8e6df');
  center(info.name.toUpperCase(), 450, '64px "Press Start 2P", monospace', '#ffffff');
  g.fillStyle = '#ffd166';
  g.fillRect(W / 2 - 420, 478, 840, 6);
  center(
    'has completed all six training missions on the red soil of Mars and',
    540,
    '40px VT323, monospace',
    '#e8e6df',
  );
  center('is now an official JUNIOR ASTRONAUT of Outpost 7!', 585, '40px VT323, monospace', '#e8e6df');
  // patches
  const ps = info.patches;
  const pw = 36 * 3;
  const gap = 26;
  const totalW = ps.length * pw + (ps.length - 1) * gap;
  ps.forEach((p, i) => g.drawImage(art.get(p), W / 2 - totalW / 2 + i * (pw + gap), 615, pw, pw));
  // skills
  const skills = [
    'Power budgeting',
    'Water: O2 vs. crops',
    'Radiation shielding',
    'Life support',
    'Rover EVA',
    'Deep-space comms',
  ];
  g.font = '30px VT323, monospace';
  g.fillStyle = '#c9c7c0';
  g.textAlign = 'center';
  g.fillText(skills.join('  ·  '), W / 2, 780);
  g.fillStyle = '#9be36a';
  g.fillText(
    `Sols on Mars: ${info.sols}  ·  Ice mined: ${info.ice}  ·  Crops harvested: ${info.crops}  ·  Samples: ${info.samples}  ·  Rank: ${info.rank} (${info.xp} XP)`,
    W / 2,
    822,
  );
  // portraits
  g.drawImage(art.get('portrait_player'), 120, 330, 16 * 9, 18 * 9);
  g.drawImage(art.get('luna_wow'), W - 120 - 14 * 9, 350, 14 * 9, 13 * 9);
  // signature block
  g.textAlign = 'left';
  g.font = 'italic 72px "Brush Script MT", "Segoe Script", cursive';
  g.fillStyle = '#ffffff';
  g.fillText(TEAM_NAME, 180, 930);
  g.fillStyle = '#ffd166';
  g.fillRect(170, 948, 460, 4);
  g.font = '28px VT323, monospace';
  g.fillStyle = '#e8e6df';
  g.fillText(`Signed: ${TEAM_NAME}, Game Development Team`, 170, 985);
  g.textAlign = 'right';
  g.font = '28px VT323, monospace';
  g.fillText(`Date: ${info.date}`, W - 170, 930);
  g.fillText(`Certificate ID: ${info.id}`, W - 170, 965);
  g.fillText('Flight trainer: LUNA (AI drone)', W - 170, 1000);
  g.textAlign = 'center';
  g.font = '24px VT323, monospace';
  g.fillStyle = '#c9a089';
  g.fillText(
    `Created by ${TEAM_NAME} for the 2026 NASA Space Apps Challenge · Facts from NASA DONKI, RadLab, OSDR & the Canadian Space Agency`,
    W / 2,
    H - 92,
  );
  // SI watermark (Space Apps rules: SI-assisted images must say so visibly)
  g.textAlign = 'right';
  g.font = '22px VT323, monospace';
  g.fillStyle = '#a07e6c';
  g.fillText('SI-assisted art & audio', W - 80, 92);
  g.textAlign = 'center';
  return c;
}

export function showCertificate(
  stack: ModalStack,
  art: Sprites,
  audio: AudioEngine,
  info: CertificateInfo,
  onDone?: () => void,
): void {
  const m = stack.open({ title: 'YOUR JUNIOR ASTRONAUT CERTIFICATE', size: 'xl', cls: 'cert-modal', onClose: onDone });
  const canvas = drawCertificate(art, info);
  canvas.className = 'cert-canvas';
  const row = el('div', 'row wrap');
  row.append(
    button(
      'Download PNG',
      () => {
        const a = document.createElement('a');
        a.download = `OP7-Certificate-${info.name.replace(/[^a-z0-9]+/gi, '_')}.png`;
        a.href = canvas.toDataURL('image/png');
        a.click();
        audio.chime();
      },
      'btn primary',
      'ui_download',
    ),
    button(
      'Print',
      () => {
        const w = window.open('', '_blank');
        if (!w) return;
        w.document.write(
          `<title>Certificate</title><body style="margin:0"><img src="${canvas.toDataURL('image/png')}" style="width:100%" onload="window.print()"></body>`,
        );
        w.document.close();
      },
      'btn',
      'ui_print',
    ),
    button('Continue ▶', () => m.close(), 'btn'),
  );
  m.body.append(canvas, row);
  audio.celebrate();
  confetti();
}

// Med-Evac

export type EvacCause = 'oxygen' | 'radiation' | 'injury';

export function showMedEvac(game: Game, cause: EvacCause, lost: number, onDone: () => void): void {
  const m = game.ui.stack.open({ title: 'MED-EVAC!', size: 'md', closable: false, cls: 'evac-modal' });
  const lessons: Record<EvacCause, { what: string; why: string; next: string[] }> = {
    oxygen: {
      what: 'Your suit ran out of air!',
      why: 'Mars has almost no oxygen, so your suit carries a small tank. It empties while you are outside.',
      next: [
        'Watch the blue ring in the bottom-left corner.',
        'When it is half empty, follow the glowing path home.',
        'Standing next to the rover refills your suit.',
      ],
    },
    radiation: {
      what: 'You got too much space radiation today!',
      why: 'Mars has no thick air or magnetic field, so radiation from the Sun reaches the ground.',
      next: [
        'When a SOLAR FLARE warning flashes, go inside straight away.',
        'Hide in the Storm Shelter room or deep in the lava tube cave.',
        'Rock, soil and water block radiation.',
      ],
    },
    injury: {
      what: 'You got hurt out there!',
      why: 'Without air in your suit, or after a fall, your health goes down.',
      next: ['Go back inside when the red heart gets low.', 'Eat a Meal Pack from your tool bar to heal.'],
    },
  };
  const L = lessons[cause];
  const steps = el('ol', 'evac-steps');
  for (const n of L.next) steps.appendChild(el('li', '', n));
  m.body.append(
    el('div', 'evac-art'),
    el('h3', '', L.what),
    el('p', '', `LUNA flew you safely back to the med bay. ${L.why}`),
    iconText('ui_bulb', 'NEXT TIME, TRY THIS:', 'evac-next'),
    steps,
    el('p', 'muted', lost > 0 ? `You dropped ${lost} rocks during the rescue.` : 'Nothing was lost.'),
  );
  const row = el('div', 'row wrap center');
  if (!game.settings.easyMode && game.stats.medEvacs >= 2) {
    row.appendChild(
      button(
        'Turn on Easy Mode (more air)',
        () => {
          game.settings.easyMode = true;
          game.storage.saveSettings(game.settings);
          game.toast('Easy Mode is ON: your suit air lasts longer', '#5fd068');
        },
        'btn',
      ),
    );
  }
  row.appendChild(
    button(
      'BACK TO BASE ▶',
      () => {
        m.close();
        onDone();
      },
      'btn primary big',
    ),
  );
  m.body.appendChild(row);
  game.audio.alarm();
}
