import { expect, test } from '@playwright/test';

test('a thousand-ship battle brings rear batteries into action without collapsing its width', async ({ page }, info) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('[data-menu="quick-battle"]')).toBeVisible();
  const cohorts = await page.evaluate(() => {
    const app = (window as any).reaperwar;
    app.startBattle({ id: 'engagement-coverage', name: 'Fleet reach acceptance', scenarioId: 'custom', seed: 42,
      rules: app.getTimeline('prime_apex'), environment: 'deep_space', maxDuration: 240, perspectiveSide: 'A',
      objective: 'Verify rear batteries use live firing solutions.', worldState: { theatre_layout: 'legacy_plane' },
      fleets: [
        { id: 'custom-a', faction: 'alliance', side: 'A', name: 'Alliance line', formation: 'line_abreast',
          position: { x: 0, y: 0, z: -45 }, heading: { x: 0, y: 0, z: 1 }, playerControlled: true,
          ships: [{ classId: 'alliance_dreadnought', count: 50 }, { classId: 'alliance_cruiser', count: 200 }, { classId: 'alliance_frigate', count: 250 }] },
        { id: 'custom-b', faction: 'reaper', side: 'B', name: 'Reaper pressure', formation: 'line_abreast',
          position: { x: 0, y: 0, z: 45 }, heading: { x: 0, y: 0, z: -1 },
          ships: [{ classId: 'reaper_capital', count: 125 }, { classId: 'reaper_destroyer', count: 375 }] },
      ],
    });
    const b = app.battle; b.paused = true;
    // Non-lethal acceptance control: real weapons, arcs, heat, ammo and motion.
    for (const ship of b.sim.ships) for (const weapon of ship.weapons) weapon.def = { ...weapon.def, damage: 0 };
    b.overlay.visible = true; app.prefs.overlayDetail = 'fleets';
    b.view.rig.focus.set(0, 0, 0); b.view.rig.distance = 1900;
    b.view.rig.pitch = .8; b.view.rig.yaw = .2;
    const ships = b.sim.ships.filter((s: any) => s.side === 'A').sort((a: any, c: any) => c.pos.z - a.pos.z);
    return { rear: ships.slice(Math.ceil(ships.length * 2 / 3)).map((s: any) => s.id),
      width: Math.max(...ships.map((s: any) => s.pos.x)) - Math.min(...ships.map((s: any) => s.pos.x)) };
  });
  // Keep browser commands bounded even on software rendering/slow CI CPUs.
  for (let time = 20; time <= 120; time += 20) await page.evaluate(until => {
    const sim = (window as any).reaperwar.battle.sim;
    while (sim.time < until - 1e-6 && !sim.finished) sim.step();
  }, time);
  const result = await page.evaluate(({ rear, width }) => {
    const b = (window as any).reaperwar.battle, sim = b.sim;
    const fired = new Set(sim.events.filter((e: any) => e.type === 'weapon_fired' &&
      sim.getShip(e.shipId)?.weapons.some((w: any) => w.def.id === e.weaponId && w.def.antiCapital && !w.def.antiSmall))
      .map((e: any) => e.shipId));
    const ships = sim.ships.filter((s: any) => s.side === 'A');
    for (let n = 0; n < 2; n++) b.view.update(1, 1);
    b.hud.refresh(); b.view.render();
    return { time: sim.time, rearBatteries: rear.filter((id: string) => fired.has(id)).length, rearCount: rear.length,
      widthRetention: (Math.max(...ships.map((s: any) => s.pos.x)) - Math.min(...ships.map((s: any) => s.pos.x))) / width,
      finite: sim.ships.every((s: any) => [s.pos.x, s.pos.y, s.pos.z].every(Number.isFinite)),
      glError: b.view.renderer.getContext().getError() };
  }, cohorts);
  console.info('ENGAGEMENT_COVERAGE ' + JSON.stringify(result));
  await page.locator('#battle-canvas').screenshot({ path: info.outputPath('thousand-ship-overview-120s.png') });
  await info.attach('actual-engagement.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  await page.evaluate(ids => {
    const b = (window as any).reaperwar.battle;
    const ship = ids.map((id: string) => b.sim.getShip(id)).find((s: any) => s?.role === 'dreadnought') ?? b.sim.getShip(ids[0]);
    b.view.followId = ship.id; b.view.rig.setMode('follow'); b.view.rig.distance = 65;
    for (let n = 0; n < 2; n++) b.view.update(1, 1);
    b.view.render();
  }, cohorts.rear);
  await page.locator('#battle-canvas').screenshot({ path: info.outputPath('rear-capital-follow-120s.png') });
  expect(result.rearBatteries / result.rearCount).toBeGreaterThan(.75);
  expect(result.widthRetention).toBeGreaterThan(.8);
  expect(result.finite).toBe(true); expect(result.glError).toBe(0); expect(errors).toEqual([]);
});
