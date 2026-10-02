import type { Locator, Page } from '@playwright/test';
import { BENGALURU, expectedNearbyOffers, freeFixtureOffers, isTierThenDistanceOrder, PHOTON_PUNE_LABEL, routeFreeFixture, seedOffers, type SeedOffer } from './fixtures';
import { axeViolations, expect, expectOnlySessionRecord, search, test } from './harness';

/*
 * QA: PR #5 (DECISIONS #27). Complements tests/e2e/quest-types.spec.ts without repeating it:
 * "Verified only" unchanged against main, Filter box edge cases (Escape after a click on non-focusable
 * box content, Shift+Tab out, a click on another control, count chip text), Filter + Verified only
 * persisted together, order by distance inside tiers (Bengaluru and Pune venues, filtered too),
 * claimed quests x Filter (ring, candle, pins), 768px, axe with the box open in odd states, and
 * reduced motion for the box.
 */

type QType = 'free' | 'discount' | 'past';
const typeOf = (o: SeedOffer): QType => (o.needsPastSpend ? 'past' : o.rewardType === 'free' ? 'free' : 'discount');
const LABEL: Record<QType, string> = { free: 'Free', discount: 'Discount', past: 'Needs past spend' };
const filterBtn = (page: Page) => page.locator('#filter-toggle');
const box = (page: Page) => page.locator('#filter-box');
const typeBox = (page: Page, t: QType) => box(page).getByRole('checkbox', { name: LABEL[t], exact: true });
const sw = (page: Page) => page.getByRole('switch', { name: 'Verified only' });
const card = (page: Page, id: string) => page.locator(`#nearby-list .quest-card[data-offer-id="${id}"]`);
const onlineIN = (offers: SeedOffer[] = seedOffers()) => offers.filter((o) => (o.channel === 'online' || o.channel === 'both') && o.countries.includes('IN'));
function unique(types: Record<QType, boolean>, verifiedOnly = false, offers: SeedOffer[] = seedOffers()): { shown: number; total: number } {
  const all = new Map([...expectedNearbyOffers('IN', BENGALURU, offers), ...onlineIN(offers)].map((o) => [o.id, o]));
  const shown = [...all.values()].filter((o) => types[typeOf(o)] && (!verifiedOnly || o.verified === true)).length;
  return { shown, total: all.size };
}

/** The switch markup exactly as shipped on main (index.html before PR #5). */
const MAIN_SWITCH_HTML =
  '<button type="button" class="switch" role="switch" id="verified-only" aria-checked="false" aria-describedby="verified-only-hint"><span class="switch__track" aria-hidden="true"><span class="switch__thumb"></span></span><span class="switch__label">Verified only</span></button>';

async function searchBengaluru(page: Page): Promise<void> {
  await page.goto('./');
  await search(page, 'Bengaluru');
  await expect(page.getByRole('status')).toContainText('on the map', { timeout: 15_000 });
}
async function types(list: Locator): Promise<QType[]> {
  return list.evaluateAll((cs) => cs.map((c) => (c.querySelector('.badge--type')?.getAttribute('data-quest-type') ?? '') as QType));
}
/** Metres from the card's "x km away" / "350 m away" text (NaN when absent). */
async function metres(list: Locator): Promise<number[]> {
  return list.evaluateAll((cs) =>
    cs.map((c) => {
      const t = c.querySelector('.quest-card__distance')?.textContent ?? '';
      const m = /([\d.]+)\s*(km|m)\b/.exec(t);
      return m ? Number(m[1]) * (m[2] === 'km' ? 1000 : 1) : NaN;
    }),
  );
}

// ---------------------------------------------------------------- Verified only unchanged

