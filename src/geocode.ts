import { cleanDisplayText } from './text';
import type { Place } from './types';

/**
 * Nominatim geocoding. Text input only — this app never uses navigator geolocation.
 * Policy: https://operations.osmfoundation.org/policies/nominatim/ (max 1 req/s, cache results,
 * identify the app → we send our origin via referrerPolicy 'strict-origin', see DECISIONS #6).
 */

export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
export const MAX_QUERY_LENGTH = 200;
const MIN_INTERVAL_MS = 1000;

export class GeocodeError extends Error {
  constructor(
    public readonly kind: 'NotFound' | 'RateLimited' | 'Offline' | 'Upstream' | 'Invalid',
    message: string,
  ) {
    super(message);
    this.name = `${kind}Error`;
  }
}
export class NotFoundError extends GeocodeError {
  constructor() { super('NotFound', 'Place not found'); }
}
export class RateLimitedError extends GeocodeError {
  constructor() { super('RateLimited', 'Too many requests'); }
}
export class OfflineError extends GeocodeError {
  constructor() { super('Offline', 'You appear to be offline'); }
}
export class UpstreamError extends GeocodeError {
  constructor(status: number) { super('Upstream', `Geocoder error (HTTP ${status})`); }
}
export class InvalidQueryError extends GeocodeError {
  constructor() { super('Invalid', 'Please type a city or area'); }
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Strict coordinate coercion: Number('') / Number(null) are 0, which must not become a real place. */
function toCoord(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') return Number(v);
  return Number.NaN;
}

/** Pure parser for a Nominatim jsonv2 response (array). Returns the first usable hit or null. */
export function parseNominatim(json: unknown): Place | null {
  if (!Array.isArray(json) || json.length === 0) return null;
  const hit: unknown = json[0];
  if (!isObj(hit)) return null;
  const lat = toCoord(hit.lat);
  const lng = toCoord(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const address = isObj(hit.address) ? hit.address : {};
  const cc = typeof address.country_code === 'string' ? address.country_code.toUpperCase() : '';
  if (!/^[A-Z]{2}$/.test(cc)) return null;
  const rawLabel = typeof hit.display_name === 'string' ? hit.display_name : typeof hit.name === 'string' ? hit.name : '';
  const label = cleanDisplayText(rawLabel, 200);
  return { lat, lng, countryCode: cc, label };
}

/** Normalises user text for querying/caching. Returns null if unusable. */
export function normaliseQuery(q: string): string | null {
  // eslint-disable-next-line no-control-regex
  const s = q.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (s.length === 0 || s.length > MAX_QUERY_LENGTH) return null;
  return s;
}

function acceptLanguage(): string {
  const lang = typeof navigator !== 'undefined' ? navigator.language : '';
  return /^[A-Za-z]{1,8}(-[A-Za-z0-9]{1,8})*$/.test(lang) ? `${lang},en;q=0.5` : 'en';
}

// ---- 1 request / second global throttle (shared by every caller) ----
let lastStart = 0;
let chain: Promise<unknown> = Promise.resolve();

export function throttled<T>(task: () => Promise<T>, minIntervalMs = MIN_INTERVAL_MS): Promise<T> {
  const run = async (): Promise<T> => {
    const wait = lastStart + minIntervalMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastStart = Date.now();
    return task();
  };
  const p = chain.then(run, run);
  chain = p.catch(() => undefined);
  return p;
}

/** Test hook. */
export function _resetGeocodeState(): void {
  lastStart = 0;
  chain = Promise.resolve();
  cache.clear();
}

/** Debounce helper (600 ms default) for any as-you-type behaviour. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms = 600): (...args: A) => void {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    if (t !== undefined) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// In-memory only. Never persisted.
const cache = new Map<string, Place>();

export async function geocode(query: string, fetchImpl: typeof fetch = fetch): Promise<Place> {
  const q = normaliseQuery(query);
  if (!q) throw new InvalidQueryError();
  const key = q.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new OfflineError();

  const url = new URL(NOMINATIM_URL);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '1');
  url.searchParams.set('q', q);

  let res: Response;
  try {
    res = await throttled(() =>
      fetchImpl(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json', 'Accept-Language': acceptLanguage() },
        referrerPolicy: 'strict-origin',
        credentials: 'omit',
        mode: 'cors',
      }),
    );
  } catch (err) {
    if (err instanceof TypeError) throw new OfflineError();
    throw err;
  }
  if (res.status === 429) throw new RateLimitedError();
  if (!res.ok) throw new UpstreamError(res.status);
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new UpstreamError(res.status);
  }
  const parsed = parseNominatim(json);
  if (!parsed) throw new NotFoundError();
  // Never show an empty label ("near ."); fall back to what the user typed (stays in this tab).
  const place = parsed.label ? parsed : { ...parsed, label: q };
  cache.set(key, place);
  return place;
}
