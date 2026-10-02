/**
 * QA coverage for pure modules beyond the existing per-module tests:
 * offer filtering, month logic across year boundaries, URL builders, text sanitisation,
 * Worker-result validation, Overpass coordinate edge cases and template determinism.
 */
import { describe, expect, it } from 'vitest';
import { liveSearch, validateLiveResults, workerBaseUrl } from '../../src/liveSearch';
import { filterOffers, isStale, monthInfo } from '../../src/offers';
import { parseOverpass } from '../../src/overpass';
import { questLine, hashString, QUEST_TEMPLATES } from '../../src/templates';
import { cleanDisplayText } from '../../src/text';
import type { Category, Offer } from '../../src/types';
import { directionsUrl, displayHost, safeHttpsUrl } from '../../src/urls';

const mk = (id: string, channel: Offer['channel'], countries: string[], extra: Partial<Offer> = {}): Offer => ({
  id,
  brand: id,
  category: 'cafe',
  offer: 'o',
  howToClaim: 'h',
  countries,
  channel,
  claimWindow: 'day',
  sourceUrl: 'https://example.com',
  lastVerified: '2026-10-02',
  verified: true,
  rewardType: 'free',
  needsPastSpend: false,
  ...extra,
});

describe('filterOffers — country/channel edge cases', () => {
  const offers = [
    mk('in-store-in', 'in-store', ['IN']),
    mk('online-in', 'online', ['IN']),
    mk('both-in-us', 'both', ['IN', 'US']),
    mk('global-store', 'in-store', ['*']),
    mk('global-online', 'online', ['*']),
    mk('global-both', 'both', ['*']),
    mk('us-only', 'both', ['US']),
  ];
  const ids = (country: string | null, channel: 'nearby' | 'online') => filterOffers({ offers, country, channel }).map((o) => o.id);

  it('"*" offers appear for every country in the matching channel', () => {
    expect(ids('FR', 'nearby')).toEqual(['global-store', 'global-both']);
    expect(ids('FR', 'online')).toEqual(['global-online', 'global-both']);
  });
  it('"both" offers appear in both tabs', () => {
    expect(ids('IN', 'nearby')).toContain('both-in-us');
    expect(ids('IN', 'online')).toContain('both-in-us');
  });
  it('in-store-only never shows on the Online tab; online-only never on Nearby', () => {
    expect(ids('IN', 'online')).not.toContain('in-store-in');
    expect(ids('IN', 'nearby')).not.toContain('online-in');
  });
  it.each(['in', 'In', 'IND', ' IN', 'I', '', '*', '1N'])('non-canonical country %j is treated as "no country"', (c) => {
    expect(ids(c, 'nearby')).toEqual([]);
    expect(ids(c, 'online')).toEqual(['global-online', 'global-both']);
  });
  it('preserves source order and never mutates input', () => {
    const before = JSON.stringify(offers);
    expect(ids('US', 'nearby')).toEqual(['both-in-us', 'global-store', 'global-both', 'us-only']);
    expect(JSON.stringify(offers)).toBe(before);
  });
  it('a country with no offers and no worldwide ones gives an empty list', () => {
    const local = [mk('a', 'in-store', ['IN'])];
    expect(filterOffers({ offers: local, country: 'FR', channel: 'nearby' })).toEqual([]);
    expect(filterOffers({ offers: local, country: 'FR', channel: 'online' })).toEqual([]);
    expect(filterOffers({ offers: [], country: 'IN', channel: 'online' })).toEqual([]);
  });
});

describe('monthInfo — year boundaries', () => {
  // Local-time dates, matching monthInfo's use of getMonth().
  it('December birthday seen in January is 11 months away', () => {
    expect(monthInfo(12, new Date(2027, 0, 15))).toMatchObject({ isBirthdayMonth: false, monthsAway: 11 });
  });
  it('January birthday seen in December is next month', () => {
    const info = monthInfo(1, new Date(2026, 11, 31, 23, 59));
    expect(info).toMatchObject({ isBirthdayMonth: false, monthsAway: 1, label: 'Your birthday month starts next month' });
  });
  it('December birthday in December is live; January 1st flips it', () => {
    expect(monthInfo(12, new Date(2026, 11, 31, 23, 59, 59)).isBirthdayMonth).toBe(true);
    expect(monthInfo(12, new Date(2027, 0, 1, 0, 0, 0)).isBirthdayMonth).toBe(false);
  });
  it('every (birth, current) pair gives 0..11 and a matching label', () => {
    for (let cur = 0; cur < 12; cur++) {
      for (let b = 1; b <= 12; b++) {
        const info = monthInfo(b, new Date(2026, cur, 10));
        expect(info.monthsAway).toBeGreaterThanOrEqual(0);
        expect(info.monthsAway).toBeLessThan(12);
        expect((cur + info.monthsAway) % 12).toBe(b - 1);
        if (info.monthsAway >= 2) expect(info.label).toContain(`in ${info.monthsAway} months`);
      }
    }
  });
  it.each([1.5, Number.NaN, -1, Number.POSITIVE_INFINITY])('rejects %s', (m) => {
    expect(() => monthInfo(m)).toThrow(RangeError);
  });
});

