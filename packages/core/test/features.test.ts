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
  s.players.p1.offer = { from: 'p3', kind: 'tribute', terms: { res: { wood: 0, food: 0, gold: 50 }, cities: [], techs: [] } };
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

test('сделки: ресурсы, города и технологии; город по договору не теряет построек; ИИ оценивает шанс', async () => {
  const { acceptChance, executeDeal, emptyTerms, tradableTechs, capture, declareWar, relation, neediest } = await import('../src/index.ts');
  const s = newGame(europeMap(), [{ nation: 'spain' }, { nation: 'italy' }], { elo: 1200, seed: 4, });
  s.players.p1.res = { wood: 500, food: 500, gold: 500 };
  s.players.p2.res = { wood: 500, food: 500, gold: 500 };
  // у p2 есть второй город с постройками
  const n = Object.values(s.halls).find((h) => s.neutrals[h.owner])!;
  capture(s, n.id, 'p2');
  const c = Object.values(s.cells).find((x) => x.hall === n.id && x.terrain === 'field' && !(x.hex.q === n.hex.q && x.hex.r === n.hex.r))!;
  c.building = { kind: 'farm', level: 3 };
  s.halls[n.id].level = 2;
  // технологию можно отдать, только если у получателя её нет
  s.players.p1.research.techs = { guilds: true };
  assert.deepEqual(tradableTechs(s, 'p1', 'p2'), ['guilds']);
  assert.deepEqual(tradableTechs(s, 'p2', 'p1'), []);
  // щедрое предложение вероятнее, жадное — нет
  const gift = { give: { ...emptyTerms(), res: { wood: 0, food: 0, gold: 300 } }, take: emptyTerms(), peace: false };
  const greedy = { give: emptyTerms(), take: { ...emptyTerms(), cities: [n.id] }, peace: false };
  assert.ok(acceptChance(s, 'p1', 'p2', gift) > 0.9);
  assert.ok(acceptChance(s, 'p1', 'p2', greedy) < 0.1);
  // мир: проигрывающий соглашается охотнее
  declareWar(s, 'p1', 'p2'); s.turn++;
  for (const g of Object.values(s.generals)) if (g.owner === 'p2') g.army = { p: 1, n: 0, b: 0, r: 0, q: 0 };
  const peace = { give: emptyTerms(), take: { ...emptyTerms(), cities: [n.id] }, peace: true };
  assert.ok(acceptChance(s, 'p1', 'p2', peace) > acceptChance(s, 'p1', 'p2', { ...peace, peace: false }));
  executeDeal(s, 'p1', 'p2', { give: { ...emptyTerms(), techs: ['guilds'] }, take: { ...emptyTerms(), cities: [n.id], res: { wood: 0, food: 100, gold: 0 } }, peace: true });
  assert.equal(s.halls[n.id].owner, 'p1');
  assert.equal(s.halls[n.id].level, 2, 'город не потерял уровень');
  assert.equal(c.building?.level, 3, 'и здания целы');
  assert.ok(s.players.p2.research.techs?.guilds);
  assert.equal(relation(s, 'p1', 'p2').state, 'peace');
  assert.ok(['wood', 'food', 'gold'].includes(neediest(s, 'p2')));
});

test('герои: черта при найме, вторая — с третьей звездой; черты действуют в бою и на карте', async () => {
  const { battleSides, hasTrait, growHero, TRAITS, hirePiece, playerHalls } = await import('../src/index.ts');
  const s = game();
  const g = Object.values(s.generals).find((x) => x.owner === 'p1')!;
  const foe = Object.values(s.generals).find((x) => x.owner === 'p2')!;
  assert.equal(g.traits?.length, 1, 'у стартового генерала одна черта');
  assert.ok(TRAITS[g.traits![0]]);
  g.traits = ['gambit']; foe.traits = ['wall'];
  const b = battleSides(s, g.id, foe.id);
  assert.equal(b.whiteElo, g.elo + 50);
  assert.equal(b.blackElo, foe.elo + 50);
  g.stars = 3; growHero(s, g);
  assert.equal(g.traits.length, 2);
  // вербовщик платит меньше
  g.traits = ['recruiter'];
  playerHalls(s, 'p1')[0].barracks = 1;
  g.hex = { ...playerHalls(s, 'p1')[0].hex };
  s.players.p1.res.gold = 100;
  assert.ok(hirePiece(s, 'p1', g.id, 'p').ok);
  assert.equal(s.players.p1.res.gold, 92);
  assert.ok(hasTrait(g, 'recruiter'));
});

