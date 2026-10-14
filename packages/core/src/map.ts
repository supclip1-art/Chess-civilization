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
  if (s.neutrals[def.owner]) { capture(s, h.id, att.owner); att.hex = { ...defHex }; }
  else h.siege = { by: att.id, since: s.turn };
  return out;
};

/** Начало хода осаждающего: если прошёл полный ход и подкрепление не пришло — ратуша сдаётся. */
export const resolveSieges = (s: GameState, pid: string): void => {
  for (const h of Object.values(s.halls)) {
    const g = h.siege && s.generals[h.siege.by];
    if (!h.siege || !g || g.owner !== pid) continue;
    if (s.turn < h.siege.since + SIEGE_TURNS) continue;
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
      !(j.kind === 'resource' && s.cells[key(j.hex)]?.hall === hallId) && !(j.kind === 'townhall' && j.hallId === hallId));
  }
  h.level = Math.max(1, h.level - 1);
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
