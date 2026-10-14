// Экономика: стройка и улучшения, ратуши, строители, казарма, таверна, исследования,
// доход, содержание и голод.

import {
  ARMY_UPKEEP_RATE, BARRACKS, CITY_WOOD, BUILDER_HIRE_FOOD, BUILDER_UPKEEP_FOOD, BUILD_TURNS, ELO_PER_RESEARCH,
  GENERAL_UPKEEP_FOOD, MAX_RESOURCE_LEVEL, PAWNS_REQUIRED, PIECE_PRICE, RESEARCH, RESOURCE_COST, RESOURCE_OF,
  RESOURCE_OUTPUT, TAVERN, TOWN_HALL_FOUND, TOWN_HALL_MAX_LEVEL, TOWN_HALL_UPGRADE,
  type Piece, type Res, type ResourceBuilding,
} from './config.ts';
import { type Hex, key, neighbors } from './hex.ts';
import { NATIONS, type Mods } from './nations.ts';
import {
  BUILDING_TERRAIN, PASSABLE, type Army, type Cell, type GameState, type General, type Player, cityName, newId, recomputeTerritory, say,
} from './state.ts';

export type Result = { ok: true } | { ok: false; reason: string };
const ok: Result = { ok: true };
const no = (reason: string): Result => ({ ok: false, reason });

export const mods = (s: GameState, pid: string): Mods => NATIONS[s.players[pid].nation].mods;

export const canAfford = (have: Res, cost: Res): boolean =>
  have.wood >= cost.wood && have.food >= cost.food && have.gold >= cost.gold;

const pay = (p: Player, cost: Res): void => {
  p.res.wood -= cost.wood; p.res.food -= cost.food; p.res.gold -= cost.gold;
};

const scale = (c: Res, m: number): Res => ({
  wood: Math.ceil(c.wood * m), food: Math.ceil(c.food * m), gold: Math.ceil(c.gold * m),
});

// ---------- Цены и правила с учётом бонусов наций ----------

const RES_KINDS = Object.keys(RESOURCE_COST) as ResourceBuilding[];
const nearWater = (s: GameState, hex: Hex): boolean => neighbors(hex).some((n) => s.cells[key(n)]?.terrain === 'water');
const nearLand = (s: GameState, hex: Hex): boolean => neighbors(hex).some((n) => { const c = s.cells[key(n)]; return !!c && c.terrain !== 'water'; });

/** Какие ресурсные здания нация может поставить на клетку и до какого уровня. */
export const buildOptions = (s: GameState, pid: string, cell: Cell): { kind: ResourceBuilding; maxLevel: number }[] => {
  const out = RES_KINDS.filter((k) => BUILDING_TERRAIN[k] === cell.terrain).map((kind) => ({ kind, maxLevel: MAX_RESOURCE_LEVEL }));
  for (const x of mods(s, pid).extraTerrain ?? []) {
    if (x.terrain !== cell.terrain || out.some((o) => o.kind === x.kind)) continue;
    if (x.coastal && !nearLand(s, cell.hex)) continue;
    out.push({ kind: x.kind, maxLevel: x.maxLevel });
  }
  return out;
};
export const maxLevelAt = (s: GameState, pid: string, cell: Cell, kind: ResourceBuilding): number =>
  buildOptions(s, pid, cell).find((o) => o.kind === kind)?.maxLevel ?? 0;

/** Цена постройки (level 1) или улучшения ресурсного здания до level. */
export const resourceCost = (s: GameState, pid: string, kind: ResourceBuilding, level: number): Res => {
  const m = mods(s, pid);
  return scale(RESOURCE_COST[kind][level - 1], (m.buildCostMult?.[kind] ?? 1) * (level >= 2 ? m.upgradeCostMult?.[kind] ?? 1 : 1));
};
export const barracksCost = (s: GameState, pid: string, level: 1 | 2 | 3 | 4 | 5): Res => scale(BARRACKS[level].cost, mods(s, pid).barracksCostMult ?? 1);
export const researchCost = (s: GameState, pid: string, step: number): Res => scale(RESEARCH[step].cost, mods(s, pid).researchCostMult ?? 1);
export const researchTurns = (s: GameState, pid: string, step: number): number => Math.max(1, RESEARCH[step].turns - (mods(s, pid).researchTurnsMinus ?? 0));
export const piecePrice = (s: GameState, pid: string, piece: Piece): number => mods(s, pid).piecePrice?.[piece] ?? PIECE_PRICE[piece];

