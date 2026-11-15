import { expect, test } from '@playwright/test';

/**
 * Owner's request, 15 Nov 2026: "unique hud and ui for each faction".
 *
 * The battle interface is the console of the fleet in command: its colours, the cut of its panels, its banner and its
 * words. The same battle seen from the other side is a different console over the same layout.
 */
declare global { interface Window { reaperwar: any } } // eslint-disable-line @typescript-eslint/no-explicit-any

test('the interface is the console of the fleet in command, and changes with the side that commands', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await page.click('[data-menu="quick-battle"]');
  await page.click('[data-action="launch"]');
  await expect(page.locator('[data-action="pause"]')).toBeVisible();

  const console_ = () => page.evaluate(() => {
    const hud = document.querySelector<HTMLElement>('.hud')!;
    const panel = hud.querySelector<HTMLElement>('.hud-right .panel')!;
    const heading = hud.querySelector<HTMLElement>('.hud-right .panel-title')!;
    const banner = hud.querySelector<HTMLElement>('[data-hud="faction-banner"]')!;
    const top = hud.querySelector<HTMLElement>('.hud-top')!;
    const firstPanel = hud.querySelector<HTMLElement>('.hud-left .panel')!;
    const lowest = Math.max(...[...top.children].filter((c) => c.getBoundingClientRect().left < 320).map((c) => c.getBoundingClientRect().bottom));
    return {
      faction: hud.dataset.faction,
      commanding: window.reaperwar.battle.sim.fleets.get(window.reaperwar.battle.playerFleetIds[0]).spec.faction as string,
      banner: banner.querySelector('b')!.textContent,
      headings: [...hud.querySelectorAll('.panel-title')].map((t) => (t.firstChild as Text).textContent),
      headingColour: getComputedStyle(heading).color,
      panelCut: getComputedStyle(panel).clipPath,
      button: getComputedStyle(hud.querySelector<HTMLElement>('[data-action="pause"]')!).backgroundColor,
      // The banner sits under the top bar and over the fleet list, covering neither.
      bannerBelowTopBar: banner.getBoundingClientRect().top - lowest,
      listBelowBanner: firstPanel.getBoundingClientRect().top - banner.getBoundingClientRect().bottom,
    };
  });

  const alliance = await console_();
  expect(alliance.commanding).toBe('alliance');
  expect(alliance.faction).toBe('alliance');
  expect(alliance.banner).toBe('SYSTEMS ALLIANCE NAVY');
  expect(alliance.headings).toEqual(expect.arrayContaining(['FLEET ORDERS', 'HOSTILE CONTACTS', 'FLEET COMMUNICATIONS', 'CAMERA']));
  expect(alliance.headingColour).toBe('rgb(79, 163, 255)');
  expect(alliance.bannerBelowTopBar).toBeGreaterThanOrEqual(0);
  expect(alliance.listBelowBanner).toBeGreaterThanOrEqual(0);

  // The same battle commanded from the other side.
  await page.evaluate(() => {
    const app = window.reaperwar, config = app.battle.config;
    config.perspectiveSide = config.perspectiveSide === 'A' ? 'B' : 'A';
    app.startBattle(config);
  });
  await expect(page.locator('.hud[data-faction="reaper"]')).toBeVisible();
  const reaper = await console_();
  expect(reaper.commanding).toBe('reaper');
  expect(reaper.banner).toBe('HARVEST FLEET');
  expect(reaper.headings).toEqual(expect.arrayContaining(['DIRECTIVES', 'ORGANIC RESISTANCE', 'SIGNAL', 'OBSERVATION', 'HARVEST ASSESSMENT']));
  expect(reaper.headings).not.toContain('FLEET ORDERS');
  expect(reaper.headingColour).toBe('rgb(255, 59, 47)');
  expect(reaper.panelCut).not.toBe(alliance.panelCut);
  expect(reaper.button).not.toBe(alliance.button);
  expect(reaper.bannerBelowTopBar).toBeGreaterThanOrEqual(0);
  expect(reaper.listBelowBanner).toBeGreaterThanOrEqual(0);

  // The controls are the same controls: the Reaper console pauses the battle like any other.
  const paused = () => page.evaluate(() => window.reaperwar.battle.paused as boolean);
  const before = await paused();
  await page.click('[data-action="pause"]');
  expect(await paused()).toBe(!before);
});
