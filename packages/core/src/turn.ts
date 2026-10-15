// Порядок хода: все ходят по очереди. Начало хода — завершаются стройки, затем доход, содержание и голод
// (новое здание приносит ресурсы уже в ход, когда достроено), осады, армии готовы.
// Конец хода — передача хода следующему живому игроку.

import { armyMove, completeJobs, settleEconomy } from './economy.ts';
import { resolveSieges } from './map.ts';
import { spawnBandits } from './bandits.ts';
import { rollEvent } from './events.ts';
import { recordHistory } from './stats.ts';
import { type GameState, createGame } from './state.ts';

export const currentPlayer = (s: GameState): string => s.order[s.current];

export const startTurn = (s: GameState): void => {
  const pid = currentPlayer(s);
  completeJobs(s, pid);
  if (s.turn > 1) settleEconomy(s, pid); // в 1-й ход доходов ещё нет
  for (const g of Object.values(s.generals)) {
    if (g.owner === pid) { g.moveLeft = (g.pinnedUntil ?? 0) > s.turn ? 0 : armyMove(s, pid); g.attacked = false; }
    // поселенец, который основывает город, стоит на месте
    if (g.owner === pid && g.settler && s.players[pid]?.jobs.some((j) => j.kind === 'found' && j.general === g.id)) g.moveLeft = 0;
  }
  resolveSieges(s, pid);
  rollEvent(s, pid);
};

/** Создать партию и начать ход первого игрока. */
export const newGame = (...args: Parameters<typeof createGame>): GameState => {
  const s = createGame(...args);
  if (args[2].bandits) spawnBandits(s, args[2].bandits);
  startTurn(s);
  recordHistory(s);
  return s;
};

export const endTurn = (s: GameState): void => {
  do {
    s.current = (s.current + 1) % s.order.length;
    if (s.current === 0) s.turn++;
  } while (!s.players[currentPlayer(s)].alive);
  startTurn(s);
  if (s.current === s.order.findIndex((id) => s.players[id].alive) && s.history?.at(-1)?.turn !== s.turn) recordHistory(s);
};
