import { svg } from './dom';

/** Placeholder heart marker icon (UI/UX agent restyles). Static markup only. */
export function heartIcon(className = 'marker-heart'): SVGElement {
  return svg('svg', { viewBox: '0 0 24 24', width: '28', height: '28', 'aria-hidden': 'true', focusable: 'false', class: className }, [
    svg('path', {
      d: 'M12 21s-7.5-4.6-9.6-9.3C.9 8.3 3 4.5 6.6 4.5c2.1 0 3.6 1.2 4.4 2.5.8-1.3 2.3-2.5 4.4-2.5 3.6 0 5.7 3.8 4.2 7.2C19.5 16.4 12 21 12 21z',
      fill: 'currentColor',
      stroke: '#ffffff',
      'stroke-width': '1.5',
    }),
  ]);
}

/** "You are here" dot for the searched place. */
export function centerIcon(className = 'marker-center'): SVGElement {
  return svg('svg', { viewBox: '0 0 24 24', width: '22', height: '22', 'aria-hidden': 'true', focusable: 'false', class: className }, [
    svg('circle', { cx: '12', cy: '12', r: '8', fill: 'currentColor', stroke: '#ffffff', 'stroke-width': '3' }),
  ]);
}
