import { el } from './dom';
import { toastCandle } from './icons';
import type { QuestDoneDetail } from './quests';

/*
 * Claim celebration for the 'quest-done' CustomEvent (dispatched by the claim checkbox in quests.ts).
 * About 1.4 s in total (docs/design/DESIGN.md §6):
 *  - the round checkbox springs (0.82 → 1.08 → 1) while its tick draws in (CSS);
 *  - 12 thin paper strips fan upward over a 136° arc from the checkbox, hang, then fall and fade (WAAPI);
 *  - the logo flame ignites (CSS class on <body>), the progress ring advances (main.ts);
 *  - a dark toast "Brand claimed. N of M done." rises from the bottom; the same text goes to a polite live region.
 * CSP: no inline style attributes and no innerHTML. Positions are WAAPI keyframes (CSSOM), which
 * `style-src 'self'` allows. With prefers-reduced-motion nothing moves: no strips are created and the
 * toast and states appear instantly, so the feedback is still there.
 */

const STRIPS = 12;
const STRIP_KINDS = ['', 'confetti__piece--tint', '', 'confetti__piece--gold'] as const;
const TOAST_MS = 3200;

export interface Progress {
  claimed: number;
  total: number;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Deterministic fan of paper strips from the centre of `origin` (no randomness that could clump). */
export function burst(origin: Element): void {
  const rect = origin.getBoundingClientRect();
  const ox = rect.left + rect.width / 2;
  const oy = rect.top + rect.height / 2;
  const layer = el('div', { class: 'confetti', 'aria-hidden': 'true' });
  document.body.appendChild(layer);
  const running: Promise<unknown>[] = [];
  for (let i = 0; i < STRIPS; i++) {
    const strip = el('span', { class: `confetti__piece ${STRIP_KINDS[i % STRIP_KINDS.length] ?? ''}`.trim() });
    layer.appendChild(strip);
    const angle = ((-158 + (i / (STRIPS - 1)) * 136) * Math.PI) / 180;
    const dist = 70 + ((i * 37) % 64);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    const spin = (i % 2 ? 1 : -1) * (160 + ((i * 53) % 200));
    if (typeof strip.animate !== 'function') continue;
    const anim = strip.animate(
      [
        { transform: `translate(${ox}px, ${oy}px) rotate(0deg) scale(.6)`, opacity: 0, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
        { transform: `translate(${ox + dx * 0.7}px, ${oy + dy * 0.7}px) rotate(${spin * 0.4}deg) scale(1)`, opacity: 1, offset: 0.3, easing: 'cubic-bezier(0.45, 0, 0.55, 1)' },
        { transform: `translate(${ox + dx}px, ${oy + dy + 40}px) rotate(${spin * 0.8}deg) scale(1)`, opacity: 1, offset: 0.7, easing: 'cubic-bezier(0.5, 0, 0.75, 0)' },
        { transform: `translate(${ox + dx * 1.1}px, ${oy + dy + 120}px) rotate(${spin}deg) scale(.9)`, opacity: 0 },
      ],
      { duration: 1300 + (i % 4) * 90, easing: 'linear', fill: 'forwards' },
    );
    running.push(anim.finished.catch(() => undefined));
  }
  // Remove the layer once every strip has landed (with a hard cap in case an animation is cancelled).
  const cleanup = () => layer.remove();
  void Promise.all(running).then(cleanup);
  window.setTimeout(cleanup, 2000);
}

let toastEl: HTMLElement | null = null;
let toastTimer = 0;

/** Dark pill at the bottom centre. Decorative (aria-hidden): the live region carries the words. */
export function showToast(text: string, reduced = prefersReducedMotion()): void {
  toastEl?.remove();
  window.clearTimeout(toastTimer);
  const t = el('div', { class: 'toast', 'aria-hidden': 'true' }, [el('span', { class: 'toast__mark' }, [toastCandle()]), el('span', {}, [text])]);
  toastEl = t;
  document.body.appendChild(t);
  if (!reduced && typeof t.animate === 'function') {
    t.animate(
      [
        { transform: 'translate(-50%, 24px)', opacity: 0 },
        { transform: 'translate(-50%, 0)', opacity: 1 },
      ],
      { duration: 420, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' },
    );
  }
  toastTimer = window.setTimeout(() => {
    if (toastEl !== t) return;
    toastEl = null;
    if (reduced || typeof t.animate !== 'function') {
      t.remove();
      return;
    }
    const out = t.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' });
    void out.finished.then(() => t.remove(), () => t.remove());
  }, TOAST_MS);
}

/** Lights the logo flame; `ignite` replays the 700 ms ignite spring. */
export function setCandleLit(lit: boolean, ignite = false): void {
  document.body.classList.toggle('is-lit', lit);
  const mark = document.querySelector('.site-mark .mark');
  if (!mark || !ignite || prefersReducedMotion()) return;
  mark.classList.remove('is-igniting');
  void mark.getBoundingClientRect();
  mark.classList.add('is-igniting');
}

/**
 * Wire up celebrations. `live` is a polite aria-live region for the spoken confirmation;
 * `progress()` returns the up-to-date claimed/total counts.
 */
export function initCelebrations(live: HTMLElement, progress: () => Progress): void {
  document.addEventListener('quest-done', (event) => {
    const { brand } = (event as CustomEvent<QuestDoneDetail>).detail;
    const { claimed, total } = progress();
    const counts = total > 0 ? ` ${claimed} of ${total} done.` : '';
    live.textContent = `${brand} claimed.${counts}`;
    const reduced = prefersReducedMotion();
    showToast(`${brand} claimed.${counts}`, reduced);
    setCandleLit(true, true);

    const target = event.target instanceof Element ? event.target : null;
    const box = target?.closest('.claim')?.querySelector('.claim__box') ?? null;
    if (box && !reduced && typeof (box as HTMLElement).animate === 'function') {
      (box as HTMLElement).animate([{ transform: 'scale(.82)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }], {
        duration: 520,
        easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
      });
    }
    if (!reduced) burst(box ?? target ?? document.body);
  });
  document.addEventListener('quest-undone', (event) => {
    const { brand } = (event as CustomEvent<QuestDoneDetail>).detail;
    const { claimed, total } = progress();
    live.textContent = `${brand} unmarked.${total > 0 ? ` ${claimed} of ${total} claimed.` : ''}`;
  });
}
