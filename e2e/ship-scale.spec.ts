import { test, expect } from '@playwright/test';

test('true-scale inspection exposes measured dimensions without advancing a frozen battle', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('[data-menu="quick-battle"]')).toBeVisible();
  const before = await page.evaluate(() => {
    const app = (window as any).reaperwar;
    app.startBattle({ id: 'scale-inspection', name: 'Scale QA', scenarioId: 'custom', seed: 42,
      rules: app.getTimeline('canon_me3'), environment: 'deep_space', maxDuration: 120,
      perspectiveSide: 'A', objective: 'Inspect without changing combat', fleets: [
        { id: 'a', name: 'Alliance', faction: 'alliance', side: 'A', formation: 'line_abreast',
          position: { x: 0, y: 0, z: -40 }, heading: { x: 0, y: 0, z: 1 }, ships: [{ classId: 'alliance_dreadnought', count: 1 }] },
        { id: 'b', name: 'Reapers', faction: 'reaper', side: 'B', formation: 'line_abreast',
          position: { x: 0, y: 0, z: 40 }, heading: { x: 0, y: 0, z: -1 }, ships: [{ classId: 'reaper_capital', count: 1 }] },
      ] });
    const battle = app.battle; battle.paused = true; cancelAnimationFrame(battle.raf);
    return JSON.stringify({ tick: battle.sim.tick, rng: battle.sim.rng.getState(), ships: battle.sim.ships, events: battle.sim.events });
  });
  await page.locator('#ship-reference-launch').click();
  await page.locator('.shipref-top select').selectOption('REP-001');
  await expect(page.locator('.shipref-context')).toContainText('length 2,000 m');
  await page.getByRole('button', { name: 'TRUE-SCALE COMPARISON', exact: true }).click();
  const comparison = page.getByRole('region', { name: 'True-scale fleet comparison' });
  await expect(comparison.locator('tbody tr')).toHaveCount(6);
  await expect(comparison.locator('[data-class-id="reaper_capital"] td').nth(2)).toHaveText('2,000');
  await expect(comparison.locator('[data-class-id="reaper_destroyer"] td').nth(2)).toHaveText('160');
  await expect(comparison.locator('[data-class-id="alliance_fighter"] td').nth(2)).toHaveText('18');
  await expect(comparison).toHaveAttribute('data-gl-error', '0');
  await comparison.screenshot({ path: testInfo.outputPath('measured-scale.png') });
  await page.getByLabel('Show measured bounds').check();
  await page.getByRole('button', { name: 'Three-quarter — hull depth' }).click();
  await expect(comparison).toHaveAttribute('data-gl-error', '0');
  await page.getByRole('button', { name: 'BACK TO SIX VIEWS' }).click();
  await expect(page.locator('.shipref-cell')).toHaveCount(6);
  await page.getByRole('button', { name: 'CLOSE', exact: true }).click();
  const after = await page.evaluate(() => {
    const sim = (window as any).reaperwar.battle.sim;
    return JSON.stringify({ tick: sim.tick, rng: sim.rng.getState(), ships: sim.ships, events: sim.events });
  });
  expect(after).toBe(before); expect(errors).toEqual([]);
});
