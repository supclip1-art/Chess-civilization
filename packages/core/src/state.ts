// Состояние партии. Правила (economy.ts, army.ts, map.ts, turn.ts) читают и меняют его на месте;
// интерфейс при необходимости делает structuredClone для отмены или сохранения.

import { STARTING_ARMY, START_RESOURCES, TOWN_HALL_RADIUS, type Piece, type Res, type ResourceBuilding } from './config.ts';
import { type Hex, key, range } from './hex.ts';
import { NATIONS, NEUTRAL_CITIES, type Aggression, type NationId } from './nations.ts';
import { type Rng, int } from './rng.ts';

export type Terrain = 'field' | 'forest' | 'deposit' | 'tundra' | 'desert' | 'mountain' | 'water';
export const PASSABLE: Record<Terrain, boolean> = {
  field: true, forest: true, deposit: true, tundra: true, desert: true, mountain: false, water: false,
};
/** На какой клетке какое ресурсное здание можно ставить. */
export const BUILDING_TERRAIN: Record<ResourceBuilding, Terrain> = { farm: 'field', sawmill: 'forest', mine: 'deposit', fishery: 'water' };

export type Army = Record<Piece, number>;
export const emptyArmy = (): Army => ({ p: 0, n: 0, b: 0, r: 0, q: 0 });

export type Cell = {
  hex: Hex;
  terrain: Terrain;
  owner?: string; // id игрока или нейтрала, чья ратуша охватывает клетку
  hall?: string; // id ратуши, к зоне которой относится клетка
  building?: { kind: ResourceBuilding; level: number };
  reserved?: boolean; // здесь идёт постройка нового здания
};

/** Город (в коде — hall): центр территории. Название даётся при основании и сохраняется при захвате. */
export type TownHall = {
  id: string;
  name: string;
  hex: Hex;
  owner: string;
  level: number;
  order: number; // порядок основания: при спорной клетке её держит более ранний город
  siege?: { by: string; since: number }; // id осаждающего генерала и ход начала осады
};

export type General = {
  id: string;
  owner: string;
  name: string;
  elo: number;
  stars: number;
  army: Army;
  hex: Hex;
  moveLeft: number;
  attacked: boolean;
  white: string; // дебют за белых
  vsE4: string; // защита против 1.e4
  vsD4: string; // защита против 1.d4
};

export type Job =
  | { kind: 'resource'; hex: Hex; building: ResourceBuilding; level: number; finish: number }
  | { kind: 'townhall'; hallId: string; level: number; finish: number }
  | { kind: 'found'; hex: Hex; general: string; finish: number }
  | { kind: 'barracks'; level: number; finish: number }
  | { kind: 'tavern'; level: number; finish: number };

export type Player = {
  id: string;
  nation: NationId;
  ai?: { aggression: Aggression; ruler: string; lastWar?: number }; // lastWar — ход последнего нападения на игрока
  res: Res;
  builders: number;
  barracks: number; // 0 — не построена
  tavern: number;
  research: { done: number; active?: { step: number; finish: number } };
  jobs: Job[];
  starterKnight: boolean; // стартовый конь жив и всегда возвращается после боя
  alive: boolean;
};

export type Neutral = { id: string; hallId: string };

export type GameState = {
  rng: Rng;
  turn: number; // номер круга, с 1
  current: number; // индекс игрока в order, который сейчас ходит
  order: string[];
  settings: { elo: number };
  cells: Record<string, Cell>;
  halls: Record<string, TownHall>;
  players: Record<string, Player>;
  generals: Record<string, General>;
  neutrals: Record<string, Neutral>;
  nextId: number;
  log: { turn: number; player?: string; text: string }[];
  /** Что игрок видел на клетках, когда они были открыты (как в «Цивилизации»): под туманом войны
   *  карта показывает это, а не текущее положение. memory[игрок][клетка]. Армии не запоминаются. */
  memory?: Record<string, Record<string, CellMemory>>;
};

