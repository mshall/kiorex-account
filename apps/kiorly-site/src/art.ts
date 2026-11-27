/**
 * Inline SVG art: icons, product "screenshots" (illustrative mock-ups, no real data) and diagrams. Pure functions returning strings.
 * Right-to-left: the GRAPHICS of a mock-up are mirrored as a whole and its TEXT is placed mirrored (x flipped, anchor swapped), so Arabic reads naturally and nothing is a mirrored glyph.
 * Colours are the Kiorly palette (indigo and periwinkle chevrons, coral pulse) and the product accents; coral is used for graphics only, never for small text.
 */
import type { Lang } from './config';

const C = { indigo: '#3730A3', peri: '#818CF8', coral: '#E8735E', ocean: '#0369A1', ground: '#F4F6FC', ink: '#1A1D36', muted: '#535B7B', line: '#DDE1EF', white: '#FFFFFF', teal: '#0D9488', violet: '#7C3AED', green: '#16A34A', rose: '#E11D48', amber: '#B45309' };
export const ACCENT: Record<string, string> = { clinic: C.teal, pharmacy: C.green, lab: C.violet, nurse: C.rose, staff: C.indigo, enterprise: C.ocean };
const tint = (hex: string, a: number) => `${hex}${Math.round(a * 255).toString(16).padStart(2, '0')}`;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ───────────────────────── icons (24x24, stroke) ─────────────────────────
const ICONS: Record<string, string> = {
  clinic: '<rect x="3.5" y="4.5" width="17" height="16" rx="3"/><path d="M8 2.5v4M16 2.5v4M3.5 9.5h17M12 12.5v5M9.5 15h5"/>',
  pharmacy: '<rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(-35 12 12)"/><path d="m9.2 9.2 5.6 5.6"/>',
  lab: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/><path d="M7.5 15h9"/>',
  nurse: '<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 10v9.5h13V10"/><path d="M12 12.5v4M10 14.5h4"/>',
  staff: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M10.5 18.5h3M10 6.5h4"/>',
  enterprise: '<rect x="4" y="3.5" width="9" height="17" rx="1.5"/><path d="M13 9.5h5.5a1.5 1.5 0 0 1 1.5 1.5v9.5H13M7.5 7.5h2M7.5 11h2M7.5 14.5h2M16 13h1M16 16.5h1"/>',
  discover: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
  book: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17M8.5 15l2.3 2.3L15.8 13"/>',
  passport: '<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="11" r="2.3"/><path d="M5.8 16c.7-1.7 2-2.4 3.2-2.4s2.5.7 3.2 2.4M14.5 9.5h3.5M14.5 13h3.5"/>',
  pay: '<rect x="3" y="5.5" width="18" height="13" rx="3"/><path d="M3 10h18M7 15h4"/>',
  growth: '<path d="M3.5 18.5 9 12.5l3.5 3.5 7-8"/><path d="M15 8h5v5"/>',
  commission: '<path d="M7 7h12l-3-3M17 17H5l3 3"/><circle cx="8.5" cy="12" r=".8" fill="currentColor"/><circle cx="15.5" cy="12" r=".8" fill="currentColor"/>',
  recon: '<rect x="4.5" y="3.5" width="15" height="17" rx="2.5"/><path d="m8 9 1.5 1.5L12 8M8 15l1.5 1.5L12 14M14.5 9.5H17M14.5 15.5H17"/>',
  orders: '<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="m3.5 7.5 8.5 4.5 8.5-4.5M12 12v9"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2.5"/>',
  roles: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3 20c.6-3.4 3-5 6-5s5.4 1.6 6 5M16.5 5.8a3 3 0 0 1 0 5.4M18 15.3c1.7.6 2.7 2 3 4.2"/>',
  audit: '<path d="M6 3.5h8l4.5 4.5v12.5H6z"/><path d="M14 3.5V8h4.5M9 12.5h6M9 16h6"/>',
  consent: '<path d="M12 3 4.5 6v5.5c0 4.5 3 8 7.5 9.5 4.5-1.5 7.5-5 7.5-9.5V6z"/><path d="m8.8 12.2 2.4 2.4 4-4.4"/>',
  sign: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.700l1-1"/>',
  phi: '<path d="M3.5 12s3.2-6 8.500-6c1.200 0 2.300.3 3.300.8M20.500 12s-3.200 6-8.500 6c-1.200 0-2.300-.3-3.300-.8"/><circle cx="12" cy="12" r="2.800"/><path d="m4 4 16 16"/>',
  check: '<path d="m5 12.500 4.500 4.500L19 7.500"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.600 2.700 3.800 5.700 3.800 9S14.600 18.300 12 21c-2.600-2.700-3.800-5.700-3.800-9S9.400 5.700 12 3z"/>',
  copy: '<rect x="8.500" y="8.500" width="11" height="11" rx="2.500"/><path d="M15.500 8.500v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
};
export const ICON_NAMES = Object.keys(ICONS);
/** Hidden sprite with every icon as a <symbol>; `<use href="#i-name">` anywhere on the page. */
export const sprite = (): string => `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>${ICON_NAMES.map((n) => `<symbol id="i-${n}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[n]}</symbol>`).join('')}</defs></svg>`;
export const icon = (name: string, cls = 'ic'): string => `<svg class="${cls}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;

// ───────────────────────── drawing helpers ─────────────────────────
interface Label { id?: string; x: number; y: number; s: string; size?: number; weight?: number; fill?: string; anchor?: 'start' | 'middle' | 'end' }
const r = (x: number, y: number, w: number, h: number, rx: number, fill: string, stroke?: string, sw = 1) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${sw}"` : ''}/>`;
const circ = (x: number, y: number, rad: number, fill: string, stroke?: string) => `<circle cx="${x}" cy="${y}" r="${rad}" fill="${fill}"${stroke ? ` stroke="${stroke}"` : ''}/>`;
const ln = (x1: number, y1: number, x2: number, y2: number, stroke = C.line, sw = 1, dash = '') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
const skeleton = (x: number, y: number, w: number, fill = C.line, h = 5) => r(x, y, w, h, h / 2, fill);

function frame(w: number, h: number, l: Lang, graphics: string, labels: Label[], alt: string, id: string, cls = 'art'): string {
  const rtl = l === 'ar';
  const g = rtl ? `<g transform="translate(${w},0) scale(-1,1)">${graphics}</g>` : graphics;
  const font = rtl ? "'IBM Plex Sans Arabic','Jost',sans-serif" : "'Jost',sans-serif";
  const tx = labels.map((t) => {
    // SVG text-anchor start/end are relative to the text DIRECTION, so with direction=rtl set explicitly below `start` already means the right edge: mirror x only, never swap the anchor (swapping twice put Arabic labels on top of the node icons).
    const anchor = t.anchor ?? 'start'; const x = rtl ? w - t.x : t.x;
    return `<text${t.id ? ` data-label="${t.id}"` : ''} x="${x}" y="${t.y}" text-anchor="${anchor}" font-size="${t.size ?? 11}" font-weight="${t.weight ?? 500}" fill="${t.fill ?? C.ink}">${t.s.split('\n').map((line, i) => (i === 0 ? esc(line) : `<tspan x="${x}" dy="1.25em">${esc(line)}</tspan>`)).join('')}</text>`;
  }).join('');
  return `<svg class="${cls}" direction="${rtl ? 'rtl' : 'ltr'}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="${id}-t" font-family="${font}" xmlns="http://www.w3.org/2000/svg"><title id="${id}-t">${esc(alt)}</title>${g}${tx}</svg>`;
}
const T = (en: string, ar: string, l: Lang) => (l === 'ar' ? ar : en);
const win = (x: number, y: number, w: number, h: number, side = true) => r(x, y, w, h, 12, C.white, C.line) + r(x, y, w, 24, 12, C.ground, C.line) + r(x, y + 12, w, 12, 0, C.ground) + ln(x, y + 24, x + w, y + 24)
  + circ(x + 14, y + 12, 3.2, '#F2B8AD') + circ(x + 26, y + 12, 3.2, '#F3D79A') + circ(x + 38, y + 12, 3.2, '#B7E3C4') + (side ? r(x, y + 24, 54, h - 24, 0, C.ground) + ln(x + 54, y + 24, x + 54, y + h) : '');
