#!/usr/bin/env python3
"""Генератор карты «Европа» (4 игрока) для packages/core/src/maps/europe.ts.

Источник береговой линии и озёр — Natural Earth 1:50m (общественное достояние):
  git clone --depth 1 --filter=blob:none --sparse https://github.com/nvkelso/natural-earth-vector.git ne
  cd ne && git sparse-checkout set --no-cone /geojson/ne_50m_land.geojson /geojson/ne_50m_lakes.geojson
Запуск: python3 tools/europe_map.py <папка ne/geojson>

Сетка — шестиугольники с острой вершиной вверх (осевые координаты q, r), равнопромежуточная проекция.
Местность задаётся географией, а не случайно:
  вода — по береговой линии и крупным озёрам;
  горы — по осям хребтов (Альпы, Пиренеи, Апеннины, Карпаты, Динары, Атлас и др.) с перевалами;
  леса — по лесистости регионов (север и центр Европы гуще, юг реже) плюс мягкий шум;
  месторождения — исторические горнорудные районы (Рур, Силезия, Астурия, Рио-Тинто, Эльба…);
  тундра — только на крайнем севере, пустыня — только в Северной Африке южнее Атласа.
Узкие проливы (Ла-Манш, Мессина, Босфор, Эресунн) — проходимые клетки-«переправы», чтобы острова не были отрезаны.
"""

import json
import math
import sys

NE = sys.argv[1] if len(sys.argv) > 1 else 'ne/geojson'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'packages/core/src/maps/europe.ts'

LON_MIN, LON_MAX = -10.5, 24.5
LAT_MIN, LAT_MAX = 35.0, 56.5
K = math.cos(math.radians(46.0))  # сжатие долготы на средней широте
HEX_W = 0.55                      # ширина шестиугольника в градусах широты (~60 км)
S = HEX_W / math.sqrt(3)          # «радиус» шестиугольника


def center(q, r):
    x = math.sqrt(3) * (q + r / 2) * S
    y = 1.5 * r * S
    return LON_MIN + x / K, LAT_MAX - y


def to_hex(lon, lat):
    x = (lon - LON_MIN) * K
    y = LAT_MAX - lat
    qf = (math.sqrt(3) / 3 * x - y / 3) / S
    rf = (2 / 3 * y) / S
    # округление осевых координат
    xf, zf = qf, rf
    yf = -xf - zf
    rx, ry, rz = round(xf), round(yf), round(zf)
    dx, dy, dz = abs(rx - xf), abs(ry - yf), abs(rz - zf)
    if dx > dy and dx > dz:
        rx = -ry - rz
    elif dy > dz:
        ry = -rx - rz
    else:
        rz = -rx - ry
    return rx, rz


# ---------- полигоны ----------
# Полигоны суши не пересекаются, поэтому «внутри» = нечётное число пересечений луча со всеми рёбрами
# всех колец (внешних и дыр). Рёбра раскладываем по полосам широты, чтобы проверка была быстрой.

BAND = 0.1


def load_edges(path):
    bands = {}
    for f in json.load(open(path))['features']:
        g = f['geometry']
        parts = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        for p in parts:
            for ring in p:
                for i in range(len(ring) - 1):
                    (x1, y1), (x2, y2) = ring[i][:2], ring[i + 1][:2]
                    if max(x1, x2) < LON_MIN - 1 or min(y1, y2) > LAT_MAX + 1 or max(y1, y2) < LAT_MIN - 1:
                        continue
                    for b in range(int(math.floor(min(y1, y2) / BAND)), int(math.floor(max(y1, y2) / BAND)) + 1):
                        bands.setdefault(b, []).append((x1, y1, x2, y2))
    return bands


def inside(x, y, bands):
    n = 0
    for x1, y1, x2, y2 in bands.get(int(math.floor(y / BAND)), ()):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            n += 1
    return n % 2 == 1


LAND = load_edges(f'{NE}/ne_50m_land.geojson')
LAKES = load_edges(f'{NE}/ne_50m_lakes.geojson')


def land_share(q, r):
    """Доля суши в клетке по 7 точкам (центр и 6 точек на полпути к вершинам)."""
    lon, lat = center(q, r)
    pts = [(lon, lat)]
    for i in range(6):
        a = math.radians(60 * i - 30)
        pts.append((lon + math.cos(a) * S * 0.6 / K, lat + math.sin(a) * S * 0.6))
    n = 0
    for x, y in pts:
        if inside(x, y, LAND) and not inside(x, y, LAKES):
            n += 1
    return n / len(pts)


# ---------- география ----------