test('Verified only is unchanged from main: markup, hint, look, size, toggle and its announcement', async ({ page, guard }) => {
  await guard.mock();
  await page.goto('./');
  expect(await sw(page).evaluate((e) => e.outerHTML)).toBe(MAIN_SWITCH_HTML);
  await expect(page.locator('#verified-only-hint')).toHaveText('Hides quests marked Check with store.');
  await expect(sw(page)).toHaveAccessibleDescription('Hides quests marked Check with store.');
  const look = await sw(page).evaluate((e) => {
    const s = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    return { bg: s.backgroundColor, color: s.color, h: Math.round(r.height), radius: s.borderRadius };
  });
  expect(look).toMatchObject({ bg: 'rgb(255, 255, 255)', color: 'rgb(94, 84, 89)', h: 44 });
  // Still first in the tools row, above the tabs, and the Filter control comes after it on the same row.
  await search(page, 'Bengaluru');
  await expect(page.getByRole('status')).toContainText('on the map', { timeout: 15_000 });
  const s = await sw(page).boundingBox();
  const f = await filterBtn(page).boundingBox();
  const tabs = await page.getByRole('tablist').boundingBox();
  expect(s && f && tabs).toBeTruthy();
  if (s && f && tabs) {
    expect(Math.abs(s.y - f.y)).toBeLessThan(2);
    expect(f.x).toBeGreaterThan(s.x + s.width);
    expect(s.y + s.height).toBeLessThanOrEqual(tabs.y);
  }
  // Behaviour and copy as on main (all types on).
  const all = unique({ free: true, discount: true, past: true }, true);
  await sw(page).click();
  await expect(sw(page)).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('status')).toHaveText(`Showing verified quests only, ${all.shown} of ${all.total}`);
  await page.mouse.move(0, 0);
  await expect.poll(() => sw(page).evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(107, 45, 94)');
  await sw(page).press('Space');
  await expect(sw(page)).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('status')).toHaveText(`Showing all quests, ${all.total} in total`);
  // Toggling the switch never touches the Filter checkboxes.
  await sw(page).click();
  await filterBtn(page).click();
  for (const t of ['free', 'discount', 'past'] as const) await expect(typeBox(page, t)).toBeChecked();
  await expect(page.locator('#filter-count')).toBeHidden();
});

// ---------------------------------------------------------------- Filter box edge cases

// QA-PR5-03 (fixed): a click on the box's own text used to move focus to <main tabindex="-1">, and focusout
// closed the box. #filter-box now has tabindex="-1", so focus stays inside the Filter control.
test('Filter box: Escape still closes after a click on non-focusable box content (legend, hint)', async ({ page, guard }) => {
  await guard.mock();
  await searchBengaluru(page);
  await filterBtn(page).click();
  await expect(box(page)).toBeVisible();
  for (const part of ['.filter__legend', '.filter__hint']) {
    await box(page).locator(part).click();
    await expect(box(page), `box stays open after clicking ${part}`).toBeVisible({ timeout: 2_000 });
  }
  await page.keyboard.press('Escape');
  await expect(box(page), 'QA-PR5-03: Escape after clicking inside the box').toBeHidden();
  await expect(filterBtn(page)).toBeFocused();
});

test('Filter box: a click on Verified only closes the box and toggles the switch in one click; Shift+Tab out closes it', async ({ page, guard }, info) => {
  await guard.mock();
  await searchBengaluru(page);
  await filterBtn(page).click();
  await sw(page).click();
  await expect(box(page)).toBeHidden();
  await expect(filterBtn(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(sw(page)).toHaveAttribute('aria-checked', 'true');
  await sw(page).click();
  if (info.project.name.startsWith('mobile')) return;
  // Keyboard: Shift+Tab from the first checkbox lands on the button (box stays open), again leaves it (box closes).
  await filterBtn(page).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(typeBox(page, 'free')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(filterBtn(page)).toBeFocused();
  await expect(box(page)).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  await expect(sw(page)).toBeFocused();
  await expect(box(page)).toBeHidden();
});

test('Filter count chip: visible "Filter" + N, accessible "Filter, N types hidden", plum chip', async ({ page, guard }) => {
  await guard.mock();
  await searchBengaluru(page);
  await expect(filterBtn(page)).toHaveAccessibleName('Filter');
  await filterBtn(page).click();
  const steps: Array<[QType, number]> = [['free', 1], ['discount', 2], ['past', 3]];
  for (const [t, n] of steps) {
    await typeBox(page, t).uncheck();
    await expect(page.locator('#filter-count')).toBeVisible();
    const visible = await page.locator('#filter-count').evaluate((e) =>
      Array.from(e.childNodes)
        .filter((c) => !(c instanceof HTMLElement && c.classList.contains('visually-hidden')))
        .map((c) => c.textContent)
        .join(''),
    );
    expect(visible).toBe(String(n));
    await expect(filterBtn(page)).toHaveAccessibleName(new RegExp(`^Filter\\s*, ${n} types? hidden$`));
  }
  const chip = await page.locator('#filter-count').evaluate((e) => ({ bg: getComputedStyle(e).backgroundColor, color: getComputedStyle(e).color }));
  expect(chip).toEqual({ bg: 'rgb(107, 45, 94)', color: 'rgb(255, 255, 255)' });
  expect(await axeViolations(page), 'axe: every type off, box open').toEqual([]);
  // Online empty state "Show all quests" resets too.
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: /^Online/ }).click();
  await expect(page.locator('#online-list .empty-state__title')).toHaveText('No quests match your filters');
  await page.locator('#online-list').getByRole('button', { name: 'Show all quests' }).click();
  await expect(page.locator('#filter-count')).toBeHidden();
  await expect(page.locator('#online-list .quest-card')).toHaveCount(onlineIN().length);
});

test('Filter + Verified only persist together across a reload and Clear search resets both', async ({ page, context, guard }) => {
  await guard.mock();
  await page.goto('./');
  const startUrl = page.url();
  await search(page, 'Bengaluru');
  await expect(page.getByRole('status')).toContainText('on the map', { timeout: 15_000 });
  await sw(page).click();
  await filterBtn(page).click();
  await typeBox(page, 'past').uncheck();
  await page.keyboard.press('Escape');
  const want = unique({ free: true, discount: true, past: false }, true);
  await expect(page.locator('#progress-count')).toHaveText(`0 of ${want.shown}`);
  const rec = await expectOnlySessionRecord(page, context, startUrl);
  expect(rec).toMatchObject({ v: 3, verifiedOnly: true, types: { free: true, discount: true, past: false } });

  await guard.checkpoint();
  await page.reload();
  await expect(page.getByRole('status')).toContainText('on the map', { timeout: 15_000 });
  await expect(sw(page)).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#progress-count')).toHaveText(`0 of ${want.shown}`);
  await expect(filterBtn(page)).toHaveAccessibleName(/1 type hidden/);
  await expect(box(page)).toBeHidden(); // the box itself never reopens on reload
  const shownTypes = new Set(await types(page.locator('#nearby-list .quest-card, #online-list .quest-card')));
  expect(shownTypes.has('past')).toBe(false);
  await expect(page.locator('#nearby-list .badge--check, #online-list .badge--check')).toHaveCount(0);

  await filterBtn(page).click();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(box(page)).toBeHidden();
  await expect(sw(page)).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('#filter-count')).toBeHidden();
  await expect(page.getByLabel('Your city', { exact: true })).toHaveValue('');
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
});

