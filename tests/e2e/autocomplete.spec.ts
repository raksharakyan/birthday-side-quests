import type { Page, Route } from '@playwright/test';
import { expectedNearbyCount, OVERPASS_BENGALURU_PINS, PHOTON_FIRST_LABEL, PHOTON_PUNE_LABEL } from './fixtures';
import { axeViolations, CORS, expect, expectLocationOnlyToNominatim, expectOnlySessionRecord, search, test, type Guard } from './harness';

/*
 * Location autocomplete (Photon) + search radius. All network mocked; harness guards apply.
 */

const city = (page: Page) => page.getByRole('combobox', { name: 'Your city' });
const listbox = (page: Page) => page.getByRole('listbox', { name: 'Place suggestions' });
const options = (page: Page) => listbox(page).getByRole('option');

const hostRequests = (guard: Guard, host: string) => guard.externalRequests().filter((r) => new URL(r.url).hostname === host);
const overpassQuery = (guard: Guard) =>
  hostRequests(guard, 'overpass-api.de').map((r) => decodeURIComponent((r.postData ?? '').replace(/^data=/, '')));

async function typeSlowly(page: Page, text: string): Promise<void> {
  await city(page).click();
  await city(page).pressSequentially(text, { delay: 40 });
}

test('typing "Beng" shows 5 accessible suggestions (axe clean with the listbox open)', async ({ page, guard }) => {
  await guard.mock();
  await page.goto('./');
  await expect(city(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(city(page)).toHaveAttribute('aria-autocomplete', 'list');
  await typeSlowly(page, 'Beng');
  await expect(options(page)).toHaveCount(5);
  await expect(city(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(city(page)).toHaveAttribute('aria-controls', 'city-suggestions');
  await expect(options(page).first()).toHaveText(/Bengaluru.*Bangalore North, Karnataka, India/);
  await expect(page.locator('#suggest-live')).toHaveText(/^5 suggestions available/);
  await expect(page.locator('.ac-footer')).toHaveText('Suggestions by Photon · © OpenStreetMap');
  expect(await axeViolations(page), 'axe: listbox open').toEqual([]);

  const photon = hostRequests(guard, 'photon.komoot.io');
  expect(photon.length).toBeGreaterThanOrEqual(1);
  // Debounced: far fewer requests than keystrokes, and never for < 3 chars.
  for (const r of photon) expect((new URL(r.url).searchParams.get('q') ?? '').length).toBeGreaterThanOrEqual(3);
  expect(photon.length).toBeLessThanOrEqual(2);
  await expectLocationOnlyToNominatim(guard, ['Beng']);
});

test('keyboard: ArrowDown + Enter picks a suggestion and searches WITHOUT Nominatim', async ({ page, context, guard }, info) => {
  test.skip(info.project.name.startsWith('mobile'), 'keyboard interaction is desktop-only');
  await guard.mock();
  await page.goto('./');
  const startUrl = page.url();
  await page.getByLabel('Birthday month').selectOption('10');
  await typeSlowly(page, 'Beng');
  await expect(options(page)).toHaveCount(5);

  await page.keyboard.press('ArrowDown');
  await expect(options(page).nth(0)).toHaveAttribute('aria-selected', 'true');
  await expect(city(page)).toHaveAttribute('aria-activedescendant', 'city-suggestions-0');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await expect(options(page).nth(0)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowUp'); // wraps to the last option
  await expect(options(page).nth(4)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowDown'); // wraps back to the first
  await page.keyboard.press('Enter');

  await expect(city(page)).toHaveValue(PHOTON_FIRST_LABEL);
  await expect(listbox(page)).toBeHidden();
  await expect(city(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('status')).toContainText('on the map', { timeout: 15_000 });
  await expect(page.locator('.map-marker--branch')).toHaveCount(OVERPASS_BENGALURU_PINS);
  await expect(page.locator('#nearby-list .quest-card')).toHaveCount(expectedNearbyCount('IN'));

  expect(hostRequests(guard, 'nominatim.openstreetmap.org')).toEqual([]);
  const [q] = overpassQuery(guard);
  expect(q).toContain('(around:5000,12.971600,77.594600)'); // coords straight from Photon
  // Pressing "Find my quests" again with the picked text still skips Nominatim.
  await page.getByRole('button', { name: 'Find my quests' }).click();
  await expect.poll(() => overpassQuery(guard).length).toBe(2);
  expect(hostRequests(guard, 'nominatim.openstreetmap.org')).toEqual([]);

  const rec = await expectOnlySessionRecord(page, context, startUrl);
  expect(rec).toMatchObject({ city: PHOTON_FIRST_LABEL, lat: 12.9716, lng: 77.5946, countryCode: 'IN', month: 10 });
  await expectLocationOnlyToNominatim(guard, ['Beng']);
});

test('click / tap on a suggestion selects it', async ({ page, guard }, info) => {
  await guard.mock();
  await page.goto('./');
  await page.getByLabel('Birthday month').selectOption('10');
  await typeSlowly(page, 'Pune');
  await expect(options(page)).toHaveCount(5);
  const target = options(page).filter({ hasText: 'Pune' });
  const box = await target.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44); // large tap target
  if (info.project.name.startsWith('mobile')) await target.tap();
  else await target.click();
  await expect(city(page)).toHaveValue(PHOTON_PUNE_LABEL);
  await expect(page.getByRole('status')).toContainText('on the map', { timeout: 15_000 });
  expect(hostRequests(guard, 'nominatim.openstreetmap.org')).toEqual([]);
  expect(overpassQuery(guard)[0]).toContain('18.520400,73.856700');
});

test('picking before the month asks for the month, then Find uses the picked place', async ({ page, guard }, info) => {
  test.skip(info.project.name.startsWith('mobile'), 'keyboard interaction is desktop-only');
  await guard.mock();
  await page.goto('./');
  await typeSlowly(page, 'Beng');
  await expect(options(page)).toHaveCount(5);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('pick your birthday month');
  await expect(page.locator('#month')).toBeFocused();
  await page.getByLabel('Birthday month').selectOption('10');
  await page.getByRole('button', { name: 'Find my quests' }).click();
  await expect(page.getByRole('status')).toContainText('on the map', { timeout: 15_000 });
  expect(hostRequests(guard, 'nominatim.openstreetmap.org')).toEqual([]);
});

test('Escape closes the list; Enter without an active option submits via Nominatim', async ({ page, guard }, info) => {
  test.skip(info.project.name.startsWith('mobile'), 'keyboard interaction is desktop-only');
  await guard.mock();
  await page.goto('./');
  await page.getByLabel('Birthday month').selectOption('10');
  await typeSlowly(page, 'Beng');
  await expect(options(page)).toHaveCount(5);
  await page.keyboard.press('Escape');
  await expect(listbox(page)).toBeHidden();
  await expect(city(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(city(page)).toHaveValue('Beng');
  await expect(city(page)).toBeFocused();

  // Re-open with ArrowDown, then Tab closes it too.
  await page.keyboard.press('ArrowDown');
  await expect(options(page)).toHaveCount(5);
  await page.keyboard.press('Tab');
  await expect(listbox(page)).toBeHidden();

  // Outside click closes.
  await city(page).click();
  await page.keyboard.press('ArrowDown');
  await expect(listbox(page)).toBeVisible();
  await page.locator('.brand__name').click();
  await expect(listbox(page)).toBeHidden();

  // Free text + Enter (no active option) → normal Nominatim flow.
  await city(page).fill('Bengaluru');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('on the map', { timeout: 15_000 });
  expect(hostRequests(guard, 'nominatim.openstreetmap.org')).toHaveLength(1);
});

test('XSS: hostile Photon names render as text only', async ({ page, guard }) => {
  const RLO = String.fromCodePoint(0x202e);
  await guard.mock({
    photon: (route) =>
      route.fulfill({
        headers: CORS,
        json: {
          type: 'FeatureCollection',
          features: [
            { type: 'Feature', geometry: { type: 'Point', coordinates: [77.6, 12.97] }, properties: { name: '<img src=x onerror=alert(1)>', state: `<svg onload=alert(2)>${RLO}evil`, country: 'India', countrycode: 'IN' } },
            { type: 'Feature', geometry: { type: 'Point', coordinates: [77.6, 12.97] }, properties: { name: '"><script>alert(3)</script>', countrycode: 'IN' } },
            { type: 'Feature', geometry: { type: 'Point', coordinates: [999, 12.97] }, properties: { name: 'Out of range', countrycode: 'IN' } },
          ],
        },
      }),
  });
  await page.goto('./');
  const scriptsBefore = await page.locator('script').count();
  await typeSlowly(page, 'evil');
  await expect(options(page)).toHaveCount(2);
  await expect(options(page).nth(0)).toHaveText('<img src=x onerror=alert(1)><svg onload=alert(2)> evil, India');
  await expect(options(page).nth(1)).toHaveText('"><script>alert(3)</script>');
  const dom = await page.evaluate(() => ({
    imgX: document.querySelectorAll('img[src="x"]').length,
    inList: document.querySelectorAll('#city-suggestions img, #city-suggestions svg:not(.icon), #city-suggestions script').length,
    // Only our own decorative pin icons (aria-hidden, built with createElementNS) may be SVG.
    pins: [...document.querySelectorAll('#city-suggestions svg.icon')].every((s) => s.getAttribute('aria-hidden') === 'true' && s.querySelector('[onload]') === null),
    onAttrs: [...document.querySelectorAll('*')].filter((e) => [...e.attributes].some((a) => a.name.startsWith('on'))).length,
    bidi: /[‪-‮⁦-⁩]/.test(document.getElementById('city-suggestions')?.textContent ?? ''),
  }));
  expect(dom).toEqual({ imgX: 0, inList: 0, pins: true, onAttrs: 0, bidi: false });
  expect(await page.locator('script').count()).toBe(scriptsBefore);
  await page.waitForTimeout(300);
});

test('Photon 500 → no suggestions, Enter still searches via Nominatim', async ({ page, guard }) => {
  guard.allowConsole(/Failed to load resource: the server responded with a status of 500/);
  await guard.mock({ photon: (route: Route) => route.fulfill({ status: 500, body: 'oops', headers: CORS }) });
  await page.goto('./');
  await page.getByLabel('Birthday month').selectOption('10');
  await typeSlowly(page, 'Bengaluru');
  await expect.poll(() => hostRequests(guard, 'photon.komoot.io').length).toBeGreaterThan(0);
  await page.waitForTimeout(150);
  await expect(listbox(page)).toBeHidden();
  await expect(city(page)).toHaveAttribute('aria-expanded', 'false');
  await city(page).press('Enter');
  await expect(page.getByRole('status')).toContainText('on the map', { timeout: 15_000 });
  expect(hostRequests(guard, 'nominatim.openstreetmap.org')).toHaveLength(1);
});

test('radius select changes the Overpass radius; nearby cards are sorted by distance and grouped', async ({ page, guard }) => {
  await guard.mock();
  await page.goto('./');
  await page.getByRole('radio', { name: '10 km' }).check();
  await search(page, 'Bengaluru');
  await expect(page.getByRole('status')).toContainText('within 10 km', { timeout: 15_000 });
  expect(overpassQuery(guard)[0]).toContain('(around:10000,12.976794,77.590082)');
  expect(overpassQuery(guard)[0]).toContain('out center 150;');

  // Cards with a branch first, nearest first, each with "x km away"; the rest under a heading.
  const first = page.locator('#nearby-list > .quest-list .quest-card');
  const withBranch = await first.count();
  expect(withBranch).toBeGreaterThan(0);
  const dists = await first.locator('.quest-card__distance').allTextContents();
  expect(dists).toHaveLength(withBranch);
  const metres = dists.map((d) => {
    const m = /([\d.]+) (m|km) away/.exec(d);
    return m ? Number(m[1]) * (m[2] === 'km' ? 1000 : 1) : Number.NaN;
  });
  expect(metres.every(Number.isFinite)).toBe(true);
  expect([...metres].sort((a, b) => a - b)).toEqual(metres);
  const total = expectedNearbyCount('IN');
  if (total > withBranch) {
    await expect(page.getByRole('heading', { name: 'More quests in India (no branch found within 10 km)' })).toBeVisible();
    await expect(page.locator('#nearby-list .quest-group .quest-card')).toHaveCount(total - withBranch);
    await expect(page.locator('#nearby-list .quest-group .quest-card__distance')).toHaveCount(0);
  }
  await expect(page.locator('#nearby-list .quest-card')).toHaveCount(total);
  await expect(page.locator('.map-radius')).toHaveCount(1);

  // Changing the radius re-runs the lookup for the same place (no new geocoding).
  await page.getByRole('radio', { name: '20 km' }).check();
  await expect(page.getByRole('status')).toContainText('within 20 km', { timeout: 15_000 });
  expect(overpassQuery(guard)[1]).toContain('(around:20000,12.976794,77.590082)');
  expect(hostRequests(guard, 'nominatim.openstreetmap.org')).toHaveLength(1);
  expect(await axeViolations(page), 'axe: grouped results').toEqual([]);
  await expectLocationOnlyToNominatim(guard, ['Bengaluru']);
});

