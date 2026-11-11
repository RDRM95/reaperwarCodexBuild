import { expect, test } from '@playwright/test';
import type { App } from '../src/ui/app';

test('SR-2 keeps its gun and engine attachments in a 1,000-ship instanced battle', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-menu="quick-battle"]')).toBeVisible();
  const data = await page.evaluate(() => {
    const app = (window as unknown as { reaperwar: App }).reaperwar;
    app.startBattle({
      id: 'sr2-fleet-qa', name: 'SR-2 fleet QA', scenarioId: 'custom', seed: 42,
      rules: app.getTimeline('canon_me3'), environment: 'deep_space', maxDuration: 120,
      perspectiveSide: 'A', objective: 'Verify SR-2 rendering',
      fleets: [
        { id: 'a', name: 'SR-2', faction: 'alliance', side: 'A', playerControlled: true,
          ships: [{ classId: 'alliance_frigate_thanix', count: 500 }], formation: 'line_abreast',
          position: { x: 0, y: 0, z: -35 }, heading: { x: 0, y: 0, z: 1 } },
        { id: 'b', name: 'Reapers', faction: 'reaper', side: 'B', playerControlled: false,
          ships: [{ classId: 'reaper_destroyer', count: 500 }], formation: 'line_abreast',
          position: { x: 0, y: 0, z: 35 }, heading: { x: 0, y: 0, z: -1 } },
      ],
    });
    const b = app.battle!; b.paused = true;
    const subject = b.sim.ships[0]; b.select(subject.id); b.setCamera('follow');
    const time = b.sim.time, rng = b.sim.rng.getState();
    for (let i = 0; i < 3; i++) b.view.update(1 / 60, 1);
    b.view.render();
    const built = b.view.visuals.get(subject.id)!.built;
    const batches = b.view.instances.group.children
      .filter((o): o is import('three').InstancedMesh => (o as import('three').InstancedMesh).isInstancedMesh && o.name.startsWith('instanced-alliance_frigate_thanix-'));
    return { ships: b.sim.ships.length, muzzle: built.muzzle!.toArray(), engines: built.engineNodes.map(n => n.toArray()),
      batchParts: batches.length, instances: batches.reduce((n, m) => n + m.count, 0),
      heroCount: b.view.visuals.size, calls: b.view.drawCalls, glError: b.view.renderer.getContext().getError(),
      timeUnchanged: time === b.sim.time, rngUnchanged: rng === b.sim.rng.getState() };
  });
  expect(data.ships).toBe(1000);
  expect(data.muzzle).toEqual([0, -0.012, 1.068]);
  expect(data.engines).toHaveLength(4);
  expect(data.batchParts).toBe(5);
  expect(data.instances).toBeGreaterThan(0);
  expect(data.heroCount).toBeLessThan(1000);
  expect(data.calls).toBeGreaterThan(0);
  expect(data.glError).toBe(0);
  expect(data.timeUnchanged).toBe(true);
  expect(data.rngUnchanged).toBe(true);
  await test.info().attach('sr2-fleet-metrics', { body: JSON.stringify(data, null, 2), contentType: 'application/json' });
});
