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

interface SeedOffer {
  channel: string;
  countries: string[];
}

/** Expected Nearby card count for a country, derived from the shipped public/offers.json (in-store or both). */
export function expectedNearbyCount(country: string): number {
  const file = JSON.parse(readFileSync(resolve(process.cwd(), 'public/offers.json'), 'utf8')) as { offers: SeedOffer[] };
  return file.offers.filter(
    (o) => (o.channel === 'in-store' || o.channel === 'both') && (o.countries.includes('*') || o.countries.includes(country)),
  ).length;
}

export const WORKER_RESULTS = [
  { title: 'Birthday freebies in India this October', url: 'https://deals.example/birthday', snippet: 'A list of treats.', source: 'deals.example' },
  { title: '<img src=x onerror=alert(1)>', url: 'javascript:alert(1)', snippet: 'should be dropped', source: 'evil' },
];

export interface MockOptions {
  nominatim?: (route: Route) => Promise<void>;
  overpass?: (route: Route) => Promise<void>;
  worker?: (route: Route) => Promise<void>;
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
