import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { BENGALURU, expectedNearbyOffers, freeFixtureOffers, routeFreeFixture, type SeedOffer, TYPE_TIER } from './fixtures';
import { axeViolations, expect, expectOnlySessionRecord, search, storageSnapshot, test } from './harness';

/*
 * DECISIONS #27: quest order (free, then discount, then needs past spend), the type chip on every
 * card, and the Filter box (three checkboxes beside "Verified only"). All network mocked; the
 * harness guards (unexpected hosts, dialogs, CSP, geolocation, console errors) apply.
 */

type QType = 'free' | 'discount' | 'past';
const typeOf = (o: SeedOffer): QType => (o.needsPastSpend ? 'past' : o.rewardType === 'free' ? 'free' : 'discount');
const LABEL: Record<QType, string> = { free: 'Free', discount: 'Discount', past: 'Needs past spend' };
const brandCmp = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

// India has no free (tier 0) offer since QA-PR5-01, so these tests run on the free fixture (DECISIONS #28):
// a copy of offers.json where theobroma-in, which has a mocked Bengaluru branch, is free.
const nearbyAll = () => expectedNearbyOffers('IN', BENGALURU, freeFixtureOffers());
const onlineAll = () => freeFixtureOffers().filter((o) => (o.channel === 'online' || o.channel === 'both') && o.countries.includes('IN'));
/** Unique offers across Nearby + Online that pass the filters (what the ring and the header count). */
function uniqueShown(types: Record<QType, boolean>, verifiedOnly = false): { shown: number; total: number } {
  const all = new Map([...nearbyAll(), ...onlineAll()].map((o) => [o.id, o]));
  const shown = [...all.values()].filter((o) => types[typeOf(o)] && (!verifiedOnly || o.verified === true)).length;
  return { shown, total: all.size };
}
const ALL = { free: true, discount: true, past: true };

const filterBtn = (page: Page) => page.getByRole('button', { name: /^Filter/ });
const box = (page: Page) => page.locator('#filter-box');
const typeBox = (page: Page, t: QType) => box(page).getByRole('checkbox', { name: LABEL[t], exact: true });
const verifiedSwitch = (page: Page) => page.getByRole('switch', { name: 'Verified only' });

async function typesIn(list: Locator): Promise<QType[]> {
  return list.evaluateAll((cs) => cs.map((c) => (c.querySelector('.badge--type')?.getAttribute('data-quest-type') ?? '') as QType));
}
async function idsIn(list: Locator): Promise<string[]> {
  return list.evaluateAll((cs) => cs.map((c) => (c as HTMLElement).dataset.offerId ?? ''));
}
function tiersAscend(types: QType[]): boolean {
  return types.every((t, i) => i === 0 || (TYPE_TIER[types[i - 1] ?? ''] ?? 9) <= (TYPE_TIER[t] ?? -1));
}

async function searchBengaluru(page: Page): Promise<void> {
  await page.goto('./');
  await search(page, 'Bengaluru');
  await expect(page.getByRole('status')).toContainText('on the map', { timeout: 15_000 });
}

// ---------------------------------------------------------------- order and chips

