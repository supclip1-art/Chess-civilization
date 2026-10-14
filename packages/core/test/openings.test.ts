// Дебютные книги: у каждого дебюта из репертуаров есть линии, ходы чередуются правильно, книга работает только при полном наборе.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFENSES_D4, DEFENSES_E4, OPENINGS_WHITE, OPENING_LINES, battleFen, bookMove, judge, type Army,
} from '../src/index.ts';

const FULL: Army = { p: 8, n: 2, b: 2, r: 2, q: 1 };
const START = battleFen(FULL, FULL);

test('у каждого дебюта из репертуаров есть линии с правильными первыми ходами', () => {
  assert.equal(START, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  for (const name of [...OPENINGS_WHITE, ...DEFENSES_E4, ...DEFENSES_D4]) {
    const lines = OPENING_LINES[name];
    assert.ok(lines?.length, name);
    for (const l of lines) for (const m of l) assert.match(m, /^[a-h][1-8][a-h][1-8][qrbn]?$/, `${name}: ${m}`);
  }
  for (const name of DEFENSES_E4) assert.ok(OPENING_LINES[name].every((l) => l[0] === 'e2e4'), name);
  for (const name of DEFENSES_D4) assert.ok(OPENING_LINES[name].every((l) => l[0] === 'd2d4'), name);
  for (const name of OPENINGS_WHITE) assert.equal(new Set(OPENING_LINES[name].map((l) => l[0])).size, 1, name);
});

test('генерал играет свой дебют, пока соперник идёт по линии, и только при полном наборе', () => {
  const g = { white: 'Ruy Lopez', vsE4: 'French Defense', vsD4: 'Slav Defense' };
  assert.equal(bookMove(g, START, [], true), 'e2e4');
  assert.equal(bookMove(g, START, ['e2e4', 'e7e5', 'g1f3', 'b8c6'], true), 'f1b5');
  assert.equal(bookMove(g, START, ['e2e4', 'h7h5'], true), null, 'соперник свернул с линий');
  assert.equal(bookMove(g, START, ['e2e4'], false), 'e7e6', 'против 1.e4 — французская');
  assert.equal(bookMove(g, START, ['d2d4'], false), 'd7d5', 'против 1.d4 — славянская');
  assert.equal(bookMove(g, START, ['g1f3'], false), null, 'на 1.Nf3 книги нет');
  const short = battleFen({ p: 4, n: 1, b: 0, r: 0, q: 0 }, FULL);
  assert.equal(bookMove(g, short, [], true), null, 'неполная армия белых — без книги');
  assert.equal(bookMove(g, short, ['e2e4'], false), 'e7e6', 'у чёрных полный набор — книга есть');
});

test('сдача: побеждает соперник сдавшегося', () => {
  const none: Army = { p: 0, n: 0, b: 0, r: 0, q: 0 };
  assert.equal(judge({ end: 'resign', mateWinner: 'black', white: FULL, black: none }).winner, 'defender');
  assert.equal(judge({ end: 'resign', mateWinner: 'white', white: none, black: FULL }).winner, 'attacker');
});

// Простейшая проверка ходов книги без движка: фигура своего цвета, ход по правилам фигуры, путь свободен,
// взятие — только чужой фигуры. Шахи не проверяем (в дебютных линиях их почти нет), этим ловим опечатки.
const pseudoLegal = (line: string[]): string | null => {
  const b = new Map<string, string>();
  const ranks = START.split(' ')[0].split('/');
  ranks.forEach((row, i) => { let f = 0; for (const ch of row) { if (/\d/.test(ch)) f += +ch; else { b.set('abcdefgh'[f] + (8 - i), ch); f++; } } });
  for (let i = 0; i < line.length; i++) {
    const m = line[i], from = m.slice(0, 2), to = m.slice(2, 4), white = i % 2 === 0;
    const p = b.get(from);
    if (!p || (p === p.toUpperCase()) !== white) return `${i}:${m} нет своей фигуры`;
    const target = b.get(to);
    if (target && (target === target.toUpperCase()) === white) return `${i}:${m} своя фигура на поле`;
    const dx = to.charCodeAt(0) - from.charCodeAt(0), dy = +to[1] - +from[1];
    const clear = () => {
      const sx = Math.sign(dx), sy = Math.sign(dy);
      for (let x = from.charCodeAt(0) + sx, y = +from[1] + sy; x !== to.charCodeAt(0) || y !== +to[1]; x += sx, y += sy) {
        if (b.has(String.fromCharCode(x) + y)) return false;
      }
      return true;
    };
    const kind = p.toLowerCase();
    let ok = false;
    if (kind === 'p') {
      const dir = white ? 1 : -1;
      if (dx === 0 && !target) ok = dy === dir || (dy === 2 * dir && from[1] === (white ? '2' : '7') && clear());
      else ok = Math.abs(dx) === 1 && dy === dir && !!target;
    } else if (kind === 'n') ok = (Math.abs(dx) === 1 && Math.abs(dy) === 2) || (Math.abs(dx) === 2 && Math.abs(dy) === 1);
    else if (kind === 'b') ok = Math.abs(dx) === Math.abs(dy) && clear();
    else if (kind === 'r') ok = (dx === 0 || dy === 0) && clear();
    else if (kind === 'q') ok = (dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy)) && clear();
    else if (kind === 'k') {
      ok = Math.max(Math.abs(dx), Math.abs(dy)) === 1;
      if (Math.abs(dx) === 2 && dy === 0 && clear()) { // рокировка
        const rookFrom = (dx > 0 ? 'h' : 'a') + from[1], rookTo = (dx > 0 ? 'f' : 'd') + from[1];
        if (b.get(rookFrom)?.toLowerCase() === 'r') { b.set(rookTo, b.get(rookFrom)!); b.delete(rookFrom); ok = true; }
      }
    }
    if (!ok) return `${i}:${m} так ${kind} не ходит`;
    b.delete(from); b.set(to, p);
  }
  return null;
};

test('ходы во всех линиях книги выполнимы', () => {
  for (const [name, lines] of Object.entries(OPENING_LINES)) {
    for (const l of lines) assert.equal(pseudoLegal(l), null, `${name}: ${l.join(' ')}`);
  }
});
