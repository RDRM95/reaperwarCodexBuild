import { expect, test, type Page } from '@playwright/test';

/**
 * Owner's request, 16 Nov 2026: "drag and select area for fleet movement and attack".
 *
 * With the real mouse on the real battle: Shift-drag marks our ships, Shift-right-drag marks enemies for the
 * selection to attack, a right-click on open space sends the selection's fleets there, B makes a plain drag mark an
 * area, and without any of those a drag still turns the camera.
 */
declare global { interface Window { reaperwar: any } } // eslint-disable-line @typescript-eslint/no-explicit-any

const AREA = { x0: 330, y0: 170, x1: 950, y1: 600 };

/** Ships of one side (ours or theirs) drawn inside AREA, by id. */
const inArea = (page: Page, ours: boolean) => page.evaluate(({ area, ours }) => {
  const b = window.reaperwar.battle;
  b.view.rig.camera.updateMatrixWorld(true);
  return b.sim.ships.filter((s: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!s.alive || s.escaped || s.role === 'fighter' || (s.side === b.config.perspectiveSide) !== ours) return false;
    const p = b.view.project(s.pos, innerWidth, innerHeight);
    return !!p && p.x >= area.x0 && p.x <= area.x1 && p.y >= area.y0 && p.y <= area.y1;
  }).map((s: any) => s.id as string).sort(); // eslint-disable-line @typescript-eslint/no-explicit-any
}, { area: AREA, ours });
const selected = (page: Page) => page.evaluate(() => [...window.reaperwar.battle.view.selectedIds].sort() as string[]);
const drag = async (page: Page, button: 'left' | 'right', modifier?: 'Shift' | 'Control') => {
  if (modifier) await page.keyboard.down(modifier);
  await page.mouse.move(AREA.x0, AREA.y0);
  await page.mouse.down({ button });
  await page.mouse.move((AREA.x0 + AREA.x1) / 2, (AREA.y0 + AREA.y1) / 2, { steps: 4 });
  await page.mouse.move(AREA.x1, AREA.y1, { steps: 4 });
};
const release = async (page: Page, button: 'left' | 'right', modifier?: 'Shift' | 'Control') => {
  await page.mouse.up({ button });
  if (modifier) await page.keyboard.up(modifier);
};

