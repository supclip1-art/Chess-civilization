// Вассалы. Захваченный город можно не присоединять, а сделать вассальной страной: у неё своя экономика и свой ИИ,
// она отдаёт сюзерену 25% дохода, всегда в союзе с ним и воюет с его врагами. Сюзерен задаёт курс:
//   expand  — агрессивное расширение (захват нейтралов, поселенцы, война с врагами сюзерена);
//   defend  — защищать свою землю (гарнизоны, без походов);
//   economy — только хозяйство, без армий.
// Если вместе вассалы сильнее сюзерена, самый сильный из них восстаёт и объявляет ему войну.

import { NATIONS, NATION_ORDER, type Aggression, type NationId } from './nations.ts';
import { START_RESOURCES } from './config.ts';
import { freeCellNear } from './map.ts';
import { income, playerGenerals } from './economy.ts';
import { type GameState, PASSABLE, makeGeneral, generalName, recomputeTerritory, say } from './state.ts';
import { key, neighbors } from './hex.ts';

export type VassalStance = 'expand' | 'defend' | 'economy';
export const VASSAL_SHARE = 0.25;
const AGGR: Record<VassalStance, Aggression> = { expand: 'warlike', defend: 'moderate', economy: 'peaceful' };

export const vassalsOf = (s: GameState, pid: string): string[] => s.order.filter((id) => s.players[id].alive && s.players[id].overlord === pid);
/** Глава «семьи» стран: сюзерен для вассала, сама страна для остальных. */
export const head = (s: GameState, id: string): string => s.players[id]?.overlord ?? id;

/** Сделать захваченный город вассальной страной. Возвращает id новой страны. */
export const makeVassal = (s: GameState, pid: string, hallId: string, stance: VassalStance = 'defend'): string | null => {
  const h = s.halls[hallId];
  if (!h || h.owner !== pid) return null;
  const used = new Set(Object.values(s.players).filter((p) => p.alive).map((p) => p.nation));
  const nation: NationId = NATION_ORDER.find((n) => !used.has(n)) ?? NATION_ORDER[0];
  const id = `v${s.nextId++}`;
  s.order.push(id);
  s.players[id] = {
    id, nation, ai: { aggression: AGGR[stance], ruler: NATIONS[nation].rulers[AGGR[stance]] }, ruler: NATIONS[nation].rulers[AGGR[stance]],
    res: { ...START_RESOURCES }, research: { done: 0 }, jobs: [], starterKnight: false, alive: true, overlord: pid, stance,
  };
  // армии сюзерена уходят из города; вассал получает гарнизон
  for (const g of Object.values(s.generals)) {
    if (g.owner !== pid || key(g.hex) !== key(h.hex)) continue;
    const spot = freeCellNear(s, h.hex, pid, g.id);
    if (spot && key(spot) !== key(h.hex)) g.hex = spot;
    else {
      const n = neighbors(h.hex).find((x) => s.cells[key(x)] && PASSABLE[s.cells[key(x)].terrain] && !Object.values(s.generals).some((y) => key(y.hex) === key(x)));
      if (n) g.hex = n;
    }
  }
  h.owner = id;
  h.takenAt = undefined;
  h.siege = undefined;
  const garrison = makeGeneral(s, id, { ...h.hex }, s.settings.elo, { p: 4, n: 0, b: 0, r: 0, q: 0 }, generalName(s, id));
  garrison.moveLeft = 0;
  recomputeTerritory(s);
  say(s, `${h.name} becomes a vassal state: ${NATIONS[nation].name}`, pid);
  return id;
};

export const setStance = (s: GameState, pid: string, vid: string, stance: VassalStance): boolean => {
  const v = s.players[vid];
  if (!v || v.overlord !== pid) return false;
  v.stance = stance;
  v.ai = { ...v.ai!, aggression: AGGR[stance] };
  return true;
};

/** Начало хода вассала: четверть дохода — сюзерену. */
export const payOverlord = (s: GameState, vid: string): void => {
  const v = s.players[vid];
  const lord = v?.overlord ? s.players[v.overlord] : undefined;
  if (!v || !lord?.alive) return;
  const inc = income(s, vid);
  for (const r of ['wood', 'food', 'gold'] as const) {
    const part = Math.floor(Math.max(0, inc[r]) * VASSAL_SHARE);
    const paid = Math.min(part, v.res[r]);
    v.res[r] -= paid;
    lord.res[r] += paid;
  }
};

const might = (s: GameState, pid: string) => playerGenerals(s, pid).reduce((a, g) =>
  a + (g.army.p * 10 + g.army.n * 30 + g.army.b * 30 + g.army.r * 50 + g.army.q * 90) * 2 ** ((g.elo - 1200) / 400), 0);

/** Начало хода сюзерена: если вассалы вместе сильнее, самый сильный восстаёт. Возвращает id мятежника. */
export const checkRebellion = (s: GameState, pid: string): string | null => {
  const vs = vassalsOf(s, pid);
  if (!vs.length) return null;
  const total = vs.reduce((a, v) => a + might(s, v), 0);
  if (total <= might(s, pid)) return null;
  const rebel = vs.sort((a, b) => might(s, b) - might(s, a))[0];
  const v = s.players[rebel];
  v.overlord = undefined;
  v.stance = undefined;
  v.ai = { ...v.ai!, aggression: 'warlike' };
  (s.diplo ??= {})[pid < rebel ? `${pid}|${rebel}` : `${rebel}|${pid}`] = { state: 'war', since: s.turn, warFrom: s.turn + 1 };
  say(s, `${NATIONS[v.nation].name} rises against you: the vassal declares independence and war`, pid);
  return rebel;
};

/** Мятеж побеждён, если у сюзерена не осталось живых вассалов — для подсказок. */
export const vassalMight = (s: GameState, pid: string) => vassalsOf(s, pid).reduce((a, v) => a + might(s, v), 0);
export const nationMight = might;
