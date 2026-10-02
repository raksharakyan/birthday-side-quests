import { svg } from './dom';

/*
 * Inline SVG icon set (24px grid, 1.5 stroke, round caps), ported from docs/design/prototype.html.
 * Everything is static markup built with createElementNS via svg(); never pass data in here.
 * Colours come from CSS (`.icon` uses currentColor), so no inline styles are needed under the CSP.
 */

type Shape = readonly [tag: 'path' | 'circle' | 'rect', attrs: Record<string, string>];

const P = (d: string): Shape => ['path', { d }];
const C = (cx: string, cy: string, r: string): Shape => ['circle', { cx, cy, r }];
const R = (x: string, y: string, width: string, height: string, rx: string): Shape => ['rect', { x, y, width, height, rx }];

const SHAPES = {
  pin: [P('M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z'), C('12', '10', '2.3')],
  calendar: [R('4', '5.5', '16', '14.5', '3'), P('M8 3.5v4M16 3.5v4M4 10h16')],
  radius: [C('12', '12', '8'), C('12', '12', '1.4'), P('M12 12l5.2-3')],
  search: [C('11', '11', '6.2'), P('M15.6 15.6L20 20')],
  arrow: [P('M8 16L16 8M9.5 8H16v6.5')],
  check: [P('M5.5 12.5l4 4 9-9')],
  lock: [R('5', '10.5', '14', '9.5', '2.6'), P('M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5')],
  alert: [P('M12 4.5l8.5 15h-17z'), P('M12 10v4M12 16.8v.1')],
  clock: [C('12', '12', '8'), P('M12 8v4.3l2.8 1.7')],
  bag: [P('M5.5 8.5h13l-1 11.5h-11z'), P('M9 8.5V7a3 3 0 0 1 6 0v1.5')],
  gift: [
    R('4.5', '9', '15', '11', '1.8'),
    P('M3.5 9h17M12 9v11M12 9c-1.5-3.5-5.5-4-5.5-1.5S10 9 12 9zM12 9c1.5-3.5 5.5-4 5.5-1.5S14 9 12 9z'),
  ],
  qr: [R('4', '4', '6', '6', '1.2'), R('14', '4', '6', '6', '1.2'), R('4', '14', '6', '6', '1.2'), P('M14 14h2.5v2.5H14zM18 18h2M20 14v2M14 20h2')],
  sparkle: [P('M12 3.5c.6 4.2 2.3 5.9 6.5 6.5-4.2.6-5.9 2.3-6.5 6.5-.6-4.2-2.3-5.9-6.5-6.5 4.2-.6 5.9-2.3 6.5-6.5z')],
  plus: [P('M12 6v12M6 12h12')],
  minus: [P('M6 12h12')],
  locate: [C('12', '12', '5.5'), P('M12 3v3M12 18v3M3 12h3M18 12h3')],
  close: [P('M7 7l10 10M17 7L7 17')],
  chevron: [P('M7.5 10l4.5 4.5 4.5-4.5')],
  globe: [C('12', '12', '8'), P('M4 12h16M12 4c2.4 2.4 3.4 5 3.4 8s-1 5.6-3.4 8c-2.4-2.4-3.4-5-3.4-8s1-5.6 3.4-8z')],
  refresh: [P('M19 12a7 7 0 1 1-2.1-5'), P('M17.5 3.8v3.6h-3.6')],
  tag: [P('M4 12.6V5.5A1.5 1.5 0 0 1 5.5 4h7.1l7.4 7.4a1.5 1.5 0 0 1 0 2.1l-6.5 6.5a1.5 1.5 0 0 1-2.1 0z'), C('8.5', '8.5', '1.4')],
  receipt: [P('M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z'), P('M9 8.5h6M9 12h6M9 15.5h3.5')],
  filter: [P('M4 6.5h16M7 12h10M10 17.5h4')],
  id: [R('3.5', '6', '17', '12', '2.4'), C('9', '11.5', '2'), P('M6 15.5c.6-1.4 1.7-2 3-2s2.4.6 3 2M14.5 10.5h3M14.5 13.5h3')],
} as const satisfies Record<string, readonly Shape[]>;

export type IconName = keyof typeof SHAPES;

