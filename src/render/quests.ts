import type { Branch, ClaimWindow, LiveResult, Offer } from '../types';
import { isStale } from '../offers';
import { questLine } from '../templates';
import { directionsUrl, directionsUrlByName, displayHost } from '../urls';
import { el, externalLink } from './dom';
import { claimTick, emptyArt, icon, initials, type IconName } from './icons';

/** Done ("claimed") state for this tab. main.ts mirrors it into the session record (src/session.ts). */
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

type BadgeKind = 'verified' | 'check' | 'stale' | 'unverified';
const BADGE_ICON: Record<BadgeKind, IconName> = { verified: 'check', check: 'alert', stale: 'clock', unverified: 'alert' };

/** Status badge: decorative icon + words (screen readers only hear the words). */
function badge(kind: BadgeKind, text: string): HTMLSpanElement {
  return el('span', { class: `badge badge--${kind}` }, [icon(BADGE_ICON[kind]), text]);
}

function badges(offer: Offer, now: Date): HTMLElement {
  const list = el('div', { class: 'badges' });
  list.appendChild(offer.verified ? badge('verified', 'Verified') : badge('check', 'Check with store'));
  if (isStale(offer.lastVerified, now)) list.appendChild(badge('stale', 'May be outdated'));
  return list;
}

function directionsLabel(brand: string, branchName: string): string {
  return branchName && branchName !== brand ? `Get directions to ${brand}, ${branchName}` : `Get directions to ${brand}`;
}

/** Keeps every rendered card for one offer (Nearby + Online can both show it) in the same state. */
function syncCards(offerId: string, checked: boolean): void {
  for (const card of document.querySelectorAll<HTMLElement>('.quest-card')) {
    if (card.dataset.offerId !== offerId) continue;
    card.classList.toggle('is-done', checked);
    const box = card.querySelector<HTMLInputElement>('.quest-card__done-input');
    if (box) box.checked = checked;
  }
}

function doneToggle(offer: Offer, idPrefix: string): HTMLElement {
  const id = `done-${idPrefix}-${offer.id}`;
  const input = el('input', {
    type: 'checkbox',
    id,
    class: 'claim__input quest-card__done-input',
    checked: done.has(offer.id),
    'aria-label': `Mark claimed: ${offer.brand}`,
  });
  input.addEventListener('change', () => {
    const card = input.closest('.quest-card');
    if (input.checked) done.add(offer.id);
    else done.delete(offer.id);
    card?.classList.toggle('is-done', input.checked);
    syncCards(offer.id, input.checked);
    if (input.checked) {
      input.dispatchEvent(
        new CustomEvent<QuestDoneDetail>('quest-done', { bubbles: true, detail: { offerId: offer.id, brand: offer.brand } }),
      );
    } else {
      input.dispatchEvent(
        new CustomEvent<QuestDoneDetail>('quest-undone', { bubbles: true, detail: { offerId: offer.id, brand: offer.brand } }),
      );
    }
    doneListener?.();
  });
  return el('label', { class: 'claim quest-card__done', for: id }, [
    input,
    el('span', { class: 'claim__box', 'aria-hidden': 'true' }, [claimTick()]),
    el('span', { class: 'claim__label quest-card__done-label', 'aria-hidden': 'true' }, [
      el('span', { class: 'claim__off' }, ['Mark claimed']),
      el('span', { class: 'claim__on' }, ['Claimed']),
    ]),
  ]);
}

/** "350 m away" / "1.2 km away" (finite, non-negative metres only). */
export function formatDistance(m: number): string {
  if (!Number.isFinite(m) || m < 0) return '';
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m away`;
  return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km away`;
}

/** "about 47 km away" for an approximate venue location (whole km; never metres). */
export function formatApproxDistance(m: number): string {
  if (!Number.isFinite(m) || m < 0) return '';
  return `about ${Math.max(1, Math.round(m / 1000))} km away`;
}

/** Directions for a branch or venue: by coordinates, or by name when the location is approximate. */
export function branchDirectionsUrl(branch: Branch): string {
  if (branch.approximate) {
    try {
      return directionsUrlByName(branch.name);
    } catch {
      // Unusable name: fall back to the (approximate) coordinates rather than breaking the card.
    }
  }
  return directionsUrl(branch.lat, branch.lng);
}

export interface ClaimChip {
  kind: 'free' | 'purchase' | 'lead' | 'valid' | 'bring';
  icon: IconName;
  text: string;
}

