import { expect, test, type Page } from '@playwright/test';
import type { App } from '../src/ui/app';

async function launchFleet(page: Page, large = false) {
  await page.goto('/');
  await expect(page.locator('[data-menu="quick-battle"]')).toBeVisible();
  await page.evaluate(big => {
    const app = (window as unknown as { reaperwar: App }).reaperwar;
    app.prefs.showOverlay = true;
    app.startBattle({
      id: 'visual-polish', name: 'Fleet visual exercise', scenarioId: 'custom', seed: 31,
      rules: app.getTimeline('prime_apex'), environment: 'deep_space', maxDuration: 180,
      perspectiveSide: 'A', objective: 'Inspect a real rendered fleet.',
      fleets: [
        { id: 'line', name: 'Alliance line', faction: 'alliance', side: 'A', playerControlled: true,
          ships: big ? [{ classId: 'alliance_dreadnought', count: 18 }, { classId: 'alliance_cruiser', count: 36 }, { classId: 'alliance_frigate', count: 42 }]
            : [{ classId: 'alliance_dreadnought', count: 1 }],
          formation: 'line_abreast', position: { x: 0, y: 0, z: -30 }, heading: { x: 0, y: 0, z: 1 } },
        { id: 'pressure', name: 'Reaper pressure', faction: 'reaper', side: 'B', playerControlled: false,
          ships: [{ classId: 'reaper_capital', count: big ? 8 : 1 }, { classId: 'reaper_destroyer', count: big ? 24 : 1 }],
          formation: 'strike_wedge', position: { x: 0, y: 0, z: 30 }, heading: { x: 0, y: 0, z: -1 } },
      ],
    });
    const ctrl = app.battle!;
    ctrl.togglePause();
    ctrl.setSpeed(3);
    for (const ship of ctrl.sim.ships) {
      for (const weapon of ship.weapons) weapon.def = { ...weapon.def, damage: 0 };
      const enemy = ctrl.sim.ships.find(candidate => candidate.side !== ship.side)!;
      ship.targetId = enemy.id;
    }
    ctrl.selectFleet();
    ctrl.view.rig.focus.set(0, 0, 0);
    ctrl.view.rig.distance = big ? 900 : 400;
    for (let i = 0; i < 40; i++) ctrl.view.update(0.1, 1);
    ctrl.hud.refresh();
  }, large);
  await expect(page.locator('[data-action="pause"]')).toHaveClass(/active/);
}

async function overlayCounts(page: Page) {
  return page.evaluate(() => {
    const ctrl = (window as unknown as { reaperwar: App }).reaperwar.battle!;
    const canvas = document.getElementById('battle-canvas') as HTMLCanvasElement;
    ctrl.overlay.draw(ctrl.view, canvas.clientWidth, canvas.clientHeight, ctrl.view.rig.mode);
    return { ...ctrl.overlay.drawCounts };
  });
}

test('Watch battle and Return to command change presentation without changing a paused simulation', async ({ page }) => {
  await launchFleet(page);
  const before = await page.evaluate(() => {
    const ctrl = (window as unknown as { reaperwar: App }).reaperwar.battle!;
    return { time: ctrl.sim.time, speed: ctrl.speed, paused: ctrl.paused, rng: ctrl.sim.rng.getState() };
  });
  const watch = page.locator('[data-action="watch-battle"]');
  await watch.click();
  await expect(watch).toHaveText('Return to command');
  expect(await page.evaluate(() => {
    const ctrl = (window as unknown as { reaperwar: App }).reaperwar.battle!;
    return { mode: ctrl.view.rig.mode, hud: ctrl.hudLevel, overlay: ctrl.overlay.visible,
      state: { time: ctrl.sim.time, speed: ctrl.speed, paused: ctrl.paused, rng: ctrl.sim.rng.getState() } };
  })).toEqual({ mode: 'cinematic', hud: 'minimal', overlay: false, state: before });
  await expect(page.locator('.hud-clock')).toBeVisible();
  expect(await overlayCounts(page)).toEqual({ labels: 0, targetLines: 0, rangeRings: 0 });
  await watch.click();
  await expect(watch).toHaveText('Watch battle');
  expect(await page.evaluate(() => {
    const ctrl = (window as unknown as { reaperwar: App }).reaperwar.battle!;
    return { mode: ctrl.view.rig.mode, hud: ctrl.hudLevel, overlay: ctrl.overlay.visible,
      state: { time: ctrl.sim.time, speed: ctrl.speed, paused: ctrl.paused, rng: ctrl.sim.rng.getState() } };
  })).toEqual({ mode: 'tactical', hud: 'full', overlay: true, state: before });
});

