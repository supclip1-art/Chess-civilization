# Карта «Италия» — только для первой главы кампании «Возвышение Рима»: полуостров с Сицилией,
# Рим против Венеции на севере и Сицилии на юге, между ними — вольные города.
# Запуск: python3 tools/mapgen.py tools/maps/italy.py <папка ne/geojson>
ID = 'italy'
TITLE = 'Италия'
NAME = 'Italy'
FN = 'italyMap'
OUT = 'packages/core/src/maps/italy.ts'
LON_MIN, LON_MAX = 6.4, 18.9
LAT_MIN, LAT_MAX = 36.5, 46.9
K_LAT = 41.5
HEX_W = 0.29


def MASK(lon, lat):
    """Только Италия: без Франции и Швейцарии за Альпами, без Балкан, Корсики, Сардинии и Африки."""
    if lat > 46.55:
        return False
    if lon < 7.0 and lat > 43.8:
        return False  # Франция за Альпами
    if lon > 13.8 and lat > 45.2:
        return False  # Словения
    if lon > 13.75 and lat > 42.0 and lon > 14.0 + (lat - 42.0) * 0.3 and lat > 44.0:
        return False
    if lon > 15.2 and lat > 42.3:
        return False  # Далмация
    if lon < 10.0 and lat < 43.2:
        return False  # Корсика и Сардиния
    if lat < 36.6:
        return False  # Мальта и Африка
    return True


RANGES = [
    ('Alps', [(7.0, 44.3), (7.0, 45.3), (7.7, 45.95), (9.0, 46.35), (10.5, 46.4), (12.2, 46.45), (13.6, 46.35)], 0.3),
    ('Apennines', [(8.9, 44.45), (10.4, 44.2), (11.8, 43.7), (12.9, 43.0), (13.6, 42.2), (14.5, 41.4), (15.4, 40.6), (16.0, 39.7), (16.2, 38.9)], 0.13),
    ('Etna', [(14.85, 37.72), (15.05, 37.78)], 0.1),
]
PASSES = [(7.3, 45.0), (11.5, 44.0), (13.9, 41.9), (15.6, 40.3)]
DEPOSITS = [(10.6, 43.1), (11.2, 42.8), (8.6, 45.6), (12.6, 46.2), (14.8, 37.5), (15.8, 39.2), (13.2, 37.6), (10.3, 44.6)]
FOREST_ZONES = [
    (8.5, 45.6, 1.0, 0.45), (11.5, 46.0, 1.5, 0.5), (11.4, 43.6, 1.0, 0.4), (13.6, 42.4, 0.8, 0.45), (16.2, 39.4, 0.7, 0.5),
    (15.5, 40.6, 0.8, 0.35), (14.4, 37.9, 0.6, 0.3),
]
FOREST_BASE = 0.14


def climate(lon, lat, q, r, noise, smooth_noise):
    return None


CROSSINGS = [
    [(15.62, 38.25)],  # Мессина: Сицилия связана с полуостровом
]

SPAWNS = [  # нация, город, долгота, широта
    ('italy', 'Rome', 12.5, 41.9),
    ('venice', 'Venice', 12.3, 45.4),
    ('sicily', 'Syracuse', 15.29, 37.07),
]
MAX_PLAYERS = 3
HOME_EXTRA = {'Venice': {'field1': 3}, 'Syracuse': {'field1': 3}}


def NO_BANDITS(lon, lat):
    return False


NEUTRALS = [
    ('Milan', 9.19, 45.46), ('Turin', 7.68, 45.07), ('Genoa', 8.93, 44.41), ('Bologna', 11.34, 44.49), ('Florence', 11.25, 43.77),
    ('Pisa', 10.4, 43.72), ('Verona', 10.99, 45.44), ('Ravenna', 12.2, 44.42), ('Ancona', 13.5, 43.6), ('Perugia', 12.39, 43.11),
    ('Naples', 14.27, 40.85), ('Capua', 14.21, 41.1), ('Bari', 16.87, 41.12), ('Tarentum', 17.24, 40.47), ('Brundisium', 17.94, 40.63),
    ('Rhegium', 15.65, 38.11), ('Crotone', 17.12, 39.08), ('Palermo', 13.36, 38.12), ('Agrigento', 13.58, 37.31), ('Messina', 15.55, 38.19),
    ('Pescara', 14.2, 42.46), ('Benevento', 14.78, 41.13), ('Potentia', 15.8, 40.64), ('Cosenza', 16.25, 39.3),
]
NEUTRAL_COUNT = 14
