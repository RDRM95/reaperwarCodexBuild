/** Alliance hull QA: six fixed views of each class, against a running build.
 *
 *   npx vite preview --port 4191 --strictPort
 *   node --import tsx/esm scripts/alliance-hull-qa.mjs <outDir> <baseURL> <label> <repoRoot>
 *
 * CLASSES (comma-separated class ids) and ENVIRONMENT choose what is captured. The battle is paused and the camera
 * placed by hand for the capture only. Cloud Chromium with SwiftShader: shape, paint and lighting only, not a
 * hardware measurement. Set REAPERWAR_PLAYWRIGHT to a Playwright module path when the project's own version does
 * not match the installed browser.
 */
const { chromium } = await import(process.env.REAPERWAR_PLAYWRIGHT ?? '@playwright/test');
import { mkdirSync } from 'node:fs';
import path from 'node:path';
const [outDir, base, label, root] = process.argv.slice(2);
const { buildCustomBattle } = await import(path.join(root, 'src/scenarios/index.ts'));
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && /webgl|three|shader|program/i.test(m.text())) errors.push(m.text()); });
const classes = (process.env.CLASSES ?? 'alliance_dreadnought,alliance_cruiser,alliance_frigate').split(',');
const env = process.env.ENVIRONMENT ?? 'earth_orbit';
await page.goto(base);
await page.waitForSelector('[data-menu="quick-battle"]');
await page.waitForFunction(() => getComputedStyle(document.getElementById('boot')).opacity === '0');
const config = buildCustomBattle({ seed: 42, rulesId: 'canon_me3', environment: env, startingDistanceKm: 60, maxDuration: 180,
  sideA: { faction: 'alliance', name: 'Fifth Fleet', formation: 'line_abreast', counts: Object.fromEntries(classes.map((c) => [c, 1])) },
  sideB: { faction: 'reaper', name: 'Reapers', formation: 'line_abreast', counts: { reaper_destroyer: 1 } } });
await page.evaluate((cfg) => {
  const app = window.reaperwar; app.prefs.graphics.bloom = true;
  app.startBattle(cfg); const b = app.battle; b.paused = true; cancelAnimationFrame(b.raf); b.loop = () => {};
  b.hud.root.style.visibility = 'hidden'; b.overlay.visible = false; document.getElementById('overlay-canvas').style.visibility = 'hidden';
}, config);
const views = [['quarter', 0.28, 2.35, 1.25], ['side', 0.04, Math.PI / 2, 1.05], ['top', 1.5, 0, 1.3], ['aft', 0.25, 0.6, 1.2], ['front-low', -0.2, 2.75, 1.0], ['close', 0.16, 2.2, 0.55]];
for (const classId of classes) for (const [name, pitch, yawOffset, spans] of views) {
  await page.evaluate(({ classId, pitch, yawOffset, spans }) => {
    const b = window.reaperwar.battle; const ship = b.sim.ships.find((s) => s.classId === classId);
    b.select(ship.id); b.setCamera('follow');
    for (let i = 0; i < 20; i++) b.view.update(1 / 60, 1);
    const KM = 10; const length = b.view.visuals.get(ship.id).built.lengthUnits; const cam = b.view.rig.camera;
    const cx = ship.pos.x * KM, cy = ship.pos.y * KM, cz = ship.pos.z * KM;
    const yaw = Math.atan2(ship.heading.x, ship.heading.z) + Math.PI + yawOffset, cp = Math.cos(pitch), d = spans * length;
    cam.position.set(cx + Math.sin(yaw) * cp * d, cy + Math.sin(pitch) * d, cz + Math.cos(yaw) * cp * d);
    cam.lookAt(cx, cy, cz); cam.near = Math.max(0.02, d * 0.002); cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    const fill = b.view.fillLight, dir = cam.getWorldDirection(cam.position.clone());
    fill.position.copy(cam.position); fill.target.position.copy(cam.position).add(dir.multiplyScalar(100)); fill.target.updateMatrixWorld(true);
    b.view.render();
  }, { classId, pitch, yawOffset, spans });
  await page.screenshot({ path: `${outDir}/${label}-${classId.replace('alliance_', '')}-${name}.jpg`, type: 'jpeg', quality: 88 });
}
console.log('errors:', errors.length ? errors.join(' | ') : 'none');
await browser.close();
