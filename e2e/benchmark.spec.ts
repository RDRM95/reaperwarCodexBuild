import { expect, test } from '@playwright/test';

/**
 * The in-game benchmark starts from Settings and from the address bar. Its arithmetic is unit-tested
 * (tests/benchmark.test.ts); a whole run takes a minute on real hardware and far longer under the software
 * renderer used here, so this checks only that it starts, measures and can be read from outside.
 */
test('the benchmark starts from Settings, runs a battle fast until contact and records frames', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-menu="quick-battle"]')).toBeVisible();
  await page.evaluate(() => (window as unknown as { reaperwar: { show(screen: string): void } }).reaperwar.show('settings'));
  await expect(page.locator('[data-action="benchmark-standard"]')).toBeVisible();
  await expect(page.locator('[data-action="benchmark-large"]')).toBeVisible();
  await page.click('[data-action="benchmark-standard"]');
  await expect(page.locator('[data-action="pause"]')).toBeVisible();
  const state = await page.evaluate(() => {
    const battle = (window as unknown as { reaperwar: { battle: { benchmark?: { phase: string; scene: string }; speed: number; paused: boolean; sim: { ships: unknown[] } } } }).reaperwar.battle;
    return { phase: battle.benchmark?.phase, scene: battle.benchmark?.scene, speed: battle.speed, paused: battle.paused, ships: battle.sim.ships.length };
  });
  expect({ ...state, ships: undefined }).toEqual({ phase: 'warm-up', scene: 'standard', speed: 8, paused: false, ships: undefined });
  // The first wave; reinforcements and fighters bring it to about 300 by the time it is measured.
  expect(state.ships).toBeGreaterThan(150);
});

test('?benchmark=standard starts the benchmark without a click', async ({ page }) => {
  await page.goto('/?benchmark=standard');
  // The page boots and builds the battle in one go: allow for a slow software renderer.
  await expect(page.locator('[data-action="pause"]')).toBeVisible({ timeout: 60_000 });
  expect(await page.evaluate(() => (window as unknown as { reaperwar: { battle: { benchmark?: { scene: string } } } }).reaperwar.battle.benchmark?.scene)).toBe('standard');
});
