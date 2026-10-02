import offersJson from '../../public/offers.json';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ALL_QUEST_TYPES,
  allTypesOn,
  applyQuestFilters,
  compareQuests,
  hiddenTypeCount,
  QUEST_TYPES,
  questTier,
  questType,
  sortQuests,
  typeFilterMessage,
  validateOffersFile,
} from '../../src/offers';
import { _resetDone, renderNearbyList, renderQuestList, typeBadge } from '../../src/render/quests';
import type { Branch, Offer } from '../../src/types';

/*
 * DECISIONS #27: free first, then discounts, then quests that need past spend. Classification
 * invariants on the shipped data, the tier and sort functions, the filters and the type chip.
 */

const raw = offersJson as { offers: Array<Record<string, unknown>> };
const shipped = validateOffersFile(offersJson).offers;
const byId = new Map(shipped.map((o) => [o.id, o]));

const mk = (id: string, brand: string, rewardType: Offer['rewardType'], needsPastSpend: boolean, extra: Partial<Offer> = {}): Offer => ({
  id,
  brand,
  category: 'cafe',
  offer: 'o',
  howToClaim: 'h',
  countries: ['IN'],
  channel: 'in-store',
  claimWindow: 'day',
  sourceUrl: 'https://example.com',
  lastVerified: '2026-10-02',
  verified: true,
  rewardType,
  needsPastSpend,
  ...extra,
});

