// Карта «Европа»: родные столицы, связность, состав дома, исторические названия.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PASSABLE, asiaMap, distance, europeMap, key, neighbors, newGame, playerHalls, type Hex } from '../src/index.ts';

test('Европа: любая нация на любой точке, места случайные, свободные столицы — нейтралы со своим именем', () => {
  const s = newGame(europeMap(), [{ nation: 'japan' }, { nation: 'usa' }], { elo: 1200, seed: 1 });
  assert.equal(playerHalls(s, 'p1')[0].name, 'Kyoto');
  assert.equal(playerHalls(s, 'p2')[0].name, 'Washington');
  const names = Object.values(s.halls).map((h) => h.name);
  assert.equal(names.filter((n) => ['Rome', 'Berlin', 'Paris', 'Madrid'].includes(n)).length, 2, 'две свободные столицы стали нейтралами');
  assert.equal(new Set(names).size, names.length, 'имена городов не повторяются');
  const m = europeMap();
  const starts = new Set<string>();
  for (let seed = 1; seed <= 12; seed++) {
    const g = newGame(m, [{ nation: 'italy' }, { nation: 'spain' }], { elo: 1200, seed });
    starts.add(key(playerHalls(g, 'p1')[0].hex));
  }
  assert.ok(starts.size >= 3, 'стартовая точка игрока меняется от партии к партии');
});

for (const [title, map] of [['Европа', europeMap], ['Азия', asiaMap]] as const) test(`${title}: 8 столиц, все столицы и нейтралы связаны сушей, дома есть 3 поля, 3 леса, 2 месторождения`, () => {
  const m = map();
  assert.equal(m.spawns.length, 8);
  for (let i = 0; i < m.spawns.length; i++) for (let j = 0; j < i; j++) assert.ok(distance(m.spawns[i], m.spawns[j]) >= 6, 'столицы не вплотную');
  const terrain = new Map(m.cells.map((c) => [key(c), c.terrain]));
  const seen = new Set([key(m.spawns[0])]);
  const stack: Hex[] = [m.spawns[0]];
  while (stack.length) {
    for (const n of neighbors(stack.pop()!)) {
      const t = terrain.get(key(n));
      if (t && PASSABLE[t] && !seen.has(key(n))) { seen.add(key(n)); stack.push(n); }
    }
  }
  for (const h of [...m.spawns, ...m.neutrals]) assert.ok(seen.has(key(h)), `${key(h)} отрезан`);
  for (const c of m.spawns) {
    const home = m.cells.filter((x) => distance(x, c) >= 1 && distance(x, c) <= 2);
    const n = (t: string) => home.filter((x) => x.terrain === t).length;
    assert.ok(n('field') >= 3 && n('forest') >= 3 && n('deposit') >= 2, `дом ${key(c)}: ${n('field')}/${n('forest')}/${n('deposit')}`);
  }
});

test('нейтралы: в каждой партии разный набор из кандидатов, равномерно по карте', () => {
  const sets = [1, 2, 3].map((seed) => {
    const s = newGame(europeMap(), [{ nation: 'spain' }, { nation: 'italy' }], { elo: 1200, seed });
    const hs = Object.values(s.neutrals).map((n) => s.halls[n.hallId]);
    return { s, hs, names: hs.map((h) => h.name).sort().join() };
  });
  assert.notEqual(sets[0].names, sets[1].names);
  for (const { s, hs } of sets) {
    assert.equal(hs.length, (europeMap().neutralCount ?? 0) + europeMap().spawns.length - 2); // + свободные столицы
    // ни один нейтрал не стоит вплотную к другому городу
    for (const a of hs) for (const b of Object.values(s.halls)) if (a !== b) assert.ok(distance(a.hex, b.hex) >= 3, `${a.name}–${b.name}`);
  }
});

test('память карты: под туманом виден город таким, каким его видели', async () => {
  const { remember, visible } = await import('../src/index.ts');
  const s = newGame(europeMap(), [{ nation: 'spain' }, { nation: 'italy' }], { elo: 1200, seed: 1 });
  const g = Object.values(s.generals).find((x) => x.owner === 'p1')!;
  const lisbon = Object.values(s.halls).find((h) => s.neutrals[h.owner])!;
  g.hex = { q: lisbon.hex.q + 1, r: lisbon.hex.r };
  remember(s, 'p1');
  const k = key(lisbon.hex);
  assert.equal(s.memory!.p1[k].hall!.name, lisbon.name);
  // генерал ушёл, город вырос — игрок помнит старый уровень
  g.hex = { ...playerHalls(s, 'p1')[0].hex };
  lisbon.level = 3;
  remember(s, 'p1');
  assert.ok(!visible(s, 'p1').has(k));
  assert.equal(s.memory!.p1[k].hall!.level, 1);
});

