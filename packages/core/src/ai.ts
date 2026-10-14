// Экономический ИИ (этап 5 добавит экспансию и атаки по уровню агрессии правителя).
// Каждый ход: ратуша 2 после двух ферм, строители, казарма под следующую фигуру,
// жадная стройка по выгоде на единицу цены, найм фигур к полной армии, «Тактика» на остаток золота.

import { PIECES, PIECE_PRICE, HIRE_LEVEL, RESOURCE_COST, RESOURCE_OUTPUT, type Piece, type ResourceBuilding } from './config.ts';
import { hirePiece } from './army.ts';
import {
  build, freeBuilders, hireBuilder, income, playerGenerals, playerHalls, startResearch, upgrade, upgradeBarracks,
  upgradeTownHall, upkeep,
} from './economy.ts';
import { key } from './hex.ts';
import { BUILDING_TERRAIN, type GameState } from './state.ts';

export const FULL_ARMY: Record<Piece, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };

const count = (s: GameState, pid: string, kind: ResourceBuilding) =>
  Object.values(s.cells).filter((c) => c.owner === pid && c.building?.kind === kind).length;

export const aiEconomyTurn = (s: GameState, pid: string): void => {
  const p = s.players[pid];
  const capital = playerHalls(s, pid).sort((a, b) => a.order - b.order)[0];
  if (!capital) return;
  if (capital.level < 2 && count(s, pid, 'farm') >= 2) upgradeTownHall(s, pid, capital.id);
  while (hireBuilder(s, pid).ok);
  const g = playerGenerals(s, pid).sort((a, b) => a.id.localeCompare(b.id))[0];
  if (g) {
    const need = Math.max(0, ...PIECES.filter((x) => g.army[x] < FULL_ARMY[x]).map((x) => HIRE_LEVEL[x]));
    if (count(s, pid, 'mine') >= 1 && p.barracks < need) upgradeBarracks(s, pid);
  }
  const halls = new Set(Object.values(s.halls).map((h) => key(h.hex)));
  for (let guard = 0; guard < 6 && freeBuilders(p) > 0; guard++) {
    const foodNet = income(s, pid).food - upkeep(s, pid);
    let best: { score: number; run: () => void } | null = null;
    for (const c of Object.values(s.cells)) {
      if (c.owner !== pid || c.reserved || halls.has(key(c.hex))) continue;
      if (c.building && p.jobs.some((j) => j.kind === 'resource' && key(j.hex) === key(c.hex))) continue;
      for (const kind of Object.keys(BUILDING_TERRAIN) as ResourceBuilding[]) {
        const level = c.building ? (c.building.kind === kind ? c.building.level + 1 : 0) : c.terrain === BUILDING_TERRAIN[kind] ? 1 : 0;
        if (!level || level > 5) continue;
        const cost = RESOURCE_COST[kind][level - 1];
        if (p.res.wood < cost.wood || p.res.food < cost.food) continue;
        const gain = RESOURCE_OUTPUT[kind][level - 1] - (RESOURCE_OUTPUT[kind][level - 2] ?? 0);
        const weight = kind === 'mine' ? 2.5 : kind === 'farm' && foodNet < 1 ? 3 : 1;
        const score = (gain * weight) / (cost.wood + cost.food);
        const hex = c.hex;
        if (!best || score > best.score) best = { score, run: () => { level === 1 ? build(s, pid, hex, kind) : upgrade(s, pid, hex); } };
      }
    }
    if (!best) break;
    best.run();
  }
  if (g) {
    for (const piece of PIECES) {
      while (g.army[piece] < FULL_ARMY[piece] && income(s, pid).food >= upkeep(s, pid) + PIECE_PRICE[piece] * 0.1) {
        if (!hirePiece(s, pid, g.id, piece).ok) break;
      }
    }
  }
  if (p.res.gold >= 12) startResearch(s, pid);
};
