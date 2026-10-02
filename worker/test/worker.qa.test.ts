// @vitest-environment node
/** QA coverage for the Worker's HTTP edges not covered by worker.test.ts. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleRequest, type Env } from '../src/index';

const ORIGIN = 'https://raksharakyan.github.io';
const env: Env = { ALLOWED_ORIGIN: ORIGIN, TAVILY_API_KEY: 'tvly-secret-test-key' };
const ctx = { waitUntil: () => undefined };

function req(path: string, init: RequestInit & { origin?: string | null } = {}): Request {
  const headers = new Headers(init.headers);
  if (init.origin !== null) headers.set('Origin', init.origin ?? ORIGIN);
  return new Request(`https://worker.example${path}`, { ...init, headers });
}

afterEach(() => vi.restoreAllMocks());

describe('Worker HTTP edges', () => {
  it('OPTIONS preflight from a disallowed origin → 403, no CORS allow headers, no upstream call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    for (const origin of ['https://evil.example', `${ORIGIN}.evil.example`, 'null', 'http://raksharakyan.github.io']) {
      const r = await handleRequest(
        req('/search?month=1&country=IN', {
          method: 'OPTIONS',
          origin,
          headers: { 'Access-Control-Request-Method': 'GET' },
        }),
        env,
        ctx,
      );
      expect(r.status).toBe(403);
      expect(r.headers.get('Access-Control-Allow-Origin')).toBeNull();
      expect(r.headers.get('Access-Control-Allow-Methods')).toBeNull();
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each(['POST', 'PUT', 'DELETE', 'PATCH'])('%s → 405 with Allow: GET, OPTIONS and no upstream call', async (method) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const r = await handleRequest(req('/search?month=1&country=IN', { method, body: method === 'DELETE' ? null : '{}' }), env, ctx);
    expect(r.status).toBe(405);
    expect(r.headers.get('Allow')).toBe('GET, OPTIONS');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('405 for a disallowed origin does not grant CORS', async () => {
    const r = await handleRequest(req('/search?month=1&country=IN', { method: 'POST', origin: 'https://evil.example', body: '{}' }), env, ctx);
    expect(r.status).toBe(405);
    expect(r.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it.each(['/', '/search/', '/Search', '/search/../admin', '/api/search', '/favicon.ico'])('%s → 404 JSON', async (path) => {
    const r = await handleRequest(req(path), env, ctx);
    expect(r.status).toBe(404);
    expect(r.headers.get('Content-Type')).toContain('application/json');
    expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('missing API key → 503 with a generic body and no upstream call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const r = await handleRequest(req('/search?month=1&country=IN'), { ALLOWED_ORIGIN: ORIGIN, TAVILY_API_KEY: '' }, ctx);
    expect(r.status).toBe(503);
    expect(await r.text()).toBe('{"error":"search not configured"}');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['network failure', () => Promise.reject(new TypeError('connect ECONNREFUSED 10.0.0.1:443 tvly-secret-test-key'))],
    ['timeout', () => Promise.reject(new DOMException('The operation timed out.', 'TimeoutError'))],
    ['401 with body', () => Promise.resolve(new Response('{"detail":"Invalid API key tvly-secret-test-key"}', { status: 401 }))],
    ['429 upstream', () => Promise.resolve(new Response('quota exceeded for account 123', { status: 429 }))],
    ['200 non-JSON', () => Promise.resolve(new Response('<html>stack trace at /srv/app.js:12</html>', { status: 200 }))],
  ])('upstream %s → generic 502, nothing leaked', async (_label, impl) => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(impl as typeof fetch);
    const r = await handleRequest(req('/search?month=10&country=IN'), env, ctx);
    expect(r.status).toBe(502);
    const body = await r.text();
    expect(body).toBe('{"error":"search unavailable"}');
    expect(body).not.toMatch(/tvly|stack|quota|ECONN|401|429/);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
  });

  it('rate limit exceeded → 429 with Retry-After, keyed by CF-Connecting-IP, no upstream call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const keys: string[] = [];
    let calls = 0;
    const limiter = {
      limit: async ({ key }: { key: string }) => {
        keys.push(key);
        calls += 1;
        return { success: calls <= 2 };
      },
    };
    fetchSpy.mockImplementation(async () => new Response(JSON.stringify({ results: [] })));
    const make = () => req('/search?month=10&country=IN', { headers: { 'CF-Connecting-IP': '203.0.113.7' } });
    expect((await handleRequest(make(), { ...env, RATE_LIMITER: limiter }, ctx)).status).toBe(200);
    expect((await handleRequest(make(), { ...env, RATE_LIMITER: limiter }, ctx)).status).toBe(200);
    const third = await handleRequest(make(), { ...env, RATE_LIMITER: limiter }, ctx);
    expect(third.status).toBe(429);
    expect(third.headers.get('Retry-After')).toBe('60');
    expect(await third.text()).toBe('{"error":"rate limited"}');
    expect(keys).toEqual(['203.0.113.7', '203.0.113.7', '203.0.113.7']);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('only month+country reach the upstream query (extra params are rejected before any upstream call)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const r = await handleRequest(req('/search?month=10&country=IN&city=Bengaluru'), env, ctx);
    expect(r.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
