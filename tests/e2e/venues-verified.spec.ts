import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page, Route } from '@playwright/test';
import { expectedNearbyCount, expectedNearbyOffers, seedOffers } from './fixtures';
import { axeViolations, CORS, expect, expectOnlySessionRecord, search, storageSnapshot, test } from './harness';

/*
 * DECISIONS #24 (venues for single-location offers) and #25 ("Verified only" switch).
 * All network mocked; harness guards (unexpected hosts, dialogs, CSP, geolocation, errors) apply.
 */

const PARKS = ['imagicaa-in', 'wonderla-in', 'water-kingdom-in', 'wetnjoy-lonavala-in'];
const KOLKATA = { lat: 22.5726, lng: 88.3639 };
const MUMBAI = { lat: 19.076, lng: 72.8777 };

const nominatimAt = (name: string, at: { lat: number; lng: number }) => (route: Route) =>
  route.fulfill({
    json: [{ lat: String(at.lat), lon: String(at.lng), display_name: `${name}, India`, address: { city: name, country_code: 'in' } }],
    headers: CORS,
  });
const noShops = (route: Route) => route.fulfill({ json: { elements: [] }, headers: CORS });
const nearbyCard = (page: Page, id: string) => page.locator(`#nearby-list .quest-card[data-offer-id="${id}"]`);
const verifiedSwitch = (page: Page) => page.getByRole('switch', { name: 'Verified only' });

// ---------------------------------------------------------------- venues

test('Kolkata: single-location parks near Mumbai or Bengaluru are not in Nearby (or Online)', async ({ page, guard }) => {
  await guard.mock({ nominatim: nominatimAt('Kolkata', KOLKATA), overpass: noShops });
  await page.goto('./');
  await search(page, 'Kolkata');
  await expect(page.getByRole('status')).toContainText('Found', { timeout: 15_000 });
  const n = expectedNearbyCount('IN', KOLKATA);
  await expect(page.locator('#nearby-list .quest-card')).toHaveCount(n);
  await expect(page.locator('#nearby-count')).toHaveText(`${n} quests`);
  for (const id of PARKS) {
    await expect(nearbyCard(page, id)).toHaveCount(0);
    await expect(page.locator(`#online-list .quest-card[data-offer-id="${id}"]`)).toHaveCount(0);
  }
  await expect(page.locator('#nearby-list')).not.toContainText('Imagicaa');
  // Overpass is never asked for the parks (they have fixed venues instead of name hints).
  const q = guard
    .externalRequests()
    .filter((r) => new URL(r.url).hostname === 'overpass-api.de')
    .map((r) => decodeURIComponent((r.postData ?? '').replace(/^data=/, '')));
  expect(q.join('\n')).not.toMatch(/imagica|wonderla|water kingdom|wet\.\?n/i);
});

test('Bengaluru: Wonderla shows "Wonderla Bengaluru", its km distance and exact directions; no pin outside the circle', async ({ page, guard }) => {
  await guard.mock();
  await page.goto('./');
  await search(page, 'Bengaluru');
  await expect(page.getByRole('status')).toContainText('on the map', { timeout: 15_000 });
  const card = nearbyCard(page, 'wonderla-in');
  await expect(card).toHaveCount(1);
  await expect(card.locator('.quest-card__branch')).toHaveText('Wonderla Bengaluru');
  await expect(card.locator('.quest-card__distance')).toHaveText(/^2\d km away$/);
  const dir = card.locator('a.btn--directions');
  await expect(dir).toHaveAttribute('href', 'https://www.google.com/maps/dir/?api=1&destination=12.8346,77.4');
  await expect(dir).toHaveAttribute('target', '_blank');
  await expect(dir).toHaveAccessibleName('Get directions to Wonderla, Wonderla Bengaluru (opens in a new tab)');
  // In the "with a branch" group (sorted by distance, so after the 4 shops within 5 km), not the rest group.
  await expect(page.locator('#nearby-list > .quest-list .quest-card').last()).toHaveAttribute('data-offer-id', 'wonderla-in');
  await expect(page.getByRole('heading', { name: 'Also in India: find your nearest branch' })).toBeVisible();
  // 26 km is outside the 5 km circle: no pin, so the map doesn't zoom out.
  await expect(page.locator('.map-marker--branch[data-offer-id="wonderla-in"]')).toHaveCount(0);
  for (const id of ['imagicaa-in', 'water-kingdom-in', 'wetnjoy-lonavala-in']) await expect(nearbyCard(page, id)).toHaveCount(0);
  await expect(page.locator('#nearby-list .quest-card')).toHaveCount(expectedNearbyCount('IN'));
});

