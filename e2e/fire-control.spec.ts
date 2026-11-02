import { expect, test, type Page } from '@playwright/test';
import type { App } from '../src/ui/app';

/** A small real battle keeps software WebGL validation focused on the controls. */
async function launchBattery(page: Page) {
  await page.goto('/');
  await expect(page.locator('[data-menu="quick-battle"]')).toBeVisible();
  const ids = await page.evaluate(() => {
    const app = (window as unknown as { reaperwar: App }).reaperwar;
    app.startBattle({
      id: 'fire-control-ui', name: 'Spinal fire-control exercise', scenarioId: 'custom', seed: 19,
      rules: app.getTimeline('prime_apex'), environment: 'deep_space', maxDuration: 180,
      perspectiveSide: 'A', objective: 'Validate scoped spinal commands.',
      fleets: [
        { id: 'battery-a', name: 'Alliance gun line', faction: 'alliance', side: 'A', playerControlled: true,
          ships: [{ classId: 'alliance_dreadnought', count: 1 }], formation: 'line_abreast', position: { x: 0, y: 0, z: -50 }, heading: { x: 0, y: 0, z: 1 } },
        { id: 'battery-b', name: 'Omaha reserve', faction: 'alliance', side: 'A', playerControlled: true,
          ships: [{ classId: 'alliance_omaha', count: 1 }], formation: 'line_abreast', position: { x: 10, y: 0, z: -50 }, heading: { x: 0, y: 0, z: 1 } },
        { id: 'hostile', name: 'Reaper target', faction: 'reaper', side: 'B', playerControlled: false,
          ships: [{ classId: 'reaper_capital', count: 1 }], formation: 'line_abreast', position: { x: 0, y: 0, z: 50 }, heading: { x: 0, y: 0, z: -1 } },
      ],
    });
    const ctrl = app.battle!;
    ctrl.togglePause();
    for (const ship of ctrl.sim.ships) {
      ship.aiTimer = 0;
      for (const w of ship.weapons) { w.def = { ...w.def, damage: 0 }; w.cooldown = 0; }
    }
    ctrl.sim.step();
    const ship = ctrl.sim.ships.find(s => s.fleetId === 'battery-a')!;
    ctrl.select(ship.id);
    ctrl.hud.refresh();
    return { shipId: ship.id };
  });
  await expect(page.locator('[data-action="pause"]')).toHaveClass(/active/);
  return ids;
}

async function step(page: Page, count: number) {
  await page.evaluate(ticks => {
    const ctrl = (window as unknown as { reaperwar: App }).reaperwar.battle!;
    for (let i = 0; i < ticks; i++) ctrl.sim.step();
    ctrl.hud.refresh();
  }, count);
}

test('scoped hold and manual release use real battery readiness and leave general fleet orders intact', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const { shipId } = await launchBattery(page);
  const scope = page.locator('[data-action="fire-control-scope"]');
  const hold = page.locator('[data-action="hold-primary-fire"]');
  const release = page.locator('[data-action="release-primary-volley"]');
  const fleetStatus = page.locator('[data-action="fleet-battery-status"]');
  const shipStatus = page.locator('[data-action="ship-battery-status"]');
  await expect(scope.locator('option')).toHaveCount(3);
  await expect(scope.locator('option[value="hostile"]')).toHaveCount(0);
  await expect(shipStatus).toContainText('Out of range');
  await expect(page.locator('[data-action="ship-engagement-range"]')).toContainText(/km.*band/);
  await expect(release).toBeDisabled();

  await scope.selectOption('battery-a');
  await hold.click();
  await expect(hold).toHaveText('Resume spinal fire');
  expect(await page.evaluate(() => {
    const sim = (window as unknown as { reaperwar: App }).reaperwar.battle!.sim;
    return [sim.fleets.get('battery-a')!.orders.primaryFire, sim.fleets.get('battery-b')!.orders.primaryFire];
  })).toEqual(['hold', 'free']);
  await scope.selectOption('all');
  await expect(fleetStatus).toContainText('MIXED FIRE');
  await hold.click();
  await expect(fleetStatus).toContainText('FIRE HELD');
  await scope.selectOption('battery-a');

  // Place the real target in the selected gun's range and align real hardpoints.
  await page.evaluate(() => {
    const ctrl = (window as unknown as { reaperwar: App }).reaperwar.battle!;
    const sim = ctrl.sim;
    for (const fleet of sim.fleets.values()) sim.issueOrders(fleet.spec.id, { order: 'hold_formation' });
    const line = sim.ships.find(s => s.fleetId === 'battery-a')!;
    const target = sim.ships.find(s => s.side === 'B')!;
    const gun = line.weapons.find(w => w.def.antiCapital && w.def.kind === 'mass_accelerator' && w.def.arc <= 20)!;
    target.pos = { x: line.pos.x, y: line.pos.y, z: line.pos.z + gun.def.range * 0.8 };
    sim.fleets.get(target.fleetId)!.anchor = { ...target.pos };
    for (const ship of sim.ships.filter(s => s.side === 'A')) {
      const dx = target.pos.x - ship.pos.x, dy = target.pos.y - ship.pos.y, dz = target.pos.z - ship.pos.z;
      const length = Math.hypot(dx, dy, dz);
      ship.heading = { x: dx / length, y: dy / length, z: dz / length };
      ship.targetId = target.id;
      ship.forcedTargetId = target.id;
      for (const w of ship.weapons) w.cooldown = 0;
    }
    ctrl.hud.refresh();
  });
  await expect(shipStatus).toContainText('Fire held');
  await expect(fleetStatus).toContainText('1/1 guns ready');
  await expect(release).toBeEnabled();
  await release.click();
  await expect(fleetStatus).toContainText('RELEASE');
  await expect(release).toBeDisabled();
  await step(page, 12);
  const shots = await page.evaluate(() => {
    const sim = (window as unknown as { reaperwar: App }).reaperwar.battle!.sim;
    const fired = sim.events.filter(e => e.type === 'weapon_fired' && e.weaponId === 'apex_hyper_ma');
    return fired.map(e => e.type === 'weapon_fired' ? sim.getShip(e.shipId)!.fleetId : '');
  });
  expect(shots).toEqual(['battery-a']);
  await expect(shipStatus).toContainText(/Reloading [0-9.]+s/);
  await expect(fleetStatus).toContainText('FIRE HELD');
  await expect(release).toBeDisabled();

  // Physically ready free-fire battery reports Ready rather than stale reload.
  await page.evaluate(id => {
    const ctrl = (window as unknown as { reaperwar: App }).reaperwar.battle!;
    for (const w of ctrl.sim.getShip(id)!.weapons) w.cooldown = 0;
    ctrl.sim.issueOrders('battery-a', { focusFire: false });
    ctrl.hud.refresh();
  }, shipId);
  await hold.click();
  await expect(shipStatus).toContainText('Ready');
  await expect(fleetStatus).toContainText('FREE FIRE');
  await page.click('[data-order="advance"]');
  expect(await page.evaluate(() => {
    const sim = (window as unknown as { reaperwar: App }).reaperwar.battle!.sim;
    return [sim.fleets.get('battery-a')!.orders.order, sim.fleets.get('battery-b')!.orders.order];
  })).toEqual(['advance', 'advance']);
  await page.screenshot({ path: testInfo.outputPath('fire-control.png') });
  expect(errors).toEqual([]);
});