test('an area dragged on the battle selects ships, orders an attack on a group, and a right-click sends the fleet', async ({ page }) => {
  test.slow();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.click('[data-menu="quick-battle"]');
  await page.click('[data-action="launch"]');
  await expect(page.locator('[data-action="pause"]')).toBeVisible();
  await page.click('[data-action="pause"]');
  // The whole battle in frame, from above, so both fleets are inside the area.
  await page.evaluate(() => {
    const b = window.reaperwar.battle, rig = b.view.rig, ships = b.sim.ships.filter((s: any) => s.alive && s.role !== 'fighter'); // eslint-disable-line @typescript-eslint/no-explicit-any
    const mid = (k: 'x' | 'y' | 'z') => ships.reduce((n: number, s: any) => n + s.pos[k], 0) / ships.length * 10; // eslint-disable-line @typescript-eslint/no-explicit-any
    rig.setMode('tactical'); rig.focus.set(mid('x'), mid('y'), mid('z')); rig.pitch = 1.2; rig.distance = 1500;
    for (let i = 0; i < 80; i++) b.view.update(1 / 30, 1);
  });
  for (const corner of [[AREA.x0, AREA.y0], [AREA.x1, AREA.y1]]) expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.id, corner)).toBe('battle-canvas');
  const ours = await inArea(page, true), theirs = await inArea(page, false);
  expect(ours.length).toBeGreaterThanOrEqual(3);
  expect(theirs.length).toBeGreaterThanOrEqual(2);

  // 1. Shift-drag: a frame is drawn while dragging, and on release the ships of ours inside it are selected.
  await drag(page, 'left', 'Shift');
  const frame = await page.evaluate(() => { const e = document.querySelector<HTMLElement>('.select-box')!; const r = e.getBoundingClientRect(); return { shown: getComputedStyle(e).display !== 'none', kind: e.className, w: r.width, h: r.height, takesPointer: getComputedStyle(e).pointerEvents }; });
  expect(frame.shown).toBe(true);
  expect(frame.kind).toContain('select');
  expect(frame.w).toBeGreaterThan(AREA.x1 - AREA.x0 - 4);
  expect(frame.h).toBeGreaterThan(AREA.y1 - AREA.y0 - 4);
  expect(frame.takesPointer).toBe('none');
  await release(page, 'left', 'Shift');
  expect(await selected(page)).toEqual(ours);
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.select-box')!).display)).toBe('none');

  // 2. Shift-right-drag: the selection is ordered onto the enemies inside the area, shared among them.
  await drag(page, 'right', 'Shift');
  expect(await page.evaluate(() => document.querySelector('.select-box')!.className)).toContain('attack');
  await release(page, 'right', 'Shift');
  const orders = await page.evaluate(() => { const b = window.reaperwar.battle; return [...b.view.selectedIds].map((id: any) => b.sim.getShip(id).forcedTargetId as string | undefined); }); // eslint-disable-line @typescript-eslint/no-explicit-any
  expect(orders.every((id) => !!id && theirs.includes(id))).toBe(true);
  // Shared: no enemy has more than its share of the selection (and one more for a remainder).
  const most = Math.max(...theirs.map((id) => orders.filter((o) => o === id).length));
  expect(most).toBeLessThanOrEqual(Math.ceil(ours.length / theirs.length) + 1);
  expect(new Set(orders).size).toBeGreaterThan(1);

  // 3. A right-click on open space sends the selection's fleets to that point on their own level.
  const open = await page.evaluate(({ area }) => {
    const b = window.reaperwar.battle;
    for (let y = area.y0 + 20; y < area.y1; y += 30) for (let x = area.x0 + 20; x < area.x1; x += 30) {
      if (document.elementFromPoint(x, y)?.id === 'battle-canvas' && !b.view.pick(x, y, innerWidth, innerHeight)) return { x, y };
    }
    return null;
  }, { area: AREA });
  expect(open).not.toBeNull();
  await page.mouse.click(open!.x, open!.y, { button: 'right' });
  const moved = await page.evaluate(({ x, y }) => {
    const b = window.reaperwar.battle, ships = [...b.view.selectedIds].map((id: any) => b.sim.getShip(id)); // eslint-disable-line @typescript-eslint/no-explicit-any
    const fleets = [...new Set(ships.map((s: any) => s.fleetId as string))].map((id) => b.sim.fleets.get(id)); // eslint-disable-line @typescript-eslint/no-explicit-any
    const level = ships.reduce((n: number, s: any) => n + s.pos.y, 0) / ships.length; // eslint-disable-line @typescript-eslint/no-explicit-any
    const expected = b.view.pointOnLevel(x, y, innerWidth, innerHeight, level);
    return { orders: fleets.map((f: any) => ({ order: f.orders.order as string, position: f.orders.position })), expected, forced: ships.filter((s: any) => s.forcedTargetId).length }; // eslint-disable-line @typescript-eslint/no-explicit-any
  }, open!);
  expect(moved.orders.length).toBeGreaterThanOrEqual(1);
  for (const o of moved.orders) {
    expect(o.order).toBe('defend_position');
    for (const k of ['x', 'y', 'z'] as const) expect(Math.abs(o.position[k] - moved.expected[k])).toBeLessThan(1e-6);
  }
  // A new fleet order clears the ships' forced targets.
  expect(moved.forced).toBe(0);
  await expect(page.locator('.order-ping')).toHaveCount(0, { timeout: 5000 });

  // 4. Without a modifier a drag still turns the camera and selects nothing; with B on, it marks an area.
  await page.mouse.click(open!.x, open!.y);
  expect(await selected(page)).toEqual([]);
  const yaw = () => page.evaluate(() => window.reaperwar.battle.view.rig.yaw as number);
  const before = await yaw();
  await drag(page, 'left');
  await release(page, 'left');
  expect(Math.abs(await yaw() - before)).toBeGreaterThan(0.2);
  expect(await selected(page)).toEqual([]);
  await page.keyboard.press('b');
  expect(await page.evaluate(() => window.reaperwar.battle.areaMode)).toBe(true);
  const held = await yaw();
  await drag(page, 'left');
  await release(page, 'left');
  expect(await yaw()).toBe(held);
  expect((await selected(page)).length).toBeGreaterThanOrEqual(1);
  expect(await selected(page)).toEqual(await inArea(page, true));
  await page.keyboard.press('b');
  expect(await page.evaluate(() => window.reaperwar.battle.areaMode)).toBe(false);
  expect(errors).toEqual([]);
});
