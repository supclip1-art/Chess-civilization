// Дипломатия. В начале партии все страны в мире. Пока мир — на чужую землю не ступить и чужих не атаковать
// (нейтралы и разбойники — не в счёт: с разбойниками переговоров нет, они всегда враги).
//   • Войну объявляют; атаковать можно со следующего хода.
//   • Союзники ходят по земле друг друга и вступают в войну, когда на союзника напали.
//   • Союз можно расторгнуть, но 2 хода после этого бывшему союзнику нельзя объявить войну.
//   • Мир заключают по предложению; после мира 5 ходов перемирия.
//   • Дань: сильный ИИ требует золото у слабого соседа — заплатить или воевать.
//   • ИИ следит за агрессорами (объявленные войны, захваченные города) и собирает против них коалиции соседей.

import { NATIONS } from './nations.ts';
import { difficultyOf } from './difficulty.ts';
import { distance } from './hex.ts';
import { type GameState, say } from './state.ts';
import { cityValue, emptyTerms, executeDeal, neediest, termsText, tradableCities } from './deals.ts';

export type Stance = 'peace' | 'war' | 'alliance';
export type Relation = { state: Stance; since: number; warFrom?: number; noWarUntil?: number };

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const isNation = (s: GameState, id: string) => !!s.players[id];
const nameOf = (s: GameState, id: string) => (s.players[id] ? NATIONS[s.players[id].nation].name : id === 'bandits' ? 'Bandits' : 'a free city');

export const TRUCE_TURNS = 5;
export const BREAK_COOLDOWN = 2;

/** Вассал во внешней политике — часть сюзерена: те же союзы и войны. */
const top = (s: GameState, id: string) => s.players[id]?.overlord ?? id;
export const relation = (s: GameState, a: string, b: string): Relation => {
  if (!isNation(s, a) || !isNation(s, b)) return a === b ? { state: 'alliance', since: 0 } : { state: 'war', since: 0, warFrom: 0 }; // нейтралы и разбойники
  a = top(s, a); b = top(s, b);
  if (a === b) return { state: 'alliance', since: 0 };
  if (s.players[a].outlaw || s.players[b].outlaw) return { state: 'war', since: 0, warFrom: 0 }; // разбойника не признают: вечная война
  return s.diplo?.[pairKey(a, b)] ?? { state: 'peace', since: 0 };
};
/** Разбойник (или вассал разбойника): с ним не договариваются. */
export const isOutlaw = (s: GameState, id: string): boolean => !!s.players[top(s, id)]?.outlaw;
const setRelation = (s: GameState, a: string, b: string, r: Relation) => { (s.diplo ??= {})[pairKey(top(s, a), top(s, b))] = r; };

/** Можно ли сейчас воевать (атаковать, входить на землю, осаждать). */
export const atWar = (s: GameState, a: string, b: string): boolean => {
  const r = relation(s, a, b);
  return r.state === 'war' && s.turn >= (r.warFrom ?? 0);
};
export const allied = (s: GameState, a: string, b: string): boolean => a !== b && relation(s, a, b).state === 'alliance';

/** Можно ли армии игрока a стоять на земле владельца owner. */
export const mayEnter = (s: GameState, a: string, owner: string | undefined): boolean =>
  !owner || owner === a || !isNation(s, a) || !isNation(s, owner) || allied(s, a, owner) || atWar(s, a, owner);

/** Почему нельзя объявить войну (или null — можно). */
export const warBlocked = (s: GameState, a: string, b: string): string | null => {
  if (!isNation(s, a) || !isNation(s, b) || a === b) return 'not a nation';
  if (isOutlaw(s, a) || isOutlaw(s, b)) return 'outlaws are always at war';
  const r = relation(s, a, b);
  if (r.state === 'war') return 'already at war';
  if (r.state === 'alliance') return 'you are allies — break the alliance first';
  if ((r.noWarUntil ?? 0) > s.turn) return `${r.noWarUntil! - s.turn} more turn${r.noWarUntil! - s.turn > 1 ? 's' : ''} of truce`;
  return null;
};

