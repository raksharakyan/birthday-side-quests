import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { PHOTON_PUNE_LABEL } from './fixtures';
import {
  axeViolations, CORS, expect, expectLocationOnlyToNominatim, expectNothingPersisted, expectOnlySessionRecord, search,
  SESSION_KEY, storageSnapshot, test, type Guard,
} from './harness';

/*
 * City-only search, session persistence (sessionStorage, DECISIONS #18), all-countries Online select
 * with auto-sync (DECISIONS #20) and detailed claim info on cards. All network mocked; harness guards apply.
 */

interface SeedOffer {
  id: string;
  brand: string;
  channel: string;
  countries: string[];
  steps?: string[];
  rewardItem?: string;
}
const OFFERS = (JSON.parse(readFileSync(resolve(process.cwd(), 'public/offers.json'), 'utf8')) as { offers: SeedOffer[] }).offers;
const onlineCount = (cc: string) =>
  OFFERS.filter((o) => (o.channel === 'online' || o.channel === 'both') && (o.countries.includes('*') || o.countries.includes(cc))).length;

const city = (page: Page) => page.getByRole('combobox', { name: 'Your city' });
const options = (page: Page) => page.getByRole('listbox', { name: 'Place suggestions' }).getByRole('option');
const onlineTab = (page: Page) => page.getByRole('tab', { name: /^Online/ });
const hostRequests = (guard: Guard, host: string) => guard.externalRequests().filter((r) => new URL(r.url).hostname === host);

async function pickPune(page: Page): Promise<void> {
  await city(page).click();
  await city(page).pressSequentially('Pune', { delay: 40 });
  await expect(options(page)).toHaveCount(5);
  await options(page).filter({ hasText: 'Pune' }).click();
  await expect(city(page)).toHaveValue(PHOTON_PUNE_LABEL);
}

test('city input is labelled "Your city" with a real example placeholder', async ({ page, guard }) => {
  await guard.mock();
  await page.goto('./');
  await expect(city(page)).toHaveAttribute('placeholder', 'e.g. Bengaluru');
  await expect(page.locator('label[for="city"]')).toHaveText('Your city');
});

test('pick "Pune" → Online tab auto-syncs to India with a count; refresh restores without geocoding', async ({ page, context, guard }) => {
  await guard.mock();
  await page.goto('./');
  const startUrl = page.url();
  await expectNothingPersisted(page, context, startUrl); // nothing written on a plain visit
  await page.getByLabel('Birthday month').selectOption('3');
  await page.getByRole('radio', { name: '10 km' }).check();
  await pickPune(page);
  await expect(page.getByRole('status')).toContainText('on the map', { timeout: 15_000 });

  // Auto-sync: country follows the city, the Online list is already rendered and the tab shows the count.
  await expect(page.locator('#country')).toHaveValue('IN');
  const n = onlineCount('IN');
  await expect(page.locator('#online-count')).toHaveText(`${n} quests`); // visible "N", visually hidden " quests"
  await expect(onlineTab(page)).toHaveAccessibleName(`Online ${n} quests`);
  await expect(page.locator('#online-list .quest-card')).toHaveCount(n);

  // Mark one online quest done, then switch to the Online tab (both persisted).
  await onlineTab(page).click();
  const first = page.locator('#online-list .quest-card').first();
  const doneId = (await first.getAttribute('data-offer-id')) ?? '';
  await first.getByLabel('Mark claimed').check();
  const rec = await expectOnlySessionRecord(page, context, startUrl);
  expect(rec).toEqual({
    v: 3, city: PHOTON_PUNE_LABEL, lat: 18.5204, lng: 73.8567, countryCode: 'IN', month: 3, radius: 10000, tab: 'online', done: [doneId],
    verifiedOnly: false, types: { free: true, discount: true, past: true },
  });

  await guard.checkpoint();
  const photonBefore = hostRequests(guard, 'photon.komoot.io').length;
  await page.reload();
  await expect(city(page)).toHaveValue(PHOTON_PUNE_LABEL);
  await expect(page.getByLabel('Birthday month')).toHaveValue('3');
  await expect(page.getByRole('radio', { name: '10 km' })).toBeChecked();
  await expect(onlineTab(page)).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#panel-online')).toBeVisible();
  await expect(page.locator('#country')).toHaveValue('IN');
  await expect(page.locator(`#online-list .quest-card[data-offer-id="${doneId}"]`)).toHaveClass(/\bis-done\b/);
  await expect(page.getByRole('status')).toContainText('within 10 km', { timeout: 15_000 });
  // Coordinates came from the session: Overpass re-run with them, and no geocoder was asked again.
  const overpass = hostRequests(guard, 'overpass-api.de').map((r) => decodeURIComponent((r.postData ?? '').replace(/^data=/, '')));
  expect(overpass).toHaveLength(2);
  expect(overpass[1]).toContain('(around:10000,18.520400,73.856700)');
  expect(hostRequests(guard, 'nominatim.openstreetmap.org')).toEqual([]);
  expect(hostRequests(guard, 'photon.komoot.io')).toHaveLength(photonBefore);
  expect(await axeViolations(page), 'axe: restored online tab').toEqual([]);

  // Clear search wipes the key; the Online count and country reset too.
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expectNothingPersisted(page, context, startUrl);
  await expect(page.locator('#country')).toHaveValue('');
  await expect(city(page)).toHaveValue('');
  await expect(city(page)).toBeFocused();
  await expectLocationOnlyToNominatim(guard, ['Pune']);
});

