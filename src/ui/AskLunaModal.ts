/**
 * The "Ask LUNA" chat window (button or T). Shows whether LUNA is online (AI answers) or
 * offline (answers from the Science Log).
 */
import { forTouch } from '../core/touch';
import type { Game } from '../Game';
import { MAX_QUESTION } from '../systems/LunaAI';
import { button, el, spriteCanvas } from './Dom';

const SUGGESTIONS = [
  'Why is Mars red?',
  'How do we make oxygen?',
  'What is a solar flare?',
  'How do I get water?',
  'Could people live on Mars?',
  'What are Phobos and Deimos?',
  'Why do we need a radiation shelter?',
  'How do plants grow in space?',
  'How far away is Earth?',
  'What does the rover do?',
];

export function openAskLuna(game: Game): void {
  const ai = game.lunaAI;
  const m = game.ui.stack.open({ title: 'ASK LUNA', size: 'md', cls: 'ask-modal' });

  const head = el('div', 'ask-head');
  head.appendChild(spriteCanvas(game.art.get('luna_happy'), 4));
  const status = el('div', 'ask-status', ai.enabled ? 'Connecting to AI LUNA…' : 'Offline LUNA · answers from the Science Log');
  const setStatus = (online: boolean) => {
    status.textContent = online ? 'AI LUNA is online' : 'Offline LUNA · answers from the Science Log';
    status.classList.toggle('on', online);
  };
  if (ai.enabled) void ai.available(true).then((ok) => !m.closed && setStatus(ok));
  const intro = el('p', '', 'Ask me anything about Mars, space or how to play! ');
  const info = el('div', 'ask-info');
  info.append(intro, status);
  head.appendChild(info);

  const log = el('div', 'ask-log');
  const chips = el('div', 'ask-chips');
  const form = el('form', 'ask-form');
  const input = el('input', 'ask-input');
  input.type = 'text';
  input.maxLength = MAX_QUESTION;
  input.placeholder = 'Type your question…';
  input.setAttribute('aria-label', 'Your question for LUNA');
  input.autocomplete = 'off';
  const send = button('ASK ▶', () => form.requestSubmit(), 'btn primary');
  send.type = 'submit';
  form.append(input, send);
  const foot = el('div', 'ask-foot');
  foot.append(
    el('span', 'muted small', "Don't share your real name, address or other personal details."),
    button('AI settings', () => {
      m.close();
      game.ui.openSettings();
    }, 'btn ghost small', 'ui_gear'),
  );
  m.body.append(head, log, chips, form, foot);

  const bubble = (who: 'you' | 'luna', text: string, note?: string, source?: 'ai' | 'offline') => {
    const row = el('div', `ask-msg ${who}`);
    const b = el('div', 'ask-bubble', who === 'luna' ? forTouch(text) : text);
    row.appendChild(b);
    if (who === 'luna' && source) row.appendChild(el('div', 'ask-src', source === 'ai' ? 'AI answer · check big facts with a grown-up' : 'From LUNA’s Science Log'));
    if (note) row.appendChild(el('div', 'ask-note', note));
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
    return b;
  };

  if (!game.lunaLog.length) bubble('luna', 'Hi! I’m LUNA. What would you like to know?');
  for (const e of game.lunaLog) bubble(e.who, e.text, e.note, e.source);

  const shuffled = SUGGESTIONS.slice().sort(() => Math.random() - 0.5).slice(0, 4);
  for (const s of shuffled)
    chips.appendChild(
      button(s, () => {
        input.value = s;
        form.requestSubmit();
      }, 'chip ask-chip'),
    );

  let busy = false;
  let lastSent = 0;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q || busy || performance.now() - lastSent < 1200) return;
    busy = true;
    lastSent = performance.now();
    input.value = '';
    input.disabled = true;
    send.disabled = true;
    bubble('you', q);
    game.lunaLog.push({ who: 'you', text: q });
    game.audio.blip();
    const typing = bubble('luna', '…');
    typing.classList.add('typing');
    // a slow answer: let the player know LUNA is still working on it
    const slow = window.setTimeout(() => typing.isConnected && (typing.textContent = 'Thinking… 🛰'), 3000);
    const answer = await ai.ask(q, game.lunaChat, game.aiContext());
    clearTimeout(slow);
    if (m.closed) return;
    setStatus(answer.source === 'ai');
    typing.parentElement?.remove();
    bubble('luna', answer.text, answer.note, answer.source);
    game.lunaLog.push({ who: 'luna', text: answer.text, note: answer.note, source: answer.source });
    game.lunaChat.push({ role: 'user', content: q }, { role: 'assistant', content: answer.text });
    if (game.lunaChat.length > 12) game.lunaChat.splice(0, game.lunaChat.length - 12);
    if (game.lunaLog.length > 40) game.lunaLog.splice(0, game.lunaLog.length - 40);
    if (answer.factId) game.unlockFact(answer.factId);
    game.audio.chime();
    busy = false;
    input.disabled = false;
    send.disabled = false;
    input.focus();
  });
  setTimeout(() => input.focus(), 50);
}
