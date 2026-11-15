import { expect, test } from '@playwright/test';

/**
 * Owner's requests, 15 Nov 2026: "a way to add theatre mode" and "a free camera i can move in any direction with
 * mouse".
 *
 * Theatre mode shows the battle and nothing else, between cinema bars, for watching and recording; a strip of
 * controls comes up when the mouse moves and goes, with the pointer, when it rests. The free camera is flown by the
 * mouse: drag to look, wheel to fly along the view, middle-drag to slide.
 */
declare global { interface Window { reaperwar: any } } // eslint-disable-line @typescript-eslint/no-explicit-any

test('theatre mode shows the battle alone, its controls come and go with the mouse, and leaving puts everything back', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.click('[data-menu="quick-battle"]');
  await page.click('[data-action="launch"]');
  await expect(page.locator('[data-action="pause"]')).toBeVisible();
  const state = () => page.evaluate(() => {
    const b = window.reaperwar.battle;
    return { camera: b.view.rig.mode, hud: b.hudLevel, overlay: b.overlay.visible, paused: b.paused, speed: b.speed, theatre: b.inTheatre };
  });
  const before = await state();
  expect(before).toMatchObject({ camera: 'tactical', hud: 'full', theatre: false });

  // In from the interface's own button.
  await page.click('[data-action="theatre"]');
  await expect(page.locator('[data-screen="theatre"]')).toBeVisible();
  expect(await state()).toMatchObject({ camera: 'cinematic', hud: 'none', overlay: false, theatre: true, paused: before.paused, speed: before.speed });
  // Nothing of the interface is left on screen.
  for (const selector of ['.hud-top', '.hud-left', '.hud-right', '[data-action="pause"]']) await expect(page.locator(selector).first()).toBeHidden();
  // Cinema bars: a 1280 x 720 window framed at 2.39 to 1 has two bars of 92 px.
  const barHeight = () => page.locator('.theatre-bar.top').evaluate((e) => e.getBoundingClientRect().height);
  await expect.poll(barHeight, { timeout: 10_000 }).toBeGreaterThan(90);
  expect(await barHeight()).toBeLessThan(94);

  // The strip is up while the mouse moves, and goes with the pointer when it rests.
  await page.mouse.move(400, 300);
  await expect(page.locator('[data-theatre="strip"]')).toHaveCSS('opacity', '1');
  await expect.poll(() => page.evaluate(() => document.body.classList.contains('theatre-idle')), { timeout: 8000 }).toBe(true);
  await expect(page.locator('[data-theatre="strip"]')).toHaveCSS('opacity', '0');
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('battle-canvas')!).cursor)).toBe('none');
  await page.mouse.move(420, 320);
  await expect(page.locator('[data-theatre="strip"]')).toHaveCSS('opacity', '1');

  // Its controls work the battle: pause, speed, camera, bars. The pointer rests on the strip, which keeps it up
  // (frames are slow on a software renderer, and a click waits for two of them before it lands).
  const strip = (await page.locator('[data-theatre="strip"]').boundingBox())!;
  await page.mouse.move(strip.x + 4, strip.y + 4);
  await page.mouse.move(strip.x + 6, strip.y + 6);
  await page.waitForTimeout(3500);
  await expect(page.locator('[data-theatre="strip"]')).toHaveCSS('opacity', '1');
  await page.click('[data-theatre="pause"]');
  expect((await state()).paused).toBe(!before.paused);
  await page.click('[data-theatre="pause"]');
  await page.click('[data-theatre="faster"]');
  expect((await state()).speed).toBeGreaterThan(before.speed);
  await page.click('[data-theatre="slower"]');
  await page.click('[data-theatre-camera="free"]');
  expect((await state()).camera).toBe('free');
  await expect(page.locator('[data-theatre-camera="free"]')).toHaveClass(/active/);
  await page.click('[data-theatre="bars"]');
  await expect(page.locator('[data-theatre="bars"]')).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => page.locator('.theatre-bar.top').evaluate((e) => e.getBoundingClientRect().height)).toBeLessThan(1);

  // The free camera under the mouse: the wheel flies it along its view, a middle drag slides it.
  const camera = () => page.evaluate(() => {
    const c = window.reaperwar.battle.view.rig.camera;
    const d = c.getWorldDirection(c.position.clone());
    return { x: c.position.x, y: c.position.y, z: c.position.z, dx: d.x, dy: d.y, dz: d.z };
  });
  /** The camera once it has come to rest (it glides to where it is sent). */
  const atRest = async () => {
    let last = await camera();
    await expect.poll(async () => {
      await page.waitForTimeout(400);
      const now = await camera();
      const moved = Math.hypot(now.x - last.x, now.y - last.y, now.z - last.z);
      last = now;
      return moved;
    }, { timeout: 30_000 }).toBeLessThan(0.01);
    return last;
  };
  const start = await atRest();
  await page.mouse.move(640, 300);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(300);
  const flown = await atRest();
  const moved = { x: flown.x - start.x, y: flown.y - start.y, z: flown.z - start.z };
  const distance = Math.hypot(moved.x, moved.y, moved.z);
  expect(distance).toBeGreaterThan(1);
  expect((moved.x * start.dx + moved.y * start.dy + moved.z * start.dz) / distance).toBeGreaterThan(0.99); // along the view
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(760, 300, { steps: 6 });
  await page.mouse.up({ button: 'middle' });
  await page.waitForTimeout(300);
  const slid = await atRest();
  const side = { x: slid.x - flown.x, y: slid.y - flown.y, z: slid.z - flown.z };
  const sideways = Math.hypot(side.x, side.y, side.z);
  expect(sideways).toBeGreaterThan(0.5);
  expect(Math.abs(side.x * flown.dx + side.y * flown.dy + side.z * flown.dz) / sideways).toBeLessThan(0.05); // across the view
  // A drag with the left button turns it.
  await page.mouse.move(640, 300);
  await page.mouse.down();
  await page.mouse.move(540, 300, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const turned = await camera();
  expect(turned.dx * slid.dx + turned.dy * slid.dy + turned.dz * slid.dz).toBeLessThan(0.99);

  // Out with Esc: the interface is back as it was, the menu has not opened, and the free camera is kept.
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-screen="theatre"]')).toBeHidden();
  await expect(page.locator('[data-action="pause"]')).toBeVisible();
  expect(await state()).toMatchObject({ hud: 'full', theatre: false, camera: 'free', overlay: before.overlay, paused: before.paused, speed: before.speed });
  await expect(page.locator('.hud-menu')).toBeHidden();
  expect(await page.evaluate(() => document.body.classList.contains('theatre-on') || document.body.classList.contains('theatre-idle'))).toBe(false);

  // In and out with T: from the tactical camera the director takes over, and the tactical camera comes back.
  await page.keyboard.press('1');
  await page.keyboard.press('t');
  expect(await state()).toMatchObject({ camera: 'cinematic', hud: 'none', theatre: true });
  await page.keyboard.press('t');
  expect(await state()).toMatchObject({ camera: 'tactical', hud: 'full', theatre: false });
});