/** Агрессия страны: растёт за объявленные войны и захваченные у стран города, медленно спадает. */
export const aggression = (s: GameState, pid: string): number => s.aggro?.[pid] ?? 0;
export const addAggression = (s: GameState, pid: string, v: number): void => { (s.aggro ??= {})[pid] = aggression(s, pid) + v; };

export const declareWar = (s: GameState, a: string, b: string, why = ''): string | null => {
  a = top(s, a); b = top(s, b);
  const blocked = warBlocked(s, a, b);
  if (blocked) return blocked;
  setRelation(s, a, b, { state: 'war', since: s.turn, warFrom: s.turn + 1 });
  addAggression(s, a, 3);
  say(s, `${nameOf(s, a)} declared war on ${nameOf(s, b)}${why}. Attacks begin next turn`, b);
  say(s, `war declared on ${nameOf(s, b)}: attacks begin next turn`, a);
  // союзники обороняющегося вступают в войну
  for (const c of Object.keys(s.players)) {
    if (c === a || c === b || !s.players[c].alive || !allied(s, b, c)) continue;
    if (allied(s, a, c)) continue; // союзник обоих — остаётся в стороне
    setRelation(s, a, c, { state: 'war', since: s.turn, warFrom: s.turn + 1 });
    say(s, `${nameOf(s, c)} joins the war on the side of its ally ${nameOf(s, b)}`, a);
    say(s, `${nameOf(s, c)} stands with you against ${nameOf(s, a)}`, b);
  }
  return null;
};

export const makePeace = (s: GameState, a: string, b: string): void => {
  setRelation(s, a, b, { state: 'peace', since: s.turn, noWarUntil: s.turn + TRUCE_TURNS });
  say(s, `peace with ${nameOf(s, b)}`, a);
  say(s, `peace with ${nameOf(s, a)}`, b);
  // осады между ними снимаются
  for (const h of Object.values(s.halls)) {
    const g = h.siege && s.generals[h.siege.by];
    if (g && ((g.owner === a && h.owner === b) || (g.owner === b && h.owner === a))) h.siege = undefined;
  }
};

export const makeAlliance = (s: GameState, a: string, b: string): void => {
  setRelation(s, a, b, { state: 'alliance', since: s.turn });
  say(s, `alliance with ${nameOf(s, b)}`, a);
  say(s, `alliance with ${nameOf(s, a)}`, b);
};

export const breakAlliance = (s: GameState, a: string, b: string): boolean => {
  if (!allied(s, a, b)) return false;
  setRelation(s, a, b, { state: 'peace', since: s.turn, noWarUntil: s.turn + BREAK_COOLDOWN });
  say(s, `${nameOf(s, a)} broke the alliance`, b);
  say(s, `the alliance with ${nameOf(s, b)} is over`, a);
  return true;
};

// ---------- оценки для ИИ ----------

/** Военная сила страны (сумма армий с поправкой на ELO). */
export const might = (s: GameState, pid: string): number =>
  Object.values(s.generals).filter((g) => g.owner === pid && !g.settler)
    .reduce((a, g) => a + Object.entries(g.army).reduce((x, [p, n]) => x + n * ({ p: 10, n: 30, b: 30, r: 50, q: 90 } as Record<string, number>)[p], 0) * 2 ** ((g.elo - 1200) / 400), 0);

const capitalOf = (s: GameState, pid: string) => Object.values(s.halls).filter((h) => h.owner === pid).sort((x, y) => x.order - y.order)[0];

/** Соседи: страны, чьи города в пределах 14 клеток от моих. */
export const neighbours = (s: GameState, pid: string, reach = 14): string[] => {
  const mine = Object.values(s.halls).filter((h) => h.owner === pid);
  return Object.keys(s.players).filter((x) => x !== pid && s.players[x].alive
    && Object.values(s.halls).some((h) => h.owner === x && mine.some((m) => distance(m.hex, h.hex) <= reach)));
};

/** Знает ли страна a о стране b (видела её землю или армию). */
const knows = (s: GameState, a: string, b: string): boolean =>
  a === b || !!s.met?.[a]?.[b] || Object.values(s.memory?.[a] ?? {}).some((m) => m.owner === b);

