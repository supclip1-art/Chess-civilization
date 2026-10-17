// Порядок хода: все ходят по очереди. Начало хода — завершаются стройки, затем доход, содержание и голод
// (новое здание приносит ресурсы уже в ход, когда достроено), осады, армии готовы.
// Конец хода — передача хода следующему живому игроку.

import { armyMove, completeJobs, settleEconomy } from './economy.ts';
import { resolveSieges } from './map.ts';
import { spawnBandits } from './bandits.ts';
import { rollEvent } from './events.ts';
import { checkRebellion, payOverlord } from './vassals.ts';
import { recordHistory } from './stats.ts';
import { autoDevelop } from './autodev.ts';
import { wonderTick } from './wonders.ts';
import { type GameState, createGame, say } from './state.ts';

export const currentPlayer = (s: GameState): string => s.order[s.current];

export const startTurn = (s: GameState): void => {
  const pid = currentPlayer(s);
  completeJobs(s, pid);
  wonderTick(s, pid);
  if (s.turn > 1) settleEconomy(s, pid); // в 1-й ход доходов ещё нет
  if (s.turn > 1 && s.players[pid]?.overlord) payOverlord(s, pid); // вассал отдаёт четверть дохода
  checkRebellion(s, pid);
  for (const g of Object.values(s.generals)) {
    if (g.owner === pid) { g.moveLeft = (g.pinnedUntil ?? 0) > s.turn ? 0 : armyMove(s, pid) + (g.traits?.includes('pathfinder') ? 1 : 0); g.attacked = false; }
    // поселенец, который основывает город, стоит на месте
    if (g.owner === pid && g.settler && s.players[pid]?.jobs.some((j) => j.kind === 'found' && j.general === g.id)) g.moveLeft = 0;
  }
  resolveSieges(s, pid);
  if (s.players[pid] && !s.players[pid].ai) autoDevelop(s, pid); // авторазвитие городов игрока
  if (Object.values(s.halls).some((h) => h.owner === pid)) rollEvent(s, pid); // у шайки без города событий нет
};

/** Создать партию и начать ход первого игрока. */
export const newGame = (...args: Parameters<typeof createGame>): GameState => {
  const s = createGame(...args);
  if (args[2].bandits) spawnBandits(s, args[2].bandits);
  startTurn(s);
  recordHistory(s);
  return s;
};

/** Разбойник без городов жив, пока жива хоть одна его армия. */
export const checkOutlaws = (s: GameState): void => {
  for (const p of Object.values(s.players)) {
    if (!p.outlaw || !p.alive) continue;
    if (Object.values(s.halls).some((h) => h.owner === p.id) || Object.values(s.generals).some((g) => g.owner === p.id)) continue;
    p.alive = false;
    say(s, 'your band is destroyed — the outlaw story ends here', p.id);
  }
};

export const endTurn = (s: GameState): void => {
  checkOutlaws(s);
  do {
    s.current = (s.current + 1) % s.order.length;
    if (s.current === 0) s.turn++;
  } while (!s.players[currentPlayer(s)].alive);
  startTurn(s);
  if (s.current === s.order.findIndex((id) => s.players[id].alive) && s.history?.at(-1)?.turn !== s.turn) recordHistory(s);
};
