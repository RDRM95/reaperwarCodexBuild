import { expect, test } from '@playwright/test';
import type { App } from '../src/ui/app';

test('Strict Lore briefing blocks alternate-history launches and runs the sourced main-gun profile', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.locator('[data-menu="quick-battle"]').click();
  await page.getByRole('button', { name: 'Alliance Fleet Engagement', exact: true }).click();
  await page.locator('[data-action="briefing-timeline"]').selectOption('strict_lore');
  await expect(page.locator('[data-action="strict-lore-note"]')).toContainText('two-second base cycle');
  await expect(page.getByRole('button', { name: /Prime\/Apex — Sol Defence/ })).toBeDisabled();
  await expect(page.locator('[data-action="launch"]')).toBeEnabled();
  await page.locator('[data-action="launch"]').click();
  await expect(page.locator('[data-action="pause"]')).toBeVisible();
  const state = await page.evaluate(() => {
    const app = (window as unknown as { reaperwar: App }).reaperwar, b = app.battle!;
    b.paused = true;
    const ship = b.sim.ships.find(s => s.classId === 'alliance_dreadnought')!;
    b.select(ship.id); b.hud.refresh(); b.view.update(0.05, 1); b.view.render();
    return { strict: b.config.rules.strictLore, primaryReload: ship.weapons.find(w => w.def.id === 'alliance_dn_main')!.def.cooldown,
      hasHades: b.sim.ships.some(s => s.weapons.some(w => (w.def.internalWarheadFraction ?? 0) > 0)), glError: b.view.renderer.getContext().getError() };
  });
  expect(state).toEqual({ strict: true, primaryReload: 2, hasHades: false, glError: 0 });
  await expect(page.locator('[data-action="ship-firing-cadence"]')).toContainText('2.0s reload');
  expect(errors).toEqual([]);
});
