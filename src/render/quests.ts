import type { Branch, ClaimWindow, LiveResult, Offer } from '../types';
import { isStale } from '../offers';
import { questLine } from '../templates';
import { directionsUrl } from '../urls';
import { el, externalLink } from './dom';
import { CATEGORY_EMOJI } from './icons';

/** Done state for this tab. main.ts mirrors it into the session record (src/session.ts). */
const done = new Set<string>();
let doneListener: (() => void) | null = null;

export function isDone(offerId: string): boolean {
  return done.has(offerId);
}

export function doneIds(): string[] {
  return [...done];
}

/** Replaces the done set (session restore / "Clear search"). Re-render cards afterwards. */
export function setDoneIds(ids: Iterable<string>): void {
  done.clear();
  for (const id of ids) done.add(id);
}

/** Called after every check/uncheck. */
export function onDoneChange(fn: (() => void) | null): void {
  doneListener = fn;
}

/** Test hook. */
export function _resetDone(): void {
  done.clear();
  doneListener = null;
}

export interface QuestDoneDetail {
  offerId: string;
  brand: string;
}

export const CLAIM_WINDOW_LABELS: Record<ClaimWindow, string> = {
  day: 'On your birthday',
  week: 'During your birthday week',
  month: 'All birthday month',
  varies: 'Varies (check the terms)',
};

/** Badge with a decorative (aria-hidden) emoji so screen readers only hear the words. */
function badge(kind: string, emoji: string, text: string): HTMLSpanElement {
  return el('span', { class: `badge badge--${kind}` }, [el('span', { class: 'badge__icon', 'aria-hidden': 'true' }, [emoji]), text]);
}

function badges(offer: Offer, now: Date): HTMLElement {
  const list = el('div', { class: 'badges' });
  list.appendChild(offer.verified ? badge('verified', '✅', 'Verified') : badge('check', '⚠️', 'Check with store'));
  if (isStale(offer.lastVerified, now)) list.appendChild(badge('stale', '🕰', 'May be outdated'));
  return list;
}

function directionsLabel(brand: string, branchName: string): string {
  return branchName && branchName !== brand ? `Get directions to ${brand}, ${branchName}` : `Get directions to ${brand}`;
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
    doneListener?.();
  });
  return el('div', { class: 'quest-card__done' }, [input, el('label', { for: id, class: 'quest-card__done-label' }, ['Quest complete!'])]);
}

/** "350 m away" / "1.2 km away" (finite, non-negative metres only). */
export function formatDistance(m: number): string {
  if (!Number.isFinite(m) || m < 0) return '';
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m away`;
  return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km away`;
}

/** "Join 7+ days before" etc. Pure, exported for tests. */
export function claimChips(offer: Offer): Array<{ kind: string; emoji: string; text: string }> {
  const chips: Array<{ kind: string; emoji: string; text: string }> = [];
  if (offer.purchaseRequired === false) chips.push({ kind: 'free', emoji: '🆓', text: 'No purchase needed' });
  else if (offer.purchaseRequired === true) {
    chips.push({ kind: 'purchase', emoji: '🛍️', text: offer.minSpend ? `Purchase needed (min ${offer.minSpend})` : 'Purchase needed' });
  } else if (offer.minSpend) chips.push({ kind: 'purchase', emoji: '🛍️', text: `Min spend: ${offer.minSpend}` });
  if (offer.signupLeadDays !== undefined) {
    const n = offer.signupLeadDays;
    chips.push({ kind: 'lead', emoji: '📅', text: n === 0 ? 'Join any time, even on the day' : `Join ${n}+ day${n === 1 ? '' : 's'} before` });
  }
  if (offer.validFor) chips.push({ kind: 'valid', emoji: '⏳', text: `Valid: ${offer.validFor}` });
  if (offer.bring?.length) chips.push({ kind: 'bring', emoji: '🎒', text: `Bring: ${offer.bring.join(', ')}` });
  return chips;
}

function claimChipList(offer: Offer): HTMLElement | null {
  const chips = claimChips(offer);
  if (chips.length === 0) return null;
  return el(
    'ul',
    { class: 'claim-chips', role: 'list', 'aria-label': `Before you go to ${offer.brand}` },
    chips.map((c) =>
      el('li', { class: `claim-chip claim-chip--${c.kind}` }, [el('span', { class: 'claim-chip__icon', 'aria-hidden': 'true' }, [c.emoji]), c.text]),
    ),
  );
}

/** Numbered steps when the offer has them, otherwise the free-text howToClaim. */
function howToClaim(offer: Offer): HTMLElement | string {
  if (!offer.steps?.length) return offer.howToClaim;
  return el('ol', { class: 'quest-card__steps' }, offer.steps.map((step) => el('li', {}, [step])));
}

