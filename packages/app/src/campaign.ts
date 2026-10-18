// Кампания «Хроники империй»: 8 исторических глав на картах игры. У главы — своя страна, место старта, соперники,
// сложность, цель и срок. Главы открываются по очереди. Звёзды: ★ — цель выполнена, ★★ — особое условие главы
// (обычно быстрее срока), ★★★ — ни один свой город не потерян. За главы, звёзды и особые подвиги — достижения.

import {
  NATIONS, italyMap, finalScore, makeAlliance, nationStats, newGame, playerGenerals, playerHalls, recomputeTerritory, vassalsOf, winner,
  type Difficulty, type GameState, type MapDef, type NationId,
} from '../../core/src/index.ts';
import { MAPS, type MapId } from './setup.ts';
import { dynasty, saveDynasty } from './dynasty.ts';

export type Goal =
  | { kind: 'cities'; n: number }
  | { kind: 'subdue'; n: number }
  | { kind: 'hold' }
  | { kind: 'take'; names: string[] }
  | { kind: 'strongest' }
  | { kind: 'capitals'; n: number }
  | { kind: 'win' };

export type Chapter = {
  id: number; name: string; era: string; story: string;
  nation: NationId; map: MapId | 'italy'; spawn?: string; capitalName?: string;
  /** Места старта закреплены за нациями карты (Рим, Венеция, Сицилия). */
  fixedSpawns?: boolean;
  rivals: NationId[]; difficulty: Difficulty; elo: number;
  goal: Goal; goalText: string; limit: number;
  /** Вторая звезда: условие и как его назвать. */
  star2: { text: string; check: (s: GameState, me: string) => boolean };
  /** Особый подвиг главы — достижение (id) и условие на момент победы. */
  special?: { id: string; check: (s: GameState, me: string) => boolean };
  setup?: (s: GameState) => void;
};

const ME = 'p1';
const pair = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
/** Все соперники в войне с игроком с хода from. */
const warOnMe = (from: number) => (s: GameState) => { for (const id of s.order) if (id !== ME) (s.diplo ??= {})[pair(ME, id)] = { state: 'war', since: 1, warFrom: from }; };
const fast = (turn: number) => ({ text: `by turn ${turn}`, check: (s: GameState) => s.turn <= turn });

