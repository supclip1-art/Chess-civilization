// Экран кампании «Хроники империй»: свиток глав со звёздами, замками и кнопкой «Начать».

import { DIFFICULTY, NATIONS, italyMap, type GameState } from '../../core/src/index.ts';
import { CHAPTERS, chapterOpen, chapterStars, startChapter, totalStars } from './campaign.ts';
import { flagSvg } from './game/flags.ts';
import { MAPS } from './setup.ts';
import { setBack, tap } from './tg.ts';
import { chapterLocked } from './access.ts';
import { openShop } from './shop.ts';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const stars = (n: number) => `<span class="cstars">${[1, 2, 3].map((i) => `<i class="${i <= n ? 'on' : ''}">★</i>`).join('')}</span>`;

export const openCampaign = (app: HTMLElement, back: () => void, start: (s: GameState) => void): void => {
  setBack(back);
  const total = totalStars();
  app.innerHTML = `
    <div class="camphero"><h1 class="wordmark small">Chronicles of Empires</h1>
      <p>Eight chapters of history. Each is a whole game with its own nation, rivals and goal.</p>
      <div class="camptotal">${stars(Math.min(3, Math.ceil(total / 8)))}<b>${total} / ${CHAPTERS.length * 3}</b></div></div>
    <p class="muted campnote">★ goal achieved · ★★ the chapter's special condition · ★★★ no city of yours ever falls</p>
    <div class="chapters">${CHAPTERS.map((ch) => {
      const open = chapterOpen(ch.id), st = chapterStars(ch.id);
      const who = ch.nation === 'outlaws' ? 'Outlaws' : NATIONS[ch.nation].name;
      return `<article class="chapter ${open ? '' : 'locked'} ${st ? 'done' : ''}">
        <div class="chtop"><span class="chnum">${ch.id}</span><span class="chflag">${flagSvg(ch.nation, 46)}</span>
          <div class="chname"><b>${esc(ch.name)}</b><small>${esc(ch.era)}</small></div>${stars(st)}</div>
        <p class="chstory">${esc(ch.story)}</p>
        <div class="chfacts"><span>🎯 ${esc(ch.goalText)}${ch.goal.kind === 'hold' || ch.goal.kind === 'strongest' ? '' : ` · by turn ${ch.limit}`}</span>
          <span>♛ ${esc(who)} · ${esc(ch.map === 'italy' ? italyMap().name : MAPS[ch.map]().name)} · ${ch.rivals.length} rivals · ${esc(DIFFICULTY[ch.difficulty].name)}</span>
          <span>★★ ${esc(ch.star2.text)}</span></div>
        ${chapterLocked(ch.id) ? `<button class="crownlock chcrown">👑 With the Imperial Crown${open ? '' : ` · after chapter ${ch.id - 1}`}</button>`
          : open ? `<button class="playbtn chplay" data-ch="${ch.id}">${st ? 'Play again' : 'Begin'}</button>` : `<p class="chlock">🔒 Complete chapter ${ch.id - 1} to open</p>`}
      </article>`;
    }).join('')}</div>`;
  for (const b of app.querySelectorAll<HTMLButtonElement>('.chcrown')) b.onclick = () => { tap(); openShop(app, () => openCampaign(app, back, start)); };
  for (const b of app.querySelectorAll<HTMLButtonElement>('.chplay')) b.onclick = () => {
    tap();
    const ch = CHAPTERS.find((c) => c.id === Number(b.dataset.ch))!;
    start(startChapter(ch));
  };
  window.scrollTo(0, 0);
};
