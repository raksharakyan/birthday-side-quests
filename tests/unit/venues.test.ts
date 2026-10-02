import offersJson from '../../public/offers.json';
import { describe, expect, it } from 'vitest';
import {
  applyVerifiedFilter, filterOffers, nearbyOffers, nearestVenue, validateOffer, validateOffersFile, VENUE_MAX_M,
} from '../../src/offers';
import { branchDirectionsUrl, formatApproxDistance } from '../../src/render/quests';
import { directionsUrlByName, DIRECTIONS_NAME_MAX } from '../../src/urls';
import type { Offer } from '../../src/types';

const base = {
  id: 'test-park',
  brand: 'Test Park',
  category: 'retail',
  offer: 'Free entry',
  howToClaim: 'Book online',
  countries: ['IN'],
  channel: 'in-store',
  claimWindow: 'month',
  sourceUrl: 'https://example.com/birthday',
  lastVerified: '2026-10-02',
  verified: true,
};

const KOLKATA = { lat: 22.5726, lng: 88.3639 };
const BENGALURU = { lat: 12.9767936, lng: 77.590082 };
const MUMBAI = { lat: 19.076, lng: 72.8777 };

describe('validateOffer: venues', () => {
  it('accepts 1 to 20 venues and defaults exact to true', () => {
    const r = validateOffer({ ...base, venues: [{ name: 'Test Park North', lat: 12.5, lng: 77.5 }, { name: 'South', lat: -1, lng: 2, exact: false }] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.offer.venues).toEqual([
        { name: 'Test Park North', lat: 12.5, lng: 77.5, exact: true },
        { name: 'South', lat: -1, lng: 2, exact: false },
      ]);
    }
    const twenty = Array.from({ length: 20 }, (_, i) => ({ name: `V${i}`, lat: i, lng: i }));
    expect(validateOffer({ ...base, venues: twenty }).ok).toBe(true);
  });
  it('leaves venues absent when not given', () => {
    const r = validateOffer(base);
    expect(r.ok && r.offer.venues).toBe(undefined);
  });
  it('trims the venue name and drops unknown venue fields', () => {
    const r = validateOffer({ ...base, venues: [{ name: '  Park  ', lat: 1, lng: 1, href: 'javascript:alert(1)' }] });
    expect(r.ok && r.offer.venues).toEqual([{ name: 'Park', lat: 1, lng: 1, exact: true }]);
  });
  it.each([
    ['empty array', []],
    ['21 venues', Array.from({ length: 21 }, (_, i) => ({ name: `V${i}`, lat: 0, lng: 0 }))],
    ['not an array', { name: 'Park', lat: 1, lng: 1 }],
    ['venue not an object', ['Park']],
    ['venue null', [null]],
    ['missing name', [{ lat: 1, lng: 1 }]],
    ['empty name', [{ name: '   ', lat: 1, lng: 1 }]],
    ['overlong name', [{ name: 'x'.repeat(81), lat: 1, lng: 1 }]],
    ['name with control char', [{ name: 'Pa\u0000rk', lat: 1, lng: 1 }]],
    ['name with bidi override', [{ name: `Park${String.fromCodePoint(0x202e)}`, lat: 1, lng: 1 }]],
    ['name not a string', [{ name: 42, lat: 1, lng: 1 }]],
    ['lat out of range', [{ name: 'Park', lat: 90.5, lng: 1 }]],
    ['lng out of range', [{ name: 'Park', lat: 1, lng: -180.1 }]],
    ['lat NaN', [{ name: 'Park', lat: Number.NaN, lng: 1 }]],
    ['lng Infinity', [{ name: 'Park', lat: 1, lng: Number.POSITIVE_INFINITY }]],
    ['lat as string', [{ name: 'Park', lat: '12.8', lng: 1 }]],
    ['lng missing', [{ name: 'Park', lat: 1 }]],
    ['exact as string', [{ name: 'Park', lat: 1, lng: 1, exact: 'false' }]],
    ['exact null', [{ name: 'Park', lat: 1, lng: 1, exact: null }]],
  ])('rejects %s', (_name, venues) => {
    const r = validateOffer({ ...base, venues });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('bad venues');
  });
  it('accepts the boundary coordinates', () => {
    expect(validateOffer({ ...base, venues: [{ name: 'Pole', lat: 90, lng: -180 }] }).ok).toBe(true);
  });
});

