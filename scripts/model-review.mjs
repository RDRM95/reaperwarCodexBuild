/** Original model silhouette review against a running local build.
 * CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx/esm scripts/model-review.mjs [outDir] [baseURL]
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildCustomBattle } from '../src/scenarios/index.ts';
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
  const config = buildCustomBattle({ seed: 42, rulesId: 'prime_apex', environment: 'deep_space', startingDistanceKm: 70,
    sideA: { faction: 'alliance', name: 'Silhouettes', formation: 'line_abreast', counts: { alliance_dreadnought: 1, alliance_omaha: 1, alliance_cruiser: 1 } },
    sideB: { faction: 'reaper', name: 'Reaper silhouettes', formation: 'line_abreast', counts: { reaper_capital: 1, reaper_destroyer: 1, harbinger: 1 } } });
  await page.evaluate(cfg => { window.reaperwar.startBattle(cfg); window.reaperwar.battle.paused = true; }, config);
  for (const classId of ['alliance_dreadnought', 'alliance_omaha', 'alliance_cruiser', 'reaper_capital', 'reaper_destroyer', 'harbinger']) {
    await page.evaluate(id => {
      const b = window.reaperwar.battle;
      const ship = b.sim.ships.find(s => s.classId === id);
      b.select(ship.id); b.setCamera('follow');
      b.view.rig.distance = 470; b.view.rig.pitch = 0.18; b.view.rig.yaw = 2.25;
      b.hud.root.style.visibility = 'hidden'; b.overlay.visible = false;
      document.getElementById('overlay-canvas').style.visibility = 'hidden';
      for (let i = 0; i < 90; i++) b.view.update(1 / 60, 1);
      b.view.render();
    }, classId);
    await page.screenshot({ path: `${output}/${classId}.png` });
  }
  writeFileSync(`${output}/errors.json`, JSON.stringify(errors));
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Captured six original hull silhouettes with no runtime/WebGL errors.');
} finally { await browser.close(); }
