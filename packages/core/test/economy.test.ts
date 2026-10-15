import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BUILD_TURNS, RESOURCE_COST, RESOURCE_OUTPUT, build, endTurn, foundTownHall, hireBuilder, income, maxBuilders,
  newGame, nextDeserter, hireSettler, settleEconomy, startResearch, recruitElo, upgrade, upgradeTownHall, upkeep, playerHalls,
  key, emptyArmy, type GameState,
} from '../src/index.ts';
import { SPAWN_A, cellsAround, testMap , war } from './helpers.ts';

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
  assert.deepEqual(s.players.p1.res, { wood: 50, food: 40, gold: 0 });
});

test('ферма строится только на поле, за ход, одним строителем', () => {
  const s = game();
  const map = testMap();
  const field = cellsAround(SPAWN_A, 'field', map)[0];
  const forest = cellsAround(SPAWN_A, 'forest', map)[0];
  assert.equal(build(s, 'p1', forest, 'farm').ok, false);
  assert.equal(build(s, 'p1', field, 'farm').ok, true);
  assert.deepEqual(s.players.p1.res, { wood: 30, food: 30, gold: 0 });
  assert.equal(build(s, 'p1', cellsAround(SPAWN_A, 'field', map)[1], 'farm').ok, false, 'строитель один');
  round(s);
  assert.deepEqual(s.cells[key(field)].building, { kind: 'farm', level: 1 });
  assert.equal(income(s, 'p1').food, 20);
});

test('стартовая армия ест 18 еды (70 золота × 0,25, вверх) — хватает одной фермы', () => {
  const s = game();
  assert.equal(upkeep(s, 'p1'), 18);
});

test('время улучшений растёт с уровнем; Германия строит ур.4–5 на ход быстрее', () => {
  for (const [nation, expect4] of [['france', BUILD_TURNS[3]], ['germany', BUILD_TURNS[3] - 1]] as const) {
    const s = newGame(testMap(), [{ nation }, { nation: 'spain' }], { elo: 1200, seed: 1 });
    const field = cellsAround(SPAWN_A, 'field', testMap())[0];
    s.cells[key(field)].building = { kind: 'farm', level: 3 };
    s.players.p1.res = { wood: 1000, food: 1000, gold: 0 };
    assert.equal(upgrade(s, 'p1', field).ok, true);
    const job = s.players.p1.jobs[0];
    assert.equal(job.finish - s.turn, expect4, nation);
  }
});

test('ратуша 2 открывает второго строителя; без неё нельзя', () => {
  const s = game();
  s.players.p1.res = { wood: 500, food: 500, gold: 0 };
  assert.equal(hireBuilder(s, 'p1').ok, false);
  const hall = playerHalls(s, 'p1')[0];
  assert.equal(upgradeTownHall(s, 'p1', hall.id).ok, true);
  round(s);
  assert.equal(maxBuilders(s, 'p1'), 2);
  assert.equal(Object.values(s.cells).filter((c) => c.owner === 'p1').length > 7, true, 'радиус вырос');
  const before = s.players.p1.res.food;
  assert.equal(hireBuilder(s, 'p1').ok, true);
  assert.equal(before - s.players.p1.res.food, 40);
  assert.equal(hireBuilder(s, 'p1').ok, false, 'третьему нужна ратуша 3');
});

test('Франция нанимает строителей бесплатно', () => {
  const s = game(['france', 'germany']);
  s.players.p1.res = { wood: 500, food: 500, gold: 0 };
  upgradeTownHall(s, 'p1', playerHalls(s, 'p1')[0].id);
  round(s);
  const food = s.players.p1.res.food;
  assert.equal(hireBuilder(s, 'p1').ok, true);
  assert.equal(s.players.p1.res.food, food);
});

