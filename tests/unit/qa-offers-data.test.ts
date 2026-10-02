import offersJson from '../../public/offers.json';
import { describe, expect, it } from 'vitest';
import { ISO_COUNTRIES } from '../../src/countries';
import { validateOffersFile } from '../../src/offers';

/*
 * QA data checks for public/offers.json (PR #3: 102 offers with claim details).
 * Hard failures: duplicate ids, non-https or credentialed source URLs, invalid countries, em dashes,
 * spaced en dashes, emoji, a file the app's own validator would trim.
 * Soft check (warning only, printed with `npx vitest run tests/unit/qa-offers-data.test.ts`): the
 * sourceUrl host should look like the brand's own site, i.e. contain a brand token, or be on the
 * reviewed allowlist below (parent companies, loyalty programmes and regional domains).
 */

interface RawOffer {
  id: string;
  brand: string;
  countries: string[];
  sourceUrl: string;
  [k: string]: unknown;
}
const offers = (offersJson as { offers: RawOffer[] }).offers;

/**
 * Hosts reviewed by QA as the brand's own site where the automatic token match is too weak (brand
 * names of 3 letters or fewer, or a parent company). Built from the hosts in the file on 2026-10-02.
 */
export const OFFICIAL_HOST_ALLOWLIST: Record<string, string> = {
  'www.andindia.com': 'AND (brand name is 3 letters)',
  'www.itchotels.com': 'Club ITC is ITC Hotels\u2019 loyalty programme',
  'www.dsw.com': 'DSW (3 letters)',
  'www.ihop.com': 'IHOP (4 letters, kept explicit)',
};

/** Third-party hosting platforms: the page may be official, but the host isn't the brand's domain. */
const THIRD_PARTY = /(^|\.)(zohodesk|freshdesk|zendesk|helpscoutdocs|medium|blogspot|wordpress|wixsite|notion|linktr|instagram|facebook|x|twitter)\.[a-z.]+$/;
/** Secondary sources on the brand's domain (news, blog): fine as evidence, weaker than the T&C page. */
const SECONDARY_SUBDOMAIN = /^(blog|blogs|newsroom|news|press|media|stories)\./;

const STOP = new Set(['the', 'and', 'of', 'by', 'co', 'cafe', 'coffee', 'company', 'india', 'club', 'rewards', 'shop', 'store', 'salon', 'restaurant', 'grill', 'bar', 'kitchen', 'hotels', 'pizza']);

function brandTokens(o: RawOffer): string[] {
  const norm = (s: string) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const brand = norm(o.brand).replace(/\(.*?\)/g, ' ');
  const words = brand.split(/[^a-z0-9]+/).filter((w) => !STOP.has(w));
  const squashed = brand.replace(/[^a-z0-9]/g, '');
  const idWords = o.id.split('-').slice(0, -1).filter((w) => !STOP.has(w));
  return [...new Set([squashed, ...words, ...idWords, idWords.join('')])].filter((t) => t.length >= 4);
}

/** Host → plausible official? Returns null when OK, or a warning string. */
export function domainWarning(o: RawOffer): string | null {
  const host = new URL(o.sourceUrl).hostname.toLowerCase();
  if (THIRD_PARTY.test(host)) return `${o.id}: "${o.brand}" → ${host} (third-party hosting platform, not the brand's domain)`;
  if (SECONDARY_SUBDOMAIN.test(host)) return `${o.id}: "${o.brand}" → ${host} (news/blog page, not the offer terms)`;
  if (OFFICIAL_HOST_ALLOWLIST[host]) return null;
  const flat = host.replace(/[^a-z0-9]/g, '');
  if (brandTokens(o).some((t) => flat.includes(t))) return null;
  return `${o.id}: "${o.brand}" → ${host} (no brand token in host and not allowlisted)`;
}

const EM = '—';
const SPACED_EN = ' – ';
const EMOJI = /(?![©®™])[\p{Extended_Pictographic}✦✧♡♥️]/u;