/** Выработка одного ресурсного здания с бонусами нации. */
export const buildingOutput = (s: GameState, pid: string, cell: Cell): Res => {
  const out: Res = { wood: 0, food: 0, gold: 0 };
  if (!cell.building) return out;
  const { kind, level } = cell.building;
  const m = mods(s, pid);
  out[RESOURCE_OF[kind]] += RESOURCE_OUTPUT[kind][level - 1];
  for (const b of m.output ?? []) if (b.kind === kind && level >= b.from && level <= b.to) out[b.res] += b.amount;
  if (m.farmNearWater && kind === 'farm' && cell.terrain === 'field' && nearWater(s, cell.hex)) out.food += m.farmNearWater;
  return out;
};

/** Цена улучшения города до уровня level с учётом бонуса нации. */
export const cityUpgradeCost = (s: GameState, pid: string, level: 2 | 3): Res =>
  scale(TOWN_HALL_UPGRADE[level].cost, 1 - (mods(s, pid).upgradeDiscount ?? 0));
/** Цена таверны уровня level с учётом бонуса нации. */
export const tavernCost = (s: GameState, pid: string, level: 1 | 2 | 3 | 4): Res =>
  scale(TAVERN[level].cost, 1 - (mods(s, pid).upgradeDiscount ?? 0));

// ---------- Строители ----------

/** Стройки, которые занимают строителя (основание ратуши ведёт генерал, а не строитель). */
export const busyBuilders = (p: Player): number => p.jobs.filter((j) => j.kind !== 'found').length;
export const freeBuilders = (p: Player): number => p.builders - busyBuilders(p);

export const playerHalls = (s: GameState, pid: string) => Object.values(s.halls).filter((h) => h.owner === pid);

/** Предел строителей задаёт самая высокая ратуша страны. */
export const maxBuilders = (s: GameState, pid: string): number =>
  Math.min(TOWN_HALL_MAX_LEVEL, Math.max(0, ...playerHalls(s, pid).map((h) => h.level)));

export const hireBuilder = (s: GameState, pid: string): Result => {
  const p = s.players[pid];
  const n = p.builders + 1;
  if (n > maxBuilders(s, pid)) return no('upgrade your city first');
  const food = mods(s, pid).freeBuilderHire ? 0 : BUILDER_HIRE_FOOD[n as 2 | 3];
  if (p.res.food < food) return no('not enough food');
  p.res.food -= food;
  p.builders = n;
  say(s, `builder ${n} hired`, pid);
  return ok;
};

// ---------- Ресурсные здания ----------

const turnsFor = (s: GameState, pid: string, level: number): number => {
  const base = BUILD_TURNS[level - 1];
  const minus = level >= 4 ? (mods(s, pid).highUpgradeTurnsMinus ?? 0) : 0;
  return Math.max(1, base - minus);
};

const isHallCell = (s: GameState, hex: Hex): boolean =>
  Object.values(s.halls).some((h) => h.hex.q === hex.q && h.hex.r === hex.r);

export const build = (s: GameState, pid: string, hex: Hex, kind: ResourceBuilding): Result => {
  const p = s.players[pid];
  const c = s.cells[key(hex)];
  if (!c) return no('no such cell');
  if (c.owner !== pid) return no('this land is not yours');
  if (!maxLevelAt(s, pid, c, kind)) return no('wrong terrain for this building');
  if (c.building || c.reserved || isHallCell(s, hex)) return no('the cell is taken');
  if (freeBuilders(p) < 1) return no('no free builder');
  const cost = resourceCost(s, pid, kind, 1);
  if (!canAfford(p.res, cost)) return no('not enough resources');
  pay(p, cost);
  c.reserved = true;
  p.jobs.push({ kind: 'resource', hex, building: kind, level: 1, finish: s.turn + turnsFor(s, pid, 1) });
  return ok;
};

export const upgrade = (s: GameState, pid: string, hex: Hex): Result => {
  const p = s.players[pid];
  const c = s.cells[key(hex)];
  if (!c?.building || c.owner !== pid) return no('no building of yours here');
  if (c.building.level >= Math.min(MAX_RESOURCE_LEVEL, maxLevelAt(s, pid, c, c.building.kind) || MAX_RESOURCE_LEVEL)) return no('already at the top level');
  if (p.jobs.some((j) => j.kind === 'resource' && key(j.hex) === key(hex))) return no('already being upgraded');
  if (freeBuilders(p) < 1) return no('no free builder');
  const level = c.building.level + 1;
  const cost = resourceCost(s, pid, c.building.kind, level);
  if (!canAfford(p.res, cost)) return no('not enough resources');
  pay(p, cost);
  p.jobs.push({ kind: 'resource', hex, building: c.building.kind, level, finish: s.turn + turnsFor(s, pid, level) });
  return ok;
};

