import { ID_RE, LIMITS } from './offers';
import { RADIUS_OPTIONS_M } from './overpass';
import { hasUnsafeText } from './text';

/**
 * Session persistence (DECISIONS #18). The ONLY place in src/ that touches web storage.
 *
 * - sessionStorage only: it survives a refresh and is cleared when the tab is closed. Never
 *   localStorage, cookies or IndexedDB.
 * - One key, one versioned record with a fixed set of fields. Anything else on load (bad JSON,
 *   unknown/missing fields, wrong types, HTML-ish text, out-of-range numbers) is rejected and the
 *   key is removed.
 * - Every access is wrapped in try/catch: storage can be blocked (private mode, sandboxing) and the
 *   app then simply works without persistence.
 */

export const SESSION_KEY = 'bsq-session';
export const SESSION_VERSION = 1;
export const SESSION_TABS = ['nearby', 'online', 'found'] as const;
export type SessionTab = (typeof SESSION_TABS)[number];

export interface SessionData {
  v: typeof SESSION_VERSION;
  /** City text as shown in the input. null when no city has been searched. */
  city: string | null;
  lat: number | null;
  lng: number | null;
  /** The city's country when a city is set, otherwise the Online tab's country (or null). */
  countryCode: string | null;
  month: number | null;
  radius: number;
  tab: SessionTab;
  /** Offer ids marked "Quest complete!". */
  done: string[];
}

const FIELDS = ['city', 'countryCode', 'done', 'lat', 'lng', 'month', 'radius', 'tab', 'v'] as const;
export const SESSION_FIELDS: readonly string[] = FIELDS;
const MAX_RAW = 16_384;
const CITY_MAX = 200;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
}

function isCoord(v: unknown, limit: number): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= limit;
}

/** Strict schema check. Returns a clean copy, or null when anything is off. */
export function validateSession(raw: unknown): SessionData | null {
  if (!isPlainObject(raw)) return null;
  const keys = Object.keys(raw).sort();
  if (keys.length !== FIELDS.length || keys.some((k, i) => k !== FIELDS[i])) return null;
  if (raw.v !== SESSION_VERSION) return null;

  const { city, lat, lng, countryCode, month, radius, tab, done } = raw;
  if (city === null) {
    if (lat !== null || lng !== null) return null;
  } else {
    if (typeof city !== 'string' || city.length === 0 || city.length > CITY_MAX || city.trim() !== city) return null;
    // Plain text only: no markup characters, no control/bidi/invisible characters.
    if (/[<>]/.test(city) || hasUnsafeText(city)) return null;
    if (!isCoord(lat, 90) || !isCoord(lng, 180)) return null;
    if (countryCode === null) return null;
  }
  if (countryCode !== null && (typeof countryCode !== 'string' || !/^[A-Z]{2}$/.test(countryCode))) return null;
  if (month !== null && (typeof month !== 'number' || !Number.isInteger(month) || month < 1 || month > 12)) return null;
  if (typeof radius !== 'number' || !(RADIUS_OPTIONS_M as readonly number[]).includes(radius)) return null;
  if (typeof tab !== 'string' || !(SESSION_TABS as readonly string[]).includes(tab)) return null;
  if (!Array.isArray(done) || done.length > LIMITS.offers) return null;
  const seen = new Set<string>();
  for (const id of done) {
    if (typeof id !== 'string' || id.length > LIMITS.id || !ID_RE.test(id) || seen.has(id)) return null;
    seen.add(id);
  }

  return {
    v: SESSION_VERSION,
    city: city as string | null,
    lat: lat as number | null,
    lng: lng as number | null,
    countryCode: countryCode as string | null,
    month: month as number | null,
    radius,
    tab: tab as SessionTab,
    done: [...seen],
  };
}

/** Parses the stored string. null for missing, oversized, non-JSON or invalid records. */
export function parseSession(raw: string | null): SessionData | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_RAW) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  return validateSession(json);
}

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

/** Reads and validates the saved session. An invalid record is removed. */
export function loadSession(store: Storage | null = storage()): SessionData | null {
  if (!store) return null;
  try {
    const raw = store.getItem(SESSION_KEY);
    if (raw === null) return null;
    const data = parseSession(raw);
    if (!data) store.removeItem(SESSION_KEY);
    return data;
  } catch {
    return null;
  }
}

/** Saves a record after validating it. An invalid record is never written (the old one is removed). */
export function saveSession(data: SessionData, store: Storage | null = storage()): boolean {
  if (!store) return false;
  const clean = validateSession(data);
  try {
    if (!clean) {
      store.removeItem(SESSION_KEY);
      return false;
    }
    store.setItem(SESSION_KEY, JSON.stringify(clean));
    return true;
  } catch {
    return false;
  }
}

/** Wipes the saved search ("Clear search"). */
export function clearSession(store: Storage | null = storage()): void {
  try {
    store?.removeItem(SESSION_KEY);
  } catch {
    // Storage blocked: nothing was saved anyway.
  }
}