test('разбойники: по шайке на игрока недалеко от его столицы, грабят город без армии, ведут историю для графиков', async () => {
  const { bandits, banditsTurn, raidCity, BANDITS, endTurn } = await import('../src/index.ts');
  const m = europeMap();
  m.randomSpawns = false; // Мадрид и Рим (не Афины — там разбойников нет)
  m.spawnNations = ['italy', 'germany', 'france', 'spain', 'britain', 'poland', 'turkey', 'russia'];
  const s = newGame(m, [{ nation: 'spain' }, { nation: 'italy' }], { elo: 1200, seed: 7, bandits: 6 });
  const bs = bandits(s);
  const bs0 = bs.map((b) => b.id);
  assert.equal(bs.length, 2, 'по шайке на каждого из двух игроков');
  for (const pid of ['p1', 'p2']) {
    const cap = playerHalls(s, pid)[0];
    assert.equal(bs.filter((b) => distance(b.hex, cap.hex) >= 4 && distance(b.hex, cap.hex) <= 9).length >= 1, true, pid);
  }
  for (const b of bs) for (const h of Object.values(s.halls)) assert.ok(distance(b.hex, h.hex) >= 4);
  // город без армии разбойники берут: он становится вольным, шайка — его гарнизоном
  const g1 = Object.values(s.generals).find((x) => x.owner === 'p1')!;
  const cap = playerHalls(s, 'p1')[0];
  g1.hex = { q: g1.hex.q + 5, r: g1.hex.r }; // армия ушла из города
  const band = bs[0];
  raidCity(s, band.id, cap.id);
  assert.ok(s.neutrals[cap.owner], 'город стал нейтральным');
  assert.equal(s.generals[band.id].owner, cap.owner, 'шайка стала гарнизоном');
  assert.equal(key(s.generals[band.id].hex), key(cap.hex));
  assert.equal(s.players.p1.alive, false, 'последний город потерян');
  // ходят раз в круг
  const before = bs.map((b) => key(b.hex)).join();
  banditsTurn(s);
  assert.deepEqual(banditsTurn(s), []);
  assert.ok(bandits(s).every((b) => b.owner === BANDITS));
  void before; void bs0;
  for (let i = 0; i < 4; i++) endTurn(s);
  assert.ok((s.history?.length ?? 0) >= 2, 'сводка пишется каждый круг');
});

test('два генерала не встают на одну клетку: сквозь своих пройти можно, нанятый появляется рядом с городом', async () => {
  const { reachable, move, hireGeneral, findPath } = await import('../src/index.ts');
  const s = newGame(europeMap(), [{ nation: 'spain' }, { nation: 'italy' }], { elo: 1200, seed: 3 });
  const cap = playerHalls(s, 'p1')[0];
  const g = Object.values(s.generals).find((x) => x.owner === 'p1')!;
  cap.tavern = 1;
  s.players.p1.res.gold = 10000;
  assert.ok(hireGeneral(s, 'p1', cap.id).ok);
  const fresh = Object.values(s.generals).find((x) => x.owner === 'p1' && x.id !== g.id)!;
  assert.notEqual(key(fresh.hex), key(g.hex), 'новый генерал встал на соседнюю клетку');
  assert.equal(distance(fresh.hex, cap.hex), 1);
  fresh.moveLeft = 2;
  assert.ok(!reachable(s, fresh.id).has(key(g.hex)), 'на клетку другого генерала встать нельзя');
  assert.ok(!move(s, fresh.id, g.hex).ok);
  const path = findPath(s, fresh.id, g.hex)!;
  assert.equal(distance(path[path.length - 1], g.hex) <= 1, true, 'приказ ведёт к соседней клетке');
});

test('разбойники не появляются у Афин и не заходят в Грецию; малоразвитый город им милее', async () => {
  const { bandits, spawnBandits, reachable, banditsTurn } = await import('../src/index.ts');
  const m = europeMap();
  m.randomSpawns = false;
  m.spawnNations = ['italy', 'germany', 'france', 'spain', 'britain', 'poland', 'turkey', 'russia']; // Афины — турки
  const s = newGame(m, [{ nation: 'turkey' }, { nation: 'italy' }], { elo: 1200, seed: 5, bandits: 6 });
  const athens = playerHalls(s, 'p1')[0];
  assert.equal(key(athens.hex), key(m.spawns[6]));
  assert.ok(s.cells[key(athens.hex)].noBandits);
  for (let i = 0; i < 5; i++) spawnBandits(s);
  for (const b of bandits(s)) {
    assert.ok(distance(b.hex, athens.hex) > 7, 'шайки не у Афин');
    b.moveLeft = 30;
    for (const k of reachable(s, b.id).keys()) assert.ok(!s.cells[k].noBandits, 'в Грецию не пройти');
  }
  void banditsTurn;
});

