// Отрисовка шестиугольной карты на Canvas 2D: местность, территории с границами, ратуши, здания,
// генералы, туман войны, подсветка хода. Камера: перетаскивание и щипок для масштаба.

import { VARIANTS, tileSprite } from './tiles.ts';
import { iconImage } from './icons.ts';
import { type GameState, type Hex, type Job, type WonderId, WONDERS, key, neighbors } from '../../../core/src/index.ts';

export const PLAYER_COLORS = ['#2f6fd6', '#d64a3c', '#e0a020', '#8a52d6', '#1f9e86', '#d65f9c', '#6b8f2a', '#c76a1f'];
export const NEUTRAL_COLOR = '#8c8a84';
export const BANDIT_COLOR = '#3b2f2c';
const SQRT3 = Math.sqrt(3);

export type Highlight = { selected?: Hex; unit?: string; reach?: Set<string>; attack?: Set<string>; path?: Hex[] };

export const ownerColor = (s: GameState, owner?: string): string | null => {
  if (!owner) return null;
  const i = s.order.indexOf(owner);
  if (owner === 'bandits') return BANDIT_COLOR;
  const lord = s.players[owner]?.overlord; // вассал — светлый оттенок цвета сюзерена
  if (lord && lord !== owner) { const c = ownerColor(s, lord); return c ? shade(c, 0.45) : NEUTRAL_COLOR; }
  return i >= 0 ? PLAYER_COLORS[i % PLAYER_COLORS.length] : NEUTRAL_COLOR;
};

/** Светлее (amount > 0) или темнее (< 0) цвет #rrggbb. */
const shade = (hex: string, amount: number): string => {
  const n = parseInt(hex.slice(1, 7), 16);
  const ch = (v: number) => Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount));
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
};

