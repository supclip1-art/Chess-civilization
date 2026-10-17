// Все 26 наций игры, их бонусы, правители и названия городов. Любую нацию можно выбрать на любой карте.

import type { Piece, Res, ResourceBuilding } from './config.ts';
import type { Terrain } from './state.ts';

export type NationId =
  | 'russia' | 'ukraine' | 'poland' | 'germany' | 'france' | 'britain' | 'spain' | 'italy' | 'turkey'
  | 'egypt' | 'arabia' | 'persia' | 'uzbekistan' | 'kazakhstan' | 'pakistan' | 'india' | 'bangladesh'
  | 'china' | 'korea' | 'japan' | 'vietnam' | 'indonesia' | 'nigeria' | 'mexico' | 'usa' | 'brazil'
  | 'outlaws'; // разбойники — только для режима «Играть за разбойников»
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
  freeBuilderUpkeep?: boolean; // Франция, США: строители не едят
  armyUpkeepRate?: number; // Британия
  generalHireDiscount?: number; // Турция
  upgradeDiscount?: number; // Италия: улучшения города и таверны дешевле на эту долю
  /** Прибавка выработки зданию kind на уровнях from..to (Испания, Украина, Китай, Индонезия, Нигерия, Бразилия). */
  output?: { kind: ResourceBuilding; from: number; to: number; res: keyof Res; amount: number }[];
  farmNearWater?: number; // Египет: ферма на поле у воды
  goldPerCity?: number; // Аравия: за каждый город, кроме столицы
  /** Здание можно ставить ещё и на эту местность, но не выше maxLevel (Персия — пустыня, Мексика — прибрежная вода). */
  extraTerrain?: { kind: ResourceBuilding; terrain: Terrain; maxLevel: number; coastal?: boolean }[];
  buildCostMult?: Partial<Record<ResourceBuilding, number>>; // Польша: рудники дешевле (постройка и улучшения)
  upgradeCostMult?: Partial<Record<ResourceBuilding, number>>; // Пакистан: улучшения ферм дешевле
  barracksCostMult?: number; // Узбекистан
  firstLevelRadius?: number; // Казахстан: город 1-го уровня охватывает радиус 2
  researchTurnsMinus?: number; // Индия
  researchCostMult?: number; // Корея
  startBonus?: Res; // Бангладеш
  goldPerWin?: number; // Мексика: золото за каждую выигранную битву
  castles?: boolean; // Япония: захваченный ею город не теряет уровень и здания, осада японского города — 2 хода
  piecePrice?: Partial<Record<Piece, number>>; // Вьетнам
};

const N = (
  id: NationId, name: string, bonus: string, effect: string, rulers: [string, string, string], cities: string, mods: Mods,
): Nation => ({ id, name, bonus, effect, rulers: { warlike: rulers[0], moderate: rulers[1], peaceful: rulers[2] }, cities: cities.split(', '), mods });