def seg_dist(px, py, ax, ay, bx, by):
    """Расстояние от точки до отрезка в «градусах широты» (долгота сжата)."""
    px, ax, bx = px * K, ax * K, bx * K
    dx, dy = bx - ax, by - ay
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy or 1)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def line_dist(lon, lat, pts):
    return min(seg_dist(lon, lat, *pts[i], *pts[i + 1]) for i in range(len(pts) - 1))


# оси горных хребтов (долгота, широта) и полуширина в градусах широты
RANGES = [
    ('Alps', [(6.9, 44.1), (6.9, 45.2), (7.6, 46.0), (9.0, 46.5), (10.5, 46.7), (12.3, 46.8), (13.8, 47.0), (15.2, 47.4)], 0.55),
    ('Pyrenees', [(-1.5, 43.0), (0.5, 42.7), (2.4, 42.5)], 0.35),
    ('Cantabrian', [(-7.0, 42.9), (-5.0, 43.0), (-3.6, 43.0)], 0.3),
    ('Sistema Central', [(-6.5, 40.3), (-4.6, 40.6)], 0.25),
    ('Sierra Nevada', [(-4.3, 37.1), (-2.6, 37.1)], 0.25),
    ('Apennines', [(8.8, 44.4), (10.5, 44.1), (12.6, 43.3), (13.6, 42.2), (14.9, 41.0), (15.9, 40.1)], 0.2),
    ('Carpathians', [(17.6, 48.9), (19.8, 49.3), (22.5, 49.0), (24.3, 47.9), (25.5, 46.9), (25.7, 45.7), (24.0, 45.4), (22.4, 45.2)], 0.4),
    ('Dinaric Alps', [(15.0, 45.2), (16.5, 44.2), (18.3, 43.2), (19.7, 42.4), (20.4, 41.4)], 0.4),
    ('Pindus', [(20.8, 40.4), (21.5, 39.2), (22.0, 38.4)], 0.3),
    ('Balkan Mts', [(22.5, 43.2), (24.5, 42.8), (26.2, 42.7)], 0.25),
    ('Rhodopes', [(23.6, 41.8), (25.2, 41.6)], 0.25),
    ('Atlas', [(-5.5, 33.0), (-3.0, 34.0), (0.5, 34.8), (3.5, 35.6), (6.5, 35.5), (8.5, 35.3)], 0.35),
    ('Taurus', [(29.5, 36.9), (30.0, 37.6)], 0.25),
    ('Scandes', [(6.5, 58.6), (8.0, 59.0)], 0.4),
    ('Massif Central', [(2.8, 45.1), (3.2, 45.6)], 0.2),
    ('Bohemian rim', [(12.2, 50.4), (13.6, 50.5)], 0.18),
]
# перевалы: клетки рядом с ними не становятся горами
PASSES = [
    (7.1, 45.7),   # Большой Сен-Бернар / Монсени
    (11.5, 47.0),  # Бреннер
    (14.0, 46.5),  # путь в Словению
    (-1.6, 43.2),  # Ронсесвальес (запад Пиренеев)
    (2.7, 42.4),   # Пертюс (восток Пиренеев)
    (11.2, 44.1),  # Порретта (Апеннины)
    (14.2, 41.6),  # Апеннины на юге
    (21.6, 49.4),  # Дукля (Карпаты)
    (25.5, 45.4),  # Брашов
    (18.5, 43.5),  # Неретва
    (-4.2, 40.9),  # Гвадаррама
]

# исторические горнорудные районы
DEPOSITS = [
    (7.2, 51.5), (7.0, 49.3), (18.8, 50.3), (10.6, 51.8), (13.0, 50.6), (6.0, 49.2), (2.8, 50.4),
    (-5.8, 43.3), (-6.6, 37.7), (-4.8, 38.8), (-3.0, 43.2), (10.4, 42.8), (8.6, 39.5), (14.0, 37.4),
    (-3.5, 51.7), (-5.0, 50.3), (-1.6, 54.9), (15.3, 49.9), (18.9, 48.4), (23.0, 46.2), (22.1, 44.1),
    (24.0, 37.7), (14.9, 47.6), (5.6, 50.6), (9.2, 45.6), (11.2, 43.2), (3.4, 44.3), (1.4, 47.3),
    (-0.9, 41.6), (12.6, 41.2), (16.4, 48.7), (19.5, 51.8), (27.0, 38.4), (26.0, 44.4), (-8.0, 40.0),
]

