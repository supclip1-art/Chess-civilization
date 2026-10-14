// Отрисовка шестиугольной карты на Canvas 2D: местность, территории с границами, ратуши, здания,
// генералы, туман войны, подсветка хода. Камера: перетаскивание и щипок для масштаба.

import { type GameState, type Hex, type Terrain, key, neighbors } from '../../../core/src/index.ts';

export const PLAYER_COLORS = ['#2f6fd6', '#d64a3c', '#e0a020', '#8a52d6', '#1f9e86', '#d65f9c', '#6b8f2a', '#c76a1f'];
export const NEUTRAL_COLOR = '#8c8a84';

const TERRAIN: Record<Terrain, string> = {
  field: '#cdd890', forest: '#6f9a5c', deposit: '#c7b27a', tundra: '#d5dcda', desert: '#e8d49e', mountain: '#8e877c', water: '#79a8cf',
};
const SQRT3 = Math.sqrt(3);

export type Highlight = { selected?: Hex; reach?: Set<string>; attack?: Set<string> };

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
    const z = Math.min(2.6, Math.max(0.45, this.zoom * factor));
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

    // 1. местность и территория
    for (const cell of cells) {
      const { x, y } = this.toPixel(cell.hex);
      if (x < -S * 2 || y < -S * 2 || x > w + S * 2 || y > h + S * 2) continue;
      this.hexPath(x, y, S + 0.5);
      c.fillStyle = TERRAIN[cell.terrain];
      c.fill();
      this.terrainMark(cell.terrain, x, y, S);
      const k = key(cell.hex);
      const col = visible(k) ? ownerColor(s, cell.owner) : null;
      if (col) { this.hexPath(x, y, S); c.fillStyle = col + '38'; c.fill(); }
      c.strokeStyle = 'rgba(0,0,0,0.08)';
      c.lineWidth = 1;
      this.hexPath(x, y, S);
      c.stroke();
    }
    // 2. границы территорий
    for (const cell of cells) {
      if (!cell.owner || !visible(key(cell.hex))) continue;
      const { x, y } = this.toPixel(cell.hex);
      const corners = this.corners(x, y, S - 1.2);
      // соседи в порядке рёбер для pointy-top: E, SE, SW, W, NW, NE
      const order = [{ q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 }, { q: -1, r: 0 }, { q: 0, r: -1 }, { q: 1, r: -1 }];
      c.strokeStyle = ownerColor(s, cell.owner)!;
      c.lineWidth = Math.max(2, 3 * this.zoom);
      c.lineCap = 'round';
      order.forEach((d, i) => {
        const n = s.cells[key({ q: cell.hex.q + d.q, r: cell.hex.r + d.r })];
        if (n && n.owner === cell.owner) return;
        const [ax, ay] = corners[i], [bx, by] = corners[(i + 1) % 6];
        c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
      });
    }
    // 3. здания и ратуши
    for (const cell of cells) {
      const k = key(cell.hex);
      if (!visible(k)) continue;
      const { x, y } = this.toPixel(cell.hex);
      if (cell.building) this.badge(x, y, S, cell.building.kind === 'farm' ? 'F' : cell.building.kind === 'sawmill' ? 'S' : 'M', cell.building.level);
      else if (cell.reserved) this.badge(x, y, S, '…', 0);
    }
    for (const hall of Object.values(s.halls)) {
      if (!visible(key(hall.hex))) continue;
      const { x, y } = this.toPixel(hall.hex);
      this.hall(x, y, S, ownerColor(s, hall.owner)!, hall.level, !!hall.siege);
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
        const gy = onHall ? y + S * 0.38 : y - S * 0.12;
        this.general(gx, gy, onHall ? S * 0.78 : S, ownerColor(s, g.owner)!, pieces, g.owner === viewer && !g.attacked && g.moveLeft > 0);
      });
    }
    // 5. подсветка хода
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
    // 7. названия городов, как в «Цивилизации»: плашка цвета владельца над городом
    if (S >= 12) {
      for (const hall of Object.values(s.halls)) {
        if (!visible(key(hall.hex))) continue;
        const { x, y } = this.toPixel(hall.hex);
        this.cityLabel(x, y - S * 0.86, S, hall.name ?? 'City', ownerColor(s, hall.owner)!);
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
      x.army.p + x.army.n + x.army.b + x.army.r + x.army.q > 0);
    const enemyHall = Object.values(s.halls).some((h) => key(h.hex) === k && h.owner !== g.owner);
    if (enemyArmy || enemyHall) out.add(k);
  }
  return out;
};
