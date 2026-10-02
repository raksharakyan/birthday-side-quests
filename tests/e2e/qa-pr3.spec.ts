import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page, Route } from '@playwright/test';
import { expectedNearbyCount, OVERPASS_BENGALURU, PHOTON_FIRST_LABEL, PNG_1PX } from './fixtures';
import {
  axeViolations, CORS, expect, expectLocationOnlyToNominatim, expectNothingPersisted, expectOnlySessionRecord, search, storageSnapshot,
  test, type Guard,
} from './harness';

/*
 * QA for PR #3 (autocomplete, radius radio group, distance sorting, all countries + auto-sync,
 * sessionStorage restore, claim details, soft premium redesign). All network mocked; harness guards
 * (unexpected hosts, dialogs, CSP, geolocation, page/console errors) apply to every test here.
 */

interface SeedOffer {
  id: string;
  brand: string;
  offer: string;
  howToClaim: string;
  channel: string;
  countries: string[];
  rewardItem?: string;
  steps?: string[];
  purchaseRequired?: boolean | null;
  minSpend?: string;
  signupLeadDays?: number;
  validFor?: string;
  bring?: string[];
}
const OFFERS = (JSON.parse(readFileSync(resolve(process.cwd(), 'public/offers.json'), 'utf8')) as { offers: SeedOffer[] }).offers;
const byId = (id: string) => {
  const o = OFFERS.find((x) => x.id === id);
  if (!o) throw new Error(`offer ${id} missing from offers.json`);
  return o;
};
const inCountry = (o: SeedOffer, cc: string) => o.countries.includes('*') || o.countries.includes(cc);
const onlineCount = (cc: string) => OFFERS.filter((o) => (o.channel === 'online' || o.channel === 'both') && inCountry(o, cc)).length;
/** Progress-ring total: unique offers listed in Nearby + Online for a country (every channel). */
const ringTotal = (cc: string) => OFFERS.filter((o) => inCountry(o, cc)).length;

/** Chip count the card should show (mirrors the rules in src/render/quests.ts claimChips). */
function expectedChips(o: SeedOffer): number {
  let n = 0;
  if (o.purchaseRequired === false || o.purchaseRequired === true || o.minSpend) n += 1;
  if (o.signupLeadDays !== undefined) n += 1;
  if (o.validFor) n += 1;
  if (o.bring?.length) n += 1;
  return n;
}

const city = (page: Page) => page.getByRole('combobox', { name: 'Your city' });
const options = (page: Page) => page.getByRole('listbox', { name: 'Place suggestions' }).getByRole('option');
const onlineTab = (page: Page) => page.getByRole('tab', { name: /^Online/ });
const hostRequests = (guard: Guard, host: string) => guard.externalRequests().filter((r) => new URL(r.url).hostname === host);
const overpassQueries = (guard: Guard) =>
  hostRequests(guard, 'overpass-api.de').map((r) => decodeURIComponent((r.postData ?? '').replace(/^data=/, '')));

/** Bengaluru as picked from the Photon fixture (12.9716, 77.5946). */
const PICK = { lat: 12.9716, lng: 77.5946 };

/**
 * Overpass mock: at 20 km Starbucks MG Road is "moved" ~14 km north, so the nearest-first order must
 * change after the radius switch (Third Wave Coffee becomes first, Starbucks last).
 */
const OVERPASS_20KM = {
  elements: OVERPASS_BENGALURU.elements.map((e) => (e.id === 1 ? { ...e, lat: 13.1, lon: 77.6 } : e)),
};
const overpassByRadius = (route: Route) => {
  const q = decodeURIComponent((route.request().postData() ?? '').replace(/^data=/, ''));
  return route.fulfill({ json: q.includes('around:20000') ? OVERPASS_20KM : OVERPASS_BENGALURU, headers: CORS });
};

/** Distances on the "near" cards (top list), in metres. */
async function nearDistances(page: Page): Promise<number[]> {
  const texts = await page.locator('#nearby-list > .quest-list .quest-card__distance').allTextContents();
  return texts.map((d) => {
    const m = /([\d.]+) (m|km) away/.exec(d);
    return m ? Number(m[1]) * (m[2] === 'km' ? 1000 : 1) : Number.NaN;
  });
}
async function nearIds(page: Page): Promise<string[]> {
  return page.locator('#nearby-list > .quest-list .quest-card').evaluateAll((cs) => cs.map((c) => (c as HTMLElement).dataset.offerId ?? ''));
}

