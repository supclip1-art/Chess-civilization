// Значки ресурсов и ресурсных зданий: одни и те же рисунки в панели ресурсов (SVG в HTML) и на карте (через Image на Canvas).
// Рисунки свои, простые: колос — еда и ферма, бревно — дерево, монета — золото, пила — лесопилка, кирка — рудник,
// рыба — рыбный промысел.

export type IconName = 'food' | 'wood' | 'gold' | 'farm' | 'sawmill' | 'mine' | 'fishery' | 'clock' | 'tactics' | 'tower';

const WHEAT = `
  <path d="M12 22.5V7" stroke="#7c5c17" stroke-width="1.7" stroke-linecap="round" fill="none"/>
  <g fill="#e2b13c" stroke="#7c5c17" stroke-width="0.8">
    <ellipse cx="12" cy="4.6" rx="1.7" ry="3"/>
    <ellipse cx="9.3" cy="9.2" rx="1.6" ry="2.9" transform="rotate(-32 9.3 9.2)"/>
    <ellipse cx="14.7" cy="9.2" rx="1.6" ry="2.9" transform="rotate(32 14.7 9.2)"/>
    <ellipse cx="9.3" cy="13.9" rx="1.6" ry="2.9" transform="rotate(-32 9.3 13.9)"/>
    <ellipse cx="14.7" cy="13.9" rx="1.6" ry="2.9" transform="rotate(32 14.7 13.9)"/>
  </g>`;

const LOG = `
  <rect x="2.5" y="7" width="15.5" height="10" rx="1.2" fill="#9b6233" stroke="#5a3719" stroke-width="1"/>
  <path d="M5 10.2h7.5M7.5 13.8h8" stroke="#5a3719" stroke-width="0.9" stroke-linecap="round"/>
  <ellipse cx="18" cy="12" rx="3.6" ry="5" fill="#e6bd84" stroke="#5a3719" stroke-width="1"/>
  <ellipse cx="18" cy="12" rx="1.9" ry="2.7" fill="none" stroke="#a9733d" stroke-width="0.8"/>
  <circle cx="18" cy="12" r="0.6" fill="#a9733d"/>`;

const COIN = `
  <circle cx="12" cy="12" r="9.3" fill="#f3c33a" stroke="#9d7208" stroke-width="1.4"/>
  <circle cx="12" cy="12" r="6.3" fill="none" stroke="#c08f12" stroke-width="1"/>
  <path d="M12 8.3v7.4" stroke="#9d7208" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M8.2 6.4a7 7 0 0 1 4-1.6" stroke="#fff3c2" stroke-width="1.2" stroke-linecap="round" fill="none"/>`;

