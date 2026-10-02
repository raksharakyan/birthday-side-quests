import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Route } from '@playwright/test';
import { expectedNearbyCount, OVERPASS_BENGALURU, OVERPASS_BENGALURU_PINS } from './fixtures';
import {
  axeViolations, CORS, expect, expectLocationOnlyToNominatim, expectNothingPersisted, expectOnlySessionRecord, search, test,
} from './harness';

/*
 * QA end-to-end suite. All network is mocked; the harness fails a test on any unexpected external
 * request, JS dialog, CSP violation, geolocation call, page error or (non-allowed) console error.
 */

const RLO = String.fromCodePoint(0x202e);
const PDF = String.fromCodePoint(0x202c);
const STARBUCKS_DIRECTIONS = 'https://www.google.com/maps/dir/?api=1&destination=12.975,77.6';

function onlineOffers(country: string | null): string[] {
  const file = JSON.parse(readFileSync(resolve(process.cwd(), 'public/offers.json'), 'utf8')) as {
    offers: Array<{ brand: string; channel: string; countries: string[] }>;
  };
  return file.offers
    .filter((o) => (o.channel === 'online' || o.channel === 'both') && (o.countries.includes('*') || (country !== null && o.countries.includes(country))))
    .map((o) => o.brand);
}

const nominatim = (hits: unknown, status = 200) => (route: Route) =>
  route.fulfill({ status, json: hits, headers: CORS });

// ---------------------------------------------------------------- happy path