test('Nearby and Online list free first, then discount, then needs past spend; every card has a type chip', async ({ page, guard }) => {
  await guard.mock();
  await routeFreeFixture(page);
  await searchBengaluru(page);

  // Nearby: both groups kept (near group first), each in tier order.
  const near = page.locator('#nearby-list > .quest-list .quest-card');
  const rest = page.locator('#nearby-list .quest-group .quest-card');
  await expect(page.getByRole('heading', { name: 'Also in India: find your nearest branch' })).toBeVisible();
  const nearTypes = await typesIn(near);
  const restTypes = await typesIn(rest);
  expect(nearTypes.length).toBeGreaterThan(0);
  expect(restTypes.length).toBeGreaterThan(0);
  expect(tiersAscend(nearTypes), `near group ${nearTypes.join(',')}`).toBe(true);
  expect(tiersAscend(restTypes), `rest group ${restTypes.join(',')}`).toBe(true);
  // Theobroma (free in the fixture) is the only free quest with a mocked branch, so it leads the near group.
  expect((await idsIn(near))[0]).toBe('theobroma-in');
  // Rest group: within each tier, brand A to Z.
  const restIds = await idsIn(rest);
  const byId = new Map(freeFixtureOffers().map((o) => [o.id, o]));
  const restSorted = [...restIds].sort((a, b) => {
    const oa = byId.get(a) as SeedOffer;
    const ob = byId.get(b) as SeedOffer;
    return (TYPE_TIER[typeOf(oa)] ?? 0) - (TYPE_TIER[typeOf(ob)] ?? 0) || brandCmp.compare(oa.brand, ob.brand) || (a < b ? -1 : 1);
  });
  expect(restIds).toEqual(restSorted);

  // Every card's chip matches the data, with words (not colour) and screen-reader text.
  for (const card of await page.locator('#nearby-list .quest-card, #online-list .quest-card').all()) {
    const id = (await card.getAttribute('data-offer-id')) ?? '';
    const want = typeOf(byId.get(id) as SeedOffer);
    const chip = card.locator('.badge--type');
    await expect(chip, id).toHaveCount(1);
    await expect(chip).toHaveAttribute('data-quest-type', want);
    await expect(chip).toHaveText(`Quest type: ${LABEL[want]}`);
  }

  // Online: one list in tier order, brand A to Z within a tier.
  await page.getByRole('tab', { name: /^Online/ }).click();
  const online = page.locator('#online-list .quest-card');
  await expect(online).toHaveCount(onlineAll().length);
  const onlineTypes = await typesIn(online);
  expect(tiersAscend(onlineTypes), `online ${onlineTypes.join(',')}`).toBe(true);
  const onlineIds = await idsIn(online);
  expect(onlineIds).toEqual(
    [...onlineIds].sort((a, b) => {
      const oa = byId.get(a) as SeedOffer;
      const ob = byId.get(b) as SeedOffer;
      return (TYPE_TIER[typeOf(oa)] ?? 0) - (TYPE_TIER[typeOf(ob)] ?? 0) || brandCmp.compare(oa.brand, ob.brand) || (a < b ? -1 : 1);
    }),
  );
  expect(await axeViolations(page), 'axe: chips on Online').toEqual([]);

  // Order still holds with Verified only on (behaviour of the switch unchanged).
  await verifiedSwitch(page).click();
  expect(tiersAscend(await typesIn(online))).toBe(true);
  await page.getByRole('tab', { name: /^Nearby/ }).click();
  expect(tiersAscend(await typesIn(page.locator('#nearby-list > .quest-list .quest-card')))).toBe(true);
  expect(tiersAscend(await typesIn(page.locator('#nearby-list .quest-group .quest-card')))).toBe(true);
  expect(await axeViolations(page), 'axe: chips on Nearby, Verified only').toEqual([]);
});

// ---------------------------------------------------------------- Filter box

