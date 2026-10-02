import offersJson from '../../public/offers.json';
import { describe, expect, it, vi } from 'vitest';
import { filterOffers, isStale, monthInfo, validateOffer, validateOffersFile } from '../../src/offers';
import type { Offer } from '../../src/types';

const base = {
  id: 'test-cafe',
  brand: 'Test Cafe',
  category: 'cafe',
  offer: 'Free drink',
  howToClaim: 'Show the app',
  countries: ['IN'],
  channel: 'in-store',
  claimWindow: 'day',
  sourceUrl: 'https://example.com/rewards',
  lastVerified: '2026-10-02',
  verified: true,
  osm: { wikidata: 'Q37158', nameRegex: 'Test Cafe' },
};

describe('validateOffer', () => {
  it('accepts a valid offer and drops unknown fields', () => {
    const r = validateOffer({ ...base, extra: '<script>' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.offer).not.toHaveProperty('extra');
  });
  it.each([
    ['http sourceUrl', { sourceUrl: 'http://example.com' }],
    ['javascript sourceUrl', { sourceUrl: 'javascript:alert(1)' }],
    ['lowercase country', { countries: ['in'] }],
    ['3-letter country', { countries: ['IND'] }],
    ['empty countries', { countries: [] }],
    ['unknown category', { category: 'casino' }],
    ['bad channel', { channel: 'teleport' }],
    ['bad claimWindow', { claimWindow: 'year' }],
    ['overlong brand', { brand: 'x'.repeat(81) }],
    ['overlong offer', { offer: 'x'.repeat(301) }],
    ['control chars', { offer: 'free\u0000drink' }],
    ['bad date', { lastVerified: '2026-02-30' }],
    ['bad id', { id: 'Bad ID' }],
    ['non-boolean verified', { verified: 'yes' }],
    ['bad wikidata', { osm: { wikidata: 'Q1"];out;' } }],
    ['unsafe nameRegex', { osm: { nameRegex: 'a"];node(1);' } }],
  ])('rejects %s', (_label, patch) => {
    expect(validateOffer({ ...base, ...patch }).ok).toBe(false);
  });
  it('defaults verified to false when missing', () => {
    const { verified: _v, ...rest } = base;
    const r = validateOffer(rest);
    expect(r.ok && r.offer.verified).toBe(false);
  });
});

describe('validateOffersFile', () => {
  it('drops invalid entries with a warning and keeps valid ones', () => {
    const warn = vi.fn();
    const f = validateOffersFile({ schemaVersion: 1, updated: '2026-10-02', offers: [base, { ...base, id: 'x', sourceUrl: 'http://a' }, base] }, warn);
    expect(f.offers).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(2); // invalid + duplicate
  });
  it('throws on wrong schemaVersion', () => {
    expect(() => validateOffersFile({ schemaVersion: 2, offers: [] })).toThrow();
  });
  it('public/offers.json is valid with no dropped entries', () => {
    const raw = offersJson as { offers: unknown[] };
    const warn = vi.fn();
    const f = validateOffersFile(raw, warn);
    expect(warn).not.toHaveBeenCalled();
    expect(f.offers.length).toBe(raw.offers.length);
  });
});

describe('filterOffers', () => {
  const mk = (id: string, channel: Offer['channel'], countries: string[]): Offer => ({
    ...(base as unknown as Offer),
    id,
    channel,
    countries,
  });
  const offers = [mk('a', 'in-store', ['IN']), mk('b', 'online', ['IN']), mk('c', 'both', ['*']), mk('d', 'in-store', ['US'])];
  it('nearby: in-store/both for the country plus worldwide', () => {
    expect(filterOffers({ offers, country: 'IN', channel: 'nearby' }).map((o) => o.id)).toEqual(['a', 'c']);
  });
  it('online: online/both for the country plus worldwide', () => {
    expect(filterOffers({ offers, country: 'IN', channel: 'online' }).map((o) => o.id)).toEqual(['b', 'c']);
  });
  it('online without a country shows worldwide only; nearby shows nothing', () => {
    expect(filterOffers({ offers, country: null, channel: 'online' }).map((o) => o.id)).toEqual(['c']);
    expect(filterOffers({ offers, country: null, channel: 'nearby' })).toEqual([]);
  });
});

describe('monthInfo', () => {
  const oct = new Date(2026, 9, 2);
  it('detects the birthday month', () => {
    expect(monthInfo(10, oct)).toMatchObject({ isBirthdayMonth: true, monthsAway: 0 });
  });
  it('counts months away with wrap-around', () => {
    expect(monthInfo(1, oct)).toMatchObject({ isBirthdayMonth: false, monthsAway: 3, label: 'Your birthday month starts in 3 months' });
    expect(monthInfo(11, oct).label).toBe('Your birthday month starts next month');
    expect(monthInfo(9, oct).monthsAway).toBe(11);
  });
  it('rejects invalid months', () => {
    expect(() => monthInfo(0, oct)).toThrow();
    expect(() => monthInfo(13, oct)).toThrow();
  });
});

describe('isStale', () => {
  const now = new Date(Date.UTC(2026, 9, 2));
  it('is fresh within 6 months', () => expect(isStale('2026-05-01', now)).toBe(false));
  it('is stale after 6 months', () => expect(isStale('2026-03-01', now)).toBe(true));
  it('treats garbage as stale', () => expect(isStale('soon', now)).toBe(true));
});
