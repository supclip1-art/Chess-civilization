// Экономический ИИ. Экспансия и атаки — в aiwar.ts.
// Каждый ход: город 2 после двух ферм (или промыслов), строители, казарма под следующую фигуру (копит на неё),
// жадная стройка по выгоде на единицу цены, найм фигур к полной армии, «Тактика» на остаток золота.

import { ARMY_UPKEEP_RATE, BARRACKS, GENERAL_UPKEEP_FOOD, PIECES, PIECE_PRICE, HIRE_LEVEL, RESOURCE_COST, RESOURCE_OUTPUT, type Piece, type ResourceBuilding } from './config.ts';
import { generalLimit, hireGeneral, hirePiece } from './army.ts';
import {
  build, buildOptions, freeBuilders, mods, resourceCost, hireBuilder, income, playerGenerals, playerHalls, startResearch, upgrade, upgradeBarracks,
  upgradeTavern, upgradeTownHall, upkeep, citySlots, cityUpgradeCost, startTech, trainGeneral, trainingFor,
} from './economy.ts';
import { key } from './hex.ts';
import { BUILDING_TERRAIN, type GameState } from './state.ts';

export const FULL_ARMY: Record<Piece, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
/** Армия гарнизона столицы (второй генерал). */
export const GUARD_ARMY: Record<Piece, number> = { p: 6, n: 1, b: 1, r: 0, q: 0 };

const count = (s: GameState, pid: string, kind: ResourceBuilding) =>
  Object.values(s.cells).filter((c) => c.owner === pid && c.building?.kind === kind).length;

