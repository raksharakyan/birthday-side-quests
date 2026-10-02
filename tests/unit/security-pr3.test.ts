import offersJson from '../../public/offers.json';
import { describe, expect, it } from 'vitest';
import { buildPhotonUrl, parsePhoton } from '../../src/autocomplete';
import { NAME_REGEX_MAX_BRANCHING, nameRegexBranching, validateOffer, validateOffersFile } from '../../src/offers';
import { el, svg } from '../../src/render/dom';
import { parseSession, SESSION_FIELDS } from '../../src/session';

// Security review of PR #3 (autocomplete, session storage, claim details, soft premium port).

const base = {
  id: 'x', brand: 'Brand', category: 'cafe', offer: 'Free drink', howToClaim: 'App', countries: ['IN'],
  channel: 'in-store', sourceUrl: 'https://example.com', lastVerified: '2026-10-02',
  rewardType: 'free', needsPastSpend: false,
};

describe('svg() builds shape elements only', () => {
  it.each(['script', 'a', 'foreignObject', 'use', 'image', 'style', 'animate', 'set', 'iframe'])('rejects <%s>', (tag) => {
    expect(() => svg(tag)).toThrow();
  });
  it.each(['href', 'xlink:href', 'onload', 'style', 'attributeName', 'values'])('rejects attribute %s', (attr) => {
    expect(() => svg('path', { [attr]: 'x' })).toThrow();
  });
  it('still builds the icon shapes', () => {
    const node = svg('svg', { viewBox: '0 0 24 24' }, [svg('path', { d: 'M0 0' }), svg('circle', { cx: '1', cy: '1', r: '1' })]);
    expect(node.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(node.getAttribute('viewBox')).toBe('0 0 24 24');
  });
});

describe('el() label attribute (optgroup)', () => {
  it('is set as an inert plain-text attribute', () => {
    const g = el('optgroup', { label: '<img src=x onerror=alert(1)>' });
    expect(g.getAttribute('label')).toBe('<img src=x onerror=alert(1)>');
    expect(g.children).toHaveLength(0);
  });
});

describe('nameRegex backtracking bound (ReDoS)', () => {
  it('rejects stacked optional quantifiers and alternation bombs', () => {
    const stacked = `${'a?'.repeat(20)}${'a'.repeat(20)}`;
    expect(stacked.length).toBeLessThanOrEqual(100);
    expect(validateOffer({ ...base, osm: { nameRegex: stacked } }).ok).toBe(false);
    expect(validateOffer({ ...base, osm: { nameRegex: '(a|a)'.repeat(12) } }).ok).toBe(false);
  });
  it('accepts every shipped nameRegex with plenty of headroom', () => {
    const offers = (offersJson as { offers: Array<{ id: string; osm?: { nameRegex?: string } }> }).offers;
    for (const o of offers) {
      if (!o.osm?.nameRegex) continue;
      expect(nameRegexBranching(o.osm.nameRegex), o.id).toBeLessThanOrEqual(64);
    }
  });
  it('the shipped file validates without dropping anything', () => {
    const warnings: string[] = [];
    const file = validateOffersFile(offersJson, (m) => warnings.push(m));
    expect(warnings).toEqual([]);
    expect(file.offers.length).toBe((offersJson as { offers: unknown[] }).offers.length);
  });
  it('bound is below the cap for realistic patterns', () => {
    expect(nameRegexBranching("kiehl('|’)?s")).toBe(4);
    expect(nameRegexBranching('starbucks')).toBe(1);
    expect(NAME_REGEX_MAX_BRANCHING).toBeGreaterThanOrEqual(64);
  });
});

describe('new claim-detail fields are plain text and strict', () => {
  it('rejects non-strings, oversize lists, bidi and control characters', () => {
    expect(validateOffer({ ...base, rewardItem: { toString: 'x' } }).ok).toBe(false);
    expect(validateOffer({ ...base, steps: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }).ok).toBe(false);
    expect(validateOffer({ ...base, steps: 'one step' }).ok).toBe(false);
    expect(validateOffer({ ...base, bring: ['App\u0007'] }).ok).toBe(false);
    expect(validateOffer({ ...base, validFor: `7 days${String.fromCodePoint(0x202e)}` }).ok).toBe(false);
    expect(validateOffer({ ...base, signupLeadDays: 1e9 }).ok).toBe(false);
    expect(validateOffer({ ...base, purchaseRequired: 'yes' }).ok).toBe(false);
  });
});

describe('Photon request and response', () => {
  it('sends only q, limit, lang and layer (no coordinates or bias)', () => {
    const u = new URL(buildPhotonUrl('Benga'));
    expect(u.origin).toBe('https://photon.komoot.io');
    expect([...new Set(u.searchParams.keys())].sort()).toEqual(['lang', 'layer', 'limit', 'q']);
  });
  it('drops features with bad coordinates, country codes or non-city types', () => {
    const f = (props: Record<string, unknown>, coords: unknown = [77.5, 12.9]) => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: coords }, properties: { name: 'X', countrycode: 'IN', type: 'city', ...props },
    });
    const out = parsePhoton({
      features: [
        f({}, ['77', 12.9]),
        f({}, [500, 12.9]),
        f({ countrycode: 'IND' }),
        f({ countrycode: '<b' }),
        f({ type: 'house' }),
        f({ name: '<img src=x onerror=alert(1)>' }),
      ],
    });
    expect(out).toHaveLength(1);
    // Kept as inert text (rendered via text nodes only).
    expect(out[0]?.label.startsWith('<img')).toBe(true);
  });
});