const park = (venues: Offer['venues'], extra: Partial<Offer> = {}): Offer => ({
  ...(base as unknown as Offer),
  venues,
  ...extra,
});

describe('nearestVenue', () => {
  const multi = park([
    { name: 'A', lat: 12.8346, lng: 77.4, exact: true },
    { name: 'B', lat: 10.0268, lng: 76.3918, exact: true },
  ]);
  it('returns the closest venue and its distance in metres', () => {
    const hit = nearestVenue(multi, BENGALURU.lat, BENGALURU.lng);
    expect(hit?.venue.name).toBe('A');
    expect(hit?.distanceM).toBeGreaterThan(20_000);
    expect(hit?.distanceM).toBeLessThan(30_000);
    expect(nearestVenue(multi, 9.93, 76.26)?.venue.name).toBe('B');
  });
  it('returns null without venues or for invalid coordinates', () => {
    expect(nearestVenue(park(undefined), 1, 1)).toBeNull();
    expect(nearestVenue(park([]), 1, 1)).toBeNull();
    expect(nearestVenue(multi, Number.NaN, 1)).toBeNull();
    expect(nearestVenue(multi, 1, 200)).toBeNull();
  });
  it('VENUE_MAX_M is 150 km', () => expect(VENUE_MAX_M).toBe(150_000));
});

describe('nearbyOffers (shipped offers.json)', () => {
  const offers = validateOffersFile(offersJson).offers;
  const ids = (lat: number, lng: number) => nearbyOffers({ offers, country: 'IN', lat, lng });

  it('Kolkata: no single-location parks', () => {
    const r = ids(KOLKATA.lat, KOLKATA.lng);
    const listed = r.offers.map((o) => o.id);
    for (const id of ['imagicaa-in', 'wonderla-in', 'water-kingdom-in', 'wetnjoy-lonavala-in']) expect(listed).not.toContain(id);
    expect(r.venues.size).toBe(0);
    // Chains are still listed.
    expect(listed).toContain('starbucks-in');
  });
  it('Bengaluru: Wonderla Bengaluru, not the Mumbai-area parks', () => {
    const r = ids(BENGALURU.lat, BENGALURU.lng);
    const listed = r.offers.map((o) => o.id);
    expect(listed).toContain('wonderla-in');
    expect(r.venues.get('wonderla-in')?.venue.name).toBe('Wonderla Bengaluru');
    expect(Math.round((r.venues.get('wonderla-in')?.distanceM ?? 0) / 1000)).toBe(26); // straight-line km
    for (const id of ['imagicaa-in', 'water-kingdom-in', 'wetnjoy-lonavala-in']) expect(listed).not.toContain(id);
  });
  it('Mumbai: Imagicaa, Water Kingdom and Wet’nJoy (approximate), no Wonderla', () => {
    const r = ids(MUMBAI.lat, MUMBAI.lng);
    const listed = r.offers.map((o) => o.id);
    expect(listed).toEqual(expect.arrayContaining(['imagicaa-in', 'water-kingdom-in', 'wetnjoy-lonavala-in']));
    expect(listed).not.toContain('wonderla-in');
    expect(r.venues.get('wetnjoy-lonavala-in')?.venue.exact).toBe(false);
  });
  it('the parks are in-store only, so they left the Online tab', () => {
    const online = filterOffers({ offers, country: 'IN', channel: 'online' }).map((o) => o.id);
    for (const id of ['imagicaa-in', 'wonderla-in', 'water-kingdom-in', 'wetnjoy-lonavala-in']) expect(online).not.toContain(id);
  });
  it('offers without venues are unaffected by distance', () => {
    const plain = filterOffers({ offers, country: 'IN', channel: 'nearby' }).filter((o) => !o.venues);
    expect(ids(KOLKATA.lat, KOLKATA.lng).offers.filter((o) => !o.venues)).toEqual(plain);
  });
  it('excludes an offer exactly beyond VENUE_MAX_M and keeps one inside', () => {
    const near = park([{ name: 'Near', lat: 0, lng: 1.3, exact: true }], { id: 'near-in' }); // ~144.6 km
    const far = park([{ name: 'Far', lat: 0, lng: 1.4, exact: true }], { id: 'far-in' }); // ~155.7 km
    const r = nearbyOffers({ offers: [near, far], country: 'IN', lat: 0, lng: 0 });
    expect(r.offers.map((o) => o.id)).toEqual(['near-in']);
  });
});

