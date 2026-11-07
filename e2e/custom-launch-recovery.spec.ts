import { expect, test } from '@playwright/test';
import type { App } from '../src/ui/app';
import type { BattleConfig } from '../src/simulation/types';

test('Custom Battle reports invalid setup and can retry without losing the builder', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('[data-menu="custom-battle"]')).toBeVisible();

  await page.evaluate(() => {
    const app = (window as unknown as { reaperwar: App }).reaperwar;
    // An old or incomplete custom ruleset must not erase the builder UI.
    const bad = { ...app.getTimeline('prime_apex'), id: 'invalid-custom-qa',
      name: 'Invalid stored rules', fleetStrength: undefined };
    app.customTimelines.push(bad as unknown as ReturnType<App['getTimeline']>);
    app.selectTimeline('invalid-custom-qa');
  });

  await page.locator('[data-menu="custom-battle"]').click();
  await expect(page.locator('[data-action="launch-custom"]')).toBeVisible();
  await page.locator('[data-action="launch-custom"]').click();
  await expect(page.locator('[data-action="custom-launch-error"]')).toContainText('BATTLE COULD NOT START');
  await expect(page.locator('[data-action="launch-custom"]')).toBeVisible();
  await expect(page.locator('[data-fleet-card="sideA"]')).toBeVisible();

  // Correct the timeline and retry the same fleet selection.
  await page.locator('[data-action="custom-timeline"]').selectOption('canon_me3');
  await page.locator('[data-action="launch-custom"]').click();
  await expect(page.locator('[data-action="pause"]')).toBeVisible({ timeout: 45_000 });
  expect(errors).toEqual([]);
});

test('Battle startup exception does not clear a working Custom Battle editor', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-menu="custom-battle"]').click();
  await expect(page.locator('[data-action="launch-custom"]')).toBeVisible();

  const state = await page.evaluate(() => {
    const app = (window as unknown as { reaperwar: App }).reaperwar;
    const config: BattleConfig = {
      id: 'invalid-boot-check', name: 'Invalid custom startup test',
      scenarioId: 'custom', seed: 42, rules: app.getTimeline('canon_me3'),
      environment: 'deep_space', maxDuration: 60, perspectiveSide: 'A',
      objective: 'Test recovery', fleets: [
        {
          id: 'invalid-fleet', name: 'Invalid ship test',
          faction: 'alliance', side: 'A', playerControlled: true,
          position: { x: 0, y: 0, z: -20 }, heading: { x: 0, y: 0, z: 1 },
          formation: 'line_abreast',
          ships: [{ classId: 'missing_ship_design', count: 1 }],
        },
      ],
    };
    let error = '';
    try {
      app.startBattle(config);
    } catch (exception) {
      error = exception instanceof Error ? exception.message : String(exception);
    }
    return {
      error, screen: app.screen,
      visible: !!document.querySelector('[data-action="launch-custom"]'),
      canvasHidden: app.canvas.style.visibility === 'hidden',
    };
  });
  expect(state.error).toContain('missing_ship_design');
  expect(state.screen).toBe('custom');
  expect(state.visible).toBe(true);
  expect(state.canvasHidden).toBe(true);
});
