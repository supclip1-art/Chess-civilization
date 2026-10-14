// Нации MVP и их экономические бонусы. Полный список из 26 — в дизайн-документе.

export type NationId = 'russia' | 'germany' | 'france' | 'britain' | 'spain' | 'turkey' | 'italy';
export type Aggression = 'warlike' | 'moderate' | 'peaceful';

export type Nation = {
  id: NationId;
  name: string; // название в игре (английский интерфейс)
  bonus: string;
  effect: string; // что даёт бонус, для экрана выбора нации
  rulers: Record<Aggression, string>;
  /** Названия городов: первый — столица, дальше по порядку основания. */
  cities: string[];
  mods: Mods;
};

/** Числовые модификаторы, которые читают правила. Всё, чего нет, — без изменений. */
export type Mods = {
  townHallFoundCostMult?: number; // Россия
  townHallFoundTurns?: number; // Россия
  highUpgradeTurnsMinus?: number; // Германия: улучшения ресурсных зданий до ур.4–5 быстрее (казарма и таверна — нет)
  freeBuilderHire?: boolean; // Франция: найм 2-го и 3-го строителя бесплатно
  freeBuilderUpkeep?: boolean; // Франция: строители не едят
  armyUpkeepRate?: number; // Британия
  mineLowLevelBonus?: number; // Испания: рудники ур.1 дают +N золота
  generalHireDiscount?: number; // Турция
  upgradeDiscount?: number; // Италия: улучшения города и таверны дешевле на эту долю
};

export const NATIONS: Record<NationId, Nation> = {
  russia: {
    id: 'russia', name: 'Russia', bonus: 'Vast Lands',
    effect: 'Founding a city costs 30% less and takes 1 turn instead of 2.',
    rulers: { warlike: 'Ivan the Terrible', moderate: 'Peter the Great', peaceful: 'Elizabeth of Russia' },
    cities: ['Moscow', 'Saint Petersburg', 'Novgorod', 'Kazan', 'Smolensk', 'Tver', 'Yaroslavl', 'Vladimir', 'Pskov', 'Tula', 'Ryazan', 'Rostov'],
    mods: { townHallFoundCostMult: 0.7, townHallFoundTurns: 1 },
  },
  germany: {
    id: 'germany', name: 'Germany', bonus: 'School of Engineering',
    effect: 'Farm, sawmill, mine and fishery upgrades to levels 4 and 5 finish 1 turn faster.',
    rulers: { warlike: 'Frederick the Great', moderate: 'Otto von Bismarck', peaceful: 'Frederick III' },
    cities: ['Berlin', 'Hamburg', 'Munich', 'Cologne', 'Frankfurt', 'Nuremberg', 'Dresden', 'Leipzig', 'Bremen', 'Stuttgart', 'Hanover', 'Königsberg'],
    mods: { highUpgradeTurnsMinus: 1 },
  },
  france: {
    id: 'france', name: 'France', bonus: 'Cathedral Builders',
    effect: 'The 2nd and 3rd builders are free to hire and eat no food.',
    rulers: { warlike: 'Napoleon', moderate: 'Louis XIV', peaceful: 'Henry IV' },
    cities: ['Paris', 'Lyon', 'Marseille', 'Bordeaux', 'Toulouse', 'Orléans', 'Reims', 'Rouen', 'Nantes', 'Strasbourg', 'Lille', 'Avignon'],
    mods: { freeBuilderHire: true, freeBuilderUpkeep: true },
  },
  britain: {
    id: 'britain', name: 'Britain', bonus: 'Trading Companies',
    effect: 'Army upkeep is 20% lower: 0.2 food per gold of army value instead of 0.25.',
    rulers: { warlike: 'Henry V', moderate: 'Elizabeth I', peaceful: 'Alfred the Great' },
    cities: ['London', 'York', 'Manchester', 'Liverpool', 'Bristol', 'Birmingham', 'Edinburgh', 'Canterbury', 'Oxford', 'Cambridge', 'Nottingham', 'Plymouth'],
    mods: { armyUpkeepRate: 0.2 },
  },
  spain: {
    id: 'spain', name: 'Spain', bonus: 'New World Silver',
    effect: 'Level 1 gold mines produce +5 gold per turn (10 instead of 5).',
    rulers: { warlike: 'Philip II', moderate: 'Isabella I', peaceful: 'Charles III' },
    cities: ['Madrid', 'Toledo', 'Seville', 'Barcelona', 'Valencia', 'Granada', 'Córdoba', 'Zaragoza', 'Salamanca', 'Bilbao', 'Málaga', 'Burgos'],
    mods: { mineLowLevelBonus: 5 },
  },
  italy: {
    id: 'italy', name: 'Italy', bonus: 'Renaissance',
    effect: 'City and tavern upgrades cost 25% less.',
    rulers: { warlike: 'Trajan', moderate: 'Victor Emmanuel II', peaceful: 'Lorenzo de\' Medici' },
    cities: ['Rome', 'Milan', 'Florence', 'Turin', 'Bologna', 'Genoa', 'Pisa', 'Siena', 'Verona', 'Palermo', 'Bari', 'Ravenna'],
    mods: { upgradeDiscount: 0.25 },
  },
  turkey: {
    id: 'turkey', name: 'Turkey', bonus: 'Grand Bazaar',
    effect: 'Hiring a general costs 20 gold less.',
    rulers: { warlike: 'Selim I', moderate: 'Suleiman the Magnificent', peaceful: 'Ahmed III' },
    cities: ['Istanbul', 'Ankara', 'Bursa', 'Izmir', 'Edirne', 'Konya', 'Trabzon', 'Antalya', 'Adana', 'Sinop', 'Kayseri', 'Erzurum'],
    mods: { generalHireDiscount: 20 },
  },
};

/** Названия городов нейтральных государств. */
export const NEUTRAL_CITIES: string[] = [
  'Venice', 'Naples', 'Ragusa', 'Trieste', 'Zürich', 'Vienna', 'Prague', 'Kraków', 'Warsaw', 'Budapest', 'Belgrade', 'Athens', 'Lisbon', 'Amsterdam', 'Brussels', 'Bern', 'Copenhagen', 'Stockholm', 'Riga', 'Vilnius', 'Bucharest', 'Sofia', 'Dubrovnik', 'Valletta',
];
