// Армии и генералы: правило строя, найм фигур и генералов, обмен фигурами, итог боя.

import {
  ARMY_MAX, ELO_PER_WIN, GENERAL_HIRE_GOLD, HIRE_LEVEL, MAX_GENERALS, MAX_STARS, PAWNS_REQUIRED, PIECES, PIECE_PRICE,
  PIECE_VALUE, type Piece,
} from './config.ts';
import { type Result, hasTech, mods, piecePrice, playerGenerals, playerHalls, recruitElo } from './economy.ts';
import { distance, key } from './hex.ts';
import { freeCellNear } from './map.ts';
import { type Army, type GameState, emptyArmy, generalName, makeGeneral, say } from './state.ts';

const ok: Result = { ok: true };
const PIECE_NAMES: Record<Piece, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen' };
const no = (reason: string): Result => ({ ok: false, reason });

/** Правило строя: коням нужно 4 пешки, слонам 6, ладьям и ферзю 8. */
export const formationOk = (a: Army): boolean =>
  PIECES.every((p) => a[p] === 0 || a.p >= PAWNS_REQUIRED[p]);


/** Город, к земле которого относится клетка генерала (если это земля игрока). */
export const hallUnder = (s: GameState, pid: string, gid: string) => {
  const c = s.cells[key(s.generals[gid].hex)];
  return c?.owner === pid && c.hall ? s.halls[c.hall] : undefined;
};

/** Купить фигуру в армию генерала. Генерал стоит на земле своего города; нанять можно только то,
 *  что умеет казарма именно этого города. */
export const hirePiece = (s: GameState, pid: string, gid: string, piece: Piece): Result => {
  const p = s.players[pid];
  const g = s.generals[gid];
  if (!g || g.owner !== pid) return no('not your general');
  if (g.settler) return no('settlers carry no army');
  const h = hallUnder(s, pid, gid);
  if (!h) return no('the general must stand on the land of one of your cities');
  const bar = h.barracks ?? 0;
  if (bar < HIRE_LEVEL[piece]) {
    return no(bar ? `${h.name} needs barracks level ${HIRE_LEVEL[piece]} for this piece` : `${h.name} has no barracks: tap the city, then Build barracks`);
  }
  if (g.army[piece] >= ARMY_MAX[piece]) return no(`an army holds at most ${ARMY_MAX[piece]} ${PIECE_NAMES[piece]}${ARMY_MAX[piece] > 1 ? 's' : ''}`);
  const price = piecePrice(s, pid, piece);
  if (p.res.gold < price) return no('not enough gold');
  const next = { ...g.army, [piece]: g.army[piece] + 1 };
  // пешку нанять можно всегда (она только чинит строй); фигуре нужно достаточно пешек
  if (piece !== 'p' && next.p < PAWNS_REQUIRED[piece]) return no(`this army needs ${PAWNS_REQUIRED[piece]} pawns first — hire pawns`);
  p.res.gold -= price;
  g.army = next;
  return ok;
};

/** Сколько генералов может быть у игрока: 1 + уровень лучшей таверны, не больше MAX_GENERALS. */
export const generalLimit = (s: GameState, pid: string): number =>
  Math.min(MAX_GENERALS, 1 + Math.max(0, ...playerHalls(s, pid).map((h) => h.tavern ?? 0)));

/** Нанять генерала в таверне города (без hallId — в городе с лучшей таверной). Он появляется в этом городе
 *  с пустой армией и ELO с учётом «Тактики». */
export const hireGeneral = (s: GameState, pid: string, hallId?: string): Result => {
  const p = s.players[pid];
  const count = playerGenerals(s, pid).length;
  const halls = playerHalls(s, pid).sort((a, b) => (b.tavern ?? 0) - (a.tavern ?? 0) || a.order - b.order);
  const h = hallId ? halls.find((x) => x.id === hallId) : halls[0];
  if (!h) return no('not your city');
  if (!h.tavern) return no(`${h.name} has no tavern: build one in this city first`);
  if (count >= generalLimit(s, pid)) return no('upgrade a tavern first');
  const spot = freeCellNear(s, h.hex, pid);
  if (!spot) return no(`no free cell next to ${h.name} for a new army`);
  const gold = Math.max(0, GENERAL_HIRE_GOLD[(count + 1) as 2 | 3 | 4 | 5] - (mods(s, pid).generalHireDiscount ?? 0));
  if (p.res.gold < gold) return no('not enough gold');
  p.res.gold -= gold;
  const g = makeGeneral(s, pid, spot, recruitElo(s, pid), emptyArmy(), generalName(s, pid));
  say(s, `new general hired in ${h.name} (ELO ${g.elo}, ${g.white})`, pid);
  return ok;
};

/** Передать фигуры между двумя своими генералами на одной или соседних клетках. */
export const transfer = (s: GameState, pid: string, fromId: string, toId: string, pieces: Partial<Army>): Result => {
  const a = s.generals[fromId];
  const b = s.generals[toId];
  if (!a || !b || a.owner !== pid || b.owner !== pid || a.settler || b.settler) return no('these are not your generals');
  if (distance(a.hex, b.hex) > 1) return no('the generals must stand next to each other');
  const from = { ...a.army };
  const to = { ...b.army };
  for (const p of PIECES) {
    const n = pieces[p] ?? 0;
    if (n < 0 || n > from[p]) return no('not that many pieces');
    from[p] -= n; to[p] += n;
  }
  if (!formationOk(from) || !formationOk(to)) return no('the exchange would break the formation rule');
  if (PIECES.some((x) => to[x] > ARMY_MAX[x])) return no('too many pieces of one kind for one army');
  a.army = from; b.army = to;
  return ok;
};