test('Filter box: disclosure, each checkbox, counts, ring, pins, announcement, Escape and outside click', async ({ page, guard }) => {
  await guard.mock();
  await routeFreeFixture(page);
  await searchBengaluru(page);
  const btn = filterBtn(page);
  await expect(btn).toHaveAttribute('aria-expanded', 'false');
  await expect(btn).toHaveAttribute('aria-controls', 'filter-box');
  await expect(box(page)).toBeHidden();
  await expect(page.locator('#filter-count')).toBeHidden();
  // "Verified only" is untouched and still first in the row.
  await expect(verifiedSwitch(page)).toHaveAttribute('aria-checked', 'false');
  expect(await page.locator('.results-tools > *:not(.visually-hidden)').evaluateAll((n) => n.map((e) => e.id))).toEqual(['verified-only', 'type-filter']);

  await btn.click();
  await expect(btn).toHaveAttribute('aria-expanded', 'true');
  await expect(box(page)).toBeVisible();
  await expect(box(page).getByRole('group', { name: 'Show' })).toBeVisible();
  for (const t of ['free', 'discount', 'past'] as const) await expect(typeBox(page, t)).toBeChecked();
  // 44px rows.
  for (const t of ['free', 'discount', 'past'] as const) {
    const h = await typeBox(page, t).evaluate((i) => (i.closest('label') as HTMLElement).getBoundingClientRect().height);
    expect(h).toBeGreaterThanOrEqual(44);
  }
  expect(await axeViolations(page), 'axe: Filter box open').toEqual([]);

  const nearbyCount = (types: Record<QType, boolean>) => nearbyAll().filter((o) => types[typeOf(o)]).length;
  const onlineCount = (types: Record<QType, boolean>) => onlineAll().filter((o) => types[typeOf(o)]).length;

  // Uncheck Free.
  const noFree = { free: false, discount: true, past: true };
  await typeBox(page, 'free').uncheck();
  await expect(page.locator('#nearby-count')).toHaveText(`${nearbyCount(noFree)} quests`);
  await expect(page.locator('#online-count')).toHaveText(`${onlineCount(noFree)} quests`);
  await expect(page.locator('#nearby-list .badge--free, #online-list .badge--free')).toHaveCount(0);
  let u = uniqueShown(noFree);
  await expect(page.locator('#progress-count')).toHaveText(`0 of ${u.shown}`);
  await expect(page.locator('#results-sub')).toContainText(`${u.shown} quests in total.`);
  await expect(page.getByRole('status')).toHaveText(`Showing discount and past-spend quests, ${u.shown} of ${u.total}`);
  await expect(page.locator('#filter-count')).toHaveText(', 1 type hidden');
  await expect(btn).toHaveAccessibleName(/^Filter\s*, 1 type hidden$/);
  // Theobroma (free in the fixture) loses its pin; the 3 discount shops keep theirs.
  await expect(page.locator('.map-marker--branch')).toHaveCount(3);
  await expect(page.locator('.map-marker--branch[data-offer-id="theobroma-in"]')).toHaveCount(0);
  await expect(box(page)).toBeVisible(); // stays open while choosing

  // Free only.
  const freeOnly = { free: true, discount: false, past: false };
  await typeBox(page, 'free').check();
  await typeBox(page, 'discount').uncheck();
  await typeBox(page, 'past').uncheck();
  u = uniqueShown(freeOnly);
  await expect(page.getByRole('status')).toHaveText(`Showing free quests only, ${u.shown} of ${u.total}`);
  await expect(page.locator('#nearby-count')).toHaveText(`${nearbyCount(freeOnly)} quest${nearbyCount(freeOnly) === 1 ? '' : 's'}`);
  expect(new Set(await typesIn(page.locator('#nearby-list .quest-card')))).toEqual(new Set(['free']));
  await expect(page.locator('.map-marker--branch')).toHaveCount(1);
  await expect(page.locator('#filter-count')).toHaveText(', 2 types hidden');

  // Needs past spend only.
  const pastOnly = { free: false, discount: false, past: true };
  await typeBox(page, 'past').check();
  await typeBox(page, 'free').uncheck();
  u = uniqueShown(pastOnly);
  await expect(page.getByRole('status')).toHaveText(`Showing past-spend quests only, ${u.shown} of ${u.total}`);
  expect(new Set(await typesIn(page.locator('#nearby-list .quest-card, #online-list .quest-card')))).toEqual(new Set(['past']));
  await expect(page.locator('.map-marker--branch')).toHaveCount(0);

  // Combined with Verified only.
  await page.keyboard.press('Escape');
  await expect(box(page)).toBeHidden();
  await expect(btn).toHaveAttribute('aria-expanded', 'false');
  await expect(btn).toBeFocused();
  await verifiedSwitch(page).click();
  const both = uniqueShown(pastOnly, true);
  await expect(page.locator('#progress-count')).toHaveText(`0 of ${both.shown}`);
  await expect(page.getByRole('status')).toHaveText(`Showing verified quests only, ${both.shown} of ${both.total}`);
  await expect(page.locator('#nearby-list .badge--check, #online-list .badge--check')).toHaveCount(0);
  expect(new Set(await typesIn(page.locator('#nearby-list .quest-card, #online-list .quest-card')))).toEqual(new Set(['past']));
  await verifiedSwitch(page).click();

  // Outside click closes without changing anything.
  await btn.click();
  await expect(box(page)).toBeVisible();
  await page.locator('#results-heading').click();
  await expect(box(page)).toBeHidden();
  await expect(btn).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#filter-box input[value="past"]')).toBeChecked();
  await expect(page.locator('#filter-box input[value="free"]')).not.toBeChecked();

  // Reset inside the box turns every type back on.
  await btn.click();
  await box(page).getByRole('button', { name: 'Reset' }).click();
  for (const t of ['free', 'discount', 'past'] as const) await expect(typeBox(page, t)).toBeChecked();
  u = uniqueShown(ALL);
  await expect(page.getByRole('status')).toHaveText(`Showing all quest types, ${u.shown} of ${u.total}`);
  await expect(page.locator('#filter-count')).toBeHidden();
  await expect(page.locator('#nearby-list .quest-card')).toHaveCount(nearbyAll().length);
  await expect(page.locator('.map-marker--branch')).toHaveCount(4);
});

