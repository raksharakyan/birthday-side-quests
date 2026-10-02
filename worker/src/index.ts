/**
 * Birthday Side Quests — "Found online" search proxy.
 *
 * GET /search?month=1..12&country=XX
 *  - accepts ONLY a month number and an ISO-2 country code; the search query is built from a
 *    fixed server-side template, so no user text is ever forwarded to the search provider;
 *  - CORS locked to ALLOWED_ORIGIN (plus localhost dev ports when ALLOW_LOCALHOST="true");
 *  - per-IP rate limit (Workers Rate Limiting binding, optional), 24h edge cache per (month, country);
 *  - results sanitised: plain text, length-capped, https URLs only, deduped, max 10;
 *  - no request logging (observability disabled in wrangler.toml, no console.log here).
 */

export interface RateLimiter {
  limit(opts: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  TAVILY_API_KEY?: string;
  ALLOWED_ORIGIN?: string;
  ALLOW_LOCALHOST?: string;
  RATE_LIMITER?: RateLimiter;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const LOCALHOST_ORIGINS = ['http://localhost:5173', 'http://localhost:4173'];
const MAX_RESULTS = 10;
const TITLE_MAX = 120;
const SNIPPET_MAX = 300;
const EDGE_CACHE_SECONDS = 24 * 60 * 60;
const CLIENT_CACHE_SECONDS = 60 * 60;
const TAVILY_URL = 'https://api.tavily.com/search';
const SPAM_RE = /\b(casino|betting|porn|xxx|escort|viagra|payday loan|crypto giveaway)\b/i;

// ---------- pure helpers (unit tested) ----------

export type ParamsResult = { ok: true; month: number; country: string } | { ok: false; error: string };

export function validateParams(params: URLSearchParams): ParamsResult {
  const keys = [...params.keys()];
  if (keys.some((k) => k !== 'month' && k !== 'country')) return { ok: false, error: 'unexpected parameter' };
  if (params.getAll('month').length !== 1 || params.getAll('country').length !== 1) {
    return { ok: false, error: 'month and country are required exactly once' };
  }
  const m = params.get('month') ?? '';
  if (!/^(?:[1-9]|1[0-2])$/.test(m)) return { ok: false, error: 'month must be an integer 1-12' };
  const c = params.get('country') ?? '';
  if (!/^[A-Z]{2}$/.test(c)) return { ok: false, error: 'country must be an ISO 3166-1 alpha-2 code' };
  return { ok: true, month: Number(m), country: c };
}

export function allowedOrigins(env: Env): string[] {
  const list = [env.ALLOWED_ORIGIN ?? 'https://raksharakyan.github.io'];
  if (env.ALLOW_LOCALHOST === 'true') list.push(...LOCALHOST_ORIGINS);
  return list;
}

/** CORS headers for an allowed origin, or null if the origin is missing/not allowed. */
export function corsHeaders(origin: string | null, env: Env): Record<string, string> | null {
  if (!origin || !allowedOrigins(env).includes(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function buildQuery(month: number, country: string): string {
  const monthName = MONTH_NAMES[month - 1];
  if (!monthName || !/^[A-Z]{2}$/.test(country)) throw new RangeError('invalid params');
  return `birthday freebies birthday month offers ${countryName(country)} ${monthName}`;
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

export function cleanText(input: unknown, max: number): string {
  if (typeof input !== 'string') return '';
  let s = input.slice(0, max * 4);
  s = s.replace(/<[^>]*>?/g, ' '); // strip tags (and dangling "<...")
  s = s.replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? ' ');
  s = s.replace(/[<>]/g, ' '); // entities may have re-created angle brackets
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length > max) s = `${s.slice(0, max - 1).trimEnd()}…`;
  return s;
}

export function safeHttpsUrl(input: unknown): URL | null {
  if (typeof input !== 'string' || input.length > 2048) return null;
  try {
    const u = new URL(input.trim());
    if (u.protocol !== 'https:' || u.username || u.password || !u.hostname) return null;
    return u;
  } catch {
    return null;
  }
}

/** Sanitises a Tavily response body into at most 10 safe plain-text results. */
export function sanitizeResults(raw: unknown): SearchResult[] {
  const list =
    typeof raw === 'object' && raw !== null && Array.isArray((raw as { results?: unknown }).results)
      ? ((raw as { results: unknown[] }).results)
      : [];
  const out: SearchResult[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (out.length >= MAX_RESULTS) break;
    if (typeof item !== 'object' || item === null) continue;
    const r = item as Record<string, unknown>;
    const u = safeHttpsUrl(r.url);
    if (!u) continue;
    const host = u.hostname.toLowerCase();
    const key = `${host}${u.pathname.replace(/\/+$/, '')}`;
    if (seen.has(key)) continue;
    const title = cleanText(r.title, TITLE_MAX);
    const snippet = cleanText(r.content ?? r.snippet, SNIPPET_MAX);
    if (!title) continue;
    if (SPAM_RE.test(title) || SPAM_RE.test(snippet) || SPAM_RE.test(host)) continue;
    seen.add(key);
    out.push({ title, url: u.toString(), snippet, source: host.replace(/^www\./, '') });
  }
  return out;
}

// ---------- HTTP ----------

const BASE_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};

function json(body: unknown, status: number, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...BASE_HEADERS, 'Cache-Control': 'no-store', Vary: 'Origin', ...extra },
  });
}

