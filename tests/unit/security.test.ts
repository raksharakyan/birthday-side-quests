import offersJson from '../../public/offers.json';
import headersFile from '../../public/_headers?raw';
import { describe, expect, it } from 'vitest';
import { buildCsp, workerOrigin } from '../../csp.config';
import { parseNominatim } from '../../src/geocode';
import { validateLiveResults } from '../../src/liveSearch';
import { validateOffer } from '../../src/offers';
import { parseOverpass } from '../../src/overpass';
import { el } from '../../src/render/dom';
import { cleanDisplayText, hasUnsafeText } from '../../src/text';
import type { Offer } from '../../src/types';

// Built with fromCodePoint so no invisible characters live in this file.
const cp = (...codes: number[]) => String.fromCodePoint(...codes);
const RLO = cp(0x202e); // right-to-left override
const PDF = cp(0x202c);
const LRI = cp(0x2066);
const ALM = cp(0x061c); // arabic letter mark
const ZWSP = cp(0x200b);
const BOM = cp(0xfeff);
const ZWJ = cp(0x200d);

describe('text hygiene (src/text.ts)', () => {
  it('strips bidi overrides, isolates, marks and invisible characters', () => {
    expect(cleanDisplayText(`evil${RLO}moc.elgoog${PDF}`, 50)).toBe('evil moc.elgoog');
    for (const ch of [RLO, PDF, LRI, ALM, ZWSP, BOM, cp(0x2028), cp(0x0000), cp(0x009b)]) {
      expect(hasUnsafeText(`a${ch}b`)).toBe(true);
      expect(cleanDisplayText(`a${ch}b`, 10)).toBe('a b');
    }
  });
  it('keeps ZWJ/ZWNJ (Indic scripts, emoji sequences) and ordinary non-Latin text', () => {
    const kannada = `ಬೆಂಗಳೂರು${ZWJ}`;
    expect(hasUnsafeText(kannada)).toBe(false);
    expect(cleanDisplayText('Café — 東京 · बेंगलुरु', 50)).toBe('Café — 東京 · बेंगलुरु');
  });
  it('caps length and handles non-strings', () => {
    expect(cleanDisplayText('x'.repeat(1000), 10)).toHaveLength(10);
    expect(cleanDisplayText(42, 10)).toBe('');
  });
  it('hasUnsafeText is stable across repeated calls (global regex lastIndex)', () => {
    expect(hasUnsafeText(`a${RLO}`)).toBe(true);
    expect(hasUnsafeText(`a${RLO}`)).toBe(true);
    expect(hasUnsafeText('abc')).toBe(false);
  });
});

describe('external data is cleaned of spoofing characters', () => {
  it('Worker results (title/snippet/source)', () => {
    const [r] = validateLiveResults([
      { title: `Free ${RLO}ekac${PDF}`, url: 'https://e.com/a', snippet: `x${LRI}y`, source: `e${RLO}.com` },
    ]);
    expect(r).toBeDefined();
    expect(hasUnsafeText(`${r?.title}${r?.snippet}${r?.source}`)).toBe(false);
  });
  it('Nominatim display_name', () => {
    const p = parseNominatim([{ lat: '1', lon: '2', display_name: `Bengaluru${RLO}aidnI`, address: { country_code: 'in' } }]);
    expect(p?.label).toBe('Bengaluru aidnI');
  });
  it('Overpass branch names', () => {
    const offer: Offer = {
      id: 'sb', brand: 'Starbucks', category: 'cafe', offer: 'o', howToClaim: 'h', countries: ['IN'], channel: 'in-store',
      claimWindow: 'day', sourceUrl: 'https://example.com', lastVerified: '2026-10-02', verified: true, osm: { wikidata: 'Q37158' },
    };
    const [b] = parseOverpass(
      { elements: [{ type: 'node', lat: 1, lon: 2, tags: { 'brand:wikidata': 'Q37158', name: `Starbucks${RLO}${ZWSP}GM` } }] },
      [offer],
    );
    expect(b?.name).toBe('Starbucks GM');
  });
  it('offers.json entries with bidi/invisible characters are rejected', () => {
    const base = {
      id: 'x', brand: 'Brand', category: 'cafe', offer: 'Free drink', howToClaim: 'App', countries: ['IN'],
      channel: 'in-store', sourceUrl: 'https://example.com', lastVerified: '2026-10-02',
    };
    expect(validateOffer(base).ok).toBe(true);
    expect(validateOffer({ ...base, brand: `Brand${RLO}` }).ok).toBe(false);
    expect(validateOffer({ ...base, offer: `Free${ZWSP} drink` }).ok).toBe(false);
  });
});

describe('shipped public/offers.json', () => {
  const offers = (offersJson as { offers: Array<Record<string, unknown>> }).offers;
  it('has at least one offer', () => expect(offers.length).toBeGreaterThan(0));
  it.each(offers.map((o) => [String(o.id), o.sourceUrl] as const))('%s sourceUrl is https without credentials', (_id, url) => {
    expect(typeof url).toBe('string');
    const u = new URL(String(url));
    expect(u.protocol).toBe('https:');
    expect(u.username + u.password).toBe('');
    expect(String(url).startsWith('https://')).toBe(true);
  });
  it('contains no control, bidi-override or invisible characters anywhere', () => {
    expect(hasUnsafeText(JSON.stringify(offersJson))).toBe(false);
  });
});

