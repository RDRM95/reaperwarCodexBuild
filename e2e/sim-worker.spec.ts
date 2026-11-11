import { expect, test } from '@playwright/test';
import type { App } from '../src/ui/app';

/**
 * The simulation can run in a Web Worker, with the drawing thread showing a mirror of it (experimental setting,
 * off by default). This runs a small real battle that way through the app's own frame loop.
 */
test('a battle simulated in a worker runs, takes an order and reports its ships', async ({ page }) => {
  // CI draws with a software renderer, sometimes at under a frame a second, and the battle advances a few ticks a
  // frame. This test is about the worker stepping the battle and an order making the round trip, not about speed:
  // an earlier version waited for 41 ticks in 60 s and a slow runner reached 37.
  test.slow();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('[data-menu="quick-battle"]')).toBeVisible();
  const start = await page.evaluate(() => {
    const app = (window as unknown as { reaperwar: App }).reaperwar;
    app.prefs.simulationThread = 'worker';
    app.startBattle({
      id: 'sim-worker', name: 'Worker simulation exercise', scenarioId: 'custom', seed: 19,
      rules: app.getTimeline('prime_apex'), environment: 'deep_space', maxDuration: 180,
      perspectiveSide: 'A', objective: 'Run the simulation off the drawing thread.',
      fleets: [
        { id: 'line', name: 'Alliance line', faction: 'alliance', side: 'A', playerControlled: true,
          ships: [{ classId: 'alliance_dreadnought', count: 2 }, { classId: 'alliance_cruiser', count: 4 }], formation: 'line_abreast', position: { x: 0, y: 0, z: -30 }, heading: { x: 0, y: 0, z: 1 } },
        { id: 'hostile', name: 'Reapers', faction: 'reaper', side: 'B', playerControlled: false,
          ships: [{ classId: 'reaper_capital', count: 1 }, { classId: 'reaper_destroyer', count: 3 }], formation: 'line_abreast', position: { x: 0, y: 0, z: 30 }, heading: { x: 0, y: 0, z: -1 } },
      ],
    });
    const ctrl = app.battle! as unknown as { remote?: object; sim: { ships: unknown[]; tick: number } };
    // Ships are there on the first frame, before the worker has answered.
    return { remote: !!ctrl.remote, ships: ctrl.sim.ships.length, tick: ctrl.sim.tick };
  });
  expect(start.remote).toBe(true);
  expect(start.ships).toBe(10);
  expect(start.tick).toBe(0);

  // The worker steps the battle; the mirror on this thread follows it.
  await expect.poll(() => page.evaluate(() => (window as unknown as { reaperwar: App }).reaperwar.battle!.sim.tick), { timeout: 120_000 }).toBeGreaterThan(10);

  // An order goes to the worker and comes back as the simulation's own state and event.
  await page.evaluate(() => (window as unknown as { reaperwar: App }).reaperwar.battle!.order({ order: 'hold_formation' }));
  await expect.poll(() => page.evaluate(() => {
    const sim = (window as unknown as { reaperwar: App }).reaperwar.battle!.sim;
    return sim.fleets.get('line')!.orders.order === 'hold_formation' && sim.events.some(event => event.type === 'order_issued');
  }), { timeout: 90_000 }).toBe(true);

  const later = await page.evaluate(() => {
    const ctrl = (window as unknown as { reaperwar: App }).reaperwar.battle!;
    const moved = ctrl.sim.ships.filter(ship => Math.hypot(ship.vel.x, ship.vel.y, ship.vel.z) > 0).length;
    return { tick: ctrl.sim.tick, time: ctrl.sim.time, ships: ctrl.sim.ships.length, moved, events: ctrl.sim.events.length };
  });
  expect(later.tick).toBeGreaterThan(10);
  expect(later.time).toBeCloseTo(later.tick * 0.05, 6);
  expect(later.moved).toBeGreaterThan(0);
  expect(later.events).toBeGreaterThan(10);
  expect(errors).toEqual([]);
});