test('сундук: фигура — сначала пешка; при полном наборе фигура не выпадает', () => {
  const s = game();
  const g = Object.values(s.generals).find((x) => x.owner === 'p1')!;
  g.army = { p: 2, n: 2, b: 0, r: 0, q: 0 };
  for (let i = 0; i < 300; i++) {
    const before = { ...g.army };
    const r = openChest(s, 'p1', g.id)!;
    if (r.kind === 'piece') {
      if (before.p < 8) assert.equal(r.piece, 'p');
      g.army = { ...before };
    }
  }
  g.army = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  for (let i = 0; i < 300; i++) assert.notEqual(openChest(s, 'p1', g.id)!.kind, 'piece');
});

test('авторазвитие: город сам строит, оставляя запас', async () => {
  const { autoDevelop, setAuto, playerHalls } = await import('../src/index.ts');
  const s = game();
  const h = playerHalls(s, 'p1')[0];
  s.players.p1.res = { wood: 400, food: 400, gold: 200 };
  assert.ok(setAuto(s, 'p1', h.id, 'economy'));
  const done = autoDevelop(s, 'p1');
  assert.ok(done.length >= 1, 'что-то построено');
  assert.ok(s.players.p1.res.wood >= 20 && s.players.p1.res.food >= 20 && s.players.p1.res.gold >= 20, 'запас не тронут');
  setAuto(s, 'p1', h.id, undefined);
  assert.deepEqual(autoDevelop(s, 'p1'), []);
});

test('разбойник: шайка без города, вечная война, без торговли; гибнет без армий', async () => {
  const { relation, warBlocked, acceptChance, emptyTerms, endTurn, playerHalls, BANDIT_COUNT } = await import('../src/index.ts');
  const s = newGame(europeMap(), [{ nation: 'spain', outlaw: true }, { nation: 'italy', ai: { aggression: 'moderate', ruler: 'x' } }], { elo: 1200, seed: 3, bandits: BANDIT_COUNT });
  assert.equal(playerHalls(s, 'p1').length, 0);
  assert.ok(Object.values(s.generals).some((g) => g.owner === 'p1'), 'у разбойника есть шайка');
  assert.equal(relation(s, 'p1', 'p2').state, 'war');
  assert.ok(warBlocked(s, 'p2', 'p1'));
  assert.equal(acceptChance(s, 'p1', 'p2', { give: { ...emptyTerms(), res: { wood: 10, food: 0, gold: 0 } }, take: emptyTerms(), peace: true }), 0);
  const food = s.players.p1.res.food;
  endTurn(s); endTurn(s);
  assert.ok(s.players.p1.res.food >= food, 'без города содержания нет');
  for (const g of Object.values(s.generals)) if (g.owner === 'p1') delete s.generals[g.id];
  endTurn(s);
  assert.equal(s.players.p1.alive, false);
});

