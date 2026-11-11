/** Local-hardware profile QA: what the game draws when opened as the web build and as the local launcher opens it.
 *
 *   npm run build && npx vite preview --port 4191 --strictPort
 *   node --import tsx/esm scripts/local-gpu-profile-qa.mjs <baseURL> <repoRoot>
 *
 * Opens the same seeded battle twice on a 3x-density display: at "/" and at "/?profile=local-gpu". Reports the
 * preferences in force, the drawing buffer size, whether the simulation runs in a worker, and how many hulls are
 * drawn in full detail, hull only, or as a point from one fixed camera. Then clicks the Settings button and the
 * Custom Battle fleet-scaling buttons. Cloud Chromium with SwiftShader: this shows what is asked of the GPU, not
 * how fast a real one draws it. Set REAPERWAR_PLAYWRIGHT when the project's Playwright does not match the browser.
 */
const { chromium } = await import(process.env.REAPERWAR_PLAYWRIGHT ?? '@playwright/test');
import path from 'node:path';
const [base, root] = process.argv.slice(2);
const { buildCustomBattle } = await import(path.join(root, 'src/scenarios/index.ts'));
const config = buildCustomBattle({ seed: 42, rulesId: 'prime_apex', environment: 'deep_space', startingDistanceKm: 60, maxDuration: 600,
  sideA: { faction: 'alliance', name: 'Alliance line', formation: 'line_abreast', counts: { alliance_dreadnought: 12, alliance_cruiser: 36, alliance_frigate: 60 } },
  sideB: { faction: 'reaper', name: 'Reaper pressure', formation: 'strike_wedge', counts: { reaper_capital: 16, reaper_destroyer: 60 } } });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const out = {};
for (const [label, address] of [['web', '/'], ['local', '/?profile=local-gpu']]) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 3 });
  const page = await context.newPage(); page.setDefaultTimeout(600000);
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base.replace(/\/$/, '') + address);
  await page.waitForSelector('[data-menu="quick-battle"]');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('boot')).opacity === '0');
  const prefs = await page.evaluate(() => { const p = window.reaperwar.prefs; return { quality: p.graphics.quality, pixelRatioCap: p.graphics.pixelRatioCap, bloom: p.graphics.bloom ?? 'auto', simulationThread: p.simulationThread ?? 'main', hardwareProfile: p.hardwareProfile ?? null }; });
  await page.evaluate((cfg) => { window.reaperwar.startBattle(cfg); }, config);
  await page.waitForFunction(() => window.reaperwar.battle?.sim?.tick > 40, null, { timeout: 600000 });
  const drawn = await page.evaluate(() => {
    const b = window.reaperwar.battle; b.paused = true; b.setCamera('free');
    const cam = b.view.rig.camera; cam.position.set(0, 220, -620); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(true);
    b.view.update(0, 1); b.view.render();
    const gl = b.view.renderer.getContext();
    return { ships: b.sim.ships.filter((s) => s.alive).length, lod: { ...b.view.lodCounts }, drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight], worker: !!b.remote, glError: gl.getError() };
  });
  out[label] = { prefs, ...drawn, errors };
  if (label === 'web') {
    // The Settings button applies the same profile by hand.
    await page.evaluate(() => { const app = window.reaperwar; app.battle?.dispose?.(); app.show('settings'); });
    await page.click('[data-action="local-gpu-profile"]');
    out.settingsButton = await page.evaluate(() => { const p = window.reaperwar.prefs; return { quality: p.graphics.quality, pixelRatioCap: p.graphics.pixelRatioCap, simulationThread: p.simulationThread, selected: document.querySelector('[data-action="quality"]').value, toast: document.querySelector('.toast')?.textContent ?? null }; });
    // Custom Battle: Double fleets, then Fleets x4, then Halve fleets.
    await page.evaluate(() => window.reaperwar.show('custom'));
    const total = () => page.evaluate(() => [...document.querySelectorAll('input[data-count]')].reduce((n, i) => n + (Number(i.value) || 0), 0));
    const counts = [await total()];
    for (const factor of ['2', '4', '0.5']) { await page.click(`[data-action="scale-fleets-${factor}"]`); counts.push(await total()); }
    out.fleetScaling = { start: counts[0], doubled: counts[1], timesFour: counts[2], halved: counts[3] };
  }
  await context.close();
}
console.log(JSON.stringify(out, null, 1));
await browser.close();