test('large selections respect real overlay budgets and clean HUD hides every tactical annotation', async ({ page }, testInfo) => {
  await launchFleet(page, true);
  expect(await page.evaluate(() => (window as unknown as { reaperwar: App }).reaperwar.battle!.view.selectedIds.size)).toBeGreaterThan(90);
  for (const camera of ['tactical', 'command'] as const) {
    await page.locator(`[data-camera="${camera}"]`).click();
    await page.evaluate(() => {
      const ctrl = (window as unknown as { reaperwar: App }).reaperwar.battle!;
      for (let i = 0; i < 30; i++) ctrl.view.update(0.1, 1);
    });
    const counts = await overlayCounts(page);
    expect(counts.labels).toBeGreaterThan(0);
    expect(counts.labels).toBeLessThanOrEqual(camera === 'command' ? 90 : 60);
    expect(counts.targetLines).toBeGreaterThan(0);
    expect(counts.targetLines).toBeLessThanOrEqual(8);
    expect(counts.rangeRings).toBe(2);
  }
  await page.screenshot({ path: testInfo.outputPath('bounded-fleet-overlay.png') });
  await page.keyboard.press('h');
  expect(await overlayCounts(page)).toEqual({ labels: 0, targetLines: 0, rangeRings: 0 });
  await page.keyboard.press('h');
  await expect(page.locator('.hud-clock')).toBeHidden();
  expect(await overlayCounts(page)).toEqual({ labels: 0, targetLines: 0, rangeRings: 0 });
});

test('large-battle cinematics hold a visible battlegroup without advancing a paused battle', async ({ page }, testInfo) => {
  await launchFleet(page, true);
  await page.locator('[data-action="watch-battle"]').click();
  const result = await page.evaluate(() => {
    const ctrl = (window as unknown as { reaperwar: App }).reaperwar.battle!;
    const state = { time: ctrl.sim.time, rng: ctrl.sim.rng.getState() };
    const director = ctrl.view as unknown as { cine: { members?: string[] } };
    ctrl.view.update(0.01, 1);
    const members = [...(director.cine.members ?? [])];
    for (let i = 0; i < 240; i++) ctrl.view.update(1 / 60, 1);
    ctrl.view.render(); ctrl.view.rig.camera.updateMatrixWorld();
    const visible = members.filter(id => {
      const visual = ctrl.view.visuals.get(id)!;
      const screen = visual.built.group.position.clone().project(ctrl.view.rig.camera);
      return Math.abs(screen.x) < 0.95 && Math.abs(screen.y) < 0.95 && screen.z > -1 && screen.z < 1;
    }).length;
    return { count: members.length, visible, stable: JSON.stringify(director.cine.members) === JSON.stringify(members),
      unchanged: state.time === ctrl.sim.time && state.rng === ctrl.sim.rng.getState(), glError: ctrl.view.renderer.getContext().getError() };
  });
  expect(result.count).toBeGreaterThanOrEqual(6); expect(result.count).toBeLessThanOrEqual(12);
  expect(result.visible).toBe(result.count); expect(result.stable).toBe(true); expect(result.unchanged).toBe(true); expect(result.glError).toBe(0);
  await page.keyboard.press('h');
  await page.screenshot({ path: testInfo.outputPath('cinematic-battlegroup.png') });
});

test('actual hull barrier shells render without WebGL shader errors', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /webgl|three|shader|program/i.test(message.text())) errors.push(message.text());
  });
  await launchFleet(page);
  const evidence = await page.evaluate(() => {
    const ctrl = (window as unknown as { reaperwar: App }).reaperwar.battle!;
    const visual = [...ctrl.view.visuals.values()].find(v => v.ship.faction === 'reaper')!;
    ctrl.view.followId = visual.ship.id;
    ctrl.setCamera('follow');
    ctrl.view.settings.lod = false;
    for (let i = 0; i < 30; i++) ctrl.view.update(0.1, 1);
    const hit = () => {
      ctrl.view.effects.barriers.hit(visual.ship.id, visual.ship.classId, visual.built.group, visual.built.group.position.clone(), 1200);
      ctrl.view.effects.barriers.update(0.05);
    };
    hit();
    ctrl.view.render();
    const gl = ctrl.view.renderer.getContext();
    const active = ctrl.view.effects.barriers.activeCount;
    // Keep an actual impact visible while software WebGL captures its frame.
    const timer = window.setInterval(hit, 100);
    return { active, cached: ctrl.view.effects.barriers.cachedClasses, glError: gl.getError(), timer };
  });
  expect(evidence.active).toBe(1);
  expect(evidence.cached).toBe(1);
  expect(evidence.glError).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('reaper-hull-barrier.png') });
  await page.evaluate(timer => window.clearInterval(timer), evidence.timer);
  expect(errors).toEqual([]);
});