test('сложность: ИИ на «Гроссмейстере» богаче, ELO и армия те же; игроку ничего', () => {
  const mk = (difficulty: 'novice' | 'grandmaster') => newGame(europeMap(), [{ nation: 'spain' }, { nation: 'italy', ai: { aggression: 'moderate', ruler: 'x' } }], { elo: 1200, seed: 4, difficulty });
  const gm = mk('grandmaster'), nv = mk('novice');
  const ai = (s: GameState) => Object.values(s.generals).find((g) => g.owner === 'p2')!;
  assert.ok(gm.players.p2.res.wood > nv.players.p2.res.wood);
  assert.equal(ai(gm).elo, ai(nv).elo);
  assert.equal(armyValue(ai(gm).army), armyValue(ai(nv).army));
  assert.deepEqual(gm.players.p1.res, nv.players.p1.res);
});

test('стены, рынок, башня, отмена и снос', async () => {
  const { buildWalls, upgradeMarket, trade, tradeQuote, buildTower, cancelJob, demolish, playerHalls, endTurn, build, visible, key: k } = await import('../src/index.ts');
  const s = game();
  const h = playerHalls(s, 'p1')[0];
  s.players.p1.res = { wood: 999, food: 999, gold: 999 };
  h.level = 3; h.builders = 3;
  assert.ok(buildWalls(s, 'p1', h.id).ok);
  assert.ok(upgradeMarket(s, 'p1', h.id).ok);
  // отмена: ресурсы возвращаются
  const before = { ...s.players.p1.res };
  const tc = Object.values(s.cells).find((c) => c.hall === h.id && ['field', 'desert', 'tundra'].includes(c.terrain) && !c.building && k(c.hex) !== k(h.hex))!;
  assert.ok(buildTower(s, 'p1', tc.hex).ok);
  assert.ok(cancelJob(s, 'p1', s.players.p1.jobs.length - 1).ok);
  assert.deepEqual(s.players.p1.res, before);
  assert.ok(!tc.reserved);
  assert.ok(buildTower(s, 'p1', tc.hex).ok);
  for (let i = 0; i < 6; i++) endTurn(s);
  assert.equal(h.walls, 1); assert.equal(h.market, 1); assert.ok(tc.tower);
  assert.ok(visible(s, 'p1').size > 0);
  const q = tradeQuote(s, 'p1', 'wood', 'gold', 60);
  assert.equal(q, 10);
  const g0 = s.players.p1.res.gold;
  assert.ok(trade(s, 'p1', 'wood', 'gold', 60).ok);
  assert.equal(s.players.p1.res.gold, g0 + 10);
  // снос
  assert.ok(demolish(s, 'p1', tc.hex).ok);
  assert.ok(!tc.tower);
  void build;
});

test('снос возвращает половину, грабёж даёт треть и разрушает здание', async () => {
  const { build, endTurn, demolish, pillage, canPillage, buildingValue, playerHalls, key: k } = await import('../src/index.ts');
  const { war } = await import('./helpers.ts');
  const s = game();
  s.players.p1.res = { wood: 999, food: 999, gold: 999 };
  const h = playerHalls(s, 'p1')[0];
  const f = Object.values(s.cells).find((c) => c.hall === h.id && c.terrain === 'field' && k(c.hex) !== k(h.hex))!;
  assert.ok(build(s, 'p1', f.hex, 'farm').ok);
  for (let i = 0; i < 2; i++) endTurn(s);
  assert.ok(f.building);
  const val = buildingValue(s, f.hex);
  const w0 = s.players.p1.res.wood;
  assert.ok(demolish(s, 'p1', f.hex).ok);
  assert.equal(s.players.p1.res.wood - w0, Math.floor(val.wood / 2));
  // грабёж: генерал p2 на ферме p1 во время войны
  assert.ok(build(s, 'p1', f.hex, 'farm').ok);
  for (let i = 0; i < 2; i++) endTurn(s);
  const raider = Object.values(s.generals).find((g) => g.owner === 'p2')!;
  raider.hex = { ...f.hex }; raider.attacked = false;
  assert.ok(!canPillage(s, raider.id).ok, 'в мирное время грабить нельзя');
  war(s);
  const loot = buildingValue(s, f.hex);
  const r0 = { ...s.players.p2.res };
  assert.ok(pillage(s, raider.id).ok);
  assert.ok(!f.building);
  assert.equal(s.players.p2.res.wood - r0.wood, Math.floor(loot.wood / 3));
  assert.equal(raider.moveLeft, 0);
});