export function questCard(
  offer: Offer,
  opts: { branch?: Branch | undefined; distanceM?: number | undefined; now: Date; idPrefix: string },
): HTMLLIElement {
  const headingId = `quest-${opts.idPrefix}-${offer.id}`;
  const actions = el('div', { class: 'quest-card__actions' }, [
    opts.branch
      ? externalLink(directionsUrl(opts.branch.lat, opts.branch.lng), 'Get directions', {
          class: 'btn btn--directions',
          'aria-label': `${directionsLabel(offer.brand, opts.branch.name)} (opens in a new tab)`,
        })
      : null,
    externalLink(offer.sourceUrl, 'Verify offer', {
      class: 'btn btn--source',
      'aria-label': `Verify the ${offer.brand} offer on the official site (opens in a new tab)`,
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
          el('span', { class: 'quest-card__emoji', 'aria-hidden': 'true' }, [CATEGORY_EMOJI[offer.category] ?? '🎁']),
          el('div', { class: 'quest-card__heading' }, [
            el('h3', { class: 'quest-card__brand', id: headingId }, [offer.brand]),
            badges(offer, opts.now),
          ]),
          el('span', { class: 'quest-card__stamp', 'aria-hidden': 'true' }, ['🎉 Done!']),
        ]),
        el('p', { class: 'quest-card__line' }, [questLine(offer.category, offer.brand)]),
        offer.rewardItem
          ? el('p', { class: 'quest-card__reward' }, [el('strong', {}, ['You get: ']), offer.rewardItem])
          : null,
        el('dl', { class: 'quest-card__details' }, [
          el('dt', {}, ['The reward']),
          el('dd', { class: 'quest-card__offer' }, [offer.offer]),
          el('dt', {}, ['How to claim']),
          el('dd', { class: 'quest-card__claim' }, [howToClaim(offer)]),
          el('dt', {}, ['When']),
          el('dd', { class: 'quest-card__window' }, [CLAIM_WINDOW_LABELS[offer.claimWindow]]),
        ]),
        claimChipList(offer),
        el('p', { class: 'quest-card__meta' }, [
          'Last checked: ',
          el('time', { datetime: offer.lastVerified }, [offer.lastVerified]),
          opts.branch
            ? el('span', { class: 'quest-card__branch' }, [
                el('span', { class: 'quest-card__sep', 'aria-hidden': 'true' }, [' · ']),
                `Nearest: ${opts.branch.name}`,
              ])
            : null,
          opts.branch && opts.distanceM !== undefined && formatDistance(opts.distanceM)
            ? el('span', { class: 'quest-card__distance' }, [
                el('span', { class: 'quest-card__sep', 'aria-hidden': 'true' }, [' · ']),
                formatDistance(opts.distanceM),
              ])
            : null,
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

/**
 * Nearby tab: every country quest stays visible. Quests with a branch inside the circle come first,
 * nearest first, with "x km away"; the rest follow under a secondary heading.
 */
export function renderNearbyList(
  container: HTMLElement,
  offers: readonly Offer[],
  opts: {
    branches: ReadonlyMap<string, Branch>;
    distances: ReadonlyMap<string, number>;
    /** Set once the branch lookup has finished; before that the list is flat. */
    restHeading?: string | undefined;
    now?: Date;
    idPrefix: string;
  },
): void {
  const now = opts.now ?? new Date();
  const withBranch = offers
    .filter((o) => opts.branches.has(o.id))
    .sort((a, b) => (opts.distances.get(a.id) ?? Infinity) - (opts.distances.get(b.id) ?? Infinity));
  const rest = offers.filter((o) => !opts.branches.has(o.id));
  const card = (o: Offer) =>
    questCard(o, { branch: opts.branches.get(o.id), distanceM: opts.distances.get(o.id), now, idPrefix: opts.idPrefix });
  if (!opts.restHeading || withBranch.length === 0 || rest.length === 0) {
    const list = el('ul', { class: 'quest-list', role: 'list' });
    for (const o of [...withBranch, ...rest]) list.appendChild(card(o));
    container.replaceChildren(list);
    return;
  }
  const headingId = `${opts.idPrefix}-rest-heading`;
  container.replaceChildren(
    el('ul', { class: 'quest-list', role: 'list' }, withBranch.map(card)),
    el('section', { class: 'quest-group', 'aria-labelledby': headingId }, [
      el('h3', { class: 'quest-group__heading', id: headingId }, [
        el('span', { class: 'quest-group__icon', 'aria-hidden': 'true' }, ['🧭']),
        opts.restHeading,
      ]),
      el('ul', { class: 'quest-list', role: 'list' }, rest.map(card)),
    ]),
  );
}

export function liveCard(r: LiveResult): HTMLLIElement {
  return el('li', { class: 'live-card' }, [
    el('article', { class: 'live-card__inner' }, [
      el('h3', { class: 'live-card__title' }, [r.title]),
      badge('unverified', '🔍', 'Unverified: check the link'),
      r.snippet ? el('p', { class: 'live-card__snippet' }, [r.snippet]) : null,
      el('p', { class: 'live-card__source' }, ['Source: ', r.source]),
      externalLink(r.url, 'Open link', { class: 'btn btn--source', 'aria-label': `Open ${r.source} (unverified, opens in a new tab)` }),
    ]),
  ]);
}

export function renderLiveList(container: HTMLElement, results: readonly LiveResult[]): void {
  const list = el('ul', { class: 'live-list', role: 'list' });
  for (const r of results) list.appendChild(liveCard(r));
  container.replaceChildren(list);
}

export type EmptyKind = 'empty' | 'loading' | 'error';
const EMPTY_ART: Record<EmptyKind, string> = { empty: '🎈', loading: '🔮', error: '🌧️' };

/** Friendly empty / loading / error message with a small decorative illustration. */
export function renderEmpty(container: HTMLElement, message: string, kind: EmptyKind = 'empty'): void {
  container.replaceChildren(
    el('div', { class: 'empty-state', 'data-kind': kind }, [
      el('span', { class: 'empty-state__art', 'aria-hidden': 'true' }, [EMPTY_ART[kind]]),
      el('p', { class: 'empty-state__text' }, [message]),
    ]),
  );
}