describe('el() hardening', () => {
  it.each(['script', 'style', 'iframe', 'frame', 'object', 'embed', 'base', 'link', 'meta', 'template'])('rejects <%s>', (tag) => {
    expect(() => el(tag as 'div')).toThrow();
  });
  it.each(['src', 'srcset', 'srcdoc', 'formaction', 'xlink:href', 'style', 'onerror', 'ONCLICK', 'action', 'background', 'poster'])(
    'rejects attribute %s',
    (attr) => {
      expect(() => el('div', { [attr]: 'x' })).toThrow();
    },
  );
  it('forces rel="noopener noreferrer" for any target, not just _blank', () => {
    const a = el('a', { href: 'https://example.com', target: 'popup', rel: 'opener' });
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
  });
  it('drops http:, javascript:, data: and credentialed hrefs', () => {
    for (const href of ['http://e.com', 'javascript:alert(1)', 'data:text/html,x', 'https://u:p@e.com', ' JAVASCRIPT:x']) {
      expect(el('a', { href }).hasAttribute('href')).toBe(false);
    }
  });
});

describe('CSP (csp.config.ts)', () => {
  const directives = (csp: string) => new Map(csp.split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v.join(' ')]));
  it('meta policy is strict and has the exact connect-src allowlist', () => {
    const d = directives(buildCsp({ workerOrigin: null, forHeader: false }));
    expect(d.get('default-src')).toBe("'self'");
    expect(d.get('script-src')).toBe("'self'");
    expect(d.get('style-src')).toBe("'self'");
    expect(d.get('font-src')).toBe("'self'");
    // data: is needed only for Leaflet's 1x1 transparent GIF placeholder used when aborting tile loads.
    expect(d.get('img-src')).toBe("'self' data: https://tile.openstreetmap.org");
    expect(d.get('connect-src')).toBe("'self' https://nominatim.openstreetmap.org https://overpass-api.de https://photon.komoot.io");
    expect(d.get('object-src')).toBe("'none'");
    expect(d.get('base-uri')).toBe("'none'");
    expect(d.get('form-action')).toBe("'none'");
    expect(d.has('frame-ancestors')).toBe(false); // ignored in <meta>
    expect(buildCsp({ workerOrigin: null, forHeader: false })).not.toMatch(/unsafe-|\*|blob:|http:/);
  });
  it('header policy adds frame-ancestors and the Worker origin only', () => {
    const d = directives(buildCsp({ workerOrigin: 'https://w.example.workers.dev', forHeader: true }));
    expect(d.get('frame-ancestors')).toBe("'none'");
    expect(d.get('connect-src')).toBe("'self' https://nominatim.openstreetmap.org https://overpass-api.de https://photon.komoot.io https://w.example.workers.dev");
  });
  it('photon.komoot.io is allowed in connect-src only', () => {
    const csp = buildCsp({ workerOrigin: null, forHeader: true });
    for (const [k, v] of directives(csp)) {
      if (k === 'connect-src') expect(v.split(' ')).toContain('https://photon.komoot.io');
      else expect(v).not.toContain('photon');
    }
  });
  it('shipped public/_headers CSP matches buildCsp (header form, no Worker)', () => {
    const line = /Content-Security-Policy: (.*)$/m.exec(headersFile)?.[1];
    expect(line).toBe(buildCsp({ workerOrigin: null, forHeader: true }));
  });
  it('workerOrigin accepts only https without credentials and strips path/query', () => {
    expect(workerOrigin('https://w.example.workers.dev/search?x=1')).toBe('https://w.example.workers.dev');
    expect(workerOrigin('http://w.example')).toBeNull();
    expect(workerOrigin('https://u:p@w.example')).toBeNull();
    expect(workerOrigin("https://w.example; script-src 'unsafe-inline'")).toBeNull();
    expect(workerOrigin('javascript:alert(1)')).toBeNull();
    expect(workerOrigin(undefined)).toBeNull();
  });
});

describe('source-tree privacy & sink guards', () => {
  const sources = import.meta.glob('../../src/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
  const code = Object.values(sources)
    .map((src) => src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''))
    .join('\n');
  it('scans every src/ module', () => expect(Object.keys(sources).length).toBeGreaterThan(10));
  it.each([
    ['innerHTML', /\.innerHTML\b/],
    ['outerHTML', /\.outerHTML\b/],
    ['insertAdjacentHTML', /insertAdjacentHTML/],
    ['document.write', /document\.write/],
    ['DOMParser', /DOMParser/],
    ['eval', /\beval\s*\(/],
    ['new Function', /new\s+Function\b/],
    ['string timers', /set(Timeout|Interval)\(\s*['"`]/],
    ['localStorage', /localStorage/],
    ['indexedDB', /indexedDB/],
    ['cookies', /document\.cookie/],
    ['geolocation', /geolocation/],
    ['history API', /history\.(push|replace)State/],
    ['console.log', /console\.(log|info|debug)/],
    ['Leaflet HTML-string popups', /bind(Popup|Tooltip)\(\s*['"`]/],
  ])('src/ has no %s', (_name, re) => {
    expect(code).not.toMatch(re);
  });
  it('sessionStorage is used only by src/session.ts (DECISIONS #18)', () => {
    const users = Object.entries(sources)
      .filter(([, src]) => /sessionStorage/.test(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')))
      .map(([path]) => path.replace(/^.*\/src\//, 'src/'));
    expect(users).toEqual(['src/session.ts']);
  });
});
