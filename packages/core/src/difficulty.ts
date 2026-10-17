// Сложность ИИ — шахматные разряды. Влияет только на ИИ и только на три вещи: стартовые ресурсы, агрессию
// (характер, ход начала войн, с каким перевесом нападает) и «интеллект» (сколько армии копит перед походом,
// сколько городов хочет, берёт ли технологии и академию). ELO генералов сложность не трогает.
//   novice      «Новичок»        — миролюбивее, воюет позже и лишь при большом перевесе, технологии не учит;
//   club        «Перворазрядник» — как раньше;
//   master      «Мастер»         — +80 дерева и еды, +50 золота, воюет раньше, хочет больше городов;
//   grandmaster «Гроссмейстер»   — +150 дерева и еды, +100 золота, на ступень воинственнее, нападает при малом перевесе.

import { type Aggression } from './nations.ts';
import { type Res } from './config.ts';

export type Difficulty = 'novice' | 'club' | 'master' | 'grandmaster';
export const DIFFICULTIES: Difficulty[] = ['novice', 'club', 'master', 'grandmaster'];

type Level = {
  name: string; text: string;
  res: Res;
  shift: -1 | 0 | 1; // на сколько ступеней воинственнее характер
  war: number; // сдвиг хода, с которого воюет с игроками
  vs: number; // поправка к требуемому перевесу для нападения
  cities: number; // сколько городов хочет сверх характера
  prey: number; // насколько слабее должна быть страна, чтобы объявить ей войну (доля силы)
  army: number; // сколько армии копит перед походом (поправка к minArmy)
  techs: boolean; // учит технологии и переобучает генералов
};

export const DIFFICULTY: Record<Difficulty, Level> = {
  novice: { name: 'Novice', text: 'cautious rivals: they go to war late and only with a big advantage, and skip technologies', res: { wood: 0, food: 0, gold: 0 }, shift: -1, war: 6, vs: 0.25, cities: -1, prey: 0.7, army: 25, techs: false },
  club: { name: 'Club player', text: 'a fair fight: rivals start like you do', res: { wood: 0, food: 0, gold: 0 }, shift: 0, war: 0, vs: 0, cities: 0, prey: 0.9, army: 0, techs: true },
  master: { name: 'Master', text: 'rivals start richer, go to war earlier and expand harder', res: { wood: 80, food: 80, gold: 50 }, shift: 0, war: -2, vs: -0.08, cities: 1, prey: 1, army: -10, techs: true },
  grandmaster: { name: 'Grandmaster', text: 'merciless: rich from the start, warlike and quick to strike', res: { wood: 150, food: 150, gold: 100 }, shift: 1, war: -3, vs: -0.15, cities: 2, prey: 1.1, army: -15, techs: true },
};

export const difficultyOf = (s: { settings: { difficulty?: Difficulty } }): Level => DIFFICULTY[s.settings.difficulty ?? 'club'];

const LADDER: Aggression[] = ['peaceful', 'moderate', 'warlike'];
/** Характер ИИ с поправкой на сложность. */
export const shiftAggression = (a: Aggression, shift: number): Aggression => LADDER[Math.max(0, Math.min(2, LADDER.indexOf(a) + shift))];