/** Насколько враг x давит на страну pid в этой войне: армии x у её городов, осады, потерянные города. */
const pressure = (s: GameState, pid: string, x: string): { near: boolean; sieged: boolean; lost: boolean } => {
  const mine = Object.values(s.halls).filter((h) => h.owner === pid);
  const since = relation(s, pid, x).since;
  const near = Object.values(s.generals).some((g) => g.owner === x && !g.settler && mine.some((h) => distance(h.hex, g.hex) <= 4));
  const sieged = mine.some((h) => h.siege && s.generals[h.siege.by]?.owner === x);
  const lost = Object.values(s.halls).some((h) => h.owner === x && h.takenFrom === pid && (h.takenAt ?? -1) >= since);
  return { near, sieged, lost };
};

/** Примет ли ИИ b мир от a. */
export const acceptsPeace = (s: GameState, b: string, a: string, gold = 0): boolean => {
  const r = relation(s, a, b);
  if (r.state !== 'war' || isOutlaw(s, a) || isOutlaw(s, b)) return false;
  const ratio = might(s, b) / Math.max(1, might(s, a));
  const long = s.turn - r.since >= 10;
  return ratio < 0.8 || (long && ratio < 1.3) || gold >= 40 + might(s, b) * 0.1;
};

/** Примет ли ИИ b союз с a: есть общий враг или общий сосед-агрессор, и a — не сам агрессор. */
export const acceptsAlliance = (s: GameState, b: string, a: string): boolean => {
  if (relation(s, a, b).state !== 'peace') return false;
  if (aggression(s, a) >= 6) return false;
  const common = Object.keys(s.players).some((x) => x !== a && x !== b && s.players[x].alive && atWar(s, a, x) && relation(s, b, x).state === 'war');
  const threat = Object.keys(s.players).some((x) => x !== a && x !== b && s.players[x].alive && aggression(s, x) >= 6
    && neighbours(s, b).includes(x) && neighbours(s, a).includes(x));
  return common || threat;
};

