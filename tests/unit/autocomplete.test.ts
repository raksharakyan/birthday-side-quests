import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEBOUNCE_MS,
  MAX_INPUT_LENGTH,
  PHOTON_TIMEOUT_MS,
  _resetAutocompleteCache,
  buildPhotonUrl,
  createSuggester,
  normaliseAutocompleteQuery,
  parsePhoton,
  type Suggestion,
} from '../../src/autocomplete';
import { hasUnsafeText } from '../../src/text';

const cp = (...codes: number[]) => String.fromCodePoint(...codes);
const RLO = cp(0x202e);
const PDF = cp(0x202c);
const ZWSP = cp(0x200b);

const feature = (props: Record<string, unknown>, coords: unknown = [77.6271, 12.9352], type = 'Point') => ({
  type: 'Feature',
  geometry: { type, coordinates: coords },
  properties: props,
});
const fc = (...features: unknown[]) => ({ type: 'FeatureCollection', features });

describe('parsePhoton', () => {
  it('parses a valid FeatureCollection into labelled suggestions ([lng,lat] → lat/lng)', () => {
    const out = parsePhoton(
      fc(
        feature({ name: 'Bengaluru', county: 'Bangalore North', state: 'Karnataka', country: 'India', countrycode: 'IN', osm_key: 'place', osm_value: 'city', type: 'city' }, [77.6271, 12.9352]),
        feature({ name: 'Manchester', state: 'England', country: 'United Kingdom', countrycode: 'gb' }, [-2.2446, 53.4794]),
      ),
    );
    expect(out).toEqual([
      { label: 'Bengaluru, Bangalore North, Karnataka, India', lat: 12.9352, lng: 77.6271, countryCode: 'IN' },
      { label: 'Manchester, England, United Kingdom', lat: 53.4794, lng: -2.2446, countryCode: 'GB' },
    ]);
  });
  it('uses county when there is no city, and never repeats a part', () => {
    const [a, b] = parsePhoton(
      fc(
        feature({ name: 'Koramangala', county: 'Bangalore South', state: 'Karnataka', country: 'India', countrycode: 'IN' }),
        feature({ name: 'Manchester', city: 'Manchester', state: 'England', country: 'United Kingdom', countrycode: 'GB' }),
      ),
    );
    expect(a?.label).toBe('Koramangala, Bangalore South, Karnataka, India');
    expect(b?.label).toBe('Manchester, England, United Kingdom');
  });
  it('rejects malformed input and malformed features', () => {
    for (const bad of [null, undefined, 42, 'x', [], {}, { features: 'x' }, { features: null }]) expect(parsePhoton(bad)).toEqual([]);
    const out = parsePhoton(
      fc(
        null,
        'str',
        { geometry: null, properties: {} },
        feature({ name: 'NoProps' }, [1, 2], 'Polygon'),
        { type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] } },
        feature({ name: 'StringCoords', countrycode: 'IN' }, ['77', '12']),
        feature({ name: 'ShortCoords', countrycode: 'IN' }, [77]),
        feature({ name: 'NotArray', countrycode: 'IN' }, { lat: 1, lng: 2 }),
        feature({ countrycode: 'IN' }),
        feature({ name: '   ', countrycode: 'IN' }),
        feature({ name: 42, countrycode: 'IN' }),
      ),
    );
    expect(out).toEqual([]);
  });
  it('rejects out-of-range and non-finite coordinates (no Null Island from null)', () => {
    const out = parsePhoton(
      fc(
        feature({ name: 'A', countrycode: 'IN' }, [181, 0]),
        feature({ name: 'B', countrycode: 'IN' }, [0, -90.5]),
        feature({ name: 'C', countrycode: 'IN' }, [Number.NaN, 1]),
        feature({ name: 'D', countrycode: 'IN' }, [1, Number.POSITIVE_INFINITY]),
        feature({ name: 'E', countrycode: 'IN' }, [null, null]),
        feature({ name: 'Edge', countrycode: 'IN' }, [-180, 90]),
      ),
    );
    expect(out).toEqual([{ label: 'Edge', lat: 90, lng: -180, countryCode: 'IN' }]);
  });
  it('requires a valid ISO-2 country code and uppercases it', () => {
    const out = parsePhoton(
      fc(
        feature({ name: 'Missing' }),
        feature({ name: 'Long', countrycode: 'IND' }),
        feature({ name: 'Digits', countrycode: '1N' }),
        feature({ name: 'NotString', countrycode: 7 }),
        feature({ name: 'Inject', countrycode: 'I"' }),
        feature({ name: 'Ok', countrycode: 'in' }),
      ),
    );
    expect(out.map((s) => [s.label, s.countryCode])).toEqual([['Ok', 'IN']]);
  });
  it('keeps XSS strings as plain text (rendering uses text nodes)', () => {
    const [s] = parsePhoton(fc(feature({ name: '<img src=x onerror=alert(1)>', state: '<script>alert(2)</script>', countrycode: 'IN' })));
    expect(s?.label).toBe('<img src=x onerror=alert(1)>, <script>alert(2)</script>');
  });
  it('strips bidi overrides and invisible characters from every part', () => {
    const [s] = parsePhoton(
      fc(feature({ name: `Bengaluru${RLO}aidnI${PDF}`, city: `x${ZWSP}y`, state: `K${RLO}`, country: `India${cp(0x2066)}`, countrycode: 'IN' })),
    );
    expect(s).toBeDefined();
    expect(hasUnsafeText(s?.label ?? '')).toBe(false);
    expect(s?.label).toBe('Bengaluru aidnI, x y, K, India');
  });
  it('caps part and label length', () => {
    const [s] = parsePhoton(fc(feature({ name: 'N'.repeat(500), city: 'C'.repeat(500), state: 'S'.repeat(500), countrycode: 'IN' })));
    expect(s?.label.length).toBeLessThanOrEqual(160);
    expect(s?.label.startsWith('N'.repeat(80) + ',')).toBe(true);
  });
  it('dedupes identical labels (case-insensitive) and caps at 5', () => {
    const many = Array.from({ length: 12 }, (_, i) => feature({ name: `Place ${i}`, countrycode: 'IN' }));
    expect(parsePhoton(fc(...many))).toHaveLength(5);
    const dupes = parsePhoton(
      fc(
        feature({ name: 'Brooklyn', city: 'New York', countrycode: 'US' }),
        feature({ name: 'brooklyn', city: 'new york', countrycode: 'US' }, [-73.9, 40.6]),
        feature({ name: 'Brooklyn', state: 'Iowa', countrycode: 'US' }),
      ),
    );
    expect(dupes.map((d) => d.label)).toEqual(['Brooklyn, New York', 'Brooklyn, Iowa']);
  });
});

