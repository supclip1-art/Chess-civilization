// Дебютные книги генералов. У каждого генерала есть любимый дебют белыми и защиты против 1.e4 и 1.d4
// (state.ts: OPENINGS_WHITE, DEFENSES_E4, DEFENSES_D4). Генерал играет их только при полном наборе фигур
// на своей стороне доски (решение дизайна). Линии — ходы обеих сторон в UCI; генерал делает свой ход из книги,
// пока партия идёт точно по одной из линий. Как только соперник свернул — дальше думает движок.

import { type General } from './state.ts';

export const OPENING_LINES: Record<string, string[][]> = {
  // ---- белыми ----
  'Italian Game': [
    'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6 d2d3 d7d6 e1g1',
    'e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 d2d3 f8c5 c2c3 d7d6 e1g1',
    'e2e4 e7e5 g1f3 b8c6 f1c4 f8e7 d2d4 e5d4 f3d4',
  ].map((l) => l.split(' ')),
  'Ruy Lopez': [
    'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7 f1e1 b7b5 a4b3 d7d6 c2c3',
    'e2e4 e7e5 g1f3 b8c6 f1b5 g8f6 e1g1 f6e4 d2d4',
    'e2e4 e7e5 g1f3 b8c6 f1b5 f8c5 c2c3 g8f6 d2d4',
  ].map((l) => l.split(' ')),
  'Scotch Game': [
    'e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4 g8f6 d4c6 b7c6 e4e5',
    'e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4 f8c5 d4b3 c5b6 a2a4',
  ].map((l) => l.split(' ')),
  'Vienna Game': [
    'e2e4 e7e5 b1c3 g8f6 f2f4 d7d5 f4e5 f6e4 g1f3',
    'e2e4 e7e5 b1c3 b8c6 f1c4 g8f6 d2d3',
  ].map((l) => l.split(' ')),
  "Queen's Gambit": [
    'd2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5 f8e7 e2e3 e8g8 g1f3',
    'd2d4 d7d5 c2c4 c7c6 g1f3 g8f6 b1c3 d5c4 a2a4',
    'd2d4 d7d5 c2c4 d5c4 g1f3 g8f6 e2e3 e7e6 f1c4',
    'd2d4 g8f6 c2c4 e7e6 g1f3 d7d5 b1c3',
  ].map((l) => l.split(' ')),
  Catalan: [
    'd2d4 g8f6 c2c4 e7e6 g2g3 d7d5 f1g2 f8e7 g1f3 e8g8 e1g1',
    'd2d4 d7d5 c2c4 e7e6 g2g3 g8f6 f1g2 f8e7 g1f3',
  ].map((l) => l.split(' ')),
  'London System': [
    'd2d4 d7d5 c1f4 g8f6 e2e3 e7e6 g1f3 c7c5 c2c3 b8c6 b1d2',
    'd2d4 g8f6 c1f4 g7g6 e2e3 f8g7 g1f3 e8g8 f1e2',
    'd2d4 g8f6 c1f4 e7e6 e2e3 c7c5 c2c3',
  ].map((l) => l.split(' ')),
  'English Opening': [
    'c2c4 e7e5 b1c3 g8f6 g2g3 d7d5 c4d5 f6d5 f1g2',
    'c2c4 g8f6 b1c3 e7e6 e2e4',
    'c2c4 c7c5 b1c3 b8c6 g2g3 g7g6 f1g2 f8g7',
  ].map((l) => l.split(' ')),

  // ---- чёрными против 1.e4 ----
  'Sicilian Defense': [
    'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6',
    'e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4 g8f6 b1c3 e7e5',
    'e2e4 c7c5 b1c3 b8c6 g2g3 g7g6 f1g2 f8g7',
    'e2e4 c7c5 c2c3 g8f6 e4e5 f6d5 d2d4 c5d4',
  ].map((l) => l.split(' ')),
  'French Defense': [
    'e2e4 e7e6 d2d4 d7d5 b1c3 g8f6 c1g5 f8e7',
    'e2e4 e7e6 d2d4 d7d5 e4e5 c7c5 c2c3 b8c6 g1f3 d8b6',
    'e2e4 e7e6 d2d4 d7d5 b1d2 c7c5 e4d5 e6d5',
    'e2e4 e7e6 d2d4 d7d5 e4d5 e6d5 g1f3 g8f6',
  ].map((l) => l.split(' ')),
  'Caro-Kann Defense': [
    'e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4 c8f5 e4g3 f5g6',
    'e2e4 c7c6 d2d4 d7d5 e4e5 c8f5 g1f3 e7e6',
    'e2e4 c7c6 d2d4 d7d5 b1d2 d5e4 d2e4 c8f5',
    'e2e4 c7c6 d2d4 d7d5 e4d5 c6d5 f1d3 b8c6',
  ].map((l) => l.split(' ')),
  'Scandinavian Defense': [
    'e2e4 d7d5 e4d5 d8d5 b1c3 d5a5 d2d4 g8f6 g1f3 c8f5',
    'e2e4 d7d5 e4d5 g8f6 d2d4 f6d5 g1f3 g7g6',
    'e2e4 d7d5 e4e5 c8f5 d2d4 e7e6',
  ].map((l) => l.split(' ')),
  'Open Game': [
    'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7',
    'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6 d2d3 d7d6',
    'e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4 g8f6 d4c6 b7c6',
    'e2e4 e7e5 b1c3 g8f6 f2f4 d7d5',
    'e2e4 e7e5 f1c4 g8f6 d2d3 c7c6',
  ].map((l) => l.split(' ')),
  'Pirc Defense': [
    'e2e4 d7d6 d2d4 g8f6 b1c3 g7g6 g1f3 f8g7 f1e2 e8g8',
    'e2e4 d7d6 d2d4 g8f6 b1c3 g7g6 f2f4 f8g7 g1f3 e8g8',
    'e2e4 d7d6 d2d4 g8f6 f1d3 e7e5 c2c3 g7g6',
  ].map((l) => l.split(' ')),

  // ---- чёрными против 1.d4 ----
  "King's Indian Defense": [
    'd2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6 g1f3 e8g8 f1e2 e7e5',
    'd2d4 g8f6 g1f3 g7g6 c2c4 f8g7 b1c3 e8g8',
    'd2d4 g8f6 c1f4 g7g6 e2e3 f8g7 g1f3 e8g8',
  ].map((l) => l.split(' ')),
  "Queen's Gambit Declined": [
    'd2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5 f8e7 e2e3 e8g8 g1f3 h7h6',
    'd2d4 d7d5 c2c4 e7e6 g1f3 g8f6 b1c3 f8e7',
    'd2d4 d7d5 g1f3 g8f6 c2c4 e7e6',
    'd2d4 d7d5 c1f4 g8f6 e2e3 e7e6',
  ].map((l) => l.split(' ')),
  'Slav Defense': [
    'd2d4 d7d5 c2c4 c7c6 g1f3 g8f6 b1c3 d5c4 a2a4 c8f5',
    'd2d4 d7d5 c2c4 c7c6 b1c3 g8f6 e2e3 c8f5',
    'd2d4 d7d5 g1f3 g8f6 c2c4 c7c6',
    'd2d4 d7d5 c1f4 c7c6 e2e3 c8f5',
  ].map((l) => l.split(' ')),
  'Nimzo-Indian Defense': [
    'd2d4 g8f6 c2c4 e7e6 b1c3 f8b4 e2e3 e8g8 f1d3 d7d5',
    'd2d4 g8f6 c2c4 e7e6 b1c3 f8b4 d1c2 e8g8 a2a3 b4c3 c2c3',
    'd2d4 g8f6 c2c4 e7e6 g1f3 b7b6 g2g3 c8b7',
  ].map((l) => l.split(' ')),
  'Grünfeld Defense': [
    'd2d4 g8f6 c2c4 g7g6 b1c3 d7d5 c4d5 f6d5 e2e4 d5c3 b2c3 f8g7',
    'd2d4 g8f6 c2c4 g7g6 g1f3 f8g7 g2g3 d7d5',
    'd2d4 g8f6 g1f3 g7g6 g2g3 f8g7 f1g2 e8g8',
  ].map((l) => l.split(' ')),
  'Dutch Defense': [
    'd2d4 f7f5 g2g3 g8f6 f1g2 e7e6 g1f3 f8e7 e1g1 e8g8',
    'd2d4 f7f5 c2c4 g8f6 b1c3 e7e6 g1f3',
    'd2d4 f7f5 g1f3 g8f6 c1g5 e7e6',
  ].map((l) => l.split(' ')),
};

