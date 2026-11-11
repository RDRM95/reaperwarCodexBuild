import { expect, test, type Page } from '@playwright/test';
import type { App } from '../src/ui/app';

async function launchLarge(page: Page) {
  await page.goto('/');
  await expect(page.locator('[data-menu="quick-battle"]')).toBeVisible();
  await page.evaluate(() => {
    const app = (window as unknown as { reaperwar: App }).reaperwar;
    app.prefs.showOverlay = true; app.prefs.overlayIndependent = true; app.prefs.overlayDetail = 'auto';
    app.startBattle({ id: 'fleet-labels', name: 'Fleet annotation review', scenarioId: 'custom', seed: 62,
      rules: app.getTimeline('prime_apex'), environment: 'deep_space', maxDuration: 180, perspectiveSide: 'A', objective: 'Inspect bounded fleet annotations.',
      fleets: [
        { id: 'line', name: 'Alliance battlegroup', faction: 'alliance', side: 'A', playerControlled: true,
          formation: 'line_abreast', position: { x: 0, y: 0, z: -40 }, heading: { x: 0, y: 0, z: 1 },
          ships: [{ classId: 'alliance_dreadnought', count: 18 }, { classId: 'alliance_cruiser', count: 36 }, { classId: 'alliance_frigate', count: 42 }] },
        { id: 'pressure', name: 'Reaper pressure front', faction: 'reaper', side: 'B',
          formation: 'strike_wedge', position: { x: 0, y: 0, z: 40 }, heading: { x: 0, y: 0, z: -1 },
          ships: [{ classId: 'reaper_capital', count: 16 }, { classId: 'reaper_destroyer', count: 80 }] },
        { id: 'future', name: 'Not yet arrived', faction: 'cerberus', side: 'B', arrivalTime: 90,
          formation: 'line_abreast', position: { x: 30, y: 0, z: 60 }, heading: { x: 0, y: 0, z: -1 }, ships: [{ classId: 'cerberus_cruiser', count: 20 }] },
      ] });
    const b = app.battle!; b.paused = true; b.selectFleet();
    for (const s of b.sim.ships) s.targetId = b.sim.ships.find(enemy => enemy.side !== s.side)!.id;
    b.view.rig.focus.set(0, 0, 0); b.view.rig.distance = 1100; b.view.rig.pitch = 0.6; b.view.rig.yaw = 0.3;
    for (let i = 0; i < 60; i++) b.view.update(1 / 60, 1);
    b.hud.refresh();
  });
}

async function sample(page: Page) {
  return page.evaluate(() => {
    const b = (window as unknown as { reaperwar: App }).reaperwar.battle!;
    const canvas = document.getElementById('battle-canvas') as HTMLCanvasElement;
    const overlayCanvas = document.getElementById('overlay-canvas') as HTMLCanvasElement;
    const ctx = overlayCanvas.getContext('2d')!, fill = ctx.fillText, text: string[] = [];
    ctx.fillText = function (value, x, y, maxWidth) {
      text.push(value);
      if (maxWidth === undefined) fill.call(ctx, value, x, y); else fill.call(ctx, value, x, y, maxWidth);
    };
    try { b.overlay.draw(b.view, canvas.clientWidth, canvas.clientHeight, b.view.rig.mode); }
    finally { ctx.fillText = fill; }
    return { counts: { ...b.overlay.drawCounts }, work: { ...b.overlay.drawStats }, text,
      state: { time: b.sim.time, rng: b.sim.rng.getState(), paused: b.paused, selected: [...b.view.selectedIds] },
      hud: b.hudLevel, camera: b.view.rig.mode, glError: b.view.renderer.getContext().getError() };
  });
}