const sideIcons = (x: number, y: number, active: string, n = 5) => Array.from({ length: n }, (_, i) => r(x + 15, y + 40 + i * 30, 24, 20, 6, i === 1 ? active : '#DADFF0')).join('');
const pill = (x: number, y: number, w: number, fill: string, op = 0.16) => r(x, y, w, 16, 8, tint(fill, op)) + r(x + 6, y + 6, 4, 4, 2, fill);

// ───────────────────────── product mock-ups ─────────────────────────
function clinicMock(l: Lang, alt: string, id: string): string {
  const A = C.teal; let g = win(10, 10, 500, 320) + sideIcons(10, 34, A);
  // schedule grid: 3 doctors x 5 hours
  for (let i = 0; i < 5; i++) g += ln(74, 112 + i * 40, 372, 112 + i * 40);
  for (let c = 0; c < 3; c++) g += r(80 + c * 98, 66, 90, 26, 8, C.ground) + circ(94 + c * 98, 79, 7, [A, C.peri, C.ocean][c]!);
  const blocks: Array<[number, number, number, string, number]> = [[0, 0, 1.4, A, 1], [0, 2, 1, C.peri, 0.25], [1, 1, 1.7, A, 0.28], [1, 3.3, 1, C.ocean, 0.25], [2, 0.4, 1, C.coral, 0.25], [2, 2, 1.6, A, 0.28]];
  for (const [c, row, hh, col, o] of blocks) { const x = 80 + c * 98, y = 100 + row * 40; g += r(x, y, 90, hh * 40 - 6, 8, o === 1 ? col : tint(col, o), o === 1 ? undefined : col, 1) + skeleton(x + 8, y + 9, 46, o === 1 ? '#FFFFFFCC' : col, 5) + skeleton(x + 8, y + 20, 30, o === 1 ? '#FFFFFF88' : tint(col, 0.5), 4); }
  // patient panel
  g += r(384, 56, 118, 264, 10, C.white, C.line) + circ(443, 94, 20, tint(A, 0.2)) + circ(443, 88, 7, A) + r(430, 98, 26, 12, 6, A) + skeleton(414, 128, 58, C.line, 6) + skeleton(424, 142, 38, C.line, 5)
    + pill(400, 164, 86, A) + skeleton(396, 200, 90, C.line) + skeleton(396, 214, 70, C.line) + skeleton(396, 228, 80, C.line) + r(396, 262, 94, 30, 8, A) + circ(443, 277, 0, A);
  const L: Label[] = [
    { x: 70, y: 52, s: T('Today', 'اليوم', l), size: 14, weight: 700 }, { x: 128, y: 82, s: T('Dr. A', 'د. أ', l), size: 10, anchor: 'middle' }, { x: 226, y: 82, s: T('Dr. B', 'د. ب', l), size: 10, anchor: 'middle' }, { x: 324, y: 82, s: T('Dr. C', 'د. ج', l), size: 10, anchor: 'middle' },
    { x: 416, y: 177, s: T('Confirmed', 'مؤكد', l), size: 9.5, weight: 600, fill: '#0F766E' }, { x: 443, y: 281, s: T('Open file', 'فتح الملف', l), size: 11, weight: 700, fill: '#fff', anchor: 'middle' },
  ];
  return frame(520, 340, l, g, L, alt, id);
}
function pharmacyMock(l: Lang, alt: string, id: string): string {
  const A = C.green; let g = win(10, 10, 500, 320) + sideIcons(10, 34, A);
  const stat: Array<[string, string, string]> = [['New', 'جديد', C.ocean], ['Ready', 'جاهز', A], ['On the way', 'في الطريق', C.amber], ['Dispensed', 'تم الصرف', C.muted]];
  stat.forEach(([, , col], i) => { const y = 62 + i * 62; g += r(72, y, 270, 52, 10, C.white, C.line) + circ(96, y + 26, 14, tint(col, 0.16)) + r(90, y + 20, 12, 12, 3, col) + skeleton(120, y + 14, 96, C.ink + '33', 6) + skeleton(120, y + 28, 60, C.line) + pill(262, y + 18, 70, col); });
  g += r(358, 62, 144, 130, 10, C.white, C.line) + [0, 1, 2, 3].map((i) => r(374 + i * 30, 160 - [70, 48, 86, 30][i]!, 18, [70, 48, 86, 30][i]!, 5, i === 3 ? C.coral : tint(A, 0.55 + i * 0.1))).join('')
    + r(358, 204, 144, 116, 10, tint(A, 0.1), tint(A, 0.4)) + circ(386, 232, 12, A) + `<path d="m380.500 232 4 4 7.500-8" fill="none" stroke="#fff" stroke-width="2.600" stroke-linecap="round" stroke-linejoin="round"/>` + skeleton(406, 226, 80, tint(A, 0.5), 6) + skeleton(374, 262, 112, tint(A, 0.35)) + skeleton(374, 276, 90, tint(A, 0.35)) + skeleton(374, 290, 100, tint(A, 0.35));
  const L: Label[] = ([{ x: 72, y: 52, s: T('Orders', 'الطلبات', l), size: 14, weight: 700 }, { x: 372, y: 80, s: T('Stock', 'المخزون', l), size: 10, fill: C.muted, weight: 600 }, { x: 410, y: 236, s: T('Rx verified', 'وصفة موثقة', l), size: 10.5, weight: 700, fill: '#166534' }] as Label[])
    .concat(stat.map(([en, ar, col], i) => ({ x: 302, y: 62 + i * 62 + 29, s: T(en, ar, l), size: 8.5, weight: 600, fill: col === C.muted ? '#535B7B' : col === C.amber ? C.amber : col === C.green ? '#15803D' : col, anchor: 'middle' as const })));
  return frame(520, 340, l, g, L, alt, id);
}
function labMock(l: Lang, alt: string, id: string): string {
  const A = C.violet; let g = win(10, 10, 500, 320) + sideIcons(10, 34, A);
  g += r(72, 62, 270, 24, 8, C.ground);
  const rows: Array<[string, string, string, string]> = [['Received', 'استلام', C.ocean, '#'], ['In progress', 'قيد التحليل', C.amber, ''], ['Ready', 'جاهز', C.green, ''], ['In progress', 'قيد التحليل', C.amber, ''], ['Ready', 'جاهز', C.green, '']];
  rows.forEach(([, , col], i) => { const y = 96 + i * 44; g += ln(72, y + 40, 342, y + 40) + circ(86, y + 16, 8, tint(A, 0.18)) + r(82, y + 12, 8, 8, 2, A) + skeleton(104, y + 9, 70, C.ink + '33', 6) + skeleton(104, y + 22, 44, C.line) + pill(268, y + 8, 70, col); });
  g += r(358, 62, 144, 128, 10, C.white, C.line) + `<path d="M386 160 a44 44 0 0 1 88 0" fill="none" stroke="${C.line}" stroke-width="10" stroke-linecap="round"/><path d="M386 160 a44 44 0 0 1 70 -35" fill="none" stroke="${A}" stroke-width="10" stroke-linecap="round"/>` + circ(430, 160, 5, A)
    + r(358, 204, 144, 116, 10, C.white, C.line) + `<polyline points="372,296 396,270 418,284 444,246 468,262 490,230" fill="none" stroke="${A}" stroke-width="2.600" stroke-linejoin="round" stroke-linecap="round"/><polyline points="372,300 400,290 430,296 460,282 490,286" fill="none" stroke="${C.coral}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  const L: Label[] = ([{ x: 72, y: 52, s: T('Requests', 'الطلبات', l), size: 14, weight: 700 }, { x: 82, y: 78, s: T('Sample', 'العينة', l), size: 9, fill: C.muted, weight: 600 }, { x: 302, y: 78, s: T('Status', 'الحالة', l), size: 9, fill: C.muted, weight: 600, anchor: 'middle' },
    { x: 430, y: 150, s: T('Result', 'النتيجة', l), size: 10, weight: 700, fill: '#6D28D9', anchor: 'middle' }, { x: 372, y: 224, s: T('Trend', 'الاتجاه', l), size: 10, fill: C.muted, weight: 600 }] as Label[])
    .concat(rows.map(([en, ar, col], i) => ({ x: 303, y: 96 + i * 44 + 20, s: T(en, ar, l), size: 8.5, weight: 600, fill: col === C.amber ? C.amber : col === C.green ? '#15803D' : col, anchor: 'middle' as const })));
  return frame(520, 340, l, g, L, alt, id);
}
function nurseMock(l: Lang, alt: string, id: string): string {
  const A = C.rose; let g = win(10, 10, 500, 320, false) + r(22, 44, 476, 276, 0, '#F3F5FB');
  for (let i = 0; i < 7; i++) g += ln(22, 70 + i * 36, 498, 70 + i * 36, '#E3E7F4', 1) ; for (let i = 0; i < 9; i++) g += ln(60 + i * 52, 44, 60 + i * 52, 320, '#E3E7F4', 1);
  g += r(80, 90, 90, 56, 8, '#DDEBDD') + r(300, 66, 110, 50, 8, '#DCE8F4') + r(220, 200, 120, 60, 8, '#DDEBDD') + r(60, 210, 80, 50, 8, '#E9E5F6');
  g += `<path d="M96 270 C150 270 150 210 210 205 S 300 170 330 140 S 400 120 424 88" fill="none" stroke="${A}" stroke-width="4" stroke-dasharray="2 9" stroke-linecap="round"/>` + circ(96, 270, 9, C.white, A) + circ(96, 270, 4, A) + circ(424, 88, 12, A) + circ(424, 88, 4.500, '#fff');
  g += r(40, 52, 150, 44, 10, C.white, C.line) + circ(62, 74, 12, tint(A, 0.16)) + `<path d="M62 68v12M56 74h12" stroke="${A}" stroke-width="2.600" stroke-linecap="round"/>` + skeleton(82, 66, 80, C.ink + '33', 6) + skeleton(82, 80, 52, C.line)
    + r(270, 246, 212, 62, 12, C.white, C.line) + circ(296, 277, 15, tint(C.green, 0.18)) + `<path d="m288.500 277 5.500 5.500 10-11" fill="none" stroke="${C.green}" stroke-width="2.800" stroke-linecap="round" stroke-linejoin="round"/>` + skeleton(322, 262, 120, C.ink + '33', 6) + skeleton(322, 276, 86, C.line) + pill(322, 288, 76, C.green);
  const L: Label[] = [{ x: 82, y: 79, s: T('Home visit', 'زيارة منزلية', l), size: 9.5, weight: 700 }, { x: 340, y: 266, s: T('14:30  Visit', '14:30  الزيارة', l), size: 10.5, weight: 700 }, { x: 358, y: 301, s: T('Arrived', 'تم الوصول', l), size: 8.5, weight: 700, fill: '#166534' }];
  return frame(520, 340, l, g, L, alt, id);
}
function staffMock(l: Lang, alt: string, id: string): string {
  const A = C.indigo; const phone = (x: number, inner: string) => r(x, 14, 150, 312, 24, C.ink) + r(x + 6, 20, 138, 300, 19, C.white) + r(x + 52, 26, 46, 8, 4, C.ink) + inner;
  let g = r(0, 0, 520, 340, 0, 'none');
  g += phone(100, r(112, 46, 126, 30, 10, A) + circ(128, 61, 6, C.peri) + skeleton(142, 54, 70, '#FFFFFFCC', 6) + skeleton(142, 66, 44, '#FFFFFF77', 5) + [0, 1, 2, 3].map((i) => r(112, 90 + i * 46, 126, 38, 10, C.ground) + circ(128, 109 + i * 46, 8, tint([C.teal, C.green, C.violet, C.rose][i]!, 0.25)) + circ(128, 109 + i * 46, 3.500, [C.teal, C.green, C.violet, C.rose][i]!) + skeleton(144, 100 + i * 46, 70, C.ink + '33', 5) + skeleton(144, 112 + i * 46, 44, C.line, 4)).join('') + r(112, 288, 126, 22, 11, C.ground) + [0, 1, 2, 3].map((i) => circ(132 + i * 28, 299, 5, i === 0 ? A : '#C9CEE4')).join(''));
  g += phone(270, r(282, 46, 126, 60, 12, tint(C.coral, 0.16), C.coral) + r(290, 56, 8, 40, 4, C.coral) + skeleton(306, 58, 90, C.ink + '55', 6) + skeleton(306, 72, 70, C.ink + '22', 5) + r(306, 86, 52, 14, 7, A) + [0, 1, 2].map((i) => r(282, 118 + i * 52, 126, 44, 10, C.ground) + skeleton(294, 130 + i * 52, 78, C.ink + '33', 5) + skeleton(294, 143 + i * 52, 50, C.line, 4) + r(366, 131 + i * 52, 32, 16, 8, tint(C.peri, 0.3))).join(''));
  const L: Label[] = [{ x: 142, y: 65, s: T('Today', 'اليوم', l), size: 10.5, weight: 700, fill: '#fff' }, { x: 340, y: 98, s: T('View', 'عرض', l), size: 9, weight: 700, fill: '#fff', anchor: 'middle' }];
  return frame(520, 340, l, g, L, alt, id);
}
function enterpriseMock(l: Lang, alt: string, id: string): string {
  const A = C.ocean; let g = win(10, 10, 500, 320, false);
  g += r(200, 56, 120, 38, 10, A) + skeleton(214, 69, 60, '#FFFFFFCC', 6) + skeleton(214, 80, 40, '#FFFFFF77', 5) + ln(260, 94, 260, 116, C.line, 2) + ln(110, 116, 410, 116, C.line, 2) + [110, 260, 410].map((x) => ln(x, 116, x, 132, C.line, 2)).join('');
  [110, 260, 410].forEach((x, i) => { g += r(x - 62, 132, 124, 96, 10, C.white, C.line) + circ(x - 40, 154, 9, tint([C.teal, C.violet, C.green][i]!, 0.2)) + skeleton(x - 24, 150, 60, C.ink + '33', 6) + [0, 1, 2, 3].map((k) => r(x - 46 + k * 28, 214 - [30, 46, 22, 38][(k + i) % 4]!, 16, [30, 46, 22, 38][(k + i) % 4]!, 4, tint(A, 0.4 + k * 0.1))).join(''); });
  g += r(40, 246, 420, 62, 10, C.ground) + [0, 1, 2, 3].map((i) => circ(66 + i * 20, 277, 9, [C.teal, C.peri, C.ocean, C.coral][i]!)).join('') + skeleton(160, 262, 180, C.ink + '33', 6) + skeleton(160, 276, 130, C.line) + skeleton(160, 288, 154, C.line) + r(380, 262, 64, 30, 8, A);
  const L: Label[] = [{ x: 260, y: 78, s: T('Organisation', 'المؤسسة', l), size: 10.5, weight: 700, fill: '#fff', anchor: 'middle' }, { x: 110, y: 160, s: T('Branch 1', 'الفرع 1', l), size: 9.5, weight: 700, anchor: 'start' }, { x: 260, y: 160, s: T('Branch 2', 'الفرع 2', l), size: 9.5, weight: 700 }, { x: 410, y: 160, s: T('Branch 3', 'الفرع 3', l), size: 9.5, weight: 700 }, { x: 412, y: 281, s: T('Invite', 'دعوة', l), size: 10, weight: 700, fill: '#fff', anchor: 'middle' }];
  L[1]!.x = 76; L[2]!.x = 226; L[3]!.x = 376;
  return frame(520, 340, l, g, L, alt, id);
}
export const mockup = (idKey: string, l: Lang, alt: string): string => ({ clinic: clinicMock, pharmacy: pharmacyMock, lab: labMock, nurse: nurseMock, staff: staffMock, enterprise: enterpriseMock } as Record<string, typeof clinicMock>)[idKey]!(l, alt, `m-${idKey}`);

// ───────────────────────── hero and connection diagram ─────────────────────────
export function heroArt(l: Lang, alt: string): string {
  const A = C.teal; let g = '';
  g += `<defs><linearGradient id="hg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.indigo}" stop-opacity=".14"/><stop offset="1" stop-color="${C.ocean}" stop-opacity=".06"/></linearGradient></defs>` + circ(330, 250, 220, 'url(#hg)') + circ(330, 250, 150, tint(C.peri, 0.08));
  g += `<g class="float-a">${win(30, 70, 420, 280)}${sideIcons(30, 54, A, 4)}`;
  for (let i = 0; i < 4; i++) g += ln(100, 148 + i * 40, 436, 148 + i * 40);
  for (let c = 0; c < 3; c++) g += r(104 + c * 112, 108, 100, 24, 8, C.ground) + circ(118 + c * 112, 120, 6, [A, C.peri, C.ocean][c]!);
  ([[0, 0, 1.5, A, 1], [0, 2.1, 1, C.peri, 0.25], [1, 0.9, 1.6, A, 0.28], [1, 2.8, 0.9, C.ocean, 0.25], [2, 0.3, 1, C.coral, 0.25], [2, 1.7, 1.7, A, 0.28]] as Array<[number, number, number, string, number]>).forEach(([c, row, hh, col, o]) => {
    const x = 104 + c * 112, y = 140 + row * 38; g += r(x, y, 100, hh * 38 - 6, 8, o === 1 ? col : tint(col, o), o === 1 ? undefined : col) + skeleton(x + 8, y + 9, 52, o === 1 ? '#FFFFFFCC' : col, 5) + skeleton(x + 8, y + 20, 34, o === 1 ? '#FFFFFF88' : tint(col, 0.5), 4);
  });
  g += '</g>';
  g += `<g class="float-b">${r(396, 150, 176, 300, 26, C.ink)}${r(403, 157, 162, 286, 21, C.white)}${r(455, 163, 58, 9, 4.5, C.ink)}${r(414, 184, 140, 34, 11, C.indigo)}${circ(432, 201, 7, C.peri)}${skeleton(447, 194, 80, '#FFFFFFCC', 6)}${skeleton(447, 207, 52, '#FFFFFF77', 5)}`
    + [0, 1, 2, 3].map((i) => r(414, 230 + i * 48, 140, 40, 11, C.ground) + circ(432, 250 + i * 48, 9, tint([C.teal, C.green, C.violet, C.rose][i]!, 0.25)) + circ(432, 250 + i * 48, 4, [C.teal, C.green, C.violet, C.rose][i]!) + skeleton(448, 242 + i * 48, 78, C.ink + '33', 5) + skeleton(448, 255 + i * 48, 50, C.line, 4)).join('') + '</g>';
  const chip = (x: number, y: number, col: string, cls: string) => `<g class="${cls}">${r(x, y, 190, 50, 14, C.white, C.line)}${r(x + 10, y + 11, 28, 28, 9, tint(col, 0.16))}<path d="m${x + 18} ${y + 25} 5 5 9-10" fill="none" stroke="${col}" stroke-width="2.600" stroke-linecap="round" stroke-linejoin="round"/>${skeleton(x + 48, y + 15, 100, C.ink + '2A', 6)}${skeleton(x + 48, y + 28, 70, C.line, 5)}</g>`;
  g += chip(0, 20, C.ocean, 'float-c') + chip(330, 38, C.violet, 'float-d') + chip(10, 388, C.green, 'float-e');
  g += `<path class="pulse-line" d="M24 470 H150 L162 458 L174 484 L186 440 L198 480 L208 470 H330" fill="none" stroke="${C.coral}" stroke-width="3.500" stroke-linecap="round" stroke-linejoin="round"/>`;
  const L: Label[] = [{ x: 40, y: 98, s: T('Kiorly Clinic', 'كيورلي كلينيك', l), size: 11, weight: 700, fill: '#0F766E' }, { x: 48, y: 49, s: T('New booking', 'حجز جديد', l), size: 11, weight: 700 }, { x: 378, y: 67, s: T('Lab result ready', 'نتيجة جاهزة', l), size: 11, weight: 700 }, { x: 58, y: 417, s: T('Pharmacy order', 'طلب صيدلية', l), size: 11, weight: 700 }];
  return frame(600, 500, l, g, L, alt, 'hero');
}

/** Both diagrams are in the page; CSS shows the portrait one on phones (the wide one would render its text at about 4px). */
export const connectionDiagram = (l: Lang, alt: string): string => connectionWide(l, alt) + connectionTall(l, alt);

function connectionTall(l: Lang, alt: string): string {
  const W = 360, H = 492; let g = r(0, 0, W, H, 18, C.ground);
  const node = (id: string, x: number, y: number, w: number, h: number, col: string) => `<g data-node="${id}">${r(x, y, w, h, 16, C.white, col, 2)}${r(x, y, w, 8, 4, col)}</g>`;
  g += node('patient', 40, 8, 280, 84, C.ocean) + node('kiorex', 40, 164, 280, 100, C.indigo);
  g += circ(86, 52, 22, tint(C.ocean, 0.16)) + circ(86, 46, 8, C.ocean) + r(72, 56, 28, 14, 7, C.ocean) + skeleton(220, 46, 70, C.line, 6) + skeleton(236, 60, 40, C.line, 5);
  g += `<g fill="none" stroke="${C.indigo}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="152,206 136,224 152,242"/><polyline points="208,206 224,224 208,242" stroke="${C.peri}"/></g><path d="M130 224 H160 L164 220 L168 230 L173 214 L178 228 L181 224 H230" fill="none" stroke="${C.coral}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
  const cols: Array<[string, number, string]> = [['clinic', 10, C.teal], ['pharmacy', 126, C.green], ['lab', 242, C.violet]];
  cols.forEach(([id, x, col]) => { g += node(id, x, 328, 108, 84, col) + `<g data-dot="${id}">${circ(x + 54, 355, 12, tint(col, 0.18))}${circ(x + 54, 355, 5, col)}</g>`; });
  const arrow = (id: string, x1: number, y1: number, x2: number, y2: number, col: string, dash = '') => `<g data-arrow="${id}">` + ln(x1, y1, x2, y2, col, 2.600, dash) + `<path d="M${x2} ${y2} l-8 -5 v10 z" fill="${col}" transform="rotate(${(Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI} ${x2} ${y2})"/></g>`;
  g += arrow('search', 64, 94, 64, 162, C.ocean) + arrow('confirm', 296, 162, 296, 94, C.ocean, '6 6');
  g += arrow('to-clinic', 50, 266, 50, 326, C.teal) + arrow('to-pharmacy', 166, 266, 166, 326, C.green) + arrow('to-lab', 282, 266, 282, 326, C.violet) + arrow('com-clinic', 70, 326, 70, 268, C.coral, '6 6') + arrow('com-pharmacy', 186, 326, 186, 268, C.coral, '6 6');
  g += ln(30, 432, 330, 432, tint(C.coral, 0.5), 2, '2 7');
  const L: Label[] = [
    { id: 'patient', x: 110, y: 56, s: T('Patient', 'المريض', l), size: 15, weight: 700 }, { id: 'kiorex', x: 180, y: 192, s: T('Kiorex', 'كيوريكس', l), size: 15, weight: 700, fill: C.indigo, anchor: 'middle' }, { id: 'market', x: 180, y: 256, s: T('marketplace', 'السوق', l), size: 12, fill: C.muted, anchor: 'middle' },
    { id: 'search', x: 76, y: 132, s: T('search and book', 'بحث وحجز', l), size: 12, weight: 600, fill: '#075985' }, { id: 'confirm', x: 284, y: 132, s: T('confirmation', 'تأكيد', l), size: 12, weight: 600, fill: '#075985', anchor: 'end' },
    { id: 'clinic', x: 64, y: 388, s: T('Kiorly\nClinic', 'كيورلي\nكلينيك', l), size: 12.500, weight: 700, fill: '#0F766E', anchor: 'middle' }, { id: 'pharmacy', x: 180, y: 388, s: T('Kiorly\nPharmacy', 'كيورلي\nفارماسي', l), size: 12.500, weight: 700, fill: '#15803D', anchor: 'middle' }, { id: 'lab', x: 296, y: 388, s: T('Kiorly\nLab', 'كيورلي\nلاب', l), size: 12.500, weight: 700, fill: '#6D28D9', anchor: 'middle' },
    { id: 'commission', x: 180, y: 454, s: T('Commission and settlement:\nthe same numbers, visible to both sides', 'العمولة والتسوية:\nالأرقام نفسها ظاهرة للطرفين', l), size: 12.500, weight: 700, fill: '#8F4944', anchor: 'middle' },
  ];
  return frame(W, H, l, g, L, alt, 'conn-m', 'art art-tall');
}

