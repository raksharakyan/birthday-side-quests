import offersJson from '../../public/offers.json';
import { describe, expect, it } from 'vitest';
import { applyVerifiedFilter, filterOffers, nearbyOffers, validateOffersFile, VENUE_MAX_M } from '../../src/offers';
import { branchDirectionsUrl, formatApproxDistance, formatDistance } from '../../src/render/quests';
import type { Offer } from '../../src/types';

/*
 * QA: PR #4 (DECISIONS #24 venues, #25 Verified only). Complements tests/unit/venues.test.ts:
 * a city matrix on the shipped data with expectations computed independently (own haversine),
 * nearest-venue choice for multi-park Wonderla, and data invariants for every venue offer.
 */

const offers: Offer[] = validateOffersFile(offersJson, () => undefined).offers;
const venueOffers = offers.filter((o) => o.venues);

function hav(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(bLat - aLat) / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLng - aLng) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const CITIES: Record<string, { lat: number; lng: number }> = {
  Pune: { lat: 18.5204, lng: 73.8567 },
  Chennai: { lat: 13.0827, lng: 80.2707 },
  Delhi: { lat: 28.6139, lng: 77.209 },
  Hyderabad: { lat: 17.385, lng: 78.4867 },
  Kochi: { lat: 9.9312, lng: 76.2673 },
  Mysuru: { lat: 12.2958, lng: 76.6394 },
  Bhubaneswar: { lat: 20.2961, lng: 85.8245 },
  Nashik: { lat: 19.9975, lng: 73.7898 },
  Thane: { lat: 19.2183, lng: 72.9781 },
  Kolkata: { lat: 22.5726, lng: 88.3639 },
  Jaipur: { lat: 26.9124, lng: 75.7873 },
};

/** Independent oracle: venue offers whose nearest venue is within 150 km, with that venue's name. */
function expectedVenues(at: { lat: number; lng: number }): Map<string, { name: string; km: number }> {
  const out = new Map<string, { name: string; km: number }>();
  for (const o of venueOffers) {
    const best = o.venues!.map((v) => ({ name: v.name, d: hav(at.lat, at.lng, v.lat, v.lng) })).sort((a, b) => a.d - b.d)[0]!;
    if (best.d <= 150_000) out.set(o.id, { name: best.name, km: best.d / 1000 });
  }
  return out;
}

