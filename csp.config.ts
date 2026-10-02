/**
 * Single source of truth for the Content-Security-Policy.
 * Used by the Vite build plugin (meta tag + dist/_headers) and by tests.
 */

/** Returns the https origin of a worker URL, or null if missing/invalid. */
export function workerOrigin(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    return u.origin;
  } catch {
    return null;
  }
}

export function buildCsp(opts: { workerOrigin: string | null; forHeader: boolean }): string {
  const connect = [
    "'self'",
    'https://nominatim.openstreetmap.org',
    'https://overpass-api.de',
    // Location autocomplete (typed text only, debounced, ≥3 chars), DECISIONS #16.
    'https://photon.komoot.io',
  ];
  if (opts.workerOrigin) connect.push(opts.workerOrigin);
  const directives = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: https://tile.openstreetmap.org",
    "font-src 'self'",
    `connect-src ${connect.join(' ')}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    // frame-ancestors is ignored (and warns) in <meta>; only send it as a real header.
    ...(opts.forHeader ? ["frame-ancestors 'none'"] : []),
    'upgrade-insecure-requests',
  ];
  return directives.join('; ');
}
