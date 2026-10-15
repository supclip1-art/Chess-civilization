// Отрисовка шестиугольной карты на Canvas 2D: местность, территории с границами, ратуши, здания,
// генералы, туман войны, подсветка хода. Камера: перетаскивание и щипок для масштаба.

import { iconImage } from './icons.ts';
import { type GameState, type Hex, type Job, type Terrain, key, neighbors } from '../../../core/src/index.ts';

export const PLAYER_COLORS = ['#2f6fd6', '#d64a3c', '#e0a020', '#8a52d6', '#1f9e86', '#d65f9c', '#6b8f2a', '#c76a1f'];
export const NEUTRAL_COLOR = '#8c8a84';

const TERRAIN: Record<Terrain, string> = {
  field: '#cdd890', forest: '#6f9a5c', deposit: '#c7b27a', tundra: '#d5dcda', desert: '#e8d49e', mountain: '#8e877c', water: '#79a8cf',
};
const SQRT3 = Math.sqrt(3);

export type Highlight = { selected?: Hex; reach?: Set<string>; attack?: Set<string>; path?: Hex[] };

export const ownerColor = (s: GameState, owner?: string): string | null => {
  if (!owner) return null;
  const i = s.order.indexOf(owner);
  return i >= 0 ? PLAYER_COLORS[i % PLAYER_COLORS.length] : NEUTRAL_COLOR;
};

export class MapView {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  zoom = 1;
  ox = 0; // смещение камеры в CSS-пикселях
  oy = 0;
  private base = 26; // радиус клетки при zoom = 1

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  get size(): number { return this.base * this.zoom; }

  toPixel(h: Hex): { x: number; y: number } {
    return { x: this.ox + this.size * SQRT3 * (h.q + h.r / 2), y: this.oy + this.size * 1.5 * h.r };
  }

  toHex(px: number, py: number): Hex {
    const x = (px - this.ox) / this.size, y = (py - this.oy) / this.size;
    const q = (SQRT3 / 3) * x - y / 3, r = (2 / 3) * y;
    let rx = Math.round(q), rz = Math.round(r), ry = Math.round(-q - r);
    const dx = Math.abs(rx - q), dz = Math.abs(rz - r), dy = Math.abs(ry + q + r);
    if (dx > dy && dx > dz) rx = -ry - rz; else if (dz > dy) rz = -rx - ry;
    return { q: rx, r: rz };
  }

  centerOn(h: Hex): void {
    const w = this.canvas.clientWidth, hgt = this.canvas.clientHeight;
    this.ox = w / 2 - this.size * SQRT3 * (h.q + h.r / 2);
    this.oy = hgt / 2 - this.size * 1.5 * h.r;
  }

  zoomAt(factor: number, px: number, py: number): void {
    const z = Math.min(2.6, Math.max(0.25, this.zoom * factor));
    const k = z / this.zoom;
    this.ox = px - (px - this.ox) * k;
    this.oy = py - (py - this.oy) * k;
    this.zoom = z;
  }

