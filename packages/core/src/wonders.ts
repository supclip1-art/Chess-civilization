// Чудеса света и морские торговые пути.
//   • Чудо света — одно на всю карту: кто достроил первым, тот и владеет. Игрок строит не больше одного чуда
//     за партию и только в столице 3-го уровня. Начатую стройку видят все — идёт гонка: проигравшим
//     возвращается половина вложенного, и они могут взяться за другое чудо. Бонус чуда — у хозяина города:
//     захватил город — забрал и чудо.
//   • Морской торговый путь — как дорога, только по воде: два своих приморских города (на их земле есть море),
//     соединённые водой, приносят золото каждый ход, пока оба у одного хозяина.

import { ARMY_MAX, type Res } from './config.ts';
import { buildTurns, canAfford, freeBuilders, playerHalls } from './economy.ts';
import { key, neighbors, range } from './hex.ts';
import { NATIONS } from './nations.ts';
import { type GameState, type Job, hasWonder, say } from './state.ts';

type Result = { ok: true } | { ok: false; reason: string };
const ok: Result = { ok: true };
const no = (reason: string): Result => ({ ok: false, reason });
const res = (wood: number, food: number, gold = 0): Res => ({ wood, food, gold });

export type WonderId = 'pyramids' | 'greatwall' | 'gardens' | 'library' | 'terracotta' | 'oracle' | 'silkroad' | 'colossus' | 'lighthouse';
export const WONDER_IDS: WonderId[] = ['pyramids', 'greatwall', 'gardens', 'library', 'terracotta', 'oracle', 'silkroad', 'colossus', 'lighthouse'];
export const WONDERS: Record<WonderId, { name: string; text: string; icon: string }> = {
  pyramids: { name: 'Pyramids', text: 'one more builder in every city', icon: '◭' },
  greatwall: { name: 'Great Wall', text: 'every city holds a siege a turn longer; no bandit camps appear near you', icon: '▥' },
  gardens: { name: 'Hanging Gardens', text: '+20% food; growing a city costs a quarter less', icon: '❀' },
  library: { name: 'Great Library', text: 'technologies and Tactics cost 30% less', icon: '✎' },
  terracotta: { name: 'Terracotta Army', text: 'every 5 turns each general gets a free pawn', icon: '♟' },
  oracle: { name: 'Oracle', text: 'every rival army is visible, even in the fog of war', icon: '◉' },
  silkroad: { name: 'Silk Road', text: 'trade at 1:1 even without a market; +10% gold', icon: '≋' },
  colossus: { name: 'Colossus', text: 'every sea cell next to your cities gives +2 gold', icon: '♆' },
  lighthouse: { name: 'Lighthouse', text: 'the sea within 6 cells of your shores is always visible', icon: '✺' },
};
export const WONDER = { cost: res(250, 200, 150), turns: 6, cityLevel: 3 };
export const TERRACOTTA_EVERY = 5;
export const LIGHTHOUSE_RANGE = 6;

const capitalOf = (s: GameState, pid: string) => playerHalls(s, pid).sort((a, b) => a.order - b.order)[0];

/** Чем занято чудо: построено (кем и где), строится (кем) или свободно. */
export const wonderStatus = (s: GameState, id: WonderId): { built?: { owner: string; hallId: string }; building: string[] } => {
  const w = s.wonders?.[id];
  const building = Object.values(s.players).filter((p) => p.alive && p.jobs.some((j) => j.kind === 'wonder' && j.wonder === id)).map((p) => p.id);
  return { built: w ? { owner: s.halls[w.hallId]?.owner, hallId: w.hallId } : undefined, building };
};

/** Почему игрок не может начать это чудо (или null — может). */
export const wonderBlocked = (s: GameState, pid: string, id: WonderId): string | null => {
  const p = s.players[pid];
  if (!p) return 'no such player';
  if (s.wonders?.[id]) return 'this wonder is already built';
  if (p.wonder) return s.wonders?.[p.wonder] && s.wonders[p.wonder].builder === pid ? 'you have already built a wonder in this game' : 'you are already building a wonder';
  const cap = capitalOf(s, pid);
  if (!cap) return 'you have no capital';
  if (cap.level < WONDER.cityLevel) return `the capital must be level ${WONDER.cityLevel}`;
  if (freeBuilders(s, pid, cap.id) < 1) return `all builders of ${cap.name} are busy`;
  if (!canAfford(p.res, WONDER.cost)) return 'not enough resources';
  return null;
};

