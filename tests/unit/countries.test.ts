import { describe, expect, it } from 'vitest';
import { countryName, countryOptions, ISO_COUNTRIES } from '../../src/countries';
import { onlineCounts } from '../../src/offers';
import type { Offer } from '../../src/types';

const base: Offer = {
  id: 'x', brand: 'B', category: 'online', offer: 'o', howToClaim: 'h', countries: ['IN'], channel: 'online',
  claimWindow: 'day', sourceUrl: 'https://example.com', lastVerified: '2026-10-02', verified: true,
};

describe('ISO_COUNTRIES', () => {
  it('lists all 249 ISO 3166-1 alpha-2 codes, unique and well-formed', () => {
    expect(ISO_COUNTRIES).toHaveLength(249);
    expect(new Set(ISO_COUNTRIES).size).toBe(249);
    for (const c of ISO_COUNTRIES) expect(c).toMatch(/^[A-Z]{2}$/);
  });
  it('every code has an English name from Intl.DisplayNames', () => {
    for (const c of ISO_COUNTRIES) expect(countryName(c)).not.toBe(c);
    expect(countryName('JP')).toBe('Japan');
    expect(countryName('IN')).toBe('India');
  });
});

describe('onlineCounts', () => {
  it('counts online/both offers per country and worldwide separately', () => {
    const offers: Offer[] = [
      { ...base, id: 'a', countries: ['IN'] },
      { ...base, id: 'b', countries: ['IN', 'US'], channel: 'both' },
      { ...base, id: 'c', countries: ['IN'], channel: 'in-store' },
      { ...base, id: 'd', countries: ['*'] },
    ];
    const { byCountry, worldwide } = onlineCounts(offers);
    expect(Object.fromEntries(byCountry)).toEqual({ IN: 2, US: 1 });
    expect(worldwide).toBe(1);
  });
});

describe('countryOptions', () => {
  it('puts countries with their own quests first (with count incl. worldwide), then every other country', () => {
    const { withQuests, others } = countryOptions(new Map([['IN', 19], ['US', 3]]), 1);
    expect(withQuests.map((c) => [c.code, c.name, c.count])).toEqual([
      ['IN', 'India', 20],
      ['US', 'United States', 4],
    ]);
    expect(withQuests.length + others.length).toBe(249);
    expect(others.some((c) => c.name === 'Japan' && c.count === null)).toBe(true);
    const names = others.map((c) => c.name);
    expect([...names].sort((a, b) => a.localeCompare(b, 'en'))).toEqual(names);
  });
  it('adds a non-ISO code from a geocoder (e.g. Kosovo) and ignores junk', () => {
    expect(countryOptions(new Map(), 0, 'XK').others.some((c) => c.code === 'XK')).toBe(true);
    expect(countryOptions(new Map(), 0, '<x>').others).toHaveLength(249);
  });
});
