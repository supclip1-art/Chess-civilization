// «Императорская корона»: что даёт, цена в Telegram Stars, покупка. Плюс окно «время на сегодня вышло» для партии.

import { MONETIZED, access, adsAvailable, autoLocked, buyCrown, track, canBuy, fmtLeft, refreshAccess, watchAd } from './access.ts';
import { setBack, tap } from './tg.ts';

const PERKS: [string, string, string][] = [
  ['📜', 'Chapters 3–8 of the Chronicles', 'from the Walls of Constantinople to the Checkmate of Empires'],
  ['🗺', 'Every map', 'Asia, the Mediterranean, Africa, the New World and South America — they open with your dynasty level'],
  ['⟳', 'City auto-development', 'cities build farms, mines and barracks on their own every turn'],
  ['☠', 'Play as the Outlaws', 'after the Bandit bane achievement'],
  ['⏳', 'No daily limit', 'play as long as you like, without ads'],
];
const FREE: string[] = ['Chapters 1–2 of the Chronicles', 'The Europe map', 'Dynasty and achievements', '30 minutes of play a day (+10 for an ad)'];

const NO_AD = 'No ad is available right now. Try again in a minute.';

/** Карточка короны (общая для экрана лавки и окна «время вышло»). */
export const crownCard = (): string => {
  const a = access();
  if (!a.premium) track('shop');
  return `<div class="crowncard"><span class="crownico">👑</span><h2>Imperial Crown</h2><p class="muted">One purchase, yours forever</p>
    <div class="perks">${PERKS.map(([i, b, s]) => `<div class="perk"><span>${i}</span><div><b>${b}</b><small>${s}</small></div></div>`).join('')}</div>
    ${a.premium ? '<p class="crownown">👑 The crown is yours. Thank you!</p>'
      : canBuy() ? `<button class="playbtn buycrown" data-a="buy">Buy for <span class="notr">⭐ ${a.price}</span></button>`
        : '<p class="muted">Open the game in Telegram to buy the crown.</p>'}</div>`;
};

/** Экран лавки с главного меню. */
export const openShop = (app: HTMLElement, back: () => void): void => {
  const leave = () => { app.onclick = null; back(); };
  setBack(leave);
  const draw = () => {
    const a = access();
    app.innerHTML = `<div class="shop">${crownCard()}
      ${a.premium ? '' : `<div class="freebox"><b>Free</b><ul>${FREE.map((f) => `<li>${f}</li>`).join('')}</ul>
        ${MONETIZED ? `<p>Today left: <b class="notr">${fmtLeft(a.secondsLeft)}</b></p>` : ''}
        ${adsAvailable() ? `<button class="ghost" data-a="ad">▶ Watch an ad: +${a.adMinutes} min</button>` : ''}</div>`}
      <button class="ghost" data-a="back">Back</button></div>`;
  };
  draw();
  app.onclick = async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-a]');
    if (!b) return;
    tap();
    const a = b.dataset.a;
    if (a === 'back') { leave(); return; }
    if (a === 'buy') {
      b.disabled = true;
      const r = await buyCrown();
      if (r === 'failed') alertBox(app, 'The payment did not go through. Try again in a minute.');
      draw();
    }
    if (a === 'ad') { b.disabled = true; const ok = await watchAd(); draw(); if (!ok) alertBox(app, NO_AD); }
  };
  void refreshAccess().then(draw);
};

const alertBox = (app: HTMLElement, text: string) => {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  app.appendChild(el);
  setTimeout(() => el.remove(), 3500);
};

/** Окно «время на сегодня вышло»: реклама (+10 минут), корона или в меню. Возвращает true, если можно играть дальше. */
export const timeUpDialog = async (modal: (html: string | null) => void, ask: () => Promise<string>): Promise<boolean> => {
  let note = '';
  for (;;) {
    const a = access();
    if (a.premium || (a.secondsLeft ?? 1) > 0) { modal(null); return true; }
    modal(`<div class="timeup"><span class="tuico">⏳</span><h2>Today's free time is over</h2>
      <p class="muted">${a.freeMinutes} minutes a day are free. Watch an ad for ${a.adMinutes} more minutes, or take the crown and play without limits.</p>
      ${note ? `<p class="adnote">${note}</p>` : ''}
      <div class="ctiles">${adsAvailable() ? `<button class="ctile ctop" data-a="ad"><span class="cico">▶</span><span class="ctext"><b>Watch an ad</b><small>+${a.adMinutes} minutes</small></span></button>` : ''}
        <button class="ctile" data-a="menu"><span class="cico">⌂</span><span class="ctext"><b>To the menu</b><small>the game is saved</small></span></button></div>
      ${crownCard()}</div>`);
    const c = await ask();
    if (c === 'menu') { modal(null); return false; }
    if (c === 'ad') { note = (await watchAd()) ? '' : NO_AD; continue; }
    if (c === 'buy') { await buyCrown(); continue; }
  }
};

/** Окно «это с короной» внутри партии (например, авторазвитие). Возвращает true, если корона теперь есть. */
export const crownDialog = async (modal: (html: string | null) => void, ask: () => Promise<string>, why: string): Promise<boolean> => {
  for (;;) {
    if (!autoLocked()) return true;
    modal(`<div class="timeup"><h2>${why}</h2>${crownCard()}<div class="acts"><button class="act close" data-a="close">Not now</button></div></div>`);
    const c = await ask();
    if (c === 'buy') { await buyCrown(); continue; }
    return false;
  }
};