export const startWonder = (s: GameState, pid: string, id: WonderId): Result => {
  const why = wonderBlocked(s, pid, id);
  if (why) return no(why);
  const p = s.players[pid], cap = capitalOf(s, pid)!;
  p.res.wood -= WONDER.cost.wood; p.res.food -= WONDER.cost.food; p.res.gold -= WONDER.cost.gold;
  p.wonder = id;
  p.jobs.push({ kind: 'wonder', hallId: cap.id, wonder: id, finish: s.turn + buildTurns(s, pid, WONDER.turns) });
  // о начале стройки узнают все — начинается гонка
  for (const o of Object.values(s.players)) if (o.alive) say(s, o.id === pid ? `work on the ${WONDERS[id].name} begins in ${cap.name}` : `${NATIONS[p.nation].name} began building the ${WONDERS[id].name}`, o.id);
  return ok;
};

/** Достроено (вызывается из completeJobs). Соперникам, строившим то же чудо, — половина вложенного назад. */
export const completeWonder = (s: GameState, pid: string, j: Extract<Job, { kind: 'wonder' }>): void => {
  const p = s.players[pid];
  const h = s.halls[j.hallId];
  const id = j.wonder as WonderId;
  if (!h || h.owner !== pid || s.wonders?.[id]) { if (p.wonder === id) p.wonder = undefined; return; }
  (s.wonders ??= {})[id] = { hallId: h.id, builder: pid, turn: s.turn };
  for (const o of Object.values(s.players)) {
    if (o.id === pid || !o.alive) continue;
    const i = o.jobs.findIndex((x) => x.kind === 'wonder' && x.wonder === id);
    if (i >= 0) {
      o.jobs.splice(i, 1);
      o.res.wood += Math.floor(WONDER.cost.wood / 2); o.res.food += Math.floor(WONDER.cost.food / 2); o.res.gold += Math.floor(WONDER.cost.gold / 2);
      o.wonder = undefined;
      say(s, `${NATIONS[p.nation].name} finished the ${WONDERS[id].name} first — half of our investment is returned`, o.id);
    } else say(s, `${NATIONS[p.nation].name} completed the ${WONDERS[id].name}`, o.id);
  }
  say(s, `the ${WONDERS[id].name} is complete in ${h.name}: ${WONDERS[id].text}`, pid);
};

// ---------- бонусы, которые не помещаются в одну строку правил ----------

/** Начало хода: «Терракотовая армия» раз в 5 ходов даёт каждому генералу пешку. */
export const wonderTick = (s: GameState, pid: string): void => {
  if (!hasWonder(s, pid, 'terracotta') || s.turn % TERRACOTTA_EVERY !== 0) return;
  let n = 0;
  for (const g of Object.values(s.generals)) if (g.owner === pid && !g.settler && g.army.p < ARMY_MAX.p) { g.army.p++; n++; }
  if (n) say(s, `the Terracotta Army sends ${n} pawn${n > 1 ? 's' : ''} to your generals`, pid);
};

/** Морские клетки рядом со своими городами («Колосс»: +2 золота за каждую). */
export const colossusGold = (s: GameState, pid: string): number => {
  if (!hasWonder(s, pid, 'colossus')) return 0;
  const sea = new Set<string>();
  for (const h of playerHalls(s, pid)) for (const n of neighbors(h.hex)) if (s.cells[key(n)]?.terrain === 'water') sea.add(key(n));
  return sea.size * 2;
};

/** Что дополнительно видит игрок благодаря «Оракулу» и «Маяку». */
export const wonderSight = (s: GameState, pid: string, seen: Set<string>): void => {
  if (hasWonder(s, pid, 'oracle')) for (const g of Object.values(s.generals)) if (g.owner !== pid && !g.settler) seen.add(key(g.hex));
  if (hasWonder(s, pid, 'lighthouse')) {
    const shore = Object.values(s.cells).filter((c) => c.owner === pid && c.terrain !== 'water' && neighbors(c.hex).some((n) => s.cells[key(n)]?.terrain === 'water'));
    for (const c of shore) for (const x of range(c.hex, LIGHTHOUSE_RANGE)) if (s.cells[key(x)]?.terrain === 'water') seen.add(key(x));
  }
};

// ---------- морские торговые пути ----------
export const SEA_ROUTE = { woodPerCell: 6, max: 24, perCity: 2 };
/** Золото за ход с пути: чем дальше плыть, тем дороже товар. */
export const seaRouteGold = (cells: number): number => Math.min(8, 2 + Math.floor(cells / 4));

const seaOf = (s: GameState, hallId: string): string[] => Object.values(s.cells).filter((c) => c.hall === hallId && c.terrain === 'water').map((c) => key(c.hex));
/** Приморский ли город: на его земле есть море. */
export const coastal = (s: GameState, hallId: string): boolean => seaOf(s, hallId).length > 0;
export const routesOf = (s: GameState, hallId: string) => (s.seaRoutes ?? []).filter((r) => r.a === hallId || r.b === hallId);
const pending = (s: GameState, hallId: string) => Object.values(s.players).flatMap((p) => p.jobs).filter((j) => j.kind === 'searoute' && (j.hallId === hallId || j.to === hallId));

