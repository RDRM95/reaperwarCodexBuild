/** Original model silhouette review against a running local build.
 * CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx/esm scripts/model-review.mjs [outDir] [baseURL]
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildCustomBattle } from '../src/scenarios/index.ts';
import { CROSSOVER_SHIPS } from '../src/data/crossover.ts';
import { SANDBOX_SHIPS } from '../src/data/auFactions.ts';
const output = process.argv[2] ?? 'e2e-screenshots/models';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
  headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && /webgl|three|shader|program/i.test(m.text())) errors.push(m.text()); });
  await page.goto(process.argv[3] ?? 'http://127.0.0.1:4173');
  await page.waitForSelector('[data-menu="quick-battle"]');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('boot')).opacity === '0');
  const crossover = ['crossover', 'au'].includes(process.argv[4]);
  const catalogue = process.argv[4] === 'au' ? { ...CROSSOVER_SHIPS, ...SANDBOX_SHIPS } : CROSSOVER_SHIPS;
  const classIds = crossover ? Object.keys(catalogue) : ['alliance_dreadnought', 'alliance_omaha', 'alliance_cruiser', 'reaper_capital', 'reaper_destroyer', 'harbinger'];
  const factions = [...new Set(Object.values(catalogue).map(ship => ship.faction))];
  const fleets = factions.map(faction => ({ faction, name: `${faction} silhouettes`, formation: 'line_abreast',
    counts: Object.fromEntries(Object.values(catalogue).filter(ship => ship.faction === faction).map(ship => [ship.id, 1])) }));
  const config = crossover ? buildCustomBattle({ seed: 42, rulesId: 'multiverse_crossover', environment: 'deep_space', startingDistanceKm: 120, maxDuration: 180,
    sideA: fleets[0], sideB: fleets[1],
    extraA: fleets.filter((_, i) => i > 1 && i % 2 === 0),
    extraB: fleets.filter((_, i) => i > 1 && i % 2 === 1),
  }) : buildCustomBattle({ seed: 42, rulesId: 'prime_apex', environment: 'deep_space', startingDistanceKm: 70,
    sideA: { faction: 'alliance', name: 'Silhouettes', formation: 'line_abreast', counts: { alliance_dreadnought: 1, alliance_omaha: 1, alliance_cruiser: 1 } },
    sideB: { faction: 'reaper', name: 'Reaper silhouettes', formation: 'line_abreast', counts: { reaper_capital: 1, reaper_destroyer: 1, harbinger: 1 } } });
  await page.evaluate(cfg => { window.reaperwar.startBattle(cfg); window.reaperwar.battle.paused = true; }, config);
  for (const classId of classIds) {
    await page.evaluate(id => {
      const b = window.reaperwar.battle;
      const ship = b.sim.ships.find(s => s.classId === id);
      if (!ship) throw new Error(`Missing review hull: ${id}`);
      b.select(ship.id); b.setCamera('follow');
      b.view.rig.distance = 470; b.view.rig.pitch = 0.18; b.view.rig.yaw = 2.25;
      b.hud.root.style.visibility = 'hidden'; b.overlay.visible = false;
      document.getElementById('overlay-canvas').style.visibility = 'hidden';
      for (let i = 0; i < 90; i++) b.view.update(1 / 60, 1);
      b.view.render();
    }, classId);
    await page.screenshot({ path: `${output}/${classId}.png` });
  }
  if (crossover) {
    const samples = [];
    for (const time of [30, 90]) {
      samples.push(await page.evaluate(t => {
        const b = window.reaperwar.battle;
        while (!b.sim.finished && b.sim.time < t) { b.sim.step(); b.view.update(0.05, 1); if (b.sim.tick % 20 === 0) b.view.render(); }
        b.setCamera('cinematic');
        for (let i = 0; i < 120; i++) b.view.update(1 / 60, 1);
        b.view.render();
        return { time: b.sim.time, shots: b.sim.events.filter(e => e.type === 'weapon_fired').length,
          macroShots: b.sim.events.filter(e => e.type === 'weapon_fired' && e.weaponId.startsWith('wh_macro')).length,
          alive: b.sim.ships.filter(s => s.alive).length, glError: b.view.renderer.getContext().getError() };
      }, time));
      await page.screenshot({ path: `${output}/crossover-combat-${time}s.png` });
    }
    writeFileSync(`${output}/telemetry.json`, JSON.stringify(samples, null, 2));
    if (samples.some(s => s.glError)) throw new Error('WebGL error in crossover combat');
  }
  writeFileSync(`${output}/errors.json`, JSON.stringify(errors));
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Captured ${classIds.length} original hull silhouettes${crossover ? ' and crossover combat' : ''} with no runtime/WebGL errors.`);
} finally { await browser.close(); }