test.describe('happy path', () => {
  test('city → map + quests; exact directions link; https verify links; done + confetti; refresh restores; Clear search wipes', async ({
    page,
    context,
    guard,
  }) => {
    await guard.mock();
    await page.goto('./');
    const startUrl = page.url();
    expect(await axeViolations(page), 'axe: initial page').toEqual([]);

    await search(page, 'Bengaluru');
    await expect(page.getByRole('status')).toContainText('on the map', { timeout: 15_000 });

    // Map rendered with the searched place + one pin per matched branch.
    await expect(page.locator('#map.leaflet-container')).toBeVisible();
    await expect(page.locator('.map-marker--center')).toHaveCount(1);
    await expect(page.locator('.map-marker--branch')).toHaveCount(OVERPASS_BENGALURU_PINS);

    const cards = page.locator('#nearby-list .quest-card');
    await expect(cards).toHaveCount(expectedNearbyCount('IN'));

    // Directions link: exact href for the mocked Starbucks MG Road node (12.975, 77.6).
    const sbDir = page.locator('#nearby-list .quest-card[data-offer-id="starbucks-in"] .btn--directions');
    await expect(sbDir).toHaveAttribute('href', STARBUCKS_DIRECTIONS);
    await expect(sbDir).toHaveAttribute('target', '_blank');
    const rel = (await sbDir.getAttribute('rel')) ?? '';
    expect(rel.split(/\s+/)).toEqual(expect.arrayContaining(['noopener', 'noreferrer']));

    // Every directions link anywhere follows the exact format.
    for (const href of await page.locator('a.btn--directions').evaluateAll((as) => as.map((a) => a.getAttribute('href')))) {
      expect(href).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=-?\d+(\.\d+)?,-?\d+(\.\d+)?$/);
    }
    // Verify-offer links: https only, new tab, no opener/referrer.
    const sources = page.locator('#nearby-list a.btn--source');
    await expect(sources).toHaveCount(expectedNearbyCount('IN'));
    for (const a of await sources.evaluateAll((as) => as.map((x) => ({ href: x.getAttribute('href'), target: x.getAttribute('target'), rel: x.getAttribute('rel') })))) {
      expect(new URL(a.href ?? '').protocol).toBe('https:');
      expect(a.target).toBe('_blank');
      expect(a.rel).toBe('noopener noreferrer');
    }

    // Map popup directions link is identical and safe.
    await page.locator('.map-marker-host[title^="Tata Starbucks"]').click();
    const popupDir = page.locator('.map-popup__directions');
    await expect(popupDir).toHaveAttribute('href', STARBUCKS_DIRECTIONS);
    await expect(popupDir).toHaveAttribute('rel', 'noopener noreferrer');

    expect(await axeViolations(page), 'axe: results').toEqual([]);

    // Mark done → done state + confetti (motion allowed).
    const card = cards.first();
    await card.getByLabel('Mark claimed').check();
    await expect(card).toHaveClass(/\bis-done\b/);
    await expect(page.locator('body > .confetti')).toHaveCount(1);
    expect(await page.locator('body > .confetti .confetti__piece').count()).toBe(12);
    await expect(page.locator('body > .toast')).toContainText(/claimed\. 1 of \d+ done\./);
    await expect(page.locator('body')).toHaveClass(/\bis-lit\b/); // logo candle lit
    await expect(page.locator('#progress-count')).toHaveText(new RegExp(`^1 of \\d+$`));
    expect(await page.locator('body > .confetti .confetti__piece').count()).toBeGreaterThan(0);
    await expect(page.locator('#celebrate-live')).toContainText(/claimed\. 1 of \d+ done\./);
    await expect(page.locator('body > .confetti')).toHaveCount(0, { timeout: 5000 }); // cleaned up

    // Session record: exactly the allowed fields, nothing else anywhere.
    const doneId = (await card.getAttribute('data-offer-id')) ?? '';
    expect(await expectOnlySessionRecord(page, context, startUrl)).toEqual({
      v: 3, city: 'Bengaluru', lat: 12.9767936, lng: 77.590082, countryCode: 'IN', month: 10, radius: 5000, tab: 'nearby', done: [doneId],
      verifiedOnly: false, types: { free: true, discount: true, past: true },
    });

    // Refresh → the search is restored from sessionStorage (inputs, results, done state), no new geocoding.
    await guard.checkpoint();
    await page.reload();
    await expect(page.getByLabel('Your city', { exact: true })).toHaveValue('Bengaluru');
    await expect(page.getByLabel('Birthday month')).toHaveValue('10');
    await expect(page.getByRole('status')).toContainText('on the map', { timeout: 15_000 });
    await expect(cards).toHaveCount(expectedNearbyCount('IN'));
    await expect(page.locator(`#nearby-list .quest-card[data-offer-id="${doneId}"]`)).toHaveClass(/\bis-done\b/);
    await expect(page.locator('.map-marker--branch')).toHaveCount(OVERPASS_BENGALURU_PINS);
    const nominatimCalls = () => guard.externalRequests().filter((r) => r.url.startsWith('https://nominatim.openstreetmap.org/search?'));
    expect(nominatimCalls()).toHaveLength(1);
    expect(page.url()).toBe(startUrl);

    // "Clear search" wipes the record and resets the page.
    await page.getByRole('button', { name: 'Clear search' }).click();
    await expectNothingPersisted(page, context, startUrl);
    await expect(page.getByLabel('Your city', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Birthday month')).toHaveValue('');
    await expect(cards).toHaveCount(0);
    await expect(page.locator('.map-marker--center')).toHaveCount(0);
    await expect(page.getByRole('status')).toContainText('Search cleared');

    // After clearing, a refresh restores nothing; a new search geocodes again and nothing is done.
    await guard.checkpoint();
    await page.reload();
    await expect(page.getByLabel('Your city', { exact: true })).toHaveValue('');
    await expect(cards).toHaveCount(0);
    await search(page, 'Bengaluru');
    await expect(page.getByRole('status')).toContainText('on the map', { timeout: 15_000 });
    await expect(page.locator('#nearby-list .quest-card.is-done')).toHaveCount(0);
    await expect(page.locator('#nearby-list .quest-card__done-input:checked')).toHaveCount(0);
    expect(nominatimCalls()).toHaveLength(2);

    await expectLocationOnlyToNominatim(guard, ['Bengaluru']);
  });

  test.describe('reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });
    test('done state without confetti', async ({ page, guard }) => {
      await guard.mock();
      await page.goto('./');
      await search(page, 'Bengaluru');
      await expect(page.getByRole('status')).toContainText('on the map', { timeout: 15_000 });
      const card = page.locator('#nearby-list .quest-card').first();
      await card.getByLabel('Mark claimed').check();
      await expect(card).toHaveClass(/\bis-done\b/);
      await expect(page.locator('#celebrate-live')).toContainText('claimed.');
      // End states still happen without motion: toast text, ring count, lit candle.
      await expect(page.locator('body > .toast')).toContainText('claimed.');
      await expect(page.locator('#progress-count')).toHaveText(/^1 of \d+$/);
      await expect(page.locator('body')).toHaveClass(/\bis-lit\b/);
      await page.waitForTimeout(300);
      await expect(page.locator('.confetti, .confetti__piece')).toHaveCount(0);
    });
  });
});