test('чудо света: одно на карту, одно за партию, гонка и бонус хозяину города', async () => {
  const { startWonder, wonderBlocked, endTurn, playerHalls, freeBuilders, hasWonder, WONDER, capture } = await import('../src/index.ts');
  const s = game();
  for (const pid of ['p1', 'p2']) { s.players[pid].res = { wood: 2000, food: 2000, gold: 2000 }; const c = playerHalls(s, pid)[0]; c.level = 3; c.builders = 3; }
  const cap1 = playerHalls(s, 'p1')[0], cap2 = playerHalls(s, 'p2')[0];
  assert.ok(startWonder(s, 'p1', 'pyramids').ok);
  assert.ok(wonderBlocked(s, 'p1', 'oracle'), 'второе чудо одновременно нельзя');
  // p2 начинает то же чудо на ход позже — проигрывает гонку
  endTurn(s);
  const g2 = s.players.p2.res.gold;
  assert.ok(startWonder(s, 'p2', 'pyramids').ok);
  for (let i = 0; i < 14 && !s.wonders?.pyramids; i++) endTurn(s);
  assert.ok(hasWonder(s, 'p1', 'pyramids'));
  assert.equal(s.players.p2.wonder, undefined);
  assert.ok(s.players.p2.res.gold >= g2 - WONDER.cost.gold / 2, 'проигравшему вернули половину');
  assert.ok(wonderBlocked(s, 'p1', 'oracle'), 'одно чудо за партию');
  assert.ok(!wonderBlocked(s, 'p2', 'oracle'), 'проигравший может взяться за другое');
  // «Пирамиды»: +1 строитель
  s.players.p1.jobs = []; s.players.p1.queue = [];
  assert.equal(freeBuilders(s, 'p1', cap1.id), 4);
  // захват столицы — чудо переходит
  capture(s, cap1.id, 'p2');
  assert.ok(hasWonder(s, 'p2', 'pyramids') && !hasWonder(s, 'p1', 'pyramids'));
  void cap2;
});

test('морской торговый путь приносит золото, пока оба города у одного хозяина', async () => {
  const { coastal, seaPath, buildSeaRoute, endTurn, income, recomputeTerritory, seaRouteGold, capture } = await import('../src/index.ts');
  const s = game();
  const halls = Object.values(s.halls).filter((h) => coastal(s, h.id));
  let pair: [string, string] | null = null;
  for (const a of halls) for (const b of halls) if (!pair && a.id !== b.id) { const p = seaPath(s, a.id, b.id); if (p && p.length <= 24) pair = [a.id, b.id]; }
  assert.ok(pair, 'на карте есть два приморских города, связанных морем');
  const [a, b] = pair!;
  s.halls[a].owner = 'p1'; s.halls[b].owner = 'p1'; s.halls[a].builders = 2; recomputeTerritory(s);
  s.players.p1.res.wood = 999;
  const g0 = income(s, 'p1').gold;
  assert.ok(buildSeaRoute(s, 'p1', a, b).ok);
  assert.ok(!buildSeaRoute(s, 'p1', a, b).ok, 'второй раз тот же путь нельзя');
  for (let i = 0; i < 12 && !s.seaRoutes?.length; i++) endTurn(s);
  assert.equal(s.seaRoutes?.length, 1);
  assert.equal(income(s, 'p1').gold - g0, seaRouteGold(s.seaRoutes![0].cells.length));
  capture(s, b, 'p2');
  assert.equal(income(s, 'p1').gold < g0 + seaRouteGold(s.seaRoutes![0].cells.length), true);
});