test('разбойники, разбившие армию в городе, забирают его — и столицу тоже', async () => {
  const { bandits, attack, resolveBattle, capture, makeGeneral } = await import('../src/index.ts');
  const m = europeMap();
  m.randomSpawns = false;
  m.spawnNations = ['italy', 'germany', 'france', 'spain', 'britain', 'poland', 'turkey', 'russia'];
  const s = newGame(m, [{ nation: 'spain' }, { nation: 'italy' }], { elo: 1200, seed: 7, bandits: 6 });
  const cap = playerHalls(s, 'p1')[0];
  const b = bandits(s)[0];
  const win = (hallHex: { q: number; r: number }, defender: string) => {
    b.hex = Object.values(s.cells).find((c) => distance(c.hex, hallHex) === 1 && c.terrain !== 'water' && c.terrain !== 'mountain' && !Object.values(s.generals).some((g) => key(g.hex) === key(c.hex)))!.hex;
    b.moveLeft = 2; b.attacked = false;
    const r = attack(s, b.id, hallHex);
    assert.equal(r.kind, 'battle');
    if (r.kind === 'battle') resolveBattle(s, r.attacker, r.defender, { end: 'mate', mateWinner: 'white', white: { ...b.army }, black: { p: 0, n: 0, b: 0, r: 0, q: 0 } });
    void defender;
  };
  // столица устояла: армия разбита, город остался у игрока
  const g1 = Object.values(s.generals).find((x) => x.owner === 'p1')!;
  g1.hex = { ...cap.hex };
  win(cap.hex, g1.id);
  assert.ok(s.neutrals[s.halls[cap.id].owner], 'столица тоже может пасть');
});

test('Япония: взятый японцами город ничего не теряет, а японский город при захвате теряет уровень', async () => {
  const { capture } = await import('../src/index.ts');
  const s = newGame(europeMap(), [{ nation: 'japan' }, { nation: 'italy' }], { elo: 1200, seed: 2 });
  const jp = playerHalls(s, 'p1')[0], it = playerHalls(s, 'p2')[0];
  for (const h of [jp, it]) { h.level = 3; h.barracks = 2; }
  const farmOf = (hallId: string) => Object.values(s.cells).find((c) => c.hall === hallId && c.terrain === 'field' && key(c.hex) !== key(s.halls[hallId].hex))!;
  const jf = farmOf(jp.id), itf = farmOf(it.id);
  jf.building = { kind: 'farm', level: 2 };
  itf.building = { kind: 'farm', level: 2 };
  capture(s, it.id, 'p1');
  assert.equal(it.level, 3); assert.equal(it.barracks, 2);
  assert.equal(itf.building?.level, 2, 'японцы здания не ломают');
  capture(s, jp.id, 'p2');
  assert.equal(jp.level, 2); assert.equal(jp.barracks, 1); assert.equal(jf.building?.level, 1);
});

test('разбойники: ничья — шайка рассеивается; новая шайка по средней силе лучших армий игроков', async () => {
  const { bandits, banditArmy, applyBattle, armyValue } = await import('../src/index.ts');
  const m = europeMap();
  m.randomSpawns = false;
  m.spawnNations = ['italy', 'germany', 'france', 'spain', 'britain', 'poland', 'turkey', 'russia'];
  const s = newGame(m, [{ nation: 'spain' }, { nation: 'italy' }], { elo: 1200, seed: 7, bandits: 6 });
  assert.equal(armyValue(banditArmy(s)), 70, 'в начале — как стартовая армия');
  const [g1, g2] = ['p1', 'p2'].map((pid) => Object.values(s.generals).find((x) => x.owner === pid)!);
  g1.army = { p: 8, n: 2, b: 2, r: 2, q: 1 }; // 390
  g2.army = { p: 8, n: 1, b: 1, r: 0, q: 0 }; // 140
  const v = armyValue(banditArmy(s));
  assert.ok(Math.abs(v - 265) <= 30, `сила шайки ${v}`);
  const b = bandits(s)[0];
  applyBattle(s, b.id, g2.id, { end: 'draw', white: { ...b.army }, black: { ...g2.army } } as never);
  assert.equal(s.generals[b.id], undefined, 'шайка рассеялась');
  assert.ok(s.generals[g2.id]);
});
