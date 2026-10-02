// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { buildQuery, cleanText, corsHeaders, handleRequest, sanitizeResults, validateParams, type Env } from '../src/index';

const env: Env = { ALLOWED_ORIGIN: 'https://raksharakyan.github.io', TAVILY_API_KEY: 'test-key' };
const ctx = { waitUntil: () => undefined };
const ORIGIN = 'https://raksharakyan.github.io';

function req(path: string, init: RequestInit & { origin?: string | null } = {}): Request {
  const headers = new Headers(init.headers);
  if (init.origin !== null) headers.set('Origin', init.origin ?? ORIGIN);
  return new Request(`https://worker.example${path}`, { ...init, headers });
}

describe('validateParams', () => {
  it('accepts month 1-12 and ISO-2 country', () => {
    expect(validateParams(new URLSearchParams('month=10&country=IN'))).toEqual({ ok: true, month: 10, country: 'IN' });
    expect(validateParams(new URLSearchParams('month=1&country=US')).ok).toBe(true);
  });
  it.each(['month=0&country=IN', 'month=13&country=IN', 'month=01&country=IN', 'month=1.5&country=IN', 'month=10&country=in',
    'month=10&country=IND', 'month=10', 'country=IN', 'month=10&country=IN&q=hack', 'month=10&month=11&country=IN', 'month=%2010&country=IN'])(
    'rejects %s',
    (qs) => {
      expect(validateParams(new URLSearchParams(qs)).ok).toBe(false);
    },
  );
});

describe('corsHeaders', () => {
  it('allows only the exact configured origin', () => {
    expect(corsHeaders(ORIGIN, env)?.['Access-Control-Allow-Origin']).toBe(ORIGIN);
    expect(corsHeaders('https://evil.example', env)).toBeNull();
    expect(corsHeaders(`${ORIGIN}.evil.example`, env)).toBeNull();
    expect(corsHeaders(null, env)).toBeNull();
  });
  it('allows localhost only when ALLOW_LOCALHOST=true', () => {
    expect(corsHeaders('http://localhost:5173', env)).toBeNull();
    expect(corsHeaders('http://localhost:5173', { ...env, ALLOW_LOCALHOST: 'true' })).not.toBeNull();
    expect(corsHeaders('http://localhost:9999', { ...env, ALLOW_LOCALHOST: 'true' })).toBeNull();
  });
});

