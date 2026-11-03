import { expect, test } from '@playwright/test';
import type { App } from '../src/ui/app';

test.use({ locale: 'en-US' });

test('fleet database distinguishes per-mount rates, beam cycles, lore anchors and AU catalogue values', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('[data-menu="quick-battle"]')).toBeVisible();
  const timeline = async (id: string) => {
    await page.evaluate(timelineId => {
      const app = (window as unknown as { reaperwar: App }).reaperwar;
      app.prefs.lastTimelineId = timelineId;
      app.show('database');
    }, id);
  };

  await timeline('canon_me3');
  await page.locator('[data-class="alliance_dreadnought"]').click();
  await expect(page.locator('.codex-body')).toContainText('Catalogue baseline');
  await expect(page.locator('[data-cadence-help="independent-mounts"]')).toContainText('4× speed');
  const ordinary = page.locator('[data-weapon="alliance_dn_main"]');
  await expect(ordinary.locator('[data-stat="mount-cycle"]')).toContainText('4 s reload');
  await expect(ordinary.locator('[data-stat="mount-cycle"]')).toContainText('rate estimate');
  await expect(page.locator('[data-weapon="alliance_broadside"][data-facing="90"]')).toContainText('4 × starboard');
  await expect(page.locator('[data-weapon="alliance_broadside"][data-facing="-90"]')).toContainText('4 × port');

  await timeline('strict_lore');
  await page.locator('[data-class="alliance_dreadnought"]').click();
  const strict = page.locator('[data-weapon="alliance_dn_main"] [data-stat="mount-cycle"]');
  await expect(strict).toContainText('2 s reload');
  await expect(strict).toContainText('Codex anchor');
  await expect(strict).toContainText('Original catalogue reload: 4 s');
  await expect(page.locator('[data-cadence-help="everest-anchor"]')).toContainText('readiness can extend the interval');

  await page.locator('[data-class="reaper_capital"]').click();
  const beam = page.locator('[data-weapon="reaper_capital_beam"] [data-stat="mount-cycle"]').first();
  await expect(beam).toContainText('2.8 s burst + 7.5 s recharge');
  await expect(beam).toContainText('10.3 s between burst starts');
  await expect(beam).toContainText('rate estimate');

  await timeline('prime_apex');
  await page.locator('[data-class="alliance_omaha"]').click();
  const omaha = page.locator('[data-weapon="omaha_spinal"] [data-stat="mount-cycle"]');
  await expect(omaha).toContainText('7.27 s reload');
  await expect(omaha).toContainText('rate estimate');
  await expect(page.locator('[data-weapon="alliance_broadside"][data-facing="90"]')).toContainText('6 × starboard');
  await expect(page.locator('.codex-body thead').first()).not.toContainText('Canon ME3 value');
  expect(errors).toEqual([]);
});
