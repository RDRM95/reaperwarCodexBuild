import { expect, test } from '@playwright/test';
import type { App } from '../src/ui/app';

test('300+ simulated ships use GPU class batches while subjects keep original hero geometry', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-menu="quick-battle"]')).toBeVisible();
  const result = await page.evaluate(() => {
    const app = (window as unknown as { reaperwar: App }).reaperwar;
    app.startBattle({
      id: 'gpu-fidelity', name: 'GPU fleet check', scenarioId: 'custom',
      seed: 42, rules: app.getTimeline('canon_me3'), environment: 'deep_space',
      maxDuration: 120, perspectiveSide: 'A', objective: 'Validate spectator renderer',
      fleets: [
        { id: 'fleet-a', name: 'Alliance fleet', faction: 'alliance', side: 'A',
          playerControlled: true, ships: [{ classId: 'alliance_cruiser', count: 160 }],
          formation: 'line_abreast', position: { x: 0, y: 0, z: -35 },
          heading: { x: 0, y: 0, z: 1 } },
        { id: 'fleet-b', name: 'Reaper fleet', faction: 'reaper', side: 'B',
          playerControlled: false, ships: [{ classId: 'reaper_destroyer', count: 160 }],
          formation: 'strike_wedge', position: { x: 0, y: 0, z: 35 },
          heading: { x: 0, y: 0, z: -1 } }
      ]
    });
    const battle = app.battle!;
    battle.togglePause();
    const view = battle.view;
    const first = battle.sim.ships[0];
    view.selectedIds.add(first.id);
    view.followId = first.id;
    view.rig.setMode('follow');
    const time = battle.sim.time;
    const rng = battle.sim.rng.getState();
    for (let i = 0; i < 3; i++) view.update(1 / 60, .5);
    view.render();
    const meshInstances = view.instances.group.children
      .filter((x): x is import('three').InstancedMesh => (x as import('three').InstancedMesh).isInstancedMesh)
      .reduce((n, x) => n + x.count, 0);
    return {
      allShips: battle.sim.ships.length,
      heroCount: view.visuals.size,
      selectedHasHero: !!view.visuals.get(first.id)?.built.group.visible,
      meshInstances, frameDrawCalls: view.drawCalls,
      timeUnchanged: time === battle.sim.time,
      rngUnchanged: rng === battle.sim.rng.getState(),
      glError: view.renderer.getContext().getError()
    };
  });
  expect(result.allShips).toBe(320);
  expect(result.heroCount).toBeLessThan(result.allShips);
  expect(result.selectedHasHero).toBe(true);
  expect(result.meshInstances).toBeGreaterThan(0);
  expect(result.frameDrawCalls).toBeGreaterThan(0);
  expect(result.timeUnchanged).toBe(true);
  expect(result.rngUnchanged).toBe(true);
  expect(result.glError).toBe(0);
});
