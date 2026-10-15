// Карта: передвижение, туман войны, атака, осада, захват ратуши с разграблением, выбывание.

import { applyBattle, type BattleOutcome, type BattleReport } from './army.ts';
import { ARMY_MOVE, FOG_RADIUS, SIEGE_TURNS } from './config.ts';
import { type Result, armyValue, playerHalls } from './economy.ts';
import { type Hex, distance, key, neighbors, range } from './hex.ts';
import { NATIONS } from './nations.ts';
import { type GameState, type General, type TownHall, PASSABLE, recomputeTerritory, say } from './state.ts';

const no = (reason: string): Result => ({ ok: false, reason });

const hallAt = (s: GameState, hex: Hex): TownHall | undefined =>
  Object.values(s.halls).find((h) => h.hex.q === hex.q && h.hex.r === hex.r);

const generalsAt = (s: GameState, hex: Hex): General[] =>
  Object.values(s.generals).filter((g) => g.hex.q === hex.q && g.hex.r === hex.r);

/** Защитник клетки: генерал с армией, который не принадлежит атакующему. */
const defenderAt = (s: GameState, hex: Hex, attackerOwner: string): General | undefined =>
  generalsAt(s, hex)
    .filter((g) => g.owner !== attackerOwner && armyValue(g.army) > 0)
    .sort((a, b) => armyValue(b.army) - armyValue(a.army))[0];

// ---------- Передвижение ----------

/** Клетки, куда генерал может дойти в этот ход (не больше ARMY_MOVE клеток, в обход гор, воды и чужих армий). */
export const reachable = (s: GameState, gid: string): Map<string, number> => {
  const g = s.generals[gid];
  const dist = new Map<string, number>([[key(g.hex), 0]]);
  const queue: Hex[] = [g.hex];
  while (queue.length) {
    const cur = queue.shift()!;
    const d = dist.get(key(cur))!;
    if (d >= g.moveLeft) continue;
    for (const n of neighbors(cur)) {
      const k = key(n);
      const c = s.cells[k];
      if (!c || !PASSABLE[c.terrain] || dist.has(k)) continue;
      if (generalsAt(s, n).some((x) => x.owner !== g.owner)) continue; // чужая армия — только атакой
      const h = hallAt(s, n);
      if (h && h.owner !== g.owner) continue; // чужая ратуша — только осадой
      dist.set(k, d + 1);
      queue.push(n);
    }
  }
  return dist;
};

export const move = (s: GameState, gid: string, to: Hex): Result => {
  const g = s.generals[gid];
  if (!g) return no('no such general');
  const d = reachable(s, gid).get(key(to));
  if (d === undefined || d === 0) return no('too far for this turn');
  g.hex = { ...to };
  g.moveLeft -= d;
  for (const h of Object.values(s.halls)) if (h.siege?.by === gid && distance(h.hex, g.hex) > 1) h.siege = undefined;
  return { ok: true };
};

// ---------- Приказы: поход к клетке, разведка, стоять ----------

/** Можно ли генералу пройти через клетку (те же правила, что у reachable). */
const passableFor = (s: GameState, g: General, n: Hex): boolean => {
  const c = s.cells[key(n)];
  if (!c || !PASSABLE[c.terrain]) return false;
  if (generalsAt(s, n).some((x) => x.owner !== g.owner)) return false;
  const h = hallAt(s, n);
  return !(h && h.owner !== g.owner);
};

/** Кратчайший путь генерала к клетке через всю карту (без учёта очков хода). Если в саму клетку войти нельзя
 *  (чужая армия или город), путь ведёт к соседней с ней. null — пути нет. */
export const findPath = (s: GameState, gid: string, to: Hex): Hex[] | null => {
  const g = s.generals[gid];
  const goal = key(to);
  const enterable = passableFor(s, g, to);
  const prev = new Map<string, string | null>([[key(g.hex), null]]);
  const queue: Hex[] = [g.hex];
  let end: string | null = null;
  while (queue.length && !end) {
    const cur = queue.shift()!;
    const ck = key(cur);
    if (ck === goal || (!enterable && distance(cur, to) === 1)) { end = ck; break; }
    for (const n of neighbors(cur)) {
      const k = key(n);
      if (prev.has(k) || !passableFor(s, g, n)) continue;
      prev.set(k, ck);
      queue.push(n);
    }
  }
  if (!end) return null;
  const path: Hex[] = [];
  for (let k: string | null = end; k; k = prev.get(k) ?? null) { const [q, r] = k.split(',').map(Number); path.unshift({ q, r }); }
  return path; // path[0] — где генерал стоит сейчас
};