export class MapView {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  zoom = 1;
  ox = 0; // смещение камеры в CSS-пикселях
  oy = 0;
  private base = 26; // радиус клетки при zoom = 1
  /** Время для анимаций (мс): волны, дым, пила, покачивание армий. */
  time = 0;
  /** Плавное перемещение армий: генерал скользит по пути от старой клетки к новой. */
  private slides = new Map<string, { path: Hex[]; t0: number; dur: number }>();
  slide(gid: string, path: Hex[]): void { if (path.length > 1) this.slides.set(gid, { path, t0: performance.now(), dur: 180 * (path.length - 1) + 120 }); }
  /** Есть ли что анимировать прямо сейчас (чтобы не гонять кадры зря). */
  get busy(): boolean { return this.slides.size > 0; }
  /** Сбросить все текущие перемещения (после сна приложения). */
  stopAnimations(): void { this.slides.clear(); }
  private slidePos(gid: string, at: { x: number; y: number }): { x: number; y: number } {
    const a = this.slides.get(gid);
    if (!a) return at;
    const k = (performance.now() - a.t0) / a.dur;
    if (!(k >= 0 && k < 1)) { this.slides.delete(gid); return at; } // закончилось или часы сбились
    const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2; // плавный разгон и торможение
    const f = e * (a.path.length - 1), i = Math.min(a.path.length - 2, Math.floor(f)), u = f - i;
    const p = this.toPixel(a.path[i]), q = this.toPixel(a.path[i + 1]);
    const end = this.toPixel(a.path[a.path.length - 1]);
    // смещение генерала внутри клетки (на городе он сбоку) переносим на весь путь
    const ox = at.x - end.x, oy = at.y - end.y;
    return { x: p.x + (q.x - p.x) * u + ox, y: p.y + (q.y - p.y) * u + oy - Math.sin(u * Math.PI) * this.size * 0.15 };
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  get size(): number { return this.base * this.zoom; }

  /** Значок чуда света у города: золотой медальон с символом чуда. */
  private wonderBadge(x: number, y: number, r: number, icon: string): void {
    const c = this.ctx;
    c.save();
    c.shadowColor = 'rgba(255,215,120,.9)'; c.shadowBlur = r * 0.9;
    const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    g.addColorStop(0, '#fff3b8'); g.addColorStop(0.6, '#e6b84a'); g.addColorStop(1, '#a8741c');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.shadowBlur = 0; c.strokeStyle = '#6b4510'; c.lineWidth = Math.max(1, r * 0.14); c.stroke();
    c.fillStyle = '#5a3608'; c.font = `bold ${Math.round(r * 1.25)}px serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(icon, x, y + r * 0.06);
    c.restore();
  }

  /** Торговый кораблик на морском пути. */
  private ship(x: number, y: number, s: number, right: boolean): void {
    const c = this.ctx;
    c.save(); c.translate(x, y); if (!right) c.scale(-1, 1);
    c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(0, s * 0.35, s * 0.6, s * 0.12, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#7a4a22'; c.beginPath(); c.moveTo(-s * 0.55, s * 0.05); c.lineTo(s * 0.6, s * 0.05); c.lineTo(s * 0.38, s * 0.32); c.lineTo(-s * 0.4, s * 0.32); c.closePath(); c.fill();
    c.strokeStyle = '#4a2a10'; c.lineWidth = Math.max(1, s * 0.05); c.stroke();
    c.fillStyle = '#5a3a1a'; c.fillRect(-s * 0.03, -s * 0.6, s * 0.06, s * 0.65);
    c.fillStyle = '#fbf3dc'; c.beginPath(); c.moveTo(s * 0.03, -s * 0.58); c.quadraticCurveTo(s * 0.45, -s * 0.3, s * 0.03, 0); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(-s * 0.03, -s * 0.5); c.quadraticCurveTo(-s * 0.36, -s * 0.25, -s * 0.03, -s * 0.02); c.closePath(); c.fill();
    c.restore();
  }

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
    this.time = performance.now();
    const c = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    }
    // начинаем каждый кадр с чистого состояния холста (стек save/restore, трансформация, стили)
    (c as CanvasRenderingContext2D & { reset?: () => void }).reset?.();
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
      const at = (j: Job): string | null => j.kind === 'resource' || j.kind === 'found' || j.kind === 'tower' ? key(j.hex)
        : s.halls[j.hallId] ? key(s.halls[j.hallId].hex) : capital ? key(capital.hex) : null;
      for (const q of me.queue ?? []) { const k = at(q.job); if (k) clocks.set(k, true); }
      for (const j of me.jobs) { const k = at(j); if (k) clocks.set(k, false); }
    }

    // 1. местность: рисованные клетки из кэша (несколько вариантов каждой, выбор по координатам)
    c.fillStyle = '#2e5f8c'; c.fillRect(0, 0, w, h); // море за краем карты
    const onScreen = cells.filter((cell) => { const p = this.toPixel(cell.hex); return p.x > -S * 2 && p.y > -S * 2 && p.x < w + S * 2 && p.y < h + S * 2; });
    for (const cell of onScreen) {
      const { x, y } = this.toPixel(cell.hex);
      const v = ((cell.hex.q * 73856093) ^ (cell.hex.r * 19349663)) >>> 0;
      const { img, r } = tileSprite(cell.terrain, v % VARIANTS, S * dpr, !visible(key(cell.hex)) && !!mem[key(cell.hex)]);
      const k = S / r;
      c.drawImage(img, x - (img.width * k) / 2, y - (img.height * k) / 2, img.width * k, img.height * k);
    }
    // берега: полоса мелководья, песок и пена у суши
    const dirs = [{ q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 }, { q: -1, r: 0 }, { q: 0, r: -1 }, { q: 1, r: -1 }];
    c.lineCap = 'round';
    for (const cell of onScreen) {
      if (cell.terrain !== 'water') continue;
      const { x, y } = this.toPixel(cell.hex);
      const corners = this.corners(x, y, S);
      dirs.forEach((d, i) => {
        const n = s.cells[key({ q: cell.hex.q + d.q, r: cell.hex.r + d.r })];
        if (!n || n.terrain === 'water') return;
        const [ax, ay] = corners[i], [bx, by] = corners[(i + 1) % 6];
        const ix = (x - (ax + bx) / 2) * 0.22, iy = (y - (ay + by) / 2) * 0.22; // сдвиг внутрь воды
        c.strokeStyle = 'rgba(150,215,235,0.5)'; c.lineWidth = S * 0.42;
        c.beginPath(); c.moveTo(ax + ix, ay + iy); c.lineTo(bx + ix, by + iy); c.stroke();
        c.strokeStyle = 'rgba(244,231,190,0.95)'; c.lineWidth = Math.max(1.5, S * 0.1);
        c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
        c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = Math.max(1, S * 0.06);
        c.beginPath(); c.moveTo(ax + ix * 0.5, ay + iy * 0.5); c.lineTo(bx + ix * 0.5, by + iy * 0.5); c.stroke();
      });
    }
    // блики на воде: бегущие светлые дуги (только на открытой воде)
    if (S >= 10) {
      const t = this.time / 1000;
      c.lineCap = 'round';
      for (const cell of onScreen) {
        if (cell.terrain !== 'water' || !visible(key(cell.hex))) continue;
        const { x, y } = this.toPixel(cell.hex);
        const ph = (cell.hex.q * 1.7 + cell.hex.r * 2.3);
        for (let j = 0; j < 2; j++) {
          const k = (t * 0.25 + ph * 0.13 + j * 0.5) % 1;
          const a = Math.sin(k * Math.PI);
          const wx = x + (k - 0.5) * S * 1.1, wy = y + (j ? S * 0.32 : -S * 0.28) + Math.sin(t * 2 + ph) * S * 0.04;
          c.strokeStyle = `rgba(255,255,255,${(0.5 * a).toFixed(3)})`; c.lineWidth = Math.max(1, S * 0.06);
          c.beginPath(); c.arc(wx, wy + S * 0.2, S * 0.22, Math.PI * 1.25, Math.PI * 1.75); c.stroke();
        }
      }
    }
    // территории: лёгкая заливка цвета владельца
    for (const cell of onScreen) {
      const col = ownerColor(s, known.get(key(cell.hex))?.owner);
      if (!col) continue;
      const { x, y } = this.toPixel(cell.hex);
      this.hexPath(x, y, S + 0.3); c.fillStyle = col + '2e'; c.fill();
    }
    // 2. границы территорий
    for (const cell of cells) {
      const owner = known.get(key(cell.hex))?.owner;
      if (!owner) continue;
      const { x, y } = this.toPixel(cell.hex);
      if (x < -S * 2 || y < -S * 2 || x > w + S * 2 || y > h + S * 2) continue;
      const corners = this.corners(x, y, S - Math.max(1.5, S * 0.07));
      const col = ownerColor(s, owner)!;
      c.lineCap = 'round';
      dirs.forEach((d, i) => {
        if (known.get(key({ q: cell.hex.q + d.q, r: cell.hex.r + d.r }))?.owner === owner) return;
        const [ax, ay] = corners[i], [bx, by] = corners[(i + 1) % 6];
        // свечение внутрь, тёмная обводка и цветная линия — граница видна на любой местности
        const ix = (x - (ax + bx) / 2) * 0.16, iy = (y - (ay + by) / 2) * 0.16;
        c.strokeStyle = col + '55'; c.lineWidth = Math.max(3, S * 0.3);
        c.beginPath(); c.moveTo(ax + ix, ay + iy); c.lineTo(bx + ix, by + iy); c.stroke();
        c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = Math.max(3, 4.2 * this.zoom);
        c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
        c.strokeStyle = col; c.lineWidth = Math.max(2, 2.6 * this.zoom);
        c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
      });
    }
    // дороги: мощёная камнем серая лента. В каждой клетке дорога идёт плавной дугой от середины одного края
    // к середине другого через центр клетки, поэтому на поворотах нет углов
    const road = new Path2D();
    let anyRoad = false;
    for (const cell of onScreen) {
      if (!cell.road || !known.has(key(cell.hex))) continue;
      const o = this.toPixel(cell.hex);
      const ends = dirs.map((d) => s.cells[key({ q: cell.hex.q + d.q, r: cell.hex.r + d.r })])
        .filter((n) => n?.road && known.has(key(n.hex)))
        .map((n) => { const b = this.toPixel(n!.hex); return { x: (o.x + b.x) / 2, y: (o.y + b.y) / 2 }; });
      anyRoad = true;
      if (ends.length === 0) { road.moveTo(o.x - S * 0.2, o.y); road.lineTo(o.x + S * 0.2, o.y); continue; }
      if (ends.length === 1) { road.moveTo(o.x, o.y); road.lineTo(ends[0].x, ends[0].y); continue; }
      for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length; j++) {
        road.moveTo(ends[i].x, ends[i].y); road.quadraticCurveTo(o.x, o.y, ends[j].x, ends[j].y);
      }
    }
    if (anyRoad) {
      // спокойная утоптанная дорога: мягкая тень, песочно-серая полоса и редкие светлые камешки по краю — видно, но не кричит
      c.save();
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.strokeStyle = 'rgba(40,32,22,.22)'; c.lineWidth = Math.max(3, S * 0.2); c.stroke(road);
      c.strokeStyle = 'rgba(196,182,152,.78)'; c.lineWidth = Math.max(2, S * 0.13); c.stroke(road);
      c.strokeStyle = 'rgba(150,136,108,.55)'; c.lineWidth = Math.max(1, S * 0.035); c.setLineDash([S * 0.05, S * 0.14]); c.stroke(road);
      c.restore();
    }
    // морские торговые пути: пунктир по воде от города к городу, по нему плывёт кораблик
    for (const r of s.seaRoutes ?? []) {
      const ha = s.halls[r.a], hb = s.halls[r.b];
      if (!ha || !hb || !r.cells.some((k) => known.has(k))) continue;
      const pts = [this.toPixel(ha.hex), ...r.cells.map((k) => { const [q, rr] = k.split(',').map(Number); return this.toPixel({ q, r: rr }); }), this.toPixel(hb.hex)];
      const live = ha.owner === hb.owner;
      const path = new Path2D();
      path.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) path.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
      path.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      c.save(); c.lineCap = 'round';
      c.strokeStyle = 'rgba(10,40,70,.35)'; c.lineWidth = Math.max(3, S * 0.16); c.stroke(path);
      c.strokeStyle = live ? 'rgba(255,248,225,.9)' : 'rgba(255,255,255,.35)'; c.lineWidth = Math.max(1.5, S * 0.07);
      c.setLineDash([S * 0.18, S * 0.16]); c.lineDashOffset = live ? -this.time / 90 : 0; c.stroke(path);
      c.restore();
      if (live && pts.length > 2) { // кораблик ходит туда и обратно
        const span = pts.length - 1, ph = (this.time / 1600) % (2 * span), at = ph < span ? ph : 2 * span - ph;
        const i = Math.min(span - 1, Math.floor(at)), f = at - i;
        const x = pts[i].x + (pts[i + 1].x - pts[i].x) * f, y = pts[i].y + (pts[i + 1].y - pts[i].y) * f;
        this.ship(x, y, S * 0.34, ph < span ? pts[i + 1].x >= pts[i].x : pts[i + 1].x < pts[i].x);
      }
    }
    // 3. здания и ратуши
    const wonderAt = new Map(Object.entries(s.wonders ?? {}).map(([id, w]) => [w.hallId, id]));
    for (const cell of cells) {
      const v = known.get(key(cell.hex));
      if (!v) continue;
      const { x, y } = this.toPixel(cell.hex);
      if (cell.tower) this.tower(x, y, S, ownerColor(s, cell.owner) ?? undefined);
      if (v.building) this.building(x, y, S, v.building.kind, v.building.level);
      else if (v.reserved && !clocks.has(key(cell.hex))) this.clock(x, y, S * 0.36, false);
      if (v.hall && hallAt.get(key(cell.hex))?.walls) { // стены: каменное кольцо вокруг города
        c.save(); c.lineJoin = 'round';
        this.hexPath(x, y, S * 0.78); c.strokeStyle = 'rgba(40,30,20,.6)'; c.lineWidth = Math.max(3, S * 0.2); c.stroke();
        this.hexPath(x, y, S * 0.78); c.strokeStyle = '#a99c86'; c.lineWidth = Math.max(2, S * 0.13); c.setLineDash([S * 0.16, S * 0.07]); c.stroke();
        c.setLineDash([]); c.restore();
      }
      if (v.hall) this.hall(x, y, S, ownerColor(s, v.hall.owner)!, v.hall.level, !!v.hall.siege);
      const hid = v.hall ? hallAt.get(key(cell.hex))?.id : undefined;
      const wid = hid ? wonderAt.get(hid) : undefined;
      if (wid) this.wonderBadge(x - S * 0.58, y + S * 0.02, Math.max(7, S * 0.24), WONDERS[wid as WonderId].icon);
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
        // готовые к ходу армии слегка покачиваются — их видно издалека
        const bob = ready ? Math.sin(this.time / 380 + g.hex.q) * S * 0.05 : 0;
        const at = this.slidePos(g.id, { x: g.settler && onHall ? x - S * 0.42 : gx, y: gy + bob });
        const sz = onHall ? S * 0.78 : S;
        if (hl.unit === g.id) { // выбранный генерал — золотое пульсирующее кольцо вокруг фишки
          const pulse = 1 + Math.sin(this.time / 260) * 0.06;
          c.save();
          c.shadowColor = 'rgba(255,230,140,0.95)'; c.shadowBlur = sz * 0.45;
          c.strokeStyle = '#ffe28a'; c.lineWidth = Math.max(2.5, sz * 0.1);
          c.beginPath(); c.arc(at.x, at.y, sz * 0.56 * pulse, 0, Math.PI * 2); c.stroke();
          c.restore();
        }
        if (g.settler) this.settler(at.x, at.y, sz, ownerColor(s, g.owner)!, ready);
        else this.general(at.x, at.y, sz, ownerColor(s, g.owner)!, pieces, ready);
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
      this.hexPath(x, y, S * 0.88); c.fillStyle = 'rgba(255,255,255,0.3)'; c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = Math.max(1.5, S * 0.06); c.setLineDash([S * 0.16, S * 0.12]); c.stroke(); c.setLineDash([]);
    }
    for (const k of hl.attack ?? []) {
      const cell = s.cells[k]; if (!cell) continue;
      const { x, y } = this.toPixel(cell.hex);
      this.hexPath(x, y, S * 0.86); c.fillStyle = 'rgba(214,58,42,0.18)'; c.fill();
      c.strokeStyle = '#e8432f'; c.lineWidth = Math.max(2.5, S * 0.1); c.stroke();
      // скрещённые мечи внизу клетки
      c.strokeStyle = 'rgba(255,255,255,0.92)'; c.lineWidth = Math.max(1.5, S * 0.07); c.lineCap = 'round';
      c.beginPath(); c.moveTo(x - S * 0.22, y + S * 0.62); c.lineTo(x + S * 0.06, y + S * 0.34); c.moveTo(x + S * 0.22, y + S * 0.62); c.lineTo(x - S * 0.06, y + S * 0.34); c.stroke();
    }
    if (hl.selected && !hl.unit) { // выбрана сама клетка (город, здание, местность) — светится клетка
      const { x, y } = this.toPixel(hl.selected);
      c.save();
      c.shadowColor = 'rgba(255,240,170,0.95)'; c.shadowBlur = S * 0.5;
      this.hexPath(x, y, S * 0.92); c.strokeStyle = '#fff6d0'; c.lineWidth = Math.max(2.5, S * 0.11); c.stroke();
      c.restore();
      this.hexPath(x, y, S * 0.92); c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1; c.stroke();
    }
    // 6. туман войны: виденное раньше — блёклое и темнее, неизведанное — тёмное облако с мягким краем
    for (const cell of onScreen) {
      const k = key(cell.hex);
      if (visible(k)) continue;
      const { x, y } = this.toPixel(cell.hex);
      if (mem[k]) {
        this.hexPath(x, y, S + 0.6); c.fillStyle = 'rgba(22,26,40,0.18)'; c.fill(); // местность уже блёклая, приглушаем здания и границы
      } else {
        this.hexPath(x, y, S + 0.7); c.fillStyle = 'rgba(17,20,24,0.9)'; c.fill();
      }
    }
    for (const cell of onScreen) {
      const k = key(cell.hex);
      if (visible(k) || mem[k]) continue;
      const { x, y } = this.toPixel(cell.hex);
      for (const d of dirs) {
        const nk = key({ q: cell.hex.q + d.q, r: cell.hex.r + d.r });
        if (!visible(nk) && !mem[nk]) continue;
        const p = this.toPixel({ q: cell.hex.q + d.q, r: cell.hex.r + d.r });
        const gx = (x + p.x) / 2, gy = (y + p.y) / 2;
        const g = c.createRadialGradient(gx, gy, 0, gx, gy, S * 0.9);
        g.addColorStop(0, 'rgba(17,20,24,0.5)'); g.addColorStop(1, 'rgba(17,20,24,0)');
        c.fillStyle = g; c.beginPath(); c.arc(gx, gy, S * 0.9, 0, Math.PI * 2); c.fill();
      }
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
    // 8. виньетка по краям экрана — карта выглядит объёмнее
    const vg = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(10,20,30,0.3)');
    c.fillStyle = vg; c.fillRect(0, 0, w, h);
  }

  private cityLabel(x: number, y: number, S: number, name: string, color: string): void {
    const c = this.ctx;
    c.save();
    c.font = `700 ${Math.max(10, Math.round(S * 0.36))}px system-ui, sans-serif`;
    const w = c.measureText(name).width + S * 0.5;
    const h = Math.max(14, S * 0.52);
    c.shadowColor = 'rgba(0,0,0,0.35)'; c.shadowBlur = 4; c.shadowOffsetY = 1.5;
    const g = c.createLinearGradient(0, y - h / 2, 0, y + h / 2);
    g.addColorStop(0, color); g.addColorStop(1, shade(color, -0.25));
    c.beginPath(); c.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
    c.fillStyle = g; c.fill();
    c.shadowColor = 'transparent';
    c.strokeStyle = 'rgba(255,255,255,0.65)'; c.lineWidth = 1.2; c.stroke();
    c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(name, x, y + 0.5);
    c.restore();
  }

  /** Ресурсное здание — маленькая постройка на клетке: ферма с амбаром и колосьями, лесопилка с крутящейся пилой,
   *  рудник со штольней и вагонеткой, рыбный промысел с причалом и лодкой. С уровнем построек становится больше. */
  private building(x: number, y: number, cellS: number, kind: 'farm' | 'sawmill' | 'mine' | 'fishery', level: number): void {
    const c = this.ctx;
    const S = cellS * 1.22; // постройки чуть крупнее клетки по ощущению — так их лучше видно
    if (S < 11) { // издалека — просто цветная точка
      c.fillStyle = { farm: '#e2b13c', sawmill: '#9b6233', mine: '#f3c33a', fishery: '#5f9fc4' }[kind];
      c.beginPath(); c.arc(x, y, Math.max(2, S * 0.3), 0, Math.PI * 2); c.fill();
      return;
    }
    const t = this.time / 1000;
    c.save();
    c.lineJoin = 'round'; c.lineCap = 'round';
    const shadow = (cx: number, cy: number, rw: number) => {
      c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(cx + S * 0.04, cy, rw, rw * 0.3, 0, 0, Math.PI * 2); c.fill();
    };
    const roofHouse = (cx: number, cy: number, w: number, wall: string, roof: string) => {
      shadow(cx, cy, w * 0.62);
      c.fillStyle = wall; c.strokeStyle = 'rgba(60,40,20,0.7)'; c.lineWidth = Math.max(0.8, S * 0.025);
      c.beginPath(); c.rect(cx - w / 2, cy - w * 0.55, w, w * 0.55); c.fill(); c.stroke();
      c.fillStyle = roof;
      c.beginPath(); c.moveTo(cx - w * 0.62, cy - w * 0.5); c.lineTo(cx, cy - w * 1.02); c.lineTo(cx + w * 0.62, cy - w * 0.5); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.25)';
      c.beginPath(); c.moveTo(cx - w * 0.62, cy - w * 0.5); c.lineTo(cx, cy - w * 1.02); c.lineTo(cx - w * 0.1, cy - w * 0.5); c.closePath(); c.fill();
    };
    if (kind === 'farm') {
      // золотые грядки колосьев, покачиваются на ветру
      const rows = Math.min(4, 1 + level);
      for (let i = 0; i < rows; i++) {
        const ry = y + S * (0.05 + i * 0.13) - S * 0.05;
        for (let j = 0; j < 5; j++) {
          const rx = x - S * 0.5 + j * S * 0.13 + (i % 2) * S * 0.06;
          const sway = Math.sin(t * 2.2 + j * 0.8 + i) * S * 0.025;
          c.strokeStyle = '#a07a1e'; c.lineWidth = Math.max(0.8, S * 0.025);
          c.beginPath(); c.moveTo(rx, ry + S * 0.1); c.lineTo(rx + sway, ry - S * 0.02); c.stroke();
          c.fillStyle = '#f0c548';
          c.beginPath(); c.ellipse(rx + sway, ry - S * 0.05, S * 0.03, S * 0.06, sway / S, 0, Math.PI * 2); c.fill();
        }
      }
      roofHouse(x + S * 0.3, y + S * 0.05, S * 0.34, '#c94a3a', '#7a2e22');
      c.fillStyle = '#fff1d6'; c.fillRect(x + S * 0.26, y - S * 0.1, S * 0.08, S * 0.15); // дверь амбара
      if (level >= 3) roofHouse(x + S * 0.05, y - S * 0.32, S * 0.24, '#e8d6b0', '#9b5a2a');
    } else if (kind === 'sawmill') {
      // бревенчатый сарай, штабель брёвен, крутящаяся пила
      const logs = Math.min(3, level);
      for (let i = 0; i < logs; i++) {
        const lx = x - S * 0.42, ly = y + S * 0.18 - i * S * 0.1;
        c.fillStyle = '#9b6233'; c.strokeStyle = '#5a3719'; c.lineWidth = Math.max(0.8, S * 0.02);
        c.beginPath(); c.roundRect(lx, ly - S * 0.05, S * 0.36, S * 0.1, S * 0.05); c.fill(); c.stroke();
        c.fillStyle = '#e6bd84'; c.beginPath(); c.arc(lx + S * 0.36, ly, S * 0.05, 0, Math.PI * 2); c.fill(); c.stroke();
      }
      roofHouse(x + S * 0.12, y + S * 0.12, S * 0.42, '#b9824f', '#6b4423');
      const sx = x + S * 0.38, sy = y - S * 0.22, sr = S * 0.17;
      c.save(); c.translate(sx, sy); c.rotate(t * 3);
      c.fillStyle = '#c3cbd3'; c.strokeStyle = '#4b535b'; c.lineWidth = Math.max(0.8, S * 0.02);
      c.beginPath();
      for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, r = i % 2 ? sr * 0.78 : sr; c.lineTo(r * Math.cos(a), r * Math.sin(a)); }
      c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#6b4423'; c.beginPath(); c.arc(0, 0, sr * 0.3, 0, Math.PI * 2); c.fill();
      c.restore();
    } else if (kind === 'mine') {
      // скала со штольнью, рельсы и вагонетка с золотом
      shadow(x, y + S * 0.2, S * 0.5);
      c.fillStyle = '#8d8478'; c.strokeStyle = 'rgba(50,40,30,0.7)'; c.lineWidth = Math.max(0.8, S * 0.025);
      c.beginPath(); c.moveTo(x - S * 0.5, y + S * 0.2); c.quadraticCurveTo(x - S * 0.35, y - S * 0.5, x + S * 0.05, y - S * 0.45);
      c.quadraticCurveTo(x + S * 0.45, y - S * 0.4, x + S * 0.5, y + S * 0.2); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#2a211a';
      c.beginPath(); c.moveTo(x - S * 0.16, y + S * 0.2); c.lineTo(x - S * 0.16, y - S * 0.08); c.arc(x, y - S * 0.08, S * 0.16, Math.PI, 0); c.lineTo(x + S * 0.16, y + S * 0.2); c.closePath(); c.fill();
      c.strokeStyle = '#7a4a22'; c.lineWidth = Math.max(1, S * 0.05);
      c.beginPath(); c.moveTo(x - S * 0.19, y + S * 0.2); c.lineTo(x - S * 0.19, y - S * 0.1); c.arc(x, y - S * 0.1, S * 0.19, Math.PI, 0); c.lineTo(x + S * 0.19, y + S * 0.2); c.stroke();
      // вагонетка ездит туда-сюда
      const cx = x + S * 0.08 + Math.sin(t * 0.9) * S * 0.18, cy = y + S * 0.3;
      c.strokeStyle = '#5a5047'; c.lineWidth = Math.max(0.8, S * 0.02);
      c.beginPath(); c.moveTo(x - S * 0.2, cy + S * 0.06); c.lineTo(x + S * 0.5, cy + S * 0.06); c.stroke();
      c.fillStyle = '#6d6a66'; c.beginPath(); c.moveTo(cx - S * 0.13, cy - S * 0.07); c.lineTo(cx + S * 0.13, cy - S * 0.07); c.lineTo(cx + S * 0.1, cy + S * 0.04); c.lineTo(cx - S * 0.1, cy + S * 0.04); c.closePath(); c.fill();
      c.fillStyle = '#f2c63a'; c.beginPath(); c.arc(cx - S * 0.04, cy - S * 0.09, S * 0.05, 0, Math.PI * 2); c.arc(cx + S * 0.05, cy - S * 0.09, S * 0.045, 0, Math.PI * 2); c.fill();
      if (level >= 3) { c.fillStyle = 'rgba(255,248,200,0.9)'; const k = (Math.sin(t * 3) + 1) / 2; c.beginPath(); c.arc(x + S * 0.3, y - S * 0.28, S * 0.04 * (0.5 + k), 0, Math.PI * 2); c.fill(); }
    } else {
      // причал на сваях и покачивающаяся лодка
      c.fillStyle = '#9b6233'; c.strokeStyle = '#5a3719'; c.lineWidth = Math.max(0.8, S * 0.02);
      c.fillRect(x - S * 0.5, y - S * 0.06, S * 0.62, S * 0.1); c.strokeRect(x - S * 0.5, y - S * 0.06, S * 0.62, S * 0.1);
      for (let i = 0; i < 3; i++) c.fillRect(x - S * 0.46 + i * S * 0.24, y + S * 0.04, S * 0.04, S * 0.12);
      const bob = Math.sin(t * 1.8) * S * 0.04;
      const bx = x + S * 0.2, by = y + S * 0.26 + bob;
      c.fillStyle = '#c47a3a'; c.beginPath(); c.moveTo(bx - S * 0.26, by - S * 0.06); c.lineTo(bx + S * 0.26, by - S * 0.06); c.quadraticCurveTo(bx + S * 0.18, by + S * 0.1, bx, by + S * 0.1); c.quadraticCurveTo(bx - S * 0.18, by + S * 0.1, bx - S * 0.26, by - S * 0.06); c.fill(); c.stroke();
      c.strokeStyle = '#5a3719'; c.beginPath(); c.moveTo(bx, by - S * 0.06); c.lineTo(bx, by - S * 0.42); c.stroke();
      c.fillStyle = '#f7f3e8'; c.beginPath(); c.moveTo(bx + S * 0.02, by - S * 0.4); c.lineTo(bx + S * 0.22, by - S * 0.1); c.lineTo(bx + S * 0.02, by - S * 0.1); c.closePath(); c.fill();
      if (level >= 3) { c.fillStyle = '#5f9fc4'; c.beginPath(); c.ellipse(x - S * 0.3, y - S * 0.2, S * 0.1, S * 0.05, 0, 0, Math.PI * 2); c.fill(); }
    }
    c.restore();
    // уровень — маленький кружок с золотой каймой
    const rr = Math.max(5.5, S * 0.17), bx = x - S * 0.45, by = y - S * 0.38;
    c.beginPath(); c.arc(bx, by, rr, 0, Math.PI * 2);
    c.fillStyle = 'rgba(30,30,28,0.88)'; c.fill();
    c.strokeStyle = '#f3d27a'; c.lineWidth = 1.2; c.stroke();
    c.fillStyle = '#ffffff'; c.font = `700 ${Math.round(rr * 1.25)}px system-ui, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(String(level), bx, by + 0.5);
  }

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

  /** Сторожевая башня — тот же рисунок, что и значок в меню (icons.ts), с вымпелом цвета владельца. */
  private tower(x: number, y: number, S: number, color?: string): void {
    const c = this.ctx;
    const img = iconImage('tower');
    const sz = S * 1.12;
    const left = x - sz / 2, top = y - sz * 0.74;
    if (img) c.drawImage(img, left, top, sz, sz);
    if (color) { // вымпел владельца поверх золотого флажка
      const u = sz / 24;
      c.save(); c.fillStyle = color; c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = Math.max(0.6, u * 0.35);
      c.beginPath(); c.moveTo(left + 12.2 * u, top + 0.4 * u); c.quadraticCurveTo(left + 14.5 * u, top + 0.3 * u, left + 16.4 * u, top + 1.2 * u); c.lineTo(left + 12.2 * u, top + 2.1 * u); c.closePath(); c.fill(); c.stroke();
      c.restore();
    }
  }

  private hall(x: number, y: number, S: number, color: string, level: number, siege: boolean): void {
    const c = this.ctx;
    const w = S * 0.98, h = S * 0.72, base = y + S * 0.28, top = base - h;
    c.save();
    // тень
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath(); c.ellipse(x + S * 0.06, base + S * 0.04, w * 0.58, S * 0.14, 0, 0, Math.PI * 2); c.fill();
    // стена с зубцами
    const stone = c.createLinearGradient(0, top, 0, base);
    stone.addColorStop(0, '#efe7d6'); stone.addColorStop(1, '#b9ab90');
    c.fillStyle = stone; c.strokeStyle = 'rgba(70,55,35,0.75)'; c.lineWidth = Math.max(1, S * 0.04);
    c.beginPath();
    c.moveTo(x - w / 2, base); c.lineTo(x - w / 2, top + h * 0.3);
    const teeth = 5;
    for (let i = 0; i < teeth; i++) {
      const tx = x - w / 2 + (i * w) / (teeth - 0.5);
      c.lineTo(tx, top + h * 0.12); c.lineTo(tx + w / (teeth * 2), top + h * 0.12); c.lineTo(tx + w / (teeth * 2), top + h * 0.3);
      c.lineTo(Math.min(x + w / 2, tx + w / (teeth - 0.5)), top + h * 0.3);
    }
    c.lineTo(x + w / 2, top + h * 0.12); c.lineTo(x + w / 2, base); c.closePath();
    c.fill(); c.stroke();
    // центральная башня
    const tw = w * 0.36;
    c.fillStyle = stone;
    c.beginPath(); c.rect(x - tw / 2, top - h * 0.18, tw, h * 1.18); c.fill(); c.stroke();
    // ворота
    c.fillStyle = '#5a4328';
    c.beginPath(); c.moveTo(x - tw * 0.28, base); c.lineTo(x - tw * 0.28, base - h * 0.32); c.arc(x, base - h * 0.32, tw * 0.28, Math.PI, 0); c.lineTo(x + tw * 0.28, base); c.closePath(); c.fill();
    // знамя
    c.strokeStyle = '#4a3b2a'; c.lineWidth = Math.max(1, S * 0.04);
    c.beginPath(); c.moveTo(x, top - h * 0.18); c.lineTo(x, top - h * 0.7); c.stroke();
    c.fillStyle = color;
    c.beginPath(); c.moveTo(x, top - h * 0.7); c.quadraticCurveTo(x + S * 0.22, top - h * 0.62, x + S * 0.36, top - h * 0.66); c.lineTo(x + S * 0.36, top - h * 0.38);
    c.quadraticCurveTo(x + S * 0.2, top - h * 0.34, x, top - h * 0.42); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 0.8; c.stroke();
    // уровень — золотые точки на стене
    for (let i = 0; i < level; i++) {
      const dx = x - (level - 1) * S * 0.13 + i * S * 0.26;
      c.fillStyle = '#f2c94c'; c.beginPath(); c.arc(dx + (dx >= x - 1 && dx <= x + 1 ? 0 : 0), top + h * 0.6, S * 0.065, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(90,60,10,0.8)'; c.lineWidth = 0.8; c.stroke();
    }
    // дымок из трубы — город живёт
    if (S >= 14) {
      const t = this.time / 1000;
      for (let i = 0; i < 3; i++) {
        const k = (t * 0.35 + i / 3) % 1;
        c.fillStyle = `rgba(235,235,235,${(0.55 * (1 - k)).toFixed(3)})`;
        c.beginPath(); c.arc(x - w * 0.36 + Math.sin(k * 6 + i) * S * 0.04, top + h * 0.05 - k * S * 0.5, S * (0.05 + k * 0.08), 0, Math.PI * 2); c.fill();
      }
    }
    if (siege) {
      c.save();
      c.strokeStyle = '#e8432f'; c.lineWidth = Math.max(2.5, S * 0.1); c.setLineDash([S * 0.22, S * 0.14]);
      c.beginPath(); c.arc(x, y, S * 0.82, 0, Math.PI * 2); c.stroke();
      c.restore();
    }
    c.restore(); // пара к save() в начале: без неё каждый город каждый кадр оставлял лишнее состояние в стеке холста —
    // к поздним ходам стек переполнялся, и чужие повороты (пила лесопилки) доставались иконкам: они «крутились» по экрану
  }

  /** Поселенец: фишка с повозкой-флажком цвета владельца. */
  private settler(x: number, y: number, S: number, color: string, ready: boolean): void {
    const c = this.ctx;
    const r = S * 0.36;
    c.save();
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath(); c.ellipse(x + r * 0.15, y + r * 0.95, r * 0.9, r * 0.3, 0, 0, Math.PI * 2); c.fill();
    const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#e6dcc4');
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = ready ? color : 'rgba(0,0,0,0.35)'; c.lineWidth = ready ? Math.max(2.5, S * 0.09) : 1.5; c.stroke();
    c.strokeStyle = '#4a3424'; c.lineWidth = Math.max(1.2, S * 0.05); c.lineCap = 'round';
    c.beginPath(); c.moveTo(x - r * 0.35, y + r * 0.6); c.lineTo(x - r * 0.35, y - r * 0.62); c.stroke();
    c.fillStyle = color;
    c.beginPath(); c.moveTo(x - r * 0.3, y - r * 0.62); c.lineTo(x + r * 0.55, y - r * 0.35); c.lineTo(x - r * 0.3, y - r * 0.05); c.closePath(); c.fill();
    c.restore();
  }

  /** Генерал: блестящая фишка цвета владельца с королём, рядом — число фигур в армии. */
  private general(x: number, y: number, S: number, color: string, pieces: number, ready: boolean): void {
    const c = this.ctx;
    const r = S * 0.42;
    c.save();
    // тень на земле
    c.fillStyle = 'rgba(0,0,0,0.32)';
    c.beginPath(); c.ellipse(x + r * 0.15, y + r * 0.95, r * 0.95, r * 0.32, 0, 0, Math.PI * 2); c.fill();
    if (ready) { c.shadowColor = 'rgba(255,255,255,0.9)'; c.shadowBlur = S * 0.35; }
    const g = c.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.1, x, y, r * 1.05);
    g.addColorStop(0, shade(color, 0.45)); g.addColorStop(0.55, color); g.addColorStop(1, shade(color, -0.35));
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.shadowColor = 'transparent';
    c.strokeStyle = ready ? '#ffffff' : 'rgba(255,255,255,0.65)'; c.lineWidth = ready ? Math.max(2.2, S * 0.09) : 1.4; c.stroke();
    // блик
    c.fillStyle = 'rgba(255,255,255,0.28)';
    c.beginPath(); c.ellipse(x - r * 0.25, y - r * 0.45, r * 0.45, r * 0.22, -0.4, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffffff';
    c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 2; c.shadowOffsetY = 1;
    c.font = `${Math.round(S * 0.52)}px "Segoe UI Symbol", "Noto Sans Symbols 2", system-ui, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('\u265A', x, y + 1);
    c.restore();
    if (pieces > 0) {
      const bx = x + r * 0.85, by = y - r * 0.85, br = S * 0.22;
      c.fillStyle = '#1d1d1b'; c.beginPath(); c.arc(bx, by, br, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#f3d27a'; c.lineWidth = 1.2; c.stroke();
      c.fillStyle = '#ffffff'; c.font = `700 ${Math.round(S * 0.28)}px system-ui, sans-serif`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
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