export const CHAPTERS: Chapter[] = [
  {
    id: 1, name: 'Rise of Rome', era: 'Italy · 3rd century BC',
    story: 'A city of seven hills dreams of more. Venice rules the north, Syracuse holds Sicily. Bring the lands of Italy under one banner before they do.',
    nation: 'italy', map: 'italy', fixedSpawns: true, capitalName: 'Rome', rivals: ['venice', 'sicily'], difficulty: 'novice', elo: 1000,
    goal: { kind: 'cities', n: 5 }, goalText: 'Rule 5 cities', limit: 25, star2: fast(18),
    special: { id: 'veni_vidi_vici', check: (s) => s.turn <= 15 },
  },
  {
    id: 2, name: 'Charlemagne', era: 'Francia · 8th century',
    story: 'The Franks are strong, their neighbours proud. Bend two nations to your will — by conquest or by making them your vassals.',
    nation: 'france', map: 'europe', spawn: '8,16', capitalName: 'Aachen', rivals: ['germany', 'spain', 'britain'], difficulty: 'club', elo: 1200,
    goal: { kind: 'subdue', n: 2 }, goalText: 'Subdue 2 nations: knock them out or make them vassals', limit: 50, star2: fast(38),
    special: { id: 'paladin', check: (s, me) => vassalsOf(s, me).length >= 2 },
  },
  {
    id: 3, name: 'Walls of Constantinople', era: 'Byzantium · 7th century',
    story: 'Every crown of the East wants the Queen of Cities. All of them march on you at once. Hold the capital for 30 turns.',
    nation: 'turkey', map: 'mediterranean', spawn: '40,11', capitalName: 'Constantinople', rivals: ['persia', 'arabia', 'egypt', 'italy'], difficulty: 'master', elo: 1200,
    goal: { kind: 'hold' }, goalText: 'Keep Constantinople until turn 30', limit: 30,
    star2: { text: 'win 5 battles', check: (s) => (s.campaign?.wins ?? 0) >= 5 },
    special: { id: 'theodosian', check: (s) => !s.campaign?.lostBattle },
    setup: (s) => { warOnMe(4)(s); for (const id of s.order) if (s.players[id].ai) s.players[id].ai!.aggression = 'warlike'; },
  },
  {
    id: 4, name: 'Thunder of the Steppe', era: 'The Great Steppe · 13th century',
    story: 'From the grass sea a new khan rises. Take the two great cities of Asia: Karakorum in the east and Babylon in the west.',
    nation: 'kazakhstan', map: 'asia', spawn: '26,7', rivals: ['china', 'persia', 'india', 'russia'], difficulty: 'club', elo: 1200,
    goal: { kind: 'take', names: ['Karakorum', 'Babylon'] }, goalText: 'Rule Karakorum and Babylon', limit: 55, star2: fast(42),
  },
  {
    id: 5, name: 'Lords of the Wild', era: 'Africa · no crown, no law',
    story: 'You lead a band with no city and no king. In 40 turns be stronger than any nation of Africa.',
    nation: 'outlaws', map: 'africa', rivals: ['egypt', 'nigeria', 'arabia', 'turkey'], difficulty: 'club', elo: 1200,
    goal: { kind: 'strongest' }, goalText: 'Be the strongest power on turn 40', limit: 40,
    star2: { text: 'rule 4 cities', check: (s, me) => playerHalls(s, me).length >= 4 },
    special: { id: 'robin_hood', check: (s, me) => s.log.filter((e) => e.player === me && /pillaged a/.test(e.text)).length >= 5 },
  },
  {
    id: 6, name: 'El Dorado', era: 'South America · 16th century',
    story: 'A handful of soldiers on a strange shore, many nations against you. Build a realm of 8 cities in the New World.',
    nation: 'spain', map: 'southamerica', spawn: '24,18', rivals: ['brazil', 'mexico', 'usa', 'britain', 'nigeria'], difficulty: 'master', elo: 1200,
    goal: { kind: 'cities', n: 8 }, goalText: 'Rule 8 cities', limit: 45, star2: fast(35),
    special: { id: 'eldorado', check: (s) => !!s.campaign?.gold1000 },
    setup: (s) => { const g = playerGenerals(s, ME)[0]; if (g) g.army = { p: 2, n: 1, b: 0, r: 0, q: 0 }; },
  },
  {
    id: 7, name: 'The Eagle', era: 'Europe · 1805',
    story: 'An emperor crowned by his own hand looks across Europe. Take three enemy capitals in 40 turns.',
    nation: 'france', map: 'europe', spawn: '8,16', capitalName: 'Paris', rivals: ['britain', 'germany', 'russia', 'spain', 'italy', 'poland', 'turkey'], difficulty: 'master', elo: 1400,
    goal: { kind: 'capitals', n: 3 }, goalText: 'Take 3 enemy capitals', limit: 40, star2: fast(32),
    special: { id: 'hundred_days', check: (s) => s.turn <= 25 },
  },
  {
    id: 8, name: 'Checkmate of Empires', era: 'Europe · the final game',
    story: 'Every crown of Europe has sworn alliance against you. They come from turn 6. Be the last empire standing.',
    nation: 'germany', map: 'europe', spawn: '26,8', capitalName: 'Berlin', rivals: ['britain', 'france', 'russia', 'spain', 'italy', 'poland', 'turkey'], difficulty: 'grandmaster', elo: 1400,
    goal: { kind: 'win' }, goalText: 'Be the last empire standing: knock out or make vassals of all rivals', limit: 150, star2: fast(100),
    special: { id: 'iron_crown', check: (s) => !s.campaign?.genLost },
    setup: (s) => {
      warOnMe(6)(s);
      const ai = s.order.filter((id) => id !== ME);
      for (const a of ai) for (const b of ai) if (a < b) makeAlliance(s, a, b);
    },
  },
];

// ---------- прогресс ----------
export const chapterStars = (id: number): number => dynasty().chapters?.[id] ?? 0;
export const chapterOpen = (id: number): boolean => id === 1 || chapterStars(id - 1) > 0;
export const totalStars = (): number => CHAPTERS.reduce((n, c) => n + chapterStars(c.id), 0);

/** Начать главу: партия с заданной страной, местом старта, соперниками и сложностью. */
export const startChapter = (ch: Chapter): GameState => {
  const base: MapDef = ch.map === 'italy' ? italyMap() : MAPS[ch.map]();
  // своё место старта — первым, остальные по кругу (в главе места фиксированы, а не случайны)
  let spawns = base.spawns;
  if (ch.spawn) {
    const i = spawns.findIndex((h) => `${h.q},${h.r}` === ch.spawn);
    if (i >= 0) spawns = [spawns[i], ...spawns.filter((_, j) => j !== i).sort(() => Math.random() - 0.5)];
  }
  const outlaw = ch.nation === 'outlaws';
  const map: MapDef = ch.fixedSpawns
    ? { ...base, randomSpawns: false, spawnNations: ['italy', 'venice', 'sicily'] } // свои места: Рим, Венеция, Сиракузы
    : { ...base, spawns, randomSpawns: !ch.spawn, spawnNations: undefined };
  const AGGR = ['warlike', 'moderate', 'peaceful'] as const;
  const s = newGame(map, [
    { nation: ch.nation, ...(outlaw ? { outlaw: true } : {}) },
    ...ch.rivals.map((n, i) => { const aggression = AGGR[i % 3]; return { nation: n, ai: { aggression, ruler: NATIONS[n].rulers[aggression] } }; }),
  ], { elo: ch.elo, seed: Math.floor(Math.random() * 1e9), bandits: ch.map === 'italy' ? 2 : 8, difficulty: ch.difficulty });
  const cap = playerHalls(s, ME)[0];
  if (cap && ch.capitalName) cap.name = ch.capitalName;
  ch.setup?.(s);
  recomputeTerritory(s);
  s.campaign = {
    chapter: ch.id, capital: cap?.id, rivals: s.order.filter((id) => id !== ME),
    caps: s.order.filter((id) => id !== ME).map((id) => playerHalls(s, id)[0]?.id).filter((x): x is string => !!x),
  };
  return s;
};

