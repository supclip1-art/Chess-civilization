// Авторазвитие города игрока: в начале хода город сам нанимает строителей, строит и улучшает здания и растёт.
//   economy — ровный доход: выравнивает приход дерева, еды (после содержания) и золота (×3 по ценности),
//             строит то, чего приходит меньше всего; город растёт, как только места под здания почти кончились;
//   army    — под армию: прежде всего казарма (до 5-го уровня) и таверна (до 4-го), затем рудники на золото;
//             фермы — только когда еды не хватает на содержание.
// Запаса не оставляет: тратит всё, на что хватает.
// Места под рудники бережёт: пока на земле города есть свободные месторождения, столько мест не занимает ничем другим.
// Столица на авторазвитии ещё и прокладывает дороги к своим городам, когда хватает дерева.

import { BUILDER_HIRE_FOOD, RESOURCE_OUTPUT, type Res, type ResourceBuilding } from './config.ts';
import {
  barracksCost, tavernCost, upgradeTavern, build, buildOptions, citySlots, cityUpgradeCost, freeBuilders, hireBuilder, income, maxBuilders, mods, resourceCost,
  upgrade, upgradeBarracks, upgradeTownHall, upkeep,
} from './economy.ts';
import { distance, key } from './hex.ts';
import { buildRoad, roadCost, roadLinked, roadPath } from './extras.ts';
import { isCapital } from './map.ts';
import { type GameState, say } from './state.ts';

