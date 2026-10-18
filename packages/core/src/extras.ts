// Постройки второй волны и управление стройками:
//   • Стены — город держит осаду на ход дольше (и против разбойников тоже), ELO не дают.
//   • Рынок — обмен ресурсов; чем выше уровень лучшего рынка страны, тем выгоднее курс.
//   • Сторожевая башня — на клетке поля, пустыни или тундры (занимает место под здание), видно на 4 клетки вокруг.
//   • Дороги — от своего города к своему: по дороге армия проходит на клетку дальше.
//   • Отмена стройки (ресурсы возвращаются) и снос любого ресурсного здания или башни.

import { type Res } from './config.ts';
import {
  barracksCost, buildTurns, canAfford, cityUpgradeCost, citySlots, freeBuilders, playerHalls, resourceCost, tavernCost,
} from './economy.ts';
import { type Hex, key, neighbors } from './hex.ts';
import { type GameState, type Job, PASSABLE, hasWonder, say } from './state.ts';
import { WONDER, WONDERS, type WonderId } from './wonders.ts';
import { NATIONS } from './nations.ts';
import { allied, atWar, isNation } from './diplomacy.ts';

type Result = { ok: true } | { ok: false; reason: string };
const ok: Result = { ok: true };
const no = (reason: string): Result => ({ ok: false, reason });
const res = (wood: number, food: number, gold = 0): Res => ({ wood, food, gold });
const pay = (have: Res, c: Res) => { have.wood -= c.wood; have.food -= c.food; have.gold -= c.gold; };
const refund = (have: Res, c: Res) => { have.wood += c.wood; have.food += c.food; have.gold += c.gold; };

export const WALLS = { cost: res(60, 40), turns: 2 };
export const MARKET: Record<1 | 2 | 3, { cost: Res; turns: number; rate: number }> = {
  1: { cost: res(50, 20), turns: 1, rate: 2 },
  2: { cost: res(80, 40, 20), turns: 2, rate: 1.6 },
  3: { cost: res(120, 60, 40), turns: 2, rate: 1.25 },
};
export const TOWER = { cost: res(40, 20), turns: 1, sight: 4 };
export const TOWER_TERRAIN = ['field', 'desert', 'tundra'];
export const ROAD_WOOD_PER_CELL = 8;
export const ROAD_MAX = 18;

const ownHall = (s: GameState, pid: string, hallId: string) => { const h = s.halls[hallId]; return h && h.owner === pid ? h : undefined; };

// ---------- стены ----------
export const buildWalls = (s: GameState, pid: string, hallId: string): Result => {
  const p = s.players[pid], h = ownHall(s, pid, hallId);
  if (!h) return no('not your city');
  if (h.walls) return no('the city already has walls');
  if (p.jobs.some((j) => j.kind === 'walls' && j.hallId === hallId)) return no('already under construction');
  if (freeBuilders(s, pid, hallId) < 1) return no(`all builders of ${h.name} are busy`);
  if (!canAfford(p.res, WALLS.cost)) return no('not enough resources');
  pay(p.res, WALLS.cost);
  p.jobs.push({ kind: 'walls', hallId, level: 1, finish: s.turn + buildTurns(s, pid, WALLS.turns) });
  return ok;
};

