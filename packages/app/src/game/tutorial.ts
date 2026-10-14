// Обучение первому ходу (этап 6): короткие подсказки поверх карты в первой партии.
// Шаг закрывается кнопкой «Next» или сам, когда игрок сделал то, о чём просили (например, заложил ферму).

import { NATIONS, playerHalls, type GameState } from '../../../core/src/index.ts';
import { tap } from '../tg.ts';

const KEY = 'chessciv.tutorial.done';

type Step = { text: (s: GameState, me: string) => string; done?: (s: GameState, me: string) => boolean };

const STEPS: Step[] = [
  {
    text: (s, me) => `Welcome, ruler of <b>${NATIONS[s.players[me].nation].name}</b>! This is your capital, <b>${playerHalls(s, me)[0]?.name}</b>. The land inside your coloured border is yours — you build only there.`,
  },
  {
    text: () => 'The top bar shows your <b>wood</b>, <b>food</b> and <b>gold</b> and how much each grows per turn. Food also feeds your army — if it runs out, pieces desert.',
  },
  {
    text: () => 'Tap a <b>field</b> next to your capital and press <b>Build farm</b>. A new building pays from the turn it is finished.',
    done: (s, me) => s.players[me].jobs.some((j) => j.kind === 'resource') || Object.values(s.cells).some((c) => c.owner === me && c.building),
  },
  {
    text: (s, me) => `Tap <b>${playerHalls(s, me)[0]?.name}</b> to grow the city, hire builders, build <b>barracks</b> (to hire chess pieces) and a <b>tavern</b> (more generals).`,
  },
  {
    text: () => 'Your <b>general</b> is the king with your army. He moves 2 cells per turn. Next to an enemy army or city, tap it and attack — <b>every battle is a real chess game</b> you can play yourself.',
  },
  {
    text: () => 'Neutral cities hold small garrisons — easy first conquests. When you are done, press <b>End turn</b>. Good luck!',
    done: (s) => s.turn > 1,
  },
];

export const tutorialDone = (): boolean => { try { return localStorage.getItem(KEY) === '1'; } catch { return true; } };
export const resetTutorial = (): void => { try { localStorage.removeItem(KEY); } catch { /* ничего */ } };

/** Подсказки первой партии. update() вызывать после каждого действия игрока. */
export const startTutorial = (app: HTMLElement, s: GameState, me: string): { update: () => void } => {
  if (tutorialDone()) return { update: () => {} };
  let i = 0;
  const el = document.createElement('div');
  el.className = 'tutorial';
  app.appendChild(el);
  const close = () => { el.remove(); try { localStorage.setItem(KEY, '1'); } catch { /* ничего */ } };
  const render = () => {
    if (i >= STEPS.length) { close(); return; }
    el.innerHTML = `<p>${STEPS[i].text(s, me)}</p>
      <div class="trow"><span class="muted">${i + 1} / ${STEPS.length}</span>
      <span><button class="ghost tbtn" data-t="skip">Skip tutorial</button><button class="tbtn" data-t="next">${i === STEPS.length - 1 ? 'Got it' : 'Next'}</button></span></div>`;
  };
  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-t]');
    if (!b) return;
    tap();
    if (b.dataset.t === 'skip') { close(); return; }
    i++; render();
  });
  render();
  return {
    update: () => {
      if (!el.isConnected) return;
      while (i < STEPS.length && STEPS[i].done?.(s, me)) i++;
      render();
    },
  };
};
