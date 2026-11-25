import { expect, test, type Page } from '@playwright/test';

/**
 * Owner's request, 25 Nov 2026: spacecraft interiors, first-person views, camera positioning, lighting, materials
 * and instrumentation; and of the interior, "its systems alliance ship not a plane cockpit".
 *
 * In the real game: the Cockpit camera on a warship stands on a modelled bridge, the tactical overlay is cut to
 * its windows, the arrow keys turn the head and it looks ahead again when they are let go, and the setting takes
 * the bridge away. A fighter keeps its canopy and a Reaper its optic.
 */
declare global { interface Window { reaperwar: any } } // eslint-disable-line @typescript-eslint/no-explicit-any

const view = (page: Page) => page.evaluate(() => {
  const b = window.reaperwar.battle, rig = b.view.rig, ship = b.sim.getShip(b.view.followId);
  const forward = rig.camera.getWorldDirection(rig.camera.position.clone());
  const cockpit = document.querySelector<HTMLElement>('.cockpit')!;
  return { mode: rig.mode as string, role: ship?.role as string | undefined, interior: b.view.interiorActive as boolean,
    aligned: ship ? forward.x * ship.heading.x + forward.y * ship.heading.y + forward.z * ship.heading.z : 0,
    data: cockpit.dataset.interior, style: cockpit.dataset.style, fov: rig.camera.fov as number,
    clip: document.getElementById('overlay-canvas')!.style.clipPath, frame: getComputedStyle(cockpit.querySelector('.cockpit-frame')!).backgroundImage };
});
const seat = (page: Page, pick: string) => page.evaluate((pick) => {
  const b = window.reaperwar.battle;
  const s = b.sim.ships.find(new Function('b', `return (s) => s.alive && (${pick})`)(b)); // eslint-disable-line no-new-func
  b.view.followId = s.id; b.setCamera('tactical'); b.setCamera('cockpit');
  return s.role as string;
}, pick);

test('the Cockpit camera on a warship stands on a modelled bridge', async ({ page }) => {
  test.slow();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.click('[data-menu="quick-battle"]');
  await page.click('[data-action="launch"]');
  await expect(page.locator('[data-action="pause"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => { const b = window.reaperwar.battle; return b.sim.ships.filter((s: any) => s.alive && s.role === 'fighter' && s.side === b.config.perspectiveSide).length; }), { timeout: 90_000 }).toBeGreaterThanOrEqual(1); // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.click('[data-action="pause"]');

  // 1. A dreadnought: a bridge round the camera, the flat frame gone, the overlay cut to the windows.
  expect(await seat(page, 's.role === "dreadnought" && s.side === b.config.perspectiveSide')).toBe('dreadnought');
  await expect.poll(async () => (await view(page)).interior, { timeout: 30_000 }).toBe(true);
  await expect.poll(async () => (await view(page)).data, { timeout: 30_000 }).toBe('modelled');
  const on = await view(page);
  expect(on.style).toBe('bridge');
  expect(on.frame).toBe('none');
  expect(on.clip).toMatch(/^path\(/);
  expect(on.aligned).toBeGreaterThan(0.999);
  // The wider lens is kept (it used to ease back to 50 degrees in a third of a second).
  await page.waitForTimeout(1500);
  expect((await view(page)).fov).toBeGreaterThan(65);

  // 2. The arrow keys turn the head; let go, it looks ahead again.
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await view(page)).aligned, { timeout: 30_000 }).toBeLessThan(0.6);
  await page.keyboard.up('ArrowRight');
  await expect.poll(async () => (await view(page)).aligned, { timeout: 30_000 }).toBeGreaterThan(0.999);

  // 3. The setting: off, the flat frame is back and the overlay is whole; on again, the bridge.
  await page.evaluate(() => { window.reaperwar.battle.view.settings.interiors = false; });
  await expect.poll(async () => (await view(page)).interior, { timeout: 30_000 }).toBe(false);
  await expect.poll(async () => (await view(page)).clip, { timeout: 30_000 }).toBe('');
  const off = await view(page);
  expect(off.data).toBe('flat');
  expect(off.frame).not.toBe('none');
  await page.evaluate(() => { window.reaperwar.battle.view.settings.interiors = true; });
  await expect.poll(async () => (await view(page)).interior, { timeout: 30_000 }).toBe(true);

  // 4. A fighter keeps its canopy and a Reaper its optic: no bridge.
  expect(await seat(page, 's.role === "fighter" && s.faction !== "reaper"')).toBe('fighter');
  await expect.poll(async () => (await view(page)).style, { timeout: 30_000 }).toBe('canopy');
  expect((await view(page)).interior).toBe(false);
  await seat(page, 's.faction === "reaper" && s.role !== "fighter"');
  await expect.poll(async () => (await view(page)).style, { timeout: 30_000 }).toBe('optic');
  expect((await view(page)).interior).toBe(false);
  expect((await view(page)).clip).toBe('');

  // 5. Another camera: the bridge is gone with the seat.
  await seat(page, 's.role === "cruiser" && s.side === b.config.perspectiveSide');
  await expect.poll(async () => (await view(page)).interior, { timeout: 30_000 }).toBe(true);
  await page.keyboard.press('1');
  await expect.poll(async () => (await view(page)).interior, { timeout: 30_000 }).toBe(false);
  expect(errors).toEqual([]);
});
