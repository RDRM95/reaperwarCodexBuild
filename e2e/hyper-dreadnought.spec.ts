import { expect, test } from '@playwright/test';
import type { App } from '../src/ui/app';

/**
 * Owner's request, 16 Nov 2026: hyper-dreadnoughts whose round is "like a nuke, area of effect", with a "unique
 * colour due to the speed and nature of the weapon".
 *
 * A Titan fires its KRONOS Lance at a Sovereign with destroyers round it, in the real game: the round is drawn in
 * its own colour, not tracer amber; the hit destroys the Sovereign; the blast catches the destroyers and is drawn.
 * A round can miss, so the gun is fired until one strikes.
 */
test('a KRONOS round is drawn violet, destroys the Sovereign it strikes and sets off a blast that is drawn', async ({ page }) => {
  test.slow();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('[data-menu="quick-battle"]')).toBeVisible();
  const seen = await page.evaluate(() => {
    const app = (window as unknown as { reaperwar: App }).reaperwar;
    app.startBattle({
      id: 'kronos-e2e', name: 'KRONOS Lance trial', scenarioId: 'custom', seed: 7,
      rules: app.getTimeline('prime_apex'), environment: 'deep_space', maxDuration: 240,
      perspectiveSide: 'A', objective: 'Fire the lance.',
      fleets: [
        { id: 'titan', name: 'Titan', faction: 'alliance', side: 'A', playerControlled: true,
          ships: [{ classId: 'alliance_titan', count: 1 }], formation: 'line_abreast', position: { x: 0, y: 0, z: -14 }, heading: { x: 0, y: 0, z: 1 } },
        { id: 'hostile', name: 'Reaper group', faction: 'reaper', side: 'B', playerControlled: false,
          ships: [{ classId: 'reaper_capital', count: 1 }, { classId: 'reaper_destroyer', count: 6 }], formation: 'line_abreast', position: { x: 0, y: 0, z: 14 }, heading: { x: 0, y: 0, z: -1 } },
      ],
    });
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const ctrl = app.battle! as any;
    ctrl.togglePause();
    const sim = ctrl.sim, view = ctrl.view;
    const events: any[] = []; const previous = sim.onEvent; sim.onEvent = (e: any) => { previous?.(e); events.push(e); };
    const titan = sim.ships.find((s: any) => s.classId === 'alliance_titan'), lance = titan.weapons.find((w: any) => w.def.id === 'kronos_lance');
    const sovereign = sim.ships.find((s: any) => s.role === 'reaper_capital');
    // The Reapers hold still and hold their fire, so the trial is of the round alone.
    for (const s of sim.ships) if (s.side === 'B') for (const w of s.weapons) w.def = { ...w.def, damage: 0 };
    lance.cooldown = 0; titan.aiTimer = 0;
    const tick = () => { sim.step(); view.update(0.05, 1); };
    const fired = () => events.find((e) => e.type === 'weapon_fired' && e.weaponId === 'kronos_lance');
    for (let i = 0; i < 1200 && !fired(); i++) tick();
    // The round in flight: its colour among the tracers drawn.
    let round: number[] | undefined;
    for (let i = 0; i < 40 && !round && !events.some((e) => e.type === 'blast'); i++) {
      tick();
      const mesh = view.effects.tracerMesh, colours = mesh.instanceColor?.array;
      const flying = sim.projectiles.some((p: any) => p.weapon.id === 'kronos_lance');
      if (flying && colours) for (let k = 0; k < mesh.count; k++) { const c = [colours[3 * k], colours[3 * k + 1], colours[3 * k + 2]]; if (c[2] > c[0] && c[0] > c[1]) round = c; }
    }
    // A round can miss. The gun is reloaded at once until one strikes.
    for (let i = 0; i < 2400 && !events.some((e) => e.type === 'blast'); i++) { lance.cooldown = 0; tick(); }
    const blast = events.find((e) => e.type === 'blast');
    const hit = events.find((e) => e.type === 'projectile_impact' && e.shipId === titan.id && e.damage > 100000);
    const struck = hit && sim.getShip(hit.targetId);
    const rings = view.effects.nuclearRingCount;
    view.render();
    return { fired: !!fired(), target: fired()?.targetId === sovereign.id, round, blast: blast && { caught: blast.caught, destroyed: blast.destroyed, radius: blast.radius },
      struck: struck && { role: struck.role, alive: struck.alive }, rings, ammo: lance.ammo, destroyersLeft: sim.ships.filter((s: any) => s.role === 'reaper_destroyer' && s.alive).length };
    /* eslint-enable @typescript-eslint/no-explicit-any */
  });
  expect(seen.fired).toBe(true);
  expect(seen.target).toBe(true);
  expect(seen.ammo).toBeLessThanOrEqual(4);
  // Violet: more blue than red, more red than green. Tracer amber is the other way round.
  expect(seen.round).toBeDefined();
  expect(seen.round![2]).toBeGreaterThan(seen.round![0]);
  expect(seen.round![0]).toBeGreaterThan(seen.round![1]);
  // What the round struck is destroyed by that one hit.
  expect(seen.struck).toEqual({ role: 'reaper_capital', alive: false });
  expect(seen.blast).toBeDefined();
  expect(seen.blast!.caught).toBeGreaterThanOrEqual(2);
  expect(seen.blast!.destroyed).toBeGreaterThanOrEqual(1);
  expect(seen.destroyersLeft).toBeLessThan(6);
  expect(seen.rings).toBeGreaterThanOrEqual(2);
  expect(errors).toEqual([]);
});