// ---------- Ратуши ----------

export const upgradeTownHall = (s: GameState, pid: string, hallId: string): Result => {
  const p = s.players[pid];
  const h = s.halls[hallId];
  if (!h || h.owner !== pid) return no('not your city');
  if (h.level >= TOWN_HALL_MAX_LEVEL) return no('already at the top level');
  if (p.jobs.some((j) => j.kind === 'townhall' && j.hallId === hallId)) return no('already being upgraded');
  if (freeBuilders(p) < 1) return no('no free builder');
  const u = TOWN_HALL_UPGRADE[(h.level + 1) as 2 | 3];
  const cost = cityUpgradeCost(s, pid, (h.level + 1) as 2 | 3);
  if (!canAfford(p.res, cost)) return no('not enough resources');
  pay(p, cost);
  p.jobs.push({ kind: 'townhall', hallId, level: h.level + 1, finish: s.turn + u.turns });
  return ok;
};

/** Основать ратушу на ничейной клетке, где стоит генерал. Армия в этот ход не атакует. */
export const foundTownHall = (s: GameState, pid: string, generalId: string): Result => {
  const p = s.players[pid];
  const g = s.generals[generalId];
  if (!g || g.owner !== pid) return no('not your general');
  if (g.attacked) return no('this army has already acted this turn');
  const c = s.cells[key(g.hex)];
  if (!c || !PASSABLE[c.terrain]) return no('you cannot build here');
  if (c.owner) return no('this land already belongs to someone');
  if (p.jobs.some((j) => j.kind === 'found' && key(j.hex) === key(g.hex))) return no('a city is already being founded here');
  const m = mods(s, pid);
  const cost = scale(TOWN_HALL_FOUND.cost, m.townHallFoundCostMult ?? 1);
  if (!canAfford(p.res, cost)) return no('not enough resources');
  pay(p, cost);
  g.attacked = true;
  p.jobs.push({ kind: 'found', hex: { ...g.hex }, general: g.id, finish: s.turn + (m.townHallFoundTurns ?? TOWN_HALL_FOUND.turns) });
  return ok;
};

// ---------- Казарма и таверна ----------

export const upgradeBarracks = (s: GameState, pid: string): Result => {
  const p = s.players[pid];
  if (p.barracks >= 5) return no('already at the top level');
  if (p.jobs.some((j) => j.kind === 'barracks')) return no('already under construction');
  if (freeBuilders(p) < 1) return no('no free builder');
  const level = p.barracks + 1;
  const b = BARRACKS[level as 1 | 2 | 3 | 4 | 5];
  const cost = barracksCost(s, pid, level as 1 | 2 | 3 | 4 | 5);
  if (!canAfford(p.res, cost)) return no('not enough resources');
  pay(p, cost);
  p.jobs.push({ kind: 'barracks', level, finish: s.turn + b.turns });
  return ok;
};

export const upgradeTavern = (s: GameState, pid: string): Result => {
  const p = s.players[pid];
  if (p.tavern >= 4) return no('already at the top level');
  if (p.jobs.some((j) => j.kind === 'tavern')) return no('already under construction');
  if (freeBuilders(p) < 1) return no('no free builder');
  const level = p.tavern + 1;
  const t = TAVERN[level as 1 | 2 | 3 | 4];
  const cost = tavernCost(s, pid, level as 1 | 2 | 3 | 4);
  if (!canAfford(p.res, cost)) return no('not enough resources');
  pay(p, cost);
  p.jobs.push({ kind: 'tavern', level, finish: s.turn + t.turns });
  return ok;
};

// ---------- Исследования «Тактика» ----------

export const startResearch = (s: GameState, pid: string): Result => {
  const p = s.players[pid];
  if (p.research.active) return no('research is already in progress');
  const step = p.research.done;
  if (step >= RESEARCH.length) return no('all Tactics research is done');
  const cost = researchCost(s, pid, step);
  if (!canAfford(p.res, cost)) return no('not enough resources');
  pay(p, cost);
  p.research.active = { step, finish: s.turn + researchTurns(s, pid, step) };
  return ok;
};

/** ELO, с которым придёт следующий нанятый генерал. */
export const recruitElo = (s: GameState, pid: string): number =>
  s.settings.elo + s.players[pid].research.done * ELO_PER_RESEARCH;

// ---------- Доход, содержание, голод ----------

export const armyValue = (a: Army): number =>
  (Object.keys(a) as Piece[]).reduce((sum, p) => sum + a[p] * PIECE_PRICE[p], 0);

export const playerGenerals = (s: GameState, pid: string): General[] =>
  Object.values(s.generals).filter((g) => g.owner === pid);

