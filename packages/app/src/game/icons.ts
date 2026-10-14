// Значки ресурсов и ресурсных зданий: одни и те же рисунки в панели ресурсов (SVG в HTML) и на карте (через Image на Canvas).
// Рисунки свои, простые: колос — еда и ферма, бревно — дерево, монета — золото, пила — лесопилка, кирка — рудник,
// рыба — рыбный промысел.

export type IconName = 'food' | 'wood' | 'gold' | 'farm' | 'sawmill' | 'mine' | 'fishery';

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

const BODY: Record<IconName, string> = { food: WHEAT, farm: WHEAT, wood: LOG, gold: COIN, sawmill: SAW, mine: PICK, fishery: FISH };

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