export type CellMemory = {
  turn: number; // когда видел в последний раз
  owner?: string;
  building?: { kind: ResourceBuilding; level: number };
  hall?: { name: string; owner: string; level: number };
};

export type MapDef = {
  name: string;
  cells: { q: number; r: number; terrain: Terrain }[];
  /** Стартовые точки наций (по порядку выбора). Невыбранные становятся нейтралами. */
  spawns: Hex[];
  /** Нация каждой стартовой точки — только для старых карт; на новых нации расставляются случайно (randomSpawns). */
  spawnNations?: NationId[];
  /** Расставить игроков по стартовым точкам случайно (по зерну партии). */
  randomSpawns?: boolean;
  /** Ратуши слаборазвитых нейтральных государств. */
  neutrals: Hex[];
  /** Названия городов по клеткам («q,r»): нейтралы и свободные столицы получают исторические имена. */
  names?: Record<string, string>;
};

export type PlayerSetup = { nation: NationId; ai?: { aggression: Aggression; ruler: string } };

export const OPENINGS_WHITE = ['Italian Game', 'Ruy Lopez', 'Scotch Game', 'Vienna Game', "Queen's Gambit", 'Catalan', 'London System', 'English Opening'];
export const DEFENSES_E4 = ['Sicilian Defense', 'French Defense', 'Caro-Kann Defense', 'Scandinavian Defense', 'Open Game', 'Pirc Defense'];
export const DEFENSES_D4 = ["King's Indian Defense", "Queen's Gambit Declined", 'Slav Defense', 'Nimzo-Indian Defense', 'Grünfeld Defense', 'Dutch Defense'];

export const newId = (s: GameState, prefix: string): string => `${prefix}${s.nextId++}`;

export const say = (s: GameState, text: string, player?: string): void => {
  s.log.push({ turn: s.turn, player, text });
};

/** Радиус территории города: по уровню; у Казахстана город 1-го уровня охватывает больше. */
export const hallRadius = (h: TownHall, s?: GameState): number => {
  const base = TOWN_HALL_RADIUS[Math.min(h.level, TOWN_HALL_RADIUS.length) - 1];
  const p = s?.players[h.owner];
  const first = p ? NATIONS[p.nation].mods.firstLevelRadius : undefined;
  return h.level === 1 && first ? Math.max(base, first) : base;
};

/** Пересчитать, чьи клетки чьи: каждая ратуша красит свой радиус, спорную клетку держит более ранняя. */
export const recomputeTerritory = (s: GameState, radiusOf: (h: TownHall) => number = (h) => hallRadius(h, s)): void => {
  for (const c of Object.values(s.cells)) { c.owner = undefined; c.hall = undefined; }
  const halls = Object.values(s.halls).sort((a, b) => a.order - b.order);
  for (const h of halls) {
    for (const x of range(h.hex, radiusOf(h))) {
      const c = s.cells[key(x)];
      if (c && !c.owner) { c.owner = h.owner; c.hall = h.id; }
    }
  }
};

/** Случайный гарнизон нейтрала: правило строя главнее диапазонов. */
export const rollGarrison = (rng: Rng): Army => {
  const a = emptyArmy();
  a.p = int(rng, 2, 6);
  if (a.p >= 4) a.n = int(rng, 1, 2);
  if (a.p >= 6) a.b = int(rng, 0, 1);
  return a;
};

export const makeGeneral = (s: GameState, owner: string, hex: Hex, elo: number, army: Army, name: string): General => {
  const g: General = {
    id: newId(s, 'g'), owner, name, elo, stars: 0, army, hex, moveLeft: 0, attacked: false,
    white: OPENINGS_WHITE[int(s.rng, 0, OPENINGS_WHITE.length - 1)],
    vsE4: DEFENSES_E4[int(s.rng, 0, DEFENSES_E4.length - 1)],
    vsD4: DEFENSES_D4[int(s.rng, 0, DEFENSES_D4.length - 1)],
  };
  s.generals[g.id] = g;
  return g;
};