describe('sanitizeResults', () => {
  it('strips tags, enforces https, dedupes and caps', () => {
    const out = sanitizeResults({
      results: [
        { title: '<b>Free</b> cake<script>x</script>', url: 'https://a.com/p/', content: 'Hello &lt;img src=x onerror=1&gt; world' },
        { title: 'dupe', url: 'https://A.com/p', content: '' },
        { title: 'insecure', url: 'http://b.com', content: '' },
        { title: 'js', url: 'javascript:alert(1)', content: '' },
        { title: 'Best casino bonus', url: 'https://c.com', content: '' },
        { title: 'x'.repeat(500), url: 'https://www.d.com/x', content: 'y'.repeat(900) },
      ],
    });
    expect(out).toHaveLength(2);
    expect(out[0]?.title).not.toMatch(/[<>]/);
    expect(out[0]?.snippet).not.toMatch(/[<>]/);
    expect(out[1]?.title.length).toBeLessThanOrEqual(120);
    expect(out[1]?.snippet.length).toBeLessThanOrEqual(300);
    expect(out[1]?.source).toBe('d.com');
  });
  it('handles garbage', () => {
    expect(sanitizeResults(null)).toEqual([]);
    expect(sanitizeResults({ results: 'x' })).toEqual([]);
  });
  it('cleanText removes every bidi override/isolate/mark and invisible formatting character', () => {
    // fromCodePoint keeps invisible characters out of the source file.
    for (const code of [0x061c, 0x200b, 0x200e, 0x200f, 0x2028, 0x2029, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e,
      0x2060, 0x2066, 0x2067, 0x2068, 0x2069, 0xfeff, 0x0085, 0x009b]) {
      expect(cleanText(`a${String.fromCodePoint(code)}b`, 10)).toBe('a b');
    }
    // ZWJ is kept (Indic scripts / emoji sequences).
    expect(cleanText(`a${String.fromCodePoint(0x200d)}b`, 10)).toBe(`a${String.fromCodePoint(0x200d)}b`);
  });
  it('sanitizeResults output never contains bidi overrides, tags or non-https URLs', () => {
    const rlo = String.fromCodePoint(0x202e);
    const out = sanitizeResults({
      results: [{ title: `Free ${rlo}ekac <img src=x onerror=alert(1)>`, url: 'https://e.com/x', content: `&lt;script&gt;${rlo}` }],
    });
    expect(out).toHaveLength(1);
    expect(JSON.stringify(out)).not.toMatch(/[<>\u202e]/u);
  });
  it('error responses never echo upstream details', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('secret upstream body tvly-xyz', { status: 500 }));
    const r = await handleRequest(req('/search?month=10&country=IN'), env, ctx);
    expect(r.status).toBe(502);
    const body = await r.text();
    expect(body).toBe('{"error":"search unavailable"}');
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    fetchSpy.mockRestore();
  });
  it('403 for a disallowed origin carries no CORS allow header', async () => {
    const r = await handleRequest(req('/search?month=1&country=IN', { origin: 'https://evil.example' }), env, ctx);
    expect(r.status).toBe(403);
    expect(r.headers.get('Access-Control-Allow-Origin')).toBeNull();
    const pre = await handleRequest(req('/search', { method: 'OPTIONS', origin: 'https://evil.example' }), env, ctx);
    expect(pre.status).toBe(403);
    expect(pre.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
  it('cleanText removes control and bidi characters', () => {
    expect(cleanText('a\u0000b‮c', 10)).toBe('a b c');
  });
});

describe('buildQuery', () => {
  it('uses a fixed template with country and month names', () => {
    expect(buildQuery(10, 'IN')).toBe('birthday freebies birthday month offers India October');
  });
});

describe('handleRequest', () => {
  it('404s other paths, 405s other methods, 403s foreign origins, 400s bad params', async () => {
    expect((await handleRequest(req('/'), env, ctx)).status).toBe(404);
    expect((await handleRequest(req('/search?month=1&country=IN', { method: 'POST' }), env, ctx)).status).toBe(405);
    expect((await handleRequest(req('/search?month=1&country=IN', { origin: 'https://evil.example' }), env, ctx)).status).toBe(403);
    expect((await handleRequest(req('/search?month=1&country=IN', { origin: null }), env, ctx)).status).toBe(403);
    const bad = await handleRequest(req('/search?month=99&country=IN'), env, ctx);
    expect(bad.status).toBe(400);
    expect(bad.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
  });
  it('answers preflight for the allowed origin', async () => {
    const r = await handleRequest(req('/search', { method: 'OPTIONS' }), env, ctx);
    expect(r.status).toBe(204);
    expect(r.headers.get('Vary')).toBe('Origin');
  });
  it('503s without an API key', async () => {
    const r = await handleRequest(req('/search?month=1&country=IN'), { ALLOWED_ORIGIN: ORIGIN }, ctx);
    expect(r.status).toBe(503);
  });
  it('429s when the rate limiter says no, and degrades if the binding throws', async () => {
    const limited = await handleRequest(req('/search?month=1&country=IN'), { ...env, RATE_LIMITER: { limit: async () => ({ success: false }) } }, ctx);
    expect(limited.status).toBe(429);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ results: [] })));
    const broken = await handleRequest(
      req('/search?month=1&country=IN'),
      { ...env, RATE_LIMITER: { limit: async () => { throw new Error('x'); } } },
      ctx,
    );
    expect(broken.status).toBe(200);
    fetchSpy.mockRestore();
  });
  it('calls Tavily with the fixed query and returns sanitized JSON', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ results: [{ title: 'Deal', url: 'https://e.com/a', content: 'Free' }] })),
    );
    const r = await handleRequest(req('/search?month=10&country=IN'), env, ctx);
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toContain('application/json');
    expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(r.headers.get('Cache-Control')).toBe('public, max-age=3600');
    expect(await r.json()).toEqual([{ title: 'Deal', url: 'https://e.com/a', snippet: 'Free', source: 'e.com' }]);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.tavily.com/search');
    expect(JSON.parse(String(init.body)).query).toBe('birthday freebies birthday month offers India October');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer test-key');
    fetchSpy.mockRestore();
  });
});
