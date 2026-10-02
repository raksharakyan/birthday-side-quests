import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  NotFoundError, OfflineError, RateLimitedError, UpstreamError, _resetGeocodeState, geocode, normaliseQuery, parseNominatim,
} from '../../src/geocode';

const hit = {
  lat: '12.9767936',
  lon: '77.590082',
  display_name: 'Bengaluru, Bangalore North, Karnataka, India',
  address: { city: 'Bengaluru', country_code: 'in' },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => {
  _resetGeocodeState();
  vi.useRealTimers();
});

describe('parseNominatim', () => {
  it('parses the first hit and uppercases the country code', () => {
    expect(parseNominatim([hit])).toEqual({
      lat: 12.9767936,
      lng: 77.590082,
      countryCode: 'IN',
      label: 'Bengaluru, Bangalore North, Karnataka, India',
    });
  });
  it.each([[[]], [null], [{}], ['x'], [[{ lat: 'x', lon: '1', address: { country_code: 'in' } }]], [[{ lat: '1', lon: '1', address: {} }]], [[{ lat: '91', lon: '1', address: { country_code: 'in' } }]]])(
    'returns null for unusable input %#',
    (input) => {
      expect(parseNominatim(input)).toBeNull();
    },
  );
  it('strips control characters and caps the label', () => {
    const p = parseNominatim([{ ...hit, display_name: `A\u0000B${'x'.repeat(500)}` }]);
    expect(p?.label.startsWith('A B')).toBe(true);
    expect(p?.label.length).toBeLessThanOrEqual(200);
  });
});

describe('normaliseQuery', () => {
  it('collapses whitespace and rejects empty/too long', () => {
    expect(normaliseQuery('  Bengaluru \n ')).toBe('Bengaluru');
    expect(normaliseQuery('   ')).toBeNull();
    expect(normaliseQuery('a'.repeat(201))).toBeNull();
  });
});

describe('geocode', () => {
  it('requests Nominatim with strict-origin referrer and caches in memory', async () => {
    const f = vi.fn(async () => jsonResponse([hit]));
    const a = await geocode('Bengaluru', f as unknown as typeof fetch);
    const b = await geocode('  bengaluru ', f as unknown as typeof fetch);
    expect(a).toEqual(b);
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('https://nominatim.openstreetmap.org/search?');
    expect(url).toContain('format=jsonv2');
    expect(url).toContain('q=Bengaluru');
    expect(init.referrerPolicy).toBe('strict-origin');
  });
  it('maps HTTP 429 to RateLimitedError', async () => {
    await expect(geocode('x', (async () => jsonResponse({}, 429)) as unknown as typeof fetch)).rejects.toBeInstanceOf(RateLimitedError);
  });
  it('maps 5xx to UpstreamError', async () => {
    await expect(geocode('y', (async () => jsonResponse({}, 503)) as unknown as typeof fetch)).rejects.toBeInstanceOf(UpstreamError);
  });
  it('maps empty results to NotFoundError', async () => {
    await expect(geocode('z', (async () => jsonResponse([])) as unknown as typeof fetch)).rejects.toBeInstanceOf(NotFoundError);
  });
  it('maps network TypeError to OfflineError', async () => {
    const f = async () => {
      throw new TypeError('Failed to fetch');
    };
    await expect(geocode('w', f as unknown as typeof fetch)).rejects.toBeInstanceOf(OfflineError);
  });
  it('throttles to one request per second', async () => {
    const times: number[] = [];
    const f = vi.fn(async () => {
      times.push(Date.now());
      return jsonResponse([hit]);
    });
    await Promise.all([geocode('one', f as unknown as typeof fetch), geocode('two', f as unknown as typeof fetch)]);
    expect(times).toHaveLength(2);
    expect((times[1] ?? 0) - (times[0] ?? 0)).toBeGreaterThanOrEqual(990);
  });
});
