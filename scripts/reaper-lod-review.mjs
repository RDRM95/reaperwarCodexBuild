/** Original procedural Reaper rendering QA. This deliberately magnifies each
 * production LOD at the same framing so missing structural layers are visible.
 * No simulation data or private reference images are edited or published.
 * Usage: CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node scripts/reaper-lod-review.mjs --base http://127.0.0.1:4174 --output /tmp/reaper-lod/fixed
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const argument = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const base = argument('--base', 'http://127.0.0.1:4174');
const output = argument('--output', '/tmp/reaper-lod-review');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
  headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [], telemetry = [], captures = [];
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && /webgl|shader|three|program/i.test(message.text())) errors.push(message.text()); });
  await page.goto(base);
  await page.waitForSelector('[data-menu="quick-battle"]');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('boot')).opacity === '0');

  async function setup(environment) {
    return page.evaluate(environment => {
      const app = window.reaperwar;
      app.startBattle({ id: 'reaper-lod-review', name: 'Original Reaper LOD review', scenarioId: 'custom', seed: 42,
        rules: app.getTimeline('canon_me3'), environment, maxDuration: 120, perspectiveSide: 'A', objective: 'Rendering QA only',
        fleets: [
          { id: 'scale', name: 'Scale reference', faction: 'alliance', side: 'A', ships: [{ classId: 'alliance_frigate', count: 1 }], formation: 'line_abreast', position: { x: 0, y: 0, z: -35 }, heading: { x: 0, y: 0, z: 1 } },
          { id: 'reapers', name: 'Reaper model review', faction: 'reaper', side: 'B', ships: [{ classId: 'reaper_capital', count: 1 }, { classId: 'harbinger', count: 1 }, { classId: 'reaper_destroyer', count: 1 }], formation: 'line_abreast', position: { x: 0, y: 0, z: 35 }, heading: { x: 0, y: 0, z: -1 } },
        ] });
      const battle = app.battle;
      battle.paused = true;
      cancelAnimationFrame(battle.raf);
      battle.hud.root.style.visibility = 'hidden';
      battle.overlay.visible = false;
      document.getElementById('overlay-canvas').style.visibility = 'hidden';
      document.getElementById('ui').style.visibility = 'hidden';
      document.querySelector('[aria-label="SHIP REFERENCES · 6 VIEWS"]')?.style.setProperty('visibility', 'hidden');
      const gl = battle.view.renderer.getContext(), extension = gl.getExtension('WEBGL_debug_renderer_info');
      return { renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        tick: battle.sim.tick, rng: battle.sim.rng.getState(), ships: battle.sim.ships.map(ship => ({ id: ship.id, classId: ship.classId, lengthKm: ship.lengthKm })) };
    }, environment);
  }

  const initial = await setup('deep_space');
  const views = { front: [0, 0, 1], rear: [0, 0, -1], left: [-1, 0, 0], right: [1, 0, 0], top: [0, 1, 0], bottom: [0, -1, 0], quarter: [1, .45, 1] };
  const classes = ['reaper_capital', 'harbinger', 'reaper_destroyer'];

  async function capture(classId, level, direction, representation = 'hero', comparison = false, environment = 'deep_space') {
    const metadata = await page.evaluate(({ classId, level, direction, representation, comparison }) => {
      const battle = window.reaperwar.battle, view = battle.view;
      const ship = battle.sim.ships.find(ship => ship.classId === classId), visual = view.visuals.get(ship.id);
      const length = visual.built.lengthUnits;
      const time = battle.sim.time, rng = battle.sim.rng.getState();
      view.instances.group.position.set(0, 0, 0); view.instances.group.quaternion.identity(); view.instances.group.visible = true;
      view.selectedIds.clear(); view.followId = undefined;
      // Select the actual production LOD before magnifying it for inspection.
      view.rig.camera.position.set(ship.pos.x * 10, ship.pos.y * 10, ship.pos.z * 10 + length * (level === 'full' ? 3 : 80));
      view.rig.camera.lookAt(ship.pos.x * 10, ship.pos.y * 10, ship.pos.z * 10);
      view.update(0, 1);
      if (visual.lod !== level) throw new Error(`Expected ${level}, observed ${visual.lod}`);
      const pose = { position: visual.built.group.position.clone(), quaternion: visual.built.group.quaternion.clone() };
      for (const item of view.visuals.values()) item.built.group.visible = false;
      view.farPoints.visible = false;
      if (representation === 'hero') {
        visual.built.group.visible = true; visual.built.group.position.set(0, 0, 0); visual.built.group.quaternion.identity();
        view.instances.group.visible = false;
      } else {
        view.instances.begin(battle.sim.ships); view.instances.add(ship, 1, level); view.instances.end();
        const inverse = pose.quaternion.clone().invert();
        view.instances.group.quaternion.copy(inverse);
        view.instances.group.position.copy(pose.position).negate().applyQuaternion(inverse);
      }
      if (comparison) {
        const frigate = [...view.visuals.values()].find(item => item.ship.classId === 'alliance_frigate');
        frigate.built.group.visible = true; frigate.built.group.position.set(length * .6, 0, 0); frigate.built.group.quaternion.identity();
      }
      const distance = length * (comparison ? 2.25 : 1.85), camera = view.rig.camera;
      camera.position.set(direction[0], direction[1], direction[2]).normalize().multiplyScalar(distance);
      camera.up.set(0, Math.abs(direction[1]) === 1 ? 0 : 1, Math.abs(direction[1]) === 1 ? (direction[1] > 0 ? -1 : 1) : 0);
      camera.lookAt(comparison ? length * .15 : 0, 0, 0); camera.updateMatrixWorld(true);
      view.fillLight.position.copy(camera.position); view.fillLight.target.position.set(0, 0, 0);
      view.render();
      const visible = [];
      const root = representation === 'hero' ? visual.built.group : view.instances.group;
      root.traverse(obj => {
        if (!obj.isMesh || obj.isInstancedMesh && !obj.count) return;
        for (let ancestor = obj; ancestor && ancestor !== root; ancestor = ancestor.parent) if (!ancestor.visible) return;
        visible.push({ name: obj.name, vertices: obj.geometry.attributes.position.count, count: obj.isInstancedMesh ? obj.count : 1 });
      });
      return { classId, level, representation, comparison, lengthUnits: length, visible, drawCalls: view.drawCalls,
        glError: view.renderer.getContext().getError(), simulationUnchanged: time === battle.sim.time && rng === battle.sim.rng.getState() };
    }, { classId, level, direction, representation, comparison });
    metadata.environment = environment;
    metadata.direction = direction;
    telemetry.push(metadata);
    const name = `${environment}-${classId}-${representation}-${level}-${comparison ? 'frigate-context' : Object.keys(views).find(key => views[key] === direction) ?? 'quarter'}`;
    const image = await page.locator('#battle-canvas').screenshot();
    // Keep individual captures outside Git when a caller selects a /tmp output.
    writeFileSync(join(output, `${name}.png`), image);
    captures.push({ title: `${classId} · ${representation} · ${level} · ${comparison ? 'frigate context' : name.split('-').at(-1)} · ${environment}`, image: image.toString('base64') });
  }

  for (const classId of classes) {
    for (const level of ['full', 'reduced']) for (const direction of Object.values(views)) await capture(classId, level, direction);
    await capture(classId, 'full', views.quarter, 'hero', true);
    await capture(classId, 'reduced', views.quarter, 'instances');
  }
  await setup('earth_orbit');
  for (const classId of classes) {
    await capture(classId, 'full', views.quarter, 'hero', false, 'earth_orbit');
    await capture(classId, 'reduced', views.quarter, 'instances', false, 'earth_orbit');
  }
  const sheet = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  const sheets = [];
  for (const classId of classes) {
    const cells = captures.filter(capture => capture.title.startsWith(classId));
    await sheet.setContent('<html><body style="margin:0;background:#111;color:#ddd;font-family:Arial"><canvas></canvas></body></html>');
    await sheet.evaluate(async cells => {
      const canvas = document.querySelector('canvas'), cols = 4, w = 400, h = 305;
      canvas.width = w * cols; canvas.height = Math.ceil(cells.length / cols) * h;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#111'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (const [index, cell] of cells.entries()) {
        const image = new Image(); image.src = `data:image/png;base64,${cell.image}`; await image.decode();
        const x = index % cols * w, y = Math.floor(index / cols) * h;
        ctx.drawImage(image, x, y, w, 280); ctx.fillStyle = '#ddd'; ctx.font = '11px Arial'; ctx.fillText(cell.title, x + 5, y + 296);
      }
    }, cells);
    const filename = `${classId}-contact-sheet.jpg`;
    const image = await sheet.locator('canvas').screenshot({ type: 'jpeg', quality: 85 });
    writeFileSync(join(output, filename), image); sheets.push(filename);
  }
  const report = { note: 'Production LOD is magnified at matched framing for structural comparison. These are original procedural models, not source-reference approval. SwiftShader results are not target-GPU performance proof.', initial, errors, telemetry, sheets };
  writeFileSync(join(output, 'metrics.json'), JSON.stringify(report, null, 2));
  if (errors.length || telemetry.some(record => record.glError || !record.simulationUnchanged)) throw new Error('Rendering QA failed; inspect metrics.json');
  console.log(JSON.stringify({ captures: captures.length, sheets, errors: errors.length, renderer: initial.renderer, output }));
} finally { await browser.close(); }
