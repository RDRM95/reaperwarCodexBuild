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
    interface Shot { shot: number; kind: string; move: string; frames: number; travelled: number; reach: number; worst: number; behind: number; outside: number; jump: number }
    const shots: Shot[] = [];
    // Where the camera is, measured from what it travels with (a flyby stands in space and has no such offset).
    const offset = () => (view.rig.riding ? view.rig.relPos.clone() : cam.position.clone());
    let current: Shot | undefined, last = cam.position.clone(), start = offset();
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
          current = { shot: cine.shot, kind: cine.kind ?? (cine.wreck ? 'wreck' : 'event'), move: cine.move.kind, frames: 0, travelled: 0, reach: 0, worst: 0, behind: 0, outside: 0, jump };
          shots.push(current);
          start = offset();
          current.reach = start.length();
        }
        // The hull the shot is of, where it is drawn this frame.
        const a = (f + 1) / 3;
        const at = cam.position.clone().set((ship.prevPos.x + (ship.pos.x - ship.prevPos.x) * a) * 10, (ship.prevPos.y + (ship.pos.y - ship.prevPos.y) * a) * 10, (ship.prevPos.z + (ship.pos.z - ship.prevPos.z) * a) * 10);
        // How far the camera has gone from where the shot began, in that frame.
        current.travelled = Math.max(current.travelled, offset().distanceTo(start));
        const q = at.clone().project(cam);
        if (ship.alive) {
          if (q.z >= 1) current.behind++;
          const off = Math.max(Math.abs(q.x), Math.abs(q.y));
          if (off > 1) current.outside++;
          current.worst = Math.max(current.worst, off);
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
    // The hull the shot is of is in front of the camera throughout and inside the frame. In a shot over a hull's
    // shoulder that hull is low in the foreground, and while two ships swing round each other its centre can touch
    // the edge for a moment: never far past it, and for no more than a twentieth of the shot.
    expect(s.behind, label).toBe(0);
    expect(s.worst, label).toBeLessThan(1.25);
    expect(s.outside / s.frames, label).toBeLessThan(0.05);
    // The camera travelled: by a share of its own distance from what it frames. A flyby stands still and the hull
    // does the travelling: all that moves that camera is a knock when a hull dies near it.
    if (s.move !== 'flyby') expect(s.travelled / s.reach, label).toBeGreaterThan(0.03);
    else expect(s.travelled, label).toBeLessThan(3);
  }
  // Taken together the moves are plain to see: half the shots carry the camera a tenth of its distance or more.
  const travel = whole.filter((s) => s.move !== 'flyby').map((s) => s.travelled / s.reach).sort((a, b) => a - b);
  expect(travel[Math.floor(travel.length / 2)]).toBeGreaterThan(0.1);
});