/** Кратчайший морской путь между землями двух городов (клетки воды). */
export const seaPath = (s: GameState, a: string, b: string): string[] | null => {
  const from = seaOf(s, a), goal = new Set(seaOf(s, b));
  if (!from.length || !goal.size) return null;
  const prev = new Map<string, string | null>(from.map((k) => [k, null]));
  const q = [...from];
  let end: string | null = null;
  while (q.length) {
    const cur = q.shift()!;
    if (goal.has(cur)) { end = cur; break; }
    const [cq, cr] = cur.split(',').map(Number);
    for (const n of neighbors({ q: cq, r: cr })) {
      const k = key(n);
      if (prev.has(k) || s.cells[k]?.terrain !== 'water') continue;
      prev.set(k, cur); q.push(k);
    }
  }
  if (!end) return null;
  const path: string[] = [];
  for (let k: string | null = end; k; k = prev.get(k) ?? null) path.unshift(k);
  return path;
};
export const seaRouteCost = (path: string[]): Res => res(path.length * SEA_ROUTE.woodPerCell, 0);

/** Почему нельзя проложить путь (или null). */
export const seaRouteBlocked = (s: GameState, pid: string, a: string, b: string): string | null => {
  const ha = s.halls[a], hb = s.halls[b];
  if (!ha || !hb || ha.owner !== pid || hb.owner !== pid || a === b) return 'pick two of your cities';
  if (!coastal(s, a) || !coastal(s, b)) return 'both cities need the sea on their land';
  const pair = (r: { a: string; b: string } | { hallId: string; to: string }) => { const x = 'a' in r ? [r.a, r.b] : [r.hallId, r.to]; return x.includes(a) && x.includes(b); };
  if (routesOf(s, a).some(pair) || pending(s, a).some((j) => j.kind === 'searoute' && pair(j))) return 'these cities are already linked';
  if (routesOf(s, a).length + pending(s, a).length >= SEA_ROUTE.perCity) return `${ha.name} already has ${SEA_ROUTE.perCity} sea routes`;
  if (routesOf(s, b).length + pending(s, b).length >= SEA_ROUTE.perCity) return `${hb.name} already has ${SEA_ROUTE.perCity} sea routes`;
  const path = seaPath(s, a, b);
  if (!path) return 'no sea way between these cities';
  if (path.length > SEA_ROUTE.max) return `too far by sea (${path.length} cells, at most ${SEA_ROUTE.max})`;
  if (freeBuilders(s, pid, a) < 1) return `all builders of ${ha.name} are busy`;
  if (!canAfford(s.players[pid].res, seaRouteCost(path))) return 'not enough wood';
  return null;
};
export const buildSeaRoute = (s: GameState, pid: string, a: string, b: string): Result => {
  const why = seaRouteBlocked(s, pid, a, b);
  if (why) return no(why);
  const path = seaPath(s, a, b)!;
  const c = seaRouteCost(path);
  s.players[pid].res.wood -= c.wood;
  s.players[pid].jobs.push({ kind: 'searoute', hallId: a, to: b, cells: path, finish: s.turn + Math.max(1, Math.ceil(path.length / 6)) });
  return ok;
};
export const completeSeaRoute = (s: GameState, pid: string, j: Extract<Job, { kind: 'searoute' }>): void => {
  if (s.halls[j.hallId]?.owner !== pid || s.halls[j.to]?.owner !== pid) return;
  (s.seaRoutes ??= []).push({ a: j.hallId, b: j.to, cells: j.cells });
  say(s, `sea route ${s.halls[j.hallId].name} — ${s.halls[j.to].name} opens: +${seaRouteGold(j.cells.length)} gold per turn`, pid);
};
/** Действующие пути игрока: оба города у него. */
export const activeSeaRoutes = (s: GameState, pid: string) => (s.seaRoutes ?? []).filter((r) => s.halls[r.a]?.owner === pid && s.halls[r.b]?.owner === pid);
export const seaRoutesGold = (s: GameState, pid: string): number => activeSeaRoutes(s, pid).reduce((n, r) => n + seaRouteGold(r.cells.length), 0);

/** Морские пути, которые игрок может проложить из города: приморские свои города в пределах досягаемости. */
export const seaRouteTargets = (s: GameState, pid: string, hallId: string): { hallId: string; cells: number; blocked: string | null }[] =>
  playerHalls(s, pid).filter((h) => h.id !== hallId && coastal(s, h.id)).map((h) => {
    const path = seaPath(s, hallId, h.id);
    return { hallId: h.id, cells: path?.length ?? 0, blocked: seaRouteBlocked(s, pid, hallId, h.id) };
  }).filter((x) => x.cells > 0).sort((x, y) => x.cells - y.cells);
