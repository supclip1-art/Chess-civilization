// Портреты правителей — стилизованные SVG-миниатюры, собранные из простых слоёв: фон, одежда, лицо,
// волосы, борода и головной убор. Это не изображения реальных людей, а условные «гербовые» портреты:
// внешность задают регион и эпоха (корона, тюрбан, немес, кабуто…), мелкие отличия — по хешу имени.

import { NATIONS, type NationId } from '../../../core/src/index.ts';

type Head = 'crown' | 'tiara' | 'turban' | 'nemes' | 'keffiyeh' | 'fur' | 'khan' | 'kabuto' | 'eboshi' | 'gat' | 'mianguan'
  | 'wrap' | 'feathers' | 'bicorne' | 'pickelhaube' | 'fez' | 'laurel' | 'cap' | 'tall' | 'kepi' | 'none';
type Hair = 'short' | 'long' | 'wig' | 'bald' | 'topknot';
type Beard = 'none' | 'mustache' | 'full' | 'goatee' | 'long' | 'sideburns';
type Look = { skin: string; hair: string; hairStyle: Hair; beard: Beard; head: Head; robe: string; trim: string; bg: string; female?: boolean; suit?: boolean };

const SKIN = { light: '#f2cba8', fair: '#e8b993', olive: '#d1a074', tan: '#bf8a5e', brown: '#9c6640', dark: '#6e4426' };
const HAIR = { black: '#231d18', brown: '#5a3a22', red: '#9a4a24', blond: '#c9a35a', grey: '#9a948c', white: '#e9e6df' };

