// Сделки дипломатии: при заключении мира (или просто так) стороны отдают и просят ресурсы, города и технологии.
// Технологию можно отдать или попросить, только если у получателя её нет, а у дающего она есть.
// Город, перешедший по договору, ничего не теряет (без разграбления, как при захвате).
// ИИ оценивает сделку: что получает и что отдаёт (дефицитный ресурс ценнее), плюс цена мира, если идёт война.
// Шанс согласия показывается игроку заранее; решение — бросок с этим шансом.

import { TECHS, type Res, type TechId } from './config.ts';
import { income, upkeep } from './economy.ts';
import { freeCellNear } from './map.ts';
import { next } from './rng.ts';
import { type GameState, recomputeTerritory, say } from './state.ts';
import { NATIONS } from './nations.ts';
import { atWar, isOutlaw, makePeace, might, relation } from './diplomacy.ts';

export type Terms = { res: Res; cities: string[]; techs: TechId[] };
export type Deal = { give: Terms; take: Terms; peace: boolean };

export const emptyTerms = (): Terms => ({ res: { wood: 0, food: 0, gold: 0 }, cities: [], techs: [] });

const nameOf = (s: GameState, id: string) => NATIONS[s.players[id].nation].name;

/** Что сейчас нужнее всего стране: множитель ценности каждого ресурса (дефицит — дороже). */
export const needs = (s: GameState, pid: string): Res => {
  const p = s.players[pid];
  const inc = income(s, pid);
  const food = inc.food - upkeep(s, pid);
  const f = (stock: number, flow: number, base: number) => (stock < base || flow <= 0 ? 1.6 : stock > base * 6 ? 0.7 : 1);
  return { wood: f(p.res.wood, inc.wood, 60), food: f(p.res.food, food, 60), gold: f(p.res.gold, inc.gold, 30) * 3 };
};

/** Самый нужный стране ресурс. */
export const neediest = (s: GameState, pid: string): keyof Res => {
  const n = needs(s, pid);
  return (['wood', 'food', 'gold'] as const).map((r) => ({ r, v: n[r] / (r === 'gold' ? 3 : 1) })).sort((a, b) => b.v - a.v)[0].r;
};

export const cityValue = (s: GameState, hallId: string): number => {
  const h = s.halls[hallId];
  const capital = !Object.values(s.halls).some((x) => x.owner === h.owner && x.order < h.order);
  const buildings = Object.values(s.cells).filter((c) => c.hall === hallId && c.building).reduce((a, c) => a + c.building!.level * 30, 0);
  return 150 + h.level * 100 + buildings + (h.barracks ?? 0) * 40 + (h.tavern ?? 0) * 40 + (capital ? 600 : 0);
};
export const techValue = (id: TechId): number => { const c = TECHS[id].cost; return Math.round((c.wood + c.food + c.gold * 3) * 1.2); };

/** Что можно отдать/попросить: города (не столицу), технологии, которых нет у получателя. */
export const tradableCities = (s: GameState, owner: string): string[] => {
  const hs = Object.values(s.halls).filter((h) => h.owner === owner).sort((a, b) => a.order - b.order);
  return hs.slice(1).map((h) => h.id);
};
export const tradableTechs = (s: GameState, from: string, to: string): TechId[] =>
  (Object.keys(TECHS) as TechId[]).filter((id) => s.players[from].research.techs?.[id] && !s.players[to].research.techs?.[id]);

const termsValue = (s: GameState, judge: string, t: Terms): number => {
  const n = needs(s, judge);
  return t.res.wood * n.wood + t.res.food * n.food + t.res.gold * n.gold
    + t.cities.reduce((a, id) => a + cityValue(s, id), 0) + t.techs.reduce((a, id) => a + techValue(id), 0);
};

/** Шанс (0..1), что ИИ to примет сделку от from. */
export const acceptChance = (s: GameState, from: string, to: string, d: Deal): number => {
  if (!valid(s, from, to, d) || isOutlaw(s, from) || isOutlaw(s, to)) return 0; // с разбойником не торгуют
  // для to: получает d.give, отдаёт d.take
  let score = termsValue(s, to, d.give) - termsValue(s, to, d.take) * 1.15;
  if (d.peace && relation(s, from, to).state === 'war') {
    const ratio = might(s, to) / Math.max(1, might(s, from)); // >1 — to сильнее и хочет выкупа
    const long = s.turn - relation(s, from, to).since;
    score += ratio < 1 ? 250 * (1 - ratio) + 40 : -220 * (ratio - 1) - 30;
    score += Math.min(150, long * 10); // война надоедает
  } else if (d.peace) score -= 1e6;
  const agg = s.players[to].ai?.aggression;
  if (agg === 'warlike') score -= 40;
  if (agg === 'peaceful') score += 40;
  return 1 / (1 + Math.exp(-score / 90));
};

