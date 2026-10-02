/** URL helpers. Every external link in the app goes through safeHttpsUrl. */

const MAX_URL_LENGTH = 2048;

/** Returns a normalised https URL string, or null for anything else (javascript:, http:, credentials, junk). */
export function safeHttpsUrl(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (raw.length === 0 || raw.length > MAX_URL_LENGTH) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  if (u.username !== '' || u.password !== '') return null;
  if (u.hostname === '') return null;
  return u.toString();
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function round6(n: number): string {
  // toFixed then strip trailing zeros so URLs stay short and deterministic.
  const s = n.toFixed(6);
  return String(Number(s));
}

/** Google Maps directions link to a lat/lng. Throws on non-finite input. */
export function directionsUrl(lat: number, lng: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new RangeError('directionsUrl: lat/lng must be finite numbers');
  }
  const la = round6(clamp(lat, -90, 90));
  const ln = round6(clamp(lng, -180, 180));
  return `https://www.google.com/maps/dir/?api=1&destination=${la},${ln}`;
}

/** Hostname for display ("example.com"), or empty string. */
export function displayHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
