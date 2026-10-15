// Заставка главного экрана: остров из настоящих клеток игры на закате, на нём фигуры игрока и флаг его нации.
// Один раз при открытии клетки поднимаются от центра кольцами, затем на остров опускаются фигуры.

import { type NationId, type Terrain } from '../../core/src/index.ts';
import { tileSprite, VARIANTS } from './game/tiles.ts';
import { pieceUri } from './game/pieces.ts';
import { flagSvg } from './game/flags.ts';

type Cell = { q: number; r: number; t: Terrain; v: number; d: number };
const dist = (q: number, r: number) => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;

// остров: поле в центре, лес, горы на севере, месторождения; вокруг — море
const LAND: Record<string, Terrain> = {
  '0,-3': 'mountain', '1,-3': 'mountain', '2,-3': 'forest', '3,-3': 'mountain', '-1,-2': 'forest', '0,-2': 'mountain', '1,-2': 'forest', '2,-2': 'deposit',
  '-2,-1': 'forest', '-1,-1': 'field', '0,-1': 'field', '1,-1': 'field', '2,-1': 'forest', '3,-1': 'field', '-3,0': 'field', '-2,0': 'deposit', '-1,0': 'field',
  '0,0': 'field', '1,0': 'field', '2,0': 'field', '3,0': 'forest', '-3,1': 'forest', '-2,1': 'field', '-1,1': 'forest', '0,1': 'field', '1,1': 'deposit', '2,1': 'field',
  '-3,2': 'field', '-2,2': 'field', '-1,2': 'field', '0,2': 'forest', '1,2': 'field', '-3,3': 'forest', '-2,3': 'field', '0,3': 'field', '-1,3': 'field', '3,-2': 'field',
};
const CELLS: Cell[] = [];
for (let q = -8; q <= 8; q++) for (let r = -7; r <= 7; r++) {
  const d = dist(q, r);
  if (d > 8) continue;
  CELLS.push({ q, r, t: LAND[`${q},${r}`] ?? 'water', v: Math.abs(q * 7 + r * 13) % VARIANTS, d });
}
// фигуры: король (в облике династии) в центре, свита вокруг
const PIECES: [number, number, string, number][] = [[0, 0, 'wK', 1.25], [1, -1, 'wN', 1], [-1, 1, 'wR', 1], [1, 0, 'wP', 0.85], [-1, 0, 'wP', 0.85], [0, 1, 'wB', 1]];

const load = (src: string) => new Promise<HTMLImageElement>((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(i); i.src = src; });

export const drawHero = async (canvas: HTMLCanvasElement, nation: NationId): Promise<void> => {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const W = canvas.clientWidth, H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const R = Math.max(20, Math.min(30, W / 17)); // радиус клетки
  const cx = W * 0.62, cy = H * 0.72;
  const pos = (q: number, r: number) => ({ x: cx + R * Math.sqrt(3) * (q + r / 2), y: cy + R * 1.5 * r });
  const [imgs, flag] = await Promise.all([
    Promise.all(PIECES.map(([, , k]) => load(pieceUri(k)))),
    load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(flagSvg(nation, 60).replace(/^<svg /, '<svg xmlns="http://www.w3.org/2000/svg" '))}`),
  ]);
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const t0 = performance.now();
  const ease = (x: number) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3;
  const frame = (now: number) => {
    const t = still ? 1e5 : now - t0;
    ctx.clearRect(0, 0, W, H);
    // небо на закате
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#1e2a52'); sky.addColorStop(0.45, '#4a3f6b'); sky.addColorStop(0.72, '#d98a52'); sky.addColorStop(1, '#f2c27a');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    const sun = ctx.createRadialGradient(W * 0.82, H * 0.5, 0, W * 0.82, H * 0.5, H * 0.5);
    sun.addColorStop(0, 'rgba(255,226,160,.85)'); sun.addColorStop(0.25, 'rgba(255,200,120,.35)'); sun.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);
    // клетки: от дальних к ближним, поднимаются кольцами от центра
    for (const c of [...CELLS].sort((a, b) => a.r - b.r)) {
      const { x, y } = pos(c.q, c.r);
      if (y < H * 0.3 || x < -R * 2 || x > W + R * 2) continue;
      const k = ease((t - c.d * 70) / 380);
      if (k <= 0) continue;
      const sp = tileSprite(c.t, c.v, R * dpr);
      const w = sp.img.width / dpr, h = sp.img.height / dpr;
      ctx.globalAlpha = k * Math.min(1, (y - H * 0.3) / (H * 0.22));
      ctx.drawImage(sp.img, x - w / 2, y - h / 2 + (1 - k) * 18, w, h);
    }
    ctx.globalAlpha = 1;
    // дымка у горизонта поверх дальнего моря
    const haze = ctx.createLinearGradient(0, H * 0.2, 0, H * 0.6);
    haze.addColorStop(0, 'rgba(242,194,122,0)'); haze.addColorStop(0.4, 'rgba(242,194,122,.75)'); haze.addColorStop(1, 'rgba(242,194,122,0)');
    ctx.fillStyle = haze; ctx.fillRect(0, H * 0.2, W, H * 0.4);
    // флаг у короля
    const fk = ease((t - 560) / 400);
    if (fk > 0 && flag.width) {
      const { x, y } = pos(0, -1);
      ctx.globalAlpha = fk;
      ctx.fillStyle = '#5a3d22'; ctx.fillRect(x - 1.5, y - R * 2.1, 3, R * 2.1);
      const fw = R * 1.3, fh = fw * (flag.height / flag.width || 0.66);
      ctx.drawImage(flag, x + 1.5, y - R * 2.1, fw, fh);
      ctx.globalAlpha = 1;
    }
    // фигуры опускаются на остров
    PIECES.forEach(([q, r, , s], i) => {
      const k = ease((t - 520 - i * 70) / 420);
      if (k <= 0 || !imgs[i].width) return;
      const { x, y } = pos(q, r);
      const size = R * 1.55 * s;
      ctx.fillStyle = `rgba(20,25,40,${0.35 * k})`;
      ctx.beginPath(); ctx.ellipse(x, y + R * 0.35, size * 0.32, size * 0.1, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = k;
      ctx.drawImage(imgs[i], x - size / 2, y + R * 0.4 - size - (1 - k) * 40, size, size);
      ctx.globalAlpha = 1;
    });
    if (t < 1600) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
};