const NATION_LOOK: Record<NationId, Look> = {
  russia: { skin: SKIN.light, hair: HAIR.brown, hairStyle: 'short', beard: 'full', head: 'crown', robe: '#8b1e2b', trim: '#d9b44a', bg: '#dfe6f3' },
  ukraine: { skin: SKIN.light, hair: HAIR.brown, hairStyle: 'bald', beard: 'mustache', head: 'fur', robe: '#1f4e8c', trim: '#f1c232', bg: '#fbefc1' },
  poland: { skin: SKIN.light, hair: HAIR.brown, hairStyle: 'short', beard: 'mustache', head: 'crown', robe: '#9b1c2c', trim: '#d9b44a', bg: '#f4e3e5' },
  germany: { skin: SKIN.light, hair: HAIR.grey, hairStyle: 'short', beard: 'none', head: 'crown', robe: '#2b2b2b', trim: '#d9b44a', bg: '#f3e2b0' },
  france: { skin: SKIN.light, hair: HAIR.brown, hairStyle: 'short', beard: 'none', head: 'crown', robe: '#1d3f8f', trim: '#e5c45a', bg: '#e3e9f6' },
  britain: { skin: SKIN.light, hair: HAIR.brown, hairStyle: 'short', beard: 'none', head: 'crown', robe: '#7a1022', trim: '#e5c45a', bg: '#dfe4f0' },
  spain: { skin: SKIN.fair, hair: HAIR.brown, hairStyle: 'short', beard: 'goatee', head: 'crown', robe: '#2a2320', trim: '#e0b13c', bg: '#f6e0b0' },
  italy: { skin: SKIN.fair, hair: HAIR.brown, hairStyle: 'short', beard: 'none', head: 'laurel', robe: '#7d1f4f', trim: '#d9b44a', bg: '#e3efe5' },
  turkey: { skin: SKIN.olive, hair: HAIR.black, hairStyle: 'short', beard: 'full', head: 'turban', robe: '#b3261e', trim: '#e5c45a', bg: '#f6dcdc' },
  egypt: { skin: SKIN.tan, hair: HAIR.black, hairStyle: 'short', beard: 'none', head: 'nemes', robe: '#efe6cf', trim: '#d4a53a', bg: '#f3e7c4' },
  arabia: { skin: SKIN.olive, hair: HAIR.black, hairStyle: 'short', beard: 'full', head: 'keffiyeh', robe: '#e9e4d7', trim: '#b38a2e', bg: '#dcefe3' },
  persia: { skin: SKIN.olive, hair: HAIR.black, hairStyle: 'short', beard: 'full', head: 'tall', robe: '#1f6b4a', trim: '#e0b13c', bg: '#e6f1e8' },
  uzbekistan: { skin: SKIN.olive, hair: HAIR.black, hairStyle: 'short', beard: 'full', head: 'turban', robe: '#1b6f8a', trim: '#e0b13c', bg: '#dff1f5' },
  kazakhstan: { skin: SKIN.fair, hair: HAIR.black, hairStyle: 'short', beard: 'mustache', head: 'khan', robe: '#1d7fa0', trim: '#f2c94c', bg: '#dcf3f8' },
  pakistan: { skin: SKIN.tan, hair: HAIR.black, hairStyle: 'short', beard: 'full', head: 'turban', robe: '#0f5a33', trim: '#e0b13c', bg: '#e1efe5' },
  india: { skin: SKIN.brown, hair: HAIR.black, hairStyle: 'short', beard: 'mustache', head: 'turban', robe: '#d9822b', trim: '#f2d16b', bg: '#fbe8d2' },
  bangladesh: { skin: SKIN.brown, hair: HAIR.black, hairStyle: 'short', beard: 'full', head: 'turban', robe: '#0f6b4f', trim: '#e0b13c', bg: '#e0f0e8' },
  china: { skin: SKIN.fair, hair: HAIR.black, hairStyle: 'topknot', beard: 'long', head: 'mianguan', robe: '#c9a227', trim: '#8b1e1e', bg: '#f8e1dc' },
  korea: { skin: SKIN.fair, hair: HAIR.black, hairStyle: 'topknot', beard: 'goatee', head: 'gat', robe: '#a3263a', trim: '#e0b13c', bg: '#e8edf6' },
  japan: { skin: SKIN.fair, hair: HAIR.black, hairStyle: 'topknot', beard: 'mustache', head: 'eboshi', robe: '#3a3f6b', trim: '#c9a227', bg: '#f6e3e5' },
  vietnam: { skin: SKIN.fair, hair: HAIR.black, hairStyle: 'short', beard: 'goatee', head: 'wrap', robe: '#c9a227', trim: '#b3261e', bg: '#f8e0d6' },
  indonesia: { skin: SKIN.tan, hair: HAIR.black, hairStyle: 'short', beard: 'mustache', head: 'wrap', robe: '#6b3a1f', trim: '#e0b13c', bg: '#f6e2e2' },
  nigeria: { skin: SKIN.dark, hair: HAIR.black, hairStyle: 'short', beard: 'goatee', head: 'crown', robe: '#0f7a46', trim: '#f2d16b', bg: '#e1f2e8' },
  mexico: { skin: SKIN.tan, hair: HAIR.black, hairStyle: 'long', beard: 'none', head: 'feathers', robe: '#0f6b4f', trim: '#e0b13c', bg: '#f5ead8' },
  usa: { skin: SKIN.light, hair: HAIR.white, hairStyle: 'wig', beard: 'none', head: 'none', robe: '#24304f', trim: '#f1f1f1', bg: '#e3e8f3', suit: true },
  brazil: { skin: SKIN.fair, hair: HAIR.brown, hairStyle: 'short', beard: 'sideburns', head: 'crown', robe: '#14633a', trim: '#f2d16b', bg: '#fbf3c8' },
};

