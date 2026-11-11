/** Three-dimensional engagement QA: the same seeded battle at fixed times, seen edge-on and from above.
 *
 *   npx vite preview --port 4191 --strictPort
 *   node --import tsx/esm scripts/engagement-3d-qa.mjs <outDir> <baseURL> <label> <repoRoot>
 *
 * Edge-on, the camera sits level with the two fleets and looks across the line between them, so anything above or
 * below the plane they deployed in shows as height in the picture. Run it against two builds to compare. The battle
 * is stepped by hand with the frame loop stopped, so both builds show the same simulated moments. Cloud Chromium with
 * SwiftShader: where ships are, not how the picture performs. Set REAPERWAR_PLAYWRIGHT to a matching Playwright module
 * when the project's own does not match the installed browser.
 */
const { chromium } = await import(process.env.REAPERWAR_PLAYWRIGHT ?? '@playwright/test');
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const [outDir, base, label, root] = process.argv.slice(2);
const { buildCustomBattle, buildScenario } = await import(path.join(root, 'src/scenarios/index.ts'));
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }); page.setDefaultTimeout(900000);
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto(base);
await page.waitForSelector('[data-menu="quick-battle"]');
await page.waitForFunction(() => getComputedStyle(document.getElementById('boot')).opacity === '0');
const scale = Number(process.env.SCALE ?? 2);
// SCENARIO=<id> captures a built-in scenario (several fleets a side) instead of the two-fleet custom battle.
const config = process.env.SCENARIO ? buildScenario(process.env.SCENARIO, 'prime_apex', Number(process.env.SEED ?? 42)) : buildCustomBattle({ seed: Number(process.env.SEED ?? 42), rulesId: 'prime_apex', environment: 'deep_space', startingDistanceKm: 60, maxDuration: 600,
  sideA: { faction: 'alliance', name: 'Alliance line', formation: 'line_abreast', counts: { alliance_dreadnought: 6 * scale, alliance_cruiser: 18 * scale, alliance_frigate: 30 * scale } },
  sideB: { faction: 'reaper', name: 'Reaper pressure', formation: 'strike_wedge', counts: { reaper_capital: 8 * scale, reaper_destroyer: 30 * scale } } });
await page.evaluate((cfg) => {
  const app = window.reaperwar; app.prefs.graphics.bloom = false;
  app.startBattle(cfg); const b = app.battle; b.paused = true; cancelAnimationFrame(b.raf); b.loop = () => {};
  b.hud.root.style.visibility = 'hidden'; b.overlay.visible = false; document.getElementById('overlay-canvas').style.visibility = 'hidden';
  b.setCamera('free');
}, config);
const out = {};
let simulated = 0;
for (const seconds of (process.env.TIMES ?? '10,45,70').split(',').map(Number)) {
  const ticks = Math.round((seconds - simulated) / 0.05); simulated = seconds;
  out[seconds] = await page.evaluate((ticks) => {
    const b = window.reaperwar.battle;
    for (let i = 0; i < ticks; i++) { b.sim.step(); if (i % 4 === 3) b.view.update(0.2, 1); }
    for (let i = 0; i < 4; i++) b.view.update(1 / 60, 1);
    const ships = b.sim.ships.filter((s) => s.alive && !s.escaped && s.role !== 'fighter');
    const centre = (side) => { const m = ships.filter((s) => s.side === side); return m.reduce((a, s) => ({ x: a.x + s.pos.x / m.length, y: a.y + s.pos.y / m.length, z: a.z + s.pos.z / m.length }), { x: 0, y: 0, z: 0 }); };
    const a = centre('A'), e = centre('B');
    const ys = ships.map((s) => s.pos.y);
    window.__geo = { mid: { x: (a.x + e.x) / 2, y: 0, z: (a.z + e.z) / 2 }, axis: { x: e.x - a.x, z: e.z - a.z } };
    return { ships: ships.length, heightKm: +(Math.max(...ys) - Math.min(...ys)).toFixed(2) };
  }, ticks);
  for (const [view, across, up, along] of [['edge', 46, 0, 0], ['above', 30, 34, -18]]) {
    await page.evaluate(({ across, up, along }) => {
      const b = window.reaperwar.battle, KM = 10, { mid, axis } = window.__geo, cam = b.view.rig.camera;
      const n = Math.hypot(axis.x, axis.z) || 1, fx = axis.x / n, fz = axis.z / n;
      // `across` is to the side of the line between the fleets; `along` is back toward the first fleet.
      const place = () => { cam.position.set((mid.x + fz * across + fx * along) * KM, (mid.y + up) * KM, (mid.z - fx * across + fz * along) * KM);
        cam.lookAt(mid.x * KM, mid.y * KM, mid.z * KM); cam.near = 1; cam.far = 40000; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true); };
      place(); b.view.update(0, 1); place();
      const fill = b.view.fillLight, dir = cam.getWorldDirection(cam.position.clone());
      fill.position.copy(cam.position); fill.target.position.copy(cam.position).add(dir.multiplyScalar(100)); fill.target.updateMatrixWorld(true);
      b.view.render();
    }, { across, up, along });
    await page.screenshot({ path: `${outDir}/${label}-t${seconds}-${view}.jpg`, type: 'jpeg', quality: 88 });
  }
}
writeFileSync(`${outDir}/${label}.json`, JSON.stringify(out, null, 1));
console.log(label, JSON.stringify(out), 'errors:', errors.length ? errors.join(' | ') : 'none');
await browser.close();
