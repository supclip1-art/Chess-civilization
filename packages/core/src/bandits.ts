// Бродячие разбойники, как варвары в «Цивилизации»: несколько армий бродят по карте, нападают на слабые армии,
// убивают поселенцев и грабят города без защиты. Их можно разбить — это обычный шахматный бой.

import { STARTING_ARMY, type Piece } from './config.ts';
import { armyValue } from './economy.ts';
import { type Hex, distance, key } from './hex.ts';
import { findPath, move, reachable } from './map.ts';
import { power } from './aiwar.ts';
import { int } from './rng.ts';
import { type Army, type GameState, type General, PASSABLE, makeGeneral, say } from './state.ts';

export const BANDITS = 'bandits';
export const BANDIT_COUNT = 6; // устарело: шаек столько, сколько игроков
const RESPAWN_EVERY = 8; // раз в столько ходов появляется новая шайка, если их меньше BANDIT_COUNT
const HUNT_RANGE = 6; // дальше этого разбойники добычу не ищут
const LEASH = 8; // и не уходят от лагеря дальше
const CALM_UNTIL = 8; // первые ходы разбойники только бродят — игрокам нужно время на армию
const RAIDS_FROM = 12; // на города — ещё позже
const RAID_COOLDOWN = 8; // один город грабят не чаще

/** Состав шайки: в начале — как стартовая армия игрока, потом крепче. */
export const banditArmy = (turn: number): Army =>
  turn < 20 ? { ...STARTING_ARMY } : turn < 40 ? { p: 6, n: 1, b: 1, r: 0, q: 0 } : { p: 8, n: 2, b: 1, r: 1, q: 0 };

export const isBandit = (s: GameState, gid: string): boolean => s.generals[gid]?.owner === BANDITS;
export const bandits = (s: GameState): General[] => Object.values(s.generals).filter((g) => g.owner === BANDITS);

/** Поставить шайку недалеко от столицы игрока: на ничейной земле в 5–7 клетках от неё, не вплотную к чужим городам и армиям. */
const spawnNear = (s: GameState, pid: string): boolean => {
  const cap = Object.values(s.halls).filter((h) => h.owner === pid).sort((a, b) => a.order - b.order)[0];
  if (!cap) return false;
  const halls = Object.values(s.halls);
  const spots = Object.values(s.cells).filter((c) => PASSABLE[c.terrain] && !c.owner
    && distance(c.hex, cap.hex) >= 5 && distance(c.hex, cap.hex) <= 7
    && halls.every((h) => distance(h.hex, c.hex) >= 4)
    && Object.values(s.generals).every((g) => distance(g.hex, c.hex) >= 3));
  if (!spots.length) return false;
  const c = spots[int(s.rng, 0, spots.length - 1)];
  const g = makeGeneral(s, BANDITS, { ...c.hex }, s.settings.elo, banditArmy(s.turn), 'Bandits');
  g.moveLeft = 0;
  g.camp = { ...c.hex };
  return true;
};

/** Шайки по числу игроков — по одной у каждого, чтобы давление было ровным, а не кучей у одного. */
export const spawnBandits = (s: GameState, _count?: number): number => {
  let made = 0;
  for (const pid of s.order) if (s.players[pid].alive && spawnNear(s, pid)) made++;
  return made;
};

/** Есть ли у игрока «своя» шайка (лагерь недалеко от его столицы). */
const hasBand = (s: GameState, pid: string): boolean => {
  const cap = Object.values(s.halls).filter((h) => h.owner === pid).sort((a, b) => a.order - b.order)[0];
  return !!cap && bandits(s).some((b) => distance(b.camp ?? b.hex, cap.hex) <= 9);
};

/** Набег на город без защиты: разбойники уносят треть золота и ломают одно здание на его земле. */
export const raidCity = (s: GameState, gid: string, hallId: string): void => {
  const g = s.generals[gid];
  const h = s.halls[hallId];
  const p = s.players[h.owner];
  g.attacked = true;
  g.moveLeft = 0;
  h.raidedAt = s.turn;
  if (!p) return;
  const gold = Math.floor(p.res.gold / 3);
  p.res.gold -= gold;
  const built = Object.values(s.cells).filter((c) => c.hall === hallId && c.building);
  let ruined = '';
  if (built.length) {
    const c = built[int(s.rng, 0, built.length - 1)];
    ruined = c.building!.kind;
    if (c.building!.level > 1) c.building!.level--; else c.building = undefined;
  }
  say(s, `bandits raided ${h.name}: ${gold} gold stolen${ruined ? `, a ${ruined} damaged` : ''}`, h.owner);
};