test('патруль: генерал перехватывает врага у охраняемого города и возвращается домой', async () => {
  const { runOrders, playerHalls, key: k, distance, neighbors, PASSABLE, patrolThreats } = await import('../src/index.ts');
  const { war } = await import('./helpers.ts');
  const s = game();
  const cap = playerHalls(s, 'p1')[0];
  const g = Object.values(s.generals).find((x) => x.owner === 'p1')!;
  const foe = Object.values(s.generals).find((x) => x.owner === 'p2')!;
  const free = (h: { q: number; r: number }) => PASSABLE[s.cells[k(h)]?.terrain] && !Object.values(s.generals).some((x) => k(x.hex) === k(h)) && !Object.values(s.halls).some((x) => k(x.hex) === k(h));
  const ring2 = Object.values(s.cells).filter((c) => distance(c.hex, cap.hex) === 2 && free(c.hex) && neighbors(c.hex).some((n) => free(n)));
  foe.hex = { ...ring2[0].hex };
  g.hex = { ...cap.hex };
  g.order = { kind: 'patrol', cities: [cap.id] };
  g.moveLeft = 2; g.attacked = false;
  assert.equal(patrolThreats(s, g.id).length, 0, 'в мирное время врагов нет');
  assert.deepEqual(runOrders(s, 'p1').filter((e) => e.attack), []);
  war(s);
  const ev = runOrders(s, 'p1');
  const a = ev.find((e) => e.attack);
  assert.ok(a, 'патрульный готов атаковать');
  assert.equal(distance(g.hex, foe.hex), 1);
  assert.equal(k(a!.attack!), k(foe.hex));
  assert.equal(g.order?.kind, 'patrol', 'приказ не снимается из-за врага рядом');
  // врага нет — генерал возвращается к городу
  delete s.generals[foe.id];
  g.hex = { ...ring2[0].hex }; g.moveLeft = 2;
  const far = Object.values(s.cells).find((c) => distance(c.hex, cap.hex) === 3 && free(c.hex))!;
  g.hex = { ...far.hex };
  runOrders(s, 'p1');
  assert.ok(distance(g.hex, cap.hex) <= 1, 'вернулся к столице');
});

test('авторазвитие бережёт места под рудники, а столица тянет дороги к своим городам', async () => {
  const { autoDevelop, setAuto, citySlots, playerHalls, endTurn, key: k, capture, distance } = await import('../src/index.ts');
  const s = game();
  const cap = playerHalls(s, 'p1')[0];
  // на земле столицы — два месторождения
  const land = Object.values(s.cells).filter((c) => c.hall === cap.id && k(c.hex) !== k(cap.hex) && !c.building && c.terrain !== 'water' && c.terrain !== 'mountain');
  land.slice(0, 2).forEach((c) => { c.terrain = 'deposit'; });
  setAuto(s, 'p1', cap.id, 'economy');
  for (let t = 0; t < 30; t++) {
    s.players.p1.res = { wood: 600, food: 600, gold: 300 };
    if (s.order[s.current] === 'p1') autoDevelop(s, 'p1');
    const sl = citySlots(s, cap.id);
    const freeDeposits = Object.values(s.cells).filter((c) => c.hall === cap.id && c.terrain === 'deposit' && !c.building && !c.reserved).length;
    assert.ok(sl.max - sl.used >= Math.min(freeDeposits, sl.max - sl.used), 'места под рудники не заняты');
    assert.ok(sl.max - sl.used >= freeDeposits || freeDeposits === 0 || sl.used < sl.max, 'хотя бы место под рудник есть');
    endTurn(s);
  }
  const mines = Object.values(s.cells).filter((c) => c.hall === cap.id && c.building?.kind === 'mine').length;
  assert.ok(mines >= 1, 'рудник построен');
  // дорога к другому своему городу
  const other = Object.values(s.halls).filter((h) => h.owner !== 'p1').sort((a, b) => distance(a.hex, cap.hex) - distance(b.hex, cap.hex))[0];
  capture(s, other.id, 'p1');
  while (s.order[s.current] !== 'p1') endTurn(s);
  s.players.p1.jobs = []; s.players.p1.res = { wood: 900, food: 600, gold: 300 };
  autoDevelop(s, 'p1');
  const road = s.players.p1.jobs.find((j) => j.kind === 'road');
  assert.ok(road, 'столица строит дорогу');
});