describe('query normalisation + URL', () => {
  it('requires ≥3 trimmed chars and ≤120 chars', () => {
    expect(normaliseAutocompleteQuery('  ab  ')).toBeNull();
    expect(normaliseAutocompleteQuery(' Beng ')).toBe('Beng');
    expect(normaliseAutocompleteQuery('a\u0000\u0007b c')).toBe('a b c');
    expect(normaliseAutocompleteQuery('x'.repeat(MAX_INPUT_LENGTH))).toHaveLength(MAX_INPUT_LENGTH);
    expect(normaliseAutocompleteQuery('x'.repeat(MAX_INPUT_LENGTH + 1))).toBeNull();
  });
  it('city-only: skips features Photon labels as anything but city (district, locality, street, house, state)', () => {
    const out = parsePhoton(
      fc(
        feature({ name: 'Koramangala', county: 'Bangalore South', country: 'India', countrycode: 'IN', type: 'locality' }),
        feature({ name: 'Brooklyn', city: 'New York', country: 'United States', countrycode: 'US', type: 'district' }),
        feature({ name: 'MG Road', city: 'Bengaluru', countrycode: 'IN', type: 'street' }),
        feature({ name: '12', city: 'Pune', countrycode: 'IN', type: 'house' }),
        feature({ name: 'Bengkulu', country: 'Indonesia', countrycode: 'ID', type: 'state' }),
        feature({ name: 'Pune', state: 'Maharashtra', country: 'India', countrycode: 'IN', type: 'city' }, [73.8567, 18.5204]),
      ),
    );
    expect(out).toEqual([{ label: 'Pune, Maharashtra, India', lat: 18.5204, lng: 73.8567, countryCode: 'IN' }]);
  });
  it('sends only q, limit, lang and the city layer (no coordinates, no neighbourhood layers)', () => {
    const u = new URL(buildPhotonUrl('Kora & <x>'));
    expect(u.origin + u.pathname).toBe('https://photon.komoot.io/api/');
    expect([...new Set(u.searchParams.keys())]).toEqual(['q', 'limit', 'lang', 'layer']);
    expect(u.searchParams.get('q')).toBe('Kora & <x>');
    expect(u.searchParams.get('limit')).toBe('5');
    expect(u.searchParams.get('lang')).toBe('en');
    expect(u.searchParams.getAll('layer')).toEqual(['city']);
    expect(u.searchParams.has('lat') || u.searchParams.has('lon')).toBe(false);
  });
});