export const chapterOf = (s: GameState): Chapter | undefined => (s.campaign ? CHAPTERS.find((c) => c.id === s.campaign!.chapter) : undefined);

/** Прогресс цели одной строкой: «3 / 5», «ход 12 / 30»… */
export const progress = (s: GameState, me: string): string => {
  const ch = chapterOf(s);
  if (!ch) return '';
  const g = ch.goal;
  const c = s.campaign!;
  switch (g.kind) {
    case 'cities': return `${playerHalls(s, me).length} / ${g.n}`;
    case 'subdue': return `${c.rivals.filter((id) => !s.players[id].alive || s.players[id].overlord === me).length} / ${g.n}`;
    case 'hold': return `${Math.min(s.turn, ch.limit)} / ${ch.limit}`;
    case 'take': return `${g.names.filter((n) => playerHalls(s, me).some((h) => h.name === n)).length} / ${g.names.length}`;
    case 'strongest': return `#${rank(s, me)}`;
    case 'capitals': return `${c.caps.filter((h) => s.halls[h]?.owner === me).length} / ${g.n}`;
    case 'win': return `${c.rivals.filter((id) => !s.players[id].alive || s.players[id].overlord === me).length} / ${c.rivals.length}`;
  }
};
const rank = (s: GameState, me: string): number => {
  const mine = s.players[me].alive ? finalScore(nationStats(s, me)) : 0;
  return 1 + s.order.filter((id) => id !== me && s.players[id].alive && finalScore(nationStats(s, id)) > mine).length;
};

/** Отметить, что случилось в главе (вызывается после боёв и ходов). */
export const note = (s: GameState, me: string, what: { battle?: { won: boolean; lost: boolean; generalLost: boolean } }): void => {
  const c = s.campaign;
  if (!c) return;
  if (what.battle) {
    if (what.battle.won) c.wins = (c.wins ?? 0) + 1;
    if (what.battle.lost) c.lostBattle = true;
    if (what.battle.generalLost) c.genLost = true;
  }
  if (Object.values(s.halls).some((h) => h.takenFrom === me && h.owner !== me)) c.lostCity = true;
  if (s.players[me].res.gold >= 1000) c.gold1000 = true;
};

/** Итог главы сейчас: 'won' — цель выполнена, 'lost' — провалена, null — идёт. */
export const verdict = (s: GameState, me: string): 'won' | 'lost' | null => {
  const ch = chapterOf(s);
  if (!ch) return null;
  note(s, me, {});
  if (!s.players[me].alive) return 'lost';
  const g = ch.goal, c = s.campaign!;
  const subdued = c.rivals.filter((id) => !s.players[id].alive || s.players[id].overlord === me).length;
  let done = false;
  switch (g.kind) {
    case 'cities': done = playerHalls(s, me).length >= g.n; break;
    case 'subdue': done = subdued >= g.n; break;
    case 'take': done = g.names.every((n) => playerHalls(s, me).some((h) => h.name === n)); break;
    case 'capitals': done = c.caps.filter((h) => s.halls[h]?.owner === me).length >= g.n; break;
    case 'win': done = winner(s) === me || subdued === c.rivals.length; break;
    case 'hold':
      if (c.capital && s.halls[c.capital]?.owner !== me) return 'lost';
      done = s.turn >= ch.limit; break;
    case 'strongest':
      if (s.turn < ch.limit) return null;
      return rank(s, me) === 1 ? 'won' : 'lost';
  }
  if (done) return 'won';
  return s.turn > ch.limit ? 'lost' : null;
};

/** Глава пройдена: звёзды и подвиги в династию. Возвращает звёзды и строки опыта. */
export const completeChapter = (s: GameState, me: string): { stars: number; lines: [string, number][]; special: boolean } => {
  const ch = chapterOf(s)!;
  const stars = 1 + (ch.star2.check(s, me) ? 1 : 0) + (s.campaign?.lostCity ? 0 : 1);
  const d = dynasty();
  const before = d.chapters?.[ch.id] ?? 0;
  (d.chapters ??= {})[ch.id] = Math.max(before, stars);
  const special = !!ch.special?.check(s, me);
  if (special) (d.feats ??= {})[ch.special!.id] = Date.now();
  saveDynasty();
  const lines: [string, number][] = [[`${ch.name}: ${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`, stars > before ? 150 * (stars - before) : 0]];
  return { stars, lines, special };
};