test('Mumbai: Wet’nJoy shows "about N km" with directions by name and no pin; Water Kingdom gets a pin at 20 km', async ({ page, guard }) => {
  await guard.mock({ nominatim: nominatimAt('Mumbai', MUMBAI), overpass: noShops });
  await page.goto('./');
  await page.getByRole('radio', { name: '20 km' }).check();
  await search(page, 'Mumbai');
  await expect(page.getByRole('status')).toContainText('on the map within 20 km', { timeout: 15_000 });

  const wet = nearbyCard(page, 'wetnjoy-lonavala-in');
  await expect(wet.locator('.quest-card__branch')).toHaveText("Wet'nJoy Water Park Lonavala");
  await expect(wet.locator('.quest-card__distance')).toHaveText(/^about \d+ km away$/);
  await expect(wet.locator('a.btn--directions')).toHaveAttribute(
    'href',
    'https://www.google.com/maps/dir/?api=1&destination=Wet%27nJoy%20Water%20Park%20Lonavala',
  );
  await expect(page.locator('.map-marker--branch[data-offer-id="wetnjoy-lonavala-in"]')).toHaveCount(0);

  const wk = nearbyCard(page, 'water-kingdom-in');
  await expect(wk.locator('.quest-card__branch')).toHaveText('Water Kingdom, Gorai, Mumbai');
  await expect(wk.locator('a.btn--directions')).toHaveAttribute('href', 'https://www.google.com/maps/dir/?api=1&destination=19.2326,72.8061');
  await expect(page.locator('.map-marker--branch[data-offer-id="water-kingdom-in"]')).toHaveCount(1);
  await expect(page.locator('.map-marker--branch')).toHaveCount(1);
  await expect(nearbyCard(page, 'imagicaa-in').locator('.quest-card__branch')).toHaveText('Imagicaa, Khopoli');
  await expect(nearbyCard(page, 'wonderla-in')).toHaveCount(0);
  await expect(page.locator('#nearby-list .quest-card')).toHaveCount(expectedNearbyCount('IN', MUMBAI));
  expect(await axeViolations(page), 'axe: venue cards').toEqual([]);
});

// ---------------------------------------------------------------- Verified only

