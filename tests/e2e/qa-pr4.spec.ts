import type { Page, Route } from '@playwright/test';
import { expectedNearbyCount, expectedNearbyOffers, haversineM, PHOTON_PUNE_LABEL, seedOffers, VENUE_MAX_M } from './fixtures';
import { axeViolations, CORS, expect, expectOnlySessionRecord, search, test, type Guard } from './harness';

/*
 * QA: PR #4 (DECISIONS #24 venues, #25 "Verified only"). Gaps not covered by venues-verified.spec.ts:
 * Pune (picked via Photon) with all three Mumbai-area parks, Chennai/Hyderabad Wonderla resolution
 * (incl. a venue pin inside a 20 km circle), Delhi with no parks, claimed state x Verified only,
 * the switch before a search, mobile widths, keyboard, reduced motion and axe.
 * Expectations are computed from public/offers.json, never hard-coded counts.
 */

type LatLng = { lat: number; lng: number };
const PUNE: LatLng = { lat: 18.5204, lng: 73.8567 }; // Photon fixture coordinates
const CHENNAI: LatLng = { lat: 13.0827, lng: 80.2707 };
const HYDERABAD: LatLng = { lat: 17.385, lng: 78.4867 };
const DELHI: LatLng = { lat: 28.6139, lng: 77.209 };

const OFFERS = seedOffers();
const VENUE_IDS = OFFERS.filter((o) => o.venues).map((o) => o.id);

/** Venue offers expected in Nearby at `at`, nearest first, with the nearest venue. */
function expectedVenueCards(at: LatLng) {
  return OFFERS.filter((o) => o.venues && o.countries.includes('IN'))
    .map((o) => {
      const best = o.venues!.map((v) => ({ v, d: haversineM(at.lat, at.lng, v.lat, v.lng) })).sort((a, b) => a.d - b.d)[0]!;
      return { id: o.id, name: best.v.name, exact: best.v.exact !== false, lat: best.v.lat, lng: best.v.lng, km: best.d / 1000 };
    })
    .filter((x) => x.km * 1000 <= VENUE_MAX_M)
    .sort((a, b) => a.km - b.km);
}

const nominatimAt = (name: string, at: LatLng) => (route: Route) =>
  route.fulfill({
    json: [{ lat: String(at.lat), lon: String(at.lng), display_name: `${name}, India`, address: { city: name, country_code: 'in' } }],
    headers: CORS,
  });
const noShops = (route: Route) => route.fulfill({ json: { elements: [] }, headers: CORS });
const card = (page: Page, id: string) => page.locator(`#nearby-list .quest-card[data-offer-id="${id}"]`);
const sw = (page: Page) => page.getByRole('switch', { name: 'Verified only' });
const hostRequests = (guard: Guard, host: string) => guard.externalRequests().filter((r) => new URL(r.url).hostname === host);
const ringTotal = (at?: LatLng, verifiedOnly = false) => {
  const ids = new Map<string, boolean>();
  for (const o of [
    ...expectedNearbyOffers('IN', at),
    ...OFFERS.filter((o) => (o.channel === 'online' || o.channel === 'both') && o.countries.includes('IN')),
  ])
    ids.set(o.id, o.verified === true);
  return verifiedOnly ? [...ids.values()].filter(Boolean).length : ids.size;
};
async function overflowX(page: Page): Promise<number> {
  return page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth);
}

// ---------------------------------------------------------------- venues by city

