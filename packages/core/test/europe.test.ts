// Карта «Европа»: родные столицы, связность, состав дома, исторические названия.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PASSABLE, distance, europeMap, key, neighbors, newGame, playerHalls, type Hex } from '../src/index.ts';

test('Европа: игрок стартует на родине, свободные столицы становятся нейтралами со своим именем', () => {
  const s = newGame(europeMap(), [{ nation: 'spain' }, { nation: 'italy' }], { elo: 1200, seed: 1 });
  assert.equal(playerHalls(s, 'p1')[0].name, 'Madrid');
  assert.equal(playerHalls(s, 'p2')[0].name, 'Rome');
  const names = Object.values(s.halls).map((h) => h.name);
  assert.ok(names.includes('Paris') && names.includes('Berlin'), 'Париж и Берлин — нейтралы');
  assert.equal(new Set(names).size, names.length, 'имена городов не повторяются');
  assert.throws(() => newGame(europeMap(), [{ nation: 'russia' }, { nation: 'italy' }], { elo: 1200, seed: 1 }));
});

test('Европа: все столицы и нейтралы связаны сушей, дома есть 3 поля, 3 леса, 2 месторождения', () => {
  const m = europeMap();
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

test('память карты: под туманом виден город таким, каким его видели', async () => {
  const { remember, visible } = await import('../src/index.ts');
  const s = newGame(europeMap(), [{ nation: 'spain' }, { nation: 'italy' }], { elo: 1200, seed: 1 });
  const g = Object.values(s.generals).find((x) => x.owner === 'p1')!;
  const lisbon = Object.values(s.halls).find((h) => h.name === 'Lisbon')!;
  g.hex = { q: lisbon.hex.q + 1, r: lisbon.hex.r };
  remember(s, 'p1');
  const k = key(lisbon.hex);
  assert.equal(s.memory!.p1[k].hall!.name, 'Lisbon');
  // генерал ушёл, город вырос — игрок помнит старый уровень
  g.hex = { ...playerHalls(s, 'p1')[0].hex };
  lisbon.level = 3;
  remember(s, 'p1');
  assert.ok(!visible(s, 'p1').has(k));
  assert.equal(s.memory!.p1[k].hall!.level, 1);
});
