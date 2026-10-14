// Армии и генералы: правило строя, найм фигур и генералов, обмен фигурами, итог боя.

import {
  ELO_PER_WIN, GENERAL_HIRE_GOLD, HIRE_LEVEL, MAX_GENERALS, MAX_STARS, PAWNS_REQUIRED, PIECES, PIECE_PRICE,
  PIECE_VALUE, type Piece,
} from './config.ts';
import { type Result, mods, playerGenerals, playerHalls, recruitElo } from './economy.ts';
import { distance, key } from './hex.ts';
import { type Army, type GameState, emptyArmy, makeGeneral, say } from './state.ts';

const ok: Result = { ok: true };
const no = (reason: string): Result => ({ ok: false, reason });

/** Правило строя: коням нужно 4 пешки, слонам 6, ладьям и ферзю 8. */
export const formationOk = (a: Army): boolean =>
  PIECES.every((p) => a[p] === 0 || a.p >= PAWNS_REQUIRED[p]);

const inOwnTerritory = (s: GameState, pid: string, gid: string): boolean =>
  s.cells[key(s.generals[gid].hex)]?.owner === pid;

/** Купить фигуру в армию генерала. Генерал должен стоять на своей территории. */
export const hirePiece = (s: GameState, pid: string, gid: string, piece: Piece): Result => {
  const p = s.players[pid];
  const g = s.generals[gid];
  if (!g || g.owner !== pid) return no('это не ваш генерал');
  if (!inOwnTerritory(s, pid, gid)) return no('генерал должен быть на своей территории');
  if (p.barracks < HIRE_LEVEL[piece]) return no(`нужна казарма ${HIRE_LEVEL[piece]}-го уровня`);
  if (p.res.gold < PIECE_PRICE[piece]) return no('не хватает золота');
  const next = { ...g.army, [piece]: g.army[piece] + 1 };
  if (!formationOk(next)) return no(`не хватает пешек: нужно ${PAWNS_REQUIRED[piece]}`);
  p.res.gold -= PIECE_PRICE[piece];
  g.army = next;
  return ok;
};

/** Нанять генерала в таверне. Он появляется у столицы с пустой армией и ELO с учётом «Тактики». */
export const hireGeneral = (s: GameState, pid: string): Result => {
  const p = s.players[pid];
  const count = playerGenerals(s, pid).length;
  if (count >= Math.min(MAX_GENERALS, p.tavern + 1)) return no('нужна таверна выше уровнем');
  const gold = Math.max(0, GENERAL_HIRE_GOLD[(count + 1) as 2 | 3 | 4 | 5] - (mods(s, pid).generalHireDiscount ?? 0));
  if (p.res.gold < gold) return no('не хватает золота');
  const capital = playerHalls(s, pid).sort((a, b) => a.order - b.order)[0];
  if (!capital) return no('нет ратуши');
  p.res.gold -= gold;
  const g = makeGeneral(s, pid, { ...capital.hex }, recruitElo(s, pid), emptyArmy(), 'General');
  say(s, `нанят генерал ${g.id} (ELO ${g.elo}, ${g.white})`, pid);
  return ok;
};

/** Передать фигуры между двумя своими генералами на одной или соседних клетках. */
export const transfer = (s: GameState, pid: string, fromId: string, toId: string, pieces: Partial<Army>): Result => {
  const a = s.generals[fromId];
  const b = s.generals[toId];
  if (!a || !b || a.owner !== pid || b.owner !== pid) return no('это не ваши генералы');
  if (distance(a.hex, b.hex) > 1) return no('генералы должны стоять рядом');
  const from = { ...a.army };
  const to = { ...b.army };
  for (const p of PIECES) {
    const n = pieces[p] ?? 0;
    if (n < 0 || n > from[p]) return no('столько фигур нет');
    from[p] -= n; to[p] += n;
  }
  if (!formationOk(from) || !formationOk(to)) return no('после обмена нарушится правило строя');
  a.army = from; b.army = to;
  return ok;
};

// ---------- Итог боя ----------

export type BattleEnd = 'mate' | 'stalemate' | 'repetition' | 'fifty' | 'insufficient' | 'limit';

/** Что вернул движок: как закончилась партия и что стоит на доске (без королей). Атакующий — белые. */
export type BattleReport = { end: BattleEnd; mateWinner?: 'white' | 'black'; white: Army; black: Army };

export type BattleOutcome = { winner: 'attacker' | 'defender' | null; note: string };

export const material = (a: Army): number => PIECES.reduce((sum, p) => sum + a[p] * PIECE_VALUE[p], 0);