describe('session record: hostile values never load', () => {
  const good = {
    v: 3, city: 'Bengaluru', lat: 12.97, lng: 77.59, countryCode: 'IN', month: 3, radius: 5000, tab: 'nearby', done: [], verifiedOnly: false,
    types: { free: true, discount: true, past: true },
  };
  it('accepts a clean record', () => expect(parseSession(JSON.stringify(good))).not.toBeNull());
  it.each([
    ['markup in city', { ...good, city: '<img src=x onerror=alert(1)>' }],
    ['prototype pollution key', JSON.parse(`{"__proto__":{"x":1},${JSON.stringify(good).slice(1)}`)],
    ['extra field', { ...good, href: 'javascript:alert(1)' }],
    ['url-ish tab', { ...good, tab: 'javascript:alert(1)' }],
    ['radius not in list', { ...good, radius: 1e9 }],
    ['NaN-like lat', { ...good, lat: '12' }],
    ['lowercase country', { ...good, countryCode: 'in' }],
    ['bad done id', { ...good, done: ['"><svg>'] }],
    ['duplicate done ids', { ...good, done: ['a', 'a'] }],
    ['version bump', { ...good, v: 4 }],
    ['markup in types', { ...good, types: { free: '<img src=x>', discount: true, past: true } }],
    ['types with a href key', { ...good, types: { free: true, discount: true, past: true, href: 'javascript:alert(1)' } }],
    ['verifiedOnly not boolean', { ...good, verifiedOnly: '<img src=x>' }],
  ])('rejects %s', (_name, rec) => {
    expect(parseSession(JSON.stringify(rec))).toBeNull();
  });
  it('rejects oversized and non-JSON input', () => {
    expect(parseSession('x'.repeat(20_000))).toBeNull();
    expect(parseSession('{')).toBeNull();
    expect(SESSION_FIELDS).toHaveLength(11);
  });
});

describe('no web storage, cookies or URL state outside src/session.ts', () => {
  const src = import.meta.glob('../../src/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
  const files = Object.keys(src);
  it('scans the source tree', () => expect(files.length).toBeGreaterThan(10));
  it.each(files.filter((f) => !f.endsWith('/src/session.ts')))('%s', (file) => {
    const code = (src[file] ?? '').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(code).not.toMatch(/\b(localStorage|sessionStorage|indexedDB)\b|document\.cookie|history\.(pushState|replaceState)|location\.(hash|search)\s*=/);
  });
});