/** Отличия конкретных правителей от облика нации. */
const RULER_LOOK: Record<string, Partial<Look>> = {
  'Ivan the Terrible': { beard: 'long', head: 'fur' },
  'Peter the Great': { beard: 'mustache', head: 'none', hairStyle: 'long' },
  'Elizabeth of Russia': { female: true, beard: 'none', head: 'tiara', hair: HAIR.blond, hairStyle: 'long' },
  'Danylo of Galicia': { head: 'crown', hairStyle: 'short', beard: 'full' },
  'Casimir the Great': { beard: 'full' },
  'Frederick the Great': { head: 'bicorne', hair: HAIR.white, hairStyle: 'wig' },
  'Otto von Bismarck': { head: 'pickelhaube', beard: 'mustache', hairStyle: 'bald' },
  'Frederick III': { beard: 'full', hair: HAIR.blond },
  Napoleon: { head: 'bicorne' },
  'Louis XIV': { hairStyle: 'wig', hair: HAIR.black, beard: 'mustache' },
  'Henry IV': { beard: 'full', hair: HAIR.grey },
  'Elizabeth I': { female: true, beard: 'none', head: 'tiara', hair: HAIR.red, hairStyle: 'long' },
  'Alfred the Great': { beard: 'full', hair: HAIR.blond, hairStyle: 'long' },
  'Isabella I': { female: true, beard: 'none', head: 'tiara', hair: HAIR.red, hairStyle: 'long' },
  'Charles III': { hairStyle: 'wig', hair: HAIR.white, beard: 'none' },
  'Victor Emmanuel II': { head: 'none', beard: 'mustache', hairStyle: 'short' },
  "Lorenzo de' Medici": { head: 'cap', hairStyle: 'long', hair: HAIR.black },
  'Ramesses II': { beard: 'goatee' },
  'Muhammad Ali': { head: 'turban', beard: 'full', hair: HAIR.white },
  Hatshepsut: { female: true, beard: 'none' },
  'Cyrus the Great': { head: 'crown', beard: 'long' },
  'Karim Khan Zand': { head: 'turban' },
  'Kasym Khan': { beard: 'goatee' },
  'Shah Jahan': { head: 'turban', beard: 'full' },
  'Chandragupta Maurya': { head: 'crown', beard: 'none' },
  Ashoka: { head: 'crown' },
  'Qin Shi Huang': { beard: 'mustache' },
  'Gwanggaeto the Great': { head: 'crown', hairStyle: 'topknot' },
  'Taejo of Goryeo': { head: 'crown' },
  'Oda Nobunaga': { head: 'kabuto' },
  'Prince Shōtoku': { beard: 'goatee' },
  'Hamengkubuwono I': { beard: 'none' },
  'Queen Amina': { female: true, beard: 'none', head: 'wrap', hairStyle: 'short' },
  'Idris Alooma': { head: 'turban', beard: 'full' },
  'Benito Juárez': { head: 'none', hairStyle: 'short', beard: 'none', suit: true, robe: '#222' },
  'James K. Polk': { hairStyle: 'short', hair: HAIR.grey },
  'Thomas Jefferson': { hair: HAIR.red },
  'Deodoro da Fonseca': { head: 'kepi', beard: 'full', hair: HAIR.white, robe: '#2c3e5c' },
  'Pedro II': { beard: 'long', hair: HAIR.blond },
};

