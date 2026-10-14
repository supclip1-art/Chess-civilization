// Бой — настоящая шахматная партия генерала против генерала. Атакующий играет белыми.
// Одна и та же партия идёт в двух режимах: автобой (оба генерала — Stockfish с силой по ELO)
// и ручной бой (белыми ходит игрок; в любой момент можно сдаться или передать бой своему генералу).
// Генерал с полным набором фигур играет свой любимый дебют из книги, пока соперник идёт по линии.
// Конец партии: мат, пат, сдача, троекратное повторение, правило 50 ходов, нет матующего материала, 150 полуходов.

import {
  MAX_PLIES, armiesFromFen, battleFen, bookMove, insufficientMaterial, next, type BattleEnd, type BattleReport,
  type GameState, type General,
} from '../../../core/src/index.ts';
import { Engine, profile } from '../engine.ts';

let engine: Engine | null = null;
export const getEngine = async (): Promise<Engine> => (engine ??= await Engine.load());

export type BattleRecord = {
  report: BattleReport;
  startFen: string;
  moves: string[];
  /** Позиция после каждого полухода, fens[0] — стартовая. */
  fens: string[];
  /** Сколько полуходов сыграно по дебютной книге. */
  bookPlies: number;
  seconds: number;
};

/** Что видит игрок перед своим ходом. */
export type Turn = { fen: string; moves: string[]; legal: string[]; inCheck: boolean };
export type HumanAction = { move: string } | { resign: true } | { auto: true };

export type BattleHooks = {
  /** Если задан — за сторону humanSide (по умолчанию белые, атакующий) ходит игрок. */
  human?: (t: Turn) => Promise<HumanAction>;
  humanSide?: 'white' | 'black';
  /** После каждого полухода. */
  onPly?: (t: { fen: string; moves: string[]; inCheck: boolean; book: boolean }) => void;
  /** Ход генерала не быстрее этого — чтобы игрок успевал увидеть ответ. */
  minDelayMs?: number | (() => number);
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const positionKey = (fen: string) => fen.split(' ').slice(0, 4).join(' ');

/** Ход генерала: из книги, иначе — Stockfish с бюджетом узлов по ELO; слабые иногда берут не лучший из 3. */
const generalMove = async (
  e: Engine, s: GameState, g: General, startFen: string, moves: string[], white: boolean, legal: string[], pos: string,
): Promise<{ move: string; book: boolean }> => {
  const book = bookMove(g, startFen, moves, white);
  if (book && legal.includes(book)) return { move: book, book: true };
  const prof = profile(g.elo);
  if (prof.blunder > 0 && next(s.rng) < prof.blunder) {
    const alts = (await e.searchMulti(pos, prof.nodes, 3)).filter((m) => legal.includes(m));
    if (alts.length > 1) return { move: alts[1 + Math.floor(next(s.rng) * (alts.length - 1))], book: false };
    if (alts.length) return { move: alts[0], book: false };
  }
  const best = (await e.search(pos, prof.nodes)).best;
  return { move: legal.includes(best) ? best : legal[0], book: false };
};

export const runBattle = async (s: GameState, attackerId: string, defenderId: string, hooks: BattleHooks = {}): Promise<BattleRecord> => {
  const e = await getEngine();
  const att = s.generals[attackerId], def = s.generals[defenderId];
  const startFen = battleFen(att.army, def.army);
  const moves: string[] = [];
  const fens = [startFen];
  const seen = new Map<string, number>([[positionKey(startFen), 1]]);
  const pos = () => `fen ${startFen}${moves.length ? ` moves ${moves.join(' ')}` : ''}`;
  const t0 = performance.now();
  let human = hooks.human;
  let end: BattleEnd = 'limit';
  let mateWinner: 'white' | 'black' | undefined;
  let fen = startFen;
  let inCheck = false;
  let bookPlies = 0;
  e.send('ucinewgame');
  await e.ready();
  for (;;) {
    if (moves.length >= MAX_PLIES) { end = 'limit'; break; }
    const white = moves.length % 2 === 0;
    const legal = await e.legalMoves(pos());
    if (!legal.length) {
      if (inCheck) { end = 'mate'; mateWinner = white ? 'black' : 'white'; } else end = 'stalemate';
      break;
    }
    let move: string;
    let book = false;
    if (human && white === ((hooks.humanSide ?? 'white') === 'white')) {
      const a = await human({ fen, moves: [...moves], legal, inCheck });
      if ('resign' in a) { end = 'resign'; mateWinner = white ? 'black' : 'white'; break; }
      if ('auto' in a) { human = undefined; continue; }
      move = a.move;
    } else {
      const started = performance.now();
      ({ move, book } = await generalMove(e, s, white ? att : def, startFen, moves, white, legal, pos()));
      const delay = typeof hooks.minDelayMs === 'function' ? hooks.minDelayMs() : hooks.minDelayMs ?? 0;
      if (delay) await sleep(Math.max(0, delay - (performance.now() - started)));
    }
    if (book) bookPlies++;
    moves.push(move);
    ({ fen, inCheck } = await e.inspect(pos()));
    fens.push(fen);
    hooks.onPly?.({ fen, moves: [...moves], inCheck, book });
    const { white: w, black: b } = armiesFromFen(fen);
    if (insufficientMaterial(w, b)) { end = 'insufficient'; break; }
    const k = positionKey(fen);
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    if (n >= 3) { end = 'repetition'; break; }
    if (Number(fen.split(' ')[4]) >= 100) { end = 'fifty'; break; }
  }
  const { white, black } = armiesFromFen(fen);
  return { report: { end, mateWinner, white, black }, startFen, moves, fens, bookPlies, seconds: (performance.now() - t0) / 1000 };
};

/** Автобой: оба генерала играют сами. */
export const autobattle = (s: GameState, attackerId: string, defenderId: string, onPly?: (ply: number) => void) =>
  runBattle(s, attackerId, defenderId, { onPly: onPly && ((t) => onPly(t.moves.length)) });
