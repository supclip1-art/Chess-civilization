// Военный ИИ (этап 5): куда идут генералы компьютерных стран и кого атакуют.
// Ядро только двигает генералов и называет цели атаки; сами бои — шахматные партии — разыгрывает приложение
// (Stockfish), поэтому функция возвращает список атак, а приложение вызывает attack() и resolveBattle().
//
// Характер правителя:
//   warlike  — выходит в поход со стартовой армией, бьёт нейтралов при небольшом перевесе, игроков — с 8-го хода;
//   moderate — ждёт армию покрепче и нападает только при явном перевесе, игроков — с 15-го хода;
//   peaceful — расширяется основанием городов и захватом слабых нейтралов; на игроков нападает поздно (с 25-го хода),
//              редко (раз в 8 ходов) и только при большом перевесе; чужую армию со своей земли выбивает всегда.

import { armyValue, foundTownHall, playerGenerals, playerHalls } from './economy.ts';
import { type Hex, distance, key, neighbors } from './hex.ts';
import { move, reachable } from './map.ts';
import { type Aggression } from './nations.ts';
import { type GameState, type General, PASSABLE } from './state.ts';
import { TOWN_HALL_FOUND } from './config.ts';

export type AiAttack = { gid: string; target: Hex };

type Character = {
  /** Во сколько раз армия должна быть сильнее, чтобы напасть на нейтрала / на игрока. */
  vsNeutral: number;
  vsPlayer: number;
  /** С какого хода нападает на других игроков. */
  playersFrom: number;
  /** Сколько ходов после нападения на игрока ждёт до следующего. */
  peace: number;
  /** Меньше этой армии генерал сидит дома и набирает фигуры. */
  minArmy: number;
  /** Сколько своих городов хочет иметь, основывая новые. */
  wantCities: number;
};

export const CHARACTER: Record<Aggression, Character> = {
  warlike: { vsNeutral: 1.15, vsPlayer: 1.1, playersFrom: 8, peace: 0, minArmy: 70, wantCities: 2 },
  moderate: { vsNeutral: 1.5, vsPlayer: 1.5, playersFrom: 15, peace: 3, minArmy: 120, wantCities: 3 },
  peaceful: { vsNeutral: 2, vsPlayer: 1.8, playersFrom: 25, peace: 8, minArmy: 150, wantCities: 4 },
};

/** Сила армии с поправкой на ELO генерала: +400 ELO — вдвое сильнее. */
export const power = (g: Pick<General, 'army' | 'elo'>): number => armyValue(g.army) * 2 ** ((g.elo - 1200) / 400);

const SEARCH = 16; // дальше этого генерал целей не ищет

/** Расстояния по суше от генерала (в обход гор, воды, чужих армий и чужих городов). */
const pathField = (s: GameState, g: General): Map<string, number> => {
  const blocked = new Set<string>();
  for (const x of Object.values(s.generals)) if (x.owner !== g.owner) blocked.add(key(x.hex));
  for (const h of Object.values(s.halls)) if (h.owner !== g.owner) blocked.add(key(h.hex));
  const dist = new Map<string, number>([[key(g.hex), 0]]);
  const queue: Hex[] = [g.hex];
  while (queue.length) {
    const cur = queue.shift()!;
    const d = dist.get(key(cur))!;
    if (d >= SEARCH) continue;
    for (const n of neighbors(cur)) {
      const k = key(n);
      const c = s.cells[k];
      if (!c || !PASSABLE[c.terrain] || dist.has(k) || blocked.has(k)) continue;
      dist.set(k, d + 1);
      queue.push(n);
    }
  }
  return dist;
};

/** Сколько ходов пути до соседней с целью клетки (Infinity — не дойти). */
const stepsTo = (field: Map<string, number>, target: Hex): number =>
  Math.min(Infinity, ...neighbors(target).map((n) => field.get(key(n)) ?? Infinity));

