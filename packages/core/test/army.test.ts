import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  armiesFromFen, canForceMate, insufficientMaterial, attack, emptyArmy, endTurn, formationOk, hireGeneral, hirePiece, judge, move, newGame, playerHalls,
  reachable, resolveBattle, returning, visible, winner, key, upgradeBarracks, type GameState, type Army,
} from '../src/index.ts';
import { NEUTRAL, SPAWN_A, SPAWN_B, testMap } from './helpers.ts';

const game = (): GameState => newGame(testMap(), [{ nation: 'germany' }, { nation: 'turkey' }], { elo: 1200, seed: 3 });
const gen = (s: GameState, owner: string) => Object.values(s.generals).find((g) => g.owner === owner)!;
const army = (a: Partial<Army>): Army => ({ ...emptyArmy(), ...a });
const round = (s: GameState) => { endTurn(s); endTurn(s); };

test('правило строя: кони от 4 пешек, слоны от 6, ладьи и ферзь от 8', () => {
  assert.ok(formationOk(army({ p: 4, n: 2 })));
  assert.ok(!formationOk(army({ p: 3, n: 1 })));
  assert.ok(!formationOk(army({ p: 5, b: 1 })));
  assert.ok(formationOk(army({ p: 6, n: 2, b: 2 })));
  assert.ok(!formationOk(army({ p: 7, r: 1 })));
  assert.ok(formationOk(army({ p: 8, q: 1 })));
});

test('найм фигур: нужна казарма нужного уровня, золото и пешки', () => {
  const s = game();
  const g = gen(s, 'p1');
  s.players.p1.res = { wood: 50, food: 50, gold: 50 };
  assert.equal(hirePiece(s, 'p1', g.id, 'p').ok, false, 'без казармы');
  upgradeBarracks(s, 'p1');
  round(s);
  assert.equal(hirePiece(s, 'p1', g.id, 'p').ok, true);
  assert.equal(hirePiece(s, 'p1', g.id, 'n').ok, false, 'кони с казармы 2');
  s.players.p1.barracks = 3;
  assert.equal(hirePiece(s, 'p1', g.id, 'b').ok, false, 'слону нужно 6 пешек');
  assert.equal(hirePiece(s, 'p1', g.id, 'p').ok, true);
  assert.equal(hirePiece(s, 'p1', g.id, 'b').ok, true);
});

test('генералы: таверна задаёт число, Турция нанимает дешевле', () => {
  const s = game();
  s.players.p2.res = { wood: 0, food: 0, gold: 100 };
  assert.equal(hireGeneral(s, 'p2').ok, false, 'без таверны только стартовый');
  s.players.p2.tavern = 1;
  assert.equal(hireGeneral(s, 'p2').ok, true);
  assert.equal(s.players.p2.res.gold, 100 - (10 - 5));
});

test('исход боя: мат, материал на лимите, ничья отбивает атаку', () => {
  assert.equal(judge({ end: 'mate', mateWinner: 'white', white: army({}), black: army({ p: 3 }) }).winner, 'attacker');
  assert.equal(judge({ end: 'limit', white: army({ p: 2 }), black: army({ p: 1 }) }).winner, 'attacker');
  assert.equal(judge({ end: 'limit', white: army({ n: 1 }), black: army({ p: 3 }) }).winner, null);
  assert.equal(judge({ end: 'repetition', white: army({ p: 5 }), black: army({ p: 1 }) }).winner, null);
  assert.equal(judge({ end: 'repetition', white: army({ p: 5 }), black: army({ p: 1 }) }, 'material').winner, 'attacker');
});