export type BanditAttack = { gid: string; target: Hex };

/** Ход разбойников (раз за круг): появляются новые шайки, остальные идут к добыче или бродят.
 *  Возвращает нападения на армии и поселенцев — бои проводит приложение; набеги на города — сразу. */
export const banditsTurn = (s: GameState): BanditAttack[] => {
  if (s.banditsAt === s.turn) return []; // уже ходили в этом круге
  s.banditsAt = s.turn;
  // раз в RESPAWN_EVERY ходов — новая шайка у одного игрока, рядом с которым своей шайки уже нет
  if (s.turn > 1 && s.turn % RESPAWN_EVERY === 0) {
    const lonely = s.order.filter((pid) => s.players[pid].alive && !hasBand(s, pid));
    if (lonely.length) spawnNear(s, lonely[int(s.rng, 0, lonely.length - 1)]);
  }
  const out: BanditAttack[] = [];
  for (const b of bandits(s)) {
    b.moveLeft = 2;
    b.attacked = false;
    if (armyValue(b.army) === 0) { delete s.generals[b.id]; continue; }
    const camp = b.camp ?? b.hex;
    // добыча: поселенцы, армии слабее, города без армии
    const prey: { hex: Hex; d: number; hallId?: string }[] = [];
    if (s.turn >= CALM_UNTIL) for (const x of Object.values(s.generals)) {
      if (!s.players[x.owner] || distance(x.hex, b.hex) > HUNT_RANGE || distance(x.hex, camp) > LEASH) continue;
      // поселенцы и армии равной силы или слабее
      if (x.settler || (armyValue(x.army) > 0 && power(b) >= power(x))) prey.push({ hex: x.hex, d: distance(x.hex, b.hex) });
    }
    for (const h of Object.values(s.halls)) {
      if (s.turn < RAIDS_FROM || !s.players[h.owner] || distance(h.hex, b.hex) > HUNT_RANGE || distance(h.hex, camp) > LEASH) continue;
      if (h.raidedAt !== undefined && s.turn - h.raidedAt < RAID_COOLDOWN) continue;
      const guarded = Object.values(s.generals).some((x) => x.owner === h.owner && key(x.hex) === key(h.hex) && armyValue(x.army) > 0);
      if (!guarded) prey.push({ hex: h.hex, d: distance(h.hex, b.hex), hallId: h.id });
    }
    prey.sort((a, z) => a.d - z.d);
    const goal = prey.find((t) => findPath(s, b.id, t.hex));
    if (goal) {
      if (distance(b.hex, goal.hex) > 1) {
        const path = findPath(s, b.id, goal.hex)!;
        const reach = reachable(s, b.id);
        for (let i = Math.min(path.length - 1, b.moveLeft); i > 0; i--) if (reach.has(key(path[i]))) { move(s, b.id, path[i]); break; }
      }
      if (distance(b.hex, goal.hex) === 1) {
        if (goal.hallId) {
          const defended = Object.values(s.generals).some((x) => x.owner !== BANDITS && key(x.hex) === key(goal.hex) && armyValue(x.army) > 0);
          if (!defended) raidCity(s, b.id, goal.hallId);
        } else out.push({ gid: b.id, target: goal.hex });
      }
      continue;
    }
    // бродим вокруг лагеря
    const all = [...reachable(s, b.id).keys()].filter((k) => k !== key(b.hex));
    const near = all.filter((k) => { const [q, r] = k.split(',').map(Number); return distance({ q, r }, camp) <= 3; });
    const options = near.length ? near : all;
    if (options.length) {
      const k = options[int(s.rng, 0, options.length - 1)];
      const [q, r] = k.split(',').map(Number);
      move(s, b.id, { q, r });
    }
  }
  return out;
};

/** Сила шайки для подсказок. */
export const banditPieces = (g: General): number => (Object.keys(g.army) as Piece[]).reduce((n, p) => n + g.army[p], 0);