const STANDARD_WHITE = ['RNBQKBNR', 'PPPPPPPP'];
const STANDARD_BLACK = ['rnbqkbnr', 'pppppppp'];

/** Полный набор фигур на своих полях у этой стороны стартовой позиции боя. */
export const fullSetAt = (startFen: string, white: boolean): boolean => {
  const ranks = startFen.split(' ')[0].split('/');
  return white
    ? ranks[7] === STANDARD_WHITE[0] && ranks[6] === STANDARD_WHITE[1]
    : ranks[0] === STANDARD_BLACK[0] && ranks[1] === STANDARD_BLACK[1];
};

/** Какой дебют генерал играет в этой партии: белыми — свой, чёрными — по первому ходу белых. */
export const repertoireFor = (g: Pick<General, 'white' | 'vsE4' | 'vsD4'>, white: boolean, moves: string[]): string | null => {
  if (white) return g.white;
  if (moves[0] === 'e2e4') return g.vsE4;
  if (moves[0] === 'd2d4') return g.vsD4;
  return null;
};

/** Ход из книги генерала или null, если книга не применима или партия ушла с линий. */
export const bookMove = (
  g: Pick<General, 'white' | 'vsE4' | 'vsD4'>, startFen: string, moves: string[], white: boolean,
): string | null => {
  if (!fullSetAt(startFen, white)) return null;
  if (white && moves.length === 0) return OPENING_LINES[g.white]?.[0]?.[0] ?? null;
  const name = repertoireFor(g, white, moves);
  if (!name) return null;
  const lines = (OPENING_LINES[name] ?? []).filter((l) => l.length > moves.length && moves.every((m, i) => l[i] === m));
  return lines.length ? lines[0][moves.length] : null;
};
