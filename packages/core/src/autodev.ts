// Авторазвитие города игрока: в начале хода город сам нанимает строителей, строит и улучшает здания и растёт.
//   economy — ресурсы: фермы, лесопилки, рудники поровну, с упором на то, чего не хватает;
//   army    — под армию: казарма (до 3-го уровня), рудники на золото, фермы на содержание.
// Тратится только то, что сверх запаса (по 20 дерева, еды и золота), — на ручные решения игрока остаётся.

import { BUILDER_HIRE_FOOD, RESOURCE_OUTPUT, type Res, type ResourceBuilding } from './config.ts';
import {
  barracksCost, build, buildOptions, citySlots, cityUpgradeCost, freeBuilders, hireBuilder, income, maxBuilders, mods, resourceCost,
  upgrade, upgradeBarracks, upgradeTownHall, upkeep,
} from './economy.ts';
import { key } from './hex.ts';
import { type GameState, say } from './state.ts';

export type AutoFocus = 'economy' | 'army';
const RESERVE: Res = { wood: 20, food: 20, gold: 20 };

/** Хватает ли, не залезая в запас (запас проверяем только по тем ресурсам, что тратятся). */
const affordable = (have: Res, cost: Partial<Res>) =>
  (['wood', 'food', 'gold'] as const).every((r) => !(cost[r] ?? 0) || have[r] - cost[r]! >= RESERVE[r]);

/** Включить/выключить авторазвитие города. */
export const setAuto = (s: GameState, pid: string, hallId: string, focus: AutoFocus | undefined): boolean => {
  const h = s.halls[hallId];
  if (!h || h.owner !== pid) return false;
  h.auto = focus;
  return true;
};

/** Ход авторазвития всех городов игрока, где оно включено. Возвращает, что сделано (для сообщения). */
export const autoDevelop = (s: GameState, pid: string): string[] => {
  const p = s.players[pid];
  if (!p) return [];
  const done: string[] = [];
  for (const h of Object.values(s.halls)) {
    if (h.owner !== pid || !h.auto) continue;
    const focus = h.auto;
    // строители
    while (h.builders === undefined || h.builders < maxBuilders(s, pid, h.id)) {
      const n = (h.builders ?? 1) + 1;
      const food = mods(s, pid).freeBuilderHire ? 0 : BUILDER_HIRE_FOOD[n as 2 | 3] ?? 999;
      if (!affordable(p.res, { food }) || !hireBuilder(s, pid, h.id).ok) break;
      done.push(`${h.name}: builder hired`);
    }
    // казарма — для армейского курса
    const bar = h.barracks ?? 0;
    if (focus === 'army' && bar < 3 && freeBuilders(s, pid, h.id) > 0 && !p.jobs.some((j) => j.kind === 'barracks' && j.hallId === h.id)
      && affordable(p.res, barracksCost(s, pid, (bar + 1) as 1 | 2 | 3)) && upgradeBarracks(s, pid, h.id).ok) done.push(`${h.name}: barracks ${bar + 1}`);
    // здания: лучшая выгода на единицу цены, пока есть свободные строители
    for (let guard = 0; guard < 4 && freeBuilders(s, pid, h.id) > 0; guard++) {
      const foodNet = income(s, pid).food - upkeep(s, pid);
      const weight = (k: ResourceBuilding): number => {
        const food = k === 'farm' || k === 'fishery';
        if (food && foodNet < 5) return 3; // голод — сначала еда
        if (focus === 'army') return k === 'mine' ? 2 : food ? 1.4 : 0.7;
        const low = (r: keyof Res) => p.res[r] < 80;
        return k === 'mine' ? (low('gold') ? 2 : 1.3) : food ? (low('food') ? 1.6 : 1) : low('wood') ? 1.6 : 1;
      };
      const slots = citySlots(s, h.id);
      let best: { score: number; run: () => boolean; what: string } | null = null;
      for (const c of Object.values(s.cells)) {
        if (c.hall !== h.id || c.owner !== pid || c.reserved || key(c.hex) === key(h.hex)) continue;
        if (c.building && p.jobs.some((j) => j.kind === 'resource' && key(j.hex) === key(c.hex))) continue;
        if (!c.building && slots.used >= slots.max) continue;
        for (const { kind, maxLevel } of buildOptions(s, pid, c)) {
          const level = c.building ? (c.building.kind === kind ? c.building.level + 1 : 0) : 1;
          if (!level || level > maxLevel) continue;
          const cost = resourceCost(s, pid, kind, level);
          if (!affordable(p.res, cost)) continue;
          const gain = RESOURCE_OUTPUT[kind][level - 1] - (RESOURCE_OUTPUT[kind][level - 2] ?? 0);
          const score = (gain * weight(kind)) / (cost.wood + cost.food + 1);
          const hex = c.hex;
          if (!best || score > best.score) {
            best = { score, what: `${h.name}: ${kind} ${level > 1 ? `level ${level}` : 'built'}`, run: () => (level === 1 ? build(s, pid, hex, kind) : upgrade(s, pid, hex)).ok };
          }
        }
      }
      if (!best || !best.run()) break;
      done.push(best.what);
    }
    // город растёт: как только места под здания почти кончились, а если ресурсов с запасом — и раньше
    const sl = citySlots(s, h.id);
    const growCost = h.level < 3 ? cityUpgradeCost(s, pid, (h.level + 1) as 2 | 3) : null;
    const rich = growCost && (['wood', 'food'] as const).every((r) => p.res[r] >= growCost[r] * 2 + RESERVE[r]);
    if (growCost && (sl.used >= sl.max - 1 || rich) && !p.jobs.some((j) => j.kind === 'townhall' && j.hallId === h.id)
      && affordable(p.res, growCost) && upgradeTownHall(s, pid, h.id).ok) done.push(`${h.name}: grows to level ${h.level + 1}`);
  }
  if (done.length) say(s, `auto-development: ${done.length} order${done.length > 1 ? 's' : ''} in your cities`, pid);
  return done;
};
