/** Effect batching QA: the same staged bursts, from the same random stream, at fixed times, close to the camera.
 *
 *   npx vite preview --port 4191 --strictPort
 *   node --import tsx/esm scripts/effects-batch-qa.mjs <outDir> <baseURL> <label> <repoRoot>
 *
 * Run it against two builds and compare the PNGs pixel by pixel; it also records draw calls and live effect counts.
 * A capital explosion, a small one, hull, barrier, beam and glancing impacts, two HADES bursts, a secondary and two
 * muzzle flashes, without and with bloom. The battle is paused and the effects are called directly, for the capture
 * only. Cloud Chromium with SwiftShader: picture and draw-call counts, not a hardware timing.
 */
const { chromium } = await import(process.env.REAPERWAR_PLAYWRIGHT ?? '@playwright/test');
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const [outDir, base, label, root] = process.argv.slice(2);
const { buildCustomBattle } = await import(path.join(root, 'src/scenarios/index.ts'));
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }); page.setDefaultTimeout(600000);
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && /webgl|three|shader|program/i.test(m.text())) errors.push(m.text()); });
const out = {};
for (const bloom of [false, true]) {
  await page.goto(base);
  await page.waitForSelector('[data-menu="quick-battle"]');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('boot')).opacity === '0');
  const config = buildCustomBattle({ seed: 42, rulesId: 'canon_me3', environment: 'deep_space', startingDistanceKm: 200, maxDuration: 600,
    sideA: { faction: 'alliance', name: 'A', formation: 'line_abreast', counts: { alliance_cruiser: 1 } },
    sideB: { faction: 'reaper', name: 'B', formation: 'line_abreast', counts: { reaper_destroyer: 1 } } });
  await page.evaluate(({ cfg, bloom }) => {
    const app = window.reaperwar; app.prefs.graphics.bloom = bloom;
    app.startBattle(cfg); const b = app.battle; b.paused = true; cancelAnimationFrame(b.raf); b.loop = () => {};
    b.hud.root.style.visibility = 'hidden'; b.overlay.visible = false; document.getElementById('overlay-canvas').style.visibility = 'hidden';
    b.setCamera('free');
    const THREE_V = b.view.rig.camera.position.constructor; const V = (x, y, z) => new THREE_V(x, y, z);
    const fx = b.view.effects; const o = V(0, 400, 0); window.__o = o;
    // A capital-sized explosion, a small one, hull and barrier impacts, a glancing hit, HADES bursts, secondaries, muzzle flashes.
    fx.explosion(o.clone(), 9, true, [], V(0.5, 0, 0));
    fx.explosion(o.clone().add(V(14, 3, 0)), 2, false);
    fx.impact(o.clone().add(V(-12, 2, 0)), 0, 900, 3, () => undefined, 'kinetic');
    fx.impact(o.clone().add(V(-12, -5, 0)), 600, 0, 3, () => undefined, 'kinetic');
    fx.impact(o.clone().add(V(-8, 6, 0)), 0, 300, 3, () => undefined, 'reaper_beam');
    fx.impact(o.clone().add(V(-16, 6, 0)), 40, 10, 3, () => undefined, 'kinetic', true);
    fx.hadesBurst(o.clone().add(V(10, -7, 0)), 9, 800, V(0, 0, 1));
    fx.hadesBurst(o.clone().add(V(16, -6, 0)), 5, 120, V(1, 0, 0));
    fx.secondary(o.clone().add(V(0, 9, 0)), 3);
    fx.muzzleFlash(o.clone().add(V(-4, -9, 0)), V(1, 0, 0), 2, false);
    fx.muzzleFlash(o.clone().add(V(2, -9, 0)), V(1, 0, 0), 2, true);
  }, { cfg: config, bloom });
  const shot = async (name) => {
    out[name] = await page.evaluate(() => {
      const b = window.reaperwar.battle, cam = b.view.rig.camera, o = window.__o;
      cam.position.set(o.x + 6, o.y + 4, o.z + 34); cam.lookAt(o.x, o.y, o.z); cam.updateMatrixWorld(true);
      b.view.render();
      return { drawCalls: b.view.drawCalls, sparks: b.view.effects.sparks.length, debris: b.view.effects.debris.length + (b.view.effects.fragments?.length ?? 0) };
    });
    await page.screenshot({ path: `${outDir}/${label}-${name}.png` });
  };
  const tag = bloom ? 'bloom-' : '';
  await shot(tag + 't0');
  const step = (n) => page.evaluate((n) => { const fx = window.reaperwar.battle.view.effects; for (let i = 0; i < n; i++) fx.update(1 / 30); }, n);
  await step(2); await shot(tag + 't2');
  await step(6); await shot(tag + 't8');
  await step(22); await shot(tag + 't30');
  await step(60); await shot(tag + 't90');
}
writeFileSync(`${outDir}/${label}.json`, JSON.stringify(out, null, 1));
console.log(label, JSON.stringify(out));
console.log('errors:', errors.length ? errors.join(' | ') : 'none');
await browser.close();