/** Decorative 24px icon (aria-hidden). `extra` adds classes, e.g. "icon--chev". */
export function icon(name: IconName, extra = ''): SVGElement {
  return svg(
    'svg',
    { viewBox: '0 0 24 24', class: extra ? `icon ${extra}` : 'icon', 'aria-hidden': 'true', focusable: 'false' },
    SHAPES[name].map(([tag, attrs]) => svg(tag, { ...attrs })),
  );
}

const FLAME = 'M20 5c2.4 2.8 3.3 4.7 3.3 6.3a3.3 3.3 0 0 1-6.6 0c0-1.6.9-3.5 3.3-6.3z';

/**
 * Line-art candle logo (40x40). The flame is a dashed outline until something is claimed;
 * `body.is-lit` fills it with the accent, adds a glow and a slow flicker (CSS).
 */
export function candleMark(className = 'mark'): SVGElement {
  return svg('svg', { viewBox: '0 0 40 40', class: className, 'aria-hidden': 'true', focusable: 'false' }, [
    svg('circle', { class: 'mark__glow', cx: '20', cy: '11', r: '7' }),
    svg('path', { class: 'mark__flame', d: FLAME }),
    svg('path', { class: 'mark__wick', d: 'M20 14.6v2.6' }),
    svg('rect', { class: 'mark__candle', x: '15.5', y: '17.2', width: '9', height: '15', rx: '2' }),
    svg('path', { class: 'mark__stripe', d: 'M15.7 22.6l8.6-3.2M15.7 27.8l8.6-3.2' }),
    svg('path', { class: 'mark__plate', d: 'M10.5 35.2h19' }),
  ]);
}

/** Small candle used inside the toast; its flame ignites when the toast appears. */
export function toastCandle(): SVGElement {
  return svg('svg', { viewBox: '0 0 40 40', 'aria-hidden': 'true', focusable: 'false' }, [
    svg('path', { class: 't-flame', d: FLAME }),
    svg('path', { class: 't-line', d: 'M20 14.6v2.6' }),
    svg('rect', { class: 't-line', x: '15.5', y: '17.2', width: '9', height: '15', rx: '2' }),
  ]);
}

/** Empty-state art: candle on a plate inside two dotted rings. */
export function emptyArt(): SVGElement {
  return svg('svg', { viewBox: '0 0 120 96', class: 'empty__art', 'aria-hidden': 'true', focusable: 'false' }, [
    svg('circle', { class: 'empty__ring', cx: '60', cy: '52', r: '38' }),
    svg('circle', { class: 'empty__ring empty__ring--in', cx: '60', cy: '52', r: '22' }),
    svg('path', { class: 'empty__flame', d: 'M60 22c3 3.4 4 5.8 4 7.8a4 4 0 0 1-8 0c0-2 1-4.4 4-7.8z' }),
    svg('path', { class: 'empty__stroke', d: 'M60 34v4' }),
    svg('rect', { class: 'empty__stroke', x: '55', y: '38', width: '10', height: '26', rx: '3' }),
    svg('path', { class: 'empty__stroke', d: 'M44 70h32' }),
  ]);
}

/** Round checkbox tick for the claim control (drawn in with stroke-dashoffset). */
export function claimTick(): SVGElement {
  return svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' }, [svg('path', { d: 'M5.5 12.5l4 4 9-9' })]);
}

const PIN_PATH = 'M20 48c-1.2-6-14-15.4-14-27a14 14 0 0 1 28 0c0 11.6-12.8 21-14 27z';

/** Map pin teardrop (40x50). Brand initials / claimed check are layered on top in HTML. */
export function pinShape(): SVGElement {
  return svg('svg', { viewBox: '0 0 40 50', class: 'pin__svg', 'aria-hidden': 'true', focusable: 'false' }, [
    svg('path', { class: 'pin__shape', d: PIN_PATH }),
  ]);
}

/** Two-letter monogram for a brand: "Tata Starbucks" → "TS", "Theobroma" → "Th". Plain text only. */
export function initials(brand: string): string {
  const words = brand
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const first = Array.from(words[0] ?? '');
  const second = Array.from(words[1] ?? '');
  if (first.length === 0) return '';
  if (second.length > 0) return `${first[0] ?? ''}${second[0] ?? ''}`.toLocaleUpperCase();
  return `${(first[0] ?? '').toLocaleUpperCase()}${(first[1] ?? '').toLocaleLowerCase()}`;
}
