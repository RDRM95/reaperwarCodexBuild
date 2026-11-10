/** Reaper death QA: a destroyed capital 1.2, 3.2, 5, 7 and 10 s after the kill, against a running build.
 *
 *   npx vite preview --port 4191 --strictPort
 *   node --import tsx/esm scripts/reaper-death-qa.mjs <outDir> <baseURL> <repoRoot> <label>
 *
 * The hull is marked destroyed in a paused battle (QA-only staging, never game behaviour) and the view runs its
 * own death sequence. Cloud Chromium with SwiftShader; not a hardware-GPU capture.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
const [outDir, base, root, label] = process.argv.slice(2);
const { buildCustomBattle } = await import(path.join(root, 'src/scenarios/index.ts'));
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(base);
  await page.waitForSelector('[data-menu="quick-battle"]');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('boot')).opacity === '0');
  const config = buildCustomBattle({ seed: 42, rulesId: 'canon_me3', environment: 'deep_space', startingDistanceKm: 40, maxDuration: 300,
    sideA: { faction: 'alliance', name: 'Fifth Fleet', formation: 'line_abreast', counts: { alliance_cruiser: 2 } },
    sideB: { faction: 'reaper', name: 'Reapers', formation: 'line_abreast', counts: { reaper_capital: 2 } } });
  for (const after of [1.2, 3.2, 5, 7, 10]) {
    await page.goto(base);
    await page.waitForSelector('[data-menu="quick-battle"]');
    await page.waitForFunction(() => getComputedStyle(document.getElementById('boot')).opacity === '0');
    const info = await page.evaluate(({ cfg, after }) => {
      window.reaperwar.startBattle(cfg); const b = window.reaperwar.battle; b.paused = true;
      cancelAnimationFrame(b.raf); b.loop = () => {};
      b.hud.root.style.visibility = 'hidden'; b.overlay.visible = false; document.getElementById('overlay-canvas').style.visibility = 'hidden';
      const ship = b.sim.ships.find((s) => s.classId === 'reaper_capital');
      b.select(ship.id); b.setCamera('follow');
      for (let i = 0; i < 30; i++) b.view.update(1 / 30, 1);
      const KM = 10; const c = { x: ship.pos.x * KM, y: ship.pos.y * KM, z: ship.pos.z * KM }; const h = Math.atan2(ship.heading.x, ship.heading.z);
      // QA-only: mark the hull destroyed in a paused battle and let the view run its death sequence.
      ship.hull = 0; ship.alive = false;
      const steps = Math.round(after * 30);
      for (let i = 0; i < steps; i++) b.view.update(1 / 30, 1);
      const cam = b.view.rig.camera; const d = 34, pitch = 0.25, yaw = h + 0.7, cp = Math.cos(pitch);
      cam.position.set(c.x + Math.sin(yaw) * cp * d, c.y + Math.sin(pitch) * d, c.z + Math.cos(yaw) * cp * d);
      cam.lookAt(c.x, c.y, c.z); cam.near = 0.05; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
      const fl = b.view.fillLight; const dir = cam.getWorldDirection(cam.position.clone()); fl.position.copy(cam.position); fl.target.position.copy(cam.position).add(dir.multiplyScalar(100)); fl.target.updateMatrixWorld(true);
      b.view.render();
      return { debris: b.view.effects.debris?.length ?? null };
    }, { cfg: config, after });
    await page.screenshot({ path: `${outDir}/${label}-death-${after}s.jpg`, type: 'jpeg', quality: 88 });
    console.log(label, after, JSON.stringify(info));
  }
  console.log('errors:', errors.length ? errors.join(' | ') : 'none');
} finally { await browser.close(); }
