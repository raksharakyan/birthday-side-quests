import { describe, expect, it } from 'vitest';
import { MAX_BRANCHES, buildOverpassQuery, escapeQlString, nearestByOffer, parseOverpass } from '../../src/overpass';
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
    expect(q).toContain('nwr["brand:wikidata"~"^(Q37158)$"](around:5000,12.970000,77.590000);');
    expect(q).toContain('nwr["name"~"(Chaayos)",i](around:5000,12.970000,77.590000);');
    expect(q).toContain('out center 60;');
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