async function overflowX(page: Page): Promise<{ doc: number; body: number }> {
  return page.evaluate(() => ({
    doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.documentElement.clientWidth,
  }));
}

// ---------------------------------------------------------------- full journey (desktop + mobile)

test('journey: pick city → sorted Nearby → 20 km re-sort → claim 2 → Online synced → refresh restores → Clear search resets', async ({
  page,
  context,
  guard,
}) => {
  test.setTimeout(90_000); // several axe runs, one with the 250-option country select
  await guard.mock({ overpass: overpassByRadius });
  await page.goto('./');
  const startUrl = page.url();
  await expectNothingPersisted(page, context, startUrl);
  await expect(page.locator('#progress')).toBeHidden();
  await expect(page.locator('body')).not.toHaveClass(/\bis-lit\b/);

  // 1. Month, then type a city and pick the first suggestion (click on desktop, tap on mobile).
  await page.getByLabel('Birthday month').selectOption('10');
  await city(page).click();
  await city(page).pressSequentially('Beng', { delay: 40 });
  await expect(options(page)).toHaveCount(5);
  await options(page).first().click();
  await expect(city(page)).toHaveValue(PHOTON_FIRST_LABEL);
  await expect(page.getByRole('status')).toContainText('on the map within 5 km', { timeout: 15_000 });
  expect(hostRequests(guard, 'nominatim.openstreetmap.org')).toEqual([]); // picked place skips Nominatim

  // 2. Nearby: branch cards first, nearest first, each with "x m/km away"; total = every IN in-store/both offer.
  const total = expectedNearbyCount('IN');
  await expect(page.locator('#nearby-list .quest-card')).toHaveCount(total);
  await expect(page.locator('#nearby-count')).toHaveText(`${total} quests`);
  const d5 = await nearDistances(page);
  expect(d5.length).toBe(4);
  expect(d5.every(Number.isFinite)).toBe(true);
  expect([...d5].sort((a, b) => a - b)).toEqual(d5);
  expect(await nearIds(page)).toEqual(['starbucks-in', 'third-wave-coffee-in', 'the-body-shop-in', 'theobroma-in']);
  await expect(page.locator('#nearby-list .quest-card[data-offer-id="starbucks-in"] .quest-card__distance')).toHaveText(/^\d+ m away$/);
  await expect(page.getByRole('heading', { name: 'More quests in India (no branch found within 5 km)' })).toBeVisible();
  expect(overpassQueries(guard)[0]).toContain(`(around:5000,${PICK.lat.toFixed(6)},${PICK.lng.toFixed(6)})`);

  // 3. Radius 20 km → Overpass around:20000 for the same coordinates, no geocoding, list re-sorted.
  await page.getByRole('radio', { name: '20 km' }).check();
  await expect(page.getByRole('status')).toContainText('within 20 km', { timeout: 15_000 });
  expect(overpassQueries(guard)).toHaveLength(2);
  expect(overpassQueries(guard)[1]).toContain(`(around:20000,${PICK.lat.toFixed(6)},${PICK.lng.toFixed(6)})`);
  expect(overpassQueries(guard)[1]).toContain('out center 150;');
  expect(hostRequests(guard, 'nominatim.openstreetmap.org')).toEqual([]);
  await expect.poll(() => nearIds(page)).toEqual(['third-wave-coffee-in', 'the-body-shop-in', 'theobroma-in', 'starbucks-in']);
  const d20 = await nearDistances(page);
  expect([...d20].sort((a, b) => a - b)).toEqual(d20);
  await expect(page.locator('#nearby-list .quest-card[data-offer-id="starbucks-in"] .quest-card__distance')).toHaveText(/^1\d km away$/);
  await expect(page.getByRole('heading', { name: 'More quests in India (no branch found within 20 km)' })).toBeVisible();
  await expect(page.locator('#results-sub')).toHaveText(`${ringTotal('IN')} quests in total. 4 within 20 km of Bengaluru.`);

  // 4. Claim two quests: ring text, candle, toast, live region, claimed pins.
  const N = ringTotal('IN');
  await page.locator('#nearby-list .quest-card[data-offer-id="starbucks-in"]').getByLabel('Mark claimed').check();
  await expect(page.locator('#progress-count')).toHaveText(`1 of ${N}`);
  await expect(page.locator('body > .toast')).toHaveText(`Tata Starbucks claimed. 1 of ${N} done.`);
  const bodyShop = page.locator('#nearby-list .quest-card[data-offer-id="the-body-shop-in"]');
  await bodyShop.getByLabel('Mark claimed').check();
  // Scoped axe on the toast straight away (well inside its 3.2 s on screen, even under parallel load);
  // a full-page scan with the 250-option select can outlast it. Full page is scanned below.
  await expect(page.locator('body > .toast')).toBeVisible();
  await expect(page.locator('body > .toast')).toHaveText(`The Body Shop claimed. 2 of ${N} done.`);
  await expect(page.locator('body > .toast')).toHaveAttribute('aria-hidden', 'true');
  const toastAxe = await new AxeBuilder({ page }).include('body > .toast').analyze();
  expect(toastAxe.violations.map((v) => v.id), 'axe: toast').toEqual([]);
  expect(toastAxe.passes.length, 'axe actually scanned the toast').toBeGreaterThan(0);
  await expect(bodyShop).toHaveClass(/\bis-done\b/);
  await expect(bodyShop.locator('.claim__on')).toBeVisible(); // visible text switched to "Claimed"
  await expect(page.locator('#progress')).toBeVisible();
  await expect(page.locator('#progress-count')).toHaveText(`2 of ${N}`);
  await expect(page.locator('#progress')).toContainText(`2 of ${N}claimed`);
  await expect(page.locator('#celebrate-live')).toHaveText(`The Body Shop claimed. 2 of ${N} done.`);
  await expect(page.locator('body')).toHaveClass(/\bis-lit\b/);
  const ringProgress = await page.locator('#progress').evaluate((n) => (n as HTMLElement).style.getPropertyValue('--progress'));
  expect(Number(ringProgress)).toBeCloseTo(2 / N, 3);
  await expect(page.locator('.map-marker--branch.is-claimed')).toHaveCount(2);
  await expect(page.locator('.map-marker--branch.is-claimed[data-offer-id="starbucks-in"]')).toHaveCount(1);
  await expect(page.locator('.map-marker--branch.is-claimed[data-offer-id="the-body-shop-in"]')).toHaveCount(1);
  await expect(page.locator('.map-marker--branch:not(.is-claimed)')).toHaveCount(2);

  expect(await axeViolations(page), 'axe: claimed state').toEqual([]);

  // 5. Online: country auto-set to IN, count chip matches offers.json, the "both" offer is claimed there too.
  await onlineTab(page).click();
  await expect(page.locator('#country')).toHaveValue('IN');
  const nOnline = onlineCount('IN');
  await expect(page.locator('#online-count')).toHaveText(`${nOnline} quests`);
  await expect(onlineTab(page)).toHaveAccessibleName(`Online ${nOnline} quests`);
  await expect(page.locator('#online-list .quest-card')).toHaveCount(nOnline);
  await expect(page.locator('#online-list .quest-card[data-offer-id="the-body-shop-in"]')).toHaveClass(/\bis-done\b/);
  await expect(page.locator('#online-list .quest-card[data-offer-id="the-body-shop-in"] .quest-card__done-input')).toBeChecked();
  expect(await axeViolations(page), 'axe: Online tab with the 250-option select').toEqual([]);

  const rec = await expectOnlySessionRecord(page, context, startUrl);
  expect(rec).toEqual({
    v: 1, city: PHOTON_FIRST_LABEL, lat: PICK.lat, lng: PICK.lng, countryCode: 'IN', month: 10, radius: 20000, tab: 'online',
    done: ['starbucks-in', 'the-body-shop-in'],
  });

  // 6. Refresh → everything restored from sessionStorage; Overpass re-run at 20 km, no geocoder calls.
  await guard.checkpoint();
  const photonBefore = hostRequests(guard, 'photon.komoot.io').length;
  await page.reload();
  await expect(city(page)).toHaveValue(PHOTON_FIRST_LABEL);
  await expect(page.getByLabel('Birthday month')).toHaveValue('10');
  await expect(page.getByRole('radio', { name: '20 km' })).toBeChecked();
  await expect(onlineTab(page)).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#panel-online')).toBeVisible();
  await expect(page.locator('#country')).toHaveValue('IN');
  await expect(page.getByRole('status')).toContainText('within 20 km', { timeout: 15_000 });
  await expect(page.locator('#progress-count')).toHaveText(`2 of ${N}`);
  await expect(page.locator('body')).toHaveClass(/\bis-lit\b/);
  await expect(page.locator('.map-marker--branch.is-claimed')).toHaveCount(2);
  await expect(page.locator('#online-list .quest-card[data-offer-id="the-body-shop-in"]')).toHaveClass(/\bis-done\b/);
  await expect(page.locator('#nearby-list .quest-card.is-done')).toHaveCount(2);
  expect(await nearIds(page)).toEqual(['third-wave-coffee-in', 'the-body-shop-in', 'theobroma-in', 'starbucks-in']);
  expect(overpassQueries(guard)).toHaveLength(3);
  expect(overpassQueries(guard)[2]).toContain(`(around:20000,${PICK.lat.toFixed(6)},${PICK.lng.toFixed(6)})`);
  expect(hostRequests(guard, 'nominatim.openstreetmap.org')).toEqual([]);
  expect(hostRequests(guard, 'photon.komoot.io')).toHaveLength(photonBefore);
  await expect(page.locator('body > .toast')).toHaveCount(0); // no replayed celebration on restore
  expect(await axeViolations(page), 'axe: restored state').toEqual([]);

  // 7. Clear search → sessionStorage empty, UI back to the start.
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expectNothingPersisted(page, context, startUrl);
  expect((await storageSnapshot(page)).sessionKeys).toEqual([]);
  await expect(city(page)).toHaveValue('');
  await expect(city(page)).toBeFocused();
  await expect(page.getByLabel('Birthday month')).toHaveValue('');
  await expect(page.getByRole('radio', { name: '5 km' })).toBeChecked();
  await expect(page.locator('#country')).toHaveValue('');
  await expect(page.locator('#progress')).toBeHidden();
  await expect(page.locator('body')).not.toHaveClass(/\bis-lit\b/);
  await expect(page.locator('.quest-card.is-done')).toHaveCount(0);
  await expect(page.locator('#nearby-list .quest-card')).toHaveCount(0);
  await expect(page.locator('#nearby-count')).toBeHidden();
  await expect(page.locator('.map-marker--center, .map-marker--branch, .map-radius')).toHaveCount(0);
  await expect(page.locator('#month-info')).toBeHidden();
  await expect(page.getByRole('status')).toContainText('Search cleared');
  // After clearing, the next user action (a tab change) writes a fresh record with no location in it.
  await page.getByRole('tab', { name: /^Nearby/ }).click();
  expect((await storageSnapshot(page)).sessionKeys).toEqual(['bsq-session']); // tab change is a user action → saved again
  const after = await expectOnlySessionRecord(page, context, startUrl);
  expect(after).toEqual({ v: 1, city: null, lat: null, lng: null, countryCode: null, month: null, radius: 5000, tab: 'nearby', done: [] });
  expect(await axeViolations(page), 'axe: after Clear search').toEqual([]);

  await expectLocationOnlyToNominatim(guard, ['Beng', 'Bengaluru']);
});

