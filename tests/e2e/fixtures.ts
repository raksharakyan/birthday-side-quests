import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page, Route } from '@playwright/test';

export const WORKER_ORIGIN = 'https://bsq-worker.e2e.example';

// 1x1 transparent PNG
export const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

export const NOMINATIM_BENGALURU = [
  {
    lat: '12.9767936',
    lon: '77.590082',
    display_name: 'Bengaluru, Karnataka, India',
    address: { city: 'Bengaluru', country_code: 'in' },
  },
];

export const OVERPASS_BENGALURU = {
  elements: [
    { type: 'node', id: 1, lat: 12.975, lon: 77.6, tags: { name: 'Starbucks MG Road', 'brand:wikidata': 'Q37158' } },
    { type: 'way', id: 2, center: { lat: 12.97, lon: 77.58 }, tags: { name: 'Third Wave Coffee Church Street' } },
    { type: 'node', id: 3, lat: 12.9719, lon: 77.6412, tags: { name: 'Theobroma Indiranagar' } },
    { type: 'node', id: 4, lat: 12.9345, lon: 77.6101, tags: { name: 'The Body Shop Forum Mall', 'brand:wikidata': 'Q837851' } },
  ],
};

/** Number of mocked Overpass elements above that match an offer (one pin each). */
export const OVERPASS_BENGALURU_PINS = 4;

const photonFeature = (props: Record<string, unknown>, lng: number, lat: number) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [lng, lat] },
  properties: { osm_key: 'place', ...props },
});

/** Photon FeatureCollection (city layer) returned for any query by default (5 places). */
export const PHOTON_BENG = {
  type: 'FeatureCollection',
  features: [
    photonFeature({ name: 'Bengaluru', county: 'Bangalore North', state: 'Karnataka', country: 'India', countrycode: 'IN', type: 'city' }, 77.5946, 12.9716),
    photonFeature({ name: 'Pune', county: 'Pune City', state: 'Maharashtra', country: 'India', countrycode: 'IN', type: 'city' }, 73.8567, 18.5204),
    photonFeature({ name: 'Benguela', state: 'Benguela', country: 'Angola', countrycode: 'AO', type: 'city' }, 13.4055, -12.5763),
    photonFeature({ name: 'Benghazi', state: 'Benghazi', country: 'Libya', countrycode: 'LY', type: 'city' }, 20.07, 32.11),
    photonFeature({ name: 'Bengbu', state: 'Anhui Province', country: 'China', countrycode: 'CN', type: 'city' }, 117.38, 32.92),
  ],
};
export const PHOTON_FIRST_LABEL = 'Bengaluru, Bangalore North, Karnataka, India';
export const PHOTON_PUNE_LABEL = 'Pune, Pune City, Maharashtra, India';

export interface SeedOffer {
  id: string;
  brand: string;
  rewardType: 'free' | 'discount';
  needsPastSpend: boolean;
  channel: string;
  countries: string[];
  verified?: boolean;
  venues?: Array<{ name: string; lat: number; lng: number; exact?: boolean }>;
}

/** Coordinates the default mocks resolve to (Nominatim Bengaluru). */
export const BENGALURU = { lat: 12.9767936, lng: 77.590082 };
/** Venue offers (theme parks) are listed only within this distance of the searched point (DECISIONS #24). */
export const VENUE_MAX_M = 150_000;

export function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(toRad(bLat - aLat) / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(toRad(bLng - aLng) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function seedOffers(): SeedOffer[] {
  return (JSON.parse(readFileSync(resolve(process.cwd(), 'public/offers.json'), 'utf8')) as { offers: SeedOffer[] }).offers;
}

/**
 * Nearby offers for a country at a searched point, from the shipped public/offers.json: in-store or
 * both, minus venue offers whose nearest venue is further than VENUE_MAX_M.
 */
export function expectedNearbyOffers(country: string, at: { lat: number; lng: number } = BENGALURU): SeedOffer[] {
  return seedOffers().filter((o) => {
    if (!(o.channel === 'in-store' || o.channel === 'both')) return false;
    if (!(o.countries.includes('*') || o.countries.includes(country))) return false;
    if (!o.venues) return true;
    return Math.min(...o.venues.map((v) => haversineM(at.lat, at.lng, v.lat, v.lng))) <= VENUE_MAX_M;
  });
}

/** Expected Nearby card count (see expectedNearbyOffers). Defaults to the mocked Bengaluru point. */
export function expectedNearbyCount(country: string, at: { lat: number; lng: number } = BENGALURU): number {
  return expectedNearbyOffers(country, at).length;
}

/** Quest tier per DECISIONS #27: 0 free, 1 discount, 2 needs past spend. */
export const TYPE_TIER: Record<string, number> = { free: 0, discount: 1, past: 2 };

/** Quest types (data-quest-type of each card's type chip) in DOM order for a card locator. */
export async function cardTypes(page: Page, selector: string): Promise<string[]> {
  return page
    .locator(selector)
    .evaluateAll((cs) => cs.map((c) => c.querySelector('.badge--type')?.getAttribute('data-quest-type') ?? ''));
}

/** True when tiers never go backwards, and distances (if given) ascend within each tier. */
export function isTierThenDistanceOrder(types: string[], metres?: number[]): boolean {
  for (let i = 1; i < types.length; i++) {
    const a = TYPE_TIER[types[i - 1] ?? ''] ?? NaN;
    const b = TYPE_TIER[types[i] ?? ''] ?? NaN;
    if (!(a <= b)) return false;
    if (metres && a === b && (metres[i - 1] ?? NaN) > (metres[i] ?? NaN)) return false;
  }
  return true;
}

export const WORKER_RESULTS = [
  { title: 'Birthday freebies in India this October', url: 'https://deals.example/birthday', snippet: 'A list of treats.', source: 'deals.example' },
  { title: '<img src=x onerror=alert(1)>', url: 'javascript:alert(1)', snippet: 'should be dropped', source: 'evil' },
];

export interface MockOptions {
  nominatim?: (route: Route) => Promise<void>;
  overpass?: (route: Route) => Promise<void>;
  worker?: (route: Route) => Promise<void>;
  photon?: (route: Route) => Promise<void>;
}

/** Mocks every external host; anything unexpected is aborted and recorded. */
export async function mockNetwork(page: Page, opts: MockOptions = {}): Promise<string[]> {
  const unexpected: string[] = [];
  await page.route(
    (url) => url.hostname !== 'localhost' && url.hostname !== '127.0.0.1',
    async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === 'nominatim.openstreetmap.org') {
        return opts.nominatim ? opts.nominatim(route) : route.fulfill({ json: NOMINATIM_BENGALURU, headers: { 'Access-Control-Allow-Origin': '*' } });
      }
      if (url.hostname === 'overpass-api.de') {
        return opts.overpass ? opts.overpass(route) : route.fulfill({ json: OVERPASS_BENGALURU, headers: { 'Access-Control-Allow-Origin': '*' } });
      }
      if (url.hostname === 'photon.komoot.io') {
        return opts.photon ? opts.photon(route) : route.fulfill({ json: PHOTON_BENG, headers: { 'Access-Control-Allow-Origin': '*' } });
      }
      if (url.hostname === 'tile.openstreetmap.org') {
        return route.fulfill({ body: PNG_1PX, contentType: 'image/png' });
      }
      if (url.origin === WORKER_ORIGIN) {
        return opts.worker
          ? opts.worker(route)
          : route.fulfill({ json: WORKER_RESULTS, headers: { 'Access-Control-Allow-Origin': '*' } });
      }
      unexpected.push(url.toString());
      return route.abort();
    },
  );
  return unexpected;
}