export const income = (s: GameState, pid: string): Res => {
  const inc: Res = { wood: 0, food: 0, gold: 0 };
  for (const c of Object.values(s.cells)) {
    if (c.owner !== pid || !c.building) continue;
    const o = buildingOutput(s, pid, c);
    inc.wood += o.wood; inc.food += o.food; inc.gold += o.gold;
  }
  inc.wood += CITY_WOOD * playerHalls(s, pid).length; // базовый доход города
  const perCity = mods(s, pid).goldPerCity ?? 0;
  if (perCity) inc.gold += perCity * Math.max(0, playerHalls(s, pid).length - 1);
  return inc;
};

export const upkeep = (s: GameState, pid: string): number => {
  const p = s.players[pid];
  const gens = playerGenerals(s, pid);
  const rate = mods(s, pid).armyUpkeepRate ?? ARMY_UPKEEP_RATE;
  const army = Math.ceil(gens.reduce((sum, g) => sum + armyValue(g.army), 0) * rate);
  const builderFood = mods(s, pid).freeBuilderUpkeep ? 0 : BUILDER_UPKEEP_FOOD;
  return army + (p.builders - 1) * builderFood + Math.max(0, gens.length - 1) * GENERAL_UPKEEP_FOOD;
};

/** Какую фигуру армия теряет следующей при голоде, не нарушая правило строя:
 *  ферзь → ладьи → лишние пешки → слоны → лишние пешки → кони → пешки. */
export const nextDeserter = (a: Army): Piece | null => {
  if (a.q > 0) return 'q';
  if (a.r > 0) return 'r';
  const need = Math.max(a.b > 0 ? PAWNS_REQUIRED.b : 0, a.n > 0 ? PAWNS_REQUIRED.n : 0);
  if (a.p > need) return 'p';
  if (a.b > 0) return 'b';
  if (a.n > 0) return 'n';
  return a.p > 0 ? 'p' : null;
};

const famine = (s: GameState, pid: string, foodIncome: number): void => {
  const p = s.players[pid];
  const lost: string[] = [];
  while (upkeep(s, pid) > foodIncome) {
    const g = playerGenerals(s, pid)
      .filter((x) => nextDeserter(x.army))
      .sort((a, b) => armyValue(b.army) - armyValue(a.army))[0];
    if (g) {
      const piece = nextDeserter(g.army)!;
      g.army[piece]--;
      lost.push(piece);
      continue;
    }
    if (p.builders > 1) { p.builders--; lost.push('builder'); continue; }
    break; // последний строитель и генералы не уходят никогда
  }
  if (lost.length) say(s, `famine: lost ${lost.join(', ')}`, pid);
};

/** Завершить стройки и исследования, срок которых наступил (начало хода игрока). */
export const completeJobs = (s: GameState, pid: string): void => {
  const p = s.players[pid];
  for (const j of p.jobs.filter((x) => x.finish <= s.turn)) {
    p.jobs.splice(p.jobs.indexOf(j), 1);
    if (j.kind === 'resource') {
      const c = s.cells[key(j.hex)];
      if (j.level === 1) { c.reserved = false; if (c.owner === pid) c.building = { kind: j.building, level: 1 }; }
      else if (c.building && c.owner === pid) c.building.level = j.level;
    } else if (j.kind === 'townhall') {
      const h = s.halls[j.hallId];
      if (h && h.owner === pid) { h.level = j.level; recomputeTerritory(s); }
    } else if (j.kind === 'found') {
      const c = s.cells[key(j.hex)];
      if (c && !c.owner) {
        const id = newId(s, 'h');
        const name = cityName(s, pid);
        s.halls[id] = { id, name, hex: j.hex, owner: pid, level: 1, order: s.nextId };
        recomputeTerritory(s);
        say(s, `${name} is founded`, pid);
      }
    } else if (j.kind === 'barracks') p.barracks = j.level;
    else if (j.kind === 'tavern') p.tavern = j.level;
  }
  const r = p.research.active;
  if (r && r.finish <= s.turn) { p.research.done = r.step + 1; p.research.active = undefined; }
};

/** Конец хода игрока: доход минус содержание; при нехватке еды — голод. */
export const settleEconomy = (s: GameState, pid: string): void => {
  const p = s.players[pid];
  const inc = income(s, pid);
  p.res.wood += inc.wood;
  p.res.gold += inc.gold;
  p.res.food += inc.food - upkeep(s, pid);
  if (p.res.food < 0) {
    p.res.food = 0;
    famine(s, pid, inc.food);
  }
  p.res.food = Math.round(p.res.food * 100) / 100;
};