describe('QA PR4: venue offers on the shipped data', () => {
  it('has exactly the 4 venue offers, all in-store, IN only, without osm hints', () => {
    expect(venueOffers.map((o) => o.id).sort()).toEqual(['imagicaa-in', 'water-kingdom-in', 'wetnjoy-lonavala-in', 'wonderla-in']);
    for (const o of venueOffers) {
      expect(o.channel).toBe('in-store');
      expect(o.countries).toEqual(['IN']);
      expect(o.osm).toBeUndefined();
    }
    expect(venueOffers.find((o) => o.id === 'wonderla-in')!.venues).toHaveLength(5);
  });

  it('only Wet’nJoy is approximate; every venue lies inside India’s bounding box', () => {
    for (const o of venueOffers) {
      for (const v of o.venues!) {
        expect(v.exact).toBe(o.id !== 'wetnjoy-lonavala-in');
        expect(v.lat).toBeGreaterThan(6);
        expect(v.lat).toBeLessThan(36);
        expect(v.lng).toBeGreaterThan(68);
        expect(v.lng).toBeLessThan(98);
        expect(v.name).not.toMatch(/[—<>]/);
      }
    }
  });

  it('venue offers never reach the Online tab for any country', () => {
    for (const c of ['IN', 'US', 'GB', null]) {
      const ids = filterOffers({ offers, country: c, channel: 'online' }).map((o) => o.id);
      for (const o of venueOffers) expect(ids).not.toContain(o.id);
    }
  });

  for (const [city, at] of Object.entries(CITIES)) {
    it(`${city}: Nearby venue offers match the independent 150 km oracle (and pick the nearest park)`, () => {
      const want = expectedVenues(at);
      const { offers: list, venues } = nearbyOffers({ offers, country: 'IN', lat: at.lat, lng: at.lng });
      const gotIds = list.filter((o) => o.venues).map((o) => o.id).sort();
      expect(gotIds).toEqual([...want.keys()].sort());
      expect([...venues.keys()].sort()).toEqual([...want.keys()].sort());
      for (const [id, w] of want) {
        expect(venues.get(id)!.venue.name).toBe(w.name);
        expect(venues.get(id)!.distanceM / 1000).toBeCloseTo(w.km, 0);
        expect(venues.get(id)!.distanceM).toBeLessThanOrEqual(VENUE_MAX_M);
      }
      // Chains are untouched by the venue rule.
      expect(list.filter((o) => !o.venues).length).toBe(filterOffers({ offers, country: 'IN', channel: 'nearby' }).filter((o) => !o.venues).length);
    });
  }

  it('the user report: Kolkata never lists Imagicaa (or any park); Delhi and Jaipur list no parks either', () => {
    for (const c of ['Kolkata', 'Delhi', 'Jaipur']) {
      const at = CITIES[c]!;
      expect(nearbyOffers({ offers, country: 'IN', lat: at.lat, lng: at.lng }).venues.size).toBe(0);
    }
  });

  it('Pune gets all three Mumbai-area parks (Water Kingdom is about 136 km, inside 150 km), not Wonderla', () => {
    const { venues } = nearbyOffers({ offers, country: 'IN', ...CITIES.Pune! });
    expect([...venues.keys()].sort()).toEqual(['imagicaa-in', 'water-kingdom-in', 'wetnjoy-lonavala-in']);
    expect(Math.round(venues.get('imagicaa-in')!.distanceM / 1000)).toBe(67);
    expect(Math.round(venues.get('water-kingdom-in')!.distanceM / 1000)).toBe(136);
    expect(formatApproxDistance(venues.get('wetnjoy-lonavala-in')!.distanceM)).toBe('about 48 km away');
    expect(formatDistance(venues.get('imagicaa-in')!.distanceM)).toBe('67 km away');
  });

  it('Wonderla resolves to the right park per city', () => {
    const name = (c: string) => nearbyOffers({ offers, country: 'IN', ...CITIES[c]! }).venues.get('wonderla-in')?.venue.name;
    expect(name('Chennai')).toBe('Wonderla Chennai');
    expect(name('Hyderabad')).toBe('Wonderla Hyderabad');
    expect(name('Kochi')).toBe('Wonderla Kochi');
    expect(name('Mysuru')).toBe('Wonderla Bengaluru');
    expect(name('Bhubaneswar')).toBe('Wonderla Bhubaneswar');
    expect(name('Pune')).toBeUndefined();
  });

  it('a searched country other than IN never lists the Indian parks, even at the same point', () => {
    const at = CITIES.Pune!;
    expect(nearbyOffers({ offers, country: 'US', lat: at.lat, lng: at.lng }).venues.size).toBe(0);
    expect(nearbyOffers({ offers, country: null, lat: at.lat, lng: at.lng }).offers).toEqual([]);
  });

  it('directions: exact parks link to coordinates; Wet’nJoy links by name', () => {
    const wet = venueOffers.find((o) => o.id === 'wetnjoy-lonavala-in')!.venues![0]!;
    expect(branchDirectionsUrl({ offerId: 'x', name: wet.name, lat: wet.lat, lng: wet.lng, approximate: true })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=Wet%27nJoy%20Water%20Park%20Lonavala',
    );
    const chennai = venueOffers.find((o) => o.id === 'wonderla-in')!.venues!.find((v) => v.name === 'Wonderla Chennai')!;
    expect(branchDirectionsUrl({ offerId: 'x', name: chennai.name, lat: chennai.lat, lng: chennai.lng })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=12.7427,80.1742',
    );
  });
});

describe('QA PR4: Verified only on the shipped data', () => {
  it('every venue offer is verified, so Verified only keeps the parks', () => {
    for (const o of venueOffers) expect(o.verified).toBe(true);
    const { offers: list } = nearbyOffers({ offers, country: 'IN', ...CITIES.Pune! });
    expect(applyVerifiedFilter(list, true).filter((o) => o.venues).map((o) => o.id).sort()).toEqual([
      'imagicaa-in', 'water-kingdom-in', 'wetnjoy-lonavala-in',
    ]);
  });

  it('India has both verified and unverified Nearby and Online offers (the switch actually filters)', () => {
    const nearby = filterOffers({ offers, country: 'IN', channel: 'nearby' });
    const online = filterOffers({ offers, country: 'IN', channel: 'online' });
    for (const l of [nearby, online]) {
      expect(applyVerifiedFilter(l, true).length).toBeGreaterThan(0);
      expect(applyVerifiedFilter(l, true).length).toBeLessThan(l.length);
    }
  });

  it('does not mutate the input or reorder it', () => {
    const before = offers.map((o) => o.id);
    const out = applyVerifiedFilter(offers, true);
    expect(offers.map((o) => o.id)).toEqual(before);
    expect(out.map((o) => o.id)).toEqual(before.filter((id) => offers.find((o) => o.id === id)!.verified));
  });
});
