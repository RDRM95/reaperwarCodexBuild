import { expect, test, type Page } from '@playwright/test';
import type { App } from '../src/ui/app';

async function launch(page: Page) {
  await page.evaluate(() => {
    const app = (window as unknown as { reaperwar: App }).reaperwar;
    app.startBattle({
      id: 'overlay-policy', name: 'Overlay visibility exercise', scenarioId: 'custom', seed: 31,
      rules: app.getTimeline('prime_apex'), environment: 'deep_space', maxDuration: 180,
      perspectiveSide: 'A', objective: 'Keep annotations independently of interface panels.',
      fleets: [
        { id: 'allied', name: 'Allied line', faction: 'alliance', side: 'A', playerControlled: true,
          ships: [{ classId: 'alliance_dreadnought', count: 2 }, { classId: 'alliance_cruiser', count: 2 }],
          formation: 'line_abreast', position: { x: 0, y: 0, z: -15 }, heading: { x: 0, y: 0, z: 1 } },
        { id: 'hostile', name: 'Reaper front', faction: 'reaper', side: 'B',
          ships: [{ classId: 'reaper_capital', count: 2 }], formation: 'line_abreast',
          position: { x: 0, y: 0, z: 15 }, heading: { x: 0, y: 0, z: -1 } },
      ],
    });
    const b = app.battle!; b.paused = true; b.selectFleet();
    for (const s of b.sim.ships) s.targetId = b.sim.ships.find(enemy => enemy.side !== s.side)!.id;
    b.view.rig.focus.set(0, 0, 0); b.view.rig.distance = 420;
    for (let i = 0; i < 60; i++) b.view.update(1 / 60, 1);
    b.hud.refresh();
  });
}

async function sample(page: Page) {
  return page.evaluate(() => {
    const b = (window as unknown as { reaperwar: App }).reaperwar.battle!;
    const canvas = document.getElementById('battle-canvas') as HTMLCanvasElement;
    b.overlay.draw(b.view, canvas.clientWidth, canvas.clientHeight, b.view.rig.mode);
    return { hud: b.hudLevel, visible: b.overlay.visible, labels: b.overlay.drawCounts.labels,
      state: { time: b.sim.time, rng: b.sim.rng.getState(), paused: b.paused, selection: [...b.view.selectedIds] } };
  });
}

test('default clean HUD behavior remains, and the hidden-HUD menu can enable independent annotations', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-menu="quick-battle"]')).toBeVisible();
  await launch(page);
  const before = await sample(page);
  expect(before.visible).toBe(true); expect(before.labels).toBeGreaterThan(0);
  await page.keyboard.press('h');
  expect(await sample(page)).toEqual({ ...before, hud: 'minimal', visible: false, labels: 0 });
  await page.keyboard.press('h');
  expect(await sample(page)).toEqual({ ...before, hud: 'none', visible: false, labels: 0 });
  await expect(page.locator('.hud-clock')).toBeHidden();
  await page.keyboard.press('Escape');
  const keep = page.locator('[data-action="keep-overlay-hidden-hud"]');
  await expect(keep).toBeVisible();
  await keep.click();
  await expect(keep).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  const after = await sample(page);
  expect(after.hud).toBe('none'); expect(after.visible).toBe(true); expect(after.labels).toBeGreaterThan(0);
  expect(after.state).toEqual(before.state);
  await expect(page.locator('.hud-clock')).toBeHidden();
  // Opening from a running battle still pauses temporarily and resumes it.
  await page.evaluate(() => { (window as unknown as { reaperwar: App }).reaperwar.battle!.paused = false; });
  await page.keyboard.press('Escape');
  await expect(keep).toBeVisible();
  expect((await sample(page)).state.paused).toBe(true);
  await page.keyboard.press('Escape');
  expect((await sample(page)).state.paused).toBe(false);
});

test('settings persist independent overlays through HUD cycles, cinematics and keyboard toggles', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const policy = page.locator('[data-action="overlay-hud-policy"]');
  await expect(policy).toHaveValue('hide');
  await policy.selectOption('keep');
  await page.evaluate(async () => (window as unknown as { reaperwar: App }).reaperwar.savePrefs());
  await page.reload();
  await expect(page.locator('[data-menu="quick-battle"]')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { reaperwar: App }).reaperwar.prefs.overlayIndependent)).toBe(true);
  await launch(page);
  const before = await sample(page);
  await page.keyboard.press('h');
  expect((await sample(page)).visible).toBe(true);
  await page.keyboard.press('h');
  expect((await sample(page)).visible).toBe(true);
  await expect(page.locator('.hud-clock')).toBeHidden();
  await page.keyboard.press('o');
  expect((await sample(page)).labels).toBe(0);
  await page.keyboard.press('o');
  expect((await sample(page)).labels).toBeGreaterThan(0);
  await page.keyboard.press('h');
  await page.locator('[data-action="watch-battle"]').click();
  await expect(page.locator('[data-action="watch-battle"]')).toHaveText('Return to command');
  await page.evaluate(() => {
    const b = (window as unknown as { reaperwar: App }).reaperwar.battle!;
    for (let i = 0; i < 120; i++) b.view.update(1 / 60, 1);
  });
  const cinematic = await sample(page);
  expect(cinematic.hud).toBe('minimal'); expect(cinematic.visible).toBe(true); expect(cinematic.labels).toBeGreaterThan(0);
  expect(cinematic.state).toEqual(before.state);
  await page.keyboard.press('h');
  await expect(page.locator('.hud-clock')).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('hidden-hud-tactical-overlay.png') });
  await page.keyboard.press('o');
  await page.evaluate(async () => (window as unknown as { reaperwar: App }).reaperwar.savePrefs());
  await page.reload();
  await expect(page.locator('[data-menu="quick-battle"]')).toBeVisible();
  expect(await page.evaluate(() => {
    const p = (window as unknown as { reaperwar: App }).reaperwar.prefs;
    return { enabled: p.showOverlay, independent: p.overlayIndependent };
  })).toEqual({ enabled: false, independent: true });
  await launch(page);
  expect((await sample(page)).visible).toBe(false);
  expect((await sample(page)).labels).toBe(0);
  expect(errors).toEqual([]);
});

test('O can explicitly restore annotations from a clean HUD without touching simulation state', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-menu="quick-battle"]')).toBeVisible();
  await launch(page);
  const before = await sample(page);
  await page.keyboard.press('h'); await page.keyboard.press('h');
  await page.keyboard.press('o');
  const restored = await sample(page);
  expect(restored.hud).toBe('none'); expect(restored.visible).toBe(true); expect(restored.labels).toBeGreaterThan(0);
  expect(restored.state).toEqual(before.state);
  expect(await page.evaluate(() => (window as unknown as { reaperwar: App }).reaperwar.prefs.overlayIndependent)).toBe(true);
});

test('saved preferences from before independent overlays retain their clean-HUD policy', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('reaperwar:preferences', JSON.stringify({ showOverlay: true, lastTimelineId: 'canon_me3' }));
  });
  await page.goto('/');
  await expect(page.locator('[data-menu="quick-battle"]')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { reaperwar: App }).reaperwar.prefs.overlayIndependent)).toBe(false);
  await launch(page);
  await page.keyboard.press('h');
  expect((await sample(page)).visible).toBe(false);
});