// ---------- рынок ----------
export const upgradeMarket = (s: GameState, pid: string, hallId: string): Result => {
  const p = s.players[pid], h = ownHall(s, pid, hallId);
  if (!h) return no('not your city');
  const level = (h.market ?? 0) + 1;
  if (level > 3) return no('already at the top level');
  if (p.jobs.some((j) => j.kind === 'market' && j.hallId === hallId)) return no('already under construction');
  if (freeBuilders(s, pid, hallId) < 1) return no(`all builders of ${h.name} are busy`);
  const m = MARKET[level as 1 | 2 | 3];
  if (!canAfford(p.res, m.cost)) return no('not enough resources');
  pay(p.res, m.cost);
  p.jobs.push({ kind: 'market', hallId, level, finish: s.turn + buildTurns(s, pid, m.turns) });
  return ok;
};
/** Уровень лучшего рынка страны (0 — рынка нет). */
export const marketLevel = (s: GameState, pid: string): number => Math.max(0, ...playerHalls(s, pid).map((h) => h.market ?? 0));
/** Курс обмена: по лучшему рынку; «Шёлковый путь» — 1:1 даже без рынка. 0 — торговать негде. */
export const tradeRate = (s: GameState, pid: string): number => hasWonder(s, pid, 'silkroad') ? 1 : marketLevel(s, pid) ? MARKET[marketLevel(s, pid) as 1 | 2 | 3].rate : 0;
/** Ценность ресурса при обмене: золото втрое дороже дерева и еды. */
const VALUE: Record<keyof Res, number> = { wood: 1, food: 1, gold: 3 };
/** Сколько получишь за amount ресурса from в ресурсе to по курсу лучшего рынка. */
export const tradeQuote = (s: GameState, pid: string, from: keyof Res, to: keyof Res, amount: number): number => {
  const rate = tradeRate(s, pid);
  if (!rate || from === to || amount <= 0) return 0;
  return Math.floor((amount * VALUE[from]) / VALUE[to] / rate);
};
export const trade = (s: GameState, pid: string, from: keyof Res, to: keyof Res, amount: number): Result => {
  const p = s.players[pid];
  if (!tradeRate(s, pid)) return no('build a market first');
  if (amount <= 0 || p.res[from] < amount) return no(`not enough ${from}`);
  const get = tradeQuote(s, pid, from, to, amount);
  if (get <= 0) return no('too little to trade');
  p.res[from] -= amount;
  p.res[to] += get;
  say(s, `market: ${amount} ${from} → ${get} ${to}`, pid);
  return ok;
};

// ---------- сторожевая башня ----------
export const buildTower = (s: GameState, pid: string, hex: Hex): Result => {
  const p = s.players[pid];
  const c = s.cells[key(hex)];
  if (!c || c.owner !== pid || !c.hall) return no('this land is not yours');
  if (!TOWER_TERRAIN.includes(c.terrain)) return no('a tower stands only on field, desert or tundra');
  if (c.building || c.reserved || c.tower || key(s.halls[c.hall].hex) === key(hex)) return no('the cell is taken');
  const sl = citySlots(s, c.hall);
  if (sl.used >= sl.max) return no(`${s.halls[c.hall].name} has no free building slots`);
  if (freeBuilders(s, pid, c.hall) < 1) return no(`all builders of ${s.halls[c.hall].name} are busy`);
  if (!canAfford(p.res, TOWER.cost)) return no('not enough resources');
  pay(p.res, TOWER.cost);
  c.reserved = true;
  p.jobs.push({ kind: 'tower', hex: { ...hex }, finish: s.turn + buildTurns(s, pid, TOWER.turns) });
  return ok;
};

// ---------- дороги ----------
/** Путь дороги между двумя своими городами: по проходимой своей или ничьей земле, кратчайший. */
export const roadPath = (s: GameState, pid: string, fromHall: string, toHall: string): Hex[] | null => {
  const a = s.halls[fromHall], b = s.halls[toHall];
  if (!a || !b || a.owner !== pid || b.owner !== pid) return null;
  const goal = key(b.hex);
  const prev = new Map<string, string | null>([[key(a.hex), null]]);
  const q: Hex[] = [a.hex];
  while (q.length) {
    const cur = q.shift()!;
    if (key(cur) === goal) break;
    for (const n of neighbors(cur)) {
      const k = key(n), c = s.cells[k];
      if (prev.has(k) || !c || !PASSABLE[c.terrain] || (c.owner && c.owner !== pid)) continue;
      prev.set(k, key(cur)); q.push(n);
    }
  }
  if (!prev.has(goal)) return null;
  const path: Hex[] = [];
  for (let k: string | null = goal; k; k = prev.get(k) ?? null) { const [qq, r] = k.split(',').map(Number); path.unshift({ q: qq, r }); }
  return path;
};
/** Два города уже связаны дорогой (готовой — по клеткам с дорогой — или строящейся в любую сторону). */
export const roadLinked = (s: GameState, a: string, b: string): boolean => {
  if (Object.values(s.players).some((p) => p.jobs.some((j) => j.kind === 'road' && ((j.hallId === a && j.to === b) || (j.hallId === b && j.to === a))))) return true;
  const ha = s.halls[a], hb = s.halls[b];
  if (!ha || !hb || !s.cells[key(ha.hex)]?.road) return false;
  const goal = key(hb.hex);
  const seen = new Set([key(ha.hex)]);
  const q = [ha.hex];
  while (q.length) {
    const cur = q.shift()!;
    if (key(cur) === goal) return true;
    for (const n of neighbors(cur)) { const k = key(n); if (!seen.has(k) && s.cells[k]?.road) { seen.add(k); q.push(n); } }
  }
  return false;
};
export const roadCost = (s: GameState, path: Hex[]): Res => res(path.filter((h) => !s.cells[key(h)].road).length * ROAD_WOOD_PER_CELL, 0);
export const buildRoad = (s: GameState, pid: string, fromHall: string, toHall: string): Result => {
  const p = s.players[pid];
  const path = roadPath(s, pid, fromHall, toHall);
  if (!path) return no('no way for a road between these cities');
  if (path.length - 1 > ROAD_MAX) return no(`too long for a road (${path.length - 1} cells, at most ${ROAD_MAX})`);
  if (roadLinked(s, fromHall, toHall) || path.every((h) => s.cells[key(h)].road)) return no('these cities are already linked by road');
  if (p.jobs.some((j) => j.kind === 'road' && j.hallId === fromHall)) return no('a road is already being built from here');
  if (freeBuilders(s, pid, fromHall) < 1) return no(`all builders of ${s.halls[fromHall].name} are busy`);
  const c = roadCost(s, path);
  if (!canAfford(p.res, c)) return no('not enough wood');
  pay(p.res, c);
  p.jobs.push({ kind: 'road', hallId: fromHall, to: toHall, cells: path.map(key), finish: s.turn + Math.max(1, Math.ceil((path.length - 1) / 6)) });
  return ok;
};

