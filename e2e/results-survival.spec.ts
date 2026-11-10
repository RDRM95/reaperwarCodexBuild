import { test, expect } from '@playwright/test';

test('after-action report separates hull survival from retained combat points', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.locator('[data-menu="quick-battle"]')).toBeVisible();
  // A reporting fixture reproduces the user's 59 deployed / 38 lost / 9%
  // observation. It does not alter combat formulas or run an artificial battle.
  await page.evaluate(() => {
    const app = (window as any).reaperwar;
    const side = { side: 'A', factions: ['alliance'], deployed: 59, destroyed: 38, survivors: 21,
      capitalDeployed: 38, capitalLost: 38, reaperCapitalLost: 0, reaperDestroyersLost: 0,
      damageDealt: 12345, damageTaken: 23456, shotsFired: 100, hits: 50,
      pointsDeployed: 10000, pointsLost: 9100, survivalPercent: 9, tacticalEffectiveness: 1.4, lossesByClass: {} };
    const rules = app.getTimeline('canon_me3');
    app.lastBattle = { config: { id: 'survival-report', name: 'Reporting fixture', rules },
      result: { perspectiveSide: 'A', sides: { A: side, B: { ...side, side: 'B', deployed: 0, destroyed: 0, survivors: 0, survivalPercent: 0 } },
        outcome: 'defeat', rulesName: rules.name, seed: 42, duration: 120, reason: 'Reporting fixture' },
      sim: { events: [], ships: [], rules, getShip: () => undefined } };
    app.show('results');
  });
  await expect(page.locator('[data-stat="hull-survival"]').first()).toHaveText('21 / 59 (36%)');
  await expect(page.locator('[data-stat="combat-value-retained"]').first()).toHaveText('9%');
  await expect(page.locator('[data-stat="hull-survival"]').last()).toHaveText('0 / 0 (0%)');
  await expect(page.getByText('Fleet survival', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('survival-report.png') });
});
