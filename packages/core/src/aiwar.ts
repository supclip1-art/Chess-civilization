// Военный ИИ (этап 5): куда идут генералы компьютерных стран и кого атакуют.
// Ядро только двигает генералов и называет цели атаки; сами бои — шахматные партии — разыгрывает приложение
// (Stockfish), поэтому функция возвращает список атак, а приложение вызывает attack() и resolveBattle().
//
// Характер правителя:
//   warlike  — выходит в поход со стартовой армией, бьёт нейтралов при небольшом перевесе, игроков — с 8-го хода;
//   moderate — ждёт армию покрепче и нападает только при явном перевесе, игроков — с 15-го хода;
//   peaceful — расширяется основанием городов и захватом слабых нейтралов; на игроков нападает поздно (с 25-го хода),
//              редко (раз в 8 ходов) и только при большом перевесе; чужую армию со своей земли выбивает всегда.

import { armyValue, foundTownHall, hireSettler, playerGenerals, playerHalls, playerSettlers, settlerCost } from './economy.ts';
import { type Hex, distance, key, neighbors } from './hex.ts';
import { next } from './rng.ts';
import { move, reachable } from './map.ts';
import { aiDiplomacy, atWar } from './diplomacy.ts';
import { type Aggression } from './nations.ts';
import { type GameState, type General, PASSABLE } from './state.ts';

