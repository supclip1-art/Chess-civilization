// Экран боя: ручная партия игрока против генерала-соперника и просмотр сыгранной партии (реплей).

import { MAX_PLIES, battleFen, repertoireFor, type GameState } from '../../../core/src/index.ts';
import { tap } from '../tg.ts';
import { type BattleRecord, type HumanAction, type Turn, runBattle } from './battle.ts';
import { BoardView, armyGlyphs, isWhite, moveText, parseFen } from './board.ts';

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export type Side = { name: string; color: string; elo: number; stars: number };

const shell = (app: HTMLElement, title: string, top: Side, bottom: Side, actions: string): HTMLElement => {
  const el = document.createElement('div');
  el.className = 'fight';
  el.innerHTML = `
    <div class="fhead"><b>${esc(title)}</b><span id="fply"></span></div>
    <div class="fside"><span><b style="color:${top.color}">${esc(top.name)}</b> · ELO ${top.elo} ${'★'.repeat(top.stars)}</span><span class="mat" id="mtop"></span></div>
    <div id="boardhost"></div>
    <div class="fside"><span><b style="color:${bottom.color}">${esc(bottom.name)}</b> · ELO ${bottom.elo} ${'★'.repeat(bottom.stars)}</span><span class="mat" id="mbot"></span></div>
    <p id="fstatus" class="fstatus"></p>
    <p id="fmoves" class="fmoves"></p>
    <div class="acts">${actions}</div>
    <div class="promo" id="promo" hidden></div>`;
  app.appendChild(el);
  return el;
};

const act = (id: string, label: string, sub = '') => `<button class="act" data-f="${id}"><b>${label}</b>${sub ? `<span>${sub}</span>` : ''}</button>`;

/** Список ходов «1. e4 e5 2. Nf3 …» — последние n полных ходов. */
const moveList = (fens: string[], moves: string[], last = 6): string => {
  const parts: string[] = [];
  moves.forEach((m, i) => parts.push(`${i % 2 === 0 ? `${i / 2 + 1}. ` : ''}${moveText(fens[i], m)}`));
  const fromPly = Math.max(0, moves.length - last * 2);
  const start = fromPly % 2 ? fromPly - 1 : fromPly;
  return (start > 0 ? '… ' : '') + parts.slice(start).join(' ');
};