test('Filter box: keyboard (Tab into the box, Space toggles, Escape returns focus) and focus ring', async ({ page, guard }, info) => {
  test.skip(info.project.name.startsWith('mobile'), 'keyboard flow is a desktop interaction');
  await guard.mock();
  await routeFreeFixture(page);
  await searchBengaluru(page);
  const btn = filterBtn(page);
  await btn.focus();
  expect(await btn.evaluate((e) => getComputedStyle(e).boxShadow)).not.toBe('none');
  await page.keyboard.press('Enter');
  await expect(box(page)).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(typeBox(page, 'free')).toBeFocused();
  expect(await typeBox(page, 'free').evaluate((e) => getComputedStyle(e).boxShadow)).not.toBe('none');
  await page.keyboard.press('Space');
  await expect(typeBox(page, 'free')).not.toBeChecked();
  await page.keyboard.press('Tab');
  await expect(typeBox(page, 'discount')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(typeBox(page, 'past')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(box(page).getByRole('button', { name: 'Reset' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(box(page)).toBeHidden();
  await expect(btn).toBeFocused();
  // Tabbing out of an open box closes it and moves on to the tabs.
  await page.keyboard.press('Enter');
  for (let i = 0; i < 5; i++) await page.keyboard.press('Tab');
  await expect(page.getByRole('tab', { name: /^Nearby/ })).toBeFocused();
  await expect(box(page)).toBeHidden();
});

test('Filter: persists across a reload, Clear search resets it, and a v2 record migrates with every type on', async ({ page, context, guard }) => {
  await guard.mock();
  await routeFreeFixture(page);
  await page.goto('./');
  const startUrl = page.url();
  await search(page, 'Bengaluru');
  await expect(page.getByRole('status')).toContainText('on the map', { timeout: 15_000 });
  await filterBtn(page).click();
  await typeBox(page, 'discount').uncheck();
  const rec = await expectOnlySessionRecord(page, context, startUrl);
  expect(rec?.types).toEqual({ free: true, discount: false, past: true });

  const want = nearbyAll().filter((o) => typeOf(o) !== 'discount').length;
  await guard.checkpoint();
  await page.reload();
  await expect(page.getByRole('status')).toContainText('on the map', { timeout: 15_000 });
  await expect(page.locator('#nearby-list .quest-card')).toHaveCount(want);
  await expect(page.locator('#filter-count')).toHaveText(', 1 type hidden');
  await filterBtn(page).click();
  await expect(typeBox(page, 'discount')).not.toBeChecked();
  await expect(typeBox(page, 'free')).toBeChecked();

  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(box(page)).toBeHidden();
  await expect(page.locator('#filter-count')).toBeHidden();
  await filterBtn(page).click();
  for (const t of ['free', 'discount', 'past'] as const) await expect(typeBox(page, t)).toBeChecked();
  expect((await storageSnapshot(page)).sessionKeys).toEqual([]);

  // Version 2 record (before the Filter existed): migrated with every type on, re-saved as version 3.
  await page.evaluate(() =>
    sessionStorage.setItem(
      'bsq-session',
      JSON.stringify({ v: 2, city: null, lat: null, lng: null, countryCode: 'IN', month: 10, radius: 5000, tab: 'online', done: [], verifiedOnly: true }),
    ),
  );
  await page.reload();
  await expect(page.locator('#country')).toHaveValue('IN');
  await expect(verifiedSwitch(page)).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#filter-count')).toBeHidden();
  await filterBtn(page).click();
  await typeBox(page, 'past').uncheck();
  const saved = await expectOnlySessionRecord(page, context, startUrl);
  expect(saved).toMatchObject({ v: 3, countryCode: 'IN', tab: 'online', verifiedOnly: true, types: { free: true, discount: true, past: false } });
});

test('Filter: every type off shows "No quests match your filters"; "Show all quests" resets every filter', async ({ page, guard }) => {
  await guard.mock();
  await routeFreeFixture(page);
  await searchBengaluru(page);
  await verifiedSwitch(page).click();
  await filterBtn(page).click();
  for (const t of ['free', 'discount', 'past'] as const) await typeBox(page, t).uncheck();
  await expect(page.getByRole('status')).toHaveText(`No quest types selected, 0 of ${uniqueShown(ALL).total}`);
  await page.keyboard.press('Escape');
  await expect(page.locator('#nearby-count')).toHaveText('0 quests');
  await expect(page.locator('#nearby-list .empty-state__title')).toHaveText('No quests match your filters');
  await expect(page.locator('#online-list .empty-state__title')).toHaveText('No quests match your filters');
  await expect(page.locator('#progress')).toBeHidden();
  await expect(page.locator('.map-marker--branch')).toHaveCount(0);
  expect(await axeViolations(page), 'axe: filtered empty state').toEqual([]);
  await page.locator('#nearby-list').getByRole('button', { name: 'Show all quests' }).click();
  await expect(verifiedSwitch(page)).toHaveAttribute('aria-checked', 'false');
  await expect(filterBtn(page)).toBeFocused();
  await expect(page.locator('#filter-count')).toBeHidden();
  await expect(page.locator('#nearby-list .quest-card')).toHaveCount(nearbyAll().length);
  await expect(page.locator('.map-marker--branch')).toHaveCount(4);
});

test('Filter: Verified only alone keeps its own empty state copy', async ({ page, guard }) => {
  await guard.mock();
  const file = JSON.parse(readFileSync(resolve(process.cwd(), 'public/offers.json'), 'utf8')) as { offers: Array<{ verified?: boolean }> };
  for (const o of file.offers) o.verified = false;
  await page.route('**/offers.json', (route) => route.fulfill({ json: file }));
  await searchBengaluru(page);
  await verifiedSwitch(page).click();
  await expect(page.locator('#nearby-list .empty-state__title')).toHaveText('No verified quests here yet');
  await filterBtn(page).click();
  await typeBox(page, 'free').uncheck();
  await expect(page.locator('#nearby-list .empty-state__title')).toHaveText('No quests match your filters');
});

test('Filter box: no horizontal scroll at 360/375/390 with the box open, and the box stays on screen', async ({ page, guard }, info) => {
  test.skip(info.project.name.startsWith('mobile'), 'widths are set explicitly; one project is enough');
  await guard.mock();
  await routeFreeFixture(page);
  for (const width of [360, 375, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await searchBengaluru(page);
    await filterBtn(page).click();
    await expect(box(page)).toBeVisible();
    const over = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      body: document.body.scrollWidth - document.documentElement.clientWidth,
    }));
    expect(over, `${width}: box open`).toEqual({ doc: 0, body: 0 });
    const b = await box(page).boundingBox();
    expect(b && b.x >= 0 && b.x + b.width <= width, `${width}: box inside viewport`).toBe(true);
    // Switch and Filter button side by side on one row.
    const s = await verifiedSwitch(page).boundingBox();
    const f = await filterBtn(page).boundingBox();
    expect(s && f && Math.abs(s.y - f.y) < 2 && f.x > s.x, `${width}: one row`).toBe(true);
    expect(await axeViolations(page), `axe: ${width} box open`).toEqual([]);
    await page.getByRole('button', { name: 'Clear search' }).click();
    await page.evaluate(() => sessionStorage.clear());
  }
});