// ---------- завершение, отмена, снос ----------
/** Завершить стройку второй волны (вызывается из completeJobs). */
export const completeExtra = (s: GameState, pid: string, j: Job): void => {
  if (j.kind === 'walls') { const h = s.halls[j.hallId]; if (h?.owner === pid) { h.walls = 1; say(s, `walls stand around ${h.name}`, pid); } }
  else if (j.kind === 'market') { const h = s.halls[j.hallId]; if (h?.owner === pid) { h.market = j.level; say(s, `market level ${j.level} opens in ${h.name}`, pid); } }
  else if (j.kind === 'tower') { const c = s.cells[key(j.hex)]; c.reserved = false; if (c.owner === pid) { c.tower = true; say(s, 'watchtower built', pid); } }
  else if (j.kind === 'road') { for (const k of j.cells) if (s.cells[k]) s.cells[k].road = true; say(s, `road to ${s.halls[j.to]?.name ?? 'the city'} built`, pid); }
};

/** Сколько стоила стройка (для возврата при отмене). */
const jobCost = (s: GameState, pid: string, j: Job): Res | null => {
  switch (j.kind) {
    case 'resource': return resourceCost(s, pid, j.building, j.level);
    case 'townhall': return cityUpgradeCost(s, pid, j.level as 2 | 3);
    case 'barracks': return barracksCost(s, pid, j.level as 1 | 2 | 3 | 4 | 5);
    case 'tavern': return tavernCost(s, pid, j.level as 1 | 2 | 3 | 4);
    case 'walls': return WALLS.cost;
    case 'market': return MARKET[j.level as 1 | 2 | 3].cost;
    case 'tower': return TOWER.cost;
    case 'road': return res(j.cells.filter((k) => !s.cells[k]?.road).length * ROAD_WOOD_PER_CELL, 0);
    case 'wonder': return WONDER.cost;
    case 'searoute': return res(j.cells.length * 6, 0);
    default: return null; // основание города отменить нельзя
  }
};
/** Отменить идущую стройку: ресурсы возвращаются полностью, строитель свободен. */
export const cancelJob = (s: GameState, pid: string, index: number): Result => {
  const p = s.players[pid];
  const j = p.jobs[index];
  if (!j) return no('no such construction');
  const c = jobCost(s, pid, j);
  if (!c) return no('this cannot be cancelled');
  p.jobs.splice(index, 1);
  refund(p.res, c);
  if (j.kind === 'wonder') { p.wonder = undefined; for (const o of Object.values(s.players)) if (o.id !== pid && o.alive) say(s, `${NATIONS[p.nation].name} stopped building the ${WONDERS[j.wonder as WonderId].name}`, o.id); }
  if ((j.kind === 'resource' && j.level === 1) || j.kind === 'tower') s.cells[key(j.hex)].reserved = false;
  say(s, 'construction cancelled, resources returned', pid);
  return ok;
};
/** Во что обошлось здание на клетке (все уровни) или башня — для сноса и грабежа. */
export const buildingValue = (s: GameState, hex: Hex): Res => {
  const c = s.cells[key(hex)];
  if (c?.tower) return { ...TOWER.cost };
  if (!c?.building || !c.owner || !s.players[c.owner]) return res(0, 0);
  const t = res(0, 0);
  for (let l = 1; l <= c.building.level; l++) refund(t, resourceCost(s, c.owner, c.building.kind, l));
  return t;
};
const part = (r: Res, k: number): Res => res(Math.floor(r.wood * k), Math.floor(r.food * k), Math.floor(r.gold * k));
/** Сколько вернёт снос (половина вложенного). */
export const demolishRefund = (s: GameState, hex: Hex): Res => part(buildingValue(s, hex), 1 / 2);
/** Сколько даст грабёж (треть вложенного). */
export const pillageLoot = (s: GameState, hex: Hex): Res => part(buildingValue(s, hex), 1 / 3);

