import { expect, test } from '@playwright/test';
import type { App } from '../src/ui/app';

/**
 * The Local GPU Edition's launcher opens the game with ?profile=local-gpu. The first start applies the
 * local-hardware profile; without the parameter the web defaults stand.
 */
const prefs = (page: import('@playwright/test').Page) => page.evaluate(() => {
  const p = (window as unknown as { reaperwar: App }).reaperwar.prefs;
  return { quality: p.graphics.quality, pixelRatioCap: p.graphics.pixelRatioCap, simulationThread: p.simulationThread ?? 'main', hardwareProfile: p.hardwareProfile ?? null };
});

test('the launcher address applies the local hardware profile once; the plain address does not', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('[data-menu="quick-battle"]')).toBeVisible();
  expect(await prefs(page)).toEqual({ quality: 'high', pixelRatioCap: 2, simulationThread: 'main', hardwareProfile: null });

  await page.goto('/?profile=local-gpu');
  await expect(page.locator('[data-menu="quick-battle"]')).toBeVisible();
  expect(await prefs(page)).toEqual({ quality: 'ultra', pixelRatioCap: 3, simulationThread: 'worker', hardwareProfile: 'local-gpu' });

  // A setting the player changes afterwards survives the next launch through the same address.
  await page.evaluate(() => (window as unknown as { reaperwar: App }).reaperwar.show('settings'));
  await expect(page.locator('[data-action="quality"]')).toHaveValue('ultra');
  await page.locator('[data-action="quality"]').selectOption('medium');
  // The change is saved asynchronously; wait for the write before leaving the page.
  await page.evaluate(() => (window as unknown as { reaperwar: App }).reaperwar.savePrefs());
  await page.goto('/?profile=local-gpu');
  await expect(page.locator('[data-menu="quick-battle"]')).toBeVisible();
  expect((await prefs(page)).quality).toBe('medium');

  // The Settings button applies it again on request.
  await page.evaluate(() => (window as unknown as { reaperwar: App }).reaperwar.show('settings'));
  await page.locator('[data-action="local-gpu-profile"]').click();
  await expect(page.locator('[data-action="quality"]')).toHaveValue('ultra');
  expect(errors).toEqual([]);
});

test('Custom Battle scales every fleet in one click', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-menu="quick-battle"]')).toBeVisible();
  await page.evaluate(() => (window as unknown as { reaperwar: App }).reaperwar.show('custom'));
  const total = () => page.evaluate(() => [...document.querySelectorAll<HTMLInputElement>('input[data-count]')].reduce((n, input) => n + (Number(input.value) || 0), 0));
  const start = await total();
  expect(start).toBeGreaterThan(20);
  await page.locator('[data-action="scale-fleets-2"]').click();
  expect(await total()).toBe(start * 2);
  await page.locator('[data-action="scale-fleets-4"]').click();
  expect(await total()).toBe(start * 8);
  await page.locator('[data-action="scale-fleets-0.5"]').click();
  expect(await total()).toBe(start * 4);
});
