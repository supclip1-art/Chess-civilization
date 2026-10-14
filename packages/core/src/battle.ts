// Расстановка армий на доске для боя. Атакующий играет белыми.
// Фигуры встают на свои обычные поля; пешки — от центра к краям (e, d, f, c, g, b, h, a).
// Лишние фигуры (например, третий конь после превращения) — на свободные поля последней и второй горизонтали.

import { type Piece } from './config.ts';
import { type Army } from './state.ts';

const PAWN_FILES = ['e', 'd', 'f', 'c', 'g', 'b', 'h', 'a'];
const HOME: Record<Exclude<Piece, 'p'>, string[]> = { n: ['b', 'g'], b: ['c', 'f'], r: ['a', 'h'], q: ['d'] };
const SPARE_BACK = ['d', 'c', 'f', 'b', 'g', 'a', 'h'];
const FILES = 'abcdefgh';

type Board = Map<string, string>; // "e1" -> "K" / "p"

const place = (board: Board, army: Army, white: boolean): void => {
  const back = white ? '1' : '8';
  const front = white ? '2' : '7';
  const put = (sq: string, p: string) => board.set(sq, white ? p.toUpperCase() : p);
  put(`e${back}`, 'k');
  PAWN_FILES.slice(0, Math.min(8, army.p)).forEach((f) => put(`${f}${front}`, 'p'));
  const extras: string[] = [];
  for (const piece of ['q', 'r', 'b', 'n'] as const) {
    let n = army[piece];
    for (const f of HOME[piece]) if (n > 0 && !board.has(`${f}${back}`)) { put(`${f}${back}`, piece); n--; }
    for (; n > 0; n--) extras.push(piece);
  }
  const spare = [...SPARE_BACK.map((f) => `${f}${back}`), ...PAWN_FILES.map((f) => `${f}${front}`)].filter((sq) => !board.has(sq));
  for (const p of extras) { const sq = spare.shift(); if (sq) put(sq, p); }
};

/** Стартовая позиция боя в FEN. Рокировка разрешена, если король и ладья стоят на своих полях. */
export const battleFen = (attacker: Army, defender: Army): string => {
  const board: Board = new Map();
  place(board, attacker, true);
  place(board, defender, false);
  const rows: string[] = [];
  for (let r = 8; r >= 1; r--) {
    let row = '', empty = 0;
    for (const f of FILES) {
      const p = board.get(`${f}${r}`);
      if (!p) { empty++; continue; }
      if (empty) { row += empty; empty = 0; }
      row += p;
    }
    if (empty) row += empty;
    rows.push(row);
  }
  const at = (sq: string, p: string) => board.get(sq) === p;
  let castling = '';
  if (at('e1', 'K')) { if (at('h1', 'R')) castling += 'K'; if (at('a1', 'R')) castling += 'Q'; }
  if (at('e8', 'k')) { if (at('h8', 'r')) castling += 'k'; if (at('a8', 'r')) castling += 'q'; }
  return `${rows.join('/')} w ${castling || '-'} - 0 1`;
};
