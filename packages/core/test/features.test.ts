// Сундуки трофеев, события, дипломатия, вассалы.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyBattle, armyValue, eloCap, europeMap, newGame, openChest, type GameState } from '../src/index.ts';

const game = (): GameState => newGame(europeMap(), [{ nation: 'spain' }, { nation: 'italy' }], { elo: 1200, seed: 4 });

test('сундук: каждая победа приносит награду, ELO не выше потолка', () => {
  const s = game();
  const g = Object.values(s.generals).find((x) => x.owner === 'p1')!;
  const kinds = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const before = { ...s.players.p1.res }, value = armyValue(g.army), elo = g.elo;
    const r = openChest(s, 'p1', g.id)!;
    kinds.add(r.kind);
    const gained = s.players.p1.res.gold - before.gold + s.players.p1.res.wood - before.wood + armyValue(g.army) - value + g.elo - elo;
    assert.ok(gained > 0, `награда ${r.kind} что-то дала`);
    assert.ok(g.elo <= eloCap(s));
  }
  assert.deepEqual([...kinds].sort(), ['gold', 'piece', 'scroll', 'supplies']);
  // победа в бою открывает сундук
  const foe = Object.values(s.generals).find((x) => x.owner === 'p2')!;
  const out = applyBattle(s, g.id, foe.id, { end: 'mate', mateWinner: 'white', white: { ...g.army }, black: { ...foe.army } });
  assert.ok(out.chest);
});