/** "Join 7+ days before" etc. Pure, exported for tests. */
export function claimChips(offer: Offer): ClaimChip[] {
  const chips: ClaimChip[] = [];
  if (offer.purchaseRequired === false) chips.push({ kind: 'free', icon: 'gift', text: 'No purchase needed' });
  else if (offer.purchaseRequired === true) {
    chips.push({ kind: 'purchase', icon: 'bag', text: offer.minSpend ? `Purchase needed (min ${offer.minSpend})` : 'Purchase needed' });
  } else if (offer.minSpend) chips.push({ kind: 'purchase', icon: 'bag', text: `Min spend: ${offer.minSpend}` });
  if (offer.signupLeadDays !== undefined) {
    const n = offer.signupLeadDays;
    chips.push({ kind: 'lead', icon: 'clock', text: n === 0 ? 'Join any time, even on the day' : `Join ${n}+ day${n === 1 ? '' : 's'} before` });
  }
  if (offer.validFor) chips.push({ kind: 'valid', icon: 'calendar', text: `Valid: ${offer.validFor}` });
  if (offer.bring?.length) {
    const qr = offer.bring.some((b) => /\b(app|qr|barcode|code|voucher|pass)\b/i.test(b));
    chips.push({ kind: 'bring', icon: qr ? 'qr' : 'id', text: `Bring: ${offer.bring.join(', ')}` });
  }
  return chips;
}

function claimChipList(offer: Offer): HTMLElement | null {
  const chips = claimChips(offer);
  if (chips.length === 0) return null;
  return el(
    'ul',
    { class: 'chips claim-chips', role: 'list', 'aria-label': `Before you go to ${offer.brand}` },
    chips.map((c) => el('li', { class: `chip claim-chip claim-chip--${c.kind}` }, [icon(c.icon), c.text])),
  );
}

/** Numbered steps when the offer has them, otherwise the free-text howToClaim. */
function howToClaim(offer: Offer): HTMLElement {
  return el('div', { class: 'quest-card__claim' }, [
    offer.steps?.length
      ? el('ol', { class: 'steps quest-card__steps' }, offer.steps.map((step) => el('li', {}, [step])))
      : el('p', { class: 'quest-card__howto' }, [offer.howToClaim]),
  ]);
}

const DATE_FMT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** "2 Oct 2026" for a YYYY-MM-DD string (falls back to the raw text). */
export function formatChecked(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? iso : DATE_FMT.format(d);
}

function withArrow(link: HTMLElement): HTMLElement {
  link.appendChild(icon('arrow'));
  return link;
}

function metaLine(offer: Offer, opts: { branch?: Branch | undefined; distanceM?: number | undefined; online: boolean }): HTMLElement {
  const dist =
    opts.branch && opts.distanceM !== undefined
      ? opts.branch.approximate
        ? formatApproxDistance(opts.distanceM)
        : formatDistance(opts.distanceM)
      : '';
  if (opts.branch) {
    return el('p', { class: 'card__meta quest-card__meta' }, [
      el('span', { class: 'quest-card__branch' }, [opts.branch.name || offer.brand]),
      dist
        ? el('span', { class: 'quest-card__distance' }, [el('span', { class: 'dot', 'aria-hidden': 'true' }), dist])
        : null,
    ]);
  }
  const text = opts.online || offer.channel === 'online' ? questLine('online', offer.brand) : questLine(offer.category, offer.brand);
  return el('p', { class: 'card__meta quest-card__meta' }, [text]);
}

