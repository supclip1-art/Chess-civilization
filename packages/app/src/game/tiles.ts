// Рисованные клетки местности: каждая клетка — маленькая картинка (поле с бороздами и цветами, лес из крон,
// горы со снежными шапками, холмы с золотыми жилами, волны, дюны, тундра). Картинки рисуются один раз
// для текущего размера клетки и кэшируются, на карте их только копируем — так карта остаётся быстрой.

import type { Terrain } from '../../../core/src/index.ts';

export const VARIANTS = 4;

type Pal = { top: string; bottom: string; spot: string[] };
const PAL: Record<Terrain, Pal> = {
  field: { top: '#cfe08a', bottom: '#a9c45e', spot: ['rgba(255,255,220,0.22)', 'rgba(90,120,30,0.14)'] },
  forest: { top: '#7fb06a', bottom: '#4f8044', spot: ['rgba(30,70,30,0.18)', 'rgba(200,240,160,0.12)'] },
  deposit: { top: '#d9c48c', bottom: '#b49660', spot: ['rgba(120,80,30,0.15)', 'rgba(255,240,200,0.18)'] },
  tundra: { top: '#eef3f1', bottom: '#cfdcdb', spot: ['rgba(140,170,180,0.18)', 'rgba(255,255,255,0.4)'] },
  desert: { top: '#f4e2ad', bottom: '#dcbf7c', spot: ['rgba(190,140,70,0.16)', 'rgba(255,250,225,0.3)'] },
  mountain: { top: '#b3aa9c', bottom: '#857c70', spot: ['rgba(60,50,40,0.16)', 'rgba(255,255,255,0.14)'] },
  water: { top: '#5ea6da', bottom: '#3b7fba', spot: ['rgba(255,255,255,0.05)', 'rgba(20,60,110,0.06)'] },
};

/** Детерминированный «случай» для клетки и варианта, чтобы картинка не мигала при перерисовке. */
const rand = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

const hexPath = (c: CanvasRenderingContext2D, cx: number, cy: number, r: number) => {
  c.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
    if (i) c.lineTo(x, y); else c.moveTo(x, y);
  }
  c.closePath();
};