describe('applyVerifiedFilter', () => {
  const list = [{ id: 'a', verified: true }, { id: 'b', verified: false }, { id: 'c', verified: true }];
  it('keeps everything when off (as a copy)', () => {
    const out = applyVerifiedFilter(list, false);
    expect(out).toEqual(list);
    expect(out).not.toBe(list);
  });
  it('keeps only verified offers when on', () => expect(applyVerifiedFilter(list, true).map((o) => o.id)).toEqual(['a', 'c']));
  it('handles an empty list', () => expect(applyVerifiedFilter([], true)).toEqual([]));
});

describe('directionsUrlByName', () => {
  it('builds a Google Maps directions link with the name percent-encoded', () => {
    expect(directionsUrlByName("Wet'nJoy Water Park Lonavala")).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=Wet%27nJoy%20Water%20Park%20Lonavala',
    );
    expect(directionsUrlByName('  Imagicaa, Khopoli ')).toBe('https://www.google.com/maps/dir/?api=1&destination=Imagicaa%2C%20Khopoli');
  });
  it('cannot break out of the query value', () => {
    const url = new URL(directionsUrlByName('Park&api=2#frag?x=1 "q" (a)!*'));
    expect(url.origin).toBe('https://www.google.com');
    expect(url.hash).toBe('');
    expect([...url.searchParams.keys()]).toEqual(['api', 'destination']);
    expect(url.searchParams.get('api')).toBe('1');
    expect(url.searchParams.get('destination')).toBe('Park&api=2#frag?x=1 "q" (a)!*');
    expect(directionsUrlByName('(a)!*')).not.toMatch(/[()!*']/);
  });
  it.each([
    ['empty', ''],
    ['spaces only', '   '],
    ['too long', 'x'.repeat(DIRECTIONS_NAME_MAX + 1)],
    ['markup', '<img src=x onerror=alert(1)>'],
    ['control char', 'Park\u0000'],
    ['bidi override', `Park${String.fromCodePoint(0x202e)}moc.live`],
    ['zero-width space', 'Pa​rk'],
  ])('rejects %s', (_n, name) => {
    expect(() => directionsUrlByName(name)).toThrow();
  });
  it('rejects non-strings', () => expect(() => directionsUrlByName(42 as unknown as string)).toThrow());
  it('accepts exactly 120 characters', () => expect(() => directionsUrlByName('x'.repeat(120))).not.toThrow());
});

describe('venue cards: distance text and directions', () => {
  it('approximate distance is whole km with "about"', () => {
    expect(formatApproxDistance(47_400)).toBe('about 47 km away');
    expect(formatApproxDistance(300)).toBe('about 1 km away');
    expect(formatApproxDistance(Number.NaN)).toBe('');
  });
  it('exact venues use coordinates, approximate ones use the name', () => {
    expect(branchDirectionsUrl({ offerId: 'x', name: 'Wonderla Bengaluru', lat: 12.8346, lng: 77.4 })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=12.8346,77.4',
    );
    expect(branchDirectionsUrl({ offerId: 'x', name: "Wet'nJoy Water Park Lonavala", lat: 18.75, lng: 73.47, approximate: true })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=Wet%27nJoy%20Water%20Park%20Lonavala',
    );
  });
});
