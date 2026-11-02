/** Real-renderer fleet-layout review against a running build.
 * CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx/esm scripts/formation-review.mjs [outDir] [baseUrl]
 * Captures deployment, both fleets, and sustained combat; reports runtime/GL errors.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildCustomBattle } from '../src/scenarios/index.ts';

const output = process.argv[2] ?? 'e2e-screenshots/formations';
const base = process.argv[3] ?? 'http://127.0.0.1:4173';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
  headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const samples = [], errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && /webgl|shader|three|program/i.test(m.text())) errors.push(m.text()); });
  await page.goto(base);
  await page.waitForSelector('[data-menu="quick-battle"]');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('boot')).opacity === '0');
  for (const formation of ['line_abreast', 'strike_wedge', 'defensive_screen', 'capital_column']) {
    const cfg = buildCustomBattle({ seed: 42, rulesId: 'prime_apex', environment: 'deep_space', startingDistanceKm: 70, maxDuration: 100,
      sideA: { faction: 'alliance', name: 'Alliance battlegroups', formation, counts: { alliance_omaha: 1, alliance_dreadnought: 12, alliance_cruiser: 24, alliance_frigate: 40 } },
      sideB: { faction: 'reaper', name: 'Reaper front', formation, counts: { reaper_capital: 20, reaper_destroyer: 40 } } });
    await page.evaluate(config => {
      const app = window.reaperwar; app.startBattle(config); const b = app.battle; b.paused = true;
      b.hud.root.style.visibility = 'hidden'; b.overlay.visible = false;
      document.getElementById('overlay-canvas').style.visibility = 'hidden';
    }, cfg);
    for (const [time, side] of [[0, 'A'], [0, 'B'], ...(formation === 'line_abreast' ? [[35, 'A'], [70, 'A']] : [])]) {
      const sample = await page.evaluate(({ time, side }) => {
        const b = window.reaperwar.battle;
        while (!b.sim.finished && b.sim.time < time) {
          b.sim.step(); b.view.update(0.05, 1);
          if (b.sim.tick % 20 === 0) b.view.render();
        }
        const ships = b.sim.ships.filter(s => s.side === side && s.alive && !s.escaped);
        const centre = { x: 0, y: 0, z: 0 };
        for (const s of ships) for (const axis of ['x', 'y', 'z']) centre[axis] += s.pos[axis] / ships.length;
        const radius = Math.max(4, ...ships.map(s => Math.hypot(s.pos.x - centre.x, s.pos.y - centre.y, s.pos.z - centre.z) + s.radiusKm));
        b.setCamera('tactical'); b.view.rig.focus.set(centre.x * 10, centre.y * 10, centre.z * 10);
        b.view.rig.distance = Math.max(130, radius * 27); b.view.rig.pitch = 0.42; b.view.rig.yaw = side === 'A' ? 3.55 : 0.4;
        for (let i = 0; i < 100; i++) b.view.update(1 / 60, 1);
        b.view.render();
        return { time: b.sim.time, side, alive: ships.length, radiusKm: radius,
          shots: b.sim.events.filter(e => e.type === 'weapon_fired').length,
          detonations: b.sim.events.filter(e => e.type === 'hades_detonation').length,
          reapersEscaped: b.sim.ships.filter(s => s.faction === 'reaper' && s.escaped).length,
          positions: ships.map(s => ({ id: s.id, role: s.role, pos: s.pos, slot: s.slot })),
          glError: b.view.renderer.getContext().getError() };
      }, { time, side });
      samples.push({ formation, ...sample });
      await page.screenshot({ path: `${output}/${formation}-${side}-${time}s.png` });
      console.log(JSON.stringify({ formation, time: sample.time, side, alive: sample.alive, shots: sample.shots, detonations: sample.detonations, glError: sample.glError }));
    }
    await page.evaluate(() => window.reaperwar.show('menu'));
  }
  writeFileSync(`${output}/telemetry.json`, JSON.stringify({ samples, errors }, null, 2));
  if (errors.length || samples.some(s => s.glError)) throw new Error(`Formation renderer errors: ${JSON.stringify(errors)}`);
} finally { await browser.close(); }
