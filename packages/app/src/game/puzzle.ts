// Разминочная задача перед партией (этап 6): найти мат в 1–2 хода. Награды нет — только похвала.
// Ход игрока проверяет Stockfish: верный — если после него соперник получает мат не позже, чем нужно по задаче.
// Поэтому принимаются и другие решения, а не только «авторское». Все позиции проверены Stockfish (глубина 16).

import { tap } from '../tg.ts';
import { getEngine } from './battle.ts';
import { BoardView, isWhite, moveText, parseFen } from './board.ts';

export type Puzzle = { fen: string; mate: 1 | 2; name: string; hint: string };

export const PUZZLES: Puzzle[] = [
  { fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', mate: 1, name: 'Back-rank mate', hint: 'The king is trapped behind its own pawns.' },
  { fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4', mate: 1, name: "Scholar's mate", hint: 'f7 is guarded only by the king.' },
  { fen: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1', mate: 1, name: 'Smothered mate', hint: 'The king is boxed in by its own pieces — a knight can reach it.' },
  { fen: 'rnbqkbnr/ppppp2p/5p2/6p1/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3', mate: 1, name: "Fool's mate", hint: 'The diagonal to e8 is wide open.' },
  { fen: 'k7/8/1K6/8/8/8/8/7R w - - 0 1', mate: 1, name: 'Rook on the edge', hint: 'Your king already covers the escape squares.' },
  { fen: '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1', mate: 1, name: 'Queen and king', hint: 'Put the queen next to the king, protected by your own king.' },
  { fen: '3r2k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1', mate: 1, name: 'Back rank, Black to move', hint: 'White forgot to give the king some air.' },
  { fen: 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2', mate: 1, name: "Fool's mate, Black to move", hint: 'The e1–h4 diagonal is open.' },
  { fen: '3r2k1/5ppp/8/8/8/8/1Q3PPP/3R2K1 w - - 0 1', mate: 1, name: 'Battery on the d-file', hint: 'Capture on the back rank — the queen guards the square.' },
  { fen: '5r1k/6pp/8/8/8/8/6PP/3R1QK1 w - - 0 1', mate: 1, name: 'Queen takes the rook', hint: 'The f-file is yours.' },
  { fen: '6k1/pp3ppp/8/8/8/2B5/PP3PPP/3R2K1 w - - 0 1', mate: 1, name: 'Back rank again', hint: 'Count the defenders of the eighth rank.' },
  { fen: '4k3/4P3/4K3/8/8/8/8/7R w - - 0 1', mate: 1, name: 'Pawn and rook', hint: 'The pawn and your king take away every escape square.' },
  { fen: '8/8/8/8/8/6k1/5q2/7K b - - 0 1', mate: 1, name: 'Queen against a lone king', hint: 'Your king protects the queen.' },
  { fen: '2r3k1/5ppp/8/8/8/8/5PPP/2R1R1K1 w - - 0 1', mate: 1, name: 'Two rooks', hint: 'Trade on c8 — the second rook backs you up.' },
  { fen: '1k6/ppp5/8/8/8/8/8/K2R4 w - - 0 1', mate: 1, name: 'Corridor mate', hint: 'The king cannot step forward.' },
  { fen: '6k1/8/8/8/8/8/R7/1R4K1 w - - 0 1', mate: 2, name: 'Rook ladder', hint: 'One rook cuts off a rank, the other gives mate.' },
  { fen: 'r6k/6pp/7N/8/8/1Q6/6PP/6K1 w - - 0 1', mate: 2, name: "Philidor's legacy", hint: 'Sacrifice the queen on g8 — the knight finishes.' },
  { fen: 'r2qkbnr/ppp2ppp/2np4/4N3/2B1P3/2N5/PPPP1PPP/R1BbK2R w KQkq - 0 6', mate: 2, name: "Légal's mate", hint: 'Forget the queen — check on f7.' },
  { fen: '5k2/8/5K2/8/8/8/8/4R3 w - - 0 1', mate: 2, name: 'King and rook', hint: 'A quiet king move first.' },
];

const PRAISE = ['Brilliant!', 'Checkmate — well played!', 'Excellent, a true tactician!', 'Your generals are inspired!', 'Clean and precise!'];
const KEY = 'chessciv.puzzle.last';

const pick = (): Puzzle => {
  let last = -1;
  try { last = Number(localStorage.getItem(KEY) ?? -1); } catch { /* без хранилища */ }
  let i = Math.floor(Math.random() * PUZZLES.length);
  if (i === last) i = (i + 1) % PUZZLES.length;
  try { localStorage.setItem(KEY, String(i)); } catch { /* ничего */ }
  return PUZZLES[i];
};

const act = (id: string, label: string, sub = '') => `<button class="act" data-p="${id}"><b>${label}</b>${sub ? `<span>${sub}</span>` : ''}</button>`;

/** Показать задачу. Промис выполняется, когда игрок решил её, пропустил или закрыл. */
export const showPuzzle = (app: HTMLElement, next = 'Start the game'): Promise<void> => {
  const pz = pick();
  const white = pz.fen.split(' ')[1] === 'w';
  const el = document.createElement('div');
  el.className = 'fight puzzle';
  el.innerHTML = `
    <div class="fhead"><b>Warm-up puzzle</b><span>${pz.name}</span></div>
    <p class="ptask"><b>${white ? 'White' : 'Black'} to move — checkmate in ${pz.mate}</b></p>
    <div id="boardhost"></div>
    <p id="fstatus" class="fstatus">Find the move. Tap a piece, then a square.</p>
    <p id="fmoves" class="fmoves"></p>
    <div class="acts">${act('hint', 'Hint')}${act('skip', 'Skip', next.toLowerCase())}</div>
    <div class="promo" id="promo" hidden></div>`;
  app.appendChild(el);
  const board = new BoardView(el.querySelector('#boardhost')!, !white);
  const status = (t: string) => { el.querySelector('#fstatus')!.innerHTML = t; };
  const moves: string[] = [];
  let fen = pz.fen;
  let legal: string[] = [];
  let selected: string | undefined;
  let busy = true;
  let hintSq: string | undefined;

  return new Promise((resolve) => {
    const finish = () => { el.remove(); resolve(); };
    const targets = () => (selected ? [...new Set(legal.filter((m) => m.startsWith(selected!)).map((m) => m.slice(2, 4)))] : []);
    const draw = (check = false) => board.render(fen, { last: moves[moves.length - 1], selected: selected ?? hintSq, targets: targets(), check });
    const pos = () => `fen ${pz.fen}${moves.length ? ` moves ${moves.join(' ')}` : ''}`;
    const reset = async (msg: string) => {
      moves.length = 0;
      fen = pz.fen;
      selected = undefined;
      const e = await getEngine();
      legal = await e.legalMoves(pos());
      status(msg);
      el.querySelector('#fmoves')!.textContent = '';
      draw();
      busy = false;
    };
    const solved = () => {
      busy = true;
      status(`<b class="good">${PRAISE[Math.floor(Math.random() * PRAISE.length)]}</b> ${pz.name}.`);
      el.querySelector('.acts')!.innerHTML = act('done', next);
    };

    const play = async (move: string) => {
      busy = true;
      const e = await getEngine();
      const before = fen;
      moves.push(move);
      let info = await e.inspect(pos());
      fen = info.fen;
      selected = undefined; hintSq = undefined;
      el.querySelector('#fmoves')!.textContent = moveText(before, move);
      legal = await e.legalMoves(pos());
      draw(info.inCheck);
      if (!legal.length && info.inCheck) { solved(); return; }
      // осталось ходов игрока до мата
      const mine = Math.ceil(moves.length / 2);
      const left = pz.mate - mine;
      const a = await e.analyse(pos(), 12);
      if (left <= 0 || a.mate === undefined || a.mate > 0 || -a.mate > left) {
        status('<b>Not quite.</b> That move lets the king escape — try again.');
        setTimeout(() => reset('Find the move. Tap a piece, then a square.'), 1300);
        return;
      }
      // ответ защиты — лучший ход движка
      await new Promise((r) => setTimeout(r, 450));
      const reply = a.best;
      const pre = fen;
      moves.push(reply);
      info = await e.inspect(pos());
      fen = info.fen;
      el.querySelector('#fmoves')!.textContent = `${moveText(pz.fen, moves[0])} ${moveText(pre, reply)}`;
      legal = await e.legalMoves(pos());
      status(`Good! ${left === 1 ? 'Now finish it — mate in 1.' : `Keep going — mate in ${left}.`}`);
      draw(info.inCheck);
      busy = false;
    };

    const promote = (): Promise<string> => new Promise((res) => {
      const box = el.querySelector<HTMLElement>('#promo')!;
      box.innerHTML = `<p>Promote the pawn to</p><div>${['q', 'r', 'b', 'n'].map((p) =>
        `<button data-q="${p}" class="pc ${white ? 'w' : 'b'}">${{ q: '♛', r: '♜', b: '♝', n: '♞' }[p]}︎</button>`).join('')}</div>`;
      box.hidden = false;
      box.onclick = (ev) => { const b = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-q]'); if (b) { box.hidden = true; res(b.dataset.q!); } };
    });

    board.onSquare = async (sq) => {
      if (busy) return;
      const p = parseFen(fen).get(sq);
      if (selected && targets().includes(sq)) {
        const c = legal.filter((m) => m.startsWith(selected! + sq));
        tap();
        await play(c.length > 1 ? selected + sq + await promote() : c[0]);
        return;
      }
      selected = p && isWhite(p) === white && legal.some((m) => m.startsWith(sq)) ? sq : undefined;
      draw();
    };

    el.querySelector('.acts')!.addEventListener('click', async (ev) => {
      const b = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-p]');
      if (!b) return;
      tap();
      if (b.dataset.p === 'skip' || b.dataset.p === 'done') { finish(); return; }
      if (b.dataset.p === 'hint' && !busy) {
        busy = true;
        const a = await (await getEngine()).analyse(pos(), 12);
        hintSq = a.best.slice(0, 2);
        status(`Hint: ${pz.hint} The highlighted piece starts the combination.`);
        draw();
        busy = false;
      }
    });

    status('Loading the engine…');
    reset('Find the move. Tap a piece, then a square.').catch((e) => { status(`Engine error: ${String(e?.message ?? e)}`); busy = true; });
  });
};