// ---------- Итог боя ----------

/** Кто и с чем выходит на доску. «Укрепления»: армия, защищающая свой город, получает лишнюю пешку
 *  (если пешек меньше 8), иначе +50 ELO. Лишняя пешка после боя не остаётся. */
export const battleSides = (s: GameState, attackerId: string, defenderId: string) => {
  const att = s.generals[attackerId], def = s.generals[defenderId];
  const black = { ...def.army };
  let blackElo = def.elo;
  let fortified = false;
  const home = Object.values(s.halls).some((h) => h.owner === def.owner && h.hex.q === def.hex.q && h.hex.r === def.hex.r);
  if (home && s.players[def.owner] && hasTech(s, def.owner, 'fortify')) {
    fortified = true;
    if (black.p < ARMY_MAX.p) black.p++; else blackElo += 50;
  }
  return { white: { ...att.army }, black, whiteElo: att.elo, blackElo, fortified };
};

export type BattleEnd = 'mate' | 'resign' | 'stalemate' | 'repetition' | 'fifty' | 'insufficient' | 'limit';

/** Что вернул движок: как закончилась партия и что стоит на доске (без королей). Атакующий — белые. */
/** mateWinner — победитель при мате или сдаче соперника. */
export type BattleReport = { end: BattleEnd; mateWinner?: 'white' | 'black'; white: Army; black: Army; promoted?: { white: Army; black: Army } };

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
  if (r.end === 'resign') return { winner: r.mateWinner === 'white' ? 'attacker' : 'defender', note: r.mateWinner === 'white' ? 'the defender resigned' : 'the attacker resigned' };
  if (r.end === 'insufficient' || insufficientMaterial(r.white, r.black)) {
    return { winner: null, note: 'draw: neither side can checkmate' };
  }
  const mw = material(r.white), mb = material(r.black);
  if (r.end === 'limit' || drawRule === 'material') {
    // по материалу побеждает только сторона, которая сама способна поставить мат
    const ahead = mw > mb ? r.white : r.black;
    if (mw !== mb && canForceMate(ahead)) return { winner: mw > mb ? 'attacker' : 'defender', note: `${mw > mb ? 'the attacker' : 'the defender'} won on material, ${Math.max(mw, mb)} to ${Math.min(mw, mb)}` };
    if (mw !== mb) return { winner: null, note: `draw: the side ahead ${Math.max(mw, mb)}:${Math.min(mw, mb)} cannot checkmate` };
  }
  return { winner: null, note: 'draw: the attack is repelled' };
};

/** Сколько пешек каждой стороны превратилось и в какие фигуры — по ходам партии (белые ходят первыми). */
export const promotions = (moves: string[]): { white: Army; black: Army } => {
  const white = emptyArmy(), black = emptyArmy();
  moves.forEach((m, i) => {
    const to = m[4] as Piece | undefined;
    if (to && PIECES.includes(to)) (i % 2 ? black : white)[to]++;
  });
  return { white, black };
};

/** Какие фигуры вернутся на карту. Уцелевшие фигуры, с которыми генерал вошёл в бой, возвращаются.
 *  Превращённые пешки снова становятся пешками. Если неясно, какая из одинаковых фигур уцелела,
 *  считаем, что уцелела превращённая. Без списка превращений лишние фигуры считаются превращёнными. */
export const returning = (_s: GameState, _owner: string, onBoard: Army, before: Army, promoted?: Army): Army => {
  const kept = emptyArmy();
  let pawns = onBoard.p;
  for (const piece of PIECES) {
    if (piece === 'p') continue;
    const promo = promoted ? promoted[piece] : Math.max(0, onBoard[piece] - before[piece]);
    kept[piece] = Math.min(before[piece], Math.max(0, onBoard[piece] - promo));
    pawns += onBoard[piece] - kept[piece];
  }
  kept.p = Math.min(before.p, pawns);
  return kept;
};

/** Применить итог боя к армиям: проигравший теряет всё, победитель и стороны в ничьей — срубленное.
 *  Возвращает победителя; захват ратуши делает map.ts. */
export const applyBattle = (s: GameState, attackerId: string, defenderId: string, report: BattleReport): BattleOutcome => {
  const att = s.generals[attackerId];
  const def = s.generals[defenderId];
  const out = judge(report, 'repel');
  att.army = out.winner === 'defender' ? emptyArmy() : returning(s, att.owner, report.white, att.army, report.promoted?.white);
  def.army = out.winner === 'attacker' ? emptyArmy() : returning(s, def.owner, report.black, def.army, report.promoted?.black);
  att.attacked = true;
  att.moveLeft = 0;
  const winner = out.winner === 'attacker' ? att : out.winner === 'defender' ? def : null;
  if (winner && s.players[winner.owner] && winner.stars < MAX_STARS) {
    winner.stars++;
    winner.elo += hasTech(s, winner.owner, 'veterans') ? 25 : ELO_PER_WIN; // «Ветераны»
  }
  say(s, `battle: ${out.note}`, att.owner);
  const loser = out.winner === 'attacker' ? def : out.winner === 'defender' ? att : null;
  if (loser) defeat(s, loser.id);
  // ничья с разбойниками: шайка рассеивается; новая появится по расписанию, уже по силе армий игроков
  else for (const g of [att, def]) if (g.owner === 'bandits') { delete s.generals[g.id]; say(s, 'the bandits scattered after a drawn battle', g === att ? def.owner : att.owner); }
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
  const spot = capital && freeCellNear(s, capital.hex, g.owner, g.id);
  if (spot) g.hex = spot;
  g.moveLeft = 0;
  say(s, `the defeated general retreated to the capital`, g.owner);
};
