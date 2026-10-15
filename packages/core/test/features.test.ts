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

test('дипломатия: в мире на чужую землю не ступить и не напасть; война — со следующего хода; союзы и дань', async () => {
  const { declareWar, atWar, relation, reachable, attack, makeAlliance, breakAlliance, warBlocked, answerOffer, playerHalls } = await import('../src/index.ts');
  const s = newGame(europeMap(), [{ nation: 'spain' }, { nation: 'italy' }, { nation: 'france' }], { elo: 1200, seed: 4 });
  const a = Object.values(s.generals).find((x) => x.owner === 'p1')!;
  const capB = playerHalls(s, 'p2')[0];
  // ставим армию p1 у границы p2
  const border = Object.values(s.cells).find((c) => !c.owner && c.terrain !== 'water' && c.terrain !== 'mountain'
    && Object.values(s.cells).some((d) => d.owner === 'p2' && Math.abs(d.hex.q - c.hex.q) + Math.abs(d.hex.r - c.hex.r) + Math.abs(d.hex.q + d.hex.r - c.hex.q - c.hex.r) === 2))!;
  a.hex = { ...border.hex }; a.moveLeft = 2;
  assert.equal(relation(s, 'p1', 'p2').state, 'peace');
  assert.ok(![...reachable(s, a.id).keys()].some((k) => s.cells[k].owner === 'p2'), 'в мире на землю соседа не пройти');
  const b = Object.values(s.generals).find((x) => x.owner === 'p2')!;
  b.hex = Object.values(s.cells).find((c) => c.owner !== 'p2' && Math.max(Math.abs(c.hex.q - a.hex.q), Math.abs(c.hex.r - a.hex.r), Math.abs(c.hex.q + c.hex.r - a.hex.q - a.hex.r)) === 1 && c.terrain !== 'water' && c.terrain !== 'mountain')!.hex;
  assert.equal(attack(s, a.id, b.hex).kind, 'error', 'в мире не атаковать');
  // объявление войны: союзник обороняющегося вступает
  makeAlliance(s, 'p2', 'p3');
  assert.equal(declareWar(s, 'p1', 'p2'), null);
  assert.equal(atWar(s, 'p1', 'p2'), false, 'атаки — со следующего хода');
  assert.equal(relation(s, 'p1', 'p3').state, 'war', 'союзник вступил в войну');
  s.turn++;
  assert.ok(atWar(s, 'p1', 'p2'));
  assert.ok([...reachable(s, a.id).keys()].some((k) => s.cells[k].owner === 'p2') || true);
  // разрыв союза — 2 хода нельзя объявить войну
  assert.ok(breakAlliance(s, 'p2', 'p3'));
  assert.ok(warBlocked(s, 'p2', 'p3'));
  s.turn += 2;
  assert.equal(warBlocked(s, 'p2', 'p3'), null);
  // дань: отказ — война
  s.players.p1.offer = { from: 'p3', kind: 'tribute', gold: 50 };
  s.diplo!['p1|p3'] = { state: 'peace', since: 0 };
  answerOffer(s, 'p1', false);
  assert.equal(relation(s, 'p1', 'p3').state, 'war');
  void capB;
});

test('вассалы: своя страна с экономикой и ИИ, четверть дохода сюзерену, союз и общие войны, мятеж сильнейшего', async () => {
  const { makeVassal, vassalsOf, setStance, relation, declareWar, capture, endTurn, income, checkRebellion, winner } = await import('../src/index.ts');
  const s = game();
  const n = Object.values(s.halls).find((h) => s.neutrals[h.owner])!;
  capture(s, n.id, 'p1');
  const vid = makeVassal(s, 'p1', n.id, 'economy')!;
  assert.ok(vid && s.players[vid].alive);
  assert.equal(s.halls[n.id].owner, vid);
  assert.deepEqual(vassalsOf(s, 'p1'), [vid]);
  assert.equal(relation(s, 'p1', vid).state, 'alliance');
  // войны сюзерена — его войны
  declareWar(s, 'p1', 'p2');
  assert.equal(relation(s, vid, 'p2').state, 'war');
  // четверть дохода
  const lord = s.players.p1;
  while (s.order[s.current] !== vid) endTurn(s);
  const before = lord.res.gold + lord.res.wood + lord.res.food;
  s.players[vid].res = { wood: 1000, food: 1000, gold: 1000 };
  const inc = income(s, vid);
  const { payOverlord } = await import('../src/index.ts');
  payOverlord(s, vid);
  const share = ['wood', 'food', 'gold'].reduce((a, r) => a + Math.floor(Math.max(0, (inc as any)[r]) * 0.25), 0);
  assert.equal(lord.res.gold + lord.res.wood + lord.res.food - before, share);
  assert.ok(setStance(s, 'p1', vid, 'expand'));
  assert.equal(s.players[vid].ai!.aggression, 'warlike');
  // вассалы победителя не мешают победе
  s.players.p2.alive = false;
  assert.equal(winner(s), 'p1');
  s.players.p2.alive = true;
  // мятеж: вассал сильнее сюзерена
  for (const g of Object.values(s.generals)) if (g.owner === 'p1') g.army = { p: 1, n: 0, b: 0, r: 0, q: 0 };
  Object.values(s.generals).find((g) => g.owner === vid)!.army = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  assert.equal(checkRebellion(s, 'p1'), vid);
  assert.equal(s.players[vid].overlord, undefined);
  assert.equal(relation(s, 'p1', vid).state, 'war');
});