/** Расстояния по суше до цели (поиск от цели), в обход чужих армий и городов. */
const fieldFrom = (s: GameState, owner: string, target: Hex): Map<string, number> => {
  const blocked = new Set<string>();
  for (const x of Object.values(s.generals)) if (x.owner !== owner) blocked.add(key(x.hex));
  for (const h of Object.values(s.halls)) if (h.owner !== owner) blocked.add(key(h.hex));
  const dist = new Map<string, number>([[key(target), 0]]);
  const queue: Hex[] = [target];
  while (queue.length) {
    const cur = queue.shift()!;
    const d = dist.get(key(cur))!;
    if (d >= SEARCH + 4) continue;
    for (const n of neighbors(cur)) {
      const k = key(n);
      const c = s.cells[k];
      if (!c || !PASSABLE[c.terrain] || dist.has(k) || blocked.has(k)) continue;
      dist.set(k, d + 1);
      queue.push(n);
    }
  }
  return dist;
};

/** Шагнуть к цели по суше: из клеток, куда можно дойти в этот ход, выбрать ближайшую к цели.
 *  adjacent — встать рядом с целью (для атаки), иначе — на саму клетку. */
const stepToward = (s: GameState, g: General, target: Hex, adjacent: boolean): void => {
  if (g.moveLeft <= 0) return;
  const toTarget = fieldFrom(s, g.owner, target);
  let best: Hex | null = null;
  let bestD = toTarget.get(key(g.hex)) ?? Infinity;
  for (const k of reachable(s, g.id).keys()) {
    const d = toTarget.get(k) ?? Infinity;
    if (adjacent && d < 1) continue;
    if (d < bestD) { bestD = d; const [q, r] = k.split(',').map(Number); best = { q, r }; }
  }
  if (best) move(s, g.id, best);
};

type Target = { hex: Hex; steps: number; kind: 'neutral' | 'army' | 'city' | 'intruder' };

const targetsFor = (s: GameState, g: General, field: Map<string, number>): Target[] => {
  const me = s.players[g.owner];
  const ch = CHARACTER[me.ai!.aggression];
  // войны с игроками: не раньше своего хода и с передышкой после прошлого нападения
  const warReady = s.turn >= ch.playersFrom && s.turn - (me.ai!.lastWar ?? -Infinity) >= ch.peace;
  const out: Target[] = [];
  const mine = power(g);
  const myLand = new Set(Object.values(s.cells).filter((c) => c.owner === g.owner).map((c) => key(c.hex)));
  for (const x of Object.values(s.generals)) {
    if (x.owner === g.owner || armyValue(x.army) === 0) continue;
    const steps = stepsTo(field, x.hex);
    if (steps === Infinity) continue;
    const neutral = !!s.neutrals[x.owner];
    if (neutral) { if (mine >= ch.vsNeutral * power(x)) out.push({ hex: x.hex, steps, kind: 'neutral' }); continue; }
    if (myLand.has(key(x.hex)) && mine >= 1.1 * power(x)) { out.push({ hex: x.hex, steps, kind: 'intruder' }); continue; }
    if (warReady && mine >= ch.vsPlayer * power(x)) out.push({ hex: x.hex, steps, kind: 'army' });
  }
  // пустые города других игроков — осада
  if (warReady) {
    for (const h of Object.values(s.halls)) {
      if (h.owner === g.owner || !s.players[h.owner] || h.siege) continue;
      if (Object.values(s.generals).some((x) => x.owner === h.owner && x.hex.q === h.hex.q && x.hex.r === h.hex.r && armyValue(x.army) > 0)) continue;
      const steps = stepsTo(field, h.hex);
      if (steps !== Infinity) out.push({ hex: h.hex, steps, kind: 'city' });
    }
  }
  // чужая армия на своей земле — в первую очередь, дальше — ближайшее
  return out.sort((a, b) => (a.kind === 'intruder' ? -1 : 0) - (b.kind === 'intruder' ? -1 : 0) || a.steps - b.steps);
};