/** Может ли генерал разграбить клетку, на которой стоит: чужое здание или башня страны, с которой война. */
export const canPillage = (s: GameState, gid: string): Result => {
  const g = s.generals[gid];
  if (!g || g.settler || g.camp) return no('only a general can pillage');
  const c = s.cells[key(g.hex)];
  if (!c || (!c.building && !c.tower) || !c.owner || c.owner === g.owner) return no('nothing to pillage here');
  if (!s.players[c.owner]) return no('nothing to pillage here');
  if (allied(s, g.owner, c.owner) || (isNation(s, g.owner) && isNation(s, c.owner) && !atWar(s, g.owner, c.owner))) return no('you are not at war');
  if (g.attacked) return no('the general has already fought this turn');
  return ok;
};
/** Разграбить: здание разрушено, треть его цены достаётся грабителю, генерал на этот ход больше не ходит и не бьётся. */
export const pillage = (s: GameState, gid: string): Result => {
  const r = canPillage(s, gid);
  if (!r.ok) return r;
  const g = s.generals[gid];
  const c = s.cells[key(g.hex)];
  const loot = pillageLoot(s, g.hex);
  const victim = c.owner!;
  const what = c.building ? c.building.kind : 'watchtower';
  const vp = s.players[victim];
  vp.jobs = vp.jobs.filter((j) => !((j.kind === 'resource' || j.kind === 'tower') && key(j.hex) === key(g.hex)));
  vp.queue = vp.queue?.filter((q) => !(q.job.kind === 'resource' && key(q.job.hex) === key(g.hex)));
  c.building = undefined; c.tower = undefined; c.reserved = false;
  const gp = s.players[g.owner];
  if (gp) refund(gp.res, loot);
  g.moveLeft = 0; g.attacked = true;
  const txt = [loot.wood && `${loot.wood} wood`, loot.food && `${loot.food} food`, loot.gold && `${loot.gold} gold`].filter(Boolean).join(', ') || 'nothing';
  say(s, `${g.name} pillaged a ${what}: ${txt}`, g.owner);
  say(s, `the enemy pillaged our ${what}`, victim);
  return ok;
};

/** Снести ресурсное здание или башню: место освобождается, возвращается половина вложенного. */
export const demolish = (s: GameState, pid: string, hex: Hex): Result => {
  const p = s.players[pid];
  const c = s.cells[key(hex)];
  if (!c || c.owner !== pid || (!c.building && !c.tower)) return no('nothing of yours to demolish here');
  if (p.jobs.some((j) => (j.kind === 'resource' || j.kind === 'tower') && key(j.hex) === key(hex))) return no('cancel the work on it first');
  p.queue = p.queue?.filter((q) => !(q.job.kind === 'resource' && key(q.job.hex) === key(hex)));
  const what = c.building ? c.building.kind : 'watchtower';
  refund(p.res, demolishRefund(s, hex));
  c.building = undefined;
  c.tower = undefined;
  say(s, `${what} demolished, half of the cost returned`, pid);
  return ok;
};
