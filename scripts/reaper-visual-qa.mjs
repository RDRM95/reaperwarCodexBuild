/** Reaper visual QA: rendered captures of every Reaper class against a running build.
 *
 *   npx vite preview --port 4191 --strictPort
 *   node --import tsx/esm scripts/reaper-visual-qa.mjs [outDir] [baseURL] [label] [repoRoot]
 *
 * Captures 1600×900 CSS pixels at device scale 0.8 (1280×720 files) with
 * SwiftShader: six orthographic-style views plus a three-quarter view of each
 * Reaper class through the follow rig, close/medium/distant capital views, the
 * capital beside an Alliance frigate parked 1.2 km off its beam, a 20-Reaper
 * fleet from the tactical camera and the capital under two environments. The
 * frigate parking is QA-only scene staging in a paused battle, never game
 * behaviour. Also writes triangle counts of the Reaper templates from
 * `repoRoot` so before/after builds can be compared from the same script.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [outDir = 'docs/apex/qa/reaper-visual-20261110', base = 'http://127.0.0.1:4191', label = 'after', root = path.resolve(here, '..')] = process.argv.slice(2);
const { buildCustomBattle } = await import(path.join(root, 'src/scenarios/index.ts'));
mkdirSync(outDir, { recursive: true });

// --- Triangle counts of the Reaper templates (hero = articulated rig shown, static = merged stand-ins shown).
const reaper = await import(path.join(root, 'src/rendering/ships/reaper.ts'));
const tris = g => (g.index ? g.index.count : g.attributes.position.count) / 3;
const triangles = {};
for (const [id, build] of Object.entries({ reaper_capital: reaper.buildReaperCapital, harbinger: reaper.buildHarbinger, reaper_destroyer: reaper.buildReaperDestroyer })) {
  const built = build();
  let hero = 0, stat = 0, meshes = 0;
  const materials = new Set();
  built.group.traverse(o => {
    if (!o.isMesh) return;
    meshes++; materials.add(o.material.uuid);
    const t = tris(o.geometry);
    let inPivot = false;
    for (let p = o; p; p = p.parent) if (p.userData?.reaperRig) inPivot = true;
    if (!(o.name === 'reaper-static-arms' || o.name === 'reaper-static-seams')) hero += t;
    if (!inPivot) stat += t;
  });
  triangles[id] = { hero, static: stat, meshes, materials: materials.size, lengthUnits: built.lengthUnits };
}
writeFileSync(`${outDir}/${label}-triangles.json`, JSON.stringify(triangles, null, 1));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined, headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 0.8 });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && /webgl|three|shader|program/i.test(m.text())) errors.push(m.text()); });

  const boot = async (config) => {
    await page.goto(base);
    await page.waitForSelector('[data-menu="quick-battle"]');
    await page.waitForFunction(() => getComputedStyle(document.getElementById('boot')).opacity === '0');
    await page.evaluate(cfg => {
      window.reaperwar.startBattle(cfg);
      const b = window.reaperwar.battle;
      b.paused = true;
      b.hud.root.style.visibility = 'hidden'; b.overlay.visible = false;
      document.getElementById('overlay-canvas').style.visibility = 'hidden';
      // Remember the frigate's spawn so each shot can park or restore it.
      const frigate = b.sim.ships.find(s => s.classId === 'alliance_frigate');
      if (frigate) window.__qaFrigateHome = { x: frigate.pos.x, y: frigate.pos.y, z: frigate.pos.z };
    }, config);
  };
  const shoot = async (file, shot) => {
    await page.evaluate(sh => {
      const b = window.reaperwar.battle;
      const ship = b.sim.ships.find(s => s.classId === sh.classId);
      if (!ship) throw new Error('Missing review hull: ' + sh.classId);
      const frigate = b.sim.ships.find(s => s.classId === 'alliance_frigate');
      if (frigate && window.__qaFrigateHome) {
        // Simulation positions are kilometres: 1.2 km off the capital's beam, same heading.
        const target = sh.frigate ? { x: ship.pos.x + 1.2, y: ship.pos.y, z: ship.pos.z } : window.__qaFrigateHome;
        Object.assign(frigate.pos, target); Object.assign(frigate.prevPos, target);
        if (sh.frigate) { Object.assign(frigate.heading, ship.heading); Object.assign(frigate.prevHeading, ship.heading); }
      }
      b.select(ship.id); b.setCamera('follow');
      b.view.rig.distance = sh.distance; b.view.rig.pitch = sh.pitch; b.view.rig.yaw = sh.yaw;
      for (let i = 0; i < 90; i++) b.view.update(1 / 60, 1);
      b.view.render();
    }, shot);
    await page.screenshot({ path: `${outDir}/${file}.jpg`, type: 'jpeg', quality: 86 });
  };

  // Six orthographic-style views through the follow rig (yaw 0 = astern, π = ahead).
  const ortho = [
    ['top', { pitch: 1.45, yaw: 0 }], ['bottom', { pitch: -1.5, yaw: 0 }],
    ['left', { pitch: 0, yaw: Math.PI / 2 }], ['right', { pitch: 0, yaw: -Math.PI / 2 }],
    ['front', { pitch: 0, yaw: Math.PI }], ['rear', { pitch: 0.05, yaw: 0 }],
  ];
  const quarter = { pitch: 0.18, yaw: 2.25 };
  const review = (env) => buildCustomBattle({ seed: 42, rulesId: 'canon_me3', environment: env, startingDistanceKm: 40, maxDuration: 180,
    sideA: { faction: 'alliance', name: 'Scale', formation: 'line_abreast', counts: { alliance_frigate: 1, alliance_dreadnought: 1 } },
    sideB: { faction: 'reaper', name: 'Reapers', formation: 'line_abreast', counts: { reaper_capital: 1, reaper_destroyer: 1, harbinger: 1 } } });

  await boot(review('deep_space'));
  for (const classId of ['reaper_capital', 'harbinger', 'reaper_destroyer']) {
    const short = classId.replace('reaper_', '');
    for (const [view, angles] of ortho) await shoot(`${label}-${short}-${view}`, { classId, distance: 320, ...angles });
    await shoot(`${label}-${short}-quarter-470`, { classId, distance: 470, ...quarter });
  }
  await shoot(`${label}-capital-close-150`, { classId: 'reaper_capital', distance: 150, pitch: 0.12, yaw: 2.6 });
  await shoot(`${label}-capital-close-150-aft-quarter`, { classId: 'reaper_capital', distance: 150, pitch: 0.3, yaw: 0.75 });
  await shoot(`${label}-harbinger-close-200`, { classId: 'harbinger', distance: 200, pitch: 0.15, yaw: 2.4 });
  await shoot(`${label}-destroyer-close-200`, { classId: 'reaper_destroyer', distance: 200, pitch: 0.15, yaw: 2.4 });
  await shoot(`${label}-capital-distant-1500`, { classId: 'reaper_capital', distance: 1500, pitch: 0.25, yaw: 2.0 });
  await shoot(`${label}-capital-frigate-scale`, { classId: 'reaper_capital', distance: 470, pitch: 0.22, yaw: 1.9, frigate: true });

  await boot(review('earth_orbit'));
  await shoot(`${label}-capital-earth-orbit-quarter-470`, { classId: 'reaper_capital', distance: 470, ...quarter });
  await shoot(`${label}-capital-earth-orbit-close-150`, { classId: 'reaper_capital', distance: 150, pitch: 0.12, yaw: 2.6 });
  await shoot(`${label}-capital-earth-orbit-front`, { classId: 'reaper_capital', distance: 320, pitch: 0.0, yaw: Math.PI });

  // Twenty capital Reapers from the tactical camera.
  await boot(buildCustomBattle({ seed: 7, rulesId: 'canon_me3', environment: 'deep_space', startingDistanceKm: 60, maxDuration: 180,
    sideA: { faction: 'alliance', name: 'Line', formation: 'line_abreast', counts: { alliance_dreadnought: 1 } },
    sideB: { faction: 'reaper', name: 'Reaper fleet', formation: 'strike_wedge', counts: { reaper_capital: 20 } } }));
  await page.evaluate(() => {
    const b = window.reaperwar.battle;
    const reapers = b.sim.ships.filter(s => s.faction === 'reaper');
    const c = reapers.reduce((acc, s) => ({ x: acc.x + s.pos.x / reapers.length, y: acc.y + s.pos.y / reapers.length, z: acc.z + s.pos.z / reapers.length }), { x: 0, y: 0, z: 0 });
    b.setCamera('tactical');
    b.view.rig.focus.set(c.x * 10, c.y * 10, c.z * 10);
    b.view.rig.distance = 260; b.view.rig.pitch = 0.32; b.view.rig.yaw = 2.55;
    for (let i = 0; i < 90; i++) b.view.update(1 / 60, 1);
    b.view.render();
  });
  await page.screenshot({ path: `${outDir}/${label}-fleet-20-tactical.jpg`, type: 'jpeg', quality: 86 });

  writeFileSync(`${outDir}/${label}-errors.json`, JSON.stringify(errors));
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Captured ${label} Reaper QA set to ${outDir} with no runtime/WebGL errors.`);
  console.log(JSON.stringify(triangles));
} finally { await browser.close(); }