function connectionWide(l: Lang, alt: string): string {
  const W = 800, H = 330; let g = r(0, 0, W, H, 18, C.ground);
  const node = (id: string, x: number, y: number, w: number, h: number, col: string) => `<g data-node="${id}">${r(x, y, w, h, 16, C.white, col, 2)}${r(x, y, w, 8, 4, col)}</g>`;
  g += node('patient', 24, 96, 168, 138, C.ocean) + node('kiorex', 316, 62, 168, 206, C.indigo) + node('clinic', 608, 40, 168, 70, C.teal) + node('pharmacy', 608, 130, 168, 70, C.green) + node('lab', 608, 220, 168, 70, C.violet);
  g += circ(108, 150, 22, tint(C.ocean, 0.16)) + circ(108, 144, 8, C.ocean) + r(94, 154, 28, 14, 7, C.ocean) + skeleton(60, 190, 96, C.line, 6) + skeleton(76, 204, 64, C.line, 5);
  g += `<g fill="none" stroke="${C.indigo}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><polyline points="372,112 346,138 372,164"/><polyline points="428,112 454,138 428,164" stroke="${C.peri}"/></g><path d="M338 138 H362 L367 133 L372 146 L378 126 L384 142 L388 138 H462" fill="none" stroke="${C.coral}" stroke-width="2.200" stroke-linecap="round" stroke-linejoin="round"/>` + skeleton(350, 210, 100, C.line, 6) + skeleton(366, 226, 68, C.line, 5);
  [['clinic', 608, 40, C.teal], ['pharmacy', 608, 130, C.green], ['lab', 608, 220, C.violet]].forEach(([id, x, y, col]) => { g += `<g data-dot="${id}">${circ((x as number) + 28, (y as number) + 38, 14, tint(col as string, 0.18))}${circ((x as number) + 28, (y as number) + 38, 5, col as string)}</g>` + skeleton((x as number) + 54, (y as number) + 48, 90, C.line, 5); });
  const arrow = (id: string, x1: number, y1: number, x2: number, y2: number, col: string, dash = '') => `<g data-arrow="${id}">` + ln(x1, y1, x2, y2, col, 2.600, dash) + `<path d="M${x2} ${y2} l-8 -5 v10 z" fill="${col}" transform="rotate(${(Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI} ${x2} ${y2})"/></g>`;
  g += arrow('search', 196, 126, 312, 126, C.ocean) + arrow('confirm', 312, 206, 196, 206, C.ocean, '6 6') + arrow('to-clinic', 488, 100, 604, 75, C.teal) + arrow('to-pharmacy', 488, 166, 604, 166, C.green) + arrow('to-lab', 488, 232, 604, 255, C.violet) + arrow('com-clinic', 604, 95, 488, 120, C.coral, '6 6') + arrow('com-pharmacy', 604, 185, 488, 190, C.coral, '6 6');
  const L: Label[] = [
    { id: 'patient', x: 108, y: 118, s: T('Patient', 'المريض', l), size: 12, weight: 700, anchor: 'middle' }, { id: 'kiorex', x: 400, y: 86, s: T('Kiorex', 'كيوريكس', l), size: 14, weight: 700, fill: C.indigo, anchor: 'middle' }, { id: 'market', x: 400, y: 190, s: T('marketplace', 'السوق', l), size: 10.500, fill: C.muted, anchor: 'middle' },
    { id: 'search', x: 254, y: 118, s: T('search and book', 'بحث وحجز', l), size: 10, weight: 600, fill: '#075985', anchor: 'middle' }, { id: 'confirm', x: 254, y: 198, s: T('confirmation', 'تأكيد', l), size: 10, weight: 600, fill: '#075985', anchor: 'middle' },
    { id: 'clinic', x: 662, y: 82, s: T('Kiorly Clinic', 'كيورلي كلينيك', l), size: 11.5, weight: 700, fill: '#0F766E' }, { id: 'pharmacy', x: 662, y: 172, s: T('Kiorly Pharmacy', 'كيورلي فارماسي', l), size: 11.5, weight: 700, fill: '#15803D' }, { id: 'lab', x: 662, y: 262, s: T('Kiorly Lab', 'كيورلي لاب', l), size: 11.5, weight: 700, fill: '#6D28D9' },
    { id: 'commission', x: 400, y: 304, s: T('Commission and settlement: the same numbers, visible to both sides', 'العمولة والتسوية: الأرقام نفسها ظاهرة للطرفين', l), size: 11.500, weight: 700, fill: '#8F4944', anchor: 'middle' },
  ];
  g += ln(60, 290, 740, 290, tint(C.coral, 0.5), 2, '2 7');
  return frame(W, H, l, g, L, alt, 'conn', 'art art-wide');
}

/** Decorative coral pulse used as a section divider (graphics only). */
export const pulseDivider = (): string => `<svg class="pulse" viewBox="0 0 240 28" aria-hidden="true" focusable="false"><path d="M0 14 H92 L100 8 L108 20 L116 3 L124 18 L130 14 H240" fill="none" stroke="${C.coral}" stroke-width="2.200" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