test('нет матующего материала — ничья сразу, даже если материала больше', () => {
  assert.ok(!canForceMate(army({ n: 1 })));
  assert.ok(!canForceMate(army({ b: 1 })));
  assert.ok(!canForceMate(army({ n: 2 })));
  assert.ok(canForceMate(army({ b: 1, n: 1 })));
  assert.ok(canForceMate(army({ b: 2 })));
  assert.ok(canForceMate(army({ p: 1 })));
  assert.ok(insufficientMaterial(army({ n: 1 }), army({})));
  assert.ok(insufficientMaterial(army({ n: 1 }), army({ b: 1 })));
  assert.ok(!insufficientMaterial(army({ n: 1 }), army({ p: 1 })));
  // раньше на лимите король с конём против голого короля засчитывался как победа по материалу
  assert.equal(judge({ end: 'limit', white: army({ n: 1 }), black: army({}) }).winner, null);
  assert.equal(judge({ end: 'limit', white: army({ b: 1 }), black: army({ n: 1 }) }).winner, null);
});

test('на лимите материал решает, только если сторона с перевесом может поставить мат', () => {
  // конь против пешки: 3:1, но конь мат не поставит — ничья
  assert.equal(judge({ end: 'limit', white: army({ n: 1 }), black: army({ p: 1 }) }).winner, null);
  // ладья против пешки: 5:1, ладья может — победа
  assert.equal(judge({ end: 'limit', white: army({ r: 1 }), black: army({ p: 1 }) }).winner, 'attacker');
  // слон и конь против двух пешек: 6:2 — победа
  assert.equal(judge({ end: 'limit', white: army({ p: 2 }), black: army({ b: 1, n: 1 }) }).winner, 'defender');
});

test('фигуры на доске по FEN', () => {
  assert.deepEqual(armiesFromFen('8/8/8/3k2K1/6N1/4n3/8/8 w - - 48 76'), { white: army({ n: 1 }), black: army({ n: 1 }) });
  assert.deepEqual(armiesFromFen('1n2k3/2pppp2/8/8/8/8/2PPPP2/1N2K3 w - - 0 1'), { white: army({ p: 4, n: 1 }), black: army({ p: 4, n: 1 }) });
});

test('возврат фигур: свои уцелевшие возвращаются всегда, превращённые — по казарме', () => {
  const s = game();
  s.players.p1.barracks = 0;
  // без казармы стартовая армия возвращается целиком
  assert.deepEqual(returning(s, 'p1', army({ p: 4, n: 1 }), army({ p: 4, n: 1 })), army({ p: 4, n: 1 }));
  // пешка превратилась в ферзя: ферзь не остаётся
  assert.deepEqual(returning(s, 'p1', army({ p: 3, n: 1, q: 1 }), army({ p: 4, n: 1 })), army({ p: 3, n: 1 }));
  // пешка стала вторым конём: при казарме 2 — остаётся, при 1 — нет
  s.players.p1.barracks = 1;
  assert.deepEqual(returning(s, 'p1', army({ p: 3, n: 2 }), army({ p: 4, n: 1 })), army({ p: 3, n: 1 }));
  s.players.p1.barracks = 2;
  assert.deepEqual(returning(s, 'p1', army({ p: 3, n: 2 }), army({ p: 4, n: 1 })), army({ p: 3, n: 2 }));
});

test('движение: 2 клетки за ход, горы и вода непроходимы', () => {
  const s = game();
  const g = gen(s, 'p1');
  const r = reachable(s, g.id);
  assert.ok([...r.values()].every((d) => d <= 2));
  assert.equal(move(s, g.id, { q: -1, r: 0 }).ok, false, 'слишком далеко');
  assert.equal(move(s, g.id, { q: -2, r: 0 }).ok, true);
  g.hex = { q: -1, r: 0 }; g.moveLeft = 2;
  assert.equal(move(s, g.id, { q: 0, r: 0 }).ok, false, 'гора');
});

test('туман войны: видно 2 клетки от территории и от генералов', () => {
  const s = game();
  const v = visible(s, 'p1');
  assert.ok(v.has(key({ q: -1, r: 0 })), '3 клетки от столицы — край территории + 2');
  assert.ok(!v.has(key(SPAWN_B)));
});