/** Ближайшая проходимая клетка, которую игрок ещё ни разу не видел, — цель разведки. */
export const exploreGoal = (s: GameState, gid: string): Hex | null => {
  const g = s.generals[gid];
  const mem = s.memory?.[g.owner] ?? {};
  const seen = new Set([key(g.hex)]);
  const queue: Hex[] = [g.hex];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of neighbors(cur)) {
      const k = key(n);
      if (seen.has(k) || !passableFor(s, g, n)) continue;
      seen.add(k);
      if (!mem[k]) return n;
      queue.push(n);
    }
  }
  return null;
};

/** Сделать шаг по приказу: дойти по пути так далеко, как позволяют очки хода. */
const stepAlong = (s: GameState, gid: string, path: Hex[]): boolean => {
  const g = s.generals[gid];
  const reach = reachable(s, gid);
  for (let i = Math.min(path.length - 1, g.moveLeft); i > 0; i--) {
    if (reach.has(key(path[i]))) return move(s, gid, path[i]).ok;
  }
  return false;
};

const enemyNear = (s: GameState, g: General): General | undefined =>
  Object.values(s.generals).find((x) => x.owner !== g.owner && armyValue(x.army) > 0 && distance(x.hex, g.hex) <= 2);

/** Выполнить приказы генералов игрока (в начале его хода). Возвращает, что произошло, — для уведомлений. */
export const runOrders = (s: GameState, pid: string): { gid: string; text: string }[] => {
  const out: { gid: string; text: string }[] = [];
  for (const g of Object.values(s.generals)) {
    if (g.owner !== pid || !g.order || g.order.kind === 'hold' || g.attacked || g.moveLeft <= 0) continue;
    if (g.order.kind === 'goto') {
      const to = g.order.to;
      const path = findPath(s, g.id, to);
      if (!path) { g.order = undefined; out.push({ gid: g.id, text: 'the way is blocked — the march order is cancelled' }); continue; }
      if (path.length > 1) stepAlong(s, g.id, path);
      const arrived = key(g.hex) === key(to) || (findPath(s, g.id, to)?.length ?? 2) <= 1;
      if (arrived) { g.order = undefined; out.push({ gid: g.id, text: 'has arrived' }); continue; }
    } else {
      // разведка: несколько шагов, пока есть очки хода и куда идти
      for (let guard = 0; guard < 4 && g.moveLeft > 0; guard++) {
        const goal = exploreGoal(s, g.id);
        if (!goal) { g.order = undefined; out.push({ gid: g.id, text: 'has explored everything it can reach' }); break; }
        const path = findPath(s, g.id, goal);
        if (!path || !stepAlong(s, g.id, path)) break;
        remember(s, pid);
      }
    }
    remember(s, pid);
    const foe = enemyNear(s, g);
    if (foe && g.order) { g.order = undefined; out.push({ gid: g.id, text: 'stopped: an enemy army is near' }); }
  }
  return out;
};

// ---------- Туман войны ----------

/** Видимые игроку клетки: 2 клетки от края его территории и 2 клетки вокруг его генералов. */
export const visible = (s: GameState, pid: string): Set<string> => {
  const seen = new Set<string>();
  const add = (h: Hex) => { for (const x of range(h, FOG_RADIUS)) if (s.cells[key(x)]) seen.add(key(x)); };
  for (const c of Object.values(s.cells)) if (c.owner === pid) add(c.hex);
  for (const g of Object.values(s.generals)) if (g.owner === pid) add(g.hex);
  return seen;
};

/** Запомнить, что игрок видит сейчас: владельцев клеток, здания и города. Под туманом карта показывает эту память. */
export const remember = (s: GameState, pid: string, seen: Set<string> = visible(s, pid)): void => {
  const mem = ((s.memory ??= {})[pid] ??= {});
  const hallAt = new Map(Object.values(s.halls).map((h) => [key(h.hex), h]));
  for (const k of seen) {
    const c = s.cells[k];
    const h = hallAt.get(k);
    mem[k] = {
      turn: s.turn,
      owner: c.owner,
      building: c.building ? { ...c.building } : undefined,
      hall: h ? { name: h.name, owner: h.owner, level: h.level } : undefined,
    };
  }
};

// ---------- Атака и осада ----------

export type AttackStart =
  | { kind: 'battle'; attacker: string; defender: string }
  | { kind: 'siege'; hall: string }
  | { kind: 'error'; reason: string };

/** Атака соседней клетки: там армия — бой; там пустая чужая ратуша — осада на один полный ход. */
export const attack = (s: GameState, gid: string, target: Hex): AttackStart => {
  const g = s.generals[gid];
  if (!g || !s.players[g.owner]) return { kind: 'error', reason: 'no such general' };
  if (g.attacked) return { kind: 'error', reason: 'this army has already attacked this turn' };
  if (armyValue(g.army) === 0) return { kind: 'error', reason: 'the army has no pieces' };
  if (distance(g.hex, target) !== 1) return { kind: 'error', reason: 'you can only attack a neighbouring cell' };
  const def = defenderAt(s, target, g.owner);
  if (def) return { kind: 'battle', attacker: gid, defender: def.id };
  const h = hallAt(s, target);
  if (h && h.owner !== g.owner) {
    h.siege = { by: gid, since: s.turn };
    g.attacked = true;
    say(s, `siege of ${h.name} begins`, g.owner);
    return { kind: 'siege', hall: h.id };
  }
  return { kind: 'error', reason: 'nothing to attack here' };
};

