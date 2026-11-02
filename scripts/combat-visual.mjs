/** Visual regression evidence against a running preview/dev server.
 * node --import tsx/esm scripts/combat-visual.mjs [outputDir] [baseUrl]
 * Optionally set CHROMIUM_EXECUTABLE_PATH to a system Chromium executable.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildCustomBattle } from '../src/scenarios/index.ts';
const output = process.argv[2] ?? 'e2e-screenshots/combat';
const base = process.argv[3] ?? 'http://127.0.0.1:4173';
mkdirSync(output, { recursive: true });
const config = buildCustomBattle({
  seed: 42, rulesId: 'prime_apex', environment: 'earth_orbit', startingDistanceKm: 65, maxDuration: 180,
  sideA: { faction: 'alliance', name: 'Omaha gun line', formation: 'line_abreast', counts: { alliance_omaha: 1, alliance_dreadnought: 6, alliance_cruiser: 8, alliance_frigate: 12 } },
  extraA: [{ faction: 'cerberus', name: 'Black Fleet', formation: 'defensive_screen', counts: { cerberus_dreadnought: 3, cerberus_cruiser: 4, cerberus_frigate: 6 } }],
  sideB: { faction: 'reaper', name: 'Reaper pressure', formation: 'strike_wedge', counts: { reaper_capital: 6, reaper_destroyer: 14 } },
});
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base);
  await page.waitForSelector('[data-menu="quick-battle"]');
  await page.evaluate(cfg => { window.reaperwar.startBattle(cfg); window.reaperwar.battle.paused = true; }, config);
  const samples = [];
  for (const time of [20, 50, 90]) {
    samples.push(await page.evaluate(t => {
      const b = window.reaperwar.battle;
      while (!b.sim.finished && b.sim.time < t) {
        b.sim.step();
        b.view.update(0.05, 1);
        if (b.sim.tick % 16 === 0) b.view.render();
      }
      b.setCamera('tactical');
      b.view.rig.distance = 430;
      b.view.rig.pitch = 0.38;
      b.view.rig.yaw = 0.6;
      b.hud.refresh();
      for (let i = 0; i < 90; i++) b.view.update(1 / 60, 1);
      b.view.render();
      return { time: b.sim.time, alive: b.sim.ships.filter(s => s.alive && !s.escaped).length,
        shots: b.sim.events.filter(e => e.type === 'weapon_fired').length,
        kills: b.sim.events.filter(e => e.type === 'ship_destroyed').length,
        reapersEscaped: b.sim.ships.filter(s => s.faction === 'reaper' && s.escaped).length,
        omaha: b.sim.ships.filter(s => s.classId === 'alliance_omaha').map(s => ({ alive: s.alive, pos: s.pos, shots: s.stats.shotsFired })) };
    }, time));
    await page.screenshot({ path: `${output}/combat-${time}s.png` });
    await page.evaluate(() => {
      const b = window.reaperwar.battle;
      b.hud.root.style.visibility = 'hidden';
      b.overlay.visible = false;
      document.getElementById('overlay-canvas').style.visibility = 'hidden';
    });
    await page.screenshot({ path: `${output}/combat-${time}s-clean.png` });
    if (time === 20) {
      const omaha = await page.evaluate(() => {
        const b = window.reaperwar.battle;
        const ship = b.sim.ships.find(s => s.classId === 'alliance_omaha' && s.alive);
        if (!ship) return false;
        b.view.followId = ship.id;
        b.select(ship.id); b.setCamera('follow');
        b.view.rig.distance = 500; b.view.rig.pitch = 0.25; b.view.rig.yaw = 0.4;
        for (let i = 0; i < 90; i++) b.view.update(1 / 60, 1);
        b.view.render(); return true;
      });
      if (omaha) await page.screenshot({ path: `${output}/omaha-follow.png` });
    }
    await page.evaluate(() => {
      const b = window.reaperwar.battle;
      b.hud.root.style.visibility = '';
      b.overlay.visible = true;
      document.getElementById('overlay-canvas').style.visibility = '';
    });
  }
  writeFileSync(`${output}/telemetry.json`, JSON.stringify({ samples, errors }, null, 2));
  console.log(JSON.stringify({ samples, errors }));
  if (errors.length) throw new Error('Browser errors during combat visualization');
} finally { await browser.close(); }