// ---------------------------------------------------------------- claim details from real data

test('claim details: Chili\'s (US) shows You get + steps + chips; an entry without the fields renders the old way', async ({ page, guard }) => {
  const chilis = byId('chilis-us');
  const legacy = OFFERS.find((o) => inCountry(o, 'US') && o.channel !== 'online' && !o.rewardItem && !o.steps);
  expect(chilis.steps?.length).toBeGreaterThan(0);
  await guard.mock({
    nominatim: (route) =>
      route.fulfill({ json: [{ lat: '32.7767', lon: '-96.797', display_name: 'Dallas, Texas, United States', address: { country_code: 'us' } }], headers: CORS }),
    overpass: (route) => route.fulfill({ json: { elements: [] }, headers: CORS }),
  });
  await page.goto('./');
  await search(page, 'Dallas');
  await expect(page.getByRole('status')).toContainText('Found', { timeout: 15_000 });
  await expect(page.locator('#nearby-list .quest-card')).toHaveCount(expectedNearbyCount('US'));

  const card = page.locator(`#nearby-list .quest-card[data-offer-id="chilis-us"]`);
  await expect(card.getByRole('heading', { level: 3 })).toHaveText("Chili's");
  await expect(card.locator('.quest-card__reward .get__label')).toHaveText('You get');
  await expect(card.locator('.quest-card__reward .get__value')).toHaveText(chilis.rewardItem ?? '');
  await expect(card.locator('.quest-card__reward .get__detail')).toHaveText(chilis.offer);
  await expect(card.locator('ol.quest-card__steps > li')).toHaveCount(chilis.steps?.length ?? 0);
  await expect(card.locator('ol.quest-card__steps > li')).toHaveText(chilis.steps ?? []);
  await expect(card.locator('.quest-card__howto')).toHaveCount(0); // steps replace the free-text howToClaim
  const chips = card.getByRole('list', { name: "Before you go to Chili's" }).getByRole('listitem');
  await expect(chips).toHaveCount(expectedChips(chilis));
  await expect(chips).toContainText([`Valid: ${chilis.validFor ?? ''}`]);
  await expect(card.locator('.claim-chip--purchase, .claim-chip--free')).toHaveCount(0); // purchaseRequired: null → no chip
  for (const ic of await card.locator('.claim-chips svg').all()) await expect(ic).toHaveAttribute('aria-hidden', 'true');

  if (legacy) {
    const old = page.locator(`#nearby-list .quest-card[data-offer-id="${legacy.id}"]`);
    await expect(old.locator('.get__label')).toHaveText('You get');
    await expect(old.locator('.get__value')).toHaveText(legacy.offer);
    await expect(old.locator('.quest-card__reward, .get__detail, ol.quest-card__steps, .claim-chips')).toHaveCount(0);
    await expect(old.locator('.quest-card__howto')).toHaveText(legacy.howToClaim);
  }

  // Every rendered US card matches its offers.json entry (steps count + chip count + You get headline).
  for (const o of OFFERS.filter((x) => inCountry(x, 'US') && x.channel !== 'online')) {
    const c = page.locator(`#nearby-list .quest-card[data-offer-id="${o.id}"]`);
    await expect(c.locator('ol.quest-card__steps > li'), o.id).toHaveCount(o.steps?.length ?? 0);
    await expect(c.locator('.claim-chips > li'), o.id).toHaveCount(expectedChips(o));
    await expect(c.locator('.get__value'), o.id).toHaveText(o.rewardItem ?? o.offer);
  }
  expect(await axeViolations(page), 'axe: claim details (US)').toEqual([]);
});

