import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { expectedNearbyCount, mockNetwork, OVERPASS_BENGALURU_PINS } from './fixtures';

test('search → nearby quests with pins, online tab, found online; only the session record is stored', async ({ page, context }) => {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(e.message));
  const unexpected = await mockNetwork(page);

  await page.goto('./');
  const startUrl = page.url();
  await expect(page.getByRole('heading', { level: 1, name: 'Birthday Side Quests' })).toBeVisible();
  await expect(
    page.getByText("We don't store anything on our servers. Your search stays in this browser tab and clears when you close it."),
  ).toBeVisible();

  // Online tab works before any city is entered (worldwide offers).
  await page.getByRole('tab', { name: /^Online/ }).click();
  await expect(page.locator('#panel-online')).toBeVisible();
  await page.getByRole('tab', { name: 'Nearby' }).click();

  await page.getByLabel('Your city', { exact: true }).fill('Bengaluru');
  await page.getByLabel('Birthday month').selectOption('10');
  await page.getByRole('button', { name: 'Find my quests' }).click();

  await expect(page.getByRole('status')).toContainText('on the map', { timeout: 15_000 });
  const nearby = page.locator('#nearby-list .quest-card');
  await expect(nearby).toHaveCount(expectedNearbyCount('IN')); // all in-store/both offers for India
  await expect(page.locator('.map-marker--branch')).toHaveCount(OVERPASS_BENGALURU_PINS);
  const directions = nearby.filter({ has: page.locator('.btn--directions') }).first().locator('.btn--directions');
  await expect(directions).toHaveAttribute('href', /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=-?\d+(\.\d+)?,-?\d+(\.\d+)?$/);
  await expect(directions).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(directions).toHaveAttribute('aria-label', /^Get directions to .+\(opens in a new tab\)$/);
  await expect(page.locator('#month-info')).toBeVisible();

  // quest-done event fires
  const fired = page.evaluate(() => new Promise<boolean>((r) => document.addEventListener('quest-done', () => r(true), { once: true })));
  await nearby.first().getByLabel('Quest complete!').check();
  expect(await fired).toBe(true);
  await expect(nearby.first()).toHaveClass(/is-done/);

  await page.getByRole('tab', { name: /^Online/ }).click();
  await expect(page.locator('#country')).toHaveValue('IN');
  await expect(page.locator('#online-list .quest-card').filter({ hasText: 'Nykaa' })).toHaveCount(1);

  await page.getByRole('tab', { name: 'Found online' }).click();
  const live = page.locator('#found-list .live-card');
  await expect(live).toHaveCount(1); // javascript: result dropped
  await expect(live.first()).toContainText('Unverified: check the link');
  await expect(page.locator('#found-list img')).toHaveCount(0);

  // Privacy: location not in URL; no localStorage/cookies; sessionStorage holds only the one record.
  expect(page.url()).toBe(startUrl);
  const storage = await page.evaluate(() => ({
    local: localStorage.length,
    sessionKeys: Array.from({ length: sessionStorage.length }, (_, i) => sessionStorage.key(i)),
    cookie: document.cookie,
  }));
  expect(storage).toEqual({ local: 0, sessionKeys: ['bsq-session'], cookie: '' });
  expect(await context.cookies()).toEqual([]);

  expect(unexpected).toEqual([]);
  expect(problems).toEqual([]);

  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

test('shows a friendly message when the place is not found', async ({ page }) => {
  await mockNetwork(page, {
    nominatim: (route) => route.fulfill({ json: [], headers: { 'Access-Control-Allow-Origin': '*' } }),
  });
  await page.goto('./');
  await page.getByLabel('Your city', { exact: true }).fill('Nowhereville');
  await page.getByLabel('Birthday month').selectOption('3');
  await page.getByRole('button', { name: 'Find my quests' }).click();
  await expect(page.getByRole('status')).toContainText("couldn't find that place");
});

test('still lists quests when Overpass fails', async ({ page }) => {
  await mockNetwork(page, { overpass: (route) => route.fulfill({ status: 504, body: 'timeout' }) });
  await page.goto('./');
  await page.getByLabel('Your city', { exact: true }).fill('Bengaluru');
  await page.getByLabel('Birthday month').selectOption('10');
  await page.getByRole('button', { name: 'Find my quests' }).click();
  await expect(page.getByRole('status')).toContainText("couldn't load shop pins");
  await expect(page.locator('#nearby-list .quest-card')).toHaveCount(expectedNearbyCount('IN'));
});