/** Итог боя на карте: армии по правилам боя; при победе над гарнизоном нейтрала — сразу захват,
 *  при победе над армией у вражеской ратуши — начинается осада. */
export const resolveBattle = (s: GameState, attackerId: string, defenderId: string, report: BattleReport): BattleOutcome => {
  const att = s.generals[attackerId];
  const def = s.generals[defenderId];
  const defHex = { ...def.hex };
  const out = applyBattle(s, attackerId, defenderId, report);
  if (out.winner !== 'attacker') return out;
  const h = hallAt(s, defHex);
  if (!h || h.owner === att.owner) return out;
  // защитники города разбиты: если других армий в городе нет — город сразу переходит к победителю
  if (defenderAt(s, defHex, att.owner)) { h.siege = { by: att.id, since: s.turn }; return out; }
  const old = h.owner;
  capture(s, h.id, att.owner);
  att.hex = { ...defHex };
  // уцелевшие генералы прежнего хозяина (например, отступивший последний) уходят в свою столицу
  const home = playerHalls(s, old).sort((a, b) => a.order - b.order)[0];
  for (const g of Object.values(s.generals)) {
    if (g.owner !== old || key(g.hex) !== key(defHex)) continue;
    if (home) { g.hex = { ...home.hex }; g.moveLeft = 0; } else delete s.generals[g.id];
  }
  return out;
};

/** Начало хода осаждающего: если прошёл полный ход и подкрепление не пришло — ратуша сдаётся. */
export const resolveSieges = (s: GameState, pid: string): void => {
  for (const h of Object.values(s.halls)) {
    const g = h.siege && s.generals[h.siege.by];
    if (!h.siege || !g || g.owner !== pid) continue;
    const castles = s.players[h.owner] && NATIONS[s.players[h.owner].nation].mods.castles;
    if (s.turn < h.siege.since + SIEGE_TURNS + (castles ? 1 : 0)) continue; // японский замок держится 2 хода
    if (distance(g.hex, h.hex) > 1) { h.siege = undefined; continue; }
    if (defenderAt(s, h.hex, pid)) { h.siege = undefined; say(s, `reinforcements lifted the siege`, pid); continue; }
    capture(s, h.id, pid);
    g.hex = { ...h.hex };
  }
};

// ---------- Захват и выбывание ----------

/** Захват ратуши: здания её зоны теряют уровень (1-й — разрушается), ратуша — тоже, но не ниже 1-го. */
export const capture = (s: GameState, hallId: string, newOwner: string): void => {
  const h = s.halls[hallId];
  const old = h.owner;
  for (const c of Object.values(s.cells)) {
    if (c.hall !== hallId) continue;
    if (c.building && c.building.level > 1) c.building.level--;
    else c.building = undefined;
    c.reserved = false;
  }
  const oldPlayer = s.players[old];
  if (oldPlayer) {
    oldPlayer.jobs = oldPlayer.jobs.filter((j) =>
      !(j.kind === 'resource' && s.cells[key(j.hex)]?.hall === hallId) && !((j.kind === 'townhall' || j.kind === 'barracks' || j.kind === 'tavern') && j.hallId === hallId));
    oldPlayer.queue = oldPlayer.queue?.filter((q) => !('hallId' in q.job && q.job.hallId === hallId));
  }
  if (!(oldPlayer && NATIONS[oldPlayer.nation].mods.castles)) { // японский замок ничего не теряет
    h.level = Math.max(1, h.level - 1);
    if (h.barracks) h.barracks--;
    if (h.tavern) h.tavern--;
  }
  h.owner = newOwner;
  h.siege = undefined;
  if (s.neutrals[old]) {
    delete s.neutrals[old];
    for (const g of Object.values(s.generals)) if (g.owner === old) delete s.generals[g.id];
  }
  recomputeTerritory(s);
  say(s, `${h.name} is captured`, newOwner);
  if (oldPlayer && playerHalls(s, old).length === 0) {
    oldPlayer.alive = false;
    for (const g of Object.values(s.generals)) if (g.owner === old) delete s.generals[g.id];
    say(s, `${NATIONS[oldPlayer.nation].name} is out of the game`, newOwner);
  }
};

/** Победитель — когда в игре остался один игрок. */
export const winner = (s: GameState): string | null => {
  const alive = s.order.filter((id) => s.players[id].alive);
  return alive.length === 1 ? alive[0] : null;
};