# лесистость регионов: (долгота, широта, радиус, доля леса)
FOREST_ZONES = [
    (10.0, 50.5, 4.0, 0.5),  # Германия
    (8.0, 48.0, 1.5, 0.75),   # Шварцвальд
    (13.5, 49.0, 1.6, 0.75),  # Богемский лес
    (19.0, 52.5, 4.5, 0.42),  # Польша
    (26.0, 54.0, 5.0, 0.5),   # Прибалтика, Беларусь
    (15.0, 57.5, 4.0, 0.62),  # Швеция
    (2.5, 47.5, 4.0, 0.35),   # Франция
    (6.0, 48.4, 1.3, 0.7),    # Вогезы
    (5.6, 49.9, 1.0, 0.7),    # Арденны
    (-0.8, 44.3, 1.4, 0.7),   # Ланды
    (-7.5, 42.5, 2.0, 0.55),  # Галисия
    (-4.0, 39.5, 4.0, 0.18),  # Испания
    (12.5, 42.5, 3.0, 0.3),   # Италия
    (20.0, 44.5, 4.0, 0.5),   # Балканы
    (24.5, 46.5, 2.5, 0.6),   # Трансильвания
    (-2.5, 53.0, 3.0, 0.3),   # Британия
    (30.0, 40.5, 3.0, 0.35),  # Анатолия
]


def forest_share(lon, lat):
    w_sum, v_sum = 0.0, 0.0
    for x, y, rad, v in FOREST_ZONES:
        d = math.hypot((lon - x) * K, lat - y)
        w = math.exp(-(d / rad) ** 2)
        w_sum += w
        v_sum += w * v
    base = 0.3
    return (v_sum + base * 0.15) / (w_sum + 0.15)


def noise(q, r, salt=0):
    h = (q * 374761393 + r * 668265263 + salt * 2147483647) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return (h ^ (h >> 16)) / 0xFFFFFFFF


def smooth_noise(q, r, salt):
    """Сглаженный шум: среднее по клетке и соседям — леса растут массивами, а не в шахматку."""
    nb = [(0, 0), (1, 0), (-1, 0), (0, 1), (0, -1), (1, -1), (-1, 1)]
    return sum(noise(q + a, r + b, salt) for a, b in nb) / len(nb)


# ---------- сетка ----------

cells = {}
R_MAX = int((LAT_MAX - LAT_MIN) / (1.5 * S))
WIDTH = (LON_MAX - LON_MIN) * K
for r in range(R_MAX + 1):
    q0 = math.ceil(-r / 2)
    q1 = math.floor(WIDTH / (math.sqrt(3) * S) - r / 2)
    for q in range(q0, q1 + 1):
        cells[(q, r)] = None

print('cells', len(cells))
for (q, r) in cells:
    cells[(q, r)] = 'land' if land_share(q, r) >= 0.43 else 'water'

# переправы через узкие проливы: (долгота, широта) точки, которые делаем сушей
CROSSINGS = [
    [(1.6, 51.0)],                 # Ла-Манш (Дувр — Кале)
    [(15.6, 38.25)],               # Мессинский пролив
    [(29.0, 41.1)],                # Босфор
    [(26.4, 40.2)],                # Дарданеллы
    [(12.7, 55.9)],                # Эресунн
    [(-5.6, 36.0)],                # Гибралтар
    [(10.9, 55.4), (10.0, 55.5)],  # Большой и Малый Бельт (Дания)
]
bridges = set()
for pts in CROSSINGS:
    for lon, lat in pts:
        h = to_hex(lon, lat)
        if h in cells and cells[h] == 'water':
            cells[h] = 'land'
            bridges.add(h)

NB = [(1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)]


def hdist(a, b):
    return (abs(a[0] - b[0]) + abs(a[0] + a[1] - b[0] - b[1]) + abs(a[1] - b[1])) // 2


terrain = {}
for (q, r), kind in cells.items():
    if kind == 'water':
        terrain[(q, r)] = 'water'
        continue
    lon, lat = center(q, r)
    t = None
    for _, pts, w in RANGES:
        if line_dist(lon, lat, pts) <= w:
            t = 'mountain'
            break
    if t == 'mountain' and any(math.hypot((lon - x) * K, lat - y) < 0.55 for x, y in PASSES):
        t = None
    if t is None:
        if lat >= 57.8:
            t = 'tundra' if smooth_noise(q, r, 5) > 0.55 else 'forest'
        elif lat < 34.6 and lon > -1:
            t = 'desert'
        else:
            t = 'forest' if 0.45 * noise(q, r, 1) + 0.55 * smooth_noise(q, r, 2) < forest_share(lon, lat) else 'field'
    terrain[(q, r)] = t
for h in bridges:
    terrain[h] = 'field'

