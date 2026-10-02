import type { Branch, Offer } from './types';

/**
 * Overpass branch lookup. The query is built ONLY from offers.json data (validated
 * wikidata IDs / restricted-charset regexes) and finite numbers — never user text.
 */

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
export const OVERPASS_TIMEOUT_MS = 25_000;
export const MAX_BRANCHES = 60;
const WIKIDATA_RE = /^Q[1-9]\d{0,11}$/;

export class OverpassError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OverpassError';
  }
}

/** Escapes a value for use inside a double-quoted Overpass QL string. */
export function escapeQlString(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function coord(n: number, limit: number, name: string): string {
  if (!Number.isFinite(n) || Math.abs(n) > limit) throw new RangeError(`${name} must be a finite number within ±${limit}`);
  return n.toFixed(6);
}

/**
 * Builds ONE Overpass QL query for all offers with osm hints, or null when there is nothing to look up.
 */
export function buildOverpassQuery(offers: readonly Offer[], lat: number, lng: number, radiusM = 5000): string | null {
  const la = coord(lat, 90, 'lat');
  const ln = coord(lng, 180, 'lng');
  if (!Number.isFinite(radiusM)) throw new RangeError('radius must be finite');
  const r = Math.round(Math.min(20_000, Math.max(100, radiusM)));

  const ids = new Set<string>();
  const regexes = new Set<string>();
  for (const o of offers) {
    if (o.osm?.wikidata && WIKIDATA_RE.test(o.osm.wikidata)) ids.add(o.osm.wikidata);
    if (o.osm?.nameRegex) regexes.add(o.osm.nameRegex);
  }
  if (ids.size === 0 && regexes.size === 0) return null;

  const around = `(around:${r},${la},${ln})`;
  const parts: string[] = [];
  if (ids.size > 0) {
    parts.push(`  nwr["brand:wikidata"~"^(${escapeQlString([...ids].join('|'))})$"]${around};`);
  }
  if (regexes.size > 0) {
    const alt = [...regexes].map((x) => `(${x})`).join('|');
    parts.push(`  nwr["name"~"${escapeQlString(alt)}",i]${around};`);
  }
  return `[out:json][timeout:25];\n(\n${parts.join('\n')}\n);\nout center ${MAX_BRANCHES};`;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function cleanName(s: unknown): string {
  // eslint-disable-next-line no-control-regex
  return typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 100) : '';
}

/** Pure parser: maps Overpass elements back to offers, de-duplicates and caps. */
export function parseOverpass(json: unknown, offers: readonly Offer[]): Branch[] {
  if (!isObj(json) || !Array.isArray(json.elements)) return [];
  const byWikidata = new Map<string, Offer>();
  const byRegex: Array<{ re: RegExp; offer: Offer }> = [];
  for (const o of offers) {
    if (o.osm?.wikidata && !byWikidata.has(o.osm.wikidata)) byWikidata.set(o.osm.wikidata, o);
    if (o.osm?.nameRegex) {
      try {
        byRegex.push({ re: new RegExp(o.osm.nameRegex, 'i'), offer: o });
      } catch {
        /* validated upstream; ignore */
      }
    }
  }

  const out: Branch[] = [];
  const seen = new Set<string>();
  for (const el of json.elements as unknown[]) {
    if (out.length >= MAX_BRANCHES) break;
    if (!isObj(el)) continue;
    const pos = el.type === 'node' ? el : isObj(el.center) ? el.center : null;
    if (!pos) continue;
    const lat = Number(pos.lat);
    const lng = Number(pos.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const tags = isObj(el.tags) ? el.tags : {};
    const wd = typeof tags['brand:wikidata'] === 'string' ? tags['brand:wikidata'] : '';
    const name = cleanName(tags.name);
    let offer = wd ? byWikidata.get(wd) : undefined;
    if (!offer && name) offer = byRegex.find((x) => x.re.test(name))?.offer;
    if (!offer) continue;
    const key = `${offer.id}|${lat.toFixed(4)}|${lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ offerId: offer.id, name: name || offer.brand, lat, lng });
  }
  return out;
}

export async function fetchBranches(
  offers: readonly Offer[],
  lat: number,
  lng: number,
  fetchImpl: typeof fetch = fetch,
): Promise<Branch[]> {
  const query = buildOverpassQuery(offers, lat, lng);
  if (!query) return [];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), OVERPASS_TIMEOUT_MS);
  try {
    const res = await fetchImpl(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      referrerPolicy: 'strict-origin',
      credentials: 'omit',
      mode: 'cors',
      signal: ctrl.signal,
    });
    if (!res.ok) throw new OverpassError(`Overpass HTTP ${res.status}`);
    return parseOverpass(await res.json(), offers);
  } catch (err) {
    if (err instanceof OverpassError) throw err;
    throw new OverpassError(err instanceof Error ? err.message : 'Overpass request failed');
  } finally {
    clearTimeout(timer);
  }
}

/** Haversine distance in metres. */
export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Nearest branch per offer id. */
export function nearestByOffer(branches: readonly Branch[], lat: number, lng: number): Map<string, Branch> {
  const best = new Map<string, { b: Branch; d: number }>();
  for (const b of branches) {
    const d = distanceM(lat, lng, b.lat, b.lng);
    const cur = best.get(b.offerId);
    if (!cur || d < cur.d) best.set(b.offerId, { b, d });
  }
  return new Map([...best].map(([k, v]) => [k, v.b]));
}
