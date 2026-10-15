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
  const s = newGame(europeMap(), [{ nation: 'spain' }, { nation: 'italy' }], { elo: 1200, seed: 7, bandits: 6 });
  const bs = bandits(s);
  assert.equal(bs.length, 2, 'по шайке на каждого из двух игроков');
  for (const pid of ['p1', 'p2']) {
    const cap = playerHalls(s, pid)[0];
    assert.equal(bs.filter((b) => distance(b.hex, cap.hex) >= 5 && distance(b.hex, cap.hex) <= 7).length >= 1, true, pid);
  }
  for (const b of bs) for (const h of Object.values(s.halls)) assert.ok(distance(b.hex, h.hex) >= 4);
  // набег: треть золота и одно здание
  const cap = playerHalls(s, 'p1')[0];
  s.players.p1.res.gold = 90;
  raidCity(s, bs[0].id, cap.id);
  assert.equal(s.players.p1.res.gold, 60);
  // ходят раз в круг
  const before = bs.map((b) => key(b.hex)).join();
  banditsTurn(s);
  assert.deepEqual(banditsTurn(s), []);
  assert.ok(bandits(s).every((b) => b.owner === BANDITS));
  void before;
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