describe('isStale — boundaries', () => {
  it('exactly 6 months is still fresh; 1 ms later is stale', () => {
    const limit = Date.UTC(2027, 3, 2); // 2026-10-02 + 6 months
    expect(isStale('2026-10-02', new Date(limit))).toBe(false);
    expect(isStale('2026-10-02', new Date(limit + 1))).toBe(true);
  });
  it('crosses the year boundary (Aug → Feb next year)', () => {
    expect(isStale('2026-08-15', new Date(Date.UTC(2027, 1, 14)))).toBe(false);
    expect(isStale('2026-08-15', new Date(Date.UTC(2027, 1, 16)))).toBe(true);
  });
  it('a future lastVerified is not stale', () => {
    expect(isStale('2027-01-01', new Date(Date.UTC(2026, 9, 2)))).toBe(false);
  });
  it.each(['2026-02-30', '2026-13-01', '26-10-02', '2026/10/02', '', '2026-10-02T00:00:00Z'])('invalid date %j is stale', (d) => {
    expect(isStale(d, new Date(Date.UTC(2026, 9, 2)))).toBe(true);
  });
});

describe('directionsUrl — rounding, clamping and rejection', () => {
  const D = 'https://www.google.com/maps/dir/?api=1&destination=';
  it.each([
    [12.975, 77.6, '12.975,77.6'],
    [0, 0, '0,0'],
    [-0, -0, '0,0'],
    [-0.0000001, 0.0000004, '0,0'],
    [1.0000005, -1.23456789, '1.000001,-1.234568'],
    [-33.8688197, 151.20929551, '-33.86882,151.209296'],
    [90, -180, '90,-180'],
    [90.0000001, 180.5, '90,180'],
    [-1e9, 1e9, '-90,180'],
    [Number.MAX_VALUE, -Number.MAX_VALUE, '90,-180'],
  ])('(%s, %s) → %s', (lat, lng, dest) => {
    expect(directionsUrl(lat, lng)).toBe(`${D}${dest}`);
  });
  it.each([
    [Number.NaN, 1],
    [1, Number.NaN],
    [Number.POSITIVE_INFINITY, 1],
    [1, Number.NEGATIVE_INFINITY],
    ['12' as unknown as number, 1],
    [null as unknown as number, 1],
    [undefined as unknown as number, 1],
  ])('rejects (%s, %s)', (lat, lng) => {
    expect(() => directionsUrl(lat, lng)).toThrow(RangeError);
  });
  it('output never contains anything but the fixed prefix and two numbers', () => {
    for (const [la, ln] of [[1e-7, -1e-7], [45.123456789, -122.987654321], [-89.9999999, 179.9999999]] as const) {
      expect(directionsUrl(la, ln)).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=-?\d+(\.\d{1,6})?,-?\d+(\.\d{1,6})?$/);
    }
  });
});

