import { cleanDisplayText } from './text';

/**
 * Location autocomplete via Photon (photon.komoot.io, OSM data).
 * Nominatim's usage policy forbids client-side autocomplete, so as-you-type goes to Photon and
 * the explicit "Find my quests" submit still goes to Nominatim (DECISIONS #16).
 *
 * Privacy: Photon receives ONLY the typed text (debounced, ≥3 chars). No coordinates / bias params,
 * no cookies, origin-only Referer. Results live in an in-memory Map for this tab only.
 */

export const PHOTON_URL = 'https://photon.komoot.io/api/';
export const MIN_CHARS = 3;
export const MAX_INPUT_LENGTH = 120;
export const DEBOUNCE_MS = 300;
export const MAX_SUGGESTIONS = 5;
export const PHOTON_TIMEOUT_MS = 5_000;
/**
 * Cities, towns and villages only (DECISIONS #19): the suggestion becomes the centre of a quest search.
 * Photon's "city" layer covers place=city/town/village and city-level admin boundaries. Neighbourhoods
 * (district/locality), streets, houses and POIs are excluded.
 */
export const PHOTON_LAYERS = ['city'] as const;
const CACHE_MAX = 100;
const PART_MAX = 80;
const LABEL_MAX = 160;

export interface Suggestion {
  label: string;
  lat: number;
  lng: number;
  countryCode: string;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Normalises typed text for autocomplete. Returns null when too short / too long to query. */
export function normaliseAutocompleteQuery(q: string): string | null {
  // eslint-disable-next-line no-control-regex
  const s = q.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (s.length < MIN_CHARS || s.length > MAX_INPUT_LENGTH) return null;
  return s;
}

export function buildPhotonUrl(q: string): string {
  const url = new URL(PHOTON_URL);
  url.searchParams.set('q', q);
  url.searchParams.set('limit', String(MAX_SUGGESTIONS));
  url.searchParams.set('lang', 'en');
  for (const layer of PHOTON_LAYERS) url.searchParams.append('layer', layer);
  return url.toString();
}

/** "Koramangala, Bengaluru, Karnataka, India" from whichever parts exist, without repeats. */
function buildLabel(p: Record<string, unknown>): string {
  const name = cleanDisplayText(p.name, PART_MAX);
  if (!name) return '';
  const city = cleanDisplayText(p.city, PART_MAX);
  const county = cleanDisplayText(p.county, PART_MAX);
  const parts = [name, city || county, cleanDisplayText(p.state, PART_MAX), cleanDisplayText(p.country, PART_MAX)];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const key = part.toLocaleLowerCase();
    if (!part || seen.has(key)) continue;
    seen.add(key);
    out.push(part);
  }
  return cleanDisplayText(out.join(', '), LABEL_MAX);
}

/** Pure, strict parser for a Photon GeoJSON FeatureCollection. Anything odd is skipped. */
export function parsePhoton(json: unknown): Suggestion[] {
  if (!isObj(json) || !Array.isArray(json.features)) return [];
  const out: Suggestion[] = [];
  const labels = new Set<string>();
  for (const f of json.features as unknown[]) {
    if (out.length >= MAX_SUGGESTIONS) break;
    if (!isObj(f) || !isObj(f.geometry) || !isObj(f.properties)) continue;
    if (f.geometry.type !== 'Point' || !Array.isArray(f.geometry.coordinates)) continue;
    const [lng, lat] = f.geometry.coordinates as unknown[];
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const cc = typeof f.properties.countrycode === 'string' ? f.properties.countrycode.toUpperCase() : '';
    if (!/^[A-Z]{2}$/.test(cc)) continue;
    // Defence in depth for the layer filter: skip anything Photon labels as not city-level.
    if (typeof f.properties.type === 'string' && f.properties.type !== 'city') continue;
    const label = buildLabel(f.properties);
    if (!label) continue;
    const key = label.toLocaleLowerCase();
    if (labels.has(key)) continue;
    labels.add(key);
    out.push({ label, lat, lng, countryCode: cc });
  }
  return out;
}

export async function fetchSuggestions(q: string, signal: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<Suggestion[]> {
  const res = await fetchImpl(buildPhotonUrl(q), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    referrerPolicy: 'strict-origin',
    credentials: 'omit',
    mode: 'cors',
    signal,
  });
  if (!res.ok) throw new Error(`Photon HTTP ${res.status}`);
  return parsePhoton(await res.json());
}

// In-memory only. Never persisted.
const cache = new Map<string, Suggestion[]>();

/** Test hook. */
export function _resetAutocompleteCache(): void {
  cache.clear();
}

export interface Suggester {
  /** Call on every keystroke. Results (possibly []) arrive via onResults for the latest text only. */
  request(text: string): void;
  /** Cancels any pending debounce and in-flight request (e.g. on submit or selection). */
  cancel(): void;
}

/**
 * Debounced, abortable, cached suggestion source. Errors, timeouts and offline all resolve to "no
 * suggestions" silently; the explicit search (Nominatim) still works.
 */
export function createSuggester(
  onResults: (results: Suggestion[], query: string) => void,
  opts: { fetchImpl?: typeof fetch; delayMs?: number; timeoutMs?: number } = {},
): Suggester {
  const delay = opts.delayMs ?? DEBOUNCE_MS;
  const timeoutMs = opts.timeoutMs ?? PHOTON_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inflight: AbortController | null = null;
  let seq = 0;

  function cancel(): void {
    seq += 1;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    inflight?.abort();
    inflight = null;
  }

  function request(text: string): void {
    cancel();
    const mySeq = seq;
    const q = normaliseAutocompleteQuery(text);
    if (!q) {
      onResults([], text);
      return;
    }
    const key = q.toLocaleLowerCase();
    const hit = cache.get(key);
    if (hit) {
      onResults(hit, q);
      return;
    }
    timer = setTimeout(() => {
      timer = undefined;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      const ctrl = new AbortController();
      inflight = ctrl;
      const killer = setTimeout(() => ctrl.abort(), timeoutMs);
      (opts.fetchImpl ? fetchSuggestions(q, ctrl.signal, opts.fetchImpl) : fetchSuggestions(q, ctrl.signal))
        .then((results) => {
          if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
          cache.set(key, results);
          if (mySeq === seq) onResults(results, q);
        })
        .catch(() => {
          if (mySeq === seq) onResults([], q);
        })
        .finally(() => {
          clearTimeout(killer);
          if (inflight === ctrl) inflight = null;
        });
    }, delay);
  }

  return { request, cancel };
}