test('Pune (picked from Photon): Wet’nJoy "about", Imagicaa and Water Kingdom with km and directions, nearest first; no Wonderla; no far pins', async ({
  page,
  guard,
}) => {
  await guard.mock({ overpass: noShops });
  await page.goto('./');
  await page.getByLabel('Birthday month').selectOption('10');
  const city = page.getByRole('combobox', { name: 'Your city' });
  await city.click();
  await city.pressSequentially('Pune', { delay: 40 });
  await page.getByRole('option', { name: /^Pune Pune City/ }).click();
  await expect(city).toHaveValue(PHOTON_PUNE_LABEL);
  await expect(page.getByRole('status')).toContainText('Found', { timeout: 15_000 });
  await expect(page.getByRole('status')).not.toContainText('Looking for shops');
  expect(hostRequests(guard, 'nominatim.openstreetmap.org')).toEqual([]);

  const want = expectedVenueCards(PUNE);
  expect(want.map((w) => w.id)).toEqual(['wetnjoy-lonavala-in', 'imagicaa-in', 'water-kingdom-in']); // data sanity: WK ~136 km is inside 150
  await expect(page.locator('#nearby-list .quest-card')).toHaveCount(expectedNearbyCount('IN', PUNE));
  // Venue cards are the only ones with a "branch" (no Overpass shops), sorted nearest first.
  const ids = await page.locator('#nearby-list > .quest-list .quest-card').evaluateAll((cs) => cs.map((c) => (c as HTMLElement).dataset.offerId));
  expect(ids).toEqual(want.map((w) => w.id));
  for (const w of want) {
    const c = card(page, w.id);
    await expect(c.locator('.quest-card__branch')).toHaveText(w.name);
    await expect(c.locator('.quest-card__distance')).toHaveText(w.exact ? `${Math.round(w.km)} km away` : `about ${Math.round(w.km)} km away`);
    const href = w.exact
      ? `https://www.google.com/maps/dir/?api=1&destination=${w.lat},${w.lng}`
      : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(w.name).replace(/'/g, '%27')}`;
    await expect(c.locator('a.btn--directions')).toHaveAttribute('href', href);
    await expect(c.locator('a.btn--directions')).toHaveAttribute('rel', /noopener/);
  }
  await expect(card(page, 'wonderla-in')).toHaveCount(0);
  // 5 km circle: every park is outside, so no pins at all and the header counts 0 within 5 km.
  await expect(page.locator('.map-marker--branch')).toHaveCount(0);
  await expect(page.locator('#results-sub')).toContainText('0 within 5 km of Pune.');
  // Overpass never asked for parks.
  const q = hostRequests(guard, 'overpass-api.de').map((r) => decodeURIComponent(r.postData ?? ''));
  expect(q.join('\n')).not.toMatch(/imagica|wonderla|water kingdom|wet/i);
  // Parks are verified, so Verified only keeps them.
  await sw(page).click();
  for (const w of want) await expect(card(page, w.id)).toHaveCount(1);
  await expect(page.locator('#nearby-list .badge--check')).toHaveCount(0);
  expect(await axeViolations(page), 'axe: Pune venue cards, Verified only').toEqual([]);
});

test('Chennai: Wonderla Chennai (not Bengaluru) with coordinates; no Mumbai-area parks', async ({ page, guard }) => {
  await guard.mock({ nominatim: nominatimAt('Chennai', CHENNAI), overpass: noShops });
  await page.goto('./');
  await search(page, 'Chennai');
  await expect(page.getByRole('status')).toContainText('Found', { timeout: 15_000 });
  await expect(page.getByRole('status')).not.toContainText('Looking for shops');
  const [w] = expectedVenueCards(CHENNAI);
  expect(expectedVenueCards(CHENNAI)).toHaveLength(1);
  expect(w!.name).toBe('Wonderla Chennai');
  const c = card(page, 'wonderla-in');
  await expect(c.locator('.quest-card__branch')).toHaveText('Wonderla Chennai');
  await expect(c.locator('.quest-card__distance')).toHaveText(`${Math.round(w!.km)} km away`);
  await expect(c.locator('a.btn--directions')).toHaveAttribute('href', 'https://www.google.com/maps/dir/?api=1&destination=12.7427,80.1742');
  for (const id of VENUE_IDS.filter((i) => i !== 'wonderla-in')) await expect(card(page, id)).toHaveCount(0);
  await expect(page.locator('#nearby-list .quest-card')).toHaveCount(expectedNearbyCount('IN', CHENNAI));
});

test('Hyderabad at 20 km: Wonderla Hyderabad (~19 km) is inside the circle, so it gets a pin', async ({ page, guard }) => {
  await guard.mock({ nominatim: nominatimAt('Hyderabad', HYDERABAD), overpass: noShops });
  await page.goto('./');
  await page.getByRole('radio', { name: '20 km' }).check();
  await search(page, 'Hyderabad');
  await expect(page.getByRole('status')).toContainText('on the map within 20 km', { timeout: 15_000 });
  const [w] = expectedVenueCards(HYDERABAD);
  expect(w!.km).toBeLessThan(20);
  await expect(card(page, 'wonderla-in').locator('.quest-card__branch')).toHaveText('Wonderla Hyderabad');
  await expect(page.locator('.map-marker--branch[data-offer-id="wonderla-in"]')).toHaveCount(1);
  await expect(page.locator('.map-marker--branch')).toHaveCount(1);
  await expect(page.locator('#results-sub')).toContainText('1 within 20 km of Hyderabad.');
  // Verified only keeps the (verified) park pin.
  await sw(page).click();
  await expect(page.locator('.map-marker--branch[data-offer-id="wonderla-in"]')).toHaveCount(1);
});

test('Delhi: no theme parks in Nearby or Online', async ({ page, guard }) => {
  await guard.mock({ nominatim: nominatimAt('Delhi', DELHI), overpass: noShops });
  await page.goto('./');
  await search(page, 'Delhi');
  await expect(page.getByRole('status')).toContainText('Found', { timeout: 15_000 });
  await expect(page.getByRole('status')).not.toContainText('Looking for shops');
  expect(expectedVenueCards(DELHI)).toEqual([]);
  await expect(page.locator('#nearby-list .quest-card')).toHaveCount(expectedNearbyCount('IN', DELHI));
  for (const id of VENUE_IDS) {
    await expect(card(page, id)).toHaveCount(0);
    await expect(page.locator(`#online-list .quest-card[data-offer-id="${id}"]`)).toHaveCount(0);
  }
  await expect(page.locator('#nearby-list')).not.toContainText(/Wonderla|Imagicaa|Water Kingdom|Wet'nJoy/);
  await expect(page.locator('#progress-count')).toHaveText(`0 of ${ringTotal(DELHI)}`);
});

// ---------------------------------------------------------------- claimed x Verified only

test('claimed + Verified only: hidden unverified claim leaves the ring sensible, survives toggling and reload', async ({ page, context, guard }) => {
  await guard.mock();
  await page.goto('./');
  const startUrl = page.url();
  await search(page, 'Bengaluru');
  await expect(page.getByRole('status')).toContainText('on the map', { timeout: 15_000 });
  const total = ringTotal();
  const vTotal = ringTotal(undefined, true);
  expect(OFFERS.find((o) => o.id === 'starbucks-in')!.verified).toBe(false);
  expect(OFFERS.find((o) => o.id === 'the-body-shop-in')!.verified).toBe(true);

  // Claim one unverified (Starbucks) and one verified (The Body Shop).
  await card(page, 'starbucks-in').getByLabel('Mark claimed').check();
  await card(page, 'the-body-shop-in').getByLabel('Mark claimed').check();
  await expect(page.locator('#progress-count')).toHaveText(`2 of ${total}`);

  // On: Starbucks hidden (card and pin), ring counts only listed quests.
  await sw(page).click();
  await expect(card(page, 'starbucks-in')).toHaveCount(0);
  await expect(page.locator('.map-marker--branch[data-offer-id="starbucks-in"]')).toHaveCount(0);
  await expect(page.locator('#progress-count')).toHaveText(`1 of ${vTotal}`);
  await expect(page.locator('body')).toHaveClass(/\bis-lit\b/);
  await expect(page.locator('.map-marker--branch.is-claimed[data-offer-id="the-body-shop-in"]')).toHaveCount(1);
  const ratio = await page.locator('#progress').evaluate((e) => Number(getComputedStyle(e).getPropertyValue('--progress')));
  expect(ratio).toBeCloseTo(1 / vTotal, 3);

  // Unclaim the verified one while filtered: 0 of vTotal, nothing breaks.
  await card(page, 'the-body-shop-in').getByLabel('Mark claimed').uncheck();
  await expect(page.locator('#progress-count')).toHaveText(`0 of ${vTotal}`);

  // The hidden claim is still saved.
  let rec = await expectOnlySessionRecord(page, context, startUrl);
  expect(rec?.done).toEqual(['starbucks-in']);
  expect(rec?.verifiedOnly).toBe(true);

  // Reload with the filter on: claim kept, still hidden.
  await guard.checkpoint();
  await page.reload();
  await expect(page.getByRole('status')).toContainText('on the map', { timeout: 15_000 });
  await expect(sw(page)).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#progress-count')).toHaveText(`0 of ${vTotal}`);

  // Off: the claim is back on its card, pin and ring.
  await sw(page).click();
  await expect(card(page, 'starbucks-in')).toHaveClass(/\bis-done\b/);
  await expect(card(page, 'starbucks-in').getByLabel('Mark claimed')).toBeChecked();
  await expect(page.locator('#progress-count')).toHaveText(`1 of ${total}`);
  await expect(page.locator('body')).toHaveClass(/\bis-lit\b/);
  await expect(page.locator('.map-marker--branch.is-claimed[data-offer-id="starbucks-in"]')).toHaveCount(1);
  rec = await expectOnlySessionRecord(page, context, startUrl);
  expect(rec).toMatchObject({ done: ['starbucks-in'], verifiedOnly: false });
  expect(await axeViolations(page), 'axe: claimed after toggling').toEqual([]);
});

test('Verified only before any search: Online is filtered, then the search status and Nearby honour it', async ({ page, guard }) => {
  await guard.mock();
  await page.goto('./');
  await sw(page).click();
  await expect(sw(page)).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('tab', { name: /^Online/ }).click();
  await page.locator('#country').selectOption('IN');
  const onlineV = OFFERS.filter((o) => (o.channel === 'online' || o.channel === 'both') && o.countries.includes('IN') && o.verified);
  await expect(page.locator('#online-list .quest-card')).toHaveCount(onlineV.length);
  await page.getByRole('tab', { name: /^Nearby/ }).click();
  await search(page, 'Bengaluru');
  const nV = expectedNearbyOffers('IN').filter((o) => o.verified).length;
  await expect(page.getByRole('status')).toContainText(`Found ${nV} verified quests and 1 place on the map`, { timeout: 15_000 });
  await expect(page.locator('#nearby-list .quest-card')).toHaveCount(nV);
  await expect(page.locator('#progress-count')).toHaveText(`0 of ${ringTotal(undefined, true)}`);
});

// ---------------------------------------------------------------- layout, keyboard, motion

test('switch: no horizontal scroll at 360/375/390, one-line pill, 44px target, inside the viewport (off and on)', async ({ page, guard }, info) => {
  test.skip(info.project.name.startsWith('mobile'), 'widths are set explicitly; one project is enough');
  await guard.mock();
  await page.goto('./');
  await search(page, 'Bengaluru');
  await expect(page.getByRole('status')).toContainText('on the map', { timeout: 15_000 });
  for (const width of [360, 375, 390]) {
    await page.setViewportSize({ width, height: 800 });
    for (const on of [false, true]) {
      if ((await sw(page).getAttribute('aria-checked')) !== String(on)) await sw(page).click();
      await sw(page).scrollIntoViewIfNeeded();
      expect(await overflowX(page), `overflow at ${width} (on=${on})`).toBeLessThanOrEqual(0);
      const box = (await sw(page).boundingBox())!;
      expect(box.height, `height at ${width}`).toBeGreaterThanOrEqual(44);
      expect(box.height, `one line at ${width}`).toBeLessThan(56);
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      // Switch and tabs don't overlap.
      const tabs = (await page.locator('.tabs').boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(tabs.y + 0.5);
    }
  }
  expect(await axeViolations(page), 'axe: 390px, Verified only on').toEqual([]);
});

test('keyboard: Tab reaches the switch, then the Filter button, before the tablist; Enter toggles, focus ring visible', async ({ page, guard }, info) => {
  test.skip(info.project.name.startsWith('mobile'), 'keyboard flow is a desktop interaction');
  await guard.mock();
  await page.goto('./');
  await search(page, 'Bengaluru');
  await expect(page.getByRole('status')).toContainText('on the map', { timeout: 15_000 });
  await page.getByRole('tab', { name: /^Nearby/ }).focus();
  // The Filter button (DECISIONS #27) sits right after the switch.
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: /^Filter/ })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(sw(page)).toBeFocused();
  const ring = await sw(page).evaluate((e) => getComputedStyle(e).boxShadow);
  expect(ring).not.toBe('none');
  expect(ring.split('rgb').length).toBeGreaterThan(2); // edge + focus ring
  await page.keyboard.press('Enter');
  await expect(sw(page)).toHaveAttribute('aria-checked', 'true');
  await expect(sw(page)).toBeFocused();
  expect(await sw(page).evaluate((e) => getComputedStyle(e).boxShadow)).not.toBe('none');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: /^Filter/ })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('tab', { name: /^Nearby/ })).toBeFocused();
  // Accessible description present.
  await expect(sw(page)).toHaveAccessibleDescription('Hides quests marked Check with store.');
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('switch thumb jumps to its end state; axe passes', async ({ page, guard }) => {
    await guard.mock();
    await page.goto('./');
    const thumb = page.locator('#verified-only .switch__thumb');
    const dur = await thumb.evaluate((e) => parseFloat(getComputedStyle(e).transitionDuration));
    expect(dur).toBeLessThanOrEqual(0.001);
    await sw(page).click();
    await expect(sw(page)).toHaveAttribute('aria-checked', 'true');
    // End state immediately (no in-flight transitions on the switch).
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.getAnimations().filter((a) => {
              const t = (a.effect as KeyframeEffect | null)?.target;
              return t instanceof Element && t.closest('#verified-only') && a.playState === 'running';
            }).length,
        ),
        { timeout: 200 },
      )
      .toBe(0);
    const t = await thumb.evaluate((e) => getComputedStyle(e).transform);
    expect(t).toMatch(/matrix\(1, 0, 0, 1, 14, 0\)/);
    expect(await axeViolations(page), 'axe: reduced motion, switch on').toEqual([]);
  });
});