test('battery diagnostics stay observational and the clean HUD cycle hides all new controls', async ({ page }) => {
  await launchBattery(page);
  const state = await page.evaluate(() => {
    const ctrl = (window as unknown as { reaperwar: App }).reaperwar.battle!;
    const before = JSON.stringify({ events: ctrl.sim.events, ships: ctrl.sim.ships, rng: ctrl.sim.rng.getState() });
    for (let i = 0; i < 20; i++) ctrl.hud.refresh();
    return { same: before === JSON.stringify({ events: ctrl.sim.events, ships: ctrl.sim.ships, rng: ctrl.sim.rng.getState() }) };
  });
  expect(state.same).toBe(true);
  await expect(page.locator('[data-action="hold-primary-fire"]')).toBeVisible();
  await page.keyboard.press('h');
  await expect(page.locator('[data-action="hold-primary-fire"]')).toBeHidden();
  await expect(page.locator('.hud-clock')).toBeVisible();
  await page.keyboard.press('h');
  await expect(page.locator('.hud-clock')).toBeHidden();
  await page.keyboard.press('h');
  await expect(page.locator('[data-action="hold-primary-fire"]')).toBeVisible();
  await expect(page.locator('[data-action="ship-battery-status"]')).toBeVisible();
});


test('a real HADES penetrating impact drives the nuclear flash and shock-ring renderer', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && /webgl|shader|three|program/i.test(m.text())) errors.push(m.text()); });
  await launchBattery(page);
  await expect(page.locator('[data-action="hades-payload-note"]')).toContainText('internal nuclear warheads');
  const result = await page.evaluate(() => {
    const b = (window as unknown as { reaperwar: App }).reaperwar.battle!;
    const shooter = b.sim.ships.find(s => s.fleetId === 'battery-a')!;
    const target = b.sim.ships.find(s => s.side === 'B')!;
    const gun = shooter.weapons.find(w => w.def.antiCapital && w.def.kind === 'mass_accelerator')!;
    b.view.followId = target.id; b.setCamera('follow');
    for (let i = 0; i < 60; i++) b.view.update(1 / 60, 1);
    target.barriers = 0; target.hull = target.maxHull = 1000000;
    b.sim.projectiles.push({ id: 999000, shooterId: shooter.id, side: shooter.side,
      weapon: { ...gun.def, damage: 2000 }, pos: { x: target.pos.x, y: target.pos.y, z: target.pos.z - target.radiusKm - 0.1 },
      prevPos: { ...target.pos }, vel: { x: 0, y: 0, z: gun.def.projectileSpeed }, ttl: 2, intendedTargetId: target.id });
    b.sim.step(); b.view.update(0.01, 1); b.view.render();
    return { detonations: b.sim.events.filter(e => e.type === 'hades_detonation').length, rings: b.view.effects.nuclearRingCount,
      glError: b.view.renderer.getContext().getError() };
  });
  expect(result).toEqual({ detonations: 1, rings: 1, glError: 0 });
  await page.screenshot({ path: testInfo.outputPath('hades-internal-detonation.png') });
  expect(errors).toEqual([]);
});