describe('safeHttpsUrl — scheme and whitespace tricks', () => {
  it.each([
    'javascript:alert(1)',
    ' javascript:alert(1)',
    '\tjavascript:alert(1)',
    '\njavascript:alert(1)',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    'jav&#x09;ascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'javascript://example.com/%0aalert(1)',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'DATA:image/svg+xml,<svg onload=alert(1)>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'blob:https://example.com/uuid',
    'ftp://example.com',
    'ws://example.com',
    'wss://example.com',
    'http://example.com',
    'HTTP://example.com',
    'https://user:pass@example.com/',
    'https://user@example.com/',
    'https://:pass@example.com/',
    'https://example.com@evil.example/',
    '//evil.example/x',
    ' //evil.example/x',
    '\\\\evil.example\\x',
    '/\\evil.example',
    'https:',
    'https://',
    'https:///',
    'about:blank',
    'mailto:a@b.c',
    'tel:123',
  ])('rejects %j', (u) => {
    expect(safeHttpsUrl(u)).toBeNull();
  });

  it.each([
    ['  https://example.com/a  ', 'https://example.com/a'],
    ['\nhttps://example.com/\t', 'https://example.com/'],
    ['HTTPS://EXAMPLE.COM/A', 'https://example.com/A'],
    ['https://example.com/a b', 'https://example.com/a%20b'],
    ['https://example.com/"><script>', 'https://example.com/%22%3E%3Cscript%3E'],
  ])('normalises %j to %j', (input, out) => {
    expect(safeHttpsUrl(input)).toBe(out);
  });

  it('whatever it returns is always an https: URL without credentials', () => {
    const inputs = ['https:\\\\example.com', 'https:/example.com', '\u0000https://example.com', 'https://例え.jp/', 'https://[::1]/', 'https://1.2.3.4'];
    for (const i of inputs) {
      const r = safeHttpsUrl(i);
      if (r === null) continue;
      const u = new URL(r);
      expect(u.protocol).toBe('https:');
      expect(u.username + u.password).toBe('');
      expect(r).not.toMatch(/\s/);
    }
  });

  it('displayHost returns "" for garbage and strips only a leading www.', () => {
    expect(displayHost('not a url')).toBe('');
    expect(displayHost('https://wwwx.example.com/')).toBe('wwwx.example.com');
    expect(displayHost('https://www.www.example.com/')).toBe('www.example.com');
  });
});

describe('text sanitisation (cleanDisplayText)', () => {
  it('collapses newlines/tabs and trims', () => {
    expect(cleanDisplayText('  a\n\tb\r\n  c  ', 50)).toBe('a b c');
  });
  it('never splits into an empty string because of padding', () => {
    expect(cleanDisplayText(`${' '.repeat(1000)}x`, 5)).toBe('');
    // Documented behaviour: input is pre-sliced to max*4 code units before cleaning.
    expect(cleanDisplayText(`${' '.repeat(10)}x`, 5)).toBe('x');
  });
  it('keeps HTML-looking text verbatim (rendered with textContent, never parsed)', () => {
    expect(cleanDisplayText('<script>alert(1)</script>', 100)).toBe('<script>alert(1)</script>');
  });
  it('keeps emoji and astral characters', () => {
    expect(cleanDisplayText('🎂 Café 👩‍👩‍👧', 50)).toBe('🎂 Café 👩‍👩‍👧');
  });
  it('a string made only of invisible/bidi characters becomes empty', () => {
    const junk = String.fromCodePoint(0x202e, 0x200b, 0x2066, 0xfeff, 0x061c);
    expect(cleanDisplayText(junk, 50)).toBe('');
  });
  it.each([undefined, null, 1, {}, [], true])('non-string %j → ""', (v) => {
    expect(cleanDisplayText(v, 10)).toBe('');
  });
});

