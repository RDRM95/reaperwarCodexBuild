import { expect, test } from '@playwright/test';

test('Reaper reduced LOD keeps armour and eyes while nested lighting and stand-ins respect rig selection', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-menu="quick-battle"]')).toBeVisible();
  const records = await page.evaluate(() => {
    const app = (window as any).reaperwar;
    app.startBattle({ id: 'reaper-lod-browser', name: 'Reaper LOD regression', scenarioId: 'custom', seed: 42,
      rules: app.getTimeline('canon_me3'), environment: 'deep_space', maxDuration: 120, perspectiveSide: 'A', objective: 'Render regression',
      fleets: [
        { id: 'a', name: 'Scale ship', faction: 'alliance', side: 'A', ships: [{ classId: 'alliance_frigate', count: 1 }], formation: 'line_abreast', position: { x: 0, y: 0, z: -35 }, heading: { x: 0, y: 0, z: 1 } },
        { id: 'b', name: 'Reapers', faction: 'reaper', side: 'B', ships: [{ classId: 'reaper_capital', count: 1 }, { classId: 'harbinger', count: 1 }, { classId: 'reaper_destroyer', count: 1 }], formation: 'line_abreast', position: { x: 0, y: 0, z: 35 }, heading: { x: 0, y: 0, z: -1 } },
      ] });
    const battle = app.battle, view = battle.view;
    battle.paused = true; cancelAnimationFrame(battle.raf);
    const tick = battle.sim.tick, rng = battle.sim.rng.getState();
    const records: any[] = [];
    for (const classId of ['reaper_capital', 'harbinger', 'reaper_destroyer']) {
      const ship = battle.sim.ships.find((ship: any) => ship.classId === classId), visual = view.visuals.get(ship.id);
      const stages: any[] = [];
      for (const level of ['full', 'reduced', 'full']) {
        const length = visual.built.lengthUnits;
        view.selectedIds.clear(); view.followId = undefined;
        view.rig.camera.position.set(ship.pos.x * 10, ship.pos.y * 10, ship.pos.z * 10 + length * (level === 'full' ? 3 : 80));
        view.rig.camera.lookAt(ship.pos.x * 10, ship.pos.y * 10, ship.pos.z * 10);
        view.update(0, 1); view.render();
        const groups: Record<string, any[]> = { plates: [], eye: [], 'reaper-arm-seam': [], 'reaper-static-arms': [], 'reaper-static-seams': [] };
        visual.built.group.traverse((part: any) => { if (groups[part.name]) groups[part.name].push({ visible: part.visible, vertices: part.geometry?.attributes.position.count ?? 0 }); });
        stages.push({ requested: level, observed: visual.lod, groups, glError: view.renderer.getContext().getError() });
      }
      view.instances.begin(battle.sim.ships); view.instances.add(ship, 1, 'reduced'); view.instances.end();
      const batch: any[] = [];
      view.instances.group.traverse((part: any) => { if (part.isInstancedMesh && part.count) batch.push({ name: part.name, vertices: part.geometry.attributes.position.count, count: part.count }); });
      records.push({ classId, stages, batch });
    }
    return { records, simulationUnchanged: battle.sim.tick === tick && battle.sim.rng.getState() === rng };
  });
  expect(records.simulationUnchanged).toBe(true);
  for (const record of records.records) {
    for (const stage of record.stages) {
      expect(stage.observed).toBe(stage.requested);
      expect(stage.glError).toBe(0);
      expect(stage.groups.plates.length).toBeGreaterThan(0);
      expect(stage.groups.eye.length).toBeGreaterThan(0);
      expect(stage.groups.plates.every((part: any) => part.visible)).toBe(true);
      expect(stage.groups.eye.every((part: any) => part.visible)).toBe(true);
      expect(stage.groups['reaper-static-seams'].every((part: any) => !part.visible)).toBe(true);
      expect(stage.groups['reaper-static-arms'].every((part: any) => part.visible === (stage.requested === 'reduced'))).toBe(true);
      expect(stage.groups['reaper-arm-seam'].every((part: any) => part.visible === (stage.requested === 'full'))).toBe(true);
    }
    expect(record.batch.some((part: any) => part.name.endsWith('-plates'))).toBe(true);
    expect(record.batch.some((part: any) => part.name.endsWith('-eye'))).toBe(true);
    expect(record.batch.some((part: any) => /seam/.test(part.name))).toBe(false);
  }
});
