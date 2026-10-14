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
  if (!g || g.owner !== pid) return no('not your general');
  if (!inOwnTerritory(s, pid, gid)) return no('the general must stand on your land');
  if (p.barracks < HIRE_LEVEL[piece]) return no(`needs barracks level ${HIRE_LEVEL[piece]}`);
  if (p.res.gold < PIECE_PRICE[piece]) return no('not enough gold');
  const next = { ...g.army, [piece]: g.army[piece] + 1 };
  if (!formationOk(next)) return no(`needs ${PAWNS_REQUIRED[piece]} pawns in the army`);
  p.res.gold -= PIECE_PRICE[piece];
  g.army = next;
  return ok;
};

/** Нанять генерала в таверне. Он появляется у столицы с пустой армией и ELO с учётом «Тактики». */
export const hireGeneral = (s: GameState, pid: string): Result => {
  const p = s.players[pid];
  const count = playerGenerals(s, pid).length;
  if (count >= Math.min(MAX_GENERALS, p.tavern + 1)) return no('upgrade your tavern first');
  const gold = Math.max(0, GENERAL_HIRE_GOLD[(count + 1) as 2 | 3 | 4 | 5] - (mods(s, pid).generalHireDiscount ?? 0));
  if (p.res.gold < gold) return no('not enough gold');
  const capital = playerHalls(s, pid).sort((a, b) => a.order - b.order)[0];
  if (!capital) return no('no city');
  p.res.gold -= gold;
  const g = makeGeneral(s, pid, { ...capital.hex }, recruitElo(s, pid), emptyArmy(), 'General');
  say(s, `new general hired (ELO ${g.elo}, ${g.white})`, pid);
  return ok;
};

/** Передать фигуры между двумя своими генералами на одной или соседних клетках. */
export const transfer = (s: GameState, pid: string, fromId: string, toId: string, pieces: Partial<Army>): Result => {
  const a = s.generals[fromId];
  const b = s.generals[toId];
  if (!a || !b || a.owner !== pid || b.owner !== pid) return no('these are not your generals');
  if (distance(a.hex, b.hex) > 1) return no('the generals must stand next to each other');
  const from = { ...a.army };
  const to = { ...b.army };
  for (const p of PIECES) {
    const n = pieces[p] ?? 0;
    if (n < 0 || n > from[p]) return no('not that many pieces');
    from[p] -= n; to[p] += n;
  }
  if (!formationOk(from) || !formationOk(to)) return no('the exchange would break the formation rule');
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
  if (r.end === 'mate') return { winner: r.mateWinner === 'white' ? 'attacker' : 'defender', note: 'checkmate' };
  if (r.end === 'insufficient' || insufficientMaterial(r.white, r.black)) {
    return { winner: null, note: 'draw: neither side can checkmate' };
  }
  const mw = material(r.white), mb = material(r.black);
  if (r.end === 'limit' || drawRule === 'material') {
    // по материалу побеждает только сторона, которая сама способна поставить мат
    const ahead = mw > mb ? r.white : r.black;
    if (mw !== mb && canForceMate(ahead)) return { winner: mw > mb ? 'attacker' : 'defender', note: `won on material ${mw}:${mb}` };
    if (mw !== mb) return { winner: null, note: `draw: the side ahead ${Math.max(mw, mb)}:${Math.min(mw, mb)} cannot checkmate` };
  }
  return { winner: null, note: 'draw: the attack is repelled' };
};

/** Какие фигуры вернутся на карту. Уцелевшие фигуры, с которыми генерал вошёл в бой, возвращаются всегда.
 *  Лишние фигуры (из превращённых пешек) остаются, только если казарма умеет их нанимать. */
export const returning = (s: GameState, owner: string, onBoard: Army, before: Army): Army => {
  const p = s.players[owner];
  if (!p) return { ...onBoard }; // нейтралы: казармы нет, уцелевшие остаются
  const kept = emptyArmy();
  for (const piece of PIECES) {
    const own = Math.min(onBoard[piece], before[piece]);
    const promoted = onBoard[piece] - own;
    kept[piece] = own + (p.barracks >= HIRE_LEVEL[piece] ? promoted : 0);
  }
  return kept;
};

/** Применить итог боя к армиям: проигравший теряет всё, победитель и стороны в ничьей — срубленное.
 *  Возвращает победителя; захват ратуши делает map.ts. */
export const applyBattle = (s: GameState, attackerId: string, defenderId: string, report: BattleReport): BattleOutcome => {
  const att = s.generals[attackerId];
  const def = s.generals[defenderId];
  const out = judge(report, 'repel');
  att.army = out.winner === 'defender' ? emptyArmy() : returning(s, att.owner, report.white, att.army);
  def.army = out.winner === 'attacker' ? emptyArmy() : returning(s, def.owner, report.black, def.army);
  att.attacked = true;
  att.moveLeft = 0;
  const winner = out.winner === 'attacker' ? att : out.winner === 'defender' ? def : null;
  if (winner && s.players[winner.owner] && winner.stars < MAX_STARS) {
    winner.stars++;
    winner.elo += ELO_PER_WIN;
  }
  say(s, `battle: ${out.note}`, att.owner);
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
    say(s, `a general fell in battle`, g.owner);
    return;
  }
  const capital = playerHalls(s, g.owner).sort((a, b) => a.order - b.order)[0];
  if (capital) g.hex = { ...capital.hex };
  g.moveLeft = 0;
  say(s, `the defeated general retreated to the capital`, g.owner);
};