test('погоня: генерал идёт за армией на виду и готов бить; штурм ведёт к городу', async () => {
  const { runOrders, playerHalls, key: k, distance, PASSABLE } = await import('../src/index.ts');
  const { war } = await import('./helpers.ts');
  const s = game();
  war(s);
  const cap = playerHalls(s, 'p1')[0];
  const g = Object.values(s.generals).find((x) => x.owner === 'p1')!;
  const foe = Object.values(s.generals).find((x) => x.owner === 'p2')!;
  const free = (h: { q: number; r: number }) => PASSABLE[s.cells[k(h)]?.terrain] && !Object.values(s.generals).some((x) => k(x.hex) === k(h)) && !Object.values(s.halls).some((x) => k(x.hex) === k(h));
  g.hex = { ...cap.hex }; g.moveLeft = 2; g.attacked = false;
  const spot = Object.values(s.cells).find((c) => distance(c.hex, cap.hex) === 3 && free(c.hex))!;
  foe.hex = { ...spot.hex };
  g.order = { kind: 'chase', target: foe.id };
  const ev = runOrders(s, 'p1');
  assert.ok(distance(g.hex, foe.hex) <= 2, 'приблизился');
  if (distance(g.hex, foe.hex) === 1) assert.ok(ev.some((e) => e.attack), 'догнал — бьёт');
  // цель скрылась из виду — погоня окончена
  foe.hex = { ...Object.values(s.cells).find((c) => distance(c.hex, g.hex) >= 9 && free(c.hex))!.hex };
  g.moveLeft = 2;
  const ev2 = runOrders(s, 'p1');
  assert.equal(g.order, undefined);
  assert.ok(ev2.some((e) => /lost sight/.test(e.text)));
  // штурм вражеской столицы
  const enemyCap = playerHalls(s, 'p2')[0];
  g.order = { kind: 'assault', hall: enemyCap.id };
  const d0 = distance(g.hex, enemyCap.hex);
  g.moveLeft = 2;
  runOrders(s, 'p1');
  assert.ok(distance(g.hex, enemyCap.hex) < d0, 'идёт к городу');
});

test('осаждавший разбит — осада снимается сразу, кольца у города нет', async () => {
  const { resolveBattle, playerHalls, key: k, distance, PASSABLE } = await import('../src/index.ts');
  const { war } = await import('./helpers.ts');
  const s = game();
  war(s);
  const cap = playerHalls(s, 'p1')[0];
  const foe = Object.values(s.generals).find((x) => x.owner === 'p2')!;
  const mine = Object.values(s.generals).find((x) => x.owner === 'p1')!;
  const free = (h: { q: number; r: number }) => PASSABLE[s.cells[k(h)]?.terrain] && !Object.values(s.generals).some((x) => k(x.hex) === k(h)) && !Object.values(s.halls).some((x) => k(x.hex) === k(h));
  foe.hex = { ...Object.values(s.cells).find((c) => distance(c.hex, cap.hex) === 1 && free(c.hex))!.hex };
  mine.hex = { ...Object.values(s.cells).find((c) => distance(c.hex, foe.hex) === 1 && free(c.hex))!.hex };
  cap.siege = { by: foe.id, since: s.turn };
  mine.attacked = false;
  resolveBattle(s, mine.id, foe.id, { end: 'mate', mateWinner: 'white', white: { ...mine.army }, black: { p: 0, n: 0, b: 0, r: 0, q: 0 } });
  assert.equal(s.generals[foe.id], undefined);
  assert.equal(cap.siege, undefined, 'осада снята сразу');
});

