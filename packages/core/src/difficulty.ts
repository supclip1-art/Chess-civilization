// Сложность ИИ — шахматные разряды. Влияет только на ИИ: стартовые ресурсы и армия, ELO генералов (и его потолок),
// доход, характер (насколько рано и охотно воюет, сколько городов хочет) и порог, с которым он нападает.
//   novice      «Новичок»      — мягкий: позже и осторожнее воюет, доход −15%, генералы на 100 ELO слабее;
//   club        «Перворазрядник» — как раньше, без бонусов;
//   master      «Мастер»       — +60 дерева и еды, +30 золота, +2 пешки, генералы +100 ELO, доход +10%, воюет раньше;
//   grandmaster «Гроссмейстер»  — +120 дерева и еды, +60 золота, +2 пешки и слон, +150 ELO, доход +20%,
//                                 характер на ступень воинственнее, нападает при малом перевесе.

import { type Aggression } from './nations.ts';
import { type Piece, type Res } from './config.ts';

export type Difficulty = 'novice' | 'club' | 'master' | 'grandmaster';
export const DIFFICULTIES: Difficulty[] = ['novice', 'club', 'master', 'grandmaster'];

type Level = {
  name: string; text: string;
  res: Res; army: Partial<Record<Piece, number>>; elo: number; income: number;
  shift: -1 | 0 | 1; // на сколько ступеней воинственнее характер
  war: number; // сдвиг хода, с которого воюет с игроками
  vs: number; // поправка к требуемому перевесу для нападения
  cities: number; // сколько городов хочет сверх характера
  prey: number; // насколько слабее должна быть страна, чтобы объявить ей войну (доля силы)
};

export const DIFFICULTY: Record<Difficulty, Level> = {
  novice: { name: 'Novice', text: 'cautious rivals with weaker generals and a smaller economy', res: { wood: 0, food: 0, gold: 0 }, army: {}, elo: -100, income: 0.85, shift: -1, war: 6, vs: 0.25, cities: -1, prey: 0.7 },
  club: { name: 'Club player', text: 'a fair fight: rivals start like you do', res: { wood: 0, food: 0, gold: 0 }, army: {}, elo: 0, income: 1, shift: 0, war: 0, vs: 0, cities: 0, prey: 0.9 },
  master: { name: 'Master', text: 'rivals start richer, fight earlier and their generals play stronger', res: { wood: 60, food: 60, gold: 30 }, army: { p: 2 }, elo: 100, income: 1.1, shift: 0, war: -2, vs: -0.08, cities: 1, prey: 1 },
  grandmaster: { name: 'Grandmaster', text: 'merciless: a head start in everything, warlike rivals and master-class generals', res: { wood: 120, food: 120, gold: 60 }, army: { p: 2, b: 1 }, elo: 150, income: 1.2, shift: 1, war: -3, vs: -0.15, cities: 2, prey: 1.1 },
};

export const difficultyOf = (s: { settings: { difficulty?: Difficulty } }): Level => DIFFICULTY[s.settings.difficulty ?? 'club'];

const LADDER: Aggression[] = ['peaceful', 'moderate', 'warlike'];
/** Характер ИИ с поправкой на сложность. */
export const shiftAggression = (a: Aggression, shift: number): Aggression => LADDER[Math.max(0, Math.min(2, LADDER.indexOf(a) + shift))];
