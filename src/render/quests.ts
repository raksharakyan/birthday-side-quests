import type { Branch, ClaimWindow, LiveResult, Offer } from '../types';
import { isStale } from '../offers';
import { questLine } from '../templates';
import { directionsUrl } from '../urls';
import { el, externalLink } from './dom';

/** Done state lives in memory only — never persisted. */
const done = new Set<string>();

export function isDone(offerId: string): boolean {
  return done.has(offerId);
}

/** Test hook. */
export function _resetDone(): void {
  done.clear();
}

export interface QuestDoneDetail {
  offerId: string;
  brand: string;
}

export const CLAIM_WINDOW_LABELS: Record<ClaimWindow, string> = {
  day: 'On your birthday',
  week: 'During your birthday week',
  month: 'All birthday month',
  varies: 'Varies — check the terms',
};

function badges(offer: Offer, now: Date): HTMLElement {
  const list = el('div', { class: 'badges' });
  if (offer.verified) {
    list.appendChild(el('span', { class: 'badge badge--verified' }, ['✅ Verified']));
  } else {
    list.appendChild(el('span', { class: 'badge badge--check' }, ['⚠️ Check with store']));
  }
  if (isStale(offer.lastVerified, now)) {
    list.appendChild(el('span', { class: 'badge badge--stale' }, ['🕰 May be outdated']));
  }
  return list;
}

function doneToggle(offer: Offer, idPrefix: string): HTMLElement {
  const id = `done-${idPrefix}-${offer.id}`;
  const input = el('input', { type: 'checkbox', id, class: 'quest-card__done-input', checked: done.has(offer.id) });
  input.addEventListener('change', () => {
    const card = input.closest('.quest-card');
    if (input.checked) {
      done.add(offer.id);
      card?.classList.add('is-done');
      input.dispatchEvent(
        new CustomEvent<QuestDoneDetail>('quest-done', { bubbles: true, detail: { offerId: offer.id, brand: offer.brand } }),
      );
    } else {
      done.delete(offer.id);
      card?.classList.remove('is-done');
    }
  });
  return el('div', { class: 'quest-card__done' }, [input, el('label', { for: id }, ['Quest complete!'])]);
}

export function questCard(offer: Offer, opts: { branch?: Branch | undefined; now: Date; idPrefix: string }): HTMLLIElement {
  const headingId = `quest-${opts.idPrefix}-${offer.id}`;
  const actions = el('div', { class: 'quest-card__actions' }, [
    opts.branch
      ? externalLink(directionsUrl(opts.branch.lat, opts.branch.lng), 'Get directions', {
          class: 'btn btn--directions',
          'aria-label': `Get directions to ${offer.brand} (${opts.branch.name})`,
        })
      : null,
    externalLink(offer.sourceUrl, 'Verify offer', {
      class: 'btn btn--source',
      'aria-label': `Verify the ${offer.brand} offer on the official site`,
    }),
  ]);

  return el(
    'li',
    {
      class: `quest-card${done.has(offer.id) ? ' is-done' : ''}`,
      'data-offer-id': offer.id,
      'data-category': offer.category,
      'aria-labelledby': headingId,
    },
    [
      el('article', { class: 'quest-card__inner' }, [
        el('header', { class: 'quest-card__header' }, [
          el('h3', { class: 'quest-card__brand', id: headingId }, [offer.brand]),
          badges(offer, opts.now),
        ]),
        el('p', { class: 'quest-card__line' }, [questLine(offer.category, offer.brand)]),
        el('dl', { class: 'quest-card__details' }, [
          el('dt', {}, ['The reward']),
          el('dd', { class: 'quest-card__offer' }, [offer.offer]),
          el('dt', {}, ['How to claim']),
          el('dd', { class: 'quest-card__claim' }, [offer.howToClaim]),
          el('dt', {}, ['When']),
          el('dd', { class: 'quest-card__window' }, [CLAIM_WINDOW_LABELS[offer.claimWindow]]),
        ]),
        el('p', { class: 'quest-card__meta' }, [
          'Last checked: ',
          el('time', { datetime: offer.lastVerified }, [offer.lastVerified]),
          opts.branch ? el('span', { class: 'quest-card__branch' }, [` · Nearest: ${opts.branch.name}`]) : null,
        ]),
        actions,
        doneToggle(offer, opts.idPrefix),
      ]),
    ],
  );
}

export function renderQuestList(
  container: HTMLElement,
  offers: readonly Offer[],
  opts: { branches?: ReadonlyMap<string, Branch>; now?: Date; idPrefix: string },
): void {
  const now = opts.now ?? new Date();
  const list = el('ul', { class: 'quest-list', role: 'list' });
  for (const o of offers) list.appendChild(questCard(o, { branch: opts.branches?.get(o.id), now, idPrefix: opts.idPrefix }));
  container.replaceChildren(list);
}

export function liveCard(r: LiveResult): HTMLLIElement {
  return el('li', { class: 'live-card' }, [
    el('article', { class: 'live-card__inner' }, [
      el('h3', { class: 'live-card__title' }, [r.title]),
      el('span', { class: 'badge badge--unverified' }, ['Unverified — check the link']),
      r.snippet ? el('p', { class: 'live-card__snippet' }, [r.snippet]) : null,
      el('p', { class: 'live-card__source' }, ['Source: ', r.source]),
      externalLink(r.url, 'Open link', { class: 'btn btn--source', 'aria-label': `Open ${r.source} (unverified)` }),
    ]),
  ]);
}

export function renderLiveList(container: HTMLElement, results: readonly LiveResult[]): void {
  const list = el('ul', { class: 'live-list', role: 'list' });
  for (const r of results) list.appendChild(liveCard(r));
  container.replaceChildren(list);
}

export function renderEmpty(container: HTMLElement, message: string): void {
  container.replaceChildren(el('p', { class: 'empty-state' }, [message]));
}