test('Verified only: counts, cards, pins, announcement, keyboard, persistence and Clear search', async ({ page, context, guard }) => {
  await guard.mock();
  await page.goto('./');
  const startUrl = page.url();
  await search(page, 'Bengaluru');
  await expect(page.getByRole('status')).toContainText('on the map', { timeout: 15_000 });

  const nearbyAll = expectedNearbyOffers('IN');
  const nearbyVerified = nearbyAll.filter((o) => o.verified);
  const onlineAll = seedOffers().filter((o) => (o.channel === 'online' || o.channel === 'both') && o.countries.includes('IN'));
  const onlineVerified = onlineAll.filter((o) => o.verified);
  const all = new Map([...nearbyAll, ...onlineAll].map((o) => [o.id, o.verified === true]));
  const total = all.size;
  const verifiedTotal = [...all.values()].filter(Boolean).length;
  expect(verifiedTotal).toBeLessThan(total);

  const sw = verifiedSwitch(page);
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('#nearby-count')).toHaveText(`${nearbyAll.length} quests`);
  await expect(page.locator('#progress-count')).toHaveText(`0 of ${total}`);
  await expect(page.locator('.map-marker--branch')).toHaveCount(4);

  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#nearby-count')).toHaveText(`${nearbyVerified.length} quests`);
  await expect(page.locator('#online-count')).toHaveText(`${onlineVerified.length} quests`);
  await expect(page.locator('#nearby-list .quest-card')).toHaveCount(nearbyVerified.length);
  await expect(page.locator('#online-list .quest-card')).toHaveCount(onlineVerified.length);
  await expect(page.locator('#nearby-list .badge--check, #online-list .badge--check')).toHaveCount(0);
  await expect(page.locator('#progress-count')).toHaveText(`0 of ${verifiedTotal}`);
  await expect(page.locator('#results-sub')).toContainText(`${verifiedTotal} quests in total.`);
  await expect(page.getByRole('status')).toHaveText(`Showing verified quests only, ${verifiedTotal} of ${total}`);
  // Pins: only The Body Shop is verified among the 4 mocked shops.
  await expect(page.locator('.map-marker--branch')).toHaveCount(1);
  await expect(page.locator('.map-marker--branch[data-offer-id="the-body-shop-in"]')).toHaveCount(1);
  // Found online is never verified: a note explains the switch doesn't apply there.
  await page.getByRole('tab', { name: /^Found online/ }).click();
  await expect(page.locator('#found-verified-note')).toBeVisible();
  await expect(page.locator('#found-verified-note')).toHaveText("Verified only doesn't apply here: live web results are never verified.");
  await page.getByRole('tab', { name: /^Nearby/ }).click();
  expect(await axeViolations(page), 'axe: Verified only on').toEqual([]);

  // Saved in the session record.
  const rec = await expectOnlySessionRecord(page, context, startUrl);
  expect(rec?.verifiedOnly).toBe(true);

  // Keyboard: Space toggles it off and on again.
  await sw.focus();
  await page.keyboard.press('Space');
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('#nearby-list .quest-card')).toHaveCount(nearbyAll.length);
  await expect(page.locator('.map-marker--branch')).toHaveCount(4);
  await expect(page.getByRole('status')).toHaveText(`Showing all quests, ${total} in total`);
  await page.keyboard.press('Space');
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#nearby-list .quest-card')).toHaveCount(nearbyVerified.length);

  // Persists across a reload.
  await guard.checkpoint();
  await page.reload();
  await expect(verifiedSwitch(page)).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('status')).toContainText('on the map', { timeout: 15_000 });
  await expect(page.locator('#nearby-list .quest-card')).toHaveCount(nearbyVerified.length);
  await expect(page.locator('#nearby-count')).toHaveText(`${nearbyVerified.length} quests`);
  await expect(page.locator('.map-marker--branch')).toHaveCount(1);

  // Clear search turns it off.
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(verifiedSwitch(page)).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('#found-verified-note')).toBeHidden();
  expect((await storageSnapshot(page)).sessionKeys).toEqual([]);
});

test('Verified only: empty state "No verified quests here yet" with "Show all quests"', async ({ page, guard }) => {
  await guard.mock();
  // Same-origin offers.json with every offer unverified.
  const file = JSON.parse(readFileSync(resolve(process.cwd(), 'public/offers.json'), 'utf8')) as { offers: Array<{ verified?: boolean }> };
  for (const o of file.offers) o.verified = false;
  await page.route('**/offers.json', (route) => route.fulfill({ json: file }));
  await page.goto('./');
  await search(page, 'Bengaluru');
  await expect(page.getByRole('status')).toContainText('on the map', { timeout: 15_000 });
  const sw = verifiedSwitch(page);
  await sw.click();
  await expect(page.locator('#nearby-count')).toHaveText('0 quests');
  await expect(page.locator('#nearby-list .empty-state__title')).toHaveText('No verified quests here yet');
  await expect(page.locator('#online-list .empty-state__title')).toHaveText('No verified quests here yet');
  await expect(page.locator('#progress')).toBeHidden();
  await expect(page.locator('.map-marker--branch')).toHaveCount(0);
  expect(await axeViolations(page), 'axe: verified empty state').toEqual([]);
  await page.locator('#nearby-list').getByRole('button', { name: 'Show all quests' }).click();
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await expect(sw).toBeFocused();
  await expect(page.locator('#nearby-list .quest-card')).toHaveCount(expectedNearbyCount('IN'));
});

test('a version 1 session record is migrated (Verified only off, every type on) and re-saved as version 3', async ({ page, context, guard }) => {
  await guard.mock();
  await page.goto('./');
  const startUrl = page.url();
  await page.evaluate(() =>
    sessionStorage.setItem(
      'bsq-session',
      JSON.stringify({ v: 1, city: null, lat: null, lng: null, countryCode: 'IN', month: 10, radius: 5000, tab: 'online', done: [] }),
    ),
  );
  await page.reload();
  await expect(page.locator('#country')).toHaveValue('IN');
  await expect(verifiedSwitch(page)).toHaveAttribute('aria-checked', 'false');
  await verifiedSwitch(page).click();
  const rec = await expectOnlySessionRecord(page, context, startUrl);
  expect(rec).toMatchObject({ v: 3, countryCode: 'IN', month: 10, tab: 'online', verifiedOnly: true, types: { free: true, discount: true, past: true } });
});
