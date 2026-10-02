import type { Category } from '../types';
import { svg } from './dom';

/*
 * Map marker icons. Static markup only (built with createElementNS via svg()) — never pass data in here.
 * Colours come from CSS (.pin__body / .pin__face / .pin__glyph), keyed off the wrapper's data-category,
 * so no inline styles are needed under the CSP.
 */

const PIN_PATH = 'M18 44.5c-.6 0-1.1-.3-1.5-.8C12.4 38.4 4 27.6 4 18.2 4 10.4 10.3 4 18 4s14 6.4 14 14.2c0 9.4-8.4 20.2-12.5 25.5-.4.5-.9.8-1.5.8z';
const HEART_PATH =
  'M12 21s-7.5-4.6-9.6-9.3C.9 8.3 3 4.5 6.6 4.5c2.1 0 3.6 1.2 4.4 2.5.8-1.3 2.3-2.5 4.4-2.5 3.6 0 5.7 3.8 4.2 7.2C19.5 16.4 12 21 12 21z';

function pin(className: string, glyph: SVGElement[]): SVGElement {
  return svg('svg', { viewBox: '0 0 36 48', width: '36', height: '48', 'aria-hidden': 'true', focusable: 'false', class: `pin ${className}` }, [
    svg('path', { d: PIN_PATH, class: 'pin__body', 'stroke-width': '2.5', 'stroke-linejoin': 'round' }),
    svg('circle', { cx: '18', cy: '18', r: '10', class: 'pin__face' }),
    ...glyph,
  ]);
}

/** Heart pin — food & drink (cafe, dessert, restaurant). */
export function heartIcon(className = 'marker-heart'): SVGElement {
  return pin(className, [svg('path', { d: HEART_PATH, class: 'pin__glyph', transform: 'translate(10.8 10.6) scale(0.6)' })]);
}

/** Gift pin — beauty, fashion, retail, online. */
export function giftIcon(className = 'marker-gift'): SVGElement {
  return pin(className, [
    svg('rect', { x: '11.5', y: '17', width: '13', height: '8.5', rx: '1.5', class: 'pin__glyph' }),
    svg('rect', { x: '10.5', y: '13.5', width: '15', height: '4', rx: '1.2', class: 'pin__glyph' }),
    svg('rect', { x: '17', y: '13.5', width: '2', height: '12', class: 'pin__ribbon' }),
    svg('path', {
      d: 'M18 13.5c-1.2-2.6-4.6-3.3-4.6-1.2 0 1.1 1.8 1.2 4.6 1.2zm0 0c1.2-2.6 4.6-3.3 4.6-1.2 0 1.1-1.8 1.2-4.6 1.2z',
      class: 'pin__glyph',
      'stroke-width': '1.4',
      'stroke-linejoin': 'round',
    }),
  ]);
}

/** Star — the user's searched location. */
export function starIcon(className = 'marker-center'): SVGElement {
  return svg('svg', { viewBox: '0 0 40 40', width: '40', height: '40', 'aria-hidden': 'true', focusable: 'false', class: `star ${className}` }, [
    svg('circle', { cx: '20', cy: '20', r: '17', class: 'star__halo' }),
    svg('path', {
      d: 'M20 7.5l3.6 7.6 8.2 1-6 5.7 1.6 8.2L20 26l-7.4 4 1.6-8.2-6-5.7 8.2-1z',
      class: 'star__shape',
      'stroke-width': '2',
      'stroke-linejoin': 'round',
    }),
  ]);
}

/** Kept for compatibility: the searched-place marker is now a star. */
export const centerIcon = starIcon;

const FOOD: ReadonlySet<Category> = new Set<Category>(['cafe', 'dessert', 'restaurant']);

export function iconForCategory(category: Category | undefined): SVGElement {
  return category && FOOD.has(category) ? heartIcon() : giftIcon();
}

/** Decorative emoji per category (rendered aria-hidden). */
export const CATEGORY_EMOJI: Record<Category, string> = {
  cafe: '☕',
  dessert: '🧁',
  restaurant: '🍽️',
  beauty: '💄',
  fashion: '👗',
  retail: '🛍️',
  online: '💻',
};
