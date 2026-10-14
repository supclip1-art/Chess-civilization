import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BUILD_TURNS, RESOURCE_COST, RESOURCE_OUTPUT, build, endTurn, foundTownHall, hireBuilder, income, maxBuilders,
  newGame, nextDeserter, settleEconomy, startResearch, recruitElo, upgrade, upgradeTownHall, upkeep, playerHalls,
  key, emptyArmy, type GameState,
} from '../src/index.ts';
import { SPAWN_A, cellsAround, testMap } from './helpers.ts';

const game = (nations: [any, any] = ['germany', 'france']): GameState =>
  newGame(testMap(), [{ nation: nations[0] }, { nation: nations[1] }], { elo: 1200, seed: 7 });

/** Пропустить ход: p1 и p2 оба заканчивают ход. */
const round = (s: GameState) => { endTurn(s); endTurn(s); };

test('окупаемость каждого следующего уровня не лучше предыдущего', () => {
  for (const kind of ['farm', 'sawmill'] as const) {
    const pay = RESOURCE_COST[kind].map((c, i) => (c.wood + c.food) / (RESOURCE_OUTPUT[kind][i] - (RESOURCE_OUTPUT[kind][i - 1] ?? 0)));
    for (let i = 1; i < pay.length; i++) assert.ok(pay[i] >= pay[i - 1] - 1e-9, `${kind} ур.${i + 1}`);
  }
});

test('старт: ратуша ур.1 красит радиус 1, нейтралы на свободной точке', () => {
  const s = game();
  const own = Object.values(s.cells).filter((c) => c.owner === 'p1');
  assert.equal(own.length, 7);
  assert.equal(Object.keys(s.neutrals).length, 1);
  assert.deepEqual(s.players.p1.res, { wood: 5, food: 4, gold: 0 });
});

test('ферма строится только на поле, за ход, одним строителем', () => {
  const s = game();
  const map = testMap();
  const field = cellsAround(SPAWN_A, 'field', map)[0];
  const forest = cellsAround(SPAWN_A, 'forest', map)[0];
  assert.equal(build(s, 'p1', forest, 'farm').ok, false);
  assert.equal(build(s, 'p1', field, 'farm').ok, true);
  assert.deepEqual(s.players.p1.res, { wood: 3, food: 3, gold: 0 });
  assert.equal(build(s, 'p1', cellsAround(SPAWN_A, 'field', map)[1], 'farm').ok, false, 'строитель один');
  round(s);
  assert.deepEqual(s.cells[key(field)].building, { kind: 'farm', level: 1 });
  assert.equal(income(s, 'p1').food, 2);
});

test('стартовая армия ест 1,75 еды — хватает одной фермы', () => {
  const s = game();
  assert.equal(upkeep(s, 'p1'), 1.75);
});

test('время улучшений растёт с уровнем; Германия строит ур.4–5 на ход быстрее', () => {
  for (const [nation, expect4] of [['france', BUILD_TURNS[3]], ['germany', BUILD_TURNS[3] - 1]] as const) {
    const s = newGame(testMap(), [{ nation }, { nation: 'spain' }], { elo: 1200, seed: 1 });
    const field = cellsAround(SPAWN_A, 'field', testMap())[0];
    s.cells[key(field)].building = { kind: 'farm', level: 3 };
    s.players.p1.res = { wood: 100, food: 100, gold: 0 };
    assert.equal(upgrade(s, 'p1', field).ok, true);
    const job = s.players.p1.jobs[0];
    assert.equal(job.finish - s.turn, expect4, nation);
  }
});

test('ратуша 2 открывает второго строителя; без неё нельзя', () => {
  const s = game();
  s.players.p1.res = { wood: 50, food: 50, gold: 0 };
  assert.equal(hireBuilder(s, 'p1').ok, false);
  const hall = playerHalls(s, 'p1')[0];
  assert.equal(upgradeTownHall(s, 'p1', hall.id).ok, true);
  round(s);
  assert.equal(maxBuilders(s, 'p1'), 2);
  assert.equal(Object.values(s.cells).filter((c) => c.owner === 'p1').length > 7, true, 'радиус вырос');
  const before = s.players.p1.res.food;
  assert.equal(hireBuilder(s, 'p1').ok, true);
  assert.equal(before - s.players.p1.res.food, 4);
  assert.equal(hireBuilder(s, 'p1').ok, false, 'третьему нужна ратуша 3');
});

test('Франция нанимает строителей бесплатно', () => {
  const s = game(['france', 'germany']);
  s.players.p1.res = { wood: 50, food: 50, gold: 0 };
  upgradeTownHall(s, 'p1', playerHalls(s, 'p1')[0].id);
  round(s);
  const food = s.players.p1.res.food;
  assert.equal(hireBuilder(s, 'p1').ok, true);
  assert.equal(s.players.p1.res.food, food);
});

test('основание города на ничейной земле, Россия — дешевле и за 1 ход', () => {
  for (const [nation, turns, wood] of [['germany', 2, 10], ['russia', 1, 7]] as const) {
    const s = newGame(testMap(), [{ nation }, { nation: 'spain' }], { elo: 1200, seed: 1 });
    const g = Object.values(s.generals).find((x) => x.owner === 'p1')!;
    g.hex = { q: -1, r: -3 };
    s.players.p1.res = { wood: 20, food: 20, gold: 0 };
    assert.equal(foundTownHall(s, 'p1', g.id).ok, true);
    assert.equal(20 - s.players.p1.res.wood, wood, nation);
    for (let i = 0; i < turns; i++) round(s);
    assert.equal(playerHalls(s, 'p1').length, 2, nation);
    const names = playerHalls(s, 'p1').sort((a, b) => a.order - b.order).map((h) => h.name);
    assert.deepEqual(names, nation === 'russia' ? ['Moscow', 'Saint Petersburg'] : ['Berlin', 'Hamburg']);
  }
  // у всех городов на карте разные названия
  const s = newGame(testMap(), [{ nation: 'turkey' }, { nation: 'spain' }], { elo: 1200, seed: 3 });
  const all = Object.values(s.halls).map((h) => h.name);
  assert.equal(new Set(all).size, all.length);
  assert.ok(all.includes('Istanbul') && all.includes('Madrid'));
});

test('порядок дезертирства при голоде сохраняет правило строя', () => {
  const a = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  const order: string[] = [];
  for (let x = nextDeserter(a); x; x = nextDeserter(a)) { order.push(x); a[x]--; }
  assert.equal(order.join(''), 'qrrppbbppnnpppp');
});

test('голод: сначала фигуры, потом строители, последний строитель остаётся', () => {
  const s = game();
  const g = Object.values(s.generals).find((x) => x.owner === 'p1')!;
  s.players.p1.builders = 3;
  s.players.p1.res = { wood: 0, food: 0, gold: 0 };
  settleEconomy(s, 'p1');
  assert.deepEqual(g.army, emptyArmy());
  assert.equal(s.players.p1.builders, 1);
});

test('исследование «Тактики» поднимает ELO только будущих генералов', () => {
  const s = game();
  s.players.p1.res = { wood: 10, food: 0, gold: 10 };
  assert.equal(startResearch(s, 'p1').ok, true);
  round(s);
  assert.equal(recruitElo(s, 'p1'), 1225);
  assert.equal(Object.values(s.generals).find((g) => g.owner === 'p1')!.elo, 1200);
});
