// Порядок хода: все ходят по очереди. Начало хода — завершаются стройки и осады, армии готовы;
// конец хода — доход, содержание, голод; передача хода следующему живому игроку.

import { ARMY_MOVE } from './config.ts';
import { completeJobs, settleEconomy } from './economy.ts';
import { resolveSieges } from './map.ts';
import { type GameState, createGame } from './state.ts';

export const currentPlayer = (s: GameState): string => s.order[s.current];

export const startTurn = (s: GameState): void => {
  const pid = currentPlayer(s);
  completeJobs(s, pid);
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
  settleEconomy(s, currentPlayer(s));
  do {
    s.current = (s.current + 1) % s.order.length;
    if (s.current === 0) s.turn++;
  } while (!s.players[currentPlayer(s)].alive);
  startTurn(s);
};
