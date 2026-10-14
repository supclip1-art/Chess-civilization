// Порядок хода: все ходят по очереди. Начало хода — завершаются стройки, затем доход, содержание и голод
// (новое здание приносит ресурсы уже в ход, когда достроено), осады, армии готовы.
// Конец хода — передача хода следующему живому игроку.

import { ARMY_MOVE } from './config.ts';
import { completeJobs, settleEconomy } from './economy.ts';
import { resolveSieges } from './map.ts';
import { type GameState, createGame } from './state.ts';

export const currentPlayer = (s: GameState): string => s.order[s.current];

export const startTurn = (s: GameState): void => {
  const pid = currentPlayer(s);
  completeJobs(s, pid);
  if (s.turn > 1) settleEconomy(s, pid); // в 1-й ход доходов ещё нет
  for (const g of Object.values(s.generals)) {
    if (g.owner === pid) { g.moveLeft = ARMY_MOVE; g.attacked = false; }
  }
  resolveSieges(s, pid);
};

/** Создать партию и начать ход первого игрока. */
export const newGame = (...args: Parameters<typeof createGame>): GameState => {
  const s = createGame(...args);
  startTurn(s);
  return s;
};

export const endTurn = (s: GameState): void => {
  do {
    s.current = (s.current + 1) % s.order.length;
    if (s.current === 0) s.turn++;
  } while (!s.players[currentPlayer(s)].alive);
  startTurn(s);
};
