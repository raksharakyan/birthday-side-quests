import { el } from './dom';
import type { QuestDoneDetail } from './quests';

/*
 * Confetti burst for the 'quest-done' CustomEvent (dispatched by the done checkbox in quests.ts).
 * Pure DOM + CSS animations; per-piece values are passed as CSS custom properties through the CSSOM
 * (style.setProperty), which the CSP (style-src 'self') allows — no inline style attributes, no innerHTML.
 * With prefers-reduced-motion there is no burst: the card just switches to its static "done" style.
 */

const COLORS = ['#ff9ec4', '#c9b6ff', '#8fdcb9', '#ffd966', '#ffb38a', '#b02a63', '#7b4fe0'];
const SHAPES = ['rect', 'circle', 'heart', 'star'] as const;
const PIECES = 30;
const LIFETIME_MS = 1600;

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function burst(origin: Element): void {
  const rect = origin.getBoundingClientRect();
  const layer = el('div', { class: 'confetti', 'aria-hidden': 'true' });
  layer.style.setProperty('--x', `${Math.round(rect.left + rect.width / 2)}px`);
  layer.style.setProperty('--y', `${Math.round(rect.top + rect.height / 2)}px`);

  for (let i = 0; i < PIECES; i++) {
    const shape = SHAPES[i % SHAPES.length] ?? 'rect';
    const piece = el('span', { class: `confetti__piece confetti__piece--${shape}` }, shape === 'heart' ? ['♥'] : shape === 'star' ? ['✦'] : []);
    // Fan out upwards, then let "gravity" pull pieces down.
    const angle = rand(-Math.PI * 0.95, -Math.PI * 0.05);
    const dist = rand(50, 140);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    piece.style.setProperty('--dx', `${dx.toFixed(1)}px`);
    piece.style.setProperty('--dy', `${dy.toFixed(1)}px`);
    piece.style.setProperty('--fall', `${rand(40, 90).toFixed(1)}px`);
    piece.style.setProperty('--rot', `${Math.round(rand(-540, 540))}deg`);
    piece.style.setProperty('--delay', `${Math.round(rand(0, 120))}ms`);
    piece.style.setProperty('--dur', `${Math.round(rand(900, 1300))}ms`);
    piece.style.setProperty('--c', COLORS[i % COLORS.length] ?? '#ff9ec4');
    layer.appendChild(piece);
  }

  document.body.appendChild(layer);
  window.setTimeout(() => layer.remove(), LIFETIME_MS);
}

/** Wire up celebrations. `live` is a polite aria-live region used for a short spoken confirmation. */
export function initCelebrations(live: HTMLElement): void {
  document.addEventListener('quest-done', (event) => {
    const { brand } = (event as CustomEvent<QuestDoneDetail>).detail;
    live.textContent = `Yay! ${brand} quest complete.`;

    const target = event.target instanceof Element ? event.target : null;
    const card = target?.closest('.quest-card');
    if (card) {
      card.classList.remove('just-done');
      // Restart the "pop" animation on repeat checks.
      void (card as HTMLElement).offsetWidth;
      card.classList.add('just-done');
      window.setTimeout(() => card.classList.remove('just-done'), LIFETIME_MS);
    }

    if (target && !prefersReducedMotion()) burst(target);
  });
}
