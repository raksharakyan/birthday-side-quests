// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import offersJson from '../../public/offers.json';
import indexHtml from '../../index.html?raw';
import { validateOffer } from '../../src/offers';
import { branchDirectionsUrl } from '../../src/render/quests';
import { externalLink } from '../../src/render/dom';
import { directionsUrlByName, safeHttpsUrl } from '../../src/urls';
import { parseSession } from '../../src/session';

/** Security review of PR #4 (venues, directions by name, session v2, "Verified only"). */

const base = {
  id: 'park-in',
  brand: 'Park',
  category: 'retail',
  howToClaim: 'Book online',
  claimWindow: 'month',
  countries: ['IN'],
  channel: 'in-store',
  offer: 'Free entry on your birthday',
  sourceUrl: 'https://example.com/birthday',
  lastVerified: '2026-09-01',
  verified: true,
  rewardType: 'free',
  needsPastSpend: false,
};
const withVenue = (venue: Record<string, unknown>) => ({ ...base, venues: [{ name: 'Park One', lat: 18.7, lng: 73.4, exact: false, ...venue }] });

describe('PR #4: venue names must be usable in a directions-by-name link', () => {
  it('the base fixture is valid (so the rejections below are meaningful)', () => {
    expect(validateOffer(withVenue({})).ok).toBe(true);
  });
  it.each([
    ['angle brackets', 'Park <b>One</b>'],
    ['lone high surrogate', 'Park \uD800 One'],
    ['lone low surrogate', 'Park \uDC00'],
    ['bidi override', 'Park ‮ enO'],
  ])('rejects a venue name with %s', (_l, name) => {
    expect(validateOffer(withVenue({ name })).ok).toBe(false);
  });
  it('accepts an ordinary name with punctuation', () => {
    expect(validateOffer(withVenue({ name: "Wet'nJoy Water Park, Lonavala (Pune)" })).ok).toBe(true);
  });
  it.each([
    ['NaN', { lat: Number.NaN }],
    ['out of range lat', { lat: 91 }],
    ['out of range lng', { lng: -181 }],
    ['string coordinate', { lat: '18.7' }],
    ['non-boolean exact', { exact: 'false' }],
  ])('rejects %s', (_l, patch) => {
    expect(validateOffer(withVenue(patch)).ok).toBe(false);
  });
});

describe('PR #4: branchDirectionsUrl never throws and never leaves https Google Maps', () => {
  it('falls back to coordinates when an approximate name is unusable', () => {
    const url = branchDirectionsUrl({ offerId: 'x', name: 'bad <name>', lat: 18.75, lng: 73.47, approximate: true });
    expect(url).toBe('https://www.google.com/maps/dir/?api=1&destination=18.75,73.47');
  });
  it.each(['javascript:alert(1)', 'https://evil.example/', '//evil.example', 'x&origin=1,2#y', ' data:text/html,x'])(
    'keeps %j inside the destination value',
    (name) => {
      const url = new URL(directionsUrlByName(name));
      expect(url.protocol).toBe('https:');
      expect(url.host).toBe('www.google.com');
      expect(url.pathname).toBe('/maps/dir/');
      expect([...url.searchParams.keys()]).toEqual(['api', 'destination']);
      expect(url.searchParams.get('destination')).toBe(name.trim());
      expect(url.hash).toBe('');
      expect(safeHttpsUrl(url.href)).not.toBeNull();
    },
  );
  it('renders as an external link with rel noopener noreferrer', () => {
    const a = externalLink(branchDirectionsUrl({ offerId: 'x', name: "Wet'nJoy", lat: 1, lng: 2, approximate: true }), 'Go');
    expect(a.tagName).toBe('A');
    expect(a.getAttribute('href')).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=Wet%27nJoy$/);
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    expect(a.getAttribute('target')).toBe('_blank');
  });
});

describe('PR #4: session v2 tampering', () => {
  const v2 = { v: 2, city: 'Pune', lat: 18.5, lng: 73.8, countryCode: 'IN', month: 3, radius: 5000, tab: 'nearby', done: [], verifiedOnly: true };
  it.each([
    ['future version', { ...v2, v: 3 }],
    ['v1 tag with v2 keys', { ...v2, v: 1 }],
    ['v2 tag with v1 keys', (({ verifiedOnly: _x, ...r }) => r)(v2)],
    ['extra key', { ...v2, extra: 1 }],
  ])('rejects %s', (_l, rec) => {
    expect(parseSession(JSON.stringify(rec))).toBeNull();
  });
  it('rejects __proto__ / constructor keys', () => {
    expect(parseSession(`{"__proto__":{"verifiedOnly":true},${JSON.stringify(v2).slice(1)}`)).toBeNull();
    expect(parseSession(`{"constructor":{"prototype":{"x":1}},${JSON.stringify(v2).slice(1)}`)).toBeNull();
    expect(({} as Record<string, unknown>).verifiedOnly).toBeUndefined();
  });
  it('rejects oversized records before parsing', () => {
    expect(parseSession(JSON.stringify({ ...v2, city: 'a'.repeat(17_000) }))).toBeNull();
  });
});

describe('PR #4: shipped data and markup', () => {
  const file = offersJson as unknown as { offers: Array<Record<string, unknown>> };
  it('every shipped venue offer validates, sits in its country and is in-store', () => {
    const india = { lat: [6, 36] as const, lng: [68, 98] as const };
    for (const o of file.offers.filter((x) => x.venues)) {
      expect(validateOffer(o).ok).toBe(true);
      expect(o.channel).toBe('in-store');
      expect(o.osm).toBeUndefined();
      for (const v of o.venues as Array<{ lat: number; lng: number }>) {
        if ((o.countries as string[]).includes('IN')) {
          expect(v.lat).toBeGreaterThan(india.lat[0]);
          expect(v.lat).toBeLessThan(india.lat[1]);
          expect(v.lng).toBeGreaterThan(india.lng[0]);
          expect(v.lng).toBeLessThan(india.lng[1]);
        }
      }
    }
  });
  it('the Verified only switch is a real button with role=switch and aria-checked', () => {
    const html = indexHtml;
    const m = /<button[^>]*id="verified-only"[^>]*>/.exec(html);
    expect(m).not.toBeNull();
    expect(m![0]).toMatch(/type="button"/);
    expect(m![0]).toMatch(/role="switch"/);
    expect(m![0]).toMatch(/aria-checked="false"/);
    expect(m![0]).not.toMatch(/style=|on[a-z]+=/i);
  });
});