export const aiEconomyTurn = (s: GameState, pid: string): void => {
  const p = s.players[pid];
  const capital = playerHalls(s, pid).sort((a, b) => a.order - b.order)[0];
  if (!capital) return;
  // без лесопилки дерево больше не появится: сначала лесопилка, на неё дерево не тратим
  const sawmills = count(s, pid, 'sawmill') + p.jobs.filter((j) => j.kind === 'resource' && j.building === 'sawmill').length;
  // но сначала две фермы: без еды армия разбежится, а ферму не на что будет строить
  const farms = count(s, pid, 'farm') + count(s, pid, 'fishery') + p.jobs.filter((j) => j.kind === 'resource' && (j.building === 'farm' || j.building === 'fishery')).length;
  const keepForSaw = sawmills || farms < 2 ? 0 : resourceCost(s, pid, 'sawmill', 1).wood;
  if (sawmills && capital.level < 2 && count(s, pid, 'farm') + count(s, pid, 'fishery') >= 2) upgradeTownHall(s, pid, capital.id);
  for (const h of playerHalls(s, pid)) while (hireBuilder(s, pid, h.id).ok);
  const g = playerGenerals(s, pid).sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)))[0];
  // казарма — узкое место армии: если она нужна, но не хватило ресурсов, копим на неё и не тратим на стройку
  let reserve = { wood: 0, food: 0 };
  if (g) {
    const need = Math.max(0, ...PIECES.filter((x) => g.army[x] < FULL_ARMY[x]).map((x) => HIRE_LEVEL[x]));
    const bar = capital.barracks ?? 0; // ИИ держит казарму и таверну в столице
    if (count(s, pid, 'mine') >= 1 && bar < need && !p.jobs.some((j) => j.kind === 'barracks')) {
      if (!upgradeBarracks(s, pid, capital.id).ok) reserve = BARRACKS[(bar + 1) as 1 | 2 | 3 | 4 | 5].cost;
    }
  }
  // города, где кончились места под здания, растут, если на это хватает ресурсов сверх резерва на казарму
  for (const h of playerHalls(s, pid).sort((a, b) => a.level - b.level)) {
    const sl = citySlots(s, h.id);
    if (h.level >= 3 || sl.used < sl.max || freeBuilders(s, pid, h.id) < 1) continue;
    const c = cityUpgradeCost(s, pid, (h.level + 1) as 2 | 3);
    if (p.res.wood - c.wood >= reserve.wood && p.res.food - c.food >= reserve.food) upgradeTownHall(s, pid, h.id);
  }
  const halls = new Set(Object.values(s.halls).map((h) => key(h.hex)));
  for (let guard = 0; guard < 6 && freeBuilders(s, pid) > 0; guard++) {
    const foodNet = income(s, pid).food - upkeep(s, pid);
    const have = (k: ResourceBuilding) => count(s, pid, k) + p.jobs.filter((j) => j.kind === 'resource' && j.building === k).length;
    const reserveCache = new Map<string, ResourceBuilding[]>();
    const reserveFor = (hallId: string): ResourceBuilding[] => {
      if (reserveCache.has(hallId)) return reserveCache.get(hallId)!;
      const sl = citySlots(s, hallId);
      const land = Object.values(s.cells).filter((x) => x.hall === hallId && !x.building && !x.reserved);
      const missing = (['sawmill', 'mine'] as const).filter((k) => !have(k) && land.some((x) => x.terrain === BUILDING_TERRAIN[k]));
      // золото — узкое место армии: в выросшем городе последнее место держим и под второй рудник
      if (s.halls[hallId].level >= 2 && have('mine') === 1 && land.some((x) => x.terrain === BUILDING_TERRAIN.mine)) missing.push('mine');
      const out = sl.max - sl.used <= missing.length ? [...new Set(missing)] : [];
      reserveCache.set(hallId, out);
      return out;
    };
    const full = new Set(playerHalls(s, pid).filter((h) => { const sl = citySlots(s, h.id); return sl.used >= sl.max; }).map((h) => h.id));
    let best: { score: number; run: () => void } | null = null;
    for (const c of Object.values(s.cells)) {
      if (c.owner !== pid || c.reserved || halls.has(key(c.hex))) continue;
      if (!c.hall || freeBuilders(s, pid, c.hall) < 1) continue; // строители этого города заняты
      if (c.building && p.jobs.some((j) => j.kind === 'resource' && key(j.hex) === key(c.hex))) continue;
      if (!c.building && c.hall && full.has(c.hall)) continue; // у города нет мест под новые здания
      // последние места города держим под ещё не построенные лесопилку и рудник, если для них есть земля
      const reserved = !c.building && c.hall ? reserveFor(c.hall) : [];
      for (const { kind, maxLevel } of buildOptions(s, pid, c)) {
        const level = c.building ? (c.building.kind === kind ? c.building.level + 1 : 0) : 1;
        if (!level || level > maxLevel) continue;
        if (level === 1 && reserved.length && !reserved.includes(kind)) continue;
        const cost = resourceCost(s, pid, kind, level);
        if (p.res.wood < cost.wood || p.res.food < cost.food) continue;
        const food = kind === 'farm' || kind === 'fishery';
        const hungry = food && foodNet < 10;
        // ферма окупает резерв еды на казарму быстрее, чем его копить: для неё важен только резерв дерева
        if (!hungry && (p.res.wood - cost.wood < reserve.wood || (!food && p.res.food - cost.food < reserve.food))) continue;
        if (kind !== 'sawmill' && p.res.wood - cost.wood < keepForSaw) continue;
        const gain = RESOURCE_OUTPUT[kind][level - 1] - (RESOURCE_OUTPUT[kind][level - 2] ?? 0);
        // золото в масштабе ×10 дороже еды; при большом избытке еды фермы не нужны
        // мест под здания мало: ресурс, которого и так в избытке, не строим — место нужнее под дефицитный
        const glut = food ? p.res.food > 150 && foodNet > 15 : kind === 'sawmill' && sawmills > 0 && p.res.wood > 250;
        const weight = kind === 'sawmill' && !sawmills && farms >= 2 ? 50 : kind === 'mine' ? (sawmills && have('mine') === 1 && farms >= 3 ? 15 : 6)
          : hungry ? 3 : glut ? 0 : food && foodNet > 40 ? 0.3 : 1;
        if (!weight) continue;
        // новый город сразу получает свою базу: первые постройки в нём вдвое выгоднее
        const fresh = level === 1 && c.hall !== capital.id && citySlots(s, c.hall).used < 3 ? 2 : 1;
        const score = (gain * weight * fresh) / (cost.wood + cost.food);
        const hex = c.hex;
        if (!best || score > best.score) best = { score, run: () => { level === 1 ? build(s, pid, hex, kind) : upgrade(s, pid, hex); } };
      }
    }
    if (!best) break;
    best.run();
  }
  // армии: полевая (первый генерал) и по гарнизону на каждый город, начиная со столицы.
  // Фигуры нанимаются только на земле города с казармой — гарнизоны набирают их у столицы, потом уходят к своему городу.
  const feed = (gid: string, goal: Record<Piece, number>) => {
    const x = s.generals[gid];
    for (const piece of PIECES) {
      while (x.army[piece] < goal[piece] && income(s, pid).food >= upkeep(s, pid) + PIECE_PRICE[piece] * (mods(s, pid).armyUpkeepRate ?? ARMY_UPKEEP_RATE)) {
        if (!hirePiece(s, pid, x.id, piece).ok) break;
      }
    }
  };
  const byAge = () => playerGenerals(s, pid).sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
  const MIN_GUARD: Record<Piece, number> = { p: 4, n: 0, b: 0, r: 0, q: 0 };
  for (const guard of byAge().slice(1)) feed(guard.id, MIN_GUARD); // сначала хоть какой-то гарнизон
  if (g) feed(g.id, FULL_ARMY);
  for (const guard of byAge().slice(1)) feed(guard.id, GUARD_ARMY);
  // таверна — рано: генералов нужно по одному на город плюс полевая армия (не больше 4)
  const cities = playerHalls(s, pid).length;
  const want = Math.min(5, cities + 1);
  if ((capital.barracks ?? 0) >= 1 && s.turn >= 4 && generalLimit(s, pid) < want && !p.jobs.some((j) => j.kind === 'tavern')) upgradeTavern(s, pid, capital.id);
  // новый генерал ест еду — нанимаем, только если доход еды это выдержит
  if (byAge().length < Math.min(want, generalLimit(s, pid)) && p.res.gold >= 50 && income(s, pid).food - upkeep(s, pid) >= GENERAL_UPKEEP_FOOD + 3) {
    if (hireGeneral(s, pid, capital.id).ok) { const fresh = byAge().slice(-1)[0]; feed(fresh.id, MIN_GUARD); }
  }
  if (p.res.gold >= 50) startResearch(s, pid);
  // технологии: по порядку, когда хватает золота с запасом на армию
  if (p.res.gold >= 90) for (const id of ['militia', 'march', 'quartermaster', 'fortify', 'guilds', 'veterans', 'academy'] as const) if (startTech(s, pid, id).ok || p.research.tech) break;
  // «Военная академия»: переобучаем генералов, когда золота с запасом
  for (const g of playerGenerals(s, pid)) { const tr = trainingFor(s, g.id); if (tr.steps && p.res.gold >= tr.gold + 120) trainGeneral(s, pid, g.id); }
};