/** Дипломатия ИИ в начале его хода: коалиции против агрессора, мир при проигрыше, войны по характеру, дань. */
export const aiDiplomacy = (s: GameState, pid: string, opts: { wantsWar: boolean; human?: string }): void => {
  const p = s.players[pid];
  if (!p?.ai || !p.alive || isOutlaw(s, pid)) return;
  // агрессия со временем остывает
  for (const k of Object.keys(s.aggro ?? {})) if (k === pid) s.aggro![k] = Math.max(0, s.aggro![k] * 0.97);
  const near = neighbours(s, pid);
  const me = might(s, pid);
  // 1. проигрываем войну — ищем мира (с ИИ сразу, человеку — предложение с данью).
  //    Только если враг и правда давит: его армии у наших городов, осада или уже потерянный город.
  //    Город отдаём, лишь когда дело совсем плохо: осада или потеря города и враг намного сильнее.
  for (const x of Object.keys(s.players)) {
    if (!atWar(s, pid, x) || !s.players[x].alive || isOutlaw(s, x)) continue;
    const pr = pressure(s, pid, x);
    if (!pr.near && !pr.sieged && !pr.lost) continue;
    if (me < 0.6 * might(s, x) && s.turn - relation(s, pid, x).since >= 3) {
      if (s.players[x].ai) { if (acceptsPeace(s, x, pid)) makePeace(s, pid, x); }
      else if (!s.players[x].offer && knows(s, x, pid)) {
        // за мир предлагает золото и то, чего у него в избытке; в отчаянии — ещё и город
        const terms = emptyTerms();
        terms.res.gold = Math.min(p.res.gold, 30 + Math.round(me * 0.1));
        for (const r of ['wood', 'food'] as const) if (p.res[r] > 120) terms.res[r] = Math.round(p.res[r] / 3 / 10) * 10;
        const cities = tradableCities(s, pid).sort((a, b) => cityValue(s, a) - cityValue(s, b));
        if (me < 0.4 * might(s, x) && (pr.sieged || pr.lost) && cities.length) terms.cities = [cities[0]];
        s.players[x].offer = { from: pid, kind: 'peace', terms };
      }
    }
  }
  // 2. коалиция против агрессора-соседа
  const aggressor = near.filter((x) => aggression(s, x) >= 6).sort((x, y) => aggression(s, y) - aggression(s, x))[0];
  if (aggressor && !allied(s, pid, aggressor)) {
    for (const y of near) {
      if (y === aggressor || allied(s, pid, y) || relation(s, pid, y).state !== 'peace' || !s.players[y].ai) continue;
      if (neighbours(s, y).includes(aggressor) && acceptsAlliance(s, y, pid)) makeAlliance(s, pid, y);
    }
    const friends = near.filter((y) => allied(s, pid, y)).reduce((a, y) => a + might(s, y), me);
    if (!warBlocked(s, pid, aggressor) && (s.players[aggressor].ai || knows(s, aggressor, pid)) && friends > 1.1 * might(s, aggressor)) declareWar(s, pid, aggressor, ' to stop its conquests');
  }
  // 3. война по характеру: самая слабая из близких стран (до 10 клеток — чтобы армия дошла), живой игрок — чуть охотнее.
  //    Человеку войну объявляют и дань требуют, только если он уже встречался с этой страной.
  if (opts.wantsWar && !Object.keys(s.players).some((x) => relation(s, pid, x).state === 'war' && s.players[x].alive)) {
    const prey = neighbours(s, pid, 10).filter((x) => !warBlocked(s, pid, x) && (s.players[x].ai || knows(s, x, pid)))
      .map((x) => ({ x, score: might(s, x) / Math.max(1, me) - (s.players[x].ai ? 0 : 0.1) }))
      .sort((a, b) => a.score - b.score)[0];
    if (prey && prey.score < difficultyOf(s).prey) {
      // слабый живой игрок рядом — сначала требуем дань
      if (!s.players[prey.x].ai && !s.players[prey.x].offer && might(s, prey.x) < 0.8 * me && (p.ai.tributeAt ?? -99) + 10 <= s.turn) {
        p.ai.tributeAt = s.turn;
        // дань — в том ресурсе, которого ИИ не хватает
        const r = neediest(s, pid);
        const terms = emptyTerms();
        terms.res[r] = Math.round(((40 + s.turn * 1.5) * (r === 'gold' ? 1 : 3)) / 10) * 10;
        s.players[prey.x].offer = { from: pid, kind: 'tribute', terms };
      } else declareWar(s, pid, prey.x);
    }
  }
};

/** Ответ игрока на предложение ИИ (мир с данью ему или требование дани с него). */
export const answerOffer = (s: GameState, pid: string, accept: boolean): string => {
  const p = s.players[pid];
  const o = p.offer;
  if (!o) return '';
  p.offer = undefined;
  const from = s.players[o.from];
  if (!from?.alive) return '';
  if (o.kind === 'peace') {
    if (!accept || relation(s, pid, o.from).state !== 'war') return 'the war goes on';
    // что ИИ ещё может отдать (ресурсы могли потратиться, город — пасть)
    const t = o.terms;
    for (const r of ['wood', 'food', 'gold'] as const) t.res[r] = Math.min(t.res[r], from.res[r]);
    t.cities = t.cities.filter((id) => s.halls[id]?.owner === o.from);
    executeDeal(s, o.from, pid, { give: t, take: emptyTerms(), peace: true });
    return `peace — ${nameOf(s, o.from)} gives ${termsText(s, t)}`;
  }
  if (accept && (['wood', 'food', 'gold'] as const).every((r) => p.res[r] >= o.terms.res[r])) {
    executeDeal(s, pid, o.from, { give: o.terms, take: emptyTerms(), peace: false });
    setRelation(s, pid, o.from, { ...relation(s, pid, o.from), noWarUntil: s.turn + 8 });
    return `tribute paid: ${nameOf(s, o.from)} will not attack for 8 turns`;
  }
  declareWar(s, o.from, pid, ' after the tribute was refused');
  return `${nameOf(s, o.from)} declared war`;
};

export const capitalHex = (s: GameState, pid: string) => capitalOf(s, pid)?.hex;
