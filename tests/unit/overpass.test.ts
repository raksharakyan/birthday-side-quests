import { describe, expect, it, vi } from 'vitest';
import { MAX_BRANCHES, MAX_BRANCHES_WIDE, buildOverpassQuery, clampRadius, maxBranchesFor, escapeQlString, fetchBranches, nearestByOffer, parseOverpass } from '../../src/overpass';
import type { Offer } from '../../src/types';

const offer = (id: string, osm?: Offer['osm']): Offer => ({
  id,
  brand: id,
  category: 'cafe',
  offer: 'o',
  howToClaim: 'h',
  countries: ['IN'],
  channel: 'in-store',
  claimWindow: 'day',
  sourceUrl: 'https://example.com',
  lastVerified: '2026-10-02',
  verified: true,
  ...(osm ? { osm } : {}),
});

describe('buildOverpassQuery', () => {
  it('builds one combined query with wikidata and name regex', () => {
    const q = buildOverpassQuery([offer('sb', { wikidata: 'Q37158' }), offer('ch', { nameRegex: 'Chaayos' })], 12.97, 77.59);
    expect(q).toContain('[out:json][timeout:25];');
    // POIs are narrowed inside the circle first (fast on big cities), then filtered.
    expect(q).toContain('nw["amenity"~"^(cafe|restaurant|fast_food|ice_cream|bar|pub|food_court)$"](around:5000,12.970000,77.590000);');
    expect(q).toContain('nw["shop"](around:5000,12.970000,77.590000);');
    expect(q).toContain(')->.p;');
    expect(q).toContain('nw.p["brand:wikidata"~"^(Q37158)$"];');
    expect(q).toContain('nw.p["name"~"(Chaayos)",i];');
    expect(q).toContain('nw.p["brand"~"(Chaayos)",i];');
    expect(q).not.toMatch(/nwr\[[^\]]*\]\(around/);
    expect(q).toContain('out center 60;');
  });
  it('matches a branch by its brand tag when the name differs', () => {
    const offers = [offer('ww', { nameRegex: 'westside' })];
    const json = { elements: [{ type: 'node', lat: 1, lon: 2, tags: { name: 'Trent Store', brand: 'Westside' } }] };
    expect(parseOverpass(json, offers)).toEqual([{ offerId: 'ww', name: 'Trent Store', lat: 1, lng: 2 }]);
  });
  it('retries once on 504, then succeeds', async () => {
    vi.useFakeTimers();
    const ok = { ok: true, status: 200, json: async () => ({ elements: [] }) };
    const fetchImpl = vi.fn().mockResolvedValueOnce({ ok: false, status: 504 }).mockResolvedValueOnce(ok);
    const p = fetchBranches([offer('sb', { wikidata: 'Q37158' })], 1, 2, fetchImpl as unknown as typeof fetch);
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(p).resolves.toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
  it('does not retry on 400', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    await expect(fetchBranches([offer('sb', { wikidata: 'Q37158' })], 1, 2, fetchImpl as unknown as typeof fetch)).rejects.toThrow('HTTP 400');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('uses the requested radius (clamped to 100 m … 20 km) and a bigger cap for wide circles', () => {
    const o = [offer('sb', { wikidata: 'Q37158' })];
    const q10 = buildOverpassQuery(o, 12.97, 77.59, 10_000) ?? '';
    expect(q10).toContain('nw["shop"](around:10000,12.970000,77.590000);');
    expect(q10).toContain(`out center ${MAX_BRANCHES_WIDE};`);
    expect(buildOverpassQuery(o, 1, 2, 2_000)).toContain('(around:2000,');
    expect(buildOverpassQuery(o, 1, 2, 2_000)).toContain(`out center ${MAX_BRANCHES};`);
    expect(buildOverpassQuery(o, 1, 2, 999_999)).toContain('(around:20000,');
    expect(buildOverpassQuery(o, 1, 2, 5)).toContain('(around:100,');
    expect(clampRadius(5000.4)).toBe(5000);
    expect(maxBranchesFor(5_000)).toBe(MAX_BRANCHES);
    expect(maxBranchesFor(20_000)).toBe(MAX_BRANCHES_WIDE);
  });
  it('fetchBranches sends the radius and applies the wide cap', async () => {
    const elements = Array.from({ length: 200 }, (_, i) => ({ type: 'node', lat: i / 1000, lon: 0, tags: { 'brand:wikidata': 'Q37158' } }));
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ elements }) });
    const out = await fetchBranches([offer('sb', { wikidata: 'Q37158' })], 1, 2, fetchImpl as unknown as typeof fetch, 20_000);
    expect(out).toHaveLength(MAX_BRANCHES_WIDE);
    const body = decodeURIComponent(String((fetchImpl.mock.calls[0] as [string, RequestInit])[1].body).replace(/^data=/, ''));
    expect(body).toContain('(around:20000,1.000000,2.000000)');
  });
  it('returns null when no offer has osm hints', () => {
    expect(buildOverpassQuery([offer('x')], 1, 1)).toBeNull();
  });
  it('rejects non-finite or out-of-range numbers', () => {
    expect(() => buildOverpassQuery([offer('sb', { wikidata: 'Q1' })], Number.NaN, 0)).toThrow(RangeError);
    expect(() => buildOverpassQuery([offer('sb', { wikidata: 'Q1' })], 0, 181)).toThrow(RangeError);
    expect(() => buildOverpassQuery([offer('sb', { wikidata: 'Q1' })], 0, 0, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
  it('escapes quotes and backslashes', () => {
    expect(escapeQlString('a"b\\c')).toBe('a\\"b\\\\c');
  });
  it('ignores malformed wikidata ids that bypassed validation', () => {
    expect(buildOverpassQuery([offer('bad', { wikidata: 'Q1"];' })], 0, 0)).toBeNull();
  });
});

describe('parseOverpass', () => {
  const offers = [offer('sb', { wikidata: 'Q37158' }), offer('ch', { nameRegex: 'Chaayos' })];
  it('maps nodes and way centers back to offers and dedupes', () => {
    const json = {
      elements: [
        { type: 'node', lat: 1, lon: 2, tags: { 'brand:wikidata': 'Q37158', name: 'Starbucks MG Road' } },
        { type: 'node', lat: 1, lon: 2, tags: { 'brand:wikidata': 'Q37158', name: 'dupe' } },
        { type: 'way', center: { lat: 3, lon: 4 }, tags: { name: 'Chaayos Koramangala' } },
        { type: 'node', lat: 5, lon: 6, tags: { name: 'Unrelated' } },
        { type: 'node', lat: 'x', lon: 6, tags: { name: 'Chaayos' } },
      ],
    };
    expect(parseOverpass(json, offers)).toEqual([
      { offerId: 'sb', name: 'Starbucks MG Road', lat: 1, lng: 2 },
      { offerId: 'ch', name: 'Chaayos Koramangala', lat: 3, lng: 4 },
    ]);
  });
  it('caps results', () => {
    const elements = Array.from({ length: 100 }, (_, i) => ({ type: 'node', lat: i / 100, lon: 0, tags: { name: 'Chaayos' } }));
    expect(parseOverpass({ elements }, offers)).toHaveLength(MAX_BRANCHES);
    expect(parseOverpass({ elements }, offers, 1_000)).toHaveLength(Math.min(100, MAX_BRANCHES_WIDE));
    expect(parseOverpass({ elements }, offers, Number.NaN)).toHaveLength(MAX_BRANCHES);
  });
  it('handles garbage', () => {
    expect(parseOverpass(null, offers)).toEqual([]);
    expect(parseOverpass({ elements: 'x' }, offers)).toEqual([]);
  });
  it('nearestByOffer picks the closest branch per offer', () => {
    const m = nearestByOffer(
      [
        { offerId: 'sb', name: 'far', lat: 1, lng: 1 },
        { offerId: 'sb', name: 'near', lat: 0.01, lng: 0.01 },
      ],
      0,
      0,
    );
    expect(m.get('sb')?.name).toBe('near');
  });
});