function strings(v: unknown, path = '$'): Array<[string, string]> {
  if (typeof v === 'string') return [[path, v]];
  if (Array.isArray(v)) return v.flatMap((x, i) => strings(x, `${path}[${i}]`));
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => strings(x, `${path}.${k}`));
  return [];
}

describe('QA data: public/offers.json', () => {
  it('has 102 offers and the app validator keeps every one', () => {
    expect(offers.length).toBe(102);
    expect(validateOffersFile(offersJson).offers.length).toBe(offers.length);
  });

  it('ids are unique and kebab-case', () => {
    const seen = new Map<string, number>();
    for (const o of offers) seen.set(o.id, (seen.get(o.id) ?? 0) + 1);
    expect([...seen].filter(([, n]) => n > 1).map(([id]) => id)).toEqual([]);
    for (const o of offers) expect(o.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it('no two entries share the same brand + country (would show as duplicate cards)', () => {
    const keys = offers.flatMap((o) => o.countries.map((c) => `${o.brand.toLowerCase()}|${c}`));
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
  });

  it('every sourceUrl is https, without credentials, port, or fragment', () => {
    const bad = offers.filter((o) => {
      try {
        const u = new URL(o.sourceUrl);
        return u.protocol !== 'https:' || u.username !== '' || u.password !== '' || u.port !== '' || u.hash !== '' || !u.hostname.includes('.');
      } catch {
        return true;
      }
    });
    expect(bad.map((o) => `${o.id}: ${o.sourceUrl}`)).toEqual([]);
  });

  it('countries are valid ISO 3166-1 alpha-2 codes (or "*"), non-empty and unique per entry', () => {
    const iso = new Set(ISO_COUNTRIES);
    for (const o of offers) {
      expect(o.countries.length, o.id).toBeGreaterThan(0);
      expect(new Set(o.countries).size, o.id).toBe(o.countries.length);
      for (const c of o.countries) expect(c === '*' || iso.has(c), `${o.id}: ${c}`).toBe(true);
    }
  });

  it('id suffix matches the country (e.g. "-in" → IN)', () => {
    const bad = offers.filter((o) => {
      const suffix = o.id.split('-').pop()?.toUpperCase() ?? '';
      const code = suffix === 'UK' ? 'GB' : suffix;
      return o.countries.length === 1 && ISO_COUNTRIES.includes(code) && o.countries[0] !== code;
    });
    expect(bad.map((o) => `${o.id}: ${o.countries.join(',')}`)).toEqual([]);
  });

  it('no em dash or spaced en dash in any text', () => {
    expect(strings(offersJson).filter(([, s]) => s.includes(EM) || s.includes(SPACED_EN)).map(([p, s]) => `${p}: ${s}`)).toEqual([]);
  });

  it('no emoji in any text', () => {
    expect(strings(offersJson).filter(([, s]) => EMOJI.test(s)).map(([p, s]) => `${p}: ${s}`)).toEqual([]);
  });

  it('lastVerified is a real date, not in the future', () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const o of offers) {
      const d = String(o.lastVerified);
      expect(d, o.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(d)), o.id).toBe(false);
      expect(d <= today, `${o.id} lastVerified ${d} is in the future`).toBe(true);
    }
  });

  it('sourceUrl host looks official (WARNINGS only, never fails)', () => {
    const warnings = offers.map(domainWarning).filter((w): w is string => w !== null);
    if (warnings.length) console.warn(`[qa-offers-data] ${warnings.length} sourceUrl host(s) flagged for review:\n  ${warnings.join('\n  ')}`);
    // Allowlist entries must actually be used, so the list doesn't rot.
    const hosts = new Set(offers.map((o) => new URL(o.sourceUrl).hostname.toLowerCase()));
    const unused = Object.keys(OFFICIAL_HOST_ALLOWLIST).filter((h) => !hosts.has(h));
    if (unused.length) console.warn(`[qa-offers-data] unused allowlist hosts: ${unused.join(', ')}`);
    expect(Array.isArray(warnings)).toBe(true);
  });
});
