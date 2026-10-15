#!/usr/bin/env python3
"""Генератор шестиугольных карт по реальной географии. Настройки карты — в tools/maps/<имя>.py
(границы, размер клетки, хребты, перевалы, месторождения, леса, климат, проливы, столицы, нейтралы).

Источник береговой линии и озёр — Natural Earth 1:50m (общественное достояние):
  git clone --depth 1 --filter=blob:none --sparse https://github.com/nvkelso/natural-earth-vector.git ne
  cd ne && git sparse-checkout set --no-cone /geojson/ne_50m_land.geojson /geojson/ne_50m_lakes.geojson
Запуск: python3 tools/mapgen.py tools/maps/<карта>.py <папка ne/geojson>

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

import runpy

CFG = runpy.run_path(sys.argv[1])  # tools/maps/<карта>.py
NE = sys.argv[2] if len(sys.argv) > 2 else 'ne/geojson'
OUT = CFG['OUT']

LON_MIN, LON_MAX = CFG['LON_MIN'], CFG['LON_MAX']
LAT_MIN, LAT_MAX = CFG['LAT_MIN'], CFG['LAT_MAX']
K = math.cos(math.radians((LAT_MIN + LAT_MAX) / 2 if 'K_LAT' not in CFG else CFG['K_LAT']))  # сжатие долготы на средней широте
HEX_W = CFG['HEX_W']              # ширина шестиугольника в градусах широты
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


RANGES, PASSES, DEPOSITS, FOREST_ZONES = CFG['RANGES'], CFG['PASSES'], CFG['DEPOSITS'], CFG['FOREST_ZONES']


def forest_share(lon, lat):
    w_sum, v_sum = 0.0, 0.0
    for x, y, rad, v in FOREST_ZONES:
        d = math.hypot((lon - x) * K, lat - y)
        w = math.exp(-(d / rad) ** 2)
        w_sum += w
        v_sum += w * v
    base = CFG.get('FOREST_BASE', 0.3)
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
    thr = 0.43
    for x, y, rad, v in CFG.get('LAND_ZONES', ()):  # узкие острова (Япония) — суша и при меньшей доле
        lon, lat = center(q, r)
        if math.hypot((lon - x) * K, lat - y) < rad:
            thr = min(thr, v)
    cells[(q, r)] = 'land' if land_share(q, r) >= thr else 'water'
    if cells[(q, r)] == 'land' and 'MASK' in CFG and not CFG['MASK'](*center(q, r)):
        cells[(q, r)] = 'water'  # суша за пределами задуманной карты (например, Африка на карте Азии)

CROSSINGS = CFG['CROSSINGS']
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
        t = CFG['climate'](lon, lat, q, r, noise, smooth_noise)  # тундра, пустыня — по климату карты
        if t is None:
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

SPAWNS, HOME_EXTRA, NEUTRALS, NEUTRAL_COUNT = CFG['SPAWNS'], CFG['HOME_EXTRA'], CFG['NEUTRALS'], CFG['NEUTRAL_COUNT']


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
    # пустыня и тундра у столицы — мёртвая земля: в первом кольце её нет вовсе, во втором — не больше трети
    for x in [x for x in terrain if hdist(x, c) == 1]:
        if terrain[x] in ('desert', 'tundra'):
            terrain[x] = 'field'
    ring2 = sorted([x for x in terrain if hdist(x, c) == 2], key=lambda x: noise(x[0], x[1], 9))
    dead = [x for x in ring2 if terrain[x] in ('desert', 'tundra')]
    for x in dead[:max(0, len(dead) - 4)]:
        terrain[x] = 'field'
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
    # выравнивание: HOME_EXTRA вида {'forest1': 2} — столько лесов уже в первом кольце (за счёт лишних полей)
    for kind in ('deposit', 'forest', 'field'):
        want = HOME_EXTRA.get(name, {}).get(kind + '1', 0)
        for x in ring1:
            if sum(1 for y in ring1 if terrain[y] == kind) >= want:
                break
            cur = terrain[x]
            if cur != kind and cur in ('field', 'forest') and sum(1 for y in ring1 if terrain[y] == cur) > 1:
                terrain[x] = kind
    need = {'field': 3, 'forest': 3, 'deposit': 2, **{k: v for k, v in HOME_EXTRA.get(name, {}).items() if not k.endswith('1')}}
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

if 'MAPDUMP' in __import__('os').environ:  # отладка: карта символами, S — столицы, N — нейтралы
    CH0 = {'water': '~', 'field': '.', 'forest': 'T', 'mountain': '^', 'deposit': '$', 'tundra': '_', 'desert': ':'}
    sp = {c for _, _, c in spawns}
    ne = {h for _, h in neutrals}
    with open(__import__('os').environ['MAPDUMP'], 'w') as f:
        for r in range(R_MAX + 1):
            q0 = math.ceil(-r / 2)
            q1 = math.floor(WIDTH / (math.sqrt(3) * S) - r / 2)
            f.write(('' if r % 2 == 0 else ' ') + ' '.join('S' if (q, r) in sp else 'N' if (q, r) in ne else CH0[terrain[(q, r)]] for q in range(q0, q1 + 1)) + '\n')

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
    if c not in seen:
        print(f'!!! {nation} {name} {c} отрезана')
        assert 'MAPDUMP' in __import__('os').environ
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
    f.write(f"// Карта «{CFG['TITLE']}» на {len(spawns)} игроков. Сгенерирована tools/mapgen.py tools/maps/{CFG['ID']}.py из Natural Earth 1:50m — не править руками.\n")
    f.write('// Строки — ряды r сверху вниз; первый символ ряда — клетка q = q0.\n')
    f.write("// ~ вода · . поле · T лес · ^ горы · $ месторождение · _ тундра · : пустыня\n\n")
    f.write("import { type MapDef, type Terrain } from '../state.ts';\n\n")
    f.write('const ROWS: [number, string][] = [\n')
    for q0, s in rows:
        f.write(f"  [{q0}, '{s}'],\n")
    f.write('];\n\n')
    f.write("const T: Record<string, Terrain> = { '~': 'water', '.': 'field', T: 'forest', '^': 'mountain', $: 'deposit', _: 'tundra', ':': 'desert' };\n\n")
    f.write(f"export const {CFG['FN']} = (): MapDef => ({{\n")
    f.write(f"  name: '{CFG['NAME']}',\n")
    f.write('  cells: ROWS.flatMap(([q0, row], r) => [...row].map((ch, i) => ({ q: q0 + i, r, terrain: T[ch] }))),\n')
    f.write('  spawns: [' + ', '.join(f'{{ q: {h[0]}, r: {h[1]} }}' for _, _, h in spawns) + '],\n')
    f.write('  // столицы: ' + ', '.join(nm for _, nm, _ in spawns) + ' — нации расставляются по ним случайно\n')
    f.write('  randomSpawns: true,\n')
    f.write(f'  neutralCount: {NEUTRAL_COUNT},\n')
    f.write('  neutrals: [' + ', '.join(f'{{ q: {h[0]}, r: {h[1]} }}' for _, h in neutrals) + '],\n')
    f.write('  names: {\n')
    for n, nm, h in spawns:
        f.write(f"    '{h[0]},{h[1]}': {json.dumps(nm, ensure_ascii=False)},\n")
    for nm, h in neutrals:
        f.write(f"    '{h[0]},{h[1]}': {json.dumps(nm, ensure_ascii=False)},\n")
    f.write('  },\n')
    f.write('});\n')
print('written', OUT)