describe('createSuggester (debounce, abort, min length, cache)', () => {
  const okBody = fc(feature({ name: 'Bengaluru', state: 'Karnataka', country: 'India', countrycode: 'IN' }));
  const ok = () => ({ ok: true, status: 200, json: async () => okBody }) as unknown as Response;
  let calls: Array<[Suggestion[], string]>;
  const onResults = (r: Suggestion[], q: string) => calls.push([r, q]);

  beforeEach(() => {
    vi.useFakeTimers();
    _resetAutocompleteCache();
    calls = [];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces keystrokes: one request 300 ms after the last one', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => ok());
    const s = createSuggester(onResults, { fetchImpl });
    s.request('Ben');
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 50);
    s.request('Beng');
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 1);
    expect(fetchImpl).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(new URL(url).searchParams.get('q')).toBe('Beng');
    expect(init).toMatchObject({ method: 'GET', referrerPolicy: 'strict-origin', credentials: 'omit', mode: 'cors' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    await vi.runAllTimersAsync();
    expect(calls).toEqual([[[{ label: 'Bengaluru, Karnataka, India', lat: 12.9352, lng: 77.6271, countryCode: 'IN' }], 'Beng']]);
  });

  it('below 3 chars: no request, empty results', async () => {
    const fetchImpl = vi.fn();
    const s = createSuggester(onResults, { fetchImpl });
    s.request('  Be ');
    await vi.runAllTimersAsync();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(calls).toEqual([[[], '  Be ']]);
  });

  it('a new keystroke aborts the in-flight request and drops its result', async () => {
    const signals: AbortSignal[] = [];
    let resolveFirst: (r: Response) => void = () => undefined;
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce((_u: string, init: RequestInit) => {
        signals.push(init.signal as AbortSignal);
        return new Promise<Response>((r) => (resolveFirst = r));
      })
      .mockImplementation(async (_u: string, init: RequestInit) => {
        signals.push(init.signal as AbortSignal);
        return ok();
      });
    const s = createSuggester(onResults, { fetchImpl });
    s.request('Beng');
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    s.request('Benga');
    expect(signals[0]?.aborted).toBe(true);
    resolveFirst(ok()); // late answer for the old text must be ignored
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await vi.runAllTimersAsync();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(calls.map((c) => c[1])).toEqual(['Benga']);
  });

  it('caches by normalised text in memory (case-insensitive, no second request)', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => ok());
    const s = createSuggester(onResults, { fetchImpl });
    s.request('Beng');
    await vi.runAllTimersAsync();
    s.request('  beng ');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.[0]).toEqual(calls[0]?.[0]);
  });

  it('cancel() stops a pending debounce', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => ok());
    const s = createSuggester(onResults, { fetchImpl });
    s.request('Beng');
    s.cancel();
    await vi.runAllTimersAsync();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it('HTTP errors, bad JSON and network errors → silently no suggestions (not cached)', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad'); } })
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const s = createSuggester(onResults, { fetchImpl });
    for (const q of ['Beng', 'Beng', 'Beng']) {
      s.request(q);
      await vi.runAllTimersAsync();
    }
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(calls).toEqual([[[], 'Beng'], [[], 'Beng'], [[], 'Beng']]);
  });

  it('slow Photon is aborted after the timeout → no suggestions', async () => {
    let seen: AbortSignal | undefined;
    const fetchImpl = vi.fn().mockImplementation(
      (_u: string, init: RequestInit) =>
        new Promise<Response>((_r, reject) => {
          seen = init.signal as AbortSignal;
          seen.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    const s = createSuggester(onResults, { fetchImpl });
    s.request('Manch');
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + PHOTON_TIMEOUT_MS);
    expect(seen?.aborted).toBe(true);
    expect(calls).toEqual([[[], 'Manch']]);
  });
});