/** Пильный диск: 12 зубьев по кругу. */
const sawPath = (): string => {
  const pts: string[] = [];
  for (let i = 0; i < 12; i++) {
    const a0 = (i / 12) * Math.PI * 2, a1 = ((i + 0.55) / 12) * Math.PI * 2;
    pts.push(`${(12 + 9.6 * Math.cos(a0)).toFixed(2)} ${(12 + 9.6 * Math.sin(a0)).toFixed(2)}`);
    pts.push(`${(12 + 7.4 * Math.cos(a1)).toFixed(2)} ${(12 + 7.4 * Math.sin(a1)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
};

const SAW = `
  <path d="${sawPath()}" fill="#aeb6bf" stroke="#4b535b" stroke-width="0.9" stroke-linejoin="round"/>
  <circle cx="12" cy="12" r="4.2" fill="#9b6233" stroke="#5a3719" stroke-width="0.9"/>
  <circle cx="12" cy="12" r="1.3" fill="#e6bd84"/>`;

const PICK = `
  <path d="M5 20.5L15 10" stroke="#7a4a22" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M6.8 5.6Q16.8 2.6 20.2 15.4Q15.6 8 6.8 5.6Z" fill="#9ba5af" stroke="#454d55" stroke-width="0.9" stroke-linejoin="round"/>
  <circle cx="17.6" cy="19" r="2.6" fill="#f3c33a" stroke="#9d7208" stroke-width="0.9"/>`;

const FISH = `
  <path d="M3.5 12c3-4.6 9.6-5.6 13.6-1.2L21 7.6v8.8l-3.9-3.2C13.1 17.6 6.5 16.6 3.5 12z" fill="#5f9fc4" stroke="#2c5872" stroke-width="1" stroke-linejoin="round"/>
  <path d="M9.5 8.3c1 2.4 1 5 0 7.4" stroke="#2c5872" stroke-width="0.8" fill="none"/>
  <circle cx="6.8" cy="11.2" r="0.9" fill="#1d3a4c"/>
  <path d="M3 20.2c2-1.3 4-1.3 6 0s4 1.3 6 0 4-1.3 6 0" stroke="#5f9fc4" stroke-width="1.2" fill="none" stroke-linecap="round"/>`;

/** Часы — стройка идёт. */
const CLOCK = `
  <circle cx="12" cy="12" r="9.6" fill="#ffffff" stroke="#2a2a26" stroke-width="1.8"/>
  <path d="M12 6.4V12l3.8 2.4" stroke="#2a2a26" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <g fill="#2a2a26"><circle cx="12" cy="3.9" r="0.8"/><circle cx="20.1" cy="12" r="0.8"/><circle cx="12" cy="20.1" r="0.8"/><circle cx="3.9" cy="12" r="0.8"/></g>`;

/** Шестерёнка: n зубьев, внешний и внутренний радиус. */
const gearPath = (cx: number, cy: number, ro: number, ri: number, n: number, rot = 0): string => {
  const pts: string[] = [];
  for (let i = 0; i < n * 4; i++) {
    const a = ((i / (n * 4)) * 360 + rot) * Math.PI / 180;
    const r = i % 4 < 2 ? ro : ri;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
};

/** Тактика — круглый медальон с двумя сцепленными шестерёнками. */
const TACTICS = `
  <circle cx="12" cy="12" r="11" fill="#2f4a6b" stroke="#c9a54a" stroke-width="1.4"/>
  <path d="${gearPath(9.4, 10.2, 5.4, 4.2, 8)}" fill="#e8c766" stroke="#7a5a12" stroke-width="0.6" stroke-linejoin="round"/>
  <circle cx="9.4" cy="10.2" r="1.7" fill="#2f4a6b"/>
  <path d="${gearPath(15.6, 15.4, 3.9, 3, 7, 12)}" fill="#cfd6de" stroke="#4b535b" stroke-width="0.6" stroke-linejoin="round"/>
  <circle cx="15.6" cy="15.4" r="1.2" fill="#2f4a6b"/>`;


/** Сторожевая башня: каменный ствол с кладкой, светящееся окно, дозорная площадка с зубцами, черепичный шатёр и флажок. */
const TOWER = `
  <defs>
    <linearGradient id="twS" x1="0" x2="1"><stop offset="0" stop-color="#f1e8d6"/><stop offset=".55" stop-color="#d3c5aa"/><stop offset="1" stop-color="#9c8b6e"/></linearGradient>
    <linearGradient id="twR" x1="0" x2="1"><stop offset="0" stop-color="#e2735a"/><stop offset=".6" stop-color="#b9452f"/><stop offset="1" stop-color="#7e2618"/></linearGradient>
    <radialGradient id="twW"><stop offset="0" stop-color="#fff2b0"/><stop offset="1" stop-color="#f0a52a"/></radialGradient>
  </defs>
  <ellipse cx="12" cy="22.6" rx="6.6" ry="1.2" fill="rgba(0,0,0,.25)"/>
  <path d="M8 22.5L8.9 10.4H15.1L16 22.5Z" fill="url(#twS)" stroke="#4d3b25" stroke-width=".8" stroke-linejoin="round"/>
  <path d="M8.6 14.2H15.4M8.3 18.3H15.7M10.6 10.4V14.2M13.4 14.2V18.3M10.3 18.3V22.4M13.9 18.3V22.4M12 10.4V12" stroke="#8a7656" stroke-width=".45" fill="none"/>
  <path d="M10.7 22.5V20.3a1.3 1.3 0 0 1 2.6 0V22.5Z" fill="#5b3a1e" stroke="#3a2412" stroke-width=".4"/>
  <path d="M11 15.9V14.9a1 1 0 0 1 2 0V15.9Z" fill="url(#twW)" stroke="#4d3b25" stroke-width=".4"/>
  <path d="M7.1 10.6H16.9L16.4 8.6H7.6Z" fill="#c9b994" stroke="#4d3b25" stroke-width=".7" stroke-linejoin="round"/>
  <path d="M7.6 8.6V7.6H9.1V8.6M10.4 8.6V7.6H11.9V8.6M12.1 8.6V7.6H13.6V8.6M14.9 8.6V7.6H16.4V8.6" fill="#ddd0b2" stroke="#4d3b25" stroke-width=".55"/>
  <path d="M6.8 7.7L12 2.1L17.2 7.7Z" fill="url(#twR)" stroke="#5a1c10" stroke-width=".7" stroke-linejoin="round"/>
  <path d="M9.2 7.6L12 2.6M14.8 7.6L12 2.6" stroke="rgba(255,220,200,.45)" stroke-width=".45"/>
  <path d="M12 2.3V.4" stroke="#3a2412" stroke-width=".6" stroke-linecap="round"/>
  <path d="M12.2 .4L15.6 1.2L12.2 2Z" fill="#f2c041" stroke="#8a5d10" stroke-width=".35"/>`;

const BODY: Record<IconName, string> = { food: WHEAT, farm: WHEAT, wood: LOG, gold: COIN, sawmill: SAW, mine: PICK, fishery: FISH, clock: CLOCK, tactics: TACTICS, tower: TOWER };

/** SVG-разметка значка для HTML. */
export const iconSvg = (name: IconName, size = 18): string =>
  `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${BODY[name]}</svg>`;

const images = new Map<IconName, HTMLImageElement>();

/** Картинка значка для Canvas (готова после iconsReady). */
export const iconImage = (name: IconName): HTMLImageElement | undefined => images.get(name);

/** Загрузить все значки для Canvas; промис выполняется, когда их можно рисовать. */
export const iconsReady: Promise<void> = Promise.all((Object.keys(BODY) as IconName[]).map((name) => new Promise<void>((resolve) => {
  const img = new Image();
  img.onload = () => { images.set(name, img); resolve(); };
  img.onerror = () => resolve();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24">${BODY[name]}</svg>`);
}))).then(() => undefined);