/** Место для нового города: ничья суша подальше от городов, с полями, лесами и месторождениями рядом. */
const citySite = (s: GameState, g: General, field: Map<string, number>): Hex | null => {
  const halls = Object.values(s.halls);
  let best: { hex: Hex; score: number } | null = null;
  for (const [k, steps] of field) {
    const c = s.cells[k];
    if (c.owner || c.terrain === 'mountain' || c.terrain === 'water' || steps > 8) continue;
    if (halls.some((h) => distance(h.hex, c.hex) < 3)) continue;
    let score = 0;
    for (const n of neighbors(c.hex)) {
      const t = s.cells[key(n)]?.terrain;
      score += t === 'deposit' ? 2 : t === 'field' || t === 'forest' || t === 'water' ? 1 : 0;
    }
    score -= steps * 0.35;
    if (!best || score > best.score) best = { hex: c.hex, score };
  }
  return best && best.score > 2 ? best.hex : null;
};

/** Ход военного ИИ страны pid: двигает генералов, основывает города и возвращает атаки для приложения. */
export const aiMilitaryTurn = (s: GameState, pid: string): AiAttack[] => {
  const p = s.players[pid];
  if (!p?.ai || !p.alive) return [];
  const ch = CHARACTER[p.ai.aggression];
  const capital = playerHalls(s, pid).sort((a, b) => a.order - b.order)[0];
  const attacks: AiAttack[] = [];
  const gens = playerGenerals(s, pid).sort((a, b) => a.id.localeCompare(b.id));
  const besieged = Object.values(s.halls).filter((h) => h.owner === pid && h.siege);
  for (const g of gens) {
    if (g.attacked) continue;
    // гарнизон (второй и следующие генералы): сидит в столице и бьёт только тех, кто подошёл к её стенам
    if (g !== gens[0] && capital) {
      const atWalls = Object.values(s.generals).find((x) => x.owner !== pid && armyValue(x.army) > 0
        && distance(x.hex, capital.hex) <= 1 && power(g) >= 0.9 * power(x));
      if (atWalls && distance(g.hex, atWalls.hex) === 1) { attacks.push({ gid: g.id, target: atWalls.hex }); continue; }
      if (distance(g.hex, capital.hex) > 0) stepToward(s, g, capital.hex, false);
      continue;
    }
    // свой город в осаде — главная армия идёт снимать осаду
    const siegeBy = besieged.map((h) => s.generals[h.siege!.by]).find((x) => x && armyValue(x.army) > 0);
    if (siegeBy && armyValue(g.army) > 0) {
      if (distance(g.hex, siegeBy.hex) > 1) stepToward(s, g, siegeBy.hex, true);
      if (distance(g.hex, siegeBy.hex) === 1 && power(g) >= 0.8 * power(siegeBy)) attacks.push({ gid: g.id, target: siegeBy.hex });
      continue;
    }
    // идёт осада: стоять у стен, пока город не сдастся в начале следующего хода
    if (Object.values(s.halls).some((h) => h.siege?.by === g.id && distance(h.hex, g.hex) === 1)) continue;
    const field = pathField(s, g);
    const targets = armyValue(g.army) >= ch.minArmy || armyValue(g.army) > 0 ? targetsFor(s, g, field) : [];
    const strongEnough = armyValue(g.army) >= ch.minArmy;
    const goal = targets.find((t) => t.kind === 'intruder') ?? (strongEnough ? targets[0] : undefined);
    if (goal) {
      if (distance(g.hex, goal.hex) > 1) stepToward(s, g, goal.hex, true);
      if (distance(g.hex, goal.hex) === 1) {
        attacks.push({ gid: g.id, target: goal.hex });
        if (goal.kind === 'army' || goal.kind === 'city') p.ai.lastWar = s.turn;
      }
      continue;
    }
    // целей нет: расширяемся новыми городами, иначе возвращаемся домой набирать армию
    const found = TOWN_HALL_FOUND.cost;
    const wantsCity = playerHalls(s, pid).length < ch.wantCities && p.res.wood >= found.wood + 40 && p.res.food >= found.food + 40;
    const site = wantsCity ? citySite(s, g, field) : null;
    if (site) {
      if (distance(g.hex, site) > 0) stepToward(s, g, site, false);
      if (g.hex.q === site.q && g.hex.r === site.r) foundTownHall(s, pid, g.id);
      continue;
    }
    if (capital && distance(g.hex, capital.hex) > 0 && !strongEnough) stepToward(s, g, capital.hex, false);
  }
  return attacks;
};