/** defense — отбиться (у стен столицы, снять осаду, выгнать со своей земли), offense — поход. */
export type AiAttack = { gid: string; target: Hex; defense: boolean };

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
  warlike: { vsNeutral: 1.05, vsPlayer: 0.9, playersFrom: 6, peace: 0, minArmy: 70, wantCities: 4 },
  moderate: { vsNeutral: 1.15, vsPlayer: 1.05, playersFrom: 8, peace: 1, minArmy: 90, wantCities: 5 },
  peaceful: { vsNeutral: 1.3, vsPlayer: 1.3, playersFrom: 14, peace: 4, minArmy: 100, wantCities: 6 },
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
  const warReady = (owner: string) => atWar(s, g.owner, owner); // со страной воюем, только когда война объявлена
  const out: Target[] = [];
  const mine = power(g);
  const myLand = new Set(Object.values(s.cells).filter((c) => c.owner === g.owner).map((c) => key(c.hex)));
  for (const x of Object.values(s.generals)) {
    if (x.owner === g.owner || armyValue(x.army) === 0) continue;
    const steps = stepsTo(field, x.hex);
    if (steps === Infinity) continue;
    // разбойников бьём только с явным перевесом: проигрыш оставляет столицу без армии
    if (x.owner === 'bandits') { if (mine >= 1.5 * power(x)) out.push({ hex: x.hex, steps, kind: 'neutral' }); continue; }
    if (s.neutrals[x.owner]) { if (mine >= ch.vsNeutral * power(x)) out.push({ hex: x.hex, steps, kind: 'neutral' }); continue; }
    if (!warReady(x.owner)) continue;
    if (myLand.has(key(x.hex)) && mine >= 1.25 * power(x)) { out.push({ hex: x.hex, steps, kind: 'intruder' }); continue; }
    if (mine >= ch.vsPlayer * power(x)) out.push({ hex: x.hex, steps, kind: 'army' });
  }
  // пустые города других игроков — осада
  {
    for (const h of Object.values(s.halls)) {
      if (h.owner === g.owner || !s.players[h.owner] || h.siege || !warReady(h.owner)) continue;
      if (Object.values(s.generals).some((x) => x.owner === h.owner && x.hex.q === h.hex.q && x.hex.r === h.hex.r && armyValue(x.army) > 0)) continue;
      const steps = stepsTo(field, h.hex);
      if (steps !== Infinity) out.push({ hex: h.hex, steps, kind: 'city' });
    }
  }
  // живой игрок — любимая цель: ИИ держит его в напряжении (цели у него кажутся на 3 хода ближе)
  for (const t of out) {
    const owner = Object.values(s.generals).find((x) => key(x.hex) === key(t.hex))?.owner ?? Object.values(s.halls).find((h) => key(h.hex) === key(t.hex))?.owner;
    if (owner && s.players[owner] && !s.players[owner].ai && t.kind !== 'neutral') t.steps -= 3;
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
  // дипломатия: мир при проигрыше, коалиции против агрессора, объявление войны по характеру
  aiDiplomacy(s, pid, { wantsWar: s.turn >= ch.playersFrom && s.turn - (p.ai.lastWar ?? -Infinity) >= ch.peace });
  // враг — разбойники и страны, с которыми идёт война
  const hostile = (owner: string) => owner !== pid && !s.neutrals[owner] && (owner === 'bandits' || atWar(s, pid, owner));
  const gens = playerGenerals(s, pid).sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
  const besieged = Object.values(s.halls).filter((h) => h.owner === pid && h.siege);
  // гарнизоны: второй генерал — в столице, следующие — в остальных городах по порядку основания/захвата
  // после столицы гарнизон получают города, к которым ближе всего чужие армии (игроков и разбойников)
  const danger = (h: Hex) => Math.min(99, ...Object.values(s.generals)
    .filter((x) => hostile(x.owner) && !x.settler && armyValue(x.army) > 0).map((x) => distance(x.hex, h)));
  const all = playerHalls(s, pid).sort((a, b) => a.order - b.order);
  const halls = [all[0], ...all.slice(1).sort((a, b) => danger(a.hex) - danger(b.hex) || b.level - a.level)].filter(Boolean);
  // гарнизон не бегает между городами каждый ход: кто уже стоит в городе из списка — там и остаётся
  const post = new Map<string, Hex>();
  const free = gens.slice(1);
  for (const h of halls.slice(0, free.length)) {
    const here = free.find((g) => !post.has(g.id) && key(g.hex) === key(h.hex));
    if (here) post.set(here.id, h.hex);
  }
  for (const h of halls.slice(0, free.length)) {
    if ([...post.values()].some((x) => key(x) === key(h.hex))) continue;
    const g = free.filter((x) => !post.has(x.id)).sort((a, b) => distance(a.hex, h.hex) - distance(b.hex, h.hex))[0];
    if (g) post.set(g.id, h.hex);
  }
  // город защищён, если в нём уже стоит своя армия (не просто назначена)
  const guardedHex = new Set(gens.filter((x) => armyValue(x.army) >= 40).map((x) => key(x.hex)));
  for (const g of gens) {
    if (g.attacked) continue;
    // гарнизон: бьёт тех, кто подошёл к стенам его города, иначе стоит в городе
    const home = post.get(g.id);
    if (home) {
      const atWalls = Object.values(s.generals).find((x) => x.owner !== pid && armyValue(x.army) > 0 && !s.neutrals[x.owner]
        && distance(x.hex, home) <= 1 && power(g) >= 0.9 * power(x));
      if (atWalls && distance(g.hex, atWalls.hex) === 1) { attacks.push({ gid: g.id, target: atWalls.hex, defense: true }); continue; }
      // без фигур гарнизон бесполезен — сначала набирает их у столицы (там казарма)
      const recruit = armyValue(g.army) < 40 && capital && (capital.barracks ?? 0) > 0 ? capital.hex : home;
      if (key(g.hex) !== key(recruit)) stepToward(s, g, recruit, false);
      continue;
    }
    // полевая армия: враг у своего города без гарнизона — сначала защитить
    const threat = armyValue(g.army) > 0 ? Object.values(s.generals)
      .filter((x) => hostile(x.owner) && !x.settler && armyValue(x.army) > 0
        && halls.some((h) => !guardedHex.has(key(h.hex)) && distance(h.hex, x.hex) <= 3) && power(g) >= 1.25 * power(x))
      .sort((a, b) => distance(a.hex, g.hex) - distance(b.hex, g.hex))[0] : undefined;
    if (threat && distance(g.hex, threat.hex) <= 10) {
      if (distance(g.hex, threat.hex) > 1) stepToward(s, g, threat.hex, true);
      if (distance(g.hex, threat.hex) === 1) attacks.push({ gid: g.id, target: threat.hex, defense: true });
      continue;
    }
    // враг сильнее, а столица пуста — полевая армия возвращается и садится в неё: обороняющийся в своём городе
    // сильнее («Укрепления»), а пустой город берут без боя
    // пока столицу некому охранять, а рядом бродят чужие армии, полевая армия далеко не уходит
    let leash = Infinity;
    if (capital && armyValue(g.army) > 0 && !guardedHex.has(key(capital.hex))) {
      const near = Object.values(s.generals).filter((x) => hostile(x.owner) && !x.settler
        && armyValue(x.army) > 0 && distance(x.hex, capital.hex) <= 8);
      if (near.some((x) => distance(x.hex, capital.hex) <= 4 || power(x) > power(g))) {
        if (key(g.hex) !== key(capital.hex)) stepToward(s, g, capital.hex, false);
        continue;
      }
      if (near.length) leash = 3;
    }
    // свой город в осаде — главная армия идёт снимать осаду
    const siegeBy = besieged.map((h) => s.generals[h.siege!.by]).find((x) => x && armyValue(x.army) > 0);
    if (siegeBy && armyValue(g.army) > 0) {
      if (distance(g.hex, siegeBy.hex) > 1) stepToward(s, g, siegeBy.hex, true);
      if (distance(g.hex, siegeBy.hex) === 1 && power(g) >= 0.8 * power(siegeBy)) attacks.push({ gid: g.id, target: siegeBy.hex, defense: true });
      continue;
    }
    // идёт осада: стоять у стен, пока город не сдастся в начале следующего хода
    if (Object.values(s.halls).some((h) => h.siege?.by === g.id && distance(h.hex, g.hex) === 1)) continue;
    // чужой поселенец рядом — лёгкая добыча (если с этой страной уже можно воевать или он на нашей земле)
    const prey = armyValue(g.army) > 0 ? Object.values(s.generals).find((x) => x.settler && x.owner !== pid && s.players[x.owner]
      && distance(x.hex, g.hex) === 1 && atWar(s, pid, x.owner)) : undefined;
    if (prey) { attacks.push({ gid: g.id, target: prey.hex, defense: false }); continue; }
    const field = pathField(s, g);
    const targets = armyValue(g.army) >= ch.minArmy || armyValue(g.army) > 0 ? targetsFor(s, g, field) : [];
    const strongEnough = armyValue(g.army) >= ch.minArmy;
    // из столицы полевая армия уходит, только когда рядом гарнизон, готовый сразу её занять (он ходит после неё)
    const relief = capital && gens.slice(1).some((x) => armyValue(x.army) >= 40 && distance(x.hex, capital.hex) <= 2);
    const prowl = capital && Object.values(s.generals).some((x) => hostile(x.owner) && !x.settler
      && armyValue(x.army) > 0 && distance(x.hex, capital.hex) <= 10);
    if (capital && key(g.hex) === key(capital.hex) && !relief && prowl && s.turn >= 6) leash = Math.min(leash, 1);
    const near = capital ? targets.filter((t) => distance(t.hex, capital.hex) <= leash) : targets;
    const goal = near.find((t) => t.kind === 'intruder') ?? (strongEnough ? near[0] : undefined);
    if (goal) {
      if (distance(g.hex, goal.hex) > 1) stepToward(s, g, goal.hex, true);
      if (distance(g.hex, goal.hex) === 1) {
        attacks.push({ gid: g.id, target: goal.hex, defense: goal.kind === 'intruder' });
        if (goal.kind === 'army' || goal.kind === 'city') p.ai.lastWar = s.turn;
      }
      continue;
    }
    // целей нет. В начале партии полевая армия разведывает окрестности столицы — не дальше 5 клеток,
    // чтобы за ход-два вернуться домой (возврат при опасности — выше)
    if (capital && g === gens[0] && s.turn < 30 && !prowl) {
      const reached = !p.ai.scout || distance(g.hex, p.ai.scout) <= 1 || distance(p.ai.scout, capital.hex) > 5;
      if (reached) {
        const spots = [...field.keys()].map((k) => { const [q, r] = k.split(',').map(Number); return { q, r }; })
          .filter((h) => { const d = distance(h, capital.hex); return d >= 3 && d <= 5 && !s.cells[key(h)].owner; });
        p.ai.scout = spots.length ? spots[Math.floor(next(s.rng) * spots.length)] : undefined;
      }
      if (p.ai.scout) { stepToward(s, g, p.ai.scout, false); continue; }
    }
    // возвращаемся домой набирать армию
    if (capital && distance(g.hex, capital.hex) > 0 && !strongEnough) stepToward(s, g, capital.hex, false);
  }
  // новые города основывают поселенцы: нанимаем одного в столице и ведём к хорошему месту
  const settlers = playerSettlers(s, pid);
  const cost = settlerCost(s, pid);
  if (capital && !settlers.length && playerHalls(s, pid).length < ch.wantCities
    && p.res.wood >= cost.wood + 40 && p.res.food >= cost.food + 40) hireSettler(s, pid, capital.id);
  for (const st of settlers) {
    if (p.jobs.some((j) => j.kind === 'found' && j.general === st.id)) continue;
    const site = citySite(s, st, pathField(s, st));
    if (!site) continue;
    if (distance(st.hex, site) > 0) stepToward(s, st, site, false);
    if (st.hex.q === site.q && st.hex.r === site.r) foundTownHall(s, pid, st.id);
  }
  return attacks;
};