/** Ручной бой: белыми ходит игрок. */
export const playManual = (
  app: HTMLElement, s: GameState, attackerId: string, defenderId: string, me: Side, foe: Side, title: string,
): Promise<BattleRecord> => {
  const el = shell(app, title, foe, me,
    act('auto', 'Let the general finish', 'Stockfish plays for you') + act('resign', 'Resign', 'the battle is lost'));
  const board = new BoardView(el.querySelector('#boardhost')!);
  const status = (t: string) => { el.querySelector('#fstatus')!.innerHTML = t; };
  const att = s.generals[attackerId], def = s.generals[defenderId];
  const fens: string[] = [battleFen(att.army, def.army)];
  const moves: string[] = [];
  let pending: ((a: HumanAction) => void) | null = null;
  let lastCheck = false;
  let note = ''; // какой дебют играют генералы
  let delay = 450; // пауза перед ходом генерала, чтобы ответ было видно

  const draw = (fen: string, marks: Parameters<BoardView['render']>[1] = {}) => {
    board.render(fen, { last: moves[moves.length - 1], check: lastCheck, ...marks });
    el.querySelector('#mtop')!.innerHTML = armyGlyphs(fen, false);
    el.querySelector('#mbot')!.innerHTML = armyGlyphs(fen, true);
    el.querySelector('#fply')!.textContent = `Half-move ${moves.length} / ${MAX_PLIES}`;
    el.querySelector('#fmoves')!.textContent = fens.length > 1 ? moveList(fens, moves) : '';
  };

  el.querySelector('.acts')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-f]');
    if (!b) return;
    if (b.dataset.f === 'skip') { tap(); delay = 0; b.disabled = true; status('Playing out the rest…'); return; }
    if (!pending) return;
    tap();
    const f = pending; pending = null;
    if (b.dataset.f === 'resign') f({ resign: true });
    else {
      f({ auto: true });
      delay = 150;
      status('Your general is playing…');
      el.querySelector('.acts')!.innerHTML = act('skip', 'Skip to the result', 'play the rest instantly');
    }
  });

  const promote = (white: boolean): Promise<string> => new Promise((resolve) => {
    const box = el.querySelector<HTMLElement>('#promo')!;
    box.innerHTML = `<p>Promote the pawn to</p><div>${['q', 'r', 'b', 'n'].map((p) =>
      `<button data-p="${p}" class="pc ${white ? 'w' : 'b'}">${{ q: '♛', r: '♜', b: '♝', n: '♞' }[p]}︎</button>`).join('')}</div>`;
    box.hidden = false;
    box.onclick = (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-p]');
      if (!b) return;
      box.hidden = true;
      resolve(b.dataset.p!);
    };
  });

  const human = (t: Turn): Promise<HumanAction> => new Promise((resolve) => {
    pending = resolve;
    lastCheck = t.inCheck;
    let selected: string | undefined;
    const targets = () => (selected ? [...new Set(t.legal.filter((m) => m.startsWith(selected!)).map((m) => m.slice(2, 4)))] : []);
    status(`${t.inCheck ? '<b>Check!</b> Your move' : 'Your move — tap a piece'}${note ? ` · ${note}` : ''}`);
    draw(t.fen);
    board.onSquare = async (sq) => {
      if (!pending) return;
      const p = parseFen(t.fen).get(sq);
      if (selected && targets().includes(sq)) {
        const cands = t.legal.filter((m) => m.startsWith(selected! + sq));
        let move = cands[0];
        if (cands.length > 1) move = selected + sq + await promote(true);
        tap();
        const f = pending; pending = null;
        board.onSquare = undefined;
        status('The enemy general is thinking…');
        f?.({ move });
        return;
      }
      selected = p && isWhite(p) && t.legal.some((m) => m.startsWith(sq)) ? sq : undefined;
      draw(t.fen, { selected, targets: targets() });
    };
  });

  return (async () => {
    status('The generals take their positions…');
    try {
      const rec = await runBattle(s, attackerId, defenderId, {
        human,
        minDelayMs: () => delay,
        onPly: (t) => {
          moves.push(t.moves[t.moves.length - 1]);
          fens.push(t.fen);
          lastCheck = t.inCheck;
          if (t.book) {
            const white = t.moves.length % 2 === 1;
            const name = repertoireFor(white ? att : def, white, t.moves.slice(0, -1));
            if (name) note = `${white ? 'your general plays' : 'the enemy plays'} the ${esc(name)}`;
          } else note = '';
          draw(t.fen);
        },
      });
      return rec;
    } finally {
      el.remove();
    }
  })();
};

/** Просмотр сыгранной партии. */
export const showReplay = (app: HTMLElement, rec: BattleRecord, white: Side, black: Side, title: string): Promise<void> => {
  const el = shell(app, title, black, white,
    `${act('first', '⏮')}${act('back', '◀')}${act('play', '▶')}${act('fwd', '▶▶')}${act('last', '⏭')}${act('close', 'Close')}`);
  el.classList.add('replay');
  const board = new BoardView(el.querySelector('#boardhost')!);
  let i = rec.moves.length;
  let timer: ReturnType<typeof setInterval> | undefined;
  const show = () => {
    const fen = rec.fens[i];
    board.render(fen, { last: i > 0 ? rec.moves[i - 1] : undefined });
    el.querySelector('#mtop')!.innerHTML = armyGlyphs(fen, false);
    el.querySelector('#mbot')!.innerHTML = armyGlyphs(fen, true);
    el.querySelector('#fply')!.textContent = `Half-move ${i} / ${rec.moves.length}`;
    el.querySelector('#fmoves')!.textContent = i ? moveList(rec.fens, rec.moves.slice(0, i)) : 'Starting position';
    el.querySelector('#fstatus')!.textContent = i <= rec.bookPlies && i > 0 ? 'Opening book' : '';
    el.querySelector<HTMLElement>('[data-f="play"] b')!.textContent = timer ? '⏸' : '▶';
  };
  const stop = () => { if (timer) clearInterval(timer); timer = undefined; };
  return new Promise((resolve) => {
    el.querySelector('.acts')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-f]');
      if (!b) return;
      tap();
      const f = b.dataset.f;
      if (f === 'close') { stop(); el.remove(); resolve(); return; }
      if (f === 'play') {
        if (timer) stop();
        else {
          if (i >= rec.moves.length) i = 0;
          timer = setInterval(() => { if (i < rec.moves.length) { i++; show(); } else { stop(); show(); } }, 700);
        }
      } else {
        stop();
        if (f === 'first') i = 0;
        if (f === 'back') i = Math.max(0, i - 1);
        if (f === 'fwd') i = Math.min(rec.moves.length, i + 1);
        if (f === 'last') i = rec.moves.length;
      }
      show();
    });
    requestAnimationFrame(show);
  });
};
