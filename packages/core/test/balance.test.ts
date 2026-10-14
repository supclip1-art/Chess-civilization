// Проверка темпа на настоящих правилах: простой бот развивается дома 40 ходов без войны.
// Ориентир из Python-моделей (v4): полная армия дома к 34–36-му ходу, без голода.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PIECES, PIECE_PRICE, RESOURCE_COST, RESOURCE_OUTPUT, HIRE_LEVEL, BUILDING_TERRAIN, armyValue, build, endTurn,
  freeBuilders, hireBuilder, hirePiece, income, newGame, playerGenerals, playerHalls, upgrade, upgradeBarracks,
  upgradeTownHall, upkeep, type GameState, type Piece, type ResourceBuilding,
} from '../src/index.ts';
import { testMap } from './helpers.ts';

const TARGET: Record<Piece, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
const FULL = PIECES.reduce((s, p) => s + TARGET[p] * PIECE_PRICE[p], 0);

const botTurn = (s: GameState, pid: string) => {
  const p = s.players[pid];
  const farms = Object.values(s.cells).filter((c) => c.owner === pid && c.building?.kind === 'farm').length;
  const mines = Object.values(s.cells).filter((c) => c.owner === pid && c.building?.kind === 'mine').length;
  const hall = playerHalls(s, pid)[0];
  if (hall.level < 2 && farms >= 2) upgradeTownHall(s, pid, hall.id);
  while (hireBuilder(s, pid).ok);
  const g = playerGenerals(s, pid)[0];
  const need = Math.max(0, ...PIECES.filter((x) => g.army[x] < TARGET[x]).map((x) => HIRE_LEVEL[x]));
  if (mines >= 1 && p.barracks < need) upgradeBarracks(s, pid);
  // жадная стройка: лучшая выработка на единицу цены
  for (let guard = 0; guard < 4 && freeBuilders(p) > 0; guard++) {
    const fn = income(s, pid).food - upkeep(s, pid);
    let best: { score: number; act: () => void } | null = null;
    for (const c of Object.values(s.cells)) {
      if (c.owner !== pid || c.reserved) continue;
      const kinds = Object.keys(BUILDING_TERRAIN) as ResourceBuilding[];
      for (const kind of kinds) {
        const lvl = c.building ? (c.building.kind === kind ? c.building.level + 1 : 0) : (c.terrain === BUILDING_TERRAIN[kind] ? 1 : 0);
        if (!lvl || lvl > 5) continue;
        if (c.building && p.jobs.some((j) => j.kind === 'resource' && j.hex.q === c.hex.q && j.hex.r === c.hex.r)) continue;
        if (Object.values(s.halls).some((h) => h.hex.q === c.hex.q && h.hex.r === c.hex.r)) continue;
        const cost = RESOURCE_COST[kind][lvl - 1];
        if (p.res.wood < cost.wood || p.res.food < cost.food) continue;
        const gain = RESOURCE_OUTPUT[kind][lvl - 1] - (RESOURCE_OUTPUT[kind][lvl - 2] ?? 0);
        const w = kind === 'mine' ? 2.5 : kind === 'farm' && fn < 1 ? 3 : 1;
        const score = (gain * w) / (cost.wood + cost.food);
        const hex = c.hex;
        if (!best || score > best.score) best = { score, act: () => (lvl === 1 ? build(s, pid, hex, kind) : upgrade(s, pid, hex)) };
      }
    }
    if (!best) break;
    best.act();
  }
  // армия: по порядку пешки → кони → слоны → ладьи → ферзь, если еда тянет содержание
  for (const piece of PIECES) {
    while (g.army[piece] < TARGET[piece] && income(s, pid).food >= upkeep(s, pid) + PIECE_PRICE[piece] * 0.1) {
      if (!hirePiece(s, pid, g.id, piece).ok) break;
    }
  }
};

test('темп развития дома на настоящих правилах', () => {
  const s = newGame(testMap(), [{ nation: 'germany' }, { nation: 'france' }], { elo: 1200, seed: 11 });
  const marks: Record<string, number> = {};
  for (let t = 1; t <= 40; t++) {
    botTurn(s, 'p1');
    const g = playerGenerals(s, 'p1')[0];
    const v = armyValue(g.army);
    if (v >= FULL / 2 && !marks.half) marks.half = t;
    if (v >= FULL && !marks.full) marks.full = t;
    if (s.players.p1.barracks >= 5 && !marks.barracks5) marks.barracks5 = t;
    endTurn(s); endTurn(s);
  }
  const famine = s.log.some((e) => e.player === 'p1' && e.text.startsWith('famine'));
  console.log('вехи:', marks, '| ресурсы на 40-м ходу:', s.players.p1.res, '| голод:', famine);
  assert.ok(!famine, 'бот не должен голодать');
  assert.ok(marks.half && marks.half <= 30, 'половина армии к 30-му ходу');
});