const valid = (s: GameState, from: string, to: string, d: Deal): boolean => {
  const pf = s.players[from], pt = s.players[to];
  if (!pf?.alive || !pt?.alive) return false;
  for (const r of ['wood', 'food', 'gold'] as const) if (d.give.res[r] < 0 || d.take.res[r] < 0 || d.give.res[r] > pf.res[r] || d.take.res[r] > pt.res[r]) return false;
  if (d.give.cities.some((id) => s.halls[id]?.owner !== from) || d.take.cities.some((id) => s.halls[id]?.owner !== to)) return false;
  if (d.give.techs.some((id) => !tradableTechs(s, from, to).includes(id)) || d.take.techs.some((id) => !tradableTechs(s, to, from).includes(id))) return false;
  // столицы и последние города не отдаются
  const cap = (pid: string) => Object.values(s.halls).filter((h) => h.owner === pid).sort((a, b) => a.order - b.order)[0]?.id;
  if (d.give.cities.includes(cap(from)) || d.take.cities.includes(cap(to))) return false;
  return true;
};

/** Город переходит по договору — без разграбления: здания, казарма и таверна остаются. */
export const transferCity = (s: GameState, hallId: string, to: string): void => {
  const h = s.halls[hallId];
  const from = h.owner;
  const fp = s.players[from];
  if (fp) {
    fp.jobs = fp.jobs.filter((j) => !(j.kind === 'resource' && s.cells[`${j.hex.q},${j.hex.r}`]?.hall === hallId) && !('hallId' in j && j.hallId === hallId));
    fp.queue = fp.queue?.filter((q) => !('hallId' in q.job && q.job.hallId === hallId));
  }
  for (const g of Object.values(s.generals)) {
    if (g.owner !== from || g.hex.q !== h.hex.q || g.hex.r !== h.hex.r) continue;
    const spot = freeCellNear(s, h.hex, from, g.id);
    if (spot && (spot.q !== h.hex.q || spot.r !== h.hex.r)) g.hex = spot;
  }
  h.owner = to;
  h.siege = undefined;
  h.takenAt = undefined;
  recomputeTerritory(s);
};

const apply = (s: GameState, from: string, to: string, t: Terms) => {
  for (const r of ['wood', 'food', 'gold'] as const) { s.players[from].res[r] -= t.res[r]; s.players[to].res[r] += t.res[r]; }
  for (const id of t.cities) transferCity(s, id, to);
  for (const id of t.techs) (s.players[to].research.techs ??= {})[id] = true;
};

export const termsText = (s: GameState, t: Terms): string => {
  const parts = [
    ...(['gold', 'wood', 'food'] as const).filter((r) => t.res[r] > 0).map((r) => `${t.res[r]} ${r}`),
    ...t.cities.map((id) => s.halls[id].name),
    ...t.techs.map((id) => TECHS[id].name),
  ];
  return parts.join(', ') || 'nothing';
};

/** Предложить сделку ИИ: бросок с шансом acceptChance. true — принята и исполнена. */
export const proposeDeal = (s: GameState, from: string, to: string, d: Deal): boolean => {
  const chance = acceptChance(s, from, to, d);
  if (next(s.rng) >= chance) { say(s, `${nameOf(s, to)} rejected the deal`, from); return false; }
  executeDeal(s, from, to, d);
  return true;
};

export const executeDeal = (s: GameState, from: string, to: string, d: Deal): void => {
  apply(s, from, to, d.give);
  apply(s, to, from, d.take);
  if (d.peace && atWar(s, from, to) || (d.peace && relation(s, from, to).state === 'war')) makePeace(s, from, to);
  say(s, `deal with ${nameOf(s, to)}: you gave ${termsText(s, d.give)}, received ${termsText(s, d.take)}`, from);
  say(s, `deal with ${nameOf(s, from)}: you gave ${termsText(s, d.take)}, received ${termsText(s, d.give)}`, to);
};
