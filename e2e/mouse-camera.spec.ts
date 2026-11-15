import { expect, test } from '@playwright/test';

/**
 * The mouse reaches the battle.
 *
 * The interface is a full-screen layer over the battle. Its own rule said to let the pointer through, and a broader
 * rule (`#ui > *`, an id selector) overrode it, so every drag, wheel turn and click over the battle went to the
 * interface layer and stopped there: the camera could not be turned or zoomed with the mouse and a ship could not be
 * picked by clicking it. No test used the mouse on the battle, so nothing failed.
 */
declare global { interface Window { reaperwar: any } } // eslint-disable-line @typescript-eslint/no-explicit-any

test('a drag turns the camera, the wheel zooms it, and a click on a ship selects it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.click('[data-menu="quick-battle"]');
  await page.click('[data-action="launch"]');
  await expect(page.locator('[data-action="pause"]')).toBeVisible();
  const rig = () => page.evaluate(() => {
    const r = window.reaperwar.battle.view.rig;
    return { mode: r.mode as string, yaw: r.yaw as number, pitch: r.pitch as number, distance: r.distance as number };
  });
  // What is under the pointer in the middle of the battle is the battle, not the interface.
  expect(await page.evaluate(() => document.elementFromPoint(640, 400)?.id)).toBe('battle-canvas');

  for (const level of ['full', 'minimal', 'none']) {
    expect(await page.evaluate(() => window.reaperwar.battle.hudLevel), level).toBe(level);
    const before = await rig();
    await page.mouse.move(640, 400);
    await page.mouse.down();
    await page.mouse.move(540, 360, { steps: 5 });
    await page.mouse.up();
    const turned = await rig();
    expect(Math.abs(turned.yaw - before.yaw), `${level}: drag`).toBeGreaterThan(0.2);
    expect(Math.abs(turned.pitch - before.pitch), `${level}: drag`).toBeGreaterThan(0.05);
    await page.mouse.wheel(0, 200);
    await expect.poll(async () => (await rig()).distance, { message: `${level}: wheel` }).toBeGreaterThan(turned.distance * 1.1);
    await page.mouse.wheel(0, -200);
    await page.keyboard.press('h');
  }
  // With no interface there is no pointer over the battle either.
  await page.keyboard.press('h');
  await page.keyboard.press('h');
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('battle-canvas')!).cursor)).toBe('none');
  await page.keyboard.press('h');

  // A click on a ship selects it. Pause so it stays where it was measured.
  await page.click('[data-action="pause"]');
  const target = await page.evaluate(() => {
    const b = window.reaperwar.battle;
    b.view.rig.camera.updateMatrixWorld(true);
    const w = innerWidth, h = innerHeight;
    // A friendly hull well inside the frame and clear of the interface's columns and bars.
    for (const ship of b.sim.ships) {
      if (!ship.alive || ship.role === 'fighter' || ship.side !== b.config.perspectiveSide) continue;
      const p = b.view.rig.camera.position.clone().set(ship.pos.x * 10, ship.pos.y * 10, ship.pos.z * 10).project(b.view.rig.camera);
      const x = (p.x + 1) / 2 * w, y = (1 - p.y) / 2 * h;
      if (p.z < 1 && x > 420 && x < 860 && y > 200 && y < 520 && document.elementFromPoint(x, y)?.id === 'battle-canvas') return { id: ship.id as string, x, y };
    }
    return null;
  });
  expect(target, 'a friendly hull in the middle of the frame').not.toBeNull();
  await page.mouse.click(target!.x, target!.y);
  const selected = await page.evaluate(() => [...window.reaperwar.battle.view.selectedIds] as string[]);
  expect(selected.length).toBe(1);

  // Following a ship: a drag looks round it and the wheel closes in.
  await page.keyboard.press('3');
  const following = await rig();
  expect(following.mode).toBe('follow');
  await page.mouse.move(640, 400);
  await page.mouse.down();
  await page.mouse.move(740, 400, { steps: 5 });
  await page.mouse.up();
  expect(Math.abs((await rig()).yaw - following.yaw)).toBeGreaterThan(0.2);
  await page.mouse.wheel(0, -200);
  await expect.poll(async () => (await rig()).distance).toBeLessThan(following.distance * 0.9);
});