export const NATIONS: Record<NationId, Nation> = {
  russia: N('russia', 'Russia', 'Vast Lands', 'Settlers cost 30% less and found a city in 1 turn instead of 2.',
    ['Ivan the Terrible', 'Peter the Great', 'Elizabeth of Russia'],
    'Moscow, Saint Petersburg, Novgorod, Kazan, Smolensk, Tver, Yaroslavl, Vladimir, Pskov, Tula, Ryazan, Rostov',
    { townHallFoundCostMult: 0.7, townHallFoundTurns: 1 }),
  ukraine: N('ukraine', 'Ukraine', 'Black Earth', 'Farms at levels 1–3 produce +10 food.',
    ['Petro Sahaidachny', 'Bohdan Khmelnytsky', 'Danylo of Galicia'],
    'Kyiv, Lviv, Kharkiv, Odesa, Dnipro, Chernihiv, Poltava, Vinnytsia, Zhytomyr, Uman, Kamianets, Lutsk',
    { output: [{ kind: 'farm', from: 1, to: 3, res: 'food', amount: 10 }] }),
  poland: N('poland', 'Poland', 'Salt Mines', 'Gold mines cost 25% less to build and upgrade.',
    ['Bolesław the Brave', 'John III Sobieski', 'Casimir the Great'],
    'Warsaw, Kraków, Gdańsk, Poznań, Wrocław, Łódź, Lublin, Toruń, Szczecin, Płock, Gniezno, Białystok',
    { buildCostMult: { mine: 0.75 } }),
  germany: N('germany', 'Germany', 'School of Engineering', 'Farm, sawmill, mine and fishery upgrades to levels 4 and 5 finish 1 turn faster.',
    ['Frederick the Great', 'Otto von Bismarck', 'Frederick III'],
    'Berlin, Hamburg, Munich, Cologne, Frankfurt, Nuremberg, Dresden, Leipzig, Bremen, Stuttgart, Hanover, Königsberg',
    { highUpgradeTurnsMinus: 1 }),
  france: N('france', 'France', 'Cathedral Builders', 'The 2nd and 3rd builders are free to hire and eat no food.',
    ['Napoleon', 'Louis XIV', 'Henry IV'],
    'Paris, Lyon, Marseille, Bordeaux, Toulouse, Orléans, Reims, Rouen, Nantes, Strasbourg, Lille, Avignon',
    { freeBuilderHire: true, freeBuilderUpkeep: true }),
  britain: N('britain', 'Britain', 'Trading Companies', 'Army upkeep is 20% lower: 0.2 food per gold of army value instead of 0.25.',
    ['Henry V', 'Elizabeth I', 'Alfred the Great'],
    'London, York, Manchester, Liverpool, Bristol, Birmingham, Edinburgh, Canterbury, Oxford, Cambridge, Nottingham, Plymouth',
    { armyUpkeepRate: 0.2 }),
  spain: N('spain', 'Spain', 'New World Silver', 'Every gold mine produces +1 gold per turn at any level.',
    ['Philip II', 'Isabella I', 'Charles III'],
    'Madrid, Toledo, Seville, Barcelona, Valencia, Granada, Córdoba, Zaragoza, Salamanca, Bilbao, Málaga, Burgos',
    { output: [{ kind: 'mine', from: 1, to: 5, res: 'gold', amount: 1 }] }),
  italy: N('italy', 'Italy', 'Renaissance', 'City and tavern upgrades cost 25% less.',
    ['Trajan', 'Victor Emmanuel II', "Lorenzo de' Medici"],
    'Rome, Milan, Florence, Turin, Bologna, Genoa, Pisa, Siena, Verona, Palermo, Bari, Ravenna',
    { upgradeDiscount: 0.25 }),
  turkey: N('turkey', 'Turkey', 'Grand Bazaar', 'Hiring a general costs 20 gold less.',
    ['Selim I', 'Suleiman the Magnificent', 'Ahmed III'],
    'Istanbul, Ankara, Bursa, Izmir, Edirne, Konya, Trabzon, Antalya, Adana, Sinop, Kayseri, Erzurum',
    { generalHireDiscount: 20 }),
  egypt: N('egypt', 'Egypt', 'Gifts of the Nile', 'Farms on fields next to water produce +10 food.',
    ['Ramesses II', 'Muhammad Ali', 'Hatshepsut'],
    'Cairo, Alexandria, Thebes, Memphis, Giza, Aswan, Luxor, Faiyum, Damietta, Rosetta, Asyut, Suez',
    { farmNearWater: 10 }),
  arabia: N('arabia', 'Arabia', 'Caravan Routes', '+5 gold per turn for every city except the capital.',
    ['al-Mansur', 'Harun al-Rashid', "al-Ma'mun"],
    "Mecca, Medina, Riyadh, Jeddah, Taif, Ha'il, Tabuk, Najran, Dammam, Buraydah, Yanbu, Abha",
    { goldPerCity: 5 }),
  persia: N('persia', 'Persia', 'Qanats', 'Farms can also be built on desert (up to level 3).',
    ['Nader Shah', 'Cyrus the Great', 'Karim Khan Zand'],
    'Persepolis, Isfahan, Tehran, Shiraz, Tabriz, Mashhad, Hamadan, Yazd, Kerman, Qazvin, Susa, Rey',
    { extraTerrain: [{ kind: 'farm', terrain: 'desert', maxLevel: 3 }] }),
  uzbekistan: N('uzbekistan', 'Uzbekistan', 'Crafts of Samarkand', 'Barracks cost 25% less.',
    ['Amir Timur', 'Babur', 'Ulugh Beg'],
    'Samarkand, Bukhara, Tashkent, Khiva, Kokand, Termez, Fergana, Namangan, Andijan, Shahrisabz, Nukus, Karshi',
    { barracksCostMult: 0.75 }),
  kazakhstan: N('kazakhstan', 'Kazakhstan', 'Great Steppe', 'A level 1 city covers a radius of 2 cells instead of 1.',
    ['Ablai Khan', 'Kasym Khan', 'Tauke Khan'],
    'Astana, Almaty, Turkestan, Shymkent, Taraz, Karaganda, Aktobe, Pavlodar, Semey, Atyrau, Oral, Kostanay',
    { firstLevelRadius: 2 }),
  pakistan: N('pakistan', 'Pakistan', 'Five Rivers', 'Farm upgrades cost 25% less.',
    ['Ahmad Shah Durrani', 'Shah Jahan', 'Mir Fateh Ali Khan Talpur'],
    'Lahore, Karachi, Islamabad, Multan, Peshawar, Quetta, Hyderabad, Faisalabad, Rawalpindi, Sialkot, Bahawalpur, Thatta',
    { upgradeCostMult: { farm: 0.75 } }),
  india: N('india', 'India', 'Birthplace of Chess', 'Each Tactics research finishes 1 turn faster.',
    ['Chandragupta Maurya', 'Akbar', 'Ashoka'],
    'Delhi, Agra, Pataliputra, Varanasi, Jaipur, Mumbai, Kolkata, Chennai, Ujjain, Mysore, Madurai, Lucknow',
    { researchTurnsMinus: 1 }),
  bangladesh: N('bangladesh', 'Bangladesh', 'Fertile Delta', 'Start the game with +30 food and +30 wood.',
    ['Shamsuddin Ilyas Shah', 'Alauddin Husain Shah', 'Ghiyasuddin Azam Shah'],
    'Dhaka, Chittagong, Sonargaon, Gaur, Rajshahi, Khulna, Sylhet, Comilla, Barisal, Rangpur, Mymensingh, Bogra',
    { startBonus: { wood: 30, food: 30, gold: 0 } }),
  china: N('china', 'China', 'Rice Terraces', 'Farms at levels 4–5 produce +20 food.',
    ['Qin Shi Huang', 'Kangxi', 'Emperor Wen of Han'],
    "Beijing, Xi'an, Nanjing, Luoyang, Kaifeng, Hangzhou, Guangzhou, Chengdu, Suzhou, Wuhan, Shanghai, Kunming",
    { output: [{ kind: 'farm', from: 4, to: 5, res: 'food', amount: 20 }] }),
  korea: N('korea', 'Korea', 'State Examinations', 'Tactics research costs 25% less.',
    ['Gwanggaeto the Great', 'Taejo of Goryeo', 'Sejong the Great'],
    'Seoul, Gyeongju, Kaesong, Pyongyang, Busan, Daegu, Gwangju, Jeonju, Suwon, Incheon, Daejeon, Ulsan',
    { researchCostMult: 0.75 }),
  japan: N('japan', 'Japan', 'Castles', 'Cities you capture keep their level, buildings, barracks and tavern, and a siege of a Japanese city lasts 2 turns.',
    ['Oda Nobunaga', 'Tokugawa Ieyasu', 'Prince Shōtoku'],
    'Kyoto, Edo, Osaka, Nara, Kamakura, Nagoya, Sendai, Hiroshima, Kanazawa, Nagasaki, Fukuoka, Sapporo',
    { castles: true }),
  vietnam: N('vietnam', 'Vietnam', "People's Militia", 'Pawns cost 7 gold instead of 10.',
    ['Quang Trung', 'Lê Thánh Tông', 'Lý Thái Tổ'],
    'Hanoi, Huế, Saigon, Hội An, Hải Phòng, Đà Nẵng, Nha Trang, Cần Thơ, Vinh, Thái Nguyên, Nam Định, Quy Nhơn',
    { piecePrice: { p: 7 } }),
  indonesia: N('indonesia', 'Indonesia', 'Spice Islands', 'Farms at levels 4–5 also produce +5 gold.',
    ['Sultan Agung', 'Hayam Wuruk', 'Hamengkubuwono I'],
    'Jakarta, Yogyakarta, Surabaya, Bandung, Semarang, Medan, Makassar, Palembang, Denpasar, Malang, Banda Aceh, Surakarta',
    { output: [{ kind: 'farm', from: 4, to: 5, res: 'gold', amount: 5 }] }),
  nigeria: N('nigeria', 'Nigeria', 'Benin Bronzes', 'Gold mines at levels 3–5 produce +5 gold.',
    ['Queen Amina', 'Idris Alooma', 'Ewuare the Great'],
    'Abuja, Lagos, Kano, Benin City, Ibadan, Zaria, Ife, Oyo, Kaduna, Sokoto, Calabar, Maiduguri',
    { output: [{ kind: 'mine', from: 3, to: 5, res: 'gold', amount: 5 }] }),
  mexico: N('mexico', 'Mexico', 'Flower Wars', 'Every battle you win brings 30 gold.',
    ['Ahuitzotl', 'Benito Juárez', 'Nezahualcoyotl'],
    'Mexico City, Puebla, Guadalajara, Monterrey, Oaxaca, Veracruz, Mérida, Querétaro, Zacatecas, Morelia, Acapulco, Tijuana',
    { goldPerWin: 30 }),
  usa: N('usa', 'USA', 'Industrialization', 'Builders eat no food.',
    ['James K. Polk', 'George Washington', 'Thomas Jefferson'],
    'Washington, Philadelphia, New York, Boston, Chicago, San Francisco, New Orleans, Los Angeles, Seattle, Houston, Denver, Atlanta',
    { freeBuilderUpkeep: true }),
  brazil: N('brazil', 'Brazil', 'Amazonia', 'Sawmills from level 2 produce +10 wood.',
    ['Deodoro da Fonseca', 'Pedro I', 'Pedro II'],
    'Rio de Janeiro, Salvador, São Paulo, Brasília, Recife, Manaus, Belém, Ouro Preto, Fortaleza, Curitiba, Porto Alegre, Belo Horizonte',
    { output: [{ kind: 'sawmill', from: 2, to: 5, res: 'wood', amount: 10 }] }),
  outlaws: N('outlaws', 'Outlaws', 'Loot and Pillage', 'Every battle you win brings 20 gold. Without a city the band needs no food.',
    ['Ivo the Black', 'Margit Redhand', 'Old Grey Wolf'],
    'Freehold, Ravenrock, Crowfield, Wolfden, Blackmoor, Cutthroat Ford, Gallows Hill, Smugglers Cove, Thornwood, Ashgate, Redwater, Hollow Keep',
    { goldPerWin: 20 }),
};