// ---------------------------------------------------------------- failure modes

test('map tiles fail (503) → "Map couldn\'t load" notice; Try again recovers once tiles work', async ({ page, guard }) => {
  guard.allowConsole(/Failed to load resource: the server responded with a status of 503/);
  await guard.mock();
  let tilesUp = false;
  // Registered after the default mocks, so it wins for tile requests.
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    tilesUp ? route.fulfill({ body: PNG_1PX, contentType: 'image/png' }) : route.fulfill({ status: 503, body: 'down' }),
  );
  await page.goto('./');
  await search(page, 'Bengaluru');
  await expect(page.getByRole('status')).toContainText('on the map', { timeout: 15_000 });
  const notice = page.locator('.map-notice');
  await expect(notice).toBeVisible();
  await expect(notice).toHaveAttribute('role', 'note');
  await expect(notice).toContainText("Map couldn't load");
  await expect(notice).toContainText('Your quests are still listed.');
  // Quests and pins are unaffected.
  await expect(page.locator('#nearby-list .quest-card')).toHaveCount(expectedNearbyCount('IN'));
  await expect(page.locator('.map-marker--branch')).toHaveCount(4);
  expect(await axeViolations(page), 'axe: map notice').toEqual([]);

  tilesUp = true;
  await notice.getByRole('button', { name: 'Try again' }).click();
  await expect(notice).toBeHidden();
  await expect(page.locator('.leaflet-tile-loaded').first()).toBeAttached();
});