for lon, lat in DEPOSITS:
    h = to_hex(lon, lat)
    best = None
    for dq in range(-2, 3):
        for dr in range(-2, 3):
            c = (h[0] + dq, h[1] + dr)
            if terrain.get(c) in ('field', 'forest') and c not in bridges:
                d = hdist(c, h)
                if best is None or d < best[0]:
                    best = (d, c)
    if best:
        terrain[best[1]] = 'deposit'

# ---------- столицы и нейтралы ----------

SPAWNS = [  # нация, город, долгота, широта
    ('italy', 'Rome', 12.5, 41.9),
    ('germany', 'Berlin', 13.4, 52.5),
    ('france', 'Paris', 2.35, 48.85),
    ('spain', 'Madrid', -3.7, 40.4),
]
# выравнивание стартов по замерам темпа: у Мадрида меньше всего леса рядом
HOME_EXTRA = {'spain': {'forest': 4}}
NEUTRALS = [
    ('Lisbon', -9.1, 38.7), ('London', -0.1, 51.5), ('Amsterdam', 4.9, 52.4), ('Copenhagen', 12.4, 55.7),
    ('Prague', 14.4, 50.1), ('Vienna', 16.4, 48.2), ('Warsaw', 21.0, 52.2), ('Budapest', 19.0, 47.5),
    ('Venice', 12.3, 45.4), ('Naples', 14.3, 40.85), ('Belgrade', 20.5, 44.8), ('Athens', 23.7, 38.0),
    ('Constantinople', 28.95, 41.0), ('Tunis', 10.2, 36.8), ('Algiers', 3.05, 36.75), ('Bern', 7.45, 46.95),
    ('Marseille', 5.4, 43.3), ('Barcelona', 2.15, 41.4), ('Hamburg', 10.0, 53.55), ('Edinburgh', -3.2, 55.95),
    ('Stockholm', 18.05, 59.0 - 0.6), ('Bucharest', 26.1, 44.4), ('Sofia', 23.3, 42.7), ('Kraków', 19.9, 50.05),
]


def nearest_land(lon, lat, taken):
    h = to_hex(lon, lat)
    best = None
    for c, t in terrain.items():
        if t in ('water', 'mountain') or c in bridges:
            continue
        if any(hdist(c, x) < 3 for x in taken):
            continue
        d = hdist(c, h)
        if best is None or d < best[0]:
            best = (d, c)
    return best[1]


taken = []
spawns = []
def best_home(lon, lat):
    """Столица — суша в пределах 2 клеток от исторического города, где в радиусе 2 больше всего пригодной земли."""
    h0 = to_hex(lon, lat)
    best = None
    for c, t in terrain.items():
        if t in ('water', 'mountain') or c in bridges or hdist(c, h0) > 2:
            continue
        around = [x for x in terrain if 1 <= hdist(x, c) <= 2]
        score = sum(1 for x in around if terrain[x] not in ('water', 'mountain')) - 0.3 * hdist(c, h0)
        if best is None or score > best[0]:
            best = (score, c)
    return best[1]


for nation, name, lon, lat in SPAWNS:
    h = best_home(lon, lat)
    taken.append(h)
    spawns.append((nation, name, h))
neutrals = []
for name, lon, lat in NEUTRALS:
    if not (LON_MIN + 0.3 < lon < LON_MAX - 0.3 and LAT_MIN + 0.3 < lat < LAT_MAX - 0.3):
        continue  # за краем карты
    h = nearest_land(lon, lat, [s[2] for s in spawns] + [n[1] for n in neutrals])
    if any(hdist(h, s[2]) < 5 for s in spawns):
        continue  # слишком близко к столице игрока
    neutrals.append((name, h))

