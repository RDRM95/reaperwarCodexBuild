/** Simulation on the drawing thread against simulation in a worker, in the real app.
 *
 *   npx vite preview --port 4191 --strictPort
 *   node --import tsx/esm scripts/sim-thread-benchmark.mjs <baseURL> <repoRoot> [scales] [seconds]
 *
 * Runs the same battle in both modes with the app's own frame loop and reports, for each: how much time the
 * drawing thread spent on the simulation's behalf (stepping it inline, or applying the worker's snapshots), per
 * simulated tick and at worst in one frame; frames drawn; and the simulated time reached in the wall time given.
 * Cloud Chromium with SwiftShader draws slowly, so frame counts here say nothing about a hardware GPU; the
 * drawing-thread milliseconds are what moves between modes. Set REAPERWAR_PLAYWRIGHT to a matching Playwright module
 * when the project's own does not match the installed browser.
 */
const { chromium } = await import(process.env.REAPERWAR_PLAYWRIGHT ?? '@playwright/test');
import path from 'node:path';
const [base, root, scalesArg, secondsArg] = process.argv.slice(2);
const scales = (scalesArg ?? '3,12').split(',').map(Number), seconds = Number(secondsArg ?? 20);
const { buildCustomBattle } = await import(path.join(root, 'src/scenarios/index.ts'));
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
for (const scale of scales) for (const mode of ['main', 'worker']) {
  const page = await browser.newPage({ viewport: { width: Number(process.env.WIDTH ?? 1280), height: Number(process.env.HEIGHT ?? 720) } }); page.setDefaultTimeout(900000);
  page.on('pageerror', (e) => errors.push(`${mode}: ${e.message}`));
  await page.goto(base);
  await page.waitForSelector('[data-menu="quick-battle"]');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('boot')).opacity === '0');
  const config = buildCustomBattle({ seed: 42, rulesId: 'prime_apex', environment: 'deep_space', startingDistanceKm: 60, maxDuration: 600,
    sideA: { faction: 'alliance', name: 'Alliance line', formation: 'line_abreast', counts: { alliance_dreadnought: 6 * scale, alliance_cruiser: 18 * scale, alliance_frigate: 30 * scale } },
    sideB: { faction: 'reaper', name: 'Reaper pressure', formation: 'strike_wedge', counts: { reaper_capital: 8 * scale, reaper_destroyer: 30 * scale } } });
  await page.evaluate(({ cfg, mode }) => {
    const app = window.reaperwar; app.prefs.simulationThread = mode; app.prefs.graphics.bloom = false; app.prefs.graphics.quality = 'low';
    app.startBattle(cfg); const b = app.battle;
    const m = window.__m = { simMs: 0, worstFrameMs: 0, frames: 0, frameMs: 0, remote: !!b.remote };
    // Time what the drawing thread does for the simulation: inline steps, or applying the worker's snapshots.
    let inFrame = 0;
    if (b.remote) { const advance = b.remote.advance.bind(b.remote); b.remote.advance = (...a) => { const t = performance.now(); const r = advance(...a); inFrame += performance.now() - t; return r; }; }
    else { const step = b.sim.step.bind(b.sim); b.sim.step = () => { const t = performance.now(); step(); inFrame += performance.now() - t; }; }
    const loop = b.loop; b.loop = (now) => { inFrame = 0; const t = performance.now(); loop(now); m.frameMs += performance.now() - t; m.frames++; m.simMs += inFrame; m.worstFrameMs = Math.max(m.worstFrameMs, inFrame); };
  }, { cfg: config, mode });
  await page.waitForTimeout(seconds * 1000);
  const out = await page.evaluate(() => { const b = window.reaperwar.battle, m = window.__m;
    return { remote: m.remote, ships: b.sim.ships.length, tick: b.sim.tick, simulatedSeconds: +b.sim.time.toFixed(1), frames: m.frames,
      drawingThreadMsPerTick: +(m.simMs / Math.max(1, b.sim.tick)).toFixed(2), worstFrameMs: +m.worstFrameMs.toFixed(1), meanFrameScriptMs: +(m.frameMs / Math.max(1, m.frames)).toFixed(1),
      alive: b.sim.ships.filter((s) => s.alive).length, visuals: b.view.visuals.size, events: b.sim.events.length }; });
  console.log(JSON.stringify({ scale, mode, ...out }));
  await page.close();
}
console.log('errors:', errors.length ? errors.join(' | ') : 'none');
await browser.close();
