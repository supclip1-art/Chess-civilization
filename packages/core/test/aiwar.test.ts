// Военный ИИ на карте Европы. Бои здесь не шахматные: побеждает случайно, с шансом по силе армий (power).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  aiEconomyTurn, aiMilitaryTurn, attack, endTurn, europeMap, newGame, next, power, resolveBattle, type Aggression,
} from '../src/index.ts';

const play = (aggr: Aggression[], turns: number) => {
  // четыре соседние столицы (Рим, Берлин, Париж, Мадрид) — как на прежней карте на четверых
  const m = europeMap();
  m.randomSpawns = false;
  m.spawnNations = ['italy', 'germany', 'france', 'spain', 'britain', 'poland', 'turkey', 'russia'];
  const s = newGame(m, (['italy', 'germany', 'france', 'spain'] as const).map((n, i) => ({ nation: n, ai: { aggression: aggr[i], ruler: 'x' } })), { elo: 1200, seed: 7 });
  const vs: { turn: number; who: string; aggr: Aggression; neutral: boolean; defense?: boolean }[] = [];
  for (let t = 0; t < turns * 4; t++) {
    const pid = s.order[s.current];
    aiEconomyTurn(s, pid);
    for (const a of aiMilitaryTurn(s, pid)) {
      const r = attack(s, a.gid, a.target);
      if (r.kind === 'siege') vs.push({ turn: s.turn, who: pid, aggr: s.players[pid].ai!.aggression, neutral: false, defense: a.defense });
      if (r.kind !== 'battle') continue;
      const att = s.generals[r.attacker], def = s.generals[r.defender];
      vs.push({ turn: s.turn, who: pid, aggr: s.players[pid].ai!.aggression, neutral: !!s.neutrals[def.owner], defense: a.defense });
      const win = next(s.rng) * (power(att) + power(def)) < power(att);
      resolveBattle(s, r.attacker, r.defender, { end: 'mate', mateWinner: win ? 'white' : 'black', white: { ...att.army }, black: { ...def.army } });
    }
    endTurn(s);
  }
  return { s, vs };
};

test('ИИ захватывает нейтралов, воинственный нападает на соседей, миролюбивый — поздно и редко', () => {
  const { s, vs } = play(['warlike', 'moderate', 'peaceful', 'moderate'], 70);
  const captured = s.log.filter((e) => / is captured$/.test(e.text) && s.players[e.player!]).length;
  assert.ok(captured >= 4, `захватов: ${captured}`);
  assert.ok(vs.some((v) => v.aggr === 'warlike' && !v.neutral), 'воинственный атакует игроков');
  const peaceful = vs.filter((v) => v.aggr === 'peaceful' && !v.neutral && !v.defense).map((v) => v.turn); // отбиться можно всегда
  assert.ok(peaceful.every((t) => t >= 18), 'миролюбивый — не раньше 18-го хода');
  assert.ok(peaceful.every((t, i) => i === 0 || t - peaceful[i - 1] >= 8 || t === peaceful[i - 1]), 'и не чаще раза в 8 ходов');
  assert.ok(!vs.some((v) => v.aggr === 'moderate' && !v.neutral && v.turn < 10), 'умеренный — не раньше 10-го хода');
});

test('города не переходят из рук в руки каждый ход', () => {
  const { s } = play(['warlike', 'warlike', 'warlike', 'warlike'], 60);
  const caps = s.log.filter((e) => / is captured$/.test(e.text)).map((e) => e.text);
  const perCity = new Map<string, number>();
  for (const c of caps) perCity.set(c, (perCity.get(c) ?? 0) + 1);
  assert.ok(Math.max(0, ...perCity.values()) <= 8, // не чаще раза в ~8 ходов на город
    `чаще всего: ${JSON.stringify([...perCity].sort((a, b) => b[1] - a[1])[0])}`);
});

test('приказы генералу: поход через всю карту за несколько ходов и разведка', async () => {
  const { runOrders, findPath, newGame, europeMap, endTurn, key: k, distance: dist } = await import('../src/index.ts');
  const s = newGame(europeMap(), [{ nation: 'spain' }, { nation: 'italy' }], { elo: 1200, seed: 2 });
  const g = Object.values(s.generals).find((x) => x.owner === 'p1')!;
  // цель — дальняя проходимая клетка, до которой есть путь
  const far = Object.values(s.cells).filter((c) => c.terrain === 'field' && !c.owner).sort((a, b) => dist(b.hex, g.hex) - dist(a.hex, g.hex))
    .find((c) => findPath(s, g.id, c.hex));
  assert.ok(far);
  g.order = { kind: 'goto', to: far.hex };
  const start = dist(g.hex, far.hex);
  runOrders(s, 'p1');
  assert.ok(dist(g.hex, far.hex) < start, 'генерал двинулся к цели');
  assert.equal(g.moveLeft, 0);
  const e = Object.values(s.generals).find((x) => x.owner === 'p1' && x !== g);
  assert.equal(e, undefined);
  // разведка открывает новые клетки
  g.order = { kind: 'explore' };
  endTurn(s); endTurn(s);
  const before = Object.keys(s.memory?.p1 ?? {}).length;
  runOrders(s, 'p1');
  assert.ok(Object.keys(s.memory!.p1).length > before, 'разведка открыла новые клетки');
  void k;
});
