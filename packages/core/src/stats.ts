// Сводка государства для окна «Держава»: правитель, города, площадь, военная и экономическая сила и места среди живых держав.

import { NATIONS } from './nations.ts';
import { income, playerGenerals, playerHalls, upkeep } from './economy.ts';
import { power } from './aiwar.ts';
import { type GameState } from './state.ts';
import { type Res } from './config.ts';

/** Сколько «дерева» стоит единица ресурса для экономической оценки: рудник даёт золота вчетверо меньше,
 *  чем ферма еды при сравнимой цене, поэтому золото весит 4. */
export const ECON_WEIGHT: Res = { wood: 1, food: 1, gold: 4 };

export type NationStats = {
  nation: string; ruler: string; character?: string;
  cities: number; area: number; generals: number; pieces: number;
  /** Сумма сил армий: стоимость фигур × множитель за ELO генерала (как оценивает ИИ). */
  military: number;
  /** Доход за ход в «единицах дерева»: дерево + еда + 4 × золото, минус содержание армии. */
  economy: number;
  income: Res; upkeep: number;
  rank: { military: number; economy: number; area: number; of: number };
};

export const rulerOf = (s: GameState, pid: string): string => {
  const p = s.players[pid];
  return p.ruler ?? p.ai?.ruler ?? NATIONS[p.nation].rulers.moderate;
};

const raw = (s: GameState, pid: string) => {
  const inc = income(s, pid);
  const up = upkeep(s, pid);
  const gens = playerGenerals(s, pid);
  return {
    inc, up, gens,
    cities: playerHalls(s, pid).length,
    area: Object.values(s.cells).filter((c) => c.owner === pid).length,
    military: Math.round(gens.reduce((sum, g) => sum + power(g), 0)),
    economy: Math.round(inc.wood * ECON_WEIGHT.wood + (inc.food - up) * ECON_WEIGHT.food + inc.gold * ECON_WEIGHT.gold),
  };
};

/** Записать сводку всех держав за текущий ход (раз в круг) — для графиков. */
export const recordHistory = (s: GameState): void => {
  const p: NonNullable<GameState['history']>[number]['p'] = {};
  for (const id of s.order) {
    if (!s.players[id].alive) continue;
    const r = raw(s, id);
    p[id] = { economy: r.economy, military: r.military, cities: r.cities, area: r.area };
  }
  (s.history ??= []).push({ turn: s.turn, p });
};

/** Итоговая сила державы для сравнения: экономика, армия и земля вместе. */
export const finalScore = (st: { economy: number; military: number; area: number; cities: number }): number =>
  Math.round(Math.max(0, st.economy) * 2 + st.military + st.area * 3 + st.cities * 25);

export const nationStats = (s: GameState, pid: string): NationStats => {
  const p = s.players[pid];
  const alive = s.order.filter((id) => s.players[id].alive);
  const all = alive.map((id) => ({ id, ...raw(s, id) }));
  const me = all.find((x) => x.id === pid) ?? { id: pid, ...raw(s, pid) };
  const place = (k: 'military' | 'economy' | 'area') => 1 + all.filter((x) => x[k] > me[k]).length;
  const char = p.ai?.aggression;
  return {
    nation: NATIONS[p.nation].name, ruler: rulerOf(s, pid), character: char && char[0].toUpperCase() + char.slice(1),
    cities: me.cities, area: me.area, generals: me.gens.length,
    pieces: me.gens.reduce((n, g) => n + g.army.p + g.army.n + g.army.b + g.army.r + g.army.q, 0),
    military: me.military, economy: me.economy, income: me.inc, upkeep: me.up,
    rank: { military: place('military'), economy: place('economy'), area: place('area'), of: alive.length },
  };
};
