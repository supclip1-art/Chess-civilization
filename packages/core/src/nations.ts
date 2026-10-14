// Нации MVP и их экономические бонусы. Полный список из 26 — в дизайн-документе.

export type NationId = 'russia' | 'germany' | 'france' | 'britain' | 'spain' | 'turkey';
export type Aggression = 'warlike' | 'moderate' | 'peaceful';

export type Nation = {
  id: NationId;
  name: string; // название в игре (английский интерфейс)
  bonus: string;
  rulers: Record<Aggression, string>;
  mods: Mods;
};

/** Числовые модификаторы, которые читают правила. Всё, чего нет, — без изменений. */
export type Mods = {
  townHallFoundCostMult?: number; // Россия
  townHallFoundTurns?: number; // Россия
  highUpgradeTurnsMinus?: number; // Германия: улучшения до ур.4–5 быстрее
  freeBuilderHire?: boolean; // Франция
  armyUpkeepRate?: number; // Британия
  mineLowLevelBonus?: number; // Испания: рудники ур.1–2 дают +N золота
  generalHireDiscount?: number; // Турция
};

export const NATIONS: Record<NationId, Nation> = {
  russia: {
    id: 'russia', name: 'Russia', bonus: 'Vast Lands',
    rulers: { warlike: 'Ivan the Terrible', moderate: 'Peter the Great', peaceful: 'Elizabeth of Russia' },
    mods: { townHallFoundCostMult: 0.7, townHallFoundTurns: 1 },
  },
  germany: {
    id: 'germany', name: 'Germany', bonus: 'School of Engineering',
    rulers: { warlike: 'Frederick the Great', moderate: 'Otto von Bismarck', peaceful: 'Frederick III' },
    mods: { highUpgradeTurnsMinus: 1 },
  },
  france: {
    id: 'france', name: 'France', bonus: 'Cathedral Builders',
    rulers: { warlike: 'Napoleon', moderate: 'Louis XIV', peaceful: 'Henry IV' },
    mods: { freeBuilderHire: true },
  },
  britain: {
    id: 'britain', name: 'Britain', bonus: 'Trading Companies',
    rulers: { warlike: 'Henry V', moderate: 'Elizabeth I', peaceful: 'Alfred the Great' },
    mods: { armyUpkeepRate: 0.08 },
  },
  spain: {
    id: 'spain', name: 'Spain', bonus: 'New World Silver',
    rulers: { warlike: 'Philip II', moderate: 'Isabella I', peaceful: 'Charles III' },
    mods: { mineLowLevelBonus: 1 },
  },
  turkey: {
    id: 'turkey', name: 'Turkey', bonus: 'Grand Bazaar',
    rulers: { warlike: 'Selim I', moderate: 'Suleiman the Magnificent', peaceful: 'Ahmed III' },
    mods: { generalHireDiscount: 5 },
  },
};