// ---------------------------------------------------------------- order

test('Nearby near group: tier order, nearest first inside a tier; still true with Free off and with Verified only', async ({ page, guard }) => {
  await guard.mock();
  await searchBengaluru(page);
  const near = page.locator('#nearby-list > .quest-list .quest-card');
  const rest = page.locator('#nearby-list .quest-group .quest-card');
  const check = async (label: string) => {
    const t = await types(near);
    expect(isTierThenDistanceOrder(t, await metres(near)), `${label} near: ${t.join(',')} ${(await metres(near)).join(',')}`).toBe(true);
    expect(isTierThenDistanceOrder(await types(rest)), `${label} rest`).toBe(true);
  };
  await check('all');
  // The first discount card in the near group is the nearest discount shop.
  const t = await types(near);
  const m = await metres(near);
  const disc = m.filter((_, i) => t[i] === 'discount');
  expect(disc[0]).toBe(Math.min(...disc));
  await filterBtn(page).click();
  await typeBox(page, 'free').uncheck();
  await page.keyboard.press('Escape');
  await check('free off');
  expect(await types(near)).not.toContain('free');
  await sw(page).click();
  await check('free off + verified');
  await page.getByRole('tab', { name: /^Online/ }).click();
  expect(isTierThenDistanceOrder(await types(page.locator('#online-list .quest-card')))).toBe(true);
});

test('Pune (venues): parks keep tier order then distance in the near group', async ({ page, guard }) => {
  await guard.mock();
  await page.goto('./');
  await page.getByLabel('Birthday month').selectOption('10');
  const city = page.getByRole('combobox', { name: 'Your city' });
  await city.click();
  await city.pressSequentially('Pune', { delay: 40 });
  await page.getByRole('option', { name: /^Pune Pune City/ }).click();
  await expect(city).toHaveValue(PHOTON_PUNE_LABEL);
  await expect(page.getByRole('status')).toContainText('Found', { timeout: 15_000 });
  await expect(page.getByRole('status')).not.toContainText('Looking for shops');
  const near = page.locator('#nearby-list > .quest-list .quest-card');
  // The default Overpass mock returns the Bengaluru shops (~840 km away), so the near group mixes them with the
  // three Mumbai-area parks. India has no free quest (QA-PR5-01), so it is all discounts, nearest first: the
  // parks lead, then the far shops.
  const ids = await near.evaluateAll((cs) => cs.map((c) => (c as HTMLElement).dataset.offerId));
  expect(ids.slice(0, 3)).toEqual(['wetnjoy-lonavala-in', 'imagicaa-in', 'water-kingdom-in']);
  await expect(page.locator('#nearby-list .badge--free, #online-list .badge--free')).toHaveCount(0);
  for (const sel of ['#nearby-list > .quest-list .quest-card', '#nearby-list .quest-group .quest-card']) {
    const l = page.locator(sel);
    if ((await l.count()) === 0) continue;
    expect(isTierThenDistanceOrder(await types(l), await metres(l)), sel).toBe(true);
  }
});