/** Может ли сторона поставить мат против одинокого короля. Не может: голый король, король с конём,
 *  король со слоном, король с двумя конями. Пешка, ладья, ферзь, два слона или слон с конём — могут. */
export const canForceMate = (a: Army): boolean =>
  a.p > 0 || a.r > 0 || a.q > 0 || a.b >= 2 || (a.b >= 1 && a.n >= 1);

/** Ни одна сторона не может поставить мат — партия сразу заканчивается ничьей. */
export const insufficientMaterial = (white: Army, black: Army): boolean => !canForceMate(white) && !canForceMate(black);

/** Фигуры на доске по FEN (без королей). */
export const armiesFromFen = (fen: string): { white: Army; black: Army } => {
  const white = emptyArmy(), black = emptyArmy();
  for (const ch of fen.split(' ')[0]) {
    const lower = ch.toLowerCase() as Piece;
    if (!PIECES.includes(lower)) continue;
    (ch === lower ? black : white)[lower]++;
  }
  return { white, black };
};

/** Кто победил: мат; нет матующего материала у обеих сторон — ничья; на 150-м полуходе — материал;
 *  остальные ничьи — по правилу из настроек. */
export const judge = (r: BattleReport, drawRule: 'repel' | 'material' = 'repel'): BattleOutcome => {
  if (r.end === 'mate') return { winner: r.mateWinner === 'white' ? 'attacker' : 'defender', note: 'мат' };
  if (r.end === 'insufficient' || insufficientMaterial(r.white, r.black)) {
    return { winner: null, note: 'ничья — ни одна сторона не может поставить мат' };
  }
  const mw = material(r.white), mb = material(r.black);
  if (r.end === 'limit' || drawRule === 'material') {
    if (mw !== mb) return { winner: mw > mb ? 'attacker' : 'defender', note: `по материалу ${mw}:${mb}` };
  }
  return { winner: null, note: 'ничья — атака отбита' };
};

/** Какие фигуры вернутся на карту: только те, что умеет нанимать казарма; стартовый конь — всегда. */
export const returning = (s: GameState, owner: string, onBoard: Army): Army => {
  const p = s.players[owner];
  if (!p) return { ...onBoard }; // нейтралы: казармы нет, уцелевшие остаются
  const kept = emptyArmy();
  for (const piece of PIECES) kept[piece] = p.barracks >= HIRE_LEVEL[piece] ? onBoard[piece] : 0;
  if (p.barracks < HIRE_LEVEL.n && p.starterKnight) kept.n = Math.min(onBoard.n, 1);
  return kept;
};

/** Применить итог боя к армиям: проигравший теряет всё, победитель и стороны в ничьей — срубленное.
 *  Возвращает победителя; захват ратуши делает map.ts. */
export const applyBattle = (s: GameState, attackerId: string, defenderId: string, report: BattleReport): BattleOutcome => {
  const att = s.generals[attackerId];
  const def = s.generals[defenderId];
  const out = judge(report, 'repel');
  att.army = out.winner === 'defender' ? emptyArmy() : returning(s, att.owner, report.white);
  def.army = out.winner === 'attacker' ? emptyArmy() : returning(s, def.owner, report.black);
  att.attacked = true;
  att.moveLeft = 0;
  const winner = out.winner === 'attacker' ? att : out.winner === 'defender' ? def : null;
  if (winner && s.players[winner.owner] && winner.stars < MAX_STARS) {
    winner.stars++;
    winner.elo += ELO_PER_WIN;
  }
  say(s, `бой ${att.id} против ${def.id}: ${out.note}${winner ? `, победа ${winner.id}` : ''}`, att.owner);
  const loser = out.winner === 'attacker' ? def : out.winner === 'defender' ? att : null;
  if (loser) defeat(s, loser.id);
  for (const pid of [att.owner, def.owner]) {
    if (s.players[pid] && playerGenerals(s, pid).every((g) => g.army.n === 0)) s.players[pid].starterKnight = false;
  }
  return out;
};

/** Разбитый генерал погибает. Если он у игрока последний — остаётся жив и отступает в столицу.
 *  Гарнизон нейтрала погибает всегда. */
export const defeat = (s: GameState, gid: string): void => {
  const g = s.generals[gid];
  if (!s.players[g.owner] || playerGenerals(s, g.owner).length > 1) {
    delete s.generals[gid];
    say(s, `генерал ${gid} погиб`, g.owner);
    return;
  }
  const capital = playerHalls(s, g.owner).sort((a, b) => a.order - b.order)[0];
  if (capital) g.hex = { ...capital.hex };
  g.moveLeft = 0;
  say(s, `генерал ${gid} отступил в столицу`, g.owner);
};
