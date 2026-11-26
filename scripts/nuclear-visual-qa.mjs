// Visual QA for nuclear detonations: drives the built app, stops its frame loop, and steps the view by hand so
// that each picture is of a known moment of a known detonation.
// Usage: node scripts/nuclear-visual-qa.mjs <outDir> [baseUrl]   (CHROMIUM_EXECUTABLE_PATH for a system browser)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const outDir = process.argv[2] ?? 'e2e-screenshots/nuclear';
const base = process.argv[3] ?? 'http://localhost:4173';
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
await page.goto(base + '/');
await page.waitForSelector('[data-menu="quick-battle"]');
await page.evaluate((id) => window.reaperwar.show('briefing', { scenarioId: id }), process.env.SCENARIO ?? 'battle_of_earth');
await page.click('[data-action="launch"]');
await page.waitForSelector('[data-action="pause"]', { timeout: 60000 });
await page.evaluate(() => { const b = window.reaperwar.battle; const t = b.sim.time + 14; while (!b.sim.finished && b.sim.time < t) b.sim.step(); });
await page.click('[data-action="pause"]');
await page.keyboard.press('h'); await page.keyboard.press('h');
// Stop the app's own frames: every frame from here is one we ask for.
await page.evaluate(() => { const b = window.reaperwar.battle; cancelAnimationFrame(b.raf); b.loop = () => {}; });

/** Frame a hull from `lengths` of itself away, on its quarter and a little above (the tactical camera, settled). */
const frame = (pred, lengths) => page.evaluate(({ pred, lengths }) => {
  const b = window.reaperwar.battle, fn = new Function('s', `return ${pred}`);
  const s = b.sim.ships.find((x) => x.alive && fn(x));
  b.view.followId = s.id; b.view.selectedIds.clear(); b.view.selectedIds.add(s.id); b.setCamera('tactical');
  b.view.update(0.016, 1);
  const L = b.view.visuals.get(s.id)?.built.lengthUnits ?? 5, rig = b.view.rig;
  rig.focus.set(s.pos.x * 10, s.pos.y * 10, s.pos.z * 10); rig.distance = L * lengths; rig.yaw = Math.atan2(s.heading.x, s.heading.z) + 2.2; rig.pitch = 0.22;
  for (let i = 0; i < 30; i++) b.view.update(0.2, 1);
  b.view.effects.clear(); b.view.render();
  return { id: s.id, name: s.name, L };
}, { pred, lengths });

/** Set off a detonation on the framed hull and take pictures at the given ages (seconds). */
const detonate = async (label, kind, payload, ages, hull = true) => {
  await page.evaluate(({ kind, payload, hull }) => {
    const b = window.reaperwar.battle, THREE = b.view.rig.camera.position.constructor, s = b.sim.getShip(b.view.followId);
    const v = b.view.visuals.get(s.id), L = v.built.lengthUnits, centre = v.built.group.position.clone();
    const cam = b.view.rig.camera.position, toCam = cam.clone().sub(centre).normalize();
    const entry = centre.clone().addScaledVector(toCam, L * 0.12).add(new THREE(0, L * 0.03, 0));
    const anchor = () => v.built.group.position;
    b.view.effects.clear();
    if (kind === 'internal') b.view.effects.internalDetonation(entry, centre, payload, hull ? payload : 0, L, new THREE(), anchor, 1);
    else b.view.effects.externalDetonation(entry, toCam, payload, hull ? payload * 0.5 : 0, L, new THREE(), anchor, 1);
  }, { kind, payload, hull });
  let t = 0;
  for (const age of ages) {
    await page.evaluate((dt) => { const b = window.reaperwar.battle; const n = Math.max(1, Math.round(dt / 0.02)); for (let i = 0; i < n; i++) b.view.update(dt / n, 1); b.view.render(); }, age - t);
    t = age;
    await page.screenshot({ path: `${outDir}/${label}-${String(Math.round(age * 1000)).padStart(4, '0')}ms.jpg`, quality: 82 });
  }
  const stats = await page.evaluate(() => { const b = window.reaperwar.battle, n = b.view.effects.nuclear; return { parts: n.liveParts, calls: b.view.drawCalls, exposure: +b.view.exposureDip.toFixed(3), light: +b.view.effects.flashLight.intensity.toFixed(1) }; });
  console.log(label, JSON.stringify(stats));
  await page.evaluate(() => { const b = window.reaperwar.battle; for (let i = 0; i < 200; i++) b.view.update(0.05, 1); });
};

const jobs = JSON.parse(process.argv[4] ?? 'null') ?? [
  ['s.role==="reaper_capital"', 1.6, 'internal-t2-dreadnought', 'internal', 1100, [0.02, 0.19, 0.3, 0.6, 1.4]],
  ['s.role==="reaper_capital"', 1.6, 'internal-t4-nova', 'internal', 50750, [0.02, 0.26, 0.4, 0.8, 1.8]],
  ['s.role==="reaper_capital"', 1.6, 'external-large', 'external', 10500, [0.02, 0.12, 0.4, 0.9, 1.8]],
];
for (const [pred, lengths, label, kind, payload, ages] of jobs) { console.log(JSON.stringify(await frame(pred, lengths))); await detonate(label, kind, payload, ages); }
console.log('errors', errors);
await browser.close();
