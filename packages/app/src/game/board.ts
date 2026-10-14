// Шахматная доска для боя и реплея: рисует позицию из FEN, подсвечивает последний ход, шах,
// выбранную фигуру и поля, куда она может пойти. Белые всегда снизу (атакующий — игрок).

const FILES = 'abcdefgh';
// сплошные знаки для обеих сторон, цвет задаёт CSS; ︎ — текстовое, а не эмодзи-начертание (iOS)
const GLYPH: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const VS = '︎';

export type Squares = Map<string, string>; // "e4" -> "N" (заглавная — белые)

export const parseFen = (fen: string): Squares => {
  const b: Squares = new Map();
  fen.split(' ')[0].split('/').forEach((row, i) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) f += Number(ch);
      else { b.set(FILES[f] + (8 - i), ch); f++; }
    }
  });
  return b;
};

export const isWhite = (p: string) => p === p.toUpperCase();

/** Запись хода для списка: «Nf3», «exd5», «O-O», «e8=Q». Без знаков шаха — их добавляет вызывающий. */
export const moveText = (fenBefore: string, uci: string): string => {
  const b = parseFen(fenBefore);
  const from = uci.slice(0, 2), to = uci.slice(2, 4), promo = uci[4];
  const p = b.get(from) ?? '';
  const kind = p.toLowerCase();
  if (kind === 'k' && Math.abs(FILES.indexOf(to[0]) - FILES.indexOf(from[0])) === 2) return to[0] === 'g' ? 'O-O' : 'O-O-O';
  const capture = b.has(to) || (kind === 'p' && from[0] !== to[0]);
  if (kind === 'p') return `${capture ? `${from[0]}x` : ''}${to}${promo ? `=${promo.toUpperCase()}` : ''}`;
  return `${kind.toUpperCase()}${capture ? 'x' : ''}${to}`;
};

/** Фигуры стороны знаками: «♟×6 ♞×2 ♜». */
export const armyGlyphs = (fen: string, white: boolean): string => {
  const count: Record<string, number> = {};
  for (const p of parseFen(fen).values()) if (isWhite(p) === white && p.toLowerCase() !== 'k') count[p.toLowerCase()] = (count[p.toLowerCase()] ?? 0) + 1;
  return ['q', 'r', 'b', 'n', 'p'].filter((k) => count[k]).map((k) => `${GLYPH[k]}${VS}${count[k] > 1 ? `×${count[k]}` : ''}`).join(' ') || '—';
};

export type BoardMarks = { last?: string; check?: boolean; selected?: string; targets?: string[] };

export class BoardView {
  readonly el: HTMLElement;
  private cells = new Map<string, HTMLElement>();
  onSquare?: (sq: string) => void;

  constructor(host: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'board';
    for (let r = 8; r >= 1; r--) {
      for (let f = 0; f < 8; f++) {
        const sq = FILES[f] + r;
        const d = document.createElement('div');
        d.className = `sq ${(f + r) % 2 ? 'd' : 'l'}`; // a1 — тёмное
        d.dataset.sq = sq;
        if (r === 1) d.insertAdjacentHTML('beforeend', `<i class="cf">${FILES[f]}</i>`);
        if (f === 0) d.insertAdjacentHTML('beforeend', `<i class="cr">${r}</i>`);
        d.insertAdjacentHTML('beforeend', '<span class="pc"></span>');
        this.el.appendChild(d);
        this.cells.set(sq, d);
      }
    }
    this.el.addEventListener('click', (e) => {
      const d = (e.target as HTMLElement).closest<HTMLElement>('.sq');
      if (d?.dataset.sq) this.onSquare?.(d.dataset.sq);
    });
    host.appendChild(this.el);
  }

  render(fen: string, marks: BoardMarks = {}): void {
    const b = parseFen(fen);
    const toMoveWhite = fen.split(' ')[1] === 'w';
    const size = this.el.clientWidth / 8 || 40;
    this.el.style.setProperty('--pc', `${Math.round(size * 0.8)}px`);
    const last = marks.last ? [marks.last.slice(0, 2), marks.last.slice(2, 4)] : [];
    for (const [sq, d] of this.cells) {
      const p = b.get(sq);
      const pc = d.querySelector<HTMLElement>('.pc')!;
      pc.textContent = p ? GLYPH[p.toLowerCase()] + VS : '';
      pc.className = `pc ${p ? (isWhite(p) ? 'w' : 'b') : ''}`;
      d.classList.toggle('last', last.includes(sq));
      d.classList.toggle('sel', marks.selected === sq);
      d.classList.toggle('check', !!marks.check && p === (toMoveWhite ? 'K' : 'k'));
      const target = marks.targets?.includes(sq);
      d.classList.toggle('tgt', !!target && !p);
      d.classList.toggle('cap', !!target && !!p);
    }
  }
}
