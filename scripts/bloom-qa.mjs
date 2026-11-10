/** Bloom QA: the same frames with bloom off and on, against a running build.
 *
 *   npx vite preview --port 4191 --strictPort
 *   node --import tsx/esm scripts/bloom-qa.mjs <outDir> <baseURL> <repoRoot>
 *
 * A Reaper firing (close and side), a Reaper at 12 % hull, a dreadnought's drives, and two Earth-orbit frames.
 * The battle is paused and the hull value set for the capture only (QA staging, never game behaviour). Cloud
 * Chromium with SwiftShader: look and colour only; the per-frame times it prints are not a hardware measurement.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const [outDir, base, root] = process.argv.slice(2);
const { buildCustomBattle } = await import(path.join(root, 'src/scenarios/index.ts'));
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && /webgl|three|shader|program|framebuffer/i.test(m.text())) errors.push(m.text()); });
const duel = (env) => buildCustomBattle({ seed: 42, rulesId: 'canon_me3', environment: env, startingDistanceKm: 16, maxDuration: 300,
  sideA: { faction: 'alliance', name: 'Fifth Fleet', formation: 'line_abreast', counts: { alliance_cruiser: 6, alliance_dreadnought: 2 } },
  sideB: { faction: 'reaper', name: 'Reapers', formation: 'line_abreast', counts: { reaper_capital: 2 } } });
const timing = {};
try {
  for (const mode of ['off', 'on']) {
    for (const env of ['deep_space', 'earth_orbit']) {
      await page.goto(base);
      await page.waitForSelector('[data-menu="quick-battle"]');
      await page.waitForFunction(() => getComputedStyle(document.getElementById('boot')).opacity === '0');
      const info = await page.evaluate(({ cfg, mode }) => {
        window.reaperwar.prefs.graphics.bloom = mode === 'on';
        window.reaperwar.startBattle(cfg); const b = window.reaperwar.battle; b.paused = true;
        cancelAnimationFrame(b.raf); b.loop = () => {};
        b.hud.root.style.visibility = 'hidden'; b.overlay.visible = false; document.getElementById('overlay-canvas').style.visibility = 'hidden';
        const firing = () => b.sim.ships.find((s) => s.classId === 'reaper_capital' && s.alive && s.weapons.some((w) => w.beamRemaining > 0.4 && w.def.kind === 'reaper_beam' && !w.def.antiSmall));
        let ship; let frames = 0;
        b.setCamera('follow');
        const lead = b.sim.ships.find((s) => s.classId === 'reaper_capital'); b.select(lead.id);
        while (b.sim.time < 200 && !(ship = firing())) { b.sim.step(); if (++frames % 2 === 0) b.view.update(0.1, 1); }
        if (!ship) return { fired: false };
        b.select(ship.id);
        for (let i = 0; i < 12; i++) b.view.update(1 / 30, 1);
        window.__ship = ship.id;
        window.__dread = b.sim.ships.find((s) => s.classId === 'alliance_dreadnought' && s.alive)?.id;
        return { fired: true, time: +b.sim.time.toFixed(1) };
      }, { cfg: duel(env), mode });
      console.log(mode, env, JSON.stringify(info));
      const shots = env === 'deep_space'
        ? [{ name: 'reaper-front-low', id: '__ship', d: 11, pitch: -0.3, yaw: 0.3 }, { name: 'reaper-side', id: '__ship', d: 20, pitch: 0.1, yaw: 1.45 }, { name: 'reaper-wounded', id: '__ship', d: 18, pitch: 0.25, yaw: 2.3, hull: 0.12 }, { name: 'dreadnought-aft', id: '__dread', d: 6, pitch: 0.15, yaw: Math.PI + 0.5 }]
        : [{ name: 'orbit-reaper-side', id: '__ship', d: 20, pitch: 0.1, yaw: 1.45 }, { name: 'orbit-wide', id: '__ship', d: 90, pitch: 0.3, yaw: 2.2 }];
      for (const sh of shots) {
        const ms = await page.evaluate((sh) => {
          const b = window.reaperwar.battle; const ship = b.sim.getShip(window[sh.id]);
          if (sh.hull) ship.hull = ship.maxHull * sh.hull;
          for (let i = 0; i < (sh.hull ? 20 : 1); i++) b.view.update(1 / 600, 1);
          const cam = b.view.rig.camera; const KM = 10;
          const c = { x: ship.pos.x * KM, y: ship.pos.y * KM, z: ship.pos.z * KM };
          const yaw = Math.atan2(ship.heading.x, ship.heading.z) + sh.yaw, cp = Math.cos(sh.pitch);
          cam.position.set(c.x + Math.sin(yaw) * cp * sh.d, c.y + Math.sin(sh.pitch) * sh.d, c.z + Math.cos(yaw) * cp * sh.d);
          cam.lookAt(c.x, c.y, c.z); cam.near = 0.05; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
          const fl = b.view.fillLight; const dir = cam.getWorldDirection(cam.position.clone()); fl.position.copy(cam.position); fl.target.position.copy(cam.position).add(dir.multiplyScalar(100)); fl.target.updateMatrixWorld(true);
          b.view.render();
          const gl = b.view.renderer.getContext(); gl.finish();
          const t0 = performance.now(); for (let i = 0; i < 8; i++) b.view.render(); gl.finish();
          return (performance.now() - t0) / 8;
        }, sh);
        timing[`${mode}-${sh.name}`] = +ms.toFixed(1);
        await page.screenshot({ path: `${outDir}/${mode}-${sh.name}.png` });
      }
    }
  }
  writeFileSync(`${outDir}/timing.json`, JSON.stringify(timing, null, 1));
  console.log(JSON.stringify(timing));
  console.log('errors:', errors.length ? errors.join(' | ') : 'none');
} finally { await browser.close(); }
