import { expect, test, type Page } from '@playwright/test';

/**
 * Owner's request, 16 Nov 2026: "trident fight/oculus fps view, cockpit or unique optic hud, fixed chase cams,
 * auto switch to new gunnary view, main canon view".
 *
 * In the real game: the Cockpit camera sits in the seat of a fighter and looks where it points, with a canopy over
 * the picture; an Oculus gets an optic; the Chase camera holds fixed places behind a ship and steps through them;
 * and the automatic gun camera cuts to a main cannon for its shot and back.
 */
declare global { interface Window { reaperwar: any } } // eslint-disable-line @typescript-eslint/no-explicit-any

const view = (page: Page) => page.evaluate(() => {
  const b = window.reaperwar.battle, rig = b.view.rig, ship = b.sim.getShip(b.view.followId);
  const forward = rig.camera.getWorldDirection(rig.camera.position.clone());
  const cockpit = document.querySelector<HTMLElement>('.cockpit')!;
  return { mode: rig.mode as string, role: ship?.role as string | undefined, faction: ship?.faction as string | undefined, id: ship?.id as string | undefined,
    aligned: ship ? forward.x * ship.heading.x + forward.y * ship.heading.y + forward.z * ship.heading.z : 0,
    distance: ship ? Math.hypot(rig.camera.position.x - ship.pos.x * 10, rig.camera.position.y - ship.pos.y * 10, rig.camera.position.z - ship.pos.z * 10) : -1,
    length: ship ? b.view.visuals.get(ship.id)?.built.lengthUnits ?? 0 : 0,
    overlay: { shown: getComputedStyle(cockpit).display !== 'none', style: cockpit.dataset.style, pointer: getComputedStyle(cockpit).pointerEvents, text: cockpit.textContent ?? '' },
    chase: rig.chaseIndex as number, fov: rig.camera.fov as number };
});

