import { expect, test } from '@playwright/test';
import type { App } from '../src/ui/app';

/** Regression: reused canvases retain UNPACK_FLIP_Y_WEBGL from canvas textures.
 * A new renderer's placeholder texImage3D calls require that flag to be reset. */
test('successive battle builds reuse the canvas without runtime or WebGL errors', async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /webgl|shader|three|program/i.test(message.text())) runtimeErrors.push(message.text());
  });
  await page.goto('/');
  await expect(page.locator('[data-menu="quick-battle"]')).toBeVisible();
  for (const [index, classId] of ['alliance_dreadnought', 'alliance_omaha', 'turian_dreadnought'].entries()) {
    const sample = await page.evaluate(({ index, classId }) => {
      const app = (window as unknown as { reaperwar: App }).reaperwar;
      app.startBattle({
        id: `lifecycle-${index}`, name: `Lifecycle battle ${index}`, scenarioId: 'custom', seed: 19 + index,
        rules: app.getTimeline('prime_apex'), environment: index === 1 ? 'earth_orbit' : 'deep_space', maxDuration: 120,
        perspectiveSide: 'A', objective: 'Render successive battle builds.',
        fleets: [
          { id: 'allied', name: 'Allied battery', faction: classId.startsWith('turian') ? 'turian' : 'alliance', side: 'A', playerControlled: true,
            ships: [{ classId, count: index + 1 }], formation: index === 1 ? 'strike_wedge' : 'line_abreast',
            position: { x: 0, y: 0, z: -30 }, heading: { x: 0, y: 0, z: 1 } },
          { id: 'hostile', name: 'Reaper target', faction: 'reaper', side: 'B', ships: [{ classId: 'reaper_capital', count: 1 }],
            formation: 'line_abreast', position: { x: 0, y: 0, z: 30 }, heading: { x: 0, y: 0, z: -1 } },
        ],
      });
      const battle = app.battle!;
      battle.paused = true;
      const gl = battle.view.renderer.getContext();
      const constructorError = gl.getError();
      battle.view.update(1 / 60, 1);
      battle.view.render();
      const result = {
        constructorError, frameError: gl.getError(), contextLost: gl.isContextLost(),
        drawCalls: battle.view.drawCalls, models: battle.view.visuals.size,
        builtModels: [...battle.view.visuals.values()].filter(visual => visual.built.group.children.length > 0).length,
      };
      app.show('menu');
      return { ...result, disposalError: gl.getError() };
    }, { index, classId });
    expect(sample.constructorError, `battle ${index}: renderer construction`).toBe(0);
    expect(sample.frameError, `battle ${index}: rendered frame`).toBe(0);
    expect(sample.disposalError, `battle ${index}: renderer disposal`).toBe(0);
    expect(sample.contextLost).toBe(false);
    expect(sample.drawCalls).toBeGreaterThan(0);
    expect(sample.models).toBe(index + 2);
    expect(sample.builtModels).toBe(sample.models);
  }
  expect(runtimeErrors).toEqual([]);
});
