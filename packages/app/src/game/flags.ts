// Упрощённые флаги 26 наций — SVG 30×20, нарисованы от руки простыми фигурами (без гербов и надписей).

import { type NationId } from '../../../core/src/index.ts';

const star = (cx: number, cy: number, r: number, fill: string, rot = -90): string => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = ((rot + i * 36) * Math.PI) / 180;
    const rr = i % 2 ? r * 0.4 : r;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`;
};
const h3 = (a: string, b: string, c: string) => `<rect width="30" height="20" fill="${b}"/><rect width="30" height="6.67" fill="${a}"/><rect y="13.33" width="30" height="6.67" fill="${c}"/>`;
const v3 = (a: string, b: string, c: string) => `<rect width="30" height="20" fill="${b}"/><rect width="10" height="20" fill="${a}"/><rect x="20" width="10" height="20" fill="${c}"/>`;
const h2 = (a: string, b: string) => `<rect width="30" height="20" fill="${b}"/><rect width="30" height="10" fill="${a}"/>`;
const crescent = (cx: number, cy: number, r: number, fg: string, bg: string, dx = 1.3) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fg}"/><circle cx="${cx + dx}" cy="${cy}" r="${r * 0.8}" fill="${bg}"/>`;

const usa = (): string => {
  let s = '';
  for (let i = 0; i < 13; i++) s += `<rect y="${(i * 20) / 13}" width="30" height="${20 / 13 + 0.05}" fill="${i % 2 ? '#fff' : '#b22234'}"/>`;
  s += '<rect width="12" height="10.77" fill="#3c3b6e"/>';
  for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) s += `<circle cx="${1.4 + c * 2.3}" cy="${1.4 + r * 2.6}" r="0.45" fill="#fff"/>`;
  return s;
};