# дом нации: в радиусе 2 не меньше 3 полей, 3 лесов и 2 месторождений (как в дизайне)
for nation, name, c in spawns:
    terrain[c] = 'field'
    ring = [x for x in terrain if 1 <= hdist(x, c) <= 2 and terrain[x] not in ('water',) and x not in bridges]
    ring.sort(key=lambda x: (-hdist(x, c), x))  # недостающее добираем сначала во втором кольце
    # первое кольцо (территория города 1-го уровня) обязано дать все три ресурса, иначе старт тупиковый:
    # без леса нет дерева на стройку, без месторождения — золота на армию
    ring1 = [x for x in terrain if hdist(x, c) == 1 and terrain[x] != 'water' and x not in bridges]
    ring1.sort(key=lambda x: (terrain[x] != 'mountain', x))  # сначала превращаем горы
    for kind in ('deposit', 'forest', 'field'):
        if any(terrain[x] == kind for x in ring1):
            continue
        counts1 = {k: sum(1 for x in ring1 if terrain[x] == k) for k in ('deposit', 'forest', 'field')}
        for x in ring1:
            cur = terrain[x]
            if cur not in counts1 or counts1[cur] > 1:
                terrain[x] = kind
                break
    need = {'field': 3, 'forest': 3, 'deposit': 2, **HOME_EXTRA.get(nation, {})}
    have = {k: sum(1 for x in ring if terrain[x] == k) for k in need}
    for kind in ('deposit', 'forest', 'field'):
        for allow_edge_mountains in (False, True):
            for x in ring:
                if have[kind] >= need[kind]:
                    break
                cur = terrain[x]
                if cur == kind:
                    continue
                # меняем только то, чего в избытке; горы на краю дома трогаем лишь в крайнем случае
                if cur == 'mountain' and hdist(x, c) == 2 and not allow_edge_mountains:
                    continue
                if cur in need and have[cur] <= need[cur]:
                    continue
                if hdist(x, c) == 1 and sum(1 for y in ring1 if terrain[y] == cur) <= 1:
                    continue  # единственный такой ресурс в первом кольце не трогаем
                if cur in need:
                    have[cur] -= 1
                terrain[x] = kind
                have[kind] += 1
for name, h in neutrals:
    terrain[h] = 'field'

# ---------- проверка связности ----------

passable = {c for c, t in terrain.items() if t not in ('water', 'mountain')}
start = spawns[0][2]
seen = {start}
stack = [start]
while stack:
    c = stack.pop()
    for dq, dr in NB:
        n = (c[0] + dq, c[1] + dr)
        if n in passable and n not in seen:
            seen.add(n)
            stack.append(n)
for nation, name, c in spawns:
    assert c in seen, f'{nation} отрезана'
unreached = [n for n, h in neutrals if h not in seen]
neutrals = [(n, h) for n, h in neutrals if h in seen]
print('spawns', spawns)
print('neutrals', len(neutrals), 'unreachable dropped:', unreached)

# ---------- вывод ----------

CH = {'water': '~', 'field': '.', 'forest': 'T', 'mountain': '^', 'deposit': '$', 'tundra': '_', 'desert': ':'}
rows = []
for r in range(R_MAX + 1):
    q0 = math.ceil(-r / 2)
    q1 = math.floor(WIDTH / (math.sqrt(3) * S) - r / 2)
    rows.append((q0, ''.join(CH[terrain[(q, r)]] for q in range(q0, q1 + 1))))

counts = {}
for t in terrain.values():
    counts[t] = counts.get(t, 0) + 1
print('terrain', counts)

with open(OUT, 'w') as f:
    f.write('// Карта «Европа» на 4 игроков. Сгенерирована tools/europe_map.py из Natural Earth 1:50m — не править руками.\n')
    f.write('// Строки — ряды r сверху вниз; первый символ ряда — клетка q = q0.\n')
    f.write("// ~ вода · . поле · T лес · ^ горы · $ месторождение · _ тундра · : пустыня\n\n")
    f.write("import { type MapDef, type Terrain } from '../state.ts';\n\n")
    f.write('const ROWS: [number, string][] = [\n')
    for q0, s in rows:
        f.write(f"  [{q0}, '{s}'],\n")
    f.write('];\n\n')
    f.write("const T: Record<string, Terrain> = { '~': 'water', '.': 'field', T: 'forest', '^': 'mountain', $: 'deposit', _: 'tundra', ':': 'desert' };\n\n")
    f.write('export const europeMap = (): MapDef => ({\n')
    f.write("  name: 'Europe',\n")
    f.write('  cells: ROWS.flatMap(([q0, row], r) => [...row].map((ch, i) => ({ q: q0 + i, r, terrain: T[ch] }))),\n')
    f.write('  spawns: [' + ', '.join(f'{{ q: {h[0]}, r: {h[1]} }}' for _, _, h in spawns) + '],\n')
    f.write('  spawnNations: [' + ', '.join(f"'{n}'" for n, _, _ in spawns) + '],\n')
    f.write('  neutrals: [' + ', '.join(f'{{ q: {h[0]}, r: {h[1]} }}' for _, h in neutrals) + '],\n')
    f.write('  names: {\n')
    for n, nm, h in spawns:
        f.write(f"    '{h[0]},{h[1]}': '{nm}',\n")
    for nm, h in neutrals:
        f.write(f"    '{h[0]},{h[1]}': '{nm}',\n")
    f.write('  },\n')
    f.write('});\n')
print('written', OUT)