test('захват нейтрала: бой с гарнизоном, ратуша переходит, здания разграблены', () => {
  const s = game();
  const g = gen(s, 'p1');
  const garrison = Object.values(s.generals).find((x) => s.neutrals[x.owner])!;
  const hall = Object.values(s.halls).find((h) => s.neutrals[h.owner])!;
  const farmCell = Object.values(s.cells).find((c) => c.hall === hall.id && c.terrain === 'field' && key(c.hex) !== key(NEUTRAL))!;
  farmCell.building = { kind: 'farm', level: 1 };
  g.hex = { q: NEUTRAL.q - 1, r: NEUTRAL.r };
  g.army = army({ p: 6, n: 2 });
  const a = attack(s, g.id, NEUTRAL);
  assert.equal(a.kind, 'battle');
  if (a.kind !== 'battle') return;
  assert.equal(a.defender, garrison.id);
  const out = resolveBattle(s, g.id, garrison.id, { end: 'mate', mateWinner: 'white', white: army({ p: 5, n: 1 }), black: army({}) });
  assert.equal(out.winner, 'attacker');
  assert.equal(hall.owner, 'p1');
  assert.equal(farmCell.building, undefined, 'ферма 1-го уровня разрушена');
  assert.equal(g.stars, 1);
  assert.equal(g.elo, 1215);
  assert.equal(Object.keys(s.neutrals).length, 0);
});

test('осада: ратуша сдаётся после полного хода без подкрепления, страна выбывает', () => {
  const s = game();
  const g = gen(s, 'p1');
  const defender = gen(s, 'p2');
  defender.hex = { q: 6, r: 0 };
  defender.army = emptyArmy();
  g.hex = { q: SPAWN_B.q - 1, r: 0 };
  g.army = army({ p: 4 });
  assert.equal(attack(s, g.id, SPAWN_B).kind, 'siege');
  endTurn(s); // ход p2: подкрепления нет
  endTurn(s); // ход p1: осада завершается
  const hallB = playerHalls(s, 'p1').find((h) => key(h.hex) === key(SPAWN_B));
  assert.ok(hallB, 'ратуша p2 захвачена');
  assert.equal(s.players.p2.alive, false);
  assert.equal(winner(s), 'p1');
});

test('разбитый генерал погибает, а последний генерал игрока отступает в столицу', () => {
  const s = game();
  const a = gen(s, 'p1');
  const d = gen(s, 'p2');
  d.hex = { q: 0, r: 2 };
  a.hex = { q: -1, r: 2 };
  s.players.p2.tavern = 1;
  s.players.p2.res.gold = 50;
  hireGeneral(s, 'p2');
  const lose = { end: 'mate' as const, mateWinner: 'white' as const, white: army({ p: 4 }), black: army({}) };
  resolveBattle(s, a.id, d.id, lose);
  assert.equal(s.generals[d.id], undefined, 'у p2 было два генерала — разбитый погиб');
  const last = gen(s, 'p2');
  last.hex = { q: 0, r: 2 }; last.army = army({ p: 4 });
  a.attacked = false;
  resolveBattle(s, a.id, last.id, lose);
  assert.ok(s.generals[last.id], 'последний генерал жив');
  assert.deepEqual(last.hex, SPAWN_B);
  assert.deepEqual(last.army, emptyArmy());
});

test('осада снимается, если защитник привёл армию к ратуше', () => {
  const s = game();
  const g = gen(s, 'p1');
  const d = gen(s, 'p2');
  g.hex = { q: SPAWN_B.q - 1, r: 0 };
  d.hex = { q: 6, r: 0 };
  attack(s, g.id, SPAWN_B);
  endTurn(s);
  assert.equal(move(s, d.id, SPAWN_B).ok, true);
  endTurn(s);
  assert.equal(playerHalls(s, 'p2').length, 1);
});