const hash = (t: string): number => { let h = 2166136261; for (const c of t) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

/** Внешность правителя: облик нации + особенности правителя + мелкие отличия по имени. */
const lookOf = (nation: NationId, ruler: string): Look => {
  const l = { ...NATION_LOOK[nation], ...(RULER_LOOK[ruler] ?? {}) };
  if (l.female && l.beard !== 'none') l.beard = 'none';
  return l;
};

const g = (body: string, attrs = '') => `<g ${attrs}>${body}</g>`;

const backHair = (l: Look): string => {
  if (l.hairStyle === 'long') return `<path d="M19 28Q18 13 32 13Q46 13 45 28L46.5 47Q32 51 17.5 47Z" fill="${l.hair}"/>`;
  if (l.hairStyle === 'wig') return `<g fill="${l.hair}" stroke="rgba(0,0,0,.18)" stroke-width=".5">${[24, 29, 34, 39].map((y) => `<circle cx="19.5" cy="${y}" r="3.4"/><circle cx="44.5" cy="${y}" r="3.4"/>`).join('')}</g>`;
  return '';
};

const frontHair = (l: Look): string => {
  if (l.hairStyle === 'bald') return `<path d="M30 17Q27 14 29 11" stroke="${l.hair}" stroke-width="2" fill="none" stroke-linecap="round"/>`; // казацкий оселедец/прядь
  if (l.hairStyle === 'topknot') return `<path d="M21 28Q20 15 32 15Q44 15 43 28Q41 20 32 19.5Q23 20 21 28Z" fill="${l.hair}"/><circle cx="32" cy="12.5" r="3.2" fill="${l.hair}"/>`;
  if (l.hairStyle === 'wig') return `<path d="M20.5 28Q19.5 14 32 14Q44.5 14 43.5 28Q41 19 32 19Q23 19 20.5 28Z" fill="${l.hair}"/>`;
  return `<path d="M21 29Q20 15 32 15Q44 15 43 29Q41.5 20.5 32 20Q22.5 20.5 21 29Z" fill="${l.hair}"/>`;
};

const beard = (l: Look): string => {
  const c = l.hair === HAIR.white || l.hair === HAIR.grey ? l.hair : l.hair;
  switch (l.beard) {
    case 'full': return `<path d="M21.5 32Q22 46 32 48.5Q42 46 42.5 32Q40 41 32 41.5Q24 41 21.5 32Z" fill="${c}"/><path d="M27.5 37.4Q32 35.2 36.5 37.4Q32 36.9 27.5 37.4Z" fill="${c}" stroke="${c}" stroke-width="1.2"/>`;
    case 'long': return `<path d="M22 33Q23 52 32 56Q41 52 42 33Q40 42 32 42Q24 42 22 33Z" fill="${c}"/><path d="M27 37.4Q32 35 37 37.4" stroke="${c}" stroke-width="1.6" fill="none"/>`;
    case 'mustache': return `<path d="M26 38.2Q29 35.4 32 36.8Q35 35.4 38 38.2Q35 37.2 32 37.9Q29 37.2 26 38.2Z" fill="${c}" stroke="${c}" stroke-width="1"/>`;
    case 'goatee': return `<path d="M28 37.3Q32 35.6 36 37.3" stroke="${c}" stroke-width="1.3" fill="none"/><path d="M30 41Q32 47 34 41Z" fill="${c}"/>`;
    case 'sideburns': return `<path d="M21.5 27V36Q23 41 27 42Q24 37 24 28Z M42.5 27V36Q41 41 37 42Q40 37 40 28Z" fill="${c}"/><path d="M27.5 37.4Q32 35.4 36.5 37.4" stroke="${c}" stroke-width="1.4" fill="none"/>`;
    default: return '';
  }
};

const GOLD = '#e2b93b', GOLD_D = '#9c7414';

const headwear = (l: Look, h: number): string => {
  const gem = ['#c0392b', '#2e86c1', '#27ae60'][h % 3];
  switch (l.head) {
    case 'crown': return `<path d="M20 22L21.5 9.5L26.5 15.5L32 7.5L37.5 15.5L42.5 9.5L44 22Z" fill="${GOLD}" stroke="${GOLD_D}" stroke-width=".8" stroke-linejoin="round"/>
      <rect x="20" y="19" width="24" height="4" rx="1" fill="${GOLD}" stroke="${GOLD_D}" stroke-width=".8"/><circle cx="32" cy="21" r="1.3" fill="${gem}"/><circle cx="25.5" cy="21" r=".9" fill="${gem}"/><circle cx="38.5" cy="21" r=".9" fill="${gem}"/>`;
    case 'tiara': return `<path d="M23 19.5L25.5 13.5L29 16.5L32 10.5L35 16.5L38.5 13.5L41 19.5Z" fill="${GOLD}" stroke="${GOLD_D}" stroke-width=".7" stroke-linejoin="round"/><circle cx="32" cy="15" r="1.1" fill="${gem}"/>`;
    case 'turban': return `<ellipse cx="32" cy="17" rx="14.5" ry="9" fill="#f4f1ea" stroke="#c9c2b2" stroke-width=".8"/>
      <path d="M19 18Q32 10 45 18M20 21Q32 14 44 21" stroke="#d6cfbf" stroke-width="1" fill="none"/><circle cx="32" cy="16" r="2" fill="${gem}" stroke="${GOLD}" stroke-width=".8"/><path d="M32 14L33 8" stroke="#fff" stroke-width="1.4"/>`;
    case 'nemes': return `<path d="M19 21Q32 6 45 21L49 46H43L42 27H22L21 46H15Z" fill="#e8c35a" stroke="#9c7414" stroke-width=".8"/>
      ${[0, 1, 2, 3, 4].map((i) => `<path d="M${16.5 + i * 0.4} ${30 + i * 3.4}H${21.3}M${42.7} ${30 + i * 3.4}H${47.5 - i * 0.4}" stroke="#1f4e8c" stroke-width="1.6"/>`).join('')}
      <path d="M21 22Q32 13 43 22" stroke="#1f4e8c" stroke-width="2" fill="none"/><path d="M32 12.5Q34.5 14 32 17Q29.5 14 32 12.5Z" fill="${GOLD}" stroke="#9c7414" stroke-width=".6"/>`;
    case 'keffiyeh': return `<path d="M18 25Q32 5 46 25L48.5 50L42 47L41.5 27H22.5L22 47L15.5 50Z" fill="#f6f5f0" stroke="#d2cfc6" stroke-width=".8"/>
      <ellipse cx="32" cy="19.5" rx="13.5" ry="3" fill="none" stroke="#1d1d1d" stroke-width="2.4"/>`;
    case 'fur': return `<path d="M20.5 17Q32 4 43.5 17Z" fill="${l.robe}"/><rect x="19" y="15.5" width="26" height="7" rx="3.5" fill="#4a3424"/>
      <path d="M20 17.5h24M20.5 20.5h23" stroke="#6b4c35" stroke-width=".8" stroke-dasharray="1.2 1"/>`;
    case 'khan': return `<path d="M21 19L32 3L43 19Z" fill="#f4f1ea" stroke="#d2c8b4" stroke-width=".8"/><path d="M32 3V0.5" stroke="${GOLD}" stroke-width="1.4"/>
      <rect x="18.5" y="16.5" width="27" height="6" rx="3" fill="#6b4c35"/><path d="M22 12h20" stroke="${GOLD}" stroke-width="1" stroke-dasharray="1.5 1"/>`;
    case 'kabuto': return `<path d="M17 24Q17 9 32 9Q47 9 47 24H43L42 21H22L21 24Z" fill="#2d2d38" stroke="#111" stroke-width=".8"/>
      <path d="M32 13L23 1M32 13L41 1" stroke="${GOLD}" stroke-width="2" stroke-linecap="round"/><circle cx="32" cy="14" r="2" fill="${GOLD}"/>`;
    case 'eboshi': return `<path d="M24 20Q22 9 30 3Q40 5 40 20Z" fill="#1e1e1e"/><path d="M23 20h18" stroke="#000" stroke-width="1.4"/>`;
    case 'gat': return `<ellipse cx="32" cy="18" rx="19" ry="3.2" fill="rgba(25,25,25,.85)"/><path d="M25 18V9.5Q32 7.5 39 9.5V18Z" fill="rgba(25,25,25,.9)"/><path d="M22 20Q24 40 26 46M42 20Q40 40 38 46" stroke="#5a3a22" stroke-width=".6" fill="none"/>`;
    case 'mianguan': return `<rect x="15" y="7" width="34" height="3.5" rx="1" fill="#1e1e1e"/><path d="M25 10.5V19H39V10.5Z" fill="#1e1e1e"/>
      ${[17, 20, 23, 41, 44, 47].map((x) => `<path d="M${x} 10.5V20" stroke="#c0392b" stroke-width=".6"/><circle cx="${x}" cy="${13 + (x % 3)}" r=".8" fill="#e2b93b"/><circle cx="${x}" cy="${17 + (x % 2)}" r=".8" fill="#2e86c1"/>`).join('')}`;
    case 'wrap': return `<path d="M20 23Q19 11 32 11Q45 11 44 23Q38 18 32 18Q26 18 20 23Z" fill="${l.trim === '#b3261e' ? '#1d1d1d' : l.trim}"/>
      <path d="M21 19Q32 13 43 19M21.5 21.5Q32 16 42.5 21.5" stroke="rgba(0,0,0,.25)" stroke-width=".8" fill="none"/>`;
    case 'feathers': return `${[-60, -38, -18, 0, 18, 38, 60].map((a, i) => `<ellipse cx="32" cy="2" rx="3.4" ry="11" fill="${['#16a085', '#27ae60', '#2e86c1', '#16a085', '#2e86c1', '#27ae60', '#16a085'][i]}" transform="rotate(${a} 32 19)"/>`).join('')}
      <rect x="20" y="17" width="24" height="4.5" rx="1.5" fill="${GOLD}" stroke="${GOLD_D}" stroke-width=".6"/><circle cx="32" cy="19.2" r="1.2" fill="#c0392b"/>`;
    case 'bicorne': return `<path d="M11 20Q32 -2 53 20Q32 13 11 20Z" fill="#141414"/><circle cx="40" cy="12" r="2.2" fill="#2e5fb3" stroke="#fff" stroke-width=".8"/>`;
    case 'pickelhaube': return `<path d="M19 22Q19 10 32 10Q45 10 45 22Z" fill="#141414"/><path d="M32 10V2" stroke="${GOLD}" stroke-width="2.2" stroke-linecap="round"/><path d="M29 14L32 12L35 14L32 19Z" fill="${GOLD}"/><path d="M18 22H46" stroke="#141414" stroke-width="2"/>`;
    case 'fez': return `<path d="M24 20L25.5 9H38.5L40 20Z" fill="#b3261e"/><path d="M38.5 9.5Q42 12 41 18" stroke="#1d1d1d" stroke-width="1" fill="none"/>`;
    case 'laurel': return `${Array.from({ length: 7 }, (_, i) => `<ellipse cx="${21 + i * 1.3}" cy="${25 - i * 2}" rx="1.4" ry="2.8" fill="#4f8a3a" transform="rotate(${-40 + i * 8} ${21 + i * 1.3} ${25 - i * 2})"/><ellipse cx="${43 - i * 1.3}" cy="${25 - i * 2}" rx="1.4" ry="2.8" fill="#4f8a3a" transform="rotate(${40 - i * 8} ${43 - i * 1.3} ${25 - i * 2})"/>`).join('')}`;
    case 'cap': return `<path d="M19.5 22Q18 9 32 9Q46 9 44.5 22Q32 17 19.5 22Z" fill="#a31f2c"/>`;
    case 'tall': return `<path d="M23 21L25 4H39L41 21Z" fill="#2b1d16"/><rect x="21" y="18" width="22" height="4" rx="1" fill="${GOLD}"/><circle cx="32" cy="12" r="2" fill="${gem}" stroke="${GOLD}" stroke-width=".8"/><path d="M32 10L33.5 2" stroke="#fff" stroke-width="1.2"/>`;
    case 'kepi': return `<path d="M21.5 20L23 11H41L42.5 20Z" fill="#2c3e5c"/><path d="M20 20.5H40Q37 23 30 23" fill="#141414"/><path d="M23 13H41" stroke="${GOLD}" stroke-width="1.2"/>`;
    default: return '';
  }
};

/** SVG-портрет правителя. size — сторона квадрата в пикселях. */
export const portraitSvg = (nation: NationId, ruler: string, size = 64): string => {
  const l = lookOf(nation, ruler);
  const h = hash(ruler);
  const eyeY = 29.5 + ((h >> 3) % 3) * 0.4;
  const robe = l.suit
    ? `<path d="M7 64Q9 46 32 45Q55 46 57 64Z" fill="${l.robe}"/><path d="M27 45L32 56L37 45Z" fill="#f4f4f2"/><path d="M29.5 47L32 51L34.5 47Z" fill="#fff" stroke="#ccc" stroke-width=".4"/>`
    : `<path d="M7 64Q9 46 32 45Q55 46 57 64Z" fill="${l.robe}"/><path d="M22 46.5Q32 54 42 46.5" stroke="${l.trim}" stroke-width="2.6" fill="none"/>
       ${l.female ? `<circle cx="32" cy="50" r="1.5" fill="${l.trim}"/>` : `<path d="M14 57Q32 63 50 57" stroke="${l.trim}" stroke-width="1.2" fill="none" opacity=".7"/>`}`;
  const face = `
    <rect x="28" y="38" width="8" height="9" rx="3" fill="${l.skin}"/>
    <ellipse cx="20.6" cy="31" rx="2" ry="3" fill="${l.skin}"/><ellipse cx="43.4" cy="31" rx="2" ry="3" fill="${l.skin}"/>
    <ellipse cx="32" cy="${l.female ? 30.5 : 30}" rx="${l.female ? 10.6 : 11.2}" ry="${l.female ? 12.6 : 13}" fill="${l.skin}"/>
    <path d="M26 ${eyeY - 3.2}Q28 ${eyeY - 4.4} 30 ${eyeY - 3.2}M34 ${eyeY - 3.2}Q36 ${eyeY - 4.4} 38 ${eyeY - 3.2}" stroke="${l.hair === HAIR.white ? '#8d877e' : l.hair}" stroke-width="1.1" fill="none" stroke-linecap="round"/>
    <circle cx="28" cy="${eyeY}" r="1.25" fill="#2a1f18"/><circle cx="36" cy="${eyeY}" r="1.25" fill="#2a1f18"/>
    <path d="M32 ${eyeY + 1.5}L30.8 ${eyeY + 5.6}H33" stroke="rgba(90,50,30,.45)" stroke-width=".9" fill="none" stroke-linejoin="round"/>
    <path d="M29.2 ${eyeY + 8.4}Q32 ${eyeY + 9.6} 34.8 ${eyeY + 8.4}" stroke="${l.female ? '#b0464f' : 'rgba(90,40,30,.7)'}" stroke-width="${l.female ? 1.4 : 1}" fill="none" stroke-linecap="round"/>
    ${l.female ? `<circle cx="25.5" cy="${eyeY + 4.5}" r="1.8" fill="#e58f8f" opacity=".35"/><circle cx="38.5" cy="${eyeY + 4.5}" r="1.8" fill="#e58f8f" opacity=".35"/>` : ''}`;
  const body = g(`<circle cx="32" cy="32" r="32" fill="${l.bg}"/>`)
    + backHair(l) + robe + face + beard(l) + (l.head === 'nemes' || l.head === 'keffiyeh' ? '' : frontHair(l)) + headwear(l, h);
  return `<svg class="portrait" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true"><defs><clipPath id="pc${h}"><circle cx="32" cy="32" r="32"/></clipPath></defs><g clip-path="url(#pc${h})">${body}</g><circle cx="32" cy="32" r="31.4" fill="none" stroke="rgba(0,0,0,.2)" stroke-width="1.2"/></svg>`;
};

/** Все правители — для проверки и галереи. */
export const allRulers = (): { nation: NationId; ruler: string }[] =>
  (Object.keys(NATIONS) as NationId[]).flatMap((n) => Object.values(NATIONS[n].rulers).map((ruler) => ({ nation: n, ruler })));