export function questCard(
  offer: Offer,
  opts: { branch?: Branch | undefined; distanceM?: number | undefined; now: Date; idPrefix: string },
): HTMLLIElement {
  const headingId = `quest-${opts.idPrefix}-${offer.id}`;
  const online = opts.idPrefix === 'online';
  const host = displayHost(offer.sourceUrl);

  const directions = opts.branch
    ? externalLink(branchDirectionsUrl(opts.branch), '', {
        class: 'btn btn--primary btn--sm btn--directions',
        'aria-label': `${directionsLabel(offer.brand, opts.branch.name)} (opens in a new tab)`,
      })
    : null;
  if (directions) {
    directions.replaceChildren(el('span', {}, ['Get directions']), el('span', { class: 'btn__orb', 'aria-hidden': 'true' }, [icon('arrow')]));
  }

  const reward = offer.rewardItem;
  const get = reward
    ? el('div', { class: 'get quest-card__reward' }, [
        el('span', { class: 'get__label' }, ['You get']),
        el('p', { class: 'get__value' }, [reward]),
        reward !== offer.offer ? el('p', { class: 'get__detail quest-card__offer' }, [offer.offer]) : null,
      ])
    : el('div', { class: 'get' }, [
        el('span', { class: 'get__label' }, ['You get']),
        el('p', { class: 'get__value quest-card__offer' }, [offer.offer]),
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
      el('article', { class: 'card quest-card__inner' }, [
        el('header', { class: 'card__head quest-card__header' }, [
          el('span', { class: 'mono', 'aria-hidden': 'true' }, [initials(offer.brand)]),
          el('div', { class: 'card__title quest-card__heading' }, [
            el('h3', { class: 'quest-card__brand', id: headingId }, [offer.brand]),
            metaLine(offer, { branch: opts.branch, distanceM: opts.distanceM, online }),
          ]),
          badges(offer, opts.now),
        ]),
        get,
        claimChipList(offer),
        howToClaim(offer),
        el('footer', { class: 'card__foot quest-card__actions' }, [
          directions,
          withArrow(
            externalLink(offer.sourceUrl, 'Verify offer', {
              class: 'link btn--source',
              'aria-label': `Verify the ${offer.brand} offer on the official site (opens in a new tab)`,
            }),
          ),
          doneToggle(offer, opts.idPrefix),
        ]),
        el('p', { class: 'card__fine' }, [
          'Last checked ',
          el('time', { datetime: offer.lastVerified }, [formatChecked(offer.lastVerified)]),
          host ? ` on ${host}` : null,
          offer.claimWindow !== 'varies' && !offer.validFor ? `. ${CLAIM_WINDOW_LABELS[offer.claimWindow]}.` : null,
        ]),
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
    /** Optional notice shown above the list (e.g. "No shops within 2 km"). */
    notice?: HTMLElement | null;
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
  const notice = opts.notice ?? null;
  if (!opts.restHeading || withBranch.length === 0 || rest.length === 0) {
    const list = el('ul', { class: 'quest-list', role: 'list' });
    for (const o of [...withBranch, ...rest]) list.appendChild(card(o));
    container.replaceChildren(...(notice ? [notice, list] : [list]));
    return;
  }
  const headingId = `${opts.idPrefix}-rest-heading`;
  container.replaceChildren(
    ...(notice ? [notice] : []),
    el('ul', { class: 'quest-list', role: 'list' }, withBranch.map(card)),
    el('section', { class: 'quest-group', 'aria-labelledby': headingId }, [
      el('h3', { class: 'quest-group__heading', id: headingId }, [opts.restHeading]),
      el('ul', { class: 'quest-list', role: 'list' }, rest.map(card)),
    ]),
  );
}

export function liveCard(r: LiveResult): HTMLLIElement {
  return el('li', { class: 'live-card' }, [
    el('article', { class: 'card live-card__inner' }, [
      el('header', { class: 'card__head live-card__head' }, [
        el('span', { class: 'mono mono--icon', 'aria-hidden': 'true' }, [icon('globe')]),
        el('div', { class: 'card__title' }, [el('h3', { class: 'live-card__title' }, [r.title])]),
        el('div', { class: 'badges' }, [badge('unverified', 'Unverified: check the link')]),
      ]),
      r.snippet ? el('p', { class: 'live-card__snippet' }, [r.snippet]) : null,
      el('footer', { class: 'card__foot live-card__foot' }, [
        el('p', { class: 'live-card__source' }, ['Source: ', r.source]),
        withArrow(externalLink(r.url, 'Open link', { class: 'link btn--source', 'aria-label': `Open ${r.source} (unverified, opens in a new tab)` })),
      ]),
    ]),
  ]);
}

export function renderLiveList(container: HTMLElement, results: readonly LiveResult[]): void {
  const list = el('ul', { class: 'live-list', role: 'list' });
  for (const r of results) list.appendChild(liveCard(r));
  container.replaceChildren(list);
}

export type EmptyKind = 'empty' | 'loading' | 'error';

export interface EmptyOptions {
  /** Short heading above the message. */
  title?: string;
  /** Buttons shown under the message (built by the caller with el()). */
  actions?: HTMLElement[];
}

/** Skeleton card matching the quest card shape (mono tile, two lines, "You get" block, two step lines). */
function skeletonCard(): HTMLElement {
  return el('div', { class: 'skel', 'aria-hidden': 'true' }, [
    el('div', { class: 'skel__row' }, [el('span', { class: 'skel__mono' }), el('span', { class: 'skel__lines' }, [el('span'), el('span')])]),
    el('span', { class: 'skel__block' }),
    el('span', { class: 'skel__line' }),
    el('span', { class: 'skel__line skel__line--short' }),
  ]);
}

/**
 * Empty / loading / error state. Loading shows skeleton cards plus the message for screen readers;
 * empty and error show the candle illustration (or a warning icon), an optional title and actions.
 */
export function renderEmpty(container: HTMLElement, message: string, kind: EmptyKind = 'empty', opts: EmptyOptions = {}): void {
  if (kind === 'loading') {
    container.replaceChildren(
      el('div', { class: 'empty-state empty-state--loading', 'data-kind': kind }, [
        el('p', { class: 'empty-state__text visually-hidden' }, [message]),
        skeletonCard(),
        skeletonCard(),
      ]),
    );
    return;
  }
  container.replaceChildren(
    el('div', { class: `empty-state empty-state--${kind}`, 'data-kind': kind }, [
      kind === 'error' ? el('span', { class: 'empty-state__icon', 'aria-hidden': 'true' }, [icon('alert')]) : emptyArt(),
      opts.title ? el('h3', { class: 'empty-state__title' }, [opts.title]) : null,
      el('p', { class: 'empty-state__text' }, [message]),
      opts.actions?.length ? el('div', { class: 'empty-state__actions' }, opts.actions) : null,
    ]),
  );
}
