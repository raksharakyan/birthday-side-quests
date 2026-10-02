/**
 * QA coverage for src/geocode.ts beyond geocode.test.ts:
 * parser edge cases, throttle/cache behaviour under fake timers, and error mapping.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GeocodeError,
  InvalidQueryError,
  NotFoundError,
  OfflineError,
  RateLimitedError,
  UpstreamError,
  _resetGeocodeState,
  debounce,
  geocode,
  parseNominatim,
  throttled,
} from '../../src/geocode';

const hit = { lat: '12.97', lon: '77.59', display_name: 'Bengaluru, India', address: { country_code: 'in' } };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
const asFetch = (f: unknown) => f as typeof fetch;

beforeEach(() => _resetGeocodeState());
afterEach(() => {
  _resetGeocodeState();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('parseNominatim edge cases', () => {
  it.each([
    ['empty array', []],
    ['array of null', [null]],
    ['array of string', ['Bengaluru']],
    ['missing address', [{ lat: '1', lon: '2', display_name: 'x' }]],
    ['address is null', [{ lat: '1', lon: '2', address: null }]],
    ['missing country_code', [{ lat: '1', lon: '2', address: { city: 'x' } }]],
    ['numeric country_code', [{ lat: '1', lon: '2', address: { country_code: 42 } }]],
    ['3-letter country_code', [{ lat: '1', lon: '2', address: { country_code: 'ind' } }]],
    ['country_code with payload', [{ lat: '1', lon: '2', address: { country_code: 'i"' } }]],
    ['non-numeric lat', [{ lat: 'abc', lon: '2', address: { country_code: 'in' } }]],
    ['non-numeric lon', [{ lat: '1', lon: '1,2', address: { country_code: 'in' } }]],
    ['missing lat', [{ lon: '2', address: { country_code: 'in' } }]],
    ['NaN lat', [{ lat: 'NaN', lon: '2', address: { country_code: 'in' } }]],
    ['Infinity lon', [{ lat: '1', lon: 'Infinity', address: { country_code: 'in' } }]],
    ['lon out of range', [{ lat: '1', lon: '180.5', address: { country_code: 'in' } }]],
    ['lat out of range (negative)', [{ lat: '-90.01', lon: '1', address: { country_code: 'in' } }]],
    // Number('') / Number(null) / Number(' ') are 0 — must not silently become "Null Island" (QA-01).
    ['empty-string lat', [{ lat: '', lon: '2', address: { country_code: 'in' } }]],
    ['whitespace lon', [{ lat: '1', lon: '  ', address: { country_code: 'in' } }]],
    ['null lat', [{ lat: null, lon: '2', address: { country_code: 'in' } }]],
    ['boolean lon', [{ lat: '1', lon: true, address: { country_code: 'in' } }]],
    ['array lat', [{ lat: ['1'], lon: '2', address: { country_code: 'in' } }]],
    ['not an array', { 0: hit, length: 1 }],
  ])('returns null for %s', (_label, input) => {
    expect(parseNominatim(input)).toBeNull();
  });

  it('accepts numeric lat/lon and boundary values', () => {
    expect(parseNominatim([{ lat: -90, lon: 180, display_name: 'Pole', address: { country_code: 'aq' } }])).toEqual({
      lat: -90,
      lng: 180,
      countryCode: 'AQ',
      label: 'Pole',
    });
  });

  it('only looks at the first hit', () => {
    expect(parseNominatim([{ lat: 'x' }, hit])).toBeNull();
  });

  it('falls back to `name` when display_name is missing, and to empty when both are missing', () => {
    expect(parseNominatim([{ ...hit, display_name: undefined, name: 'Indiranagar' }])?.label).toBe('Indiranagar');
    expect(parseNominatim([{ ...hit, display_name: 42 }])?.label).toBe('');
  });

  it('caps a huge label (1 MB) to 200 chars quickly and strips invisible/bidi characters', () => {
    const huge = `‮${'Bengaluru '.repeat(100_000)}`;
    const t0 = performance.now();
    const p = parseNominatim([{ ...hit, display_name: huge }]);
    expect(performance.now() - t0).toBeLessThan(500);
    expect(p?.label.length).toBeLessThanOrEqual(200);
    expect(p?.label.startsWith('Bengaluru')).toBe(true);
  });

  it('keeps HTML-looking labels as plain text (rendering uses textContent)', () => {
    expect(parseNominatim([{ ...hit, display_name: '<img src=x onerror=alert(1)>' }])?.label).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('geocode label fallback', () => {
  it('uses the normalised query as the label when Nominatim returns no display name (QA-02)', async () => {
    const place = await geocode('  Indiranagar   Bengaluru ', asFetch(async () => jsonResponse([{ ...hit, display_name: '' }])));
    expect(place.label).toBe('Indiranagar Bengaluru');
  });
});

describe('throttle (fake timers)', () => {
  it('two rapid geocode calls → second request only after 1 s', async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const f = vi.fn(async () => jsonResponse([hit]));
    const a = geocode('one', asFetch(f));
    const b = geocode('two', asFetch(f));
    await vi.advanceTimersByTimeAsync(0);
    expect(f).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(998);
    expect(f).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2);
    expect(f).toHaveBeenCalledTimes(2);
    await expect(Promise.all([a, b])).resolves.toHaveLength(2);
  });

  it('three rapid calls are spaced ≥1 s apart (1 req/s)', async () => {
    vi.useFakeTimers({ now: 5_000_000 });
    const starts: number[] = [];
    const f = vi.fn(async () => {
      starts.push(Date.now());
      return jsonResponse([hit]);
    });
    const all = Promise.all(['a', 'b', 'c'].map((q) => geocode(q, asFetch(f))));
    await vi.advanceTimersByTimeAsync(3000);
    await all;
    expect(starts).toHaveLength(3);
    expect((starts[1] ?? 0) - (starts[0] ?? 0)).toBeGreaterThanOrEqual(1000);
    expect((starts[2] ?? 0) - (starts[1] ?? 0)).toBeGreaterThanOrEqual(1000);
  });

  it('a cached repeat (case/whitespace-insensitive) makes no fetch and does not wait for the throttle', async () => {
    vi.useFakeTimers({ now: 2_000_000 });
    const f = vi.fn(async () => jsonResponse([hit]));
    const first = await geocode('Bengaluru', asFetch(f));
    expect(f).toHaveBeenCalledTimes(1);
    // No timer advance: if this hit the throttle it would hang.
    const again = await geocode('  BENGALURU\n', asFetch(f));
    expect(again).toBe(first);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('a failed task does not break the queue', async () => {
    vi.useFakeTimers({ now: 3_000_000 });
    const failing = throttled(async () => {
      throw new Error('boom');
    });
    const ok = throttled(async () => 'ok');
    const failed = expect(failing).rejects.toThrow('boom');
    await vi.advanceTimersByTimeAsync(1000);
    await failed;
    await expect(ok).resolves.toBe('ok');
  });

  it('debounce fires once with the last arguments after 600 ms', async () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn);
    d('a');
    d('b');
    vi.advanceTimersByTime(599);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('b');
  });
});

describe('error mapping', () => {
  it.each([500, 502, 503, 504, 400, 403, 404])('HTTP %i → UpstreamError (kind Upstream)', async (status) => {
    const err = await geocode(`q${status}`, asFetch(async () => jsonResponse({}, status))).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect((err as GeocodeError).kind).toBe('Upstream');
  });

  it('HTTP 429 → RateLimitedError (kind RateLimited) and is not cached', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 429))
      .mockResolvedValueOnce(jsonResponse([hit]));
    vi.useFakeTimers();
    const first = geocode('Mysuru', asFetch(f)).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(0);
    const err = await first;
    expect(err).toBeInstanceOf(RateLimitedError);
    expect((err as GeocodeError).kind).toBe('RateLimited');
    const retry = geocode('Mysuru', asFetch(f));
    await vi.advanceTimersByTimeAsync(1000);
    await expect(retry).resolves.toMatchObject({ countryCode: 'IN' });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('navigator.onLine === false → OfflineError without any fetch', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const f = vi.fn();
    const err = await geocode('Pune', asFetch(f)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OfflineError);
    expect((err as GeocodeError).kind).toBe('Offline');
    expect(f).not.toHaveBeenCalled();
  });

  it('fetch TypeError (network down / CORS) → OfflineError', async () => {
    const err = await geocode('Delhi', asFetch(async () => Promise.reject(new TypeError('Failed to fetch')))).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OfflineError);
  });

  it('200 with invalid JSON → UpstreamError', async () => {
    const err = await geocode('Goa', asFetch(async () => new Response('<html>', { status: 200 }))).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UpstreamError);
  });

  it('200 with an unusable hit → NotFoundError, and not cached', async () => {
    const f = vi.fn(async () => jsonResponse([{ lat: '1', lon: '2', address: {} }]));
    vi.useFakeTimers();
    const p1 = geocode('Atlantis', asFetch(f)).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(0);
    expect(await p1).toBeInstanceOf(NotFoundError);
    const p2 = geocode('Atlantis', asFetch(f)).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await p2).toBeInstanceOf(NotFoundError);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it.each(['', '   ', '\u0000\u0001', 'x'.repeat(201)])('invalid query %j → InvalidQueryError without fetch', async (q) => {
    const f = vi.fn();
    await expect(geocode(q, asFetch(f))).rejects.toBeInstanceOf(InvalidQueryError);
    expect(f).not.toHaveBeenCalled();
  });

  it('sends the query only in the q= param, credentials omitted, and the URL is Nominatim', async () => {
    const f = vi.fn(async () => jsonResponse([hit]));
    await geocode('"><img src=x onerror=alert(1)>', asFetch(f));
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe('https://nominatim.openstreetmap.org/search');
    expect(u.searchParams.get('q')).toBe('"><img src=x onerror=alert(1)>');
    expect([...u.searchParams.keys()].sort()).toEqual(['addressdetails', 'format', 'limit', 'q']);
    expect(init.credentials).toBe('omit');
    expect(init.method).toBe('GET');
  });
});