const FLAGS: Record<NationId, string> = {
  russia: h3('#fff', '#0039a6', '#d52b1e'),
  ukraine: h2('#0057b7', '#ffd700'),
  poland: h2('#fff', '#dc143c'),
  germany: h3('#000', '#dd0000', '#ffce00'),
  france: v3('#0055a4', '#fff', '#ef4135'),
  britain: `<rect width="30" height="20" fill="#012169"/>
    <path d="M0 0L30 20M30 0L0 20" stroke="#fff" stroke-width="4"/>
    <path d="M0 0L30 20M30 0L0 20" stroke="#c8102e" stroke-width="1.4"/>
    <path d="M15 0V20M0 10H30" stroke="#fff" stroke-width="6"/>
    <path d="M15 0V20M0 10H30" stroke="#c8102e" stroke-width="3.4"/>`,
  spain: `<rect width="30" height="20" fill="#aa151b"/><rect y="5" width="30" height="10" fill="#f1bf00"/>`,
  italy: v3('#009246', '#fff', '#ce2b37'),
  turkey: `<rect width="30" height="20" fill="#e30a17"/>${crescent(11, 10, 5, '#fff', '#e30a17')}${star(17.2, 10, 2.2, '#fff', 0)}`,
  egypt: `${h3('#ce1126', '#fff', '#000')}<circle cx="15" cy="10" r="2.2" fill="#c09300"/>`,
  arabia: `<rect width="30" height="20" fill="#006c35"/><path d="M8 13.5H22" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M9 7.5h12M9 9.5h12" stroke="#fff" stroke-width="0.9" stroke-dasharray="1.6 0.8"/>`,
  persia: `${h3('#239f40', '#fff', '#da0000')}<circle cx="15" cy="10" r="2" fill="none" stroke="#da0000" stroke-width="0.9"/>`,
  uzbekistan: `<rect width="30" height="20" fill="#fff"/><rect width="30" height="6.3" fill="#0099b5"/><rect y="13.7" width="30" height="6.3" fill="#1eb53a"/>
    <rect y="6.3" width="30" height="0.6" fill="#ce1126"/><rect y="13.1" width="30" height="0.6" fill="#ce1126"/>${crescent(4.5, 3.2, 2.2, '#fff', '#0099b5', 0.8)}
    ${[0, 1, 2].map((i) => `<circle cx="${8.5 + i * 2}" cy="3.2" r="0.45" fill="#fff"/>`).join('')}`,
  kazakhstan: `<rect width="30" height="20" fill="#00afca"/><circle cx="15" cy="8.5" r="3.2" fill="#fec50c"/>
    <circle cx="15" cy="8.5" r="4.6" fill="none" stroke="#fec50c" stroke-width="0.6" stroke-dasharray="0.8 0.7"/>
    <path d="M9.5 14.5Q15 11.5 20.5 14.5Q15 13.4 9.5 14.5Z" fill="#fec50c"/>`,
  pakistan: `<rect width="30" height="20" fill="#01411c"/><rect width="7.5" height="20" fill="#fff"/>${crescent(18.5, 10, 4.6, '#fff', '#01411c', 1.4)}${star(21, 7.6, 1.6, '#fff', -45)}`,
  india: `${h3('#ff9933', '#fff', '#138808')}<circle cx="15" cy="10" r="2.6" fill="none" stroke="#000080" stroke-width="0.6"/><circle cx="15" cy="10" r="0.6" fill="#000080"/>`,
  bangladesh: `<rect width="30" height="20" fill="#006a4e"/><circle cx="13.5" cy="10" r="6" fill="#f42a41"/>`,
  china: `<rect width="30" height="20" fill="#de2910"/>${star(5, 5, 3, '#ffde00')}${star(10, 2, 1, '#ffde00', -60)}${star(12, 4, 1, '#ffde00', -80)}${star(12, 7, 1, '#ffde00', -100)}${star(10, 9, 1, '#ffde00', -120)}`,
  korea: `<rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="5" fill="#003478"/>
    <path d="M10 10a5 5 0 0 1 10 0a2.5 2.5 0 0 1-5 0a2.5 2.5 0 0 0-5 0z" fill="#c60c30"/>
    <g fill="#000"><rect x="3.5" y="3" width="4" height="0.8" transform="rotate(34 5.5 3.4)"/><rect x="3.5" y="4.4" width="4" height="0.8" transform="rotate(34 5.5 4.8)"/>
    <rect x="22.5" y="15" width="4" height="0.8" transform="rotate(34 24.5 15.4)"/><rect x="22.5" y="16.4" width="4" height="0.8" transform="rotate(34 24.5 16.8)"/>
    <rect x="22.5" y="3" width="4" height="0.8" transform="rotate(-34 24.5 3.4)"/><rect x="3.5" y="15" width="4" height="0.8" transform="rotate(-34 5.5 15.4)"/></g>`,
  japan: '<rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="6" fill="#bc002d"/>',
  vietnam: `<rect width="30" height="20" fill="#da251d"/>${star(15, 10.5, 5.5, '#ffff00')}`,
  indonesia: h2('#ce1126', '#fff'),
  nigeria: v3('#008751', '#fff', '#008751'),
  mexico: `${v3('#006847', '#fff', '#ce1126')}<circle cx="15" cy="10" r="2.4" fill="#8c5a2b"/><path d="M12.8 11.6q2.2 1.6 4.4 0" stroke="#006847" stroke-width="0.7" fill="none"/>`,
  usa: usa(),
  brazil: `<rect width="30" height="20" fill="#009c3b"/><path d="M15 2L28 10L15 18L2 10Z" fill="#ffdf00"/><circle cx="15" cy="10" r="4.6" fill="#002776"/>
    <path d="M10.6 9.2q4.6-1.4 8.8 1.3" stroke="#fff" stroke-width="0.8" fill="none"/>`,
};

/** Флаг нации для HTML. */
export const flagSvg = (id: NationId, width = 30): string =>
  `<svg class="flag" width="${width}" height="${(width * 2) / 3}" viewBox="0 0 30 20" aria-hidden="true"><g>${FLAGS[id]}</g><rect width="30" height="20" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="0.6"/></svg>`;