const tree = (c: CanvasRenderingContext2D, x: number, y: number, s: number, rnd: () => number) => {
  c.fillStyle = 'rgba(20,40,20,0.28)';
  c.beginPath(); c.ellipse(x + s * 0.12, y + s * 0.55, s * 0.55, s * 0.18, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#6b4a2b'; c.fillRect(x - s * 0.08, y + s * 0.1, s * 0.16, s * 0.42);
  const pine = rnd() < 0.45;
  if (pine) {
    for (let k = 0; k < 3; k++) {
      const yy = y - s * 0.55 + k * s * 0.28, ww = s * (0.32 + k * 0.14);
      c.fillStyle = k % 2 ? '#2f6b3a' : '#3b7d44';
      c.beginPath(); c.moveTo(x, yy - s * 0.18); c.lineTo(x - ww, yy + s * 0.28); c.lineTo(x + ww, yy + s * 0.28); c.closePath(); c.fill();
    }
    c.fillStyle = 'rgba(220,255,200,0.25)';
    c.beginPath(); c.moveTo(x, y - s * 0.73); c.lineTo(x - s * 0.18, y - s * 0.35); c.lineTo(x, y - s * 0.4); c.closePath(); c.fill();
  } else {
    const g = c.createRadialGradient(x - s * 0.18, y - s * 0.32, s * 0.05, x, y - s * 0.15, s * 0.55);
    g.addColorStop(0, '#9ccf72'); g.addColorStop(0.6, '#4f9a45'); g.addColorStop(1, '#2f6e34');
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y - s * 0.15, s * 0.45, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(x - s * 0.3, y - s * 0.02, s * 0.3, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(x + s * 0.3, y - s * 0.02, s * 0.3, 0, Math.PI * 2); c.fill();
  }
};

const peak = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
  // тень у подножия, светлый и тёмный склоны, снежная шапка
  c.fillStyle = 'rgba(40,30,20,0.25)';
  c.beginPath(); c.ellipse(x + w * 0.1, y + h * 0.05, w * 0.6, h * 0.12, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#9b9283';
  c.beginPath(); c.moveTo(x - w * 0.55, y); c.lineTo(x, y - h); c.lineTo(x + w * 0.55, y); c.closePath(); c.fill();
  c.fillStyle = '#6f675b';
  c.beginPath(); c.moveTo(x, y - h); c.lineTo(x + w * 0.55, y); c.lineTo(x + w * 0.05, y); c.closePath(); c.fill();
  c.fillStyle = '#f7f8fa';
  c.beginPath(); c.moveTo(x, y - h); c.lineTo(x - w * 0.2, y - h * 0.62); c.lineTo(x - w * 0.06, y - h * 0.68); c.lineTo(x + w * 0.04, y - h * 0.58);
  c.lineTo(x + w * 0.2, y - h * 0.64); c.closePath(); c.fill();
  c.fillStyle = 'rgba(160,180,200,0.6)';
  c.beginPath(); c.moveTo(x, y - h); c.lineTo(x + w * 0.2, y - h * 0.64); c.lineTo(x + w * 0.04, y - h * 0.58); c.closePath(); c.fill();
};

/** Нарисовать одну клетку местности в центре (cx, cy) радиусом r. */
const paintTile = (c: CanvasRenderingContext2D, t: Terrain, v: number, cx: number, cy: number, r: number) => {
  const rnd = rand(v * 7919 + t.length * 104729 + t.charCodeAt(0) * 31);
  const pal = PAL[t];
  c.save();
  hexPath(c, cx, cy, r);
  c.clip();
  // основа: мягкий градиент сверху вниз
  const g = c.createLinearGradient(cx - r * 0.4, cy - r, cx + r * 0.4, cy + r);
  g.addColorStop(0, pal.top); g.addColorStop(1, pal.bottom);
  c.fillStyle = g;
  c.fillRect(cx - r * 1.2, cy - r * 1.2, r * 2.4, r * 2.4);
  // пятна — чтобы клетка не была плоской
  for (let i = 0; i < (t === 'water' ? 3 : 7); i++) {
    c.fillStyle = pal.spot[i % pal.spot.length];
    c.beginPath();
    c.ellipse(cx + (rnd() - 0.5) * r * 1.6, cy + (rnd() - 0.5) * r * 1.6, r * (0.2 + rnd() * 0.3), r * (0.12 + rnd() * 0.2), rnd() * Math.PI, 0, Math.PI * 2);
    c.fill();
  }
  const s = r;
  if (t === 'field') {
    // борозды и полевые цветы
    c.strokeStyle = 'rgba(120,150,40,0.35)'; c.lineWidth = Math.max(1, s * 0.05); c.lineCap = 'round';
    const tilt = (rnd() - 0.5) * 0.6;
    for (let i = -3; i <= 3; i++) {
      const y0 = cy + i * s * 0.24;
      c.beginPath(); c.moveTo(cx - s * 0.85, y0 + tilt * s * 0.3); c.quadraticCurveTo(cx, y0 - s * 0.08, cx + s * 0.85, y0 - tilt * s * 0.3); c.stroke();
    }
    for (let i = 0; i < 5; i++) {
      c.fillStyle = ['#fff6c8', '#f4d35e', '#ffffff', '#f2a7a7'][i % 4];
      c.beginPath(); c.arc(cx + (rnd() - 0.5) * s * 1.2, cy + (rnd() - 0.5) * s * 1.2, s * 0.045, 0, Math.PI * 2); c.fill();
    }
  } else if (t === 'forest') {
    const spots: [number, number][] = [[-0.35, -0.3], [0.3, -0.35], [0, 0], [-0.42, 0.32], [0.38, 0.28], [0.02, 0.5]];
    spots.sort(() => rnd() - 0.5);
    const n = 4 + Math.floor(rnd() * 2);
    spots.slice(0, n).sort((a, b) => a[1] - b[1]).forEach(([dx, dy]) => tree(c, cx + dx * s + (rnd() - 0.5) * s * 0.1, cy + dy * s, s * (0.38 + rnd() * 0.08), rnd));
  } else if (t === 'mountain') {
    const big = rnd() < 0.5;
    peak(c, cx - s * 0.18, cy + s * 0.42, s * 1.0, s * (big ? 1.05 : 0.9));
    peak(c, cx + s * 0.38, cy + s * 0.5, s * 0.7, s * 0.62);
  } else if (t === 'deposit') {
    // холм с камнями и золотыми жилами
    c.fillStyle = 'rgba(120,85,40,0.25)';
    c.beginPath(); c.ellipse(cx, cy + s * 0.32, s * 0.7, s * 0.2, 0, 0, Math.PI * 2); c.fill();
    const hg = c.createLinearGradient(cx, cy - s * 0.5, cx, cy + s * 0.3);
    hg.addColorStop(0, '#d8bf86'); hg.addColorStop(1, '#a8874f');
    c.fillStyle = hg;
    c.beginPath(); c.moveTo(cx - s * 0.75, cy + s * 0.3); c.quadraticCurveTo(cx - s * 0.2, cy - s * 0.65, cx + s * 0.75, cy + s * 0.3); c.closePath(); c.fill();
    for (let i = 0; i < 3; i++) {
      const x = cx + (i - 1) * s * 0.32 + (rnd() - 0.5) * s * 0.1, y = cy + s * (0.05 + rnd() * 0.15);
      c.fillStyle = '#8d8478'; c.beginPath(); c.ellipse(x, y, s * 0.13, s * 0.09, rnd(), 0, Math.PI * 2); c.fill();
      c.fillStyle = '#f2c63a'; c.beginPath(); c.arc(x - s * 0.03, y - s * 0.02, s * 0.045, 0, Math.PI * 2); c.fill();
    }
    // искорка
    const sx = cx + s * 0.18, sy = cy - s * 0.18, k = s * 0.12;
    c.fillStyle = 'rgba(255,248,200,0.95)';
    c.beginPath(); c.moveTo(sx, sy - k); c.lineTo(sx + k * 0.25, sy - k * 0.25); c.lineTo(sx + k, sy); c.lineTo(sx + k * 0.25, sy + k * 0.25);
    c.lineTo(sx, sy + k); c.lineTo(sx - k * 0.25, sy + k * 0.25); c.lineTo(sx - k, sy); c.lineTo(sx - k * 0.25, sy - k * 0.25); c.closePath(); c.fill();
  } else if (t === 'water') {
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = Math.max(1, s * 0.055); c.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const x = cx + (rnd() - 0.5) * s * 0.9, y = cy + (i - 1) * s * 0.42 + (rnd() - 0.5) * s * 0.12, w = s * (0.22 + rnd() * 0.12);
      c.beginPath(); c.moveTo(x - w, y); c.quadraticCurveTo(x - w / 2, y - w * 0.45, x, y); c.quadraticCurveTo(x + w / 2, y + w * 0.45, x + w, y); c.stroke();
    }
  } else if (t === 'desert') {
    c.strokeStyle = 'rgba(180,130,60,0.35)'; c.lineWidth = Math.max(1, s * 0.06);
    for (let i = 0; i < 3; i++) {
      const y = cy + (i - 1) * s * 0.45;
      c.beginPath(); c.moveTo(cx - s, y + s * 0.15); c.quadraticCurveTo(cx - s * 0.2, y - s * 0.22, cx + s, y + s * 0.1); c.stroke();
    }
    if (rnd() < 0.5) { // кактус
      const x = cx + s * 0.3, y = cy + s * 0.2;
      c.strokeStyle = '#5d8a3e'; c.lineWidth = s * 0.09; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - s * 0.4); c.moveTo(x, y - s * 0.2); c.lineTo(x + s * 0.12, y - s * 0.28); c.lineTo(x + s * 0.12, y - s * 0.38); c.stroke();
    }
  } else if (t === 'tundra') {
    for (let i = 0; i < 4; i++) {
      const x = cx + (rnd() - 0.5) * s * 1.2, y = cy + (rnd() - 0.5) * s * 1.1;
      c.strokeStyle = 'rgba(110,140,120,0.6)'; c.lineWidth = Math.max(1, s * 0.04);
      c.beginPath(); c.moveTo(x - s * 0.07, y); c.lineTo(x, y - s * 0.12); c.lineTo(x + s * 0.07, y); c.stroke();
    }
  }
  c.restore();
  // объём: светлая кромка сверху слева, тень снизу справа
  c.save();
  hexPath(c, cx, cy, r - Math.max(0.6, r * 0.03));
  const e = c.createLinearGradient(cx - r * 0.6, cy - r, cx + r * 0.6, cy + r);
  e.addColorStop(0, 'rgba(255,255,255,0.38)'); e.addColorStop(0.5, 'rgba(255,255,255,0)'); e.addColorStop(1, 'rgba(0,0,0,0.22)');
  c.strokeStyle = e; c.lineWidth = Math.max(1, r * 0.07); c.stroke();
  c.restore();
};