test('free-text city goes to Nominatim with featureType=city, and auto-syncs Found online', async ({ page, guard }) => {
  await guard.mock({
    photon: (route) => route.fulfill({ json: { type: 'FeatureCollection', features: [] }, headers: CORS }),
  });
  await page.goto('./');
  await page.getByLabel('Birthday month').selectOption('10');
  // Open Found online first with a different country, then search a city: it must follow the city.
  await onlineTab(page).click();
  await page.locator('#country').selectOption('US');
  await page.getByRole('tab', { name: 'Found online' }).click();
  await expect(page.locator('#found-list .live-card')).toHaveCount(1);
  await search(page, 'Bengaluru');
  await expect(page.getByRole('status')).toContainText('on the map', { timeout: 15_000 });
  const [nom] = hostRequests(guard, 'nominatim.openstreetmap.org');
  expect(new URL(nom?.url ?? 'https://x').searchParams.get('featureType')).toBe('city');
  await expect(page.locator('#country')).toHaveValue('IN');
  await expect
    .poll(() => hostRequests(guard, 'bsq-worker.e2e.example').map((r) => new URL(r.url).searchParams.get('country')))
    .toEqual(['US', 'IN']);
});

test('Online country select lists every country, ones with quests first with a count', async ({ page, guard }) => {
  await guard.mock();
  await page.goto('./');
  await onlineTab(page).click();
  const select = page.locator('#country');
  await expect(select.locator('option')).not.toHaveCount(1);
  const opts = await select.locator('option').evaluateAll((os) =>
    os.map((o) => ({ value: (o as HTMLOptionElement).value, text: o.textContent ?? '', group: o.parentElement?.getAttribute('label') ?? '' })),
  );
  expect(opts.length).toBeGreaterThanOrEqual(250); // placeholder + 249 ISO countries
  expect(opts.find((o) => o.value === 'JP')).toEqual({ value: 'JP', text: 'Japan', group: expect.stringMatching(/other countries|All countries/) });
  expect(opts.find((o) => o.value === 'IN')).toEqual({ value: 'IN', text: `India (${onlineCount('IN')})`, group: 'Countries with online quests' });
  // Countries with quests come before the rest.
  const firstOther = opts.findIndex((o) => o.group !== 'Countries with online quests' && o.value !== '');
  const lastWith = opts.map((o) => o.group).lastIndexOf('Countries with online quests');
  expect(lastWith).toBeLessThan(firstOther);

  await select.selectOption('JP');
  await expect(page.locator('#online-list .empty-state')).toContainText('No online birthday quests for this country yet');
  await expect(page.locator('#online-count')).toHaveText('0 quests');
  expect(await axeViolations(page), 'axe: all-countries select').toEqual([]);
});

test('tampered or extra sessionStorage data is rejected and removed on load', async ({ page, context, guard }) => {
  await guard.mock();
  await page.goto('./');
  const startUrl = page.url();
  const scriptsBefore = await page.locator('script').count();
  await page.evaluate((key) => {
    sessionStorage.setItem(
      key,
      JSON.stringify({
        v: 1, city: '<img src=x onerror=alert(1)>', lat: 12.97, lng: 77.59, countryCode: 'IN', month: 10, radius: 5000, tab: 'nearby', done: [],
      }),
    );
  }, SESSION_KEY);
  await page.reload();
  await expect(city(page)).toHaveValue('');
  await expect(page.locator('#nearby-list .quest-card')).toHaveCount(0);
  await expectNothingPersisted(page, context, startUrl);

  await page.evaluate((key) => sessionStorage.setItem(key, '{"v":1,"city":"Pune","admin":true}'), SESSION_KEY);
  await page.reload();
  expect((await storageSnapshot(page)).sessionKeys).toEqual([]);
  expect(await page.locator('img[src="x"]').count()).toBe(0);
  expect(await page.locator('script').count()).toBe(scriptsBefore);
  expect(guard.externalRequests().filter((r) => !r.url.startsWith('https://tile.'))).toEqual([]);
});

test('cards show detailed claim info (You get, numbered steps, chips) from offers.json', async ({ page, guard }) => {
  const detailed = OFFERS.find((o) => o.countries.includes('IN') && o.channel !== 'in-store' && o.steps?.length && o.rewardItem);
  test.skip(!detailed, 'no online offer with steps in public/offers.json yet');
  await guard.mock();
  await page.goto('./');
  await onlineTab(page).click();
  await page.locator('#country').selectOption('IN');
  const card = page.locator(`#online-list .quest-card[data-offer-id="${detailed?.id}"]`);
  await expect(card.locator('.quest-card__reward .get__label')).toHaveText('You get');
  await expect(card.locator('.quest-card__reward .get__value')).toHaveText(detailed?.rewardItem ?? '');
  await expect(card.locator('.quest-card__claim ol.quest-card__steps > li')).toHaveText(detailed?.steps ?? []);
  expect(await axeViolations(page), 'axe: claim details').toEqual([]);
});