test('Overpass 504 once, then success on the automatic retry after ~2 s', async ({ page, guard }) => {
  guard.allowConsole(/Failed to load resource: the server responded with a status of 504/);
  const hits: number[] = [];
  await guard.mock({
    overpass: (route) => {
      hits.push(Date.now());
      return hits.length === 1
        ? route.fulfill({ status: 504, body: 'Gateway Timeout', headers: CORS })
        : route.fulfill({ json: OVERPASS_BENGALURU, headers: CORS });
    },
  });
  await page.goto('./');
  await search(page, 'Bengaluru');
  await expect(page.getByRole('status')).toContainText('Looking for shops', { timeout: 5000 });
  await expect(page.getByRole('status')).toContainText('4 shops on the map within 5 km', { timeout: 15_000 });
  expect(hits).toHaveLength(2);
  expect((hits[1] ?? 0) - (hits[0] ?? 0)).toBeGreaterThanOrEqual(1900);
  await expect(page.locator('.map-marker--branch')).toHaveCount(4);
  await expect(page.locator('#nearby-list .quest-card__distance')).toHaveCount(4);
  await expect(page.locator('#results-sub')).not.toContainText('didn’t load');
  // Same query both times (retry, not a new search).
  const q = overpassQueries(guard);
  expect(q).toHaveLength(2);
  expect(q[0]).toBe(q[1]);
});

