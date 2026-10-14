import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aiEconomyTurn, armyValue, battleFen, emptyArmy, endTurn, newGame, playerGenerals, sandboxMap, type Army } from '../src/index.ts';

const army = (a: Partial<Army>): Army => ({ ...emptyArmy(), ...a });

test('расстановка стартовых армий', () => {
  assert.equal(battleFen(army({ p: 4, n: 1 }), army({ p: 4, n: 1 })), '1n2k3/2pppp2/8/8/8/8/2PPPP2/1N2K3 w - - 0 1');
});

test('полная армия встаёт как в обычных шахматах, рокировка разрешена', () => {
  const full = army({ p: 8, n: 2, b: 2, r: 2, q: 1 });
  assert.equal(battleFen(full, full), 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
});

test('одна ладья — рокировка только в её сторону; лишний конь встаёт на свободное поле', () => {
  const fen = battleFen(army({ p: 8, r: 1, n: 3 }), army({ p: 4 }));
  assert.equal(fen.split(' ')[2], 'Q');
  assert.equal((fen.split(' ')[0].match(/N/g) ?? []).length, 3);
});

test('ИИ на песочнице развивается и собирает армию без голода', () => {
  const s = newGame(sandboxMap(), [{ nation: 'russia' }, { nation: 'germany' }], { elo: 1200, seed: 5 });
  for (let t = 0; t < 40 * s.order.length; t++) { aiEconomyTurn(s, s.order[s.current]); endTurn(s); }
  for (const pid of s.order) {
    assert.ok(!s.log.some((e) => e.player === pid && e.text.startsWith('famine')), `${pid} голодал`);
    assert.ok(armyValue(playerGenerals(s, pid)[0].army) >= 30, `${pid} не собрал армию к 40-му ходу`);
  }
});
