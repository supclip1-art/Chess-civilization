// Все числа баланса — из дизайн-документа (экономика v2–v5, правила боёв и карты).
// Экономика в масштабе ×10: все цены, выработка и содержание — целые числа.
// Меняем баланс только здесь.

export type Res = { wood: number; food: number; gold: number };
export const res = (wood = 0, food = 0, gold = 0): Res => ({ wood, food, gold });

export const START_RESOURCES: Res = res(50, 40, 0);

/** Время стройки: постройка ур.1 и улучшения до ур.2..5 (ходов). */
export const BUILD_TURNS = [1, 1, 2, 3, 4] as const;

export type ResourceBuilding = 'farm' | 'sawmill' | 'mine' | 'fishery';

/** Цена постройки ур.1 и улучшений до ур.2..5. Ресурсные здания стоят только дерево и еду. */
export const RESOURCE_COST: Record<ResourceBuilding, readonly Res[]> = {
  farm: [res(20, 10), res(30, 10), res(70, 50), res(100, 80), res(200, 160)],
  sawmill: [res(10, 20), res(10, 30), res(50, 70), res(80, 100), res(160, 200)],
  mine: [res(30, 30), res(50, 50), res(70, 80), res(110, 110), res(280, 280)],
  // рыбный промысел на своей морской клетке: лодки и причалы — в основном дерево
  fishery: [res(30, 0), res(40, 10), res(80, 40), res(110, 70), res(220, 140)],
};

/** Выработка за ход на уровнях 1..5. */
export const RESOURCE_OUTPUT: Record<ResourceBuilding, readonly number[]> = {
  farm: [20, 30, 50, 70, 100],
  sawmill: [20, 30, 50, 70, 100],
  mine: [5, 10, 15, 20, 25],
  fishery: [20, 30, 50, 70, 100], // как ферма, но цена — дерево на лодки
};

export const RESOURCE_OF: Record<ResourceBuilding, keyof Res> = { farm: 'food', sawmill: 'wood', mine: 'gold', fishery: 'food' };
export const MAX_RESOURCE_LEVEL = 5;

// ---- Ратуша и строители ----
export const TOWN_HALL_MAX_LEVEL = 3;
/** Каждый город сам даёт немного дерева в ход — чтобы не застрять без дерева до первой лесопилки. */
export const CITY_WOOD = 5;
/** Улучшение ратуши до ур.2 и ур.3. */
export const TOWN_HALL_UPGRADE: Record<2 | 3, { cost: Res; turns: number }> = {
  2: { cost: res(40, 30), turns: 1 },
  3: { cost: res(100, 80), turns: 2 }, // 3-й уровень строится 2 хода
};
/** Основание новой ратуши на клетке, где стоит генерал. */
export const TOWN_HALL_FOUND = { cost: res(100, 80), turns: 2 };
/** Радиус зоны охвата по уровню ратуши. */
export const TOWN_HALL_RADIUS = [1, 2, 3] as const;
/** Сколько ресурсных зданий (вместе со стройками) может быть на земле города по его уровню. */
export const BUILDING_SLOTS = [5, 8, 12] as const;
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
/** Больше, чем в обычном шахматном наборе, в армии не бывает: 8 пешек, по 2 коня, слона и ладьи, 1 ферзь. */
export const ARMY_MAX: Record<Piece, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };

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
  // дерево и еда к середине партии копятся — исследования забирают их всё больше, золото почти не трогают
  { cost: res(50, 30, 10), turns: 1 },
  { cost: res(100, 70, 10), turns: 1 },
  { cost: res(160, 120, 20), turns: 2 },
  { cost: res(240, 180, 20), turns: 2 },
  { cost: res(330, 250, 20), turns: 2 },
];
export const ELO_PER_RESEARCH = 25;

// ---- Карта и ходы ----
export const ARMY_MOVE = 2;
/** «Марш-бросок» — разовое исследование ветки «Тактика»: генералы ходят на 3 клетки. */
export const ARMY_MOVE_MARCH = 3;
export const MARCH_RESEARCH = { cost: res(200, 140, 40), turns: 3 };

/** Технологии дерева (кроме ступеней «Тактики»). needs — что нужно изучить раньше (t0..t4 — ступени «Тактики»).
 *  Изучаются по одной за раз, параллельно со ступенями «Тактики». */
export const TECHS = {
  militia: { name: 'Militia', text: 'Pawns cost 20% less.', cost: res(100, 60, 20), turns: 2, needs: ['t0'] },
  cavalry: { name: 'Cavalry', text: 'Knights and bishops cost a quarter less.', cost: res(180, 140, 40), turns: 3, needs: ['militia'] },
  fortify: { name: 'Fortifications', text: 'An army defending its own city gets an extra pawn in the battle (if it has fewer than 8), otherwise +50 ELO.', cost: res(240, 160, 30), turns: 3, needs: ['t1'] },
  veterans: { name: 'Veterans', text: 'A general gains 25 ELO for each victory instead of 15.', cost: res(200, 180, 60), turns: 3, needs: ['t2'] },
  quartermaster: { name: 'Quartermaster', text: 'Armies eat a quarter less food.', cost: res(220, 240, 20), turns: 3, needs: ['t3'] },
  academy: { name: 'Military academy', text: 'Retrain your generals: a general hired before new Tactics levels can catch up to them for gold.', cost: res(200, 160, 30), turns: 3, needs: ['quartermaster'] },
  guilds: { name: 'Guilds', text: '+1 building slot in every city.', cost: res(220, 140, 0), turns: 3, needs: [] },
  masons: { name: 'Masons', text: 'Every construction takes one turn less (at least 1).', cost: res(240, 120, 20), turns: 2, needs: ['guilds'] },
  march: { name: 'Forced march', text: 'Generals and settlers move 3 cells per turn instead of 2.', cost: MARCH_RESEARCH.cost, turns: MARCH_RESEARCH.turns, needs: ['t1'] },
  roads: { name: 'Roads', text: 'On your own land armies go one cell further per turn.', cost: res(320, 180, 40), turns: 3, needs: ['march'] },
  cartography: { name: 'Cartography', text: 'Generals see 3 cells around them instead of 2.', cost: res(200, 160, 30), turns: 2, needs: ['roads'] },
} as const;
/** «Военная академия»: золото за каждую пропущенную ступень «Тактики» при переобучении генерала. */
export const TRAIN_GOLD_PER_STEP = 40;
export type TechId = keyof typeof TECHS;
export const FOG_RADIUS = 2;
export const SIEGE_TURNS = 1;

// ---- Бой ----
export const MAX_PLIES = 150;
