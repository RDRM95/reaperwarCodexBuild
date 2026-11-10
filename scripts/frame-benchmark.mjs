/**
 * Per-frame CPU cost against ship count, in a real browser page against a running build.
 *
 *   npm run build && npx vite preview --port 4191 --strictPort
 *   node --import tsx/esm scripts/frame-benchmark.mjs [baseURL] [scales] [quality]
 *
 * For each fleet size it reports the JavaScript time of one simulation tick, of one view update and of one render
 * call (scene traversal and draw submission), with draw calls and triangles. Headless Chromium here uses software
 * rasterisation, so GPU time is not measured: these are the main-thread costs that cap the frame rate on any GPU.
 */
// REAPERWAR_PLAYWRIGHT may point at another Playwright build (one that matches the installed browser).
const { chromium } = await import(process.env.REAPERWAR_PLAYWRIGHT || '@playwright/test');
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const [base = 'http://127.0.0.1:4191', scales = '1,6,12,24', quality = 'high'] = process.argv.slice(2);
const { buildCustomBattle } = await import(path.join(here, '../src/scenarios/index.ts'));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined, headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.setDefaultTimeout(600000);
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
try {
  for (const scale of scales.split(',').map(Number)) {
    await page.goto(base);
    await page.waitForSelector('[data-menu="quick-battle"]');
    await page.waitForFunction(() => getComputedStyle(document.getElementById('boot')).opacity === '0');
    const config = buildCustomBattle({ seed: 42, rulesId: 'prime_apex', environment: 'deep_space', startingDistanceKm: 60, maxDuration: 600,
      sideA: { faction: 'alliance', name: 'Alliance line', formation: 'line_abreast', counts: { alliance_dreadnought: 6 * scale, alliance_cruiser: 18 * scale, alliance_frigate: 30 * scale } },
      sideB: { faction: 'reaper', name: 'Reaper pressure', formation: 'strike_wedge', counts: { reaper_capital: 8 * scale, reaper_destroyer: 30 * scale } } });
    const row = await page.evaluate(({ cfg, quality }) => {
      const app = window.reaperwar;
      app.prefs.graphics.quality = quality;
      // Bloom off, so the renderer's own counters describe the scene pass.
      app.prefs.graphics.bloom = false;
      app.startBattle(cfg); const b = app.battle; b.paused = true;
      cancelAnimationFrame(b.raf); b.loop = () => {};
      const mean = (xs) => xs.reduce((a, c) => a + c, 0) / xs.length;
      // Bring the fleets into contact so weapons, beams and effects are live, then measure.
      while (b.sim.time < 30) b.sim.step();
      for (let i = 0; i < 20; i++) { b.view.update(1 / 60, 0.5); b.view.render(); }
      const tick = [], update = [], render = [], hud = [];
      for (let i = 0; i < 40; i++) {
        let t = performance.now(); b.sim.step(); tick.push(performance.now() - t);
        for (let f = 0; f < 3; f++) {
          t = performance.now(); b.view.update(1 / 60, (f + 1) / 3); update.push(performance.now() - t);
          t = performance.now(); b.view.render(); render.push(performance.now() - t);
        }
        if (b.hud?.refresh) { t = performance.now(); b.hud.refresh(); hud.push(performance.now() - t); }
      }
      const info = b.view.renderer.info;
      return { ships: b.sim.ships.filter((s) => s.alive && !s.escaped).length, tickMs: +mean(tick).toFixed(2), viewUpdateMs: +mean(update).toFixed(2), renderMs: +mean(render).toFixed(2), hudMs: hud.length ? +mean(hud).toFixed(2) : null,
        drawCalls: b.view.drawCalls, triangles: info.render.triangles, lod: { ...b.view.lodCounts }, visuals: b.view.visuals.size };
    }, { cfg: config, quality });
    console.log(JSON.stringify(row));
  }
  if (errors.length) console.log('errors:', errors.join(' | '));
} finally { await browser.close(); }