test('large battles render fleet counts with bounded inspected details and much less projection work', async ({ page }, testInfo) => {
  // The heaviest interface test: 192 ships, three overlay modes and a cinematic under software rendering. On a slow
  // runner it has twice run out of the default 120 s while passing in the twin run of the same commit. It asserts
  // counts and state, not speed, so it takes the slow budget.
  test.slow();
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await launchLarge(page);
  await expect(page.locator('.ship-list .fleet-summary')).toHaveCount(2);
  await expect(page.locator('.ship-list .ship-row')).toHaveCount(0);
  await expect(page.locator('[data-fleet-summary="line"]')).toContainText('96 ships');
  await expect(page.locator('[data-fleet-summary="pressure"]')).toContainText('96 ships');
  const auto = await sample(page);
  expect(auto.work.mode).toBe('fleets'); expect(auto.work.liveShips).toBe(192);
  expect(auto.work.fleetProjections).toBe(2); expect(auto.work.fleetLabels).toBe(2);
  expect(auto.work.shipProjections).toBeLessThanOrEqual(12);
  expect(auto.work.projections).toBeLessThan(110);
  expect(auto.counts.targetLines).toBeGreaterThan(0); expect(auto.counts.targetLines).toBeLessThanOrEqual(8);
  expect(auto.counts.rangeRings).toBe(2);
  expect(auto.text.filter(label => label.includes('96 SHIPS'))).toHaveLength(2);
  expect(auto.text.some(label => label.includes('NOT YET ARRIVED'))).toBe(false);
  // The compact HUD keeps every individual reachable without maintaining a
  // large hidden row tree. Selecting a fleet updates the selection in one batch.
  await page.locator('[data-action="expand-fleet"][data-fleet="line"]').click();
  await expect(page.locator('.ship-list .ship-row')).toHaveCount(96);
  const lastShip = page.locator('.ship-list .ship-row').last();
  const selectedId = await lastShip.getAttribute('data-ship');
  await lastShip.click();
  expect(await page.evaluate(() => [...(window as unknown as { reaperwar: App }).reaperwar.battle!.view.selectedIds])).toEqual([selectedId]);
  await page.locator('[data-action="expand-fleet"][data-fleet="line"]').click();
  await expect(page.locator('.ship-list .ship-row')).toHaveCount(0);
  await page.locator('[data-fleet-select="line"]').click();
  expect(await page.evaluate(() => (window as unknown as { reaperwar: App }).reaperwar.battle!.view.selectedIds.size)).toBe(96);
  await page.locator('[data-fleet-select="pressure"]').click({ button: 'right' });
  await expect(page.locator('.toast').last()).toContainText('ATTACK');
  await page.keyboard.press('Escape');
  await page.locator('[data-action="overlay-detail-menu"]').selectOption('ships');
  await page.keyboard.press('Escape');
  const individual = await sample(page);
  expect(individual.work.mode).toBe('ships'); expect(individual.work.shipProjections).toBe(192);
  expect(individual.state).toEqual(auto.state);
  await page.keyboard.press('Escape');
  await page.locator('[data-action="overlay-detail-menu"]').selectOption('fleets');
  await page.keyboard.press('Escape');
  await page.locator('[data-action="watch-battle"]').click();
  await page.keyboard.press('h');
  await expect(page.locator('.hud-clock')).toBeHidden();
  const cinematic = await sample(page);
  expect(cinematic.hud).toBe('none'); expect(cinematic.camera).toBe('cinematic');
  expect(cinematic.work.mode).toBe('fleets'); expect(cinematic.work.shipProjections).toBeLessThanOrEqual(12);
  expect(cinematic.work.fleetLabels).toBeGreaterThan(0); expect(cinematic.counts.rangeRings).toBe(0);
  expect(cinematic.state).toEqual(auto.state); expect(cinematic.glError).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('cinematic-fleet-summary.png') });
  expect(errors).toEqual([]);
});

test('fleet-label preference persists through Settings reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const detail = page.locator('[data-action="overlay-detail-setting"]');
  await expect(detail).toHaveValue('auto'); await detail.selectOption('fleets');
  await page.evaluate(async () => (window as unknown as { reaperwar: App }).reaperwar.savePrefs());
  await page.reload(); await expect(page.locator('[data-menu="quick-battle"]')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { reaperwar: App }).reaperwar.prefs.overlayDetail)).toBe('fleets');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.locator('[data-action="overlay-detail-setting"]')).toHaveValue('fleets');
});

test('preferences saved before fleet summaries default to automatic detail', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('reaperwar:preferences', JSON.stringify({ showOverlay: true, overlayIndependent: true, lastTimelineId: 'canon_me3' })));
  await page.goto('/'); await expect(page.locator('[data-menu="quick-battle"]')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { reaperwar: App }).reaperwar.prefs.overlayDetail)).toBe('auto');
});