async function callTavily(apiKey: string, query: string): Promise<unknown> {
  const res = await fetch(TAVILY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      query,
      max_results: MAX_RESULTS,
      search_depth: 'basic',
      include_answer: false,
      include_images: false,
      include_raw_content: false,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  return res.json();
}

export async function handleRequest(request: Request, env: Env, ctx: Pick<ExecutionContext, 'waitUntil'>): Promise<Response> {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  const cors = corsHeaders(origin, env);

  if (url.pathname !== '/search') return json({ error: 'not found' }, 404, cors ?? {});
  if (request.method === 'OPTIONS') {
    if (!cors) return json({ error: 'origin not allowed' }, 403);
    return new Response(null, { status: 204, headers: { ...cors, 'X-Content-Type-Options': 'nosniff' } });
  }
  if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405, { Allow: 'GET, OPTIONS', ...(cors ?? {}) });
  if (!cors) return json({ error: 'origin not allowed' }, 403);

  const params = validateParams(url.searchParams);
  if (!params.ok) return json({ error: params.error }, 400, cors);

  if (env.RATE_LIMITER) {
    try {
      const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) return json({ error: 'rate limited' }, 429, { ...cors, 'Retry-After': '60' });
    } catch {
      /* degrade gracefully: binding misconfigured → no rate limit */
    }
  }

  const cacheKey = new Request(`${url.origin}/search?country=${params.country}&month=${params.month}`, { method: 'GET' });
  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) {
      const body = await hit.text();
      return new Response(body, {
        status: 200,
        headers: { ...BASE_HEADERS, ...cors, 'Cache-Control': `public, max-age=${CLIENT_CACHE_SECONDS}` },
      });
    }
  }

  if (!env.TAVILY_API_KEY) return json({ error: 'search not configured' }, 503, cors);

  let results: SearchResult[];
  try {
    results = sanitizeResults(await callTavily(env.TAVILY_API_KEY, buildQuery(params.month, params.country)));
  } catch {
    return json({ error: 'search unavailable' }, 502, cors);
  }

  const body = JSON.stringify(results);
  if (cache) {
    ctx.waitUntil(
      cache.put(
        cacheKey,
        new Response(body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${EDGE_CACHE_SECONDS}` } }),
      ),
    );
  }
  return new Response(body, {
    status: 200,
    headers: { ...BASE_HEADERS, ...cors, 'Cache-Control': `public, max-age=${CLIENT_CACHE_SECONDS}` },
  });
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return handleRequest(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