test('Overpass 429 twice → gives up after one retry, quests still listed', async ({ page, guard }) => {
  guard.allowConsole(/Failed to load resource: the server responded with a status of 429/);
  await guard.mock({ overpass: (route) => route.fulfill({ status: 429, body: 'Too Many Requests', headers: CORS }) });
  await page.goto('./');
  await search(page, 'Bengaluru');
  await expect(page.getByRole('status')).toContainText("couldn't load shop pins", { timeout: 15_000 });
  expect(hostRequests(guard, 'overpass-api.de')).toHaveLength(2);
  await expect(page.locator('#nearby-list .quest-card')).toHaveCount(expectedNearbyCount('IN'));
});

// ---------------------------------------------------------------- reduced motion

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('claim: no paper strips, no toast/checkbox motion, no candle ignite; end states all present', async ({ page, guard }) => {
    await guard.mock();
    await page.goto('./');
    await search(page, 'Bengaluru');
    await expect(page.getByRole('status')).toContainText('on the map', { timeout: 15_000 });
    const N = ringTotal('IN');
    const card = page.locator('#nearby-list .quest-card[data-offer-id="starbucks-in"]');
    await card.getByLabel('Mark claimed').check();
    await expect(card).toHaveClass(/\bis-done\b/);
    await expect(page.locator('body > .toast')).toHaveText(`Tata Starbucks claimed. 1 of ${N} done.`);
    await expect(page.locator('#celebrate-live')).toHaveText(`Tata Starbucks claimed. 1 of ${N} done.`);
    await expect(page.locator('#progress-count')).toHaveText(`1 of ${N}`);
    await expect(page.locator('body')).toHaveClass(/\bis-lit\b/);
    await expect(page.locator('.map-marker--branch.is-claimed[data-offer-id="starbucks-in"]')).toHaveCount(1);
    await expect(page.locator('.confetti, .confetti__piece')).toHaveCount(0);
    await expect(page.locator('.site-mark .mark.is-igniting')).toHaveCount(0);
    // No script-driven (WAAPI) motion on the toast or the checkbox.
    const moving = await page.evaluate(() =>
      document.getAnimations().filter((a) => {
        const t = (a.effect as KeyframeEffect | null)?.target as Element | null;
        return a instanceof Animation && !(a instanceof CSSAnimation) && !(a instanceof CSSTransition) && !!t && (t.closest('.toast') || t.closest('.claim'));
      }).length,
    );
    expect(moving).toBe(0);
    await page.waitForTimeout(500);
    await expect(page.locator('.confetti, .confetti__piece')).toHaveCount(0);
    expect(await axeViolations(page), 'axe: reduced motion claimed').toEqual([]);
  });
});

// ---------------------------------------------------------------- keyboard only (desktop)

