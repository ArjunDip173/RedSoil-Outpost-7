/**
 * Smaller pop-ups: LUNA's quiz questions and the mission-complete patch card.
 */
import type { Game } from '../Game';
import type { MissionDef } from '../types';
import { button, el, spriteCanvas, iconText } from './Dom';

export function showQuiz(game: Game): void {
  const quizzes = game.data.facts.quiz;
  const fresh = quizzes.filter((q) => !game.science.quizCorrect.includes(q.id));
  const pool = fresh.length ? fresh : quizzes;
  const q = pool[Math.floor(Math.random() * pool.length)];
  const m = game.ui.stack.open({ title: 'LUNA’S POP QUIZ!', size: 'sm', cls: 'quiz-modal' });
  const head = el('div', 'quiz-head');
  head.append(spriteCanvas(game.art.get('luna_wow'), 4), el('p', 'quiz-q', q.q));
  const opts = el('div', 'quiz-opts');
  const result = el('div', 'quiz-result');
  let answered = false;
  q.options.forEach((o, i) => {
    const b = button(
      o,
      () => {
        if (answered) return;
        answered = true;
        const right = i === q.answer;
        b.classList.add(right ? 'right' : 'wrong');
        opts.children[q.answer].classList.add('right');
        if (right) {
          game.audio.chime();
          game.missions.addXp(30);
          game.stats.quizzesRight++;
          if (!game.science.quizCorrect.includes(q.id)) game.science.quizCorrect.push(q.id);
          game.saveScience();
          game.checkBadges();
          result.innerHTML = `<b class="ok">Correct! +30 XP</b><br>${q.explain}`;
        } else {
          game.audio.error();
          result.innerHTML = `<b class="warn">Good try!</b><br>${q.explain}`;
        }
        result.appendChild(el('div', 'muted small', `Source: ${q.source}`));
        close.classList.remove('hidden');
      },
      'btn quiz-opt',
    );
    opts.appendChild(b);
  });
  const close = button('Back to Mars ▶', () => m.close(), 'btn primary hidden');
  const skip = button('Maybe later', () => m.close(), 'btn ghost small');
  m.body.append(head, opts, result, close, skip);
}

export function showMissionComplete(game: Game, mission: MissionDef, onDone: () => void): void {
  const m = game.ui.stack.open({
    title: `MISSION ${mission.id} COMPLETE!`,
    size: 'md',
    closable: false,
    cls: 'complete-modal',
  });
  const wrap = el('div', 'complete');
  const patch = spriteCanvas(game.art.get(mission.patch), 4, 'patch big-patch');
  const info = el('div', 'complete-info');
  info.append(el('h3', '', mission.title), el('p', '', mission.lesson));
  const rewards = el('div', 'chips');
  rewards.appendChild(el('span', 'chip ok', `+${mission.rewards.xp} XP`));
  for (const [id, n] of Object.entries(mission.rewards.items ?? {}))
    rewards.appendChild(
      el('span', 'chip', `+${n} ${id.replace('seed_', '').replace('_', ' ')}${id.startsWith('seed_') ? ' seeds' : ''}`),
    );
  rewards.appendChild(iconText('icon_star', 'Mission patch earned', 'chip'));
  info.appendChild(rewards);
  wrap.append(patch, info);
  let fired = false; // a double-click must never skip a mission
  const next = button(
    mission.id < 6 ? 'NEXT MISSION ▶' : 'CONTINUE ▶',
    () => {
      if (fired) return;
      fired = true;
      next.disabled = true;
      m.close();
      onDone();
    },
    'btn primary big',
  );
  m.body.append(wrap, next);
  setTimeout(() => next.focus(), 50);
}
