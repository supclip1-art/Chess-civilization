// Экономика: стройка и улучшения, ратуши, строители, казарма, таверна, исследования,
// доход, содержание и голод.

import {
  ARMY_MOVE, ARMY_MOVE_MARCH, TECHS, type TechId, ARMY_UPKEEP_RATE, BARRACKS, BUILDING_SLOTS, CITY_WOOD, BUILDER_HIRE_FOOD, BUILDER_UPKEEP_FOOD, BUILD_TURNS, ELO_PER_RESEARCH,
  GENERAL_UPKEEP_FOOD, MAX_RESOURCE_LEVEL, PAWNS_REQUIRED, PIECE_PRICE, RESEARCH, RESOURCE_COST, RESOURCE_OF,
  RESOURCE_OUTPUT, TAVERN, TOWN_HALL_FOUND, TOWN_HALL_MAX_LEVEL, TOWN_HALL_UPGRADE,
  type Piece, type Res, type ResourceBuilding,
} from './config.ts';
import { type Hex, key, neighbors } from './hex.ts';
import { freeCellNear } from './map.ts';
import { NATIONS, type Mods } from './nations.ts';
import {
  BUILDING_TERRAIN, PASSABLE, makeGeneral, type Army, type Cell, type GameState, type General, type Job, type Player, cityName, newId, recomputeTerritory, say,
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
export const piecePrice = (s: GameState, pid: string, piece: Piece): number => {
  const base = mods(s, pid).piecePrice?.[piece] ?? PIECE_PRICE[piece];
  if (piece === 'p' && hasTech(s, pid, 'militia')) return Math.round(base * 0.8); // «Ополчение»
  if ((piece === 'n' || piece === 'b') && hasTech(s, pid, 'cavalry')) return Math.round(base * 0.75); // «Кавалерия»
  return base;
};

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
/** Строители у каждого города свои (по умолчанию один). */
export const hallBuilders = (h: { builders?: number }): number => h.builders ?? 1;

/** Город, чей строитель занят этой стройкой (основание города ведёт поселенец — строитель не нужен). */
export const jobHall = (s: GameState, j: Job): string | undefined =>
  j.kind === 'resource' ? s.cells[key(j.hex)]?.hall : j.kind === 'found' ? undefined : j.hallId;

export const busyBuilders = (s: GameState, pid: string, hallId: string): number =>
  s.players[pid].jobs.filter((j) => jobHall(s, j) === hallId).length;
/** Свободные строители города; без hallId — всех городов игрока вместе. */
export const freeBuilders = (s: GameState, pid: string, hallId?: string): number => {
  if (hallId) { const h = s.halls[hallId]; return h && h.owner === pid ? hallBuilders(h) - busyBuilders(s, pid, hallId) : 0; }
  return playerHalls(s, pid).reduce((n, h) => n + Math.max(0, hallBuilders(h) - busyBuilders(s, pid, h.id)), 0);
};
const noBuilder = (s: GameState, hallId?: string) => no(`all builders of ${hallId ? s.halls[hallId]?.name ?? 'this city' : 'this city'} are busy`);

export const playerHalls = (s: GameState, pid: string) => Object.values(s.halls).filter((h) => h.owner === pid);

/** Предел строителей города — его уровень. Без hallId — столица. */
export const maxBuilders = (s: GameState, pid: string, hallId?: string): number => {
  const h = hallId ? s.halls[hallId] : playerHalls(s, pid).sort((a, b) => a.order - b.order)[0];
  return h ? Math.min(TOWN_HALL_MAX_LEVEL, h.level) : 0;
};

/** Нанять строителя в город (без hallId — в первый город, где есть место). */
export const hireBuilder = (s: GameState, pid: string, hallId?: string): Result => {
  const p = s.players[pid];
  const h = hallId ? s.halls[hallId] : playerHalls(s, pid).sort((a, b) => a.order - b.order).find((x) => hallBuilders(x) < Math.min(TOWN_HALL_MAX_LEVEL, x.level));
  if (!h || h.owner !== pid) return no(hallId ? 'not your city' : 'upgrade a city first');
  const n = hallBuilders(h) + 1;
  if (n > maxBuilders(s, pid, h.id)) return no(`${h.name} needs a higher level for another builder`);
  const food = mods(s, pid).freeBuilderHire ? 0 : BUILDER_HIRE_FOOD[n as 2 | 3];
  if (p.res.food < food) return no('not enough food');
  p.res.food -= food;
  h.builders = n;
  say(s, `builder ${n} hired in ${h.name}`, pid);
  startQueued(s, pid);
  return ok;
};

// ---------- Ресурсные здания ----------

const turnsFor = (s: GameState, pid: string, level: number): number => {
  const base = BUILD_TURNS[level - 1];
  const minus = level >= 4 ? (mods(s, pid).highUpgradeTurnsMinus ?? 0) : 0;
  return buildTurns(s, pid, Math.max(1, base - minus));
};

const isHallCell = (s: GameState, hex: Hex): boolean =>
  Object.values(s.halls).some((h) => h.hex.q === hex.q && h.hex.r === hex.r);

/** Места под ресурсные здания у города: занято (здания и стройки на его земле) и всего (по уровню). */
export const citySlots = (s: GameState, hallId: string): { used: number; max: number } => {
  const h = s.halls[hallId];
  const used = Object.values(s.cells).filter((c) => c.hall === hallId && (c.building || c.reserved)).length;
  return { used, max: h ? BUILDING_SLOTS[Math.min(h.level, BUILDING_SLOTS.length) - 1] + (s.players[h.owner] && hasTech(s, h.owner, 'guilds') ? 1 : 0) : 0 };
};

export const build = (s: GameState, pid: string, hex: Hex, kind: ResourceBuilding): Result => {
  const p = s.players[pid];
  const c = s.cells[key(hex)];
  if (!c) return no('no such cell');
  if (c.owner !== pid) return no('this land is not yours');
  if (!maxLevelAt(s, pid, c, kind)) return no('wrong terrain for this building');
  if (c.building || c.reserved || isHallCell(s, hex)) return no('the cell is taken');
  if (c.hall) {
    const sl = citySlots(s, c.hall);
    if (sl.used >= sl.max) return no(`${s.halls[c.hall].name} has no free building slots (${sl.used}/${sl.max}): upgrade the city or found a new one`);
  }
  if (!c.hall || freeBuilders(s, pid, c.hall) < 1) return noBuilder(s, c.hall);
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
  if (!c.hall || freeBuilders(s, pid, c.hall) < 1) return noBuilder(s, c.hall);
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
  if (freeBuilders(s, pid, hallId) < 1) return noBuilder(s, hallId);
  const u = TOWN_HALL_UPGRADE[(h.level + 1) as 2 | 3];
  const cost = cityUpgradeCost(s, pid, (h.level + 1) as 2 | 3);
  if (!canAfford(p.res, cost)) return no('not enough resources');
  pay(p, cost);
  p.jobs.push({ kind: 'townhall', hallId, level: h.level + 1, finish: s.turn + buildTurns(s, pid, u.turns) });
  return ok;
};

/** Основать город на ничейной клетке, где стоит поселенец. Он остаётся там до конца стройки и становится городом. */
export const foundTownHall = (s: GameState, pid: string, generalId: string): Result => {
  const p = s.players[pid];
  const g = s.generals[generalId];
  if (!g || g.owner !== pid) return no('not your settler');
  if (!g.settler) return no('only a settler can found a city: train one in a city');
  if (p.jobs.some((j) => j.kind === 'found' && j.general === g.id)) return no('this settler is already founding a city');
  const c = s.cells[key(g.hex)];
  if (!c || !PASSABLE[c.terrain]) return no('you cannot build here');
  if (c.owner) return no('this land already belongs to someone');
  if (p.jobs.some((j) => j.kind === 'found' && key(j.hex) === key(g.hex))) return no('a city is already being founded here');
  const m = mods(s, pid);
  g.moveLeft = 0;
  g.order = undefined;
  p.jobs.push({ kind: 'found', hex: { ...g.hex }, general: g.id, finish: s.turn + (m.townHallFoundTurns ?? TOWN_HALL_FOUND.turns) });
  return ok;
};

// ---------- Казарма и таверна ----------

/** Город игрока по id; без id — столица. */
const ownHall = (s: GameState, pid: string, hallId?: string) =>
  hallId ? (s.halls[hallId]?.owner === pid ? s.halls[hallId] : undefined) : playerHalls(s, pid).sort((a, b) => a.order - b.order)[0];

/** Казарма и таверна у каждого города свои. Без hallId — в столице. */
export const upgradeBarracks = (s: GameState, pid: string, hallId?: string): Result => {
  const p = s.players[pid];
  const h = ownHall(s, pid, hallId);
  if (!h) return no('not your city');
  if ((h.barracks ?? 0) >= 5) return no('already at the top level');
  if (p.jobs.some((j) => j.kind === 'barracks' && j.hallId === h.id)) return no('already under construction');
  if (freeBuilders(s, pid, h.id) < 1) return noBuilder(s, h.id);
  const level = (h.barracks ?? 0) + 1;
  const b = BARRACKS[level as 1 | 2 | 3 | 4 | 5];
  const cost = barracksCost(s, pid, level as 1 | 2 | 3 | 4 | 5);
  if (!canAfford(p.res, cost)) return no('not enough resources');
  pay(p, cost);
  p.jobs.push({ kind: 'barracks', hallId: h.id, level, finish: s.turn + buildTurns(s, pid, b.turns) });
  return ok;
};

export const upgradeTavern = (s: GameState, pid: string, hallId?: string): Result => {
  const p = s.players[pid];
  const h = ownHall(s, pid, hallId);
  if (!h) return no('not your city');
  if ((h.tavern ?? 0) >= 4) return no('already at the top level');
  if (p.jobs.some((j) => j.kind === 'tavern' && j.hallId === h.id)) return no('already under construction');
  if (freeBuilders(s, pid, h.id) < 1) return noBuilder(s, h.id);
  const level = (h.tavern ?? 0) + 1;
  const t = TAVERN[level as 1 | 2 | 3 | 4];
  const cost = tavernCost(s, pid, level as 1 | 2 | 3 | 4);
  if (!canAfford(p.res, cost)) return no('not enough resources');
  pay(p, cost);
  p.jobs.push({ kind: 'tavern', hallId: h.id, level, finish: s.turn + buildTurns(s, pid, t.turns) });
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

/** Изучена ли технология дерева. */
export const hasTech = (s: GameState, pid: string, id: TechId): boolean => !!s.players[pid]?.research.techs?.[id];

/** Открыта ли технология для изучения: нужные до неё изучены. */
export const techReady = (s: GameState, pid: string, id: TechId): boolean => {
  const r = s.players[pid].research;
  return TECHS[id].needs.every((n: string) => (n.startsWith('t') && /^t\d$/.test(n) ? r.done > Number(n.slice(1)) : !!r.techs?.[n]));
};

/** Начать изучать технологию дерева. Одна за раз, параллельно со ступенями «Тактики». */
export const startTech = (s: GameState, pid: string, id: TechId): Result => {
  const p = s.players[pid];
  const t = TECHS[id];
  if (p.research.techs?.[id]) return no(`${t.name} is already researched`);
  if (p.research.tech) return no('another technology is being researched');
  if (!techReady(s, pid, id)) return no('research the technologies before it first');
  if (!canAfford(p.res, t.cost)) return no('not enough resources');
  pay(p, t.cost);
  p.research.tech = { id, finish: s.turn + t.turns };
  return ok;
};
export const startMarch = (s: GameState, pid: string): Result => startTech(s, pid, 'march');

/** Стройка с «Каменщиками» идёт на ход быстрее (но не меньше хода). */
export const buildTurns = (s: GameState, pid: string, base: number): number => Math.max(1, base - (hasTech(s, pid, 'masons') ? 1 : 0));

/** Сколько клеток за ход проходят генералы и поселенцы игрока (марш-бросок действует на всех). */
export const armyMove = (s: GameState, pid: string): number => (hasTech(s, pid, 'march') ? ARMY_MOVE_MARCH : ARMY_MOVE);

/** ELO, с которым придёт следующий нанятый генерал. */
export const recruitElo = (s: GameState, pid: string): number =>
  s.settings.elo + s.players[pid].research.done * ELO_PER_RESEARCH;

// ---------- Очередь строек ----------

/** Стройки, которые можно поставить в очередь, когда все строители заняты. */
export type QueueOrder =
  | { kind: 'build'; hex: Hex; building: ResourceBuilding }
  | { kind: 'upgrade'; hex: Hex }
  | { kind: 'townhall'; hallId: string }
  | { kind: 'barracks'; hallId: string }
  | { kind: 'tavern'; hallId: string };

const sameTarget = (a: Job, b: Job): boolean =>
  a.kind === b.kind && (a.kind === 'resource' ? key(a.hex) === key((b as typeof a).hex)
    : a.kind === 'found' ? false : a.hallId === (b as typeof a).hallId);

const runOrder = (s: GameState, pid: string, o: QueueOrder): Result =>
  o.kind === 'build' ? build(s, pid, o.hex, o.building)
    : o.kind === 'upgrade' ? upgrade(s, pid, o.hex)
      : o.kind === 'townhall' ? upgradeTownHall(s, pid, o.hallId)
        : o.kind === 'barracks' ? upgradeBarracks(s, pid, o.hallId) : upgradeTavern(s, pid, o.hallId);

/** Поставить стройку в очередь: все проверки и оплата — как у обычной стройки, но начнётся она,
 *  когда освободится строитель. Повторно ту же стройку в очередь не ставим. */
export const enqueue = (s: GameState, pid: string, o: QueueOrder): Result => {
  const p = s.players[pid];
  const queue = (p.queue ??= []);
  const hallId = o.kind === 'build' || o.kind === 'upgrade' ? s.cells[key(o.hex)]?.hall : o.kind === 'townhall' || o.kind === 'barracks' || o.kind === 'tavern' ? o.hallId : undefined;
  const h = hallId ? s.halls[hallId] : undefined;
  if (!h || h.owner !== pid) return runOrder(s, pid, o); // пусть обычная проверка объяснит, что не так
  if (freeBuilders(s, pid, h.id) > 0) return runOrder(s, pid, o);
  const before = { ...p.res };
  const jobs = p.jobs.length;
  const had = h.builders;
  h.builders = hallBuilders(h) + 1; // временный строитель: проверки и оплата идут обычным путём
  const r = runOrder(s, pid, o);
  h.builders = had;
  if (!r.ok) return r;
  const job = p.jobs.splice(jobs, 1)[0];
  if (queue.some((q) => sameTarget(q.job, job))) {
    // уже в очереди — откатываем
    p.res = before;
    if (job.kind === 'resource' && job.level === 1) s.cells[key(job.hex)].reserved = false;
    return no('already in the queue');
  }
  queue.push({ job, turns: job.finish - s.turn, paid: { wood: before.wood - p.res.wood, food: before.food - p.res.food, gold: before.gold - p.res.gold } });
  return ok;
};

/** Отменить стройку из очереди и вернуть ресурсы. */
export const cancelQueued = (s: GameState, pid: string, index: number): Result => {
  const p = s.players[pid];
  const q = p.queue?.[index];
  if (!q) return no('nothing to cancel');
  p.queue!.splice(index, 1);
  p.res.wood += q.paid.wood; p.res.food += q.paid.food; p.res.gold += q.paid.gold;
  if (q.job.kind === 'resource' && q.job.level === 1) s.cells[key(q.job.hex)].reserved = false;
  return ok;
};

/** Запустить стройки из очереди, пока есть свободные строители. Стройку, которая стала невозможной
 *  (клетку или город захватили), убираем и возвращаем ресурсы. */
export const startQueued = (s: GameState, pid: string): void => {
  const p = s.players[pid];
  for (let i = 0; p.queue && i < p.queue.length;) {
    const q = p.queue[i];
    const j = q.job;
    const valid = j.kind === 'resource' ? s.cells[key(j.hex)]?.owner === pid && (j.level === 1 || s.cells[key(j.hex)].building?.level === j.level - 1)
      : j.kind === 'townhall' ? s.halls[j.hallId]?.owner === pid && s.halls[j.hallId].level === j.level - 1
        : j.kind === 'barracks' ? s.halls[j.hallId]?.owner === pid && (s.halls[j.hallId].barracks ?? 0) === j.level - 1
          : j.kind === 'tavern' ? s.halls[j.hallId]?.owner === pid && (s.halls[j.hallId].tavern ?? 0) === j.level - 1 : false;
    if (!valid) { cancelQueued(s, pid, i); say(s, 'a queued construction was cancelled, resources returned', pid); continue; }
    const hid = jobHall(s, j);
    if (!hid || freeBuilders(s, pid, hid) < 1) { i++; continue; } // у этого города строители пока заняты
    p.queue.splice(i, 1);
    p.jobs.push({ ...j, finish: s.turn + q.turns });
  }
};

// ---------- Доход, содержание, голод ----------

export const armyValue = (a: Army): number =>
  (Object.keys(a) as Piece[]).reduce((sum, p) => sum + a[p] * PIECE_PRICE[p], 0);

/** Генералы игрока (поселенцы — нет). */
export const playerGenerals = (s: GameState, pid: string): General[] =>
  Object.values(s.generals).filter((g) => g.owner === pid && !g.settler);
export const playerSettlers = (s: GameState, pid: string): General[] =>
  Object.values(s.generals).filter((g) => g.owner === pid && g.settler);

/** Цена поселенца с бонусом нации. */
export const settlerCost = (s: GameState, pid: string): Res => scale(TOWN_HALL_FOUND.cost, mods(s, pid).townHallFoundCostMult ?? 1);

/** Нанять поселенца в городе. Он появляется в городе и пойдёт в следующий ход. */
export const hireSettler = (s: GameState, pid: string, hallId: string): Result => {
  const p = s.players[pid];
  const h = s.halls[hallId];
  if (!h || h.owner !== pid) return no('not your city');
  const cost = settlerCost(s, pid);
  if (!canAfford(p.res, cost)) return no('not enough resources');
  const spot = freeCellNear(s, h.hex, pid);
  if (!spot) return no(`no free cell next to ${h.name} for a settler`);
  pay(p, cost);
  const g = makeGeneral(s, pid, spot, 0, { p: 0, n: 0, b: 0, r: 0, q: 0 }, 'Settler');
  g.settler = true;
  say(s, `a settler leaves ${h.name}`, pid);
  return ok;
};

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
  const rate = (mods(s, pid).armyUpkeepRate ?? ARMY_UPKEEP_RATE) * (hasTech(s, pid, 'quartermaster') ? 0.75 : 1); // «Интендантство»
  const army = Math.ceil(gens.reduce((sum, g) => sum + armyValue(g.army), 0) * rate);
  const builderFood = mods(s, pid).freeBuilderUpkeep ? 0 : BUILDER_UPKEEP_FOOD;
  const extraBuilders = playerHalls(s, pid).reduce((n, h) => n + hallBuilders(h) - 1, 0); // первый строитель каждого города — бесплатно
  return army + extraBuilders * builderFood + Math.max(0, gens.length - 1) * GENERAL_UPKEEP_FOOD;
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
    const crowded = playerHalls(s, pid).find((h) => hallBuilders(h) > 1);
    if (crowded) { crowded.builders = hallBuilders(crowded) - 1; lost.push('builder'); continue; }
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
      if (j.level === 1) { c.reserved = false; if (c.owner === pid) { c.building = { kind: j.building, level: 1 }; say(s, `${j.building} built`, pid); } }
      else if (c.building && c.owner === pid) { c.building.level = j.level; say(s, `${j.building} upgraded to level ${j.level}`, pid); }
    } else if (j.kind === 'townhall') {
      const h = s.halls[j.hallId];
      if (h && h.owner === pid) { h.level = j.level; recomputeTerritory(s); say(s, `${h.name} grew to level ${j.level}`, pid); }
    } else if (j.kind === 'found') {
      const c = s.cells[key(j.hex)];
      const settler = s.generals[j.general];
      if (settler?.settler) delete s.generals[settler.id]; // поселенец становится городом
      if (c && !c.owner && settler) {
        const id = newId(s, 'h');
        const name = cityName(s, pid);
        s.halls[id] = { id, name, hex: j.hex, owner: pid, level: 1, order: s.nextId };
        recomputeTerritory(s);
        say(s, `${name} is founded`, pid);
      }
    } else if (j.kind === 'barracks') { const h = s.halls[j.hallId]; if (h?.owner === pid) { h.barracks = j.level; say(s, `barracks level ${j.level} ready in ${h.name}`, pid); } }
    else if (j.kind === 'tavern') { const h = s.halls[j.hallId]; if (h?.owner === pid) { h.tavern = j.level; say(s, `tavern level ${j.level} ready in ${h.name}`, pid); } }
  }
  const r = p.research.active;
  if (r && r.finish <= s.turn) { p.research.done = r.step + 1; p.research.active = undefined; say(s, `Tactics ${p.research.done} researched: new generals +${ELO_PER_RESEARCH} ELO`, pid); }
  const tech = p.research.tech;
  if (tech && tech.finish <= s.turn) {
    (p.research.techs ??= {})[tech.id] = true;
    p.research.tech = undefined;
    say(s, `${TECHS[tech.id as TechId].name} researched`, pid);
  }
  startQueued(s, pid);
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