test('keyboard only: autocomplete pick, radius arrows (incl. re-run), tablist arrows, Space claims, Clear search', async ({ page, guard }, info) => {
  test.skip(info.project.name.startsWith('mobile'), 'keyboard flow is a desktop interaction');
  await guard.mock({ overpass: overpassByRadius });
  await page.goto('./');
  const focused = () => page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    return a ? `${a.tagName.toLowerCase()}#${a.id}` : '';
  });
  async function tabUntil(pred: (f: string) => boolean, max: number, key = 'Tab'): Promise<void> {
    for (let i = 0; i < max; i++) {
      await page.keyboard.press(key);
      if (pred(await focused())) return;
    }
    throw new Error(`focus never matched after ${max} × ${key}; last: ${await focused()}`);
  }

  await tabUntil((f) => f === 'input#city', 5);
  await page.keyboard.type('Beng', { delay: 40 });
  await expect(options(page)).toHaveCount(5);
  await page.keyboard.press('ArrowDown');
  await expect(city(page)).toHaveAttribute('aria-activedescendant', 'city-suggestions-0');
  await page.keyboard.press('Enter');
  await expect(city(page)).toHaveValue(PHOTON_FIRST_LABEL);
  // No month yet → focus moves to the month select with a hint.
  await expect(page.getByRole('status')).toContainText('Now pick your birthday month');
  expect(await focused()).toBe('select#month');
  await page.keyboard.type('Oct');
  await expect(page.locator('#month')).toHaveValue('10');
  await page.keyboard.press('Tab');
  expect(await focused()).toBe('input#radius-5000');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: '20 km' })).toBeChecked();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter'); // Find my quests → uses the picked place
  await expect(page.getByRole('status')).toContainText('within 20 km', { timeout: 15_000 });
  expect(hostRequests(guard, 'nominatim.openstreetmap.org')).toEqual([]);

  // Back to the radius group and down to 10 km with the keyboard: the lookup re-runs.
  await tabUntil((f) => f === 'input#radius-20000', 6, 'Shift+Tab');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('radio', { name: '10 km' })).toBeChecked();
  await expect(page.getByRole('status')).toContainText('within 10 km', { timeout: 15_000 });
  expect(overpassQueries(guard).at(-1)).toContain('(around:10000,');

  // Tablist arrows, then into the panel; Space claims the first quest.
  await tabUntil((f) => f === 'button#tab-nearby', 40);
  await page.keyboard.press('ArrowRight');
  expect(await focused()).toBe('button#tab-online');
  await expect(page.locator('#panel-online')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  expect(await focused()).toBe('button#tab-nearby');
  await tabUntil((f) => f.startsWith('input#done-nearby-'), 20);
  await page.keyboard.press('Space');
  await expect(page.locator('#progress-count')).toHaveText(new RegExp(`^1 of ${ringTotal('IN')}$`));
  await expect(page.locator('#nearby-list .quest-card.is-done')).toHaveCount(1);
  // The visible focus ring lands on the claim row (the input itself is visually hidden).
  const ring = await page.evaluate(() => getComputedStyle(document.activeElement?.closest('.claim') as Element).boxShadow);
  expect(ring).not.toBe('none');

  // Clear search with Enter.
  await tabUntil((f) => f === 'button#clear-search', 80, 'Shift+Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('Search cleared');
  expect(await focused()).toBe('input#city');
  expect((await storageSnapshot(page)).sessionKeys).toEqual([]);
});

// ---------------------------------------------------------------- layout