const cache = new Map<string, HTMLCanvasElement>();
let cacheR = 0;

/** Картинка клетки для радиуса r (в пикселях экрана с учётом devicePixelRatio). Радиус округляем
 *  до шага, чтобы при плавном зуме не перерисовывать картинки на каждый кадр. */
export const tileSprite = (t: Terrain, variant: number, rPx: number, dim = false): { img: HTMLCanvasElement; r: number } => {
  const r = Math.max(6, Math.round(rPx / 3) * 3);
  if (r !== cacheR) { cache.clear(); cacheR = r; }
  const k = `${t}:${variant}:${dim ? 1 : 0}`;
  let img = cache.get(k);
  if (!img) {
    img = document.createElement('canvas');
    const w = Math.ceil(r * Math.sqrt(3)) + 4, h = r * 2 + 4;
    img.width = w; img.height = h;
    const ctx = img.getContext('2d')!;
    if (!dim) paintTile(ctx, t, variant, w / 2, h / 2, r + 0.8);
    else {
      // виденная раньше клетка под туманом: та же картинка, но блёклая и темнее (считаем один раз и кэшируем)
      ctx.drawImage(tileSprite(t, variant, rPx).img, 0, 0);
      const d = ctx.getImageData(0, 0, w, h);
      for (let i = 0; i < d.data.length; i += 4) {
        const g = 0.3 * d.data[i] + 0.59 * d.data[i + 1] + 0.11 * d.data[i + 2];
        d.data[i] = (d.data[i] * 0.45 + g * 0.55) * 0.78;
        d.data[i + 1] = (d.data[i + 1] * 0.45 + g * 0.55) * 0.78;
        d.data[i + 2] = (d.data[i + 2] * 0.45 + g * 0.55) * 0.84;
      }
      ctx.putImageData(d, 0, 0);
    }
    cache.set(k, img);
  }
  return { img, r };
};