// ---------------------------------------------------------------- error states

test.describe('error states', () => {
  test('place not found', async ({ page, guard }) => {
    await guard.mock({ nominatim: nominatim([]) });
    await page.goto('./');
    await search(page, 'Nowhereville');
    await expect(page.getByRole('status')).toContainText("We couldn't find that place");
    await expect(page.getByRole('status')).toHaveAttribute('data-kind', 'error');
    await expect(page.locator('#nearby-list .quest-card')).toHaveCount(0);
    expect(guard.externalRequests().some((r) => r.url.includes('overpass-api.de'))).toBe(false);
    expect(await axeViolations(page), 'axe: error state').toEqual([]);
  });

  test('Nominatim 429 → rate-limited message', async ({ page, guard }) => {
    guard.allowConsole(/Failed to load resource: the server responded with a status of 429/);
    await guard.mock({ nominatim: (route) => route.fulfill({ status: 429, body: 'Too Many Requests', headers: CORS }) });
    await page.goto('./');
    await search(page, 'Bengaluru');
    await expect(page.getByRole('status')).toContainText('The map search is a bit busy');
    await expect(page.getByRole('status')).toHaveAttribute('data-kind', 'error');
    // Submit button is usable again.
    await expect(page.getByRole('button', { name: 'Find my quests' })).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('offline (context.setOffline) → offline message, no request sent', async ({ page, context, guard }) => {
    await guard.mock();
    await page.goto('./');
    await expect(page.locator('#country option')).not.toHaveCount(1); // offers.json loaded before going offline
    await context.setOffline(true);
    await expect(page.getByRole('status')).toContainText("You're offline");
    await search(page, 'Bengaluru');
    await expect(page.getByRole('status')).toContainText("You're offline. Reconnect to the internet and try again.");
    expect(guard.externalRequests()).toEqual([]);
    await context.setOffline(false);
  });

  test('offline (Nominatim request aborted) → offline message', async ({ page, guard }) => {
    guard.allowConsole(/Failed to load resource: net::ERR_INTERNET_DISCONNECTED/);
    await guard.mock({ nominatim: (route) => route.abort('internetdisconnected') });
    await page.goto('./');
    await search(page, 'Bengaluru');
    await expect(page.getByRole('status')).toContainText("You're offline. Reconnect to the internet and try again.");
  });

  test('Overpass 504 → quests still listed, no shop pins, only venue directions', async ({ page, guard }) => {
    guard.allowConsole(/Failed to load resource: the server responded with a status of 504/);
    await guard.mock({ overpass: (route) => route.fulfill({ status: 504, body: 'Gateway Timeout', headers: CORS }) });
    await page.goto('./');
    await search(page, 'Bengaluru');
    await expect(page.getByRole('status')).toContainText("couldn't load shop pins");
    await expect(page.locator('#nearby-list .quest-card')).toHaveCount(expectedNearbyCount('IN'));
    await expect(page.locator('.map-marker--branch')).toHaveCount(0);
    await expect(page.locator('.map-marker--center')).toHaveCount(1);
    // Shop directions need Overpass; only the venue offer (Wonderla Bengaluru, fixed coordinates) keeps them.
    await expect(page.locator('#nearby-list .btn--directions')).toHaveCount(1);
    await expect(page.locator('#nearby-list .quest-card[data-offer-id="wonderla-in"] .btn--directions')).toHaveCount(1);
    // The results header says why distances are missing (no stale "Looking for shops" line).
    await expect(page.locator('#results-sub')).toContainText('Shop pins for Bengaluru didn’t load');
    await expect(page.locator('#nearby-list a.btn--source').first()).toHaveAttribute('href', /^https:\/\//);
  });

  test('country with no offers → friendly empty state pointing to the Online tab', async ({ page, guard }) => {
    await guard.mock({
      nominatim: nominatim([{ lat: '35.0116', lon: '135.7681', display_name: 'Kyoto, Kyoto Prefecture, Japan', address: { country_code: 'jp' } }]),
    });
    await page.goto('./');
    await search(page, 'Kyoto');
    await expect(page.getByRole('status')).toContainText('No in-store quests near Kyoto');
    await expect(page.getByRole('status')).toContainText('Online tab');
    const empty = page.locator('#nearby-list .empty-state');
    await expect(empty).toBeVisible();
    await expect(empty).toContainText('Online tab');
    await expect(page.locator('#nearby-list .quest-card')).toHaveCount(0);
    await expect(page.locator('.map-marker--center')).toHaveCount(1);
    // No offers → no reason to query Overpass at all.
    expect(guard.externalRequests().some((r) => r.url.includes('overpass-api.de'))).toBe(false);

    await page.getByRole('tab', { name: /^Online/ }).click();
    await expect(page.locator('#country')).toHaveValue('JP');
    await expect(page.locator('#online-list .empty-state')).toContainText('No online birthday quests for this country yet');
    expect(await axeViolations(page), 'axe: empty state').toEqual([]);
  });
});

// ---------------------------------------------------------------- online tab

test('Online tab works without a city (country select) and Found online sends only month+country', async ({ page, context, guard }) => {
  await guard.mock();
  await page.goto('./');
  const startUrl = page.url();
  await page.getByRole('tab', { name: /^Online/ }).click();
  await expect(page.locator('#panel-online')).toBeVisible();
  await expect(page.locator('#country')).toHaveValue('');
  const worldwide = onlineOffers(null);
  if (worldwide.length === 0) {
    await expect(page.locator('#online-list .empty-state')).toContainText('pick your country');
  } else {
    await expect(page.locator('#online-list .quest-card')).toHaveCount(worldwide.length);
  }

  await page.locator('#country').selectOption('IN');
  await expect(page.locator('#online-list .quest-card')).toHaveCount(onlineOffers('IN').length);
  await expect(page.locator('#online-list .quest-card').filter({ hasText: 'Nykaa' })).toHaveCount(1);
  // Online cards never have directions.
  await expect(page.locator('#online-list .btn--directions')).toHaveCount(0);
  expect(await axeViolations(page), 'axe: online tab').toEqual([]);

  await page.locator('#country').selectOption('US');
  await expect(page.locator('#online-list .quest-card')).toHaveCount(onlineOffers('US').length);

  // Found online needs a month: pick one in the form (no submit, no city).
  await page.getByLabel('Birthday month').selectOption('10');
  await page.getByRole('tab', { name: 'Found online' }).click();
  await expect(page.locator('#found-list .live-card')).toHaveCount(1);
  expect(await axeViolations(page), 'axe: found online').toEqual([]);

  const ext = guard.externalRequests();
  expect(ext.map((r) => new URL(r.url).hostname)).toEqual(['bsq-worker.e2e.example']);
  expect(ext[0]?.url).toBe('https://bsq-worker.e2e.example/search?month=10&country=US');
  // No city searched: the session record holds no location at all, only month/country/tab.
  expect(await expectOnlySessionRecord(page, context, startUrl)).toEqual({
    v: 3, city: null, lat: null, lng: null, countryCode: 'US', month: 10, radius: 5000, tab: 'found', done: [], verifiedOnly: false,
    types: { free: true, discount: true, past: true },
  });
  await expectLocationOnlyToNominatim(guard, []);
});

// ---------------------------------------------------------------- XSS

test.describe('XSS', () => {
  test('Found online: hostile Worker payloads render as text only', async ({ page, guard }) => {
    await guard.mock({
      worker: (route) =>
        route.fulfill({
          headers: CORS,
          json: [
            { title: '<img src=x onerror=alert(1)>', url: 'https://deals.example/a', snippet: '<script>alert(2)</script>', source: '<b>evil</b>' },
            { title: 'js link', url: 'javascript:alert(3)', snippet: 'dropped', source: 'evil' },
            { title: 'data link', url: 'data:text/html,<script>alert(4)</script>', snippet: 'dropped', source: 'evil' },
            { title: `Free cake ${RLO}moc.live${PDF}`, url: 'https://deals.example/b', snippet: `x${RLO}y`, source: `deals${RLO}.example` },
            { title: '<svg onload=alert(5)>', url: 'https://deals.example/c', snippet: '<iframe src="javascript:alert(6)"></iframe>', source: '' },
          ],
        }),
    });
    await page.goto('./');
    const scriptsBefore = await page.locator('script').count();
    await search(page, 'Bengaluru');
    await expect(page.getByRole('status')).toContainText('on the map', { timeout: 15_000 });
    await page.getByRole('tab', { name: 'Found online' }).click();

    const cards = page.locator('#found-list .live-card');
    await expect(cards).toHaveCount(3); // javascript: and data: results dropped
    await expect(cards.nth(0).locator('.live-card__title')).toHaveText('<img src=x onerror=alert(1)>');
    await expect(cards.nth(0).locator('.live-card__snippet')).toHaveText('<script>alert(2)</script>');
    await expect(cards.nth(0).locator('.live-card__source')).toHaveText('Source: <b>evil</b>');
    await expect(cards.nth(1).locator('.live-card__title')).toHaveText('Free cake moc.live');
    await expect(cards.nth(2).locator('.live-card__title')).toHaveText('<svg onload=alert(5)>');
    await expect(cards.nth(2).locator('.live-card__source')).toHaveText('Source: deals.example');

    const found = await page.evaluate(() => {
      const t = document.body.textContent ?? '';
      return {
        imgX: document.querySelectorAll('img[src="x"]').length,
        foundImgs: document.querySelectorAll('#found-list img, #found-list svg:not(.icon), #found-list iframe, #found-list script').length,
        onAttrs: [...document.querySelectorAll('*')].filter((e) => [...e.attributes].some((a) => a.name.startsWith('on'))).length,
        bidi: /[‪-‮⁦-⁩]/.test(t),
        hrefs: [...document.querySelectorAll('#found-list a')].map((a) => a.getAttribute('href')),
      };
    });
    expect(found.imgX).toBe(0);
    expect(found.foundImgs).toBe(0);
    expect(found.onAttrs).toBe(0);
    expect(found.bidi).toBe(false);
    expect(found.hrefs).toEqual(['https://deals.example/a', 'https://deals.example/b', 'https://deals.example/c']);
    expect(await page.locator('script').count()).toBe(scriptsBefore);
    await page.waitForTimeout(300); // give any injected handler a chance to fire (dialog trap)
  });

  test('location input + Nominatim display_name + Overpass name payloads render as text only', async ({ page, guard }) => {
    const payloads = ['"><img src=x onerror=alert(1)>', '<svg onload=alert(1)>', "javascript:alert(1)//'\"><script>alert(1)</script>"];
    await guard.mock({
      // Echo the typed text back in display_name so it travels through the whole rendering path.
      nominatim: (route) => {
        const q = new URL(route.request().url()).searchParams.get('q') ?? '';
        return route.fulfill({
          headers: CORS,
          json: [{ lat: '12.9767936', lon: '77.590082', display_name: `${q}, ${RLO}<img src=x onerror=alert(7)>`, address: { country_code: 'in' } }],
        });
      },
      overpass: (route) =>
        route.fulfill({
          headers: CORS,
          json: {
            elements: [
              { type: 'node', id: 1, lat: 12.975, lon: 77.6, tags: { name: '<svg onload=alert(8)> Starbucks', 'brand:wikidata': 'Q37158' } },
              ...OVERPASS_BENGALURU.elements.slice(1),
            ],
          },
        }),
    });
    await page.goto('./');
    const scriptsBefore = await page.locator('script').count();

    for (const p of payloads) {
      await search(page, p);
      await expect(page.getByRole('status')).toContainText('on the map', { timeout: 15_000 });
      await expect(page.getByRole('status')).toContainText(p.replace(/\s+/g, ' ').trim());
      await expect(page.getByRole('status')).toContainText('<img src=x onerror=alert(7)>');
    }
    const sb = page.locator('#nearby-list .quest-card[data-offer-id="starbucks-in"]');
    await expect(sb.locator('.quest-card__branch')).toHaveText('<svg onload=alert(8)> Starbucks');
    await expect(sb.locator('.btn--directions')).toHaveAttribute('aria-label', /<svg onload=alert\(8\)> Starbucks/);
    await page.locator('.map-marker-host[title^="Tata Starbucks"]').click();
    await expect(page.locator('.map-popup__name')).toHaveText('<svg onload=alert(8)> Starbucks');

    const dom = await page.evaluate(() => ({
      imgX: document.querySelectorAll('img[src="x"]').length,
      svgOnload: document.querySelectorAll('svg[onload]').length,
      onAttrs: [...document.querySelectorAll('*')].filter((e) => [...e.attributes].some((a) => a.name.startsWith('on'))).length,
      inputValue: (document.getElementById('city') as HTMLInputElement).value,
    }));
    expect(dom).toEqual({ imgX: 0, svgOnload: 0, onAttrs: 0, inputValue: payloads[payloads.length - 1] });
    expect(await page.locator('script').count()).toBe(scriptsBefore);
    await page.waitForTimeout(300);
  });
});

// ---------------------------------------------------------------- CSP

test('served HTML has a strict CSP meta and no inline script/style', async ({ page, guard }) => {
  await guard.mock();
  const res = await page.request.get('./');
  expect(res.ok()).toBe(true);
  const html = await res.text();
  const meta = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i.exec(html);
  expect(meta, 'CSP meta tag').not.toBeNull();
  const csp = (meta?.[1] ?? '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|unsafe-hashes|strict-dynamic|\*/);
  expect(csp).toContain("script-src 'self'");
  expect(csp).toContain("style-src 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("base-uri 'none'");
  expect(csp).toMatch(/connect-src 'self' https:\/\/nominatim\.openstreetmap\.org https:\/\/overpass-api\.de https:\/\/photon\.komoot\.io https:\/\/bsq-worker\.e2e\.example(;|$)/);
  // The CSP meta must come first in <head> so it governs everything after it.
  expect(html.indexOf('Content-Security-Policy')).toBeLessThan(html.indexOf('<script'));
  expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>\s*\S/i);
  expect(html).not.toMatch(/<style\b|\sstyle="/i);
  expect(html).not.toMatch(/\son[a-z]+=/i);

  await page.goto('./');
  const live = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(live).toBe(csp);
});

// ---------------------------------------------------------------- accessibility & keyboard

test('keyboard-only flow: Tab/type/select/Enter, arrow keys across tabs, Space toggles a quest', async ({ page, guard }, info) => {
  test.skip(info.project.name.startsWith('mobile'), 'keyboard flow is a desktop interaction');
  await guard.mock();
  await page.goto('./');

  const focused = () => page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    return a ? `${a.tagName.toLowerCase()}#${a.id}|${a.getAttribute('role') ?? ''}|${a.className}` : '';
  });
  async function tabUntil(pred: (f: string) => boolean, max: number, key = 'Tab'): Promise<number> {
    for (let i = 1; i <= max; i++) {
      await page.keyboard.press(key);
      if (pred(await focused())) return i;
    }
    throw new Error(`focus never matched after ${max} × ${key}; last: ${await focused()}`);
  }

  // Skip link, the two header links (How it works, Privacy), then the city input.
  expect(await tabUntil((f) => f.startsWith('input#city'), 4)).toBeLessThanOrEqual(4);
  await page.keyboard.type('Bengaluru');
  await page.keyboard.press('Tab');
  expect(await focused()).toMatch(/^select#month/);
  await page.keyboard.type('Oct'); // type-ahead select on a closed <select>
  await expect(page.locator('#month')).toHaveValue('10');
  await page.keyboard.press('Tab');
  // Radius is a radio group: Tab lands on the checked option, arrows change it.
  expect(await focused()).toMatch(/^input#radius-5000/);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: '10 km' })).toBeChecked();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('radio', { name: '5 km' })).toBeChecked();
  await page.keyboard.press('Tab');
  expect(await focused()).toMatch(/^button#\|\|.*search-form__submit/);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('on the map', { timeout: 15_000 });

  // Reach the tablist and move with arrow keys.
  await tabUntil((f) => f.startsWith('button#tab-nearby'), 40);
  await page.keyboard.press('ArrowRight');
  expect(await focused()).toMatch(/^button#tab-online/);
  await expect(page.locator('#tab-online')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#panel-online')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  expect(await focused()).toMatch(/^button#tab-found/);
  await expect(page.locator('#panel-found')).toBeVisible();
  await page.keyboard.press('ArrowRight'); // wraps
  expect(await focused()).toMatch(/^button#tab-nearby/);
  await page.keyboard.press('End');
  expect(await focused()).toMatch(/^button#tab-found/);
  await page.keyboard.press('ArrowLeft');
  expect(await focused()).toMatch(/^button#tab-online/);
  await page.keyboard.press('Home');
  expect(await focused()).toMatch(/^button#tab-nearby/);
  await expect(page.locator('#panel-nearby')).toBeVisible();

  // Into the Nearby panel, to the first quest checkbox, Space toggles it.
  await tabUntil((f) => f.startsWith('input#done-nearby-'), 15);
  const id = await page.evaluate(() => document.activeElement?.id ?? '');
  const box = page.locator(`#${id}`);
  await expect(box).not.toBeChecked();
  await page.keyboard.press('Space');
  await expect(box).toBeChecked();
  await expect(page.locator('.quest-card').filter({ has: box })).toHaveClass(/\bis-done\b/);
  await page.keyboard.press('Space');
  await expect(box).not.toBeChecked();
  await expect(page.locator('.quest-card').filter({ has: box })).not.toHaveClass(/\bis-done\b/);
});

// ---------------------------------------------------------------- mobile layout

test('no horizontal scroll at 375px (initial, results, online tab)', async ({ page, guard }) => {
  await guard.mock();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./');
  const overflow = () =>
    page.evaluate(() => ({
      doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      body: document.body.scrollWidth - document.documentElement.clientWidth,
    }));
  expect(await overflow()).toEqual({ doc: 0, body: 0 });
  await search(page, 'Bengaluru');
  await expect(page.getByRole('status')).toContainText('on the map', { timeout: 15_000 });
  expect((await overflow()).doc).toBeLessThanOrEqual(0);
  expect((await overflow()).body).toBeLessThanOrEqual(0);
  await page.getByRole('tab', { name: /^Online/ }).click();
  expect((await overflow()).doc).toBeLessThanOrEqual(0);
  await page.getByRole('tab', { name: 'Found online' }).click();
  await expect(page.locator('#found-list .live-card')).toHaveCount(1);
  expect((await overflow()).doc).toBeLessThanOrEqual(0);
});