/** Порядок наций на экране выбора и для ИИ (разбойники — отдельный режим, в общий список не входят). */
export const NATION_ORDER: NationId[] = (Object.keys(NATIONS) as NationId[]).filter((n) => n !== 'outlaws');

/** Названия городов нейтральных государств. */
export const NEUTRAL_CITIES: string[] = [
  'Venice', 'Naples', 'Ragusa', 'Trieste', 'Zürich', 'Vienna', 'Prague', 'Kraków', 'Warsaw', 'Budapest', 'Belgrade', 'Athens', 'Lisbon', 'Amsterdam', 'Brussels', 'Bern', 'Copenhagen', 'Stockholm', 'Riga', 'Vilnius', 'Bucharest', 'Sofia', 'Dubrovnik', 'Valletta',
];

// ---------- Имена генералов ----------

/** Имена полководцев по культурным регионам: новый генерал игрока получает свободное имя своего региона. */
const COMMANDERS: Record<string, string[]> = {
  slavic: ['Suvorov', 'Kutuzov', 'Bagration', 'Skobelev', 'Pozharsky', 'Rumyantsev', 'Zholkiewski', 'Kosciuszko', 'Sirko', 'Doroshenko'],
  western: ['Turenne', 'Condé', 'Vauban', 'Moltke', 'Blücher', 'Scharnhorst', 'Marlborough', 'Wellington', 'Nelson', 'Cromwell'],
  southern: ['Gonzalo', 'Alba', 'Spínola', 'Garibaldi', 'Colonna', 'Montecuccoli', 'Cortés', 'Pizarro', 'Doria', 'Sforza'],
  middle: ['Barbarossa', 'Köprülü', 'Saladin', 'Baibars', 'Khalid', 'Tariq', 'Nader', 'Rostam', 'Shapur', 'Mehmed'],
  steppe: ['Subutai', 'Jebe', 'Bogenbay', 'Kabanbay', 'Raiymbek', 'Mukhali', 'Toktamysh', 'Edige', 'Shaybani', 'Nogai'],
  south_asia: ['Bajirao', 'Hari Singh', 'Tipu', 'Haidar', 'Raja Man Singh', 'Isa Khan', 'Shivaji', 'Prithviraj', 'Bairam Khan', 'Malik Ambar'],
  east_asia: ['Yue Fei', 'Han Xin', 'Qi Jiguang', 'Yi Sun-sin', 'Eulji', 'Kwon Yul', 'Takeda', 'Uesugi', 'Tran Hung Dao', 'Le Loi'],
  outlaw: ['Scarface', 'Raven', 'Kestrel', 'One-Eye', 'Halfhand', 'the Fox', 'Black Jack', 'the Hound', 'Ironjaw', 'Slyboots'],
  far: ['Gajah Mada', 'Diponegoro', 'Moremi', 'Usman', 'Tlacaelel', 'Zaragoza', 'Grant', 'Lee', 'Caxias', 'Osório'],
};
const REGION: Record<NationId, keyof typeof COMMANDERS> = {
  russia: 'slavic', ukraine: 'slavic', poland: 'slavic', germany: 'western', france: 'western', britain: 'western',
  spain: 'southern', italy: 'southern', turkey: 'middle', egypt: 'middle', arabia: 'middle', persia: 'middle',
  uzbekistan: 'steppe', kazakhstan: 'steppe', pakistan: 'south_asia', india: 'south_asia', bangladesh: 'south_asia',
  china: 'east_asia', korea: 'east_asia', japan: 'east_asia', vietnam: 'east_asia', indonesia: 'far', nigeria: 'far',
  mexico: 'southern', usa: 'far', brazil: 'far', outlaws: 'outlaw',
};
export const commanderNames = (nation: NationId): string[] => COMMANDERS[REGION[nation]];