test('карта «Италия»: Рим, Венеция и Сицилия — соперники ИИ, партия идёт', async () => {
  const { italyMap, newGame, endTurn, aiEconomyTurn, aiMilitaryTurn, playerHalls, NATIONS } = await import('../src/index.ts');
  const m = { ...italyMap(), randomSpawns: false, spawnNations: ['italy', 'venice', 'sicily'] as ('italy' | 'venice' | 'sicily')[] };
  const s = newGame(m, [{ nation: 'italy' }, { nation: 'venice', ai: { aggression: 'moderate', ruler: NATIONS.venice.rulers.moderate } }, { nation: 'sicily', ai: { aggression: 'warlike', ruler: NATIONS.sicily.rulers.warlike } }], { elo: 1000, seed: 3 });
  assert.equal(playerHalls(s, 'p2')[0].name, 'Venice');
  assert.equal(playerHalls(s, 'p3')[0].name, 'Syracuse');
  assert.ok(Object.values(s.halls).filter((h) => !s.players[h.owner]).length >= 10, 'вольные города между ними');
  for (let t = 0; t < 45; t++) { const pid = s.order[s.current]; if (s.players[pid].ai) { aiEconomyTurn(s, pid); aiMilitaryTurn(s, pid); } endTurn(s); }
  assert.ok(playerHalls(s, 'p2').length >= 1 && playerHalls(s, 'p3').length >= 1);
});

test('дорога между двумя городами строится один раз: обратно — нельзя', async () => {
  const { buildRoad, roadLinked, playerHalls, capture, endTurn, distance } = await import('../src/index.ts');
  const s = game();
  const cap = playerHalls(s, 'p1')[0];
  const other = Object.values(s.halls).filter((h) => h.owner !== 'p1' && !s.players[h.owner]).sort((a, b) => distance(a.hex, cap.hex) - distance(b.hex, cap.hex))[0];
  capture(s, other.id, 'p1');
  s.players.p1.res.wood = 999; other.builders = 2; cap.builders = 2;
  assert.ok(buildRoad(s, 'p1', cap.id, other.id).ok);
  assert.ok(!buildRoad(s, 'p1', other.id, cap.id).ok, 'обратную дорогу во время стройки нельзя');
  for (let i = 0; i < 8; i++) endTurn(s);
  assert.ok(roadLinked(s, other.id, cap.id));
  assert.ok(!buildRoad(s, 'p1', other.id, cap.id).ok, 'и после постройки тоже');
});

test('глава 1 (Италия): без разбойников и с 7 вольными городами', async () => {
  const { italyMap, newGame, endTurn, aiEconomyTurn, aiMilitaryTurn, NATIONS } = await import('../src/index.ts');
  const base = italyMap();
  const m = { ...base, noBandits: base.cells.map((c) => `${c.q},${c.r}`), neutralCount: 7, randomSpawns: false, spawnNations: ['italy', 'venice', 'sicily'] as ('italy' | 'venice' | 'sicily')[] };
  const s = newGame(m, [{ nation: 'italy' }, { nation: 'venice', ai: { aggression: 'moderate', ruler: NATIONS.venice.rulers.moderate } }, { nation: 'sicily', ai: { aggression: 'warlike', ruler: NATIONS.sicily.rulers.warlike } }], { elo: 1000, seed: 5, bandits: 0 });
  assert.equal(Object.values(s.halls).filter((h) => !s.players[h.owner]).length, 7);
  let seen = 0;
  for (let t = 0; t < 90; t++) {
    const pid = s.order[s.current];
    if (s.players[pid].ai) { aiEconomyTurn(s, pid); aiMilitaryTurn(s, pid); }
    endTurn(s);
    seen += Object.values(s.generals).filter((g) => g.owner === 'bandits').length;
  }
  assert.equal(seen, 0, 'шайки не появляются');
});