describe('validateLiveResults — Worker payload hardening', () => {
  const RLO = String.fromCodePoint(0x202e);
  it('drops items whose title is empty after cleaning', () => {
    expect(validateLiveResults([{ title: `${RLO}​ `, url: 'https://e.com' }])).toEqual([]);
  });
  it('skips nested arrays/null/primitive items without throwing', () => {
    expect(validateLiveResults([null, 1, 'x', [], [{ title: 't', url: 'https://e.com' }]])).toEqual([]);
  });
  it('fills snippet with "" and source from the URL host when missing/invalid', () => {
    expect(validateLiveResults([{ title: 'T', url: 'https://www.e.com/x', snippet: 5, source: {} }])).toEqual([
      { title: 'T', url: 'https://www.e.com/x', snippet: '', source: 'e.com' },
    ]);
  });
  it.each(['javascript:alert(1)', 'data:text/html,x', 'http://e.com', '//e.com', 'https://u:p@e.com'])('drops url %j', (url) => {
    expect(validateLiveResults([{ title: 'T', url }])).toEqual([]);
  });
  it('ignores prototype-pollution style keys', () => {
    const payload = JSON.parse('[{"title":"T","url":"https://e.com","__proto__":{"polluted":true}}]') as unknown;
    validateLiveResults(payload);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('Worker client (liveSearch)', () => {
  it('workerBaseUrl rejects non-https and credentials; strips query, hash and trailing slashes', () => {
    expect(workerBaseUrl('http://w.example')).toBeNull();
    expect(workerBaseUrl('https://u:p@w.example')).toBeNull();
    expect(workerBaseUrl('javascript:alert(1)')).toBeNull();
    expect(workerBaseUrl('')).toBeNull();
    expect(workerBaseUrl('https://w.example/api/?x=1#h')).toBe('https://w.example/api');
  });
  it('liveSearch returns [] without a configured Worker (unit env has no VITE_WORKER_URL)', async () => {
    let called = false;
    const r = await liveSearch(10, 'IN', (async () => {
      called = true;
      return new Response('[]');
    }) as unknown as typeof fetch);
    expect(r).toEqual([]);
    expect(called).toBe(false);
  });
});

describe('parseOverpass — coordinate edge cases (QA-01)', () => {
  const sb = mk('sb', 'in-store', ['IN'], { osm: { wikidata: 'Q37158' } });
  const node = (lat: unknown, lon: unknown) => ({ type: 'node', lat, lon, tags: { 'brand:wikidata': 'Q37158', name: 'Starbucks' } });
  it.each([
    [null, 1],
    [1, null],
    ['', 1],
    ['12.9', 77.6],
    [true, 1],
    [Number.NaN, 1],
    [91, 1],
    [1, -181],
  ])('drops element with lat=%j lon=%j', (lat, lon) => {
    expect(parseOverpass({ elements: [node(lat, lon)] }, [sb])).toEqual([]);
  });
  it('a way without center is dropped; with center it is used', () => {
    const way = { type: 'way', tags: { 'brand:wikidata': 'Q37158' } };
    expect(parseOverpass({ elements: [way] }, [sb])).toEqual([]);
    expect(parseOverpass({ elements: [{ ...way, center: { lat: 1, lon: 2 } }] }, [sb])).toEqual([
      { offerId: 'sb', name: 'sb', lat: 1, lng: 2 },
    ]);
  });
  it('HTML-looking names stay as text', () => {
    const [b] = parseOverpass(
      { elements: [{ type: 'node', lat: 1, lon: 2, tags: { 'brand:wikidata': 'Q37158', name: '<svg onload=alert(1)>' } }] },
      [sb],
    );
    expect(b?.name).toBe('<svg onload=alert(1)>');
  });
});

describe('templates — determinism', () => {
  const categories = Object.keys(QUEST_TEMPLATES) as Category[];

  it('FNV-1a reference values', () => {
    expect(hashString('')).toBe(0x811c9dc5);
    expect(hashString('a')).toBe(0xe40c292c);
    expect(hashString('foobar')).toBe(0xbf9cf968);
  });
  it('every template contains {brand} exactly once', () => {
    for (const c of categories) for (const t of QUEST_TEMPLATES[c]) expect(t.split('{brand}').length - 1).toBe(1);
  });
  it('the line is the template picked by hash(brand) % n, independent of call order', () => {
    const brands = ['Starbucks', 'Tata Starbucks', 'Nykaa', 'Krispy Kreme', 'Häagen-Dazs', '😀', ''];
    const first = brands.flatMap((b) => categories.map((c) => questLine(c, b)));
    const second = [...brands].reverse().flatMap((b) => categories.map((c) => questLine(c, b))).reverse();
    // Same multiset regardless of order; and each is the hashed template.
    expect([...second].sort()).toEqual([...first].sort());
    for (const b of brands) {
      for (const c of categories) {
        const list = QUEST_TEMPLATES[c];
        expect(questLine(c, b)).toBe((list[hashString(b) % list.length] ?? '').split('{brand}').join(b));
      }
    }
  });
  it('an unknown category falls back to retail', () => {
    expect(questLine('casino' as Category, 'X')).toBe(questLine('retail', 'X'));
  });
  it('brand text is inserted literally (no $-patterns, no nested {brand} expansion)', () => {
    expect(questLine('cafe', '{brand}')).toContain('{brand}');
    expect(questLine('cafe', '{brand}').split('{brand}').length - 1).toBe(1);
    expect(questLine('dessert', "$' $` $$")).toContain("$' $` $$");
    expect(questLine('beauty', '<b>x</b>')).toContain('<b>x</b>');
  });
});