test('основание города на ничейной земле, Россия — дешевле и за 1 ход', () => {
  for (const [nation, turns, wood] of [['germany', 2, 100], ['russia', 1, 70]] as const) {
    const s = newGame(testMap(), [{ nation }, { nation: 'spain' }], { elo: 1200, seed: 1 });
    const general = Object.values(s.generals).find((x) => x.owner === 'p1')!;
    s.players.p1.res = { wood: 200, food: 200, gold: 0 };
    general.hex = { q: -1, r: -3 };
    assert.equal(foundTownHall(s, 'p1', general.id).ok, false, 'генерал город не основывает');
    assert.ok(hireSettler(s, 'p1', playerHalls(s, 'p1')[0].id).ok);
    assert.equal(200 - s.players.p1.res.wood, wood, nation);
    const g = Object.values(s.generals).find((x) => x.owner === 'p1' && x.settler)!;
    general.hex = { q: 0, r: -1 };
    g.hex = { q: -1, r: -3 };
    assert.equal(foundTownHall(s, 'p1', g.id).ok, true);
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

test('поселенец гибнет, если на него напасть; стройка города отменяется', async () => {
  const { attack, emptyArmy: _e } = await import('../src/index.ts');
  const s = newGame(testMap(), [{ nation: 'germany' }, { nation: 'spain' }], { elo: 1200, seed: 1 });
  war(s);
  s.players.p1.res = { wood: 500, food: 500, gold: 0 };
  assert.ok(hireSettler(s, 'p1', playerHalls(s, 'p1')[0].id).ok);
  const st = Object.values(s.generals).find((x) => x.owner === 'p1' && x.settler)!;
  st.hex = { q: -1, r: -3 };
  assert.ok(foundTownHall(s, 'p1', st.id).ok);
  const foe = Object.values(s.generals).find((x) => x.owner === 'p2')!;
  foe.hex = { q: -1, r: -2 };
  const r = attack(s, foe.id, st.hex);
  assert.equal(r.kind, 'killed');
  assert.equal(s.generals[st.id], undefined);
  assert.equal(s.players.p1.jobs.filter((j) => j.kind === 'found').length, 0);
});

test('строители у каждого города свои', async () => {
  const { hireSettler: hs, freeBuilders } = await import('../src/index.ts');
  const s = newGame(testMap(), [{ nation: 'germany' }, { nation: 'spain' }], { elo: 1200, seed: 1 });
  s.players.p1.res = { wood: 1000, food: 1000, gold: 0 };
  const cap = playerHalls(s, 'p1')[0];
  assert.ok(hs(s, 'p1', cap.id).ok);
  const st = Object.values(s.generals).find((x) => x.owner === 'p1' && x.settler)!;
  st.hex = { q: -1, r: -3 };
  foundTownHall(s, 'p1', st.id);
  round(s); round(s);
  const second = playerHalls(s, 'p1').find((h) => h.id !== cap.id)!;
  assert.ok(upgradeTownHall(s, 'p1', cap.id).ok, 'строитель столицы занят');
  assert.equal(freeBuilders(s, 'p1', cap.id), 0);
  assert.equal(freeBuilders(s, 'p1', second.id), 1, 'у нового города свой строитель');
  assert.ok(upgradeTownHall(s, 'p1', second.id).ok);
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
  const cap = playerHalls(s, 'p1')[0];
  cap.builders = 3;
  s.players.p1.res = { wood: 0, food: 0, gold: 0 };
  settleEconomy(s, 'p1');
  assert.deepEqual(g.army, emptyArmy());
  assert.equal(cap.builders, 1);
});

test('исследование «Тактики» поднимает ELO только будущих генералов', () => {
  const s = game();
  s.players.p1.res = { wood: 100, food: 100, gold: 100 };
  assert.equal(startResearch(s, 'p1').ok, true);
  round(s);
  assert.equal(recruitElo(s, 'p1'), 1225);
  const g = Object.values(s.generals).find((x) => x.owner === 'p1')!;
  assert.equal(g.elo, 1200);
});

test('«Военная академия»: старый генерал догоняет новые ступени «Тактики» за золото', async () => {
  const { trainGeneral, trainingFor, TRAIN_GOLD_PER_STEP } = await import('../src/index.ts');
  const s = game();
  const g = Object.values(s.generals).find((x) => x.owner === 'p1')!;
  s.players.p1.research.done = 2;
  s.players.p1.res.gold = 500;
  assert.equal(trainGeneral(s, 'p1', g.id).ok, false, 'без академии нельзя');
  s.players.p1.research.techs = { academy: true };
  assert.deepEqual(trainingFor(s, g.id), { steps: 2, gold: 2 * TRAIN_GOLD_PER_STEP });
  assert.ok(trainGeneral(s, 'p1', g.id).ok);
  assert.equal(g.elo, 1250);
  assert.equal(s.players.p1.res.gold, 500 - 2 * TRAIN_GOLD_PER_STEP);
  assert.equal(trainGeneral(s, 'p1', g.id).ok, false, 'второй раз — нечему учить');
});

test('рыбный промысел: только на своей морской клетке, даёт еду', () => {
  const s = game();
  s.players.p1.res = { wood: 500, food: 500, gold: 0 };
  const hallCells = new Set(Object.values(s.halls).map((h) => key(h.hex)));
  const own = Object.values(s.cells).filter((c) => c.owner === 'p1' && !hallCells.has(key(c.hex)) && !c.building);
  const field = own.find((c) => c.terrain === 'field')!;
  const sea = own.find((c) => c !== field)!;
  sea.terrain = 'water'; // море у столицы
  assert.equal(build(s, 'p1', field.hex, 'fishery').ok, false, 'на поле рыбу не ловят');
  const before = income(s, 'p1').food;
  assert.equal(build(s, 'p1', sea.hex, 'fishery').ok, true);
  round(s);
  assert.equal(income(s, 'p1').food - before, RESOURCE_OUTPUT.fishery[0]);
});

test('бонусы новых наций работают', async () => {
  const { NATIONS, NATION_ORDER, buildingOutput, resourceCost, piecePrice, hallRadius, maxLevelAt } = await import('../src/index.ts');
  assert.equal(NATION_ORDER.length, 26);
  for (const id of NATION_ORDER) {
    const n = NATIONS[id];
    assert.ok(n.cities.length >= 12 && n.effect && n.rulers.warlike && n.rulers.peaceful, id);
  }
  const g = (nation: any) => newGame(testMap(), [{ nation }, { nation: 'france' }], { elo: 1200, seed: 7 });
  // Бангладеш: стартовый бонус
  assert.deepEqual(g('bangladesh').players.p1.res, { wood: 80, food: 70, gold: 0 });
  // Польша: рудник на 25% дешевле
  assert.deepEqual(resourceCost(g('poland'), 'p1', 'mine', 1), { wood: 23, food: 23, gold: 0 });
  // Вьетнам: пешка 7
  assert.equal(piecePrice(g('vietnam'), 'p1', 'p'), 7);
  // Казахстан: город 1-го уровня — радиус 2
  const kz = g('kazakhstan');
  assert.equal(hallRadius(playerHalls(kz, 'p1')[0], kz), 2);
  assert.equal(Object.values(kz.cells).filter((c) => c.owner === 'p1').length, 19);
  // Украина: ферма 1-го уровня +10 еды
  const ua = g('ukraine');
  const field = Object.values(ua.cells).find((c) => c.owner === 'p1' && c.terrain === 'field')!;
  field.building = { kind: 'farm', level: 1 };
  assert.equal(buildingOutput(ua, 'p1', field).food, 30);
  // Персия: ферма на пустыне до 3-го уровня
  const pe = g('persia');
  const cell = Object.values(pe.cells).find((c) => c.owner === 'p1' && c.terrain === 'field')!;
  cell.terrain = 'desert';
  assert.equal(maxLevelAt(pe, 'p1', cell, 'farm'), 3);
  assert.equal(maxLevelAt(g('france'), 'p1', cell, 'farm'), 0);
});

test('очередь строек: оплата сразу, старт, когда освободится строитель; отмена возвращает ресурсы', async () => {
  const { enqueue, cancelQueued, completeJobs, upgradeBarracks, europeMap } = await import('../src/index.ts');
  const s = newGame(europeMap(), [{ nation: 'russia' }, { nation: 'poland' }], { elo: 1200, seed: 4 });
  const p = s.players.p1;
  p.res = { wood: 1000, food: 1000, gold: 1000 };
  assert.ok(upgradeBarracks(s, 'p1').ok); // единственный строитель занят
  const farmCell = Object.values(s.cells).find((c) => c.owner === 'p1' && c.terrain === 'field' && !Object.values(s.halls).some((h) => h.hex.q === c.hex.q && h.hex.r === c.hex.r))!;
  assert.equal(build(s, 'p1', farmCell.hex, 'farm').ok, false); // нет строителя
  const wood = p.res.wood;
  assert.ok(enqueue(s, 'p1', { kind: 'build', hex: farmCell.hex, building: 'farm' }).ok);
  assert.ok(p.res.wood < wood, 'оплачено сразу');
  assert.equal(p.queue!.length, 1);
  assert.equal(enqueue(s, 'p1', { kind: 'build', hex: farmCell.hex, building: 'farm' }).ok, false); // клетка уже занята
  const capId = playerHalls(s, 'p1')[0].id;
  assert.ok(enqueue(s, 'p1', { kind: 'tavern', hallId: capId }).ok);
  assert.equal(enqueue(s, 'p1', { kind: 'tavern', hallId: capId }).ok, false); // повтор
  // казарма строится 1 ход — потом стартует первая стройка из очереди
  s.turn = p.jobs[0].finish;
  completeJobs(s, 'p1');
  assert.equal(playerHalls(s, 'p1')[0].barracks, 1);
  assert.equal(p.queue!.length, 1);
  assert.equal(p.jobs[0].kind, 'resource');
  const w2 = p.res.wood;
  assert.ok(cancelQueued(s, 'p1', 0).ok);
  assert.ok(p.res.wood > w2);
  assert.equal(p.queue!.length, 0);
});

test('места под здания зависят от уровня города; армия не больше шахматного набора', async () => {
  const { citySlots, BUILDING_SLOTS, hirePiece } = await import('../src/index.ts');
  const s = newGame(testMap(), [{ nation: 'germany' }, { nation: 'france' }], { elo: 1200, seed: 3 });
  const p = s.players.p1;
  p.res = { wood: 5000, food: 5000, gold: 5000 };
  const hall = playerHalls(s, 'p1')[0];
  hall.builders = 9;
  const free = Object.values(s.cells).filter((c) => c.owner === 'p1' && c.hall === hall.id && (c.terrain === 'field' || c.terrain === 'forest' || c.terrain === 'deposit') && !(c.hex.q === hall.hex.q && c.hex.r === hall.hex.r));
  hall.level = 3; // все клетки радиуса 3, но мест на 1-м уровне меньше
  hall.level = 1;
  let built = 0;
  for (const c of free) if (build(s, 'p1', c.hex, c.terrain === 'field' ? 'farm' : c.terrain === 'forest' ? 'sawmill' : 'mine').ok) built++;
  assert.equal(built, Math.min(free.length, BUILDING_SLOTS[0]));
  assert.equal(citySlots(s, hall.id).used, built);
  const g = Object.values(s.generals).find((x) => x.owner === 'p1')!;
  hall.barracks = 5;
  g.army = { p: 8, n: 2, b: 0, r: 0, q: 0 };
  assert.equal(hirePiece(s, 'p1', g.id, 'p').ok, false);
  assert.equal(hirePiece(s, 'p1', g.id, 'n').ok, false);
  assert.ok(hirePiece(s, 'p1', g.id, 'q').ok);
  assert.equal(hirePiece(s, 'p1', g.id, 'q').ok, false);
});

test('дерево технологий: требования, эффекты на цены, места, обзор и дороги', async () => {
  const { startTech, piecePrice, citySlots, visible, reachable, hasTech, recomputeTerritory } = await import('../src/index.ts');
  const s = newGame(testMap(), [{ nation: 'germany' }, { nation: 'spain' }], { elo: 1200, seed: 1 });
  const p = s.players.p1;
  p.res = { wood: 2000, food: 2000, gold: 2000 };
  assert.equal(startTech(s, 'p1', 'militia').ok, false, 'нужна Тактика I');
  p.research.done = 2;
  assert.ok(startTech(s, 'p1', 'militia').ok);
  assert.equal(startTech(s, 'p1', 'guilds').ok, false, 'одна технология за раз');
  p.research.techs = { militia: true, cavalry: true, guilds: true, cartography: true, roads: true };
  p.research.tech = undefined;
  assert.ok(hasTech(s, 'p1', 'militia'));
  assert.equal(piecePrice(s, 'p1', 'p'), 8);
  assert.equal(piecePrice(s, 'p1', 'n'), 23);
  const hall = playerHalls(s, 'p1')[0];
  assert.equal(citySlots(s, hall.id).max, 6);
  const g = Object.values(s.generals).find((x) => x.owner === 'p1')!;
  hall.level = 3; recomputeTerritory(s); // широкая своя земля
  g.hex = { ...hall.hex };
  g.moveLeft = 2;
  const far = [...reachable(s, g.id).values()].some((d) => d === 3);
  assert.ok(far, 'по своей земле на клетку дальше');
  const far2 = Object.values(s.cells).filter((c) => !c.owner).sort((a, b) => Math.abs(b.hex.q - hall.hex.q) + Math.abs(b.hex.r - hall.hex.r) - Math.abs(a.hex.q - hall.hex.q) - Math.abs(a.hex.r - hall.hex.r))[0];
  g.hex = { ...far2.hex };
  const seen = visible(s, 'p1');
  p.research.techs.cartography = undefined;
  assert.ok(seen.size > visible(s, 'p1').size, 'картография расширяет обзор');
});