export type AutoFocus = 'economy' | 'army';
const RESERVE: Res = { wood: 0, food: 0, gold: 0 };
/** Сколько дерева должно остаться после дороги — на здания. */
const ROAD_SPARE = 60; // неприкосновенного запаса нет: город тратит всё, что может

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
    if (focus === 'army' && bar < 5 && freeBuilders(s, pid, h.id) > 0 && !p.jobs.some((j) => j.kind === 'barracks' && j.hallId === h.id)
      && affordable(p.res, barracksCost(s, pid, (bar + 1) as 1 | 2 | 3 | 4 | 5)) && upgradeBarracks(s, pid, h.id).ok) done.push(`${h.name}: barracks ${bar + 1}`);
    // таверна — для армейского курса: больше генералов
    const tav = h.tavern ?? 0;
    if (focus === 'army' && tav < 4 && freeBuilders(s, pid, h.id) > 0 && !p.jobs.some((j) => j.kind === 'tavern' && j.hallId === h.id)
      && affordable(p.res, tavernCost(s, pid, (tav + 1) as 1 | 2 | 3 | 4)) && upgradeTavern(s, pid, h.id).ok) done.push(`${h.name}: tavern ${tav + 1}`);
    // дороги: столица ведёт дорогу к ближайшему своему городу без дороги, если дерева хватает с запасом
    if (isCapital(s, h) && freeBuilders(s, pid, h.id) > 0 && !p.jobs.some((j) => j.kind === 'road' && j.hallId === h.id)) {
      const targets = Object.values(s.halls).filter((x) => x.owner === pid && x.id !== h.id).sort((a, b) => distance(a.hex, h.hex) - distance(b.hex, h.hex));
      for (const t of targets) {
        const path = roadPath(s, pid, h.id, t.id);
        if (!path || roadLinked(s, h.id, t.id) || path.every((c) => s.cells[key(c)].road)) continue;
        if (p.res.wood - roadCost(s, path).wood < ROAD_SPARE) break; // ближайшая дорога пока не по карману — ждём
        if (buildRoad(s, pid, h.id, t.id).ok) { done.push(`${h.name}: road to ${t.name}`); break; }
      }
    }
    // город растёт раньше новых зданий: когда места почти кончились или ресурсов на рост хватает с запасом
    const grow = () => {
      const sl = citySlots(s, h.id);
      const growCost = h.level < 3 ? cityUpgradeCost(s, pid, (h.level + 1) as 2 | 3) : null;
      const rich = growCost && (['wood', 'food'] as const).every((r) => p.res[r] >= growCost[r] * 1.3 + RESERVE[r]);
      if (growCost && (sl.used >= sl.max - 1 || rich) && !p.jobs.some((j) => j.kind === 'townhall' && j.hallId === h.id)
        && affordable(p.res, growCost) && upgradeTownHall(s, pid, h.id).ok) done.push(`${h.name}: grows to level ${h.level + 1}`);
    };
    grow();
    // здания: лучшая выгода на единицу цены, пока есть свободные строители
    for (let guard = 0; guard < 4 && freeBuilders(s, pid, h.id) > 0; guard++) {
      const foodNet = income(s, pid).food - upkeep(s, pid);
      const weight = (k: ResourceBuilding): number => {
        const food = k === 'farm' || k === 'fishery';
        if (focus === 'army') return food ? (foodNet < 0 ? 3 : foodNet < 6 ? 0.8 : 0.25) : k === 'mine' ? 2.4 : 0.8; // армия: золото, еда — лишь бы хватало
        if (food && foodNet < 0) return 3; // голод — сначала еда
        // ровный доход: чем меньше приходит ресурса (золото ×3 по ценности), тем выгоднее его здание
        const inc = income(s, pid);
        const flow = { wood: inc.wood, food: foodNet, gold: inc.gold * 3 };
        const avg = (flow.wood + flow.food + flow.gold) / 3;
        const r = k === 'mine' ? 'gold' : food ? 'food' : 'wood';
        if (food && foodNet > 40 && foodNet > avg * 1.4) return 0; // еды и так с избытком — ферму не строим, ресурсы пойдут на рост и рудники
        return Math.max(0.1, Math.min(5, ((Math.max(10, avg) + 10) / (Math.max(0, flow[r]) + 10)) ** 2));
      };
      const slots = citySlots(s, h.id);
      // свободные месторождения: под каждое держим место, рудник там рано или поздно встанет
      const deposits = Object.values(s.cells).filter((c) => c.hall === h.id && c.owner === pid && !c.building && !c.reserved && !c.tower
        && c.terrain === 'deposit' && key(c.hex) !== key(h.hex)).length;
      const keepForMines = slots.max - slots.used - 1 < deposits;
      let best: { score: number; run: () => boolean; what: string } | null = null;
      for (const c of Object.values(s.cells)) {
        if (c.hall !== h.id || c.owner !== pid || c.reserved || key(c.hex) === key(h.hex)) continue;
        if (c.building && p.jobs.some((j) => j.kind === 'resource' && key(j.hex) === key(c.hex))) continue;
        if (!c.building && slots.used >= slots.max) continue;
        for (const { kind, maxLevel } of buildOptions(s, pid, c)) {
          const level = c.building ? (c.building.kind === kind ? c.building.level + 1 : 0) : 1;
          if (!level || level > maxLevel) continue;
          // новое здание не на месторождении занимает место, отложенное под рудник (кроме фермы в голод)
          if (level === 1 && kind !== 'mine' && keepForMines && !((kind === 'farm' || kind === 'fishery') && income(s, pid).food - upkeep(s, pid) < 5)) continue;
          const cost = resourceCost(s, pid, kind, level);
          if (!affordable(p.res, cost)) continue;
          const gain = RESOURCE_OUTPUT[kind][level - 1] - (RESOURCE_OUTPUT[kind][level - 2] ?? 0);
          const w = weight(kind);
          if (w <= 0) continue;
          const score = (gain * w) / (cost.wood + cost.food + 1);
          const hex = c.hex;
          if (!best || score > best.score) {
            best = { score, what: `${h.name}: ${kind} ${level > 1 ? `level ${level}` : 'built'}`, run: () => (level === 1 ? build(s, pid, hex, kind) : upgrade(s, pid, hex)).ok };
          }
        }
      }
      if (!best || !best.run()) break;
      done.push(best.what);
    }
    grow(); // если строители освободились или ресурсов хватило только теперь
  }
  if (done.length) say(s, `auto-development: ${done.length} order${done.length > 1 ? 's' : ''} in your cities`, pid);
  return done;
};
