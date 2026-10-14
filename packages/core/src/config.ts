// Все числа баланса — из дизайн-документа (экономика v2–v5, правила боёв и карты).
// Экономика в масштабе ×10: все цены, выработка и содержание — целые числа.
// Меняем баланс только здесь.

export type Res = { wood: number; food: number; gold: number };
export const res = (wood = 0, food = 0, gold = 0): Res => ({ wood, food, gold });

export const START_RESOURCES: Res = res(50, 40, 0);

/** Время стройки: постройка ур.1 и улучшения до ур.2..5 (ходов). */
export const BUILD_TURNS = [1, 1, 2, 3, 4] as const;

export type ResourceBuilding = 'farm' | 'sawmill' | 'mine';

/** Цена постройки ур.1 и улучшений до ур.2..5. Ресурсные здания стоят только дерево и еду. */
export const RESOURCE_COST: Record<ResourceBuilding, readonly Res[]> = {
  farm: [res(20, 10), res(30, 10), res(70, 50), res(100, 80), res(200, 160)],
  sawmill: [res(10, 20), res(10, 30), res(50, 70), res(80, 100), res(160, 200)],
  mine: [res(30, 30), res(50, 50), res(70, 80), res(110, 110), res(280, 280)],
};

/** Выработка за ход на уровнях 1..5. */
export const RESOURCE_OUTPUT: Record<ResourceBuilding, readonly number[]> = {
  farm: [20, 30, 50, 70, 100],
  sawmill: [20, 30, 50, 70, 100],
  mine: [5, 10, 15, 20, 25],
};

export const RESOURCE_OF: Record<ResourceBuilding, keyof Res> = { farm: 'food', sawmill: 'wood', mine: 'gold' };
export const MAX_RESOURCE_LEVEL = 5;

// ---- Ратуша и строители ----
export const TOWN_HALL_MAX_LEVEL = 3;
/** Улучшение ратуши до ур.2 и ур.3. */
export const TOWN_HALL_UPGRADE: Record<2 | 3, { cost: Res; turns: number }> = {
  2: { cost: res(40, 30), turns: 1 },
  3: { cost: res(100, 80), turns: 1 },
};
/** Основание новой ратуши на клетке, где стоит генерал. */
export const TOWN_HALL_FOUND = { cost: res(100, 80), turns: 2 };
/** Радиус зоны охвата по уровню ратуши. */
export const TOWN_HALL_RADIUS = [1, 2, 3] as const;
/** Найм 2-го и 3-го строителя (еда). Предел строителей = уровень самой высокой ратуши. */
export const BUILDER_HIRE_FOOD: Record<2 | 3, number> = { 2: 40, 3: 80 };
export const BUILDER_UPKEEP_FOOD = 10; // за каждого нанятого, первый бесплатный

// ---- Казарма ----
export type Piece = 'p' | 'n' | 'b' | 'r' | 'q';
export const PIECES: readonly Piece[] = ['p', 'n', 'b', 'r', 'q'];
export const BARRACKS: Record<1 | 2 | 3 | 4 | 5, { cost: Res; turns: number }> = {
  1: { cost: res(40, 10), turns: 1 },
  2: { cost: res(80, 20), turns: 1 },
  3: { cost: res(140, 40), turns: 2 },
  4: { cost: res(220, 60), turns: 3 },
  5: { cost: res(320, 100), turns: 4 },
};
/** С какого уровня казармы фигуру можно нанять и вернуть на карту после боя. */
export const HIRE_LEVEL: Record<Piece, number> = { p: 1, n: 2, b: 3, r: 4, q: 5 };
/** Цена фигур в золоте = шахматная ценность × 10: пешка 10, конь и слон 30, ладья 50, ферзь 90. */
export const PIECE_PRICE: Record<Piece, number> = { p: 10, n: 30, b: 30, r: 50, q: 90 };
/** Шахматная ценность для подсчёта материала на 150-м полуходе. */
export const PIECE_VALUE: Record<Piece, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
/** Правило строя: сколько пешек нужно в армии, чтобы держать фигуру. */
export const PAWNS_REQUIRED: Record<Piece, number> = { p: 0, n: 4, b: 6, r: 8, q: 8 };
/** Содержание армии: еды за ход на 1 золото её цены, итог округляется вверх (полная армия 390 золота → 98 еды). */
export const ARMY_UPKEEP_RATE = 0.25;
export const STARTING_ARMY: Record<Piece, number> = { p: 4, n: 1, b: 0, r: 0, q: 0 };

// ---- Таверна и генералы ----
export const TAVERN: Record<1 | 2 | 3 | 4, { cost: Res; turns: number }> = {
  1: { cost: res(60, 20), turns: 1 },
  2: { cost: res(120, 40), turns: 2 },
  3: { cost: res(200, 60), turns: 3 },
  4: { cost: res(320, 100), turns: 4 },
};
/** Таверна ур. N позволяет держать N+1 генералов. */
export const MAX_GENERALS = 5;
export const GENERAL_HIRE_GOLD: Record<2 | 3 | 4 | 5, number> = { 2: 40, 3: 60, 4: 70, 5: 90 };
export const GENERAL_UPKEEP_FOOD = 10; // за каждого нанятого, стартовый бесплатный
export const ELO_PER_WIN = 15;
export const MAX_STARS = 5;

// ---- Ветка «Тактика»: +25 ELO генералам, нанятым после исследования ----
export const RESEARCH: readonly { cost: Res; turns: number }[] = [
  { cost: res(30, 0, 10), turns: 1 },
  { cost: res(40, 0, 10), turns: 1 },
  { cost: res(50, 0, 20), turns: 2 },
  { cost: res(60, 0, 20), turns: 2 },
  { cost: res(70, 0, 20), turns: 2 },
];
export const ELO_PER_RESEARCH = 25;

// ---- Карта и ходы ----
export const ARMY_MOVE = 2;
export const FOG_RADIUS = 2;
export const SIEGE_TURNS = 1;

// ---- Бой ----
export const MAX_PLIES = 150;