  private corners(cx: number, cy: number, s: number): [number, number][] {
    const out: [number, number][] = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i - 30);
      out.push([cx + s * Math.cos(a), cy + s * Math.sin(a)]);
    }
    return out;
  }

  private hexPath(cx: number, cy: number, s: number): void {
    const c = this.ctx;
    c.beginPath();
    this.corners(cx, cy, s).forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
  }

  draw(s: GameState, viewer: string, seen: Set<string>, hl: Highlight): void {
    const c = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const S = this.size;
    const cells = Object.values(s.cells);
    const visible = (k: string) => seen.has(k);
    // что игрок знает о клетке: открытые — как есть, под туманом — как запомнил (s.memory), остальное — пусто
    const mem = s.memory?.[viewer] ?? {};
    const hallAt = new Map(Object.values(s.halls).map((hl) => [key(hl.hex), hl]));
    type Known = { owner?: string; building?: { kind: 'farm' | 'sawmill' | 'mine' | 'fishery'; level: number }; reserved?: boolean;
      hall?: { name: string; owner: string; level: number; siege?: boolean } };
    const known = new Map<string, Known>();
    for (const cell of cells) {
      const k = key(cell.hex);
      if (visible(k)) {
        const hall = hallAt.get(k);
        known.set(k, { owner: cell.owner, building: cell.building, reserved: cell.reserved,
          hall: hall && { name: hall.name, owner: hall.owner, level: hall.level, siege: !!hall.siege } });
      } else if (mem[k]) known.set(k, mem[k]);
    }

    // стройки игрока: клетка → в очереди ли (казарма и таверна — в столице)
    const clocks = new Map<string, boolean>();
    const me = s.players[viewer];
    if (me) {
      const capital = Object.values(s.halls).filter((h) => h.owner === viewer).sort((a, b) => a.order - b.order)[0];
      const at = (j: Job): string | null => j.kind === 'resource' || j.kind === 'found' ? key(j.hex)
        : s.halls[j.hallId] ? key(s.halls[j.hallId].hex) : capital ? key(capital.hex) : null;
      for (const q of me.queue ?? []) { const k = at(q.job); if (k) clocks.set(k, true); }
      for (const j of me.jobs) { const k = at(j); if (k) clocks.set(k, false); }
    }

    // 1. местность и территория
    for (const cell of cells) {
      const { x, y } = this.toPixel(cell.hex);
      if (x < -S * 2 || y < -S * 2 || x > w + S * 2 || y > h + S * 2) continue;
      this.hexPath(x, y, S + 0.5);
      c.fillStyle = TERRAIN[cell.terrain];
      c.fill();
      this.terrainMark(cell.terrain, x, y, S);
      const k = key(cell.hex);
      const col = ownerColor(s, known.get(k)?.owner);
      if (col) { this.hexPath(x, y, S); c.fillStyle = col + '38'; c.fill(); }
      c.strokeStyle = 'rgba(0,0,0,0.08)';
      c.lineWidth = 1;
      this.hexPath(x, y, S);
      c.stroke();
    }
    // 2. границы территорий
    for (const cell of cells) {
      const owner = known.get(key(cell.hex))?.owner;
      if (!owner) continue;
      const { x, y } = this.toPixel(cell.hex);
      const corners = this.corners(x, y, S - 1.2);
      // соседи в порядке рёбер для pointy-top: E, SE, SW, W, NW, NE
      const order = [{ q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 }, { q: -1, r: 0 }, { q: 0, r: -1 }, { q: 1, r: -1 }];
      c.strokeStyle = ownerColor(s, owner)!;
      c.lineWidth = Math.max(2, 3 * this.zoom);
      c.lineCap = 'round';
      order.forEach((d, i) => {
        if (known.get(key({ q: cell.hex.q + d.q, r: cell.hex.r + d.r }))?.owner === owner) return;
        const [ax, ay] = corners[i], [bx, by] = corners[(i + 1) % 6];
        c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
      });
    }
    // 3. здания и ратуши
    for (const cell of cells) {
      const v = known.get(key(cell.hex));
      if (!v) continue;
      const { x, y } = this.toPixel(cell.hex);
      if (v.building) this.building(x, y, S, v.building.kind, v.building.level);
      else if (v.reserved && !clocks.has(key(cell.hex))) this.clock(x, y, S * 0.36, false);
      if (v.hall) this.hall(x, y, S, ownerColor(s, v.hall.owner)!, v.hall.level, !!v.hall.siege);
    }
    // часы над стройками игрока: идёт стройка (белые) или ждёт в очереди (серые)
    for (const [k, queued] of clocks) {
      const cell = s.cells[k]; if (!cell) continue;
      const { x, y } = this.toPixel(cell.hex);
      const v = known.get(k);
      if (v?.building || v?.hall) this.clock(x - S * 0.5, y - S * 0.42, Math.max(6, S * 0.25), queued);
      else this.clock(x, y, S * 0.36, queued);
    }
    // 4. генералы
    const byCell = new Map<string, typeof s.generals[string][]>();
    for (const g of Object.values(s.generals)) {
      const k = key(g.hex);
      if (!visible(k)) continue;
      byCell.set(k, [...(byCell.get(k) ?? []), g]);
    }
    const hallCells = new Set(Object.values(s.halls).map((h) => key(h.hex)));
    for (const [k, gens] of byCell) {
      const onHall = hallCells.has(k);
      gens.forEach((g, i) => {
        const { x, y } = this.toPixel(g.hex);
        const pieces = g.army.p + g.army.n + g.army.b + g.army.r + g.army.q;
        // на клетке ратуши генерал стоит сбоку и меньше, чтобы ратушу было видно
        const gx = onHall ? x + S * 0.42 + i * S * 0.3 : x + i * S * 0.42;
        const gy = onHall ? y - S * 0.42 : y - S * 0.12; // на клетке города — справа сверху, снизу подпись
        const ready = g.owner === viewer && !g.attacked && g.moveLeft > 0;
        if (g.settler) this.settler(onHall ? x - S * 0.42 : gx, gy, onHall ? S * 0.78 : S, ownerColor(s, g.owner)!, ready); // на городе — слева сверху
        else this.general(gx, gy, onHall ? S * 0.78 : S, ownerColor(s, g.owner)!, pieces, ready);
      });
    }
    // 5. подсветка хода
    // путь похода — пунктир от генерала к цели
    if (hl.path && hl.path.length > 1) {
      c.save();
      c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = Math.max(2, S * 0.12); c.setLineDash([S * 0.25, S * 0.2]); c.lineCap = 'round';
      c.beginPath();
      hl.path.forEach((h, i) => { const p = this.toPixel(h); if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); });
      c.stroke();
      const end = this.toPixel(hl.path[hl.path.length - 1]);
      c.setLineDash([]); c.fillStyle = '#ffffff'; c.beginPath(); c.arc(end.x, end.y, S * 0.16, 0, Math.PI * 2); c.fill();
      c.restore();
    }
    for (const k of hl.reach ?? []) {
      const cell = s.cells[k]; if (!cell) continue;
      const { x, y } = this.toPixel(cell.hex);
      this.hexPath(x, y, S * 0.9); c.fillStyle = 'rgba(255,255,255,0.42)'; c.fill();
    }
    for (const k of hl.attack ?? []) {
      const cell = s.cells[k]; if (!cell) continue;
      const { x, y } = this.toPixel(cell.hex);
      this.hexPath(x, y, S * 0.86); c.strokeStyle = '#d63a2a'; c.lineWidth = 3; c.stroke();
    }
    if (hl.selected) {
      const { x, y } = this.toPixel(hl.selected);
      this.hexPath(x, y, S * 0.94); c.strokeStyle = '#ffffff'; c.lineWidth = 3; c.stroke();
      this.hexPath(x, y, S * 0.94); c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1; c.stroke();
    }
    // 6. туман войны поверх всего
    for (const cell of cells) {
      if (visible(key(cell.hex))) continue;
      const { x, y } = this.toPixel(cell.hex);
      this.hexPath(x, y, S + 0.6); c.fillStyle = 'rgba(28,30,34,0.62)'; c.fill();
    }
    // 7. названия городов, как в «Цивилизации»: плашка цвета владельца под городом
    if (S >= 12) {
      for (const cell of cells) {
        const hall = known.get(key(cell.hex))?.hall;
        if (!hall) continue;
        const { x, y } = this.toPixel(cell.hex);
        this.cityLabel(x, y + S * 0.8, S, hall.name ?? 'City', ownerColor(s, hall.owner)!);
      }
    }
  }

  private cityLabel(x: number, y: number, S: number, name: string, color: string): void {
    const c = this.ctx;
    c.save();
    c.font = `600 ${Math.max(10, Math.round(S * 0.36))}px system-ui, sans-serif`;
    const w = c.measureText(name).width + S * 0.4;
    const h = Math.max(13, S * 0.5);
    c.beginPath(); c.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
    c.fillStyle = color; c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1; c.stroke();
    c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(name, x, y + 0.5);
    c.restore();
  }

  private terrainMark(t: Terrain, x: number, y: number, S: number): void {
    const c = this.ctx;
    if (S < 14) return;
    c.save();
    if (t === 'forest') {
      c.fillStyle = 'rgba(30,70,30,0.45)';
      for (const [dx, dy] of [[-0.32, 0.18], [0.3, 0.22], [0, -0.28]]) {
        c.beginPath(); c.moveTo(x + dx * S, y + (dy - 0.22) * S); c.lineTo(x + (dx - 0.16) * S, y + (dy + 0.1) * S); c.lineTo(x + (dx + 0.16) * S, y + (dy + 0.1) * S); c.fill();
      }
    } else if (t === 'mountain') {
      c.fillStyle = 'rgba(60,55,50,0.55)';
      c.beginPath(); c.moveTo(x - 0.5 * S, y + 0.3 * S); c.lineTo(x - 0.1 * S, y - 0.4 * S); c.lineTo(x + 0.15 * S, y); c.lineTo(x + 0.3 * S, y - 0.2 * S); c.lineTo(x + 0.55 * S, y + 0.3 * S); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.7)';
      c.beginPath(); c.moveTo(x - 0.1 * S, y - 0.4 * S); c.lineTo(x - 0.22 * S, y - 0.18 * S); c.lineTo(x + 0.02 * S, y - 0.18 * S); c.fill();
    } else if (t === 'deposit') {
      c.fillStyle = '#d9a520';
      for (const [dx, dy] of [[-0.22, 0.12], [0.18, 0.2], [0, -0.18]]) { c.beginPath(); c.arc(x + dx * S, y + dy * S, 0.1 * S, 0, Math.PI * 2); c.fill(); }
    } else if (t === 'water') {
      c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 1.5;
      for (const dy of [-0.15, 0.2]) { c.beginPath(); c.moveTo(x - 0.35 * S, y + dy * S); c.quadraticCurveTo(x - 0.1 * S, y + (dy - 0.12) * S, x + 0.1 * S, y + dy * S); c.quadraticCurveTo(x + 0.25 * S, y + (dy + 0.12) * S, x + 0.4 * S, y + dy * S); c.stroke(); }
    } else if (t === 'field') {
      c.strokeStyle = 'rgba(120,130,50,0.35)'; c.lineWidth = 1.2;
      for (const dx of [-0.25, 0, 0.25]) { c.beginPath(); c.moveTo(x + dx * S, y - 0.3 * S); c.lineTo(x + dx * S, y + 0.3 * S); c.stroke(); }
    }
    c.restore();
  }

  /** Ресурсное здание: значок (колос, пила, кирка) на светлой плашке и уровень в кружке. */
  private building(x: number, y: number, S: number, kind: 'farm' | 'sawmill' | 'mine' | 'fishery', level: number): void {
    const img = iconImage(kind);
    if (!img) { this.badge(x, y, S, kind === 'farm' ? 'F' : kind === 'sawmill' ? 'S' : kind === 'fishery' ? 'B' : 'M', level); return; }
    const c = this.ctx;
    const w = S * 0.86, top = y - S * 0.3;
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 1;
    c.beginPath(); c.roundRect(x - w / 2, top, w, w, S * 0.2); c.fill(); c.stroke();
    const pad = w * 0.1;
    c.drawImage(img, x - w / 2 + pad, top + pad, w - 2 * pad, w - 2 * pad);
    // уровень
    const rr = Math.max(6, S * 0.22), bx = x + w / 2 - rr * 0.35, by = top + w - rr * 0.35;
    c.beginPath(); c.arc(bx, by, rr, 0, Math.PI * 2);
    c.fillStyle = '#2a2a26'; c.fill();
    c.strokeStyle = '#ffffff'; c.lineWidth = 1.2; c.stroke();
    c.fillStyle = '#ffffff'; c.font = `700 ${Math.round(rr * 1.25)}px system-ui, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(String(level), bx, by + 0.5);
  }

  /** Часы: стройка идёт; queued — серые, стройка ждёт свободного строителя. */
  private clock(x: number, y: number, r: number, queued: boolean): void {
    const c = this.ctx;
    c.save();
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
    c.fillStyle = queued ? '#d9d6cc' : '#ffffff'; c.fill();
    c.lineWidth = Math.max(1.2, r * 0.18); c.strokeStyle = '#2a2a26'; c.stroke();
    c.beginPath(); c.moveTo(x, y - r * 0.6); c.lineTo(x, y); c.lineTo(x + r * 0.42, y + r * 0.26);
    c.lineWidth = Math.max(1.2, r * 0.2); c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke();
    c.restore();
  }

  private badge(x: number, y: number, S: number, letter: string, level: number): void {
    const c = this.ctx;
    const w = S * 0.86, h = S * 0.62;
    c.fillStyle = 'rgba(255,255,255,0.92)';
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1;
    c.beginPath(); c.roundRect(x - w / 2, y + S * 0.08, w, h, 5); c.fill(); c.stroke();
    c.fillStyle = '#2a2a26';
    c.font = `600 ${Math.round(S * 0.42)}px system-ui, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(level ? `${letter}${level}` : letter, x, y + S * 0.08 + h / 2 + 1);
  }

  private hall(x: number, y: number, S: number, color: string, level: number, siege: boolean): void {
    const c = this.ctx;
    const w = S * 0.9, h = S * 0.78, top = y - h * 0.62;
    c.fillStyle = color; c.strokeStyle = '#ffffff'; c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(x - w / 2, y + h * 0.38); c.lineTo(x - w / 2, top + h * 0.22);
    for (let i = 0; i < 3; i++) { const bx = x - w / 2 + (i * w) / 2.5; c.lineTo(bx, top); c.lineTo(bx + w / 5, top); c.lineTo(bx + w / 5, top + h * 0.22); }
    c.lineTo(x + w / 2, top + h * 0.22); c.lineTo(x + w / 2, y + h * 0.38); c.closePath();
    c.fill(); c.stroke();
    c.fillStyle = '#ffffff';
    for (let i = 0; i < level; i++) { c.beginPath(); c.arc(x - (level - 1) * S * 0.12 + i * S * 0.24, y + h * 0.1, S * 0.07, 0, Math.PI * 2); c.fill(); }
    if (siege) { c.strokeStyle = '#d63a2a'; c.lineWidth = 3; c.beginPath(); c.arc(x, y, S * 0.78, 0, Math.PI * 2); c.stroke(); }
  }

  /** Поселенец: светлый кружок с флажком цвета владельца. */
  private settler(x: number, y: number, S: number, color: string, ready: boolean): void {
    const c = this.ctx;
    const r = S * 0.36;
    c.fillStyle = '#f7f3e8'; c.strokeStyle = ready ? color : 'rgba(0,0,0,0.35)'; c.lineWidth = ready ? 2.5 : 1.5;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.stroke();
    c.strokeStyle = '#4a3424'; c.lineWidth = Math.max(1.2, S * 0.05); c.lineCap = 'round';
    c.beginPath(); c.moveTo(x - r * 0.35, y + r * 0.6); c.lineTo(x - r * 0.35, y - r * 0.62); c.stroke();
    c.fillStyle = color;
    c.beginPath(); c.moveTo(x - r * 0.3, y - r * 0.62); c.lineTo(x + r * 0.55, y - r * 0.35); c.lineTo(x - r * 0.3, y - r * 0.05); c.closePath(); c.fill();
  }

  private general(x: number, y: number, S: number, color: string, pieces: number, ready: boolean): void {
    const c = this.ctx;
    const r = S * 0.42;
    c.fillStyle = color; c.strokeStyle = ready ? '#ffffff' : 'rgba(255,255,255,0.6)'; c.lineWidth = ready ? 2.5 : 1.5;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#ffffff';
    c.font = `${Math.round(S * 0.52)}px "Segoe UI Symbol", "Noto Sans Symbols 2", system-ui, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('♚', x, y + 1);
    if (pieces > 0) {
      const bx = x + r * 0.85, by = y - r * 0.85, br = S * 0.22;
      c.fillStyle = '#1d1d1b'; c.beginPath(); c.arc(bx, by, br, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffffff'; c.font = `700 ${Math.round(S * 0.28)}px system-ui, sans-serif`;
      c.fillText(String(pieces), bx, by + 0.5);
    }
  }
}

/** Соседи клетки, на которые генерал может напасть (чужая армия или чужая ратуша). */
export const attackTargets = (s: GameState, gid: string): Set<string> => {
  const g = s.generals[gid];
  const out = new Set<string>();
  if (!g || g.attacked) return out;
  if (g.army.p + g.army.n + g.army.b + g.army.r + g.army.q === 0) return out;
  for (const n of neighbors(g.hex)) {
    const k = key(n);
    const enemyArmy = Object.values(s.generals).some((x) => key(x.hex) === k && x.owner !== g.owner &&
      (x.settler || x.army.p + x.army.n + x.army.b + x.army.r + x.army.q > 0));
    const enemyHall = Object.values(s.halls).some((h) => key(h.hex) === k && h.owner !== g.owner);
    if (enemyArmy || enemyHall) out.add(k);
  }
  return out;
};
