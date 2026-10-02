import AxeBuilder from '@axe-core/playwright';
import { test as base, expect, type BrowserContext, type Page, type Request, type Route } from '@playwright/test';
import { mockNetwork, type MockOptions } from './fixtures';

/**
 * QA harness: every test using `test` from this file automatically gets
 *  - an unexpected-external-request guard (context level, plus the page-level mock's own list) → test fails if any;
 *  - a dialog trap (alert/confirm/prompt) → test fails if any dialog opens;
 *  - CSP `securitypolicyviolation` capture (init script) → must be zero;
 *  - a navigator.geolocation spy (getCurrentPosition/watchPosition) → must never be called;
 *  - uncaught page errors → must be zero;
 *  - console errors → must be zero, except patterns a test explicitly allows (e.g. the browser's own
 *    "Failed to load resource" line for a response we deliberately mocked as 429/504/aborted).
 */

const INIT = () => {
  const w = window as unknown as { __qa: { csp: string[]; geo: number } };
  w.__qa = { csp: [], geo: 0 };
  document.addEventListener(
    'securitypolicyviolation',
    (e) => w.__qa.csp.push(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}`),
    true,
  );
  const g = navigator.geolocation as unknown as Record<string, (...a: unknown[]) => unknown> | undefined;
  if (g) {
    for (const m of ['getCurrentPosition', 'watchPosition']) {
      const orig = g[m];
      if (typeof orig !== 'function') continue;
      g[m] = function (this: unknown, ...a: unknown[]) {
        w.__qa.geo += 1;
        return orig.apply(this, a);
      };
    }
  }
};

export interface Recorded {
  url: string;
  method: string;
  postData: string | null;
  request: Request;
}

export class Guard {
  readonly unexpected: string[] = [];
  readonly dialogs: string[] = [];
  readonly pageErrors: string[] = [];
  readonly consoleErrors: string[] = [];
  readonly csp: string[] = [];
  readonly requests: Recorded[] = [];
  geoCalls = 0;
  private allowed: RegExp[] = [];
  private mockLists: string[][] = [];

  constructor(private readonly page: Page) {}

  /** Allow console errors matching `re` (only for deliberately failing mocked responses). */
  allowConsole(re: RegExp): void {
    this.allowed.push(re);
  }

  /** Mock all external hosts (Nominatim, Overpass, OSM tiles, Worker). Anything else is aborted and recorded. */
  async mock(opts: MockOptions = {}): Promise<void> {
    this.mockLists.push(await mockNetwork(this.page, opts));
  }

  /** Pull CSP + geolocation counters from the current document (call before a reload/navigation). */
  async checkpoint(): Promise<void> {
    if (this.page.isClosed()) return;
    const qa = await this.page
      .evaluate(() => (window as unknown as { __qa?: { csp: string[]; geo: number } }).__qa ?? { csp: [], geo: 0 })
      .catch(() => ({ csp: [] as string[], geo: 0 }));
    this.csp.push(...qa.csp);
    this.geoCalls += qa.geo;
    await this.page.evaluate(() => {
      const w = window as unknown as { __qa?: { csp: string[]; geo: number } };
      if (w.__qa) {
        w.__qa.csp = [];
        w.__qa.geo = 0;
      }
    }).catch(() => undefined);
  }

  externalRequests(): Recorded[] {
    return this.requests.filter((r) => {
      const h = new URL(r.url).hostname;
      return h !== 'localhost' && h !== '127.0.0.1';
    });
  }

  unexpectedAll(): string[] {
    return [...this.unexpected, ...this.mockLists.flat()];
  }

  async verify(): Promise<void> {
    await this.checkpoint();
    const consoleProblems = this.consoleErrors.filter((m) => !this.allowed.some((re) => re.test(m)));
    expect.soft(this.unexpectedAll(), 'unexpected external requests').toEqual([]);
    expect.soft(this.dialogs, 'JS dialogs (XSS?)').toEqual([]);
    expect.soft(this.pageErrors, 'uncaught page errors').toEqual([]);
    expect.soft(consoleProblems, 'console errors').toEqual([]);
    expect.soft(this.csp, 'CSP violations').toEqual([]);
    expect.soft(this.geoCalls, 'navigator.geolocation calls').toBe(0);
  }
}

export const test = base.extend<{ guard: Guard }>({
  guard: [
    async ({ page, context }, use) => {
      const guard = new Guard(page);
      await context.addInitScript(INIT);
      // Lowest-priority catch-all: page-level mocks win; anything they don't handle lands here.
      await context.route(
        (url) => url.hostname !== 'localhost' && url.hostname !== '127.0.0.1',
        async (route: Route) => {
          guard.unexpected.push(route.request().url());
          await route.abort('blockedbyclient');
        },
      );
      context.on('request', (r) => guard.requests.push({ url: r.url(), method: r.method(), postData: r.postData(), request: r }));
      page.on('dialog', (d) => {
        guard.dialogs.push(`${d.type()}: ${d.message()}`);
        void d.dismiss().catch(() => undefined);
      });
      page.on('pageerror', (e) => guard.pageErrors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') guard.consoleErrors.push(m.text());
      });
      await use(guard);
      await guard.verify();
    },
    { auto: true },
  ],
});

export { expect };

// ---------------- helpers ----------------

export async function search(page: Page, city: string, month = '10'): Promise<void> {
  await page.getByLabel('Your city or area').fill(city);
  await page.getByLabel('Birthday month').selectOption(month);
  await page.getByRole('button', { name: 'Find my quests' }).click();
}

/** axe with every rule; returns "id (impact): help" strings. */
export async function axeViolations(page: Page): Promise<string[]> {
  // Let finite CSS transitions/animations settle first, so colour-contrast isn't sampled mid-fade.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
  const r = await new AxeBuilder({ page }).analyze();
  return r.violations.map((v) => `${v.id} (${v.impact ?? 'n/a'}): ${v.help} — ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

/** No storage, cookies, IndexedDB, or location in the URL. */
export async function expectNothingPersisted(page: Page, context: BrowserContext, startUrl: string): Promise<void> {
  expect(page.url()).toBe(startUrl);
  const u = new URL(page.url());
  expect(u.search).toBe('');
  expect(u.hash).toBe('');
  const s = await page.evaluate(async () => ({
    local: localStorage.length,
    session: sessionStorage.length,
    cookie: document.cookie,
    idb: typeof indexedDB.databases === 'function' ? (await indexedDB.databases()).map((d) => d.name ?? '') : [],
    caches: typeof caches !== 'undefined' ? await caches.keys() : [],
  }));
  expect(s).toEqual({ local: 0, session: 0, cookie: '', idb: [], caches: [] });
  expect(await context.cookies()).toEqual([]);
}

/** Hosts allowed to receive typed location text: Nominatim (on submit) and Photon (autocomplete). */
export const TEXT_HOSTS = new Set(['nominatim.openstreetmap.org', 'photon.komoot.io']);

/**
 * The typed location may only ever be sent to Nominatim or Photon. Overpass gets coordinates only,
 * the Worker only month+country, tiles only z/x/y, Photon only q/limit/lang/layer (no coordinates).
 * Referer (if any) is origin-only.
 */
export async function expectLocationOnlyToNominatim(guard: Guard, locations: string[]): Promise<void> {
  const needles = locations.flatMap((l) => {
    const low = l.toLowerCase();
    return [low, encodeURIComponent(l).toLowerCase(), encodeURIComponent(l).replace(/%20/g, '+').toLowerCase()];
  });
  for (const r of guard.externalRequests()) {
    const u = new URL(r.url);
    const hay = `${decodeSafe(r.url)} ${r.url} ${r.postData ?? ''} ${decodeSafe(r.postData ?? '')}`.toLowerCase();
    if (!TEXT_HOSTS.has(u.hostname)) {
      for (const n of needles) expect(hay, `location leaked to ${u.hostname}`).not.toContain(n);
    }
    if (u.hostname === 'overpass-api.de') {
      expect(r.method).toBe('POST');
      expect(u.search).toBe('');
      const q = decodeURIComponent((r.postData ?? '').replace(/^data=/, ''));
      // Every "around:" carries only radius + two numbers.
      for (const m of q.matchAll(/\(around:([^)]*)\)/g)) expect(m[1]).toMatch(/^\d+,-?\d+\.\d+,-?\d+\.\d+$/);
    }
    if (u.hostname === 'photon.komoot.io') {
      expect(r.method).toBe('GET');
      expect(u.pathname).toBe('/api/');
      expect([...new Set(u.searchParams.keys())]).toEqual(['q', 'limit', 'lang', 'layer']);
      expect((u.searchParams.get('q') ?? '').length).toBeGreaterThanOrEqual(3);
      expect(r.postData).toBeNull();
    }
    if (u.hostname === 'bsq-worker.e2e.example') {
      expect(u.pathname).toBe('/search');
      expect([...u.searchParams.keys()]).toEqual(['month', 'country']);
      expect(u.searchParams.get('month')).toMatch(/^(?:[1-9]|1[0-2])$/);
      expect(u.searchParams.get('country')).toMatch(/^[A-Z]{2}$/);
      expect(r.postData).toBeNull();
    }
    if (u.hostname === 'tile.openstreetmap.org') {
      expect(u.pathname).toMatch(/^\/\d+\/\d+\/\d+\.png$/);
      expect(u.search).toBe('');
    }
    const headers = await r.request.allHeaders().catch(() => ({}) as Record<string, string>);
    const referer = headers.referer;
    if (referer) expect(new URL(referer).pathname, `referer to ${u.hostname} must be origin-only`).toBe('/');
    expect(headers.cookie, `cookie sent to ${u.hostname}`).toBeUndefined();
  }
}

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return s;
  }
}

export const CORS = { 'Access-Control-Allow-Origin': '*' };
