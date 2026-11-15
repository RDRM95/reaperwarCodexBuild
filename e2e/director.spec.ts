import { expect, test } from '@playwright/test';

/**
 * Owner's requests, 15 Nov 2026: "a cinematic camera that move" and "intelligent auto director camera".
 *
 * In the running game: every shot the director calls has a camera move, the camera really travels during it, what
 * the shot is of stays in the picture, and shots change by a cut.
 */
declare global { interface Window { reaperwar: any } } // eslint-disable-line @typescript-eslint/no-explicit-any

test('the director calls shots with camera moves, the camera travels, and its subject stays in the picture', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.click('[data-menu="quick-battle"]');
  await page.click('[data-action="launch"]');
  await expect(page.locator('[data-action="pause"]')).toBeVisible();
  await page.keyboard.press('2');

  // Drive the battle and the camera by hand, so that two minutes of it take a few seconds and the frames are even.
  const shots = await page.evaluate(() => {
    const b = window.reaperwar.battle;
    b.paused = true;
    cancelAnimationFrame(b.raf);
    b.loop = () => {};
    const view = b.view, cam = view.rig.camera;
    interface Shot { shot: number; kind: string; move: string; frames: number; travelled: number; reach: number; worst: number; behind: number; jump: number }
    const shots: Shot[] = [];
    let current: Shot | undefined, last = cam.position.clone(), start = cam.position.clone();
    for (let i = 0; i < 20 * 150 && !b.sim.finished; i++) {
      b.sim.step();
      for (let f = 0; f < 3; f++) {
        view.update(1 / 60, (f + 1) / 3);
        cam.updateMatrixWorld(true);
        const cine = view.cine;
        const ship = cine.fromId ? b.sim.getShip(cine.fromId) : undefined;
        if (!cine.move || !ship) continue;
        const jump = cam.position.distanceTo(last);
        if (!current || current.shot !== cine.shot) {
          current = { shot: cine.shot, kind: cine.kind ?? (cine.wreck ? 'wreck' : 'event'), move: cine.move.kind, frames: 0, travelled: 0, reach: 0, worst: 0, behind: 0, jump };
          shots.push(current);
          start = cam.position.clone();
        }
        // The hull the shot is of, where it is drawn this frame.
        const a = (f + 1) / 3;
        const at = cam.position.clone().set((ship.prevPos.x + (ship.pos.x - ship.prevPos.x) * a) * 10, (ship.prevPos.y + (ship.pos.y - ship.prevPos.y) * a) * 10, (ship.prevPos.z + (ship.pos.z - ship.prevPos.z) * a) * 10);
        current.reach = Math.max(current.reach, cam.position.distanceTo(at));
        // How far the camera has gone from where the shot began, measured from the hull it rides with.
        current.travelled = Math.max(current.travelled, cam.position.distanceTo(start));
        const q = at.clone().project(cam);
        if (ship.alive) {
          if (q.z >= 1) current.behind++;
          current.worst = Math.max(current.worst, Math.abs(q.x), Math.abs(q.y));
        }
        current.frames++;
        last = cam.position.clone();
      }
    }
    return shots;
  });

  expect(shots.length).toBeGreaterThan(6);
  // More than one kind of shot and at least three kinds of move in two and a half minutes of battle.
  expect(new Set(shots.map((s) => s.move)).size).toBeGreaterThanOrEqual(3);
  expect(new Set(shots.map((s) => s.kind)).size).toBeGreaterThanOrEqual(2);
  for (let i = 1; i < shots.length; i++) expect(shots[i].shot).toBeGreaterThan(shots[i - 1].shot);
  const whole = shots.filter((s) => s.frames >= 300); // shots that ran five seconds or more
  expect(whole.length).toBeGreaterThan(4);
  for (const s of whole) {
    const label = `shot ${s.shot} (${s.kind}, ${s.move})`;
    // The hull the shot is of is in front of the camera and inside the frame throughout.
    expect(s.behind, label).toBe(0);
    expect(s.worst, label).toBeLessThan(1);
    // The camera travelled. A flyby stands still; the hull does the travelling.
    if (s.move !== 'flyby') expect(s.travelled / s.reach, label).toBeGreaterThan(0.05);
    else expect(s.travelled, label).toBeLessThan(1e-6);
  }
});