describe('classification invariants (public/offers.json)', () => {
  it('every raw entry has both required fields with valid values', () => {
    expect(raw.offers.length).toBeGreaterThan(0);
    for (const o of raw.offers) {
      expect(['free', 'discount'], `${String(o.id)} rewardType`).toContain(o.rewardType);
      expect(typeof o.needsPastSpend, `${String(o.id)} needsPastSpend`).toBe('boolean');
    }
  });
  it('no entry is dropped by the stricter validator', () => {
    expect(shipped).toHaveLength(raw.offers.length);
  });
  it('every tier has offers', () => {
    const counts = [0, 0, 0];
    for (const o of shipped) counts[questTier(o)] = (counts[questTier(o)] ?? 0) + 1;
    expect(counts.every((n) => n > 0)).toBe(true);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(shipped.length);
  });
  it('a stated purchase requirement is never classed as free', () => {
    for (const o of shipped) if (o.purchaseRequired === true) expect(o.rewardType, o.id).toBe('discount');
  });
  it('offers that state a past purchase, tier or paid membership need past spend', () => {
    const PAST = /prior \d+ months|previous 12 months|past 12 months|past year|last 12 months|months before your birthday month|reach (gold|silver|black|level|insider)|gold-level|membership \(rs|total spend|\+ spend in 12 months|with a ₹5,000\+ purchase|shop enough|purchase first|dine once/i;
    for (const o of shipped) {
      const text = [o.offer, o.howToClaim, ...(o.steps ?? [])].join(' ');
      if (PAST.test(text)) expect(o.needsPastSpend, o.id).toBe(true);
    }
  });
  it.each([
    ['starbucks-us', 'free', true],
    ['krispy-kreme-gb', 'free', false],
    ['costa-gb', 'free', false],
    ['costa-coffee-in', 'free', true],
    ['westside-in', 'discount', true],
    ['mecca-au', 'discount', true],
    ['lakme-salon-in', 'discount', true],
    ['chilis-us', 'free', false],
    ['wonderla-in', 'discount', false],
    ['starbucks-ae', 'free', true],
    ['starbucks-gb', 'free', true],
    ['starbucks-ie', 'free', true],
    ['the-body-shop-gb', 'discount', false],
  ] as const)('spot check %s: %s, needsPastSpend %s', (id, type, past) => {
    const o = byId.get(id);
    expect(o, id).toBeDefined();
    expect(o?.rewardType).toBe(type);
    expect(o?.needsPastSpend).toBe(past);
  });
  it('lakme-salon-in and mecca-au are in the past-spend tier; chilis-us is first tier', () => {
    expect(questTier(byId.get('lakme-salon-in') as Offer)).toBe(2);
    expect(questTier(byId.get('mecca-au') as Offer)).toBe(2);
    expect(questTier(byId.get('chilis-us') as Offer)).toBe(0);
    expect(questTier(byId.get('wonderla-in') as Offer)).toBe(1);
  });
});

describe('questTier / questType', () => {
  it('free and no past spend is tier 0', () => {
    expect(questTier({ rewardType: 'free', needsPastSpend: false })).toBe(0);
    expect(questType({ rewardType: 'free', needsPastSpend: false })).toBe('free');
  });
  it('discount and no past spend is tier 1', () => {
    expect(questTier({ rewardType: 'discount', needsPastSpend: false })).toBe(1);
    expect(questType({ rewardType: 'discount', needsPastSpend: false })).toBe('discount');
  });
  it('needs past spend is tier 2 whatever the reward type', () => {
    expect(questTier({ rewardType: 'free', needsPastSpend: true })).toBe(2);
    expect(questTier({ rewardType: 'discount', needsPastSpend: true })).toBe(2);
    expect(questType({ rewardType: 'free', needsPastSpend: true })).toBe('past');
  });
});

describe('compareQuests / sortQuests', () => {
  const freeB = mk('free-b', 'Bravo', 'free', false);
  const freeA = mk('free-a', 'alpha', 'free', false);
  const discA = mk('disc-a', 'Aardvark', 'discount', false);
  const pastFree = mk('past-free', 'Able', 'free', true);
  const pastDisc = mk('past-disc', 'Zed', 'discount', true);

  it('orders by tier, then brand A to Z (case-insensitive)', () => {
    const out = sortQuests([pastDisc, discA, freeB, pastFree, freeA]).map((o) => o.id);
    expect(out).toEqual(['free-a', 'free-b', 'disc-a', 'past-free', 'past-disc']);
  });
  it('tier beats distance', () => {
    const d = new Map([
      ['disc-a', 10],
      ['free-b', 9000],
    ]);
    expect(sortQuests([discA, freeB], d).map((o) => o.id)).toEqual(['free-b', 'disc-a']);
  });
  it('within a tier, nearer first; ties and missing distances fall back to brand', () => {
    const c = mk('free-c', 'Charlie', 'free', false);
    const d = new Map([
      ['free-b', 500],
      ['free-a', 1200],
      ['free-c', 500],
    ]);
    // Bravo and Charlie tie at 500 m (brand order), alpha is further.
    expect(sortQuests([freeA, c, freeB], d).map((o) => o.id)).toEqual(['free-b', 'free-c', 'free-a']);
    // An offer without a distance goes after those with one.
    const e = mk('free-e', 'Echo', 'free', false);
    expect(sortQuests([e, freeA], new Map([['free-a', 99_000]])).map((o) => o.id)).toEqual(['free-a', 'free-e']);
    // Non-finite distances count as missing.
    expect(sortQuests([freeA, freeB], new Map([['free-a', Number.NaN], ['free-b', 100]])).map((o) => o.id)).toEqual(['free-b', 'free-a']);
  });
  it('same brand falls back to id, so the order is deterministic', () => {
    const x = mk('starbucks-us', 'Starbucks', 'free', false);
    const y = mk('starbucks-ca', 'Starbucks', 'free', false);
    expect(sortQuests([x, y]).map((o) => o.id)).toEqual(['starbucks-ca', 'starbucks-us']);
    expect(sortQuests([y, x]).map((o) => o.id)).toEqual(['starbucks-ca', 'starbucks-us']);
  });
  it('is a total order: any input permutation gives the same output, and the input is not changed', () => {
    const input = [pastDisc, discA, freeB, pastFree, freeA];
    const copy = [...input];
    const want = sortQuests(input).map((o) => o.id);
    expect(input).toEqual(copy);
    expect(sortQuests([...input].reverse()).map((o) => o.id)).toEqual(want);
    expect(compareQuests(freeA, freeA)).toBe(0);
  });
  it('sorts the shipped data with tiers never going backwards', () => {
    const tiers = sortQuests(shipped).map(questTier);
    for (let i = 1; i < tiers.length; i++) expect(tiers[i] as number).toBeGreaterThanOrEqual(tiers[i - 1] as number);
  });
});

describe('applyQuestFilters (Verified only + quest types)', () => {
  const list = [
    mk('f1', 'F1', 'free', false),
    mk('f2', 'F2', 'free', false, { verified: false }),
    mk('d1', 'D1', 'discount', false),
    mk('p1', 'P1', 'discount', true, { verified: false }),
    mk('p2', 'P2', 'free', true),
  ];
  const ids = (xs: Offer[]) => xs.map((o) => o.id);
  it('everything on and Verified only off keeps all (as a copy)', () => {
    const out = applyQuestFilters(list, { verifiedOnly: false, types: { ...ALL_QUEST_TYPES } });
    expect(ids(out)).toEqual(['f1', 'f2', 'd1', 'p1', 'p2']);
    expect(out).not.toBe(list);
  });
  it.each([
    ['free', ['f1', 'f2']],
    ['discount', ['d1']],
    ['past', ['p1', 'p2']],
  ] as const)('only %s', (type, want) => {
    const types = { free: false, discount: false, past: false, [type]: true };
    expect(ids(applyQuestFilters(list, { verifiedOnly: false, types }))).toEqual(want);
  });
  it('combines with Verified only', () => {
    expect(ids(applyQuestFilters(list, { verifiedOnly: true, types: { ...ALL_QUEST_TYPES } }))).toEqual(['f1', 'd1', 'p2']);
    expect(ids(applyQuestFilters(list, { verifiedOnly: true, types: { free: true, discount: false, past: true } }))).toEqual(['f1', 'p2']);
  });
  it('every type off hides everything', () => {
    expect(applyQuestFilters(list, { verifiedOnly: false, types: { free: false, discount: false, past: false } })).toEqual([]);
  });
  it('allTypesOn and hiddenTypeCount', () => {
    expect(allTypesOn({ ...ALL_QUEST_TYPES })).toBe(true);
    expect(allTypesOn({ free: true, discount: false, past: true })).toBe(false);
    expect(hiddenTypeCount({ ...ALL_QUEST_TYPES })).toBe(0);
    expect(hiddenTypeCount({ free: false, discount: false, past: true })).toBe(2);
    expect(QUEST_TYPES).toEqual(['free', 'discount', 'past']);
  });
  it('ALL_QUEST_TYPES cannot be changed by accident', () => {
    expect(Object.isFrozen(ALL_QUEST_TYPES)).toBe(true);
  });
});

describe('typeFilterMessage (live region)', () => {
  it.each([
    [{ free: true, discount: true, past: true }, 31, 31, 'Showing all quest types, 31 of 31'],
    [{ free: true, discount: false, past: false }, 12, 31, 'Showing free quests only, 12 of 31'],
    [{ free: false, discount: true, past: false }, 9, 31, 'Showing discount quests only, 9 of 31'],
    [{ free: false, discount: false, past: true }, 10, 31, 'Showing past-spend quests only, 10 of 31'],
    [{ free: true, discount: true, past: false }, 21, 31, 'Showing free and discount quests, 21 of 31'],
    [{ free: false, discount: false, past: false }, 0, 31, 'No quest types selected, 0 of 31'],
  ])('%o', (types, shown, total, want) => {
    const msg = typeFilterMessage(types, shown, total);
    expect(msg).toBe(want);
    expect(msg).not.toMatch(/\u2014/);
  });
});

describe('type chip and list order in the DOM', () => {
  beforeEach(() => _resetDone());
  it.each([
    [{ rewardType: 'free', needsPastSpend: false }, 'free', 'Quest type: Free'],
    [{ rewardType: 'discount', needsPastSpend: false }, 'discount', 'Quest type: Discount'],
    [{ rewardType: 'free', needsPastSpend: true }, 'past', 'Quest type: Needs past spend'],
    [{ rewardType: 'discount', needsPastSpend: true }, 'past', 'Quest type: Needs past spend'],
  ] as const)('chip for %o', (o, type, text) => {
    const b = typeBadge(o);
    expect(b.classList.contains(`badge--${type}`)).toBe(true);
    expect(b.dataset.questType).toBe(type);
    expect(b.textContent).toBe(text);
    expect(b.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
  it('renderQuestList puts free, then discount, then past spend, each A to Z', () => {
    const host = document.createElement('div');
    renderQuestList(
      host,
      [mk('p', 'Papa', 'free', true), mk('d', 'Delta', 'discount', false), mk('b', 'bravo', 'free', false), mk('a', 'Alpha', 'free', false)],
      { idPrefix: 'online', now: new Date('2026-10-02') },
    );
    const cards = [...host.querySelectorAll<HTMLElement>('.quest-card')];
    expect(cards.map((c) => c.dataset.offerId)).toEqual(['a', 'b', 'd', 'p']);
    expect(cards.map((c) => c.querySelector('.badge--type')?.getAttribute('data-quest-type'))).toEqual(['free', 'free', 'discount', 'past']);
    // The type chip is the first badge, before the status badge.
    expect(cards[0]?.querySelector('.badges')?.firstElementChild?.classList.contains('badge--type')).toBe(true);
  });
  it('renderNearbyList keeps the near group first, sorted by tier then distance, and sorts the rest group by tier then brand', () => {
    const host = document.createElement('div');
    const offers = [
      mk('near-disc', 'Near Disc', 'discount', false),
      mk('near-free-far', 'Near Free Far', 'free', false),
      mk('near-free-close', 'Near Free Close', 'free', false),
      mk('near-past', 'Near Past', 'free', true),
      mk('rest-past', 'Aaa Rest Past', 'discount', true),
      mk('rest-disc', 'Rest Disc', 'discount', false),
      mk('rest-free', 'Zzz Rest Free', 'free', false),
    ];
    const br = (id: string): Branch => ({ offerId: id, name: id, lat: 12.9, lng: 77.6 });
    const branches = new Map(['near-disc', 'near-free-far', 'near-free-close', 'near-past'].map((id) => [id, br(id)]));
    const distances = new Map([
      ['near-disc', 100],
      ['near-free-far', 4000],
      ['near-free-close', 300],
      ['near-past', 50],
    ]);
    renderNearbyList(host, offers, { branches, distances, restHeading: 'Also in India: find your nearest branch', idPrefix: 'nearby', now: new Date('2026-10-02') });
    const near = [...host.querySelectorAll<HTMLElement>(':scope > .quest-list .quest-card')].map((c) => c.dataset.offerId);
    const rest = [...host.querySelectorAll<HTMLElement>('.quest-group .quest-card')].map((c) => c.dataset.offerId);
    expect(near).toEqual(['near-free-close', 'near-free-far', 'near-disc', 'near-past']);
    expect(rest).toEqual(['rest-free', 'rest-disc', 'rest-past']);
  });
  it('renderNearbyList without a rest heading (before the branch lookup) is one list in tier order', () => {
    const host = document.createElement('div');
    renderNearbyList(host, [mk('p', 'P', 'discount', true), mk('d', 'D', 'discount', false), mk('f', 'F', 'free', false)], {
      branches: new Map(),
      distances: new Map(),
      idPrefix: 'nearby',
      now: new Date('2026-10-02'),
    });
    expect([...host.querySelectorAll<HTMLElement>('.quest-card')].map((c) => c.dataset.offerId)).toEqual(['f', 'd', 'p']);
  });
});