/** Название для нового города: следующее свободное из списка нации (у нейтралов — случайное из общего списка).
 *  Когда список кончился — «Новый …» с номером. */
export const cityName = (s: GameState, owner: string): string => {
  const used = new Set(Object.values(s.halls).map((h) => h.name));
  const p = s.players[owner];
  const list = p ? NATIONS[p.nation].cities : NEUTRAL_CITIES;
  const free = list.filter((n) => !used.has(n));
  if (free.length) return p ? free[0] : free[int(s.rng, 0, free.length - 1)];
  for (let k = 2; ; k++) for (const n of list) if (!used.has(`${n} ${k}`)) return `${n} ${k}`;
};

const addHall = (s: GameState, owner: string, hex: Hex, level: number, name?: string): TownHall => {
  const h: TownHall = { id: newId(s, 'h'), name: name ?? cityName(s, owner), hex, owner, level, order: s.nextId };
  s.halls[h.id] = h;
  return h;
};

const addNeutral = (s: GameState, hex: Hex, name?: string): void => {
  const id = newId(s, 'n');
  const hall = addHall(s, id, hex, 1, name);
  s.neutrals[id] = { id, hallId: hall.id };
  makeGeneral(s, id, hex, s.settings.elo, rollGarrison(s.rng), 'Garrison');
};

export const createGame = (map: MapDef, setup: PlayerSetup[], opts: { elo: number; seed: number }): GameState => {
  if (setup.length < 2 || setup.length > map.spawns.length) throw new Error(`players: 2..${map.spawns.length}`);
  const s: GameState = {
    rng: { seed: opts.seed }, turn: 1, current: 0, order: [], settings: { elo: opts.elo },
    cells: {}, halls: {}, players: {}, generals: {}, neutrals: {}, nextId: 1, log: [],
  };
  for (const c of map.cells) s.cells[key(c)] = { hex: { q: c.q, r: c.r }, terrain: c.terrain };
  // на географической карте игрок стартует на родине своей нации, иначе — по порядку
  // стартовые точки: случайно (карты наций не привязаны к местам), по нации или по порядку
  let spawnOf: number[];
  if (map.randomSpawns) {
    const idx = map.spawns.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = int(s.rng, 0, i); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    spawnOf = setup.map((_, i) => idx[i]);
  } else {
    spawnOf = setup.map((p, i) => {
      if (!map.spawnNations) return i;
      const at = map.spawnNations.indexOf(p.nation);
      if (at < 0) throw new Error(`no spawn for ${p.nation} on ${map.name}`);
      return at;
    });
  }
  setup.forEach((p, i) => {
    const id = `p${i + 1}`;
    const hex = map.spawns[spawnOf[i]];
    s.order.push(id);
    s.players[id] = {
      id, nation: p.nation, ai: p.ai, builders: 1, barracks: 0, tavern: 0,
      res: { wood: START_RESOURCES.wood + (NATIONS[p.nation].mods.startBonus?.wood ?? 0), food: START_RESOURCES.food + (NATIONS[p.nation].mods.startBonus?.food ?? 0), gold: START_RESOURCES.gold + (NATIONS[p.nation].mods.startBonus?.gold ?? 0) },
      research: { done: 0 }, jobs: [], starterKnight: true, alive: true,
    };
    addHall(s, id, hex, 1);
    makeGeneral(s, id, hex, opts.elo, { ...STARTING_ARMY }, 'General');
  });
  map.spawns.forEach((h, i) => { if (!spawnOf.includes(i)) addNeutral(s, h, map.names?.[key(h)]); });
  map.neutrals.forEach((h) => addNeutral(s, h, map.names?.[key(h)]));
  recomputeTerritory(s);
  return s;
};