test('no horizontal scroll at 360/375/390/768/1024/1440 (start, results + claimed, Online, autocomplete open)', async ({ page, guard }, info) => {
  test.skip(info.project.name.startsWith('mobile'), 'widths are set explicitly; one project is enough');
  test.setTimeout(90_000);
  await guard.mock();
  for (const width of [360, 375, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./');
    expect(await overflowX(page), `${width}: start`).toEqual({ doc: 0, body: 0 });
    await city(page).click();
    await city(page).pressSequentially('Beng', { delay: 30 });
    await expect(options(page)).toHaveCount(5);
    expect(await overflowX(page), `${width}: autocomplete open`).toEqual({ doc: 0, body: 0 });
    await page.keyboard.press('Escape');
    await search(page, 'Bengaluru');
    await expect(page.getByRole('status')).toContainText('on the map', { timeout: 15_000 });
    await page.locator('#nearby-list .quest-card').first().getByLabel('Mark claimed').check();
    await expect(page.locator('body > .toast')).toBeVisible();
    expect(await overflowX(page), `${width}: results + claimed + toast`).toEqual({ doc: 0, body: 0 });
    // Toast fits on screen.
    const t = await page.locator('body > .toast').boundingBox();
    expect(t && t.x >= 0 && t.x + t.width <= width, `${width}: toast inside viewport`).toBe(true);
    await onlineTab(page).click();
    expect(await overflowX(page), `${width}: Online`).toEqual({ doc: 0, body: 0 });
    await page.getByRole('button', { name: 'Clear search' }).click();
    await page.getByRole('tab', { name: /^Nearby/ }).click();
    await page.evaluate(() => sessionStorage.clear());
  }
});

test('mobile: the claim toast does not block the claim checkbox it reports on', async ({ page, guard }, info) => {
  test.skip(!info.project.name.startsWith('mobile'), 'mobile layout only');
  // Known bug QA-PR3-01 (docs/HANDOFFS.md "QA: PR #3"). Remove this line once `.toast` gets
  // `pointer-events: none` (and `width: max-content`); the test then has to pass.
  await guard.mock();
  await page.goto('./');
  await search(page, 'Bengaluru');
  await expect(page.getByRole('status')).toContainText('on the map', { timeout: 15_000 });
  const vh = page.viewportSize()?.height ?? 800;
  // Put the 3rd card's claim row ~50 px above the bottom edge, where a thumb taps after scrolling.
  const claim = page.locator('#nearby-list .quest-card').nth(2).locator('label.claim');
  await claim.scrollIntoViewIfNeeded();
  const before = await claim.boundingBox();
  if (!before) throw new Error('claim row not laid out');
  await page.mouse.wheel(0, before.y + before.height - (vh - 50));
  await page.waitForTimeout(300);
  const box = await claim.boundingBox();
  if (!box) throw new Error('claim row not laid out');
  expect(box.y + box.height).toBeGreaterThan(vh - 100);
  expect(box.y + box.height).toBeLessThanOrEqual(vh);
  await page.touchscreen.tap(box.x + 30, box.y + box.height / 2);
  await expect(page.locator('#nearby-list .quest-card').nth(2)).toHaveClass(/\bis-done\b/);
  await expect(page.locator('body > .toast')).toBeVisible();
  await page.locator('body > .toast').evaluate((t) => Promise.all(t.getAnimations().map((a) => a.finished.catch(() => undefined))));

  // While the toast is up, the claim row must still receive taps (to undo a mis-tap) at every point.
  const blocked = await claim.evaluate((label) => {
    const r = label.getBoundingClientRect();
    const out: string[] = [];
    for (const fx of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const x = r.left + r.width * fx;
      const y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      if (hit && !label.contains(hit)) out.push(`${Math.round(x)},${Math.round(y)} → ${hit.className || hit.tagName}`);
    }
    return out;
  });
  expect(blocked, 'points of the claim row covered by the toast').toEqual([]);
});

test('toast is one line on phones (not squeezed to half the viewport by left: 50%)', async ({ page, guard }, info) => {
  test.skip(!info.project.name.startsWith('mobile'), 'mobile layout only');
  // Known bug QA-PR3-02. Remove once `.toast` gets `width: max-content` (max-width already caps it).
  await guard.mock();
  await page.goto('./');
  await search(page, 'Bengaluru');
  await expect(page.getByRole('status')).toContainText('on the map', { timeout: 15_000 });
  await page.locator('#nearby-list .quest-card[data-offer-id="the-body-shop-in"]').getByLabel('Mark claimed').check();
  const toast = page.locator('body > .toast');
  await expect(toast).toBeVisible();
  await toast.evaluate((t) => Promise.all(t.getAnimations().map((a) => a.finished.catch(() => undefined))));
  const vw = page.viewportSize()?.width ?? 400;
  const b = await toast.boundingBox();
  if (!b) throw new Error('toast not laid out');
  expect(b.width, 'toast width').toBeGreaterThan(vw / 2);
  expect(b.height, 'toast height (one line is 56 px)').toBeLessThanOrEqual(60);
});
