/** Reaper death audio QA: which sounds a destroyed hull plays, and when, against a dev server.
 *
 *   npx vite --port 4191 --strictPort
 *   node --import tsx/esm scripts/reaper-death-audio-qa.mjs <devServerURL> <repoRoot>
 *
 * The battle is paused, each hull is marked destroyed and the simulation's own ship_destroyed event is delivered
 * for it (QA staging, never game behaviour); audio.play is replaced by a recorder, and the view is stepped for 8 s.
 * It needs the dev server because it imports the audio module the app itself uses. It records cues; it does not
 * listen to anything.
 */
import { chromium } from '@playwright/test';
import path from 'node:path';
const [base, root] = process.argv.slice(2);
const { buildCustomBattle } = await import(path.join(root, 'src/scenarios/index.ts'));
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(base);
  await page.waitForSelector('[data-menu="quick-battle"]');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('boot')).opacity === '0');
  const config = buildCustomBattle({ seed: 42, rulesId: 'canon_me3', environment: 'deep_space', startingDistanceKm: 40, maxDuration: 300,
    sideA: { faction: 'alliance', name: 'Fifth Fleet', formation: 'line_abreast', counts: { alliance_cruiser: 2, alliance_dreadnought: 1 } },
    sideB: { faction: 'reaper', name: 'Reapers', formation: 'line_abreast', counts: { reaper_capital: 1, reaper_destroyer: 1 } } });
  const result = await page.evaluate(async (cfg) => {
    const { audio } = await import('/src/audio/engine.ts');
    window.reaperwar.startBattle(cfg); const b = window.reaperwar.battle; b.paused = true;
    cancelAnimationFrame(b.raf); b.loop = () => {};
    for (let i = 0; i < 10; i++) b.view.update(1 / 30, 1);
    const calls = []; let clock = 0;
    audio.play = (id, distance, intensity) => { if (/explosion|reaper_death/.test(id)) calls.push({ id, at: +clock.toFixed(2), intensity }); };
    const out = {};
    for (const classId of ['reaper_capital', 'reaper_destroyer', 'alliance_dreadnought']) {
      const ship = b.sim.ships.find((s) => s.classId === classId);
      calls.length = 0; clock = 0;
      // QA staging: mark the hull destroyed and deliver the simulation's own event for it.
      ship.hull = 0; ship.alive = false;
      b.onSimEvent({ t: b.sim.time, type: 'ship_destroyed', shipId: ship.id, classId, faction: ship.faction, side: ship.side, name: ship.name, pos: { ...ship.pos }, role: ship.role });
      for (let i = 0; i < 8 * 30; i++) { clock += 1 / 30; b.view.update(1 / 30, 1); }
      out[classId] = calls.map((c) => ({ ...c }));
    }
    return out;
  }, config);
  console.log(JSON.stringify(result));
  console.log('errors:', errors.length ? errors.join(' | ') : 'none');
} finally { await browser.close(); }
