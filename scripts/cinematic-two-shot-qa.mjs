/** Cinematic two-shot QA: a firing Reaper and its real target in the cinematic camera, at three opening distances.
 *
 *   npx vite preview --port 4191 --strictPort
 *   node --import tsx/esm scripts/cinematic-two-shot-qa.mjs <outDir> <baseURL> <repoRoot> <label>
 *
 * The battle is paused and the director pinned to that pair for the capture (QA staging, never game behaviour), so
 * two builds show the same pair. Cloud Chromium with SwiftShader: framing only.
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
  for (const km of [8, 16, 30]) {
    await page.goto(base);
    await page.waitForSelector('[data-menu="quick-battle"]');
    await page.waitForFunction(() => getComputedStyle(document.getElementById('boot')).opacity === '0');
    const config = buildCustomBattle({ seed: 42, rulesId: 'canon_me3', environment: 'deep_space', startingDistanceKm: km, maxDuration: 300,
      sideA: { faction: 'alliance', name: 'Fifth Fleet', formation: 'line_abreast', counts: { alliance_cruiser: 4, alliance_dreadnought: 1 } },
      sideB: { faction: 'reaper', name: 'Reapers', formation: 'line_abreast', counts: { reaper_capital: 1 } } });
    const info = await page.evaluate((cfg) => {
      window.reaperwar.startBattle(cfg); const b = window.reaperwar.battle; b.paused = true;
      cancelAnimationFrame(b.raf); b.loop = () => {};
      b.hud.root.style.visibility = 'hidden'; b.overlay.visible = false; document.getElementById('overlay-canvas').style.visibility = 'hidden';
      const reaper = b.sim.ships.find((s) => s.classId === 'reaper_capital');
      const firing = () => reaper.weapons.find((w) => w.beamRemaining > 0.4 && w.def.kind === 'reaper_beam' && !w.def.antiSmall);
      let frames = 0, w;
      while (b.sim.time < 240 && !(w = firing())) { b.sim.step(); if (++frames % 4 === 0) b.view.update(0.1, 1); }
      const target = b.sim.ships.find((s) => s.alive && s.id === (w?.targetId ?? reaper.targetId)) ?? b.sim.ships.find((s) => s.alive && s.faction !== 'reaper');
      b.setCamera('cinematic');
      // QA staging: pin the director to the firing Reaper and its real target so both builds show the same pair.
      b.view.cine = { fromId: reaper.id, toId: target.id, age: 6, hold: 1e9 };
      for (let i = 0; i < 240; i++) b.view.update(1 / 30, 1);
      b.view.render();
      const d = Math.hypot(reaper.pos.x - target.pos.x, reaper.pos.y - target.pos.y, reaper.pos.z - target.pos.z);
      return { fired: !!w, time: +b.sim.time.toFixed(1), separationKm: +d.toFixed(1), target: target.classId };
    }, config);
    await page.screenshot({ path: `${outDir}/${label}-${km}km.jpg`, type: 'jpeg', quality: 88 });
    console.log(label, km, JSON.stringify(info));
  }
  console.log('errors:', errors.length ? errors.join(' | ') : 'none');
} finally { await browser.close(); }
