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

test('события: раз в 8–12 ходов; ИИ решает сам, игроку — карточка; урожай, мор, бунт, наёмники, беды', async () => {
  const { rollEvent, answerEvent, resolveEvent, canSuppress, MERCENARY_GOLD, playerHalls, playerGenerals, capture, build, freeBuilders } = await import('../src/index.ts');
  const s = game();
  const p = s.players.p1;
  // расписание
  rollEvent(s, 'p1');
  assert.ok(p.nextEvent! >= s.turn + 8 && p.nextEvent! <= s.turn + 12);
  s.turn = p.nextEvent!;
  rollEvent(s, 'p1');
  assert.ok(p.event, 'у игрока — карточка');
  assert.ok(p.nextEvent! >= s.turn + 8);
  answerEvent(s, 'p1', p.event!.choices[0].id);
  assert.equal(p.event, undefined);
  // урожай: пир даёт ELO всем, но не выше потолка
  const g = playerGenerals(s, 'p1')[0];
  const elo = g.elo;
  resolveEvent(s, 'p1', { kind: 'harvest', title: 'x', text: '', choices: [] }, 'feast');
  assert.equal(g.elo, elo + 25);
  // мор: карантин — в городе нельзя строить 3 хода
  const cap = playerHalls(s, 'p1')[0];
  resolveEvent(s, 'p1', { kind: 'plague', title: 'x', text: '', hallId: cap.id, choices: [] }, 'quarantine');
  assert.equal(freeBuilders(s, 'p1', cap.id), 0);
  const field = Object.values(s.cells).find((c) => c.hall === cap.id && c.terrain === 'field' && !c.building && c.hex.q !== cap.hex.q)!;
  s.players.p1.res = { wood: 999, food: 999, gold: 999 };
  const r = build(s, 'p1', field.hex, 'farm');
  assert.ok(!r.ok && /quarantine/.test(r.reason!), r.ok ? '' : r.reason);
  s.turn += 3;
  assert.ok(freeBuilders(s, 'p1', cap.id) > 0, 'карантин кончился');
  // бунт: подавление держит армию 2 хода
  const n = Object.values(s.halls).find((h) => s.neutrals[h.owner])!;
  capture(s, n.id, 'p1');
  g.hex = { ...n.hex };
  assert.ok(canSuppress(s, 'p1', n.id));
  resolveEvent(s, 'p1', { kind: 'revolt', title: 'x', text: '', hallId: n.id, choices: [] }, 'suppress');
  assert.equal(g.pinnedUntil, s.turn + 2);
  // наёмники: генерал с 4 пешками за 80 золота
  s.players.p1.res.gold = MERCENARY_GOLD;
  const before = playerGenerals(s, 'p1').length;
  resolveEvent(s, 'p1', { kind: 'mercenaries', title: 'x', text: '', choices: [] }, 'hire');
  assert.equal(playerGenerals(s, 'p1').length, before + 1);
  assert.equal(s.players.p1.res.gold, 0);
  // пожар: треть дерева
  s.players.p1.res.wood = 300;
  resolveEvent(s, 'p1', { kind: 'fire', title: 'x', text: '', choices: [] }, 'ok');
  assert.equal(s.players.p1.res.wood, 200);
});
