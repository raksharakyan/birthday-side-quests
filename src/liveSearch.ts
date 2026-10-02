import type { LiveResult } from './types';
import { cleanDisplayText } from './text';
import { displayHost, safeHttpsUrl } from './urls';

/**
 * "Found online": calls our Cloudflare Worker with ONLY {month, country}.
 * Results are untrusted: strictly validated here and rendered as plain text.
 */

export const MAX_LIVE_RESULTS = 10;
const CAPS = { title: 120, snippet: 300, source: 100 } as const;

export function workerBaseUrl(raw: string | undefined = import.meta.env.VITE_WORKER_URL): string | null {
  const safe = safeHttpsUrl(raw ?? '');
  if (!safe) return null;
  const u = new URL(safe);
  u.search = '';
  u.hash = '';
  return u.toString().replace(/\/+$/, '');
}

export function isLiveSearchEnabled(): boolean {
  return workerBaseUrl() !== null;
}

function cleanStr(v: unknown, max: number): string {
  // Strips control, bidi-override and invisible characters (see src/text.ts), collapses whitespace, caps length.
  return cleanDisplayText(v, max);
}

/** Pure validator for the Worker response. Anything malformed is dropped. */
export function validateLiveResults(json: unknown): LiveResult[] {
  if (!Array.isArray(json)) return [];
  const out: LiveResult[] = [];
  for (const item of json) {
    if (out.length >= MAX_LIVE_RESULTS) break;
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
    const r = item as Record<string, unknown>;
    const url = safeHttpsUrl(r.url);
    const title = cleanStr(r.title, CAPS.title);
    if (!url || !title) continue;
    const source = cleanStr(r.source, CAPS.source) || displayHost(url);
    out.push({ title, url, snippet: cleanStr(r.snippet, CAPS.snippet), source });
  }
  return out;
}

export class LiveSearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LiveSearchError';
  }
}

export async function liveSearch(month: number, country: string, fetchImpl: typeof fetch = fetch): Promise<LiveResult[]> {
  const base = workerBaseUrl();
  if (!base) return [];
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new RangeError('month must be 1–12');
  if (!/^[A-Z]{2}$/.test(country)) throw new RangeError('country must be ISO-2');
  const url = `${base}/search?month=${month}&country=${country}`;
  let res: Response;
  try {
    res = await fetchImpl(url, { method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer', mode: 'cors' });
  } catch {
    throw new LiveSearchError('Could not reach the live search');
  }
  if (!res.ok) throw new LiveSearchError(`Live search HTTP ${res.status}`);
  try {
    return validateLiveResults(await res.json());
  } catch {
    throw new LiveSearchError('Live search returned invalid data');
  }
}