// ---------------------------------------------------------------- claimed x Filter

test('claimed quests x Filter: ring, candle and claimed pins follow the filter; claims survive', async ({ page, context, guard }) => {
  await guard.mock();
  await routeFreeFixture(page); // theobroma-in is free here (DECISIONS #28)
  const fx = freeFixtureOffers();
  await page.goto('./');
  const startUrl = page.url();
  await search(page, 'Bengaluru');
  await expect(page.getByRole('status')).toContainText('on the map', { timeout: 15_000 });
  const total = unique({ free: true, discount: true, past: true }, false, fx).total;
  await card(page, 'theobroma-in').getByLabel('Mark claimed').check(); // free in the fixture
  await card(page, 'the-body-shop-in').getByLabel('Mark claimed').check(); // discount
  await expect(page.locator('#progress-count')).toHaveText(`2 of ${total}`);

  await filterBtn(page).click();
  await typeBox(page, 'free').uncheck();
  const noFree = unique({ free: false, discount: true, past: true }, false, fx).shown;
  await expect(page.locator('#progress-count')).toHaveText(`1 of ${noFree}`);
  expect(Number(await page.locator('#progress').evaluate((e) => getComputedStyle(e).getPropertyValue('--progress')))).toBeCloseTo(1 / noFree, 3);
  await expect(page.locator('.map-marker--branch[data-offer-id="theobroma-in"]')).toHaveCount(0);
  await expect(page.locator('.map-marker--branch.is-claimed[data-offer-id="the-body-shop-in"]')).toHaveCount(1);

  await typeBox(page, 'discount').uncheck();
  const pastOnly = unique({ free: false, discount: false, past: true }, false, fx).shown;
  await expect(page.locator('#progress-count')).toHaveText(`0 of ${pastOnly}`);
  await expect(page.locator('body')).toHaveClass(/\bis-lit\b/); // claims exist, candle stays lit
  const rec = await expectOnlySessionRecord(page, context, startUrl);
  expect([...(rec?.done ?? [])].sort()).toEqual(['the-body-shop-in', 'theobroma-in']);

  await typeBox(page, 'free').check();
  await typeBox(page, 'discount').check();
  await expect(page.locator('#progress-count')).toHaveText(`2 of ${total}`);
  await expect(card(page, 'theobroma-in').getByLabel('Mark claimed')).toBeChecked();
  await expect(page.locator('.map-marker--branch.is-claimed')).toHaveCount(2);
  await page.keyboard.press('Escape');
  expect(await axeViolations(page), 'axe: claimed after filtering').toEqual([]);
});

// ---------------------------------------------------------------- layout, a11y, motion

test('768px and 360px with every control in its widest state: no horizontal scroll, box on screen, axe', async ({ page, guard }, info) => {
  test.skip(info.project.name.startsWith('mobile'), 'widths are set explicitly; one project is enough');
  await guard.mock();
  for (const width of [768, 360]) {
    await page.setViewportSize({ width, height: 900 });
    await searchBengaluru(page);
    await sw(page).click(); // plum pill
    await filterBtn(page).click();
    await typeBox(page, 'free').uncheck();
    await typeBox(page, 'discount').uncheck(); // count chip "2"
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over, `${width}: horizontal overflow`).toBe(0);
    const b = await box(page).boundingBox();
    expect(b && b.x >= 0 && b.x + b.width <= width, `${width}: box inside viewport`).toBe(true);
    const f = await filterBtn(page).boundingBox();
    expect(f && f.height >= 44, `${width}: 44px target`).toBe(true);
    expect(await axeViolations(page), `axe ${width}: box open, switch on, 2 hidden`).toEqual([]);
    await page.getByRole('button', { name: 'Clear search' }).click();
  }
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('Filter box opens without animation; axe passes with it open', async ({ page, guard }) => {
    await guard.mock();
    await searchBengaluru(page);
    await filterBtn(page).click();
    await expect(box(page)).toBeVisible();
    expect(await box(page).evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
    expect(await box(page).evaluate((e) => e.getAnimations().length)).toBe(0);
    expect(await box(page).evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
    expect(await axeViolations(page), 'axe: reduced motion, box open').toEqual([]);
  });
});
