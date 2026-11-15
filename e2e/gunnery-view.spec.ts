import { expect, test } from '@playwright/test';

/**
 * Owner's request, 15 Nov 2026: "more work on the first person modes and effects and quality".
 *
 * The first-person gunnery view as it was: its captions were printed across the camera panel's buttons (they sat at
 * fixed heights, and the top bar has grown since), the status line said the same thing twice, the charge bar ran
 * through the caption under it, and from a Reaper the camera sat inside its own beam.
 */
declare global { interface Window { reaperwar: any } } // eslint-disable-line @typescript-eslint/no-explicit-any

for (const size of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
  test(`at ${size.width} x ${size.height} the gun sight's captions cover nothing and say each thing once`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/');
    await page.click('[data-menu="quick-battle"]');
    await page.click('[data-action="launch"]');
    await expect(page.locator('[data-action="pause"]')).toBeVisible();
    // A dreadnought's gun station.
    await page.evaluate(() => {
      const b = window.reaperwar.battle;
      const ship = b.sim.ships.find((s: any) => s.alive && s.role === 'dreadnought' && s.side === b.config.perspectiveSide); // eslint-disable-line @typescript-eslint/no-explicit-any
      b.select(ship.id);
      b.view.followId = ship.id;
      b.setCamera('gunnery');
    });
    await expect(page.locator('.target-telemetry')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.querySelector<HTMLElement>('.target-telemetry')!.style.getPropertyValue('--gunnery-top'))).not.toBe('');
    await expect.poll(() => page.evaluate(() => document.querySelector('.gunnery-line')!.textContent!.length)).toBeGreaterThan(0);

    const found = await page.evaluate(() => {
      const box = (e: Element) => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
      const overlaps = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const panels = [...document.querySelectorAll('.hud-top > .panel, .hud-top > .btn')].map(box);
      const captions = ['.scope-top', '.gunnery-line'].map((s) => box(document.querySelector(s)!));
      const track = box(document.querySelector('.charge-track')!), under = box(document.querySelector('.scope-bottom')!);
      return {
        covered: captions.filter((c) => panels.some((p) => overlaps(c, p))).length,
        captionsOverlap: overlaps(captions[0], captions[1]),
        trackThroughCaption: overlaps(track, under),
        line: document.querySelector('.gunnery-line')!.textContent!,
        firstCaptionBelowBar: captions[0].top - Math.max(...panels.filter((p) => p.left < captions[0].right && captions[0].left < p.right).map((p) => p.bottom)),
      };
    });
    expect(found.covered).toBe(0);
    expect(found.captionsOverlap).toBe(false);
    expect(found.trackThroughCaption).toBe(false);
    expect(found.firstCaptionBelowBar).toBeGreaterThanOrEqual(0);
    expect(found.firstCaptionBelowBar).toBeLessThan(60); // under the bar, not half-way down the picture
    const parts = found.line.split(' · ');
    expect(new Set(parts).size).toBe(parts.length);
  });
}

test('from a Reaper the gun camera is above its beam, and its own beam is drawn narrower than anyone else sees it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.click('[data-menu="quick-battle"]');
  await page.click('[data-action="launch"]');
  await expect(page.locator('[data-action="pause"]')).toBeVisible();
  const seen = await page.evaluate(() => {
    const b = window.reaperwar.battle;
    b.paused = true;
    cancelAnimationFrame(b.raf);
    b.loop = () => {};
    const view = b.view;
    // Run the battle until a Reaper capital has its main beam on.
    let ship: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    for (let i = 0; i < 20 * 120 && !ship; i++) {
      b.sim.step();
      ship = b.sim.ships.find((s: any) => s.alive && s.role === 'reaper_capital' && s.weapons.some((w: any) => w.beamRemaining > 0.5 && w.def.kind === 'reaper_beam')); // eslint-disable-line @typescript-eslint/no-explicit-any
    }
    if (!ship) return null;
    const widths = (mode: string) => {
      view.followId = ship.id;
      b.setCamera(mode);
      view.gunneryLockedShipId = mode === 'gunnery' ? ship.id : undefined;
      for (let f = 0; f < 3; f++) view.update(1 / 60, 1);
      return view.effects.beamPool.filter((s: any) => s.core.visible).map((s: any) => +s.core.scale.x.toFixed(4)).sort(); // eslint-disable-line @typescript-eslint/no-explicit-any
    };
    const outside = widths('tactical');
    const sight = widths('gunnery');
    const cam = view.rig.camera;
    cam.updateMatrixWorld(true);
    // Where the camera is from where the gunner's own beam begins, along the hull's own up (a Reaper holds a roll,
    // so the hull's up is not the world's).
    const g = view.visuals.get(ship.id).built;
    g.group.updateMatrixWorld(true);
    const origin = g.group.localToWorld(g.muzzle.clone());
    const up = cam.position.clone().set(0, 1, 0).transformDirection(g.group.matrixWorld);
    return { outside, sight, above: cam.position.clone().sub(origin).dot(up), mode: view.rig.mode as string };
  });
  expect(seen, 'a Reaper capital fired its main beam within two minutes').not.toBeNull();
  expect(seen!.mode).toBe('gunnery');
  // The camera is above the emitter by more than the beam's glow (0.29 of a unit at full width).
  expect(seen!.above).toBeGreaterThan(0.4);
  // From the gun camera at least one beam (its own) is drawn narrower than the same beams from outside.
  expect(seen!.sight.length).toBe(seen!.outside.length);
  expect(Math.min(...seen!.sight)).toBeLessThan(Math.min(...seen!.outside) * 0.6);
  expect(Math.max(...seen!.sight)).toBeLessThanOrEqual(Math.max(...seen!.outside));
});