test('the cockpit, the fixed chase cameras and the automatic gun camera in a running battle', async ({ page }) => {
  test.slow();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.click('[data-menu="quick-battle"]');
  await page.click('[data-action="launch"]');
  await expect(page.locator('[data-action="pause"]')).toBeVisible();
  // Fighters are in flight a few seconds into the battle.
  await expect.poll(() => page.evaluate(() => { const b = window.reaperwar.battle; return b.sim.ships.filter((s: any) => s.alive && s.role === 'fighter' && s.side === b.config.perspectiveSide).length; }), { timeout: 90_000 }).toBeGreaterThanOrEqual(2); // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.click('[data-action="pause"]');

  // 1. The cockpit: nothing is followed, so the seat is a fighter's.
  await page.evaluate(() => { const b = window.reaperwar.battle; b.view.followId = undefined; b.view.selectedIds.clear(); });
  await page.keyboard.press('9');
  await expect(page.locator('[data-camera="cockpit"]')).toHaveClass(/active/);
  await expect.poll(async () => (await view(page)).overlay.text.length, { timeout: 30_000 }).toBeGreaterThan(10);
  const seat = await view(page);
  expect(seat.mode).toBe('cockpit');
  expect(seat.role).toBe('fighter');
  expect(seat.fov).toBeGreaterThan(50);
  expect(seat.overlay).toMatchObject({ shown: true, style: 'canopy', pointer: 'none' });
  expect(seat.overlay.text).toMatch(/SPD \d/);
  // In the hull, looking where it points.
  expect(seat.aligned).toBeGreaterThan(0.999);
  expect(seat.distance).toBeLessThan(seat.length);
  // Again: the next fighter.
  await page.keyboard.press('9');
  const next = await view(page);
  expect(next.role).toBe('fighter');
  expect(next.id).not.toBe(seat.id);
  // A drag does not turn it.
  await page.mouse.move(640, 400); await page.mouse.down(); await page.mouse.move(520, 340, { steps: 4 }); await page.mouse.up();
  expect((await view(page)).aligned).toBeGreaterThan(0.999);

  // 2. An Oculus is an eye: its view is an optic, in a Reaper's words.
  const oculus = await page.evaluate(() => { const b = window.reaperwar.battle; const o = b.sim.ships.find((s: any) => s.alive && s.role === 'fighter' && s.faction === 'reaper') ?? b.sim.ships.find((s: any) => s.alive && s.faction === 'reaper'); b.view.followId = o.id; b.setCamera('tactical'); b.setCamera('cockpit'); return o.role as string; }); // eslint-disable-line @typescript-eslint/no-explicit-any
  await expect.poll(async () => (await view(page)).overlay.style, { timeout: 30_000 }).toBe('optic');
  expect((await view(page)).overlay.text).toMatch(/INTEGRITY \d/);
  expect(['fighter', 'reaper_capital', 'reaper_destroyer']).toContain(oculus);

  // 3. The chase camera: fixed places behind a ship, stepped through by asking again; the overlay is gone.
  await page.evaluate(() => { const b = window.reaperwar.battle; const s = b.sim.ships.find((x: any) => x.alive && x.role === 'dreadnought' && x.side === b.config.perspectiveSide) ?? b.sim.ships.find((x: any) => x.alive && x.role !== 'fighter' && x.side === b.config.perspectiveSide); b.select(s.id); }); // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.keyboard.press('0');
  await expect(page.locator('[data-camera="chase"]')).toHaveClass(/active/);
  const tail = await view(page);
  expect(tail.mode).toBe('chase');
  expect(tail.overlay.shown).toBe(false);
  expect(tail.chase).toBe(0);
  await page.keyboard.press('0');
  expect((await view(page)).chase).toBe(1);
  await page.keyboard.press('0');
  expect((await view(page)).chase).toBe(2);

  // 4. The automatic gun camera, on a ship with a main cannon: a Reaper capital, whose beam reloads in nine seconds.
  // The battle stays paused and the gun is set a second and a half from ready with its target in range, so the
  // test does not depend on how a battle happens to go on a slow machine.
  const gun = (ready: number) => page.evaluate((ready) => {
    const b = window.reaperwar.battle, r = b.sim.getShip(b.view.gunneryLockedShipId ?? b.view.followId);
    const mount = r.weapons.find((w: any) => w.def.kind === 'reaper_beam' && w.def.antiCapital); // eslint-disable-line @typescript-eslint/no-explicit-any
    mount.cooldown = ready;
    return mount.def.cooldown as number;
  }, ready);
  await page.evaluate(() => {
    const b = window.reaperwar.battle, r = b.sim.ships.find((s: any) => s.alive && s.role === 'reaper_capital'); // eslint-disable-line @typescript-eslint/no-explicit-any
    const prey = b.sim.ships.find((s: any) => s.alive && s.side !== r.side && s.role !== 'fighter'); // eslint-disable-line @typescript-eslint/no-explicit-any
    r.targetId = prey.id;
    prey.pos = { x: r.pos.x + r.heading.x * 8, y: r.pos.y + r.heading.y * 8, z: r.pos.z + r.heading.z * 8 }; prey.prevPos = { ...prey.pos };
    b.view.followId = r.id; b.setCamera('follow');
  });
  expect(await gun(30)).toBeGreaterThanOrEqual(8);
  await page.keyboard.press('g');
  await expect(page.locator('[data-action="auto-gun-cam"]')).toHaveClass(/active/);
  expect(await page.evaluate(() => window.reaperwar.battle.autoGunCam)).toBe(true);
  // Reloading: no cut.
  await page.waitForTimeout(1500);
  expect((await view(page)).mode).toBe('follow');
  // Nearly ready: the view cuts to the gun sight by itself.
  await gun(0.8);
  await expect.poll(async () => (await view(page)).mode, { timeout: 30_000, message: 'cuts to the gun sight' }).toBe('gunnery');
  // The battle is paused, so the gun does not fire: after its patience the view goes back to where it was...
  await expect.poll(async () => (await view(page)).mode, { timeout: 40_000, message: 'and back' }).toBe('follow');
  // ...and does not cut in again while that gun still has not fired.
  await page.waitForTimeout(3000);
  expect((await view(page)).mode).toBe('follow');
  await page.keyboard.press('g');
  expect(await page.evaluate(() => window.reaperwar.battle.autoGunCam)).toBe(false);
  expect(errors).toEqual([]);
});
