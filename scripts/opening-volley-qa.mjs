/**
 * Rendered gameplay QA for the opening volley and nuclear detonations: real battles in the built app, stepped by
 * hand (one simulation tick to three frames) so that each picture is of a known moment.
 *
 *   npm run build && npx vite preview --port 4173 --strictPort
 *   node --import tsx/esm scripts/opening-volley-qa.mjs <outDir> [baseUrl] [job,...]
 *
 * Jobs: volley (Battle of Earth, Prime/Apex: the allied line's first volley and its warheads going off inside
 * Reapers, from far, middle and close), canon (the same battle under canon rules: slugs, no warheads), torpedo
 * (Imperial Navy torpedoes on Reapers: external detonations), bridge (the volley from a dreadnought's bridge),
 * large (1,472 ships, Prime/Apex).
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.REAPERWAR_PLAYWRIGHT || '@playwright/test');
const here = path.dirname(fileURLToPath(import.meta.url));
const { buildCustomBattle, buildScenario } = await import(path.join(here, '../src/scenarios/index.ts'));
const [outDir = 'e2e-screenshots/opening', base = 'http://localhost:4173', jobsArg = 'volley,canon,torpedo,bridge'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined, headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.setDefaultTimeout(600000);
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const start = async (config) => {
  await page.goto(base);
  await page.waitForSelector('[data-menu="quick-battle"]');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('boot')).opacity === '0');
  await page.evaluate((cfg) => { const app = window.reaperwar; app.startBattle(cfg); const b = app.battle; b.paused = true; cancelAnimationFrame(b.raf); b.loop = () => {}; b.toggleHud?.(); b.toggleHud?.();
    window.qa = { frame: 0, peak: { parts: 0, sparks: 0, calls: 0, exposure: 0 } }; }, config);
};
/** Advance the battle by `seconds`, drawing every frame; returns what was seen on the way. */
const run = (seconds, until) => page.evaluate(({ seconds, until }) => {
  const b = window.reaperwar.battle, q = window.qa, end = b.sim.time + seconds;
  // eslint-disable-next-line no-new-func
  const stop = until ? new Function('b', `return ${until}`) : () => false;
  while (b.sim.time < end && !b.sim.finished && !stop(b)) {
    if (q.frame++ % 3 === 0) b.sim.step();
    b.view.update(1 / 60, ((q.frame - 1) % 3 + 1) / 3);
    const fx = b.view.effects;
    q.peak.parts = Math.max(q.peak.parts, fx.nuclear.liveParts); q.peak.sparks = Math.max(q.peak.sparks, fx.sparks.length); q.peak.exposure = Math.max(q.peak.exposure, b.view.exposureDip);
  }
  b.view.render(); q.peak.calls = Math.max(q.peak.calls, b.view.drawCalls);
  return { t: +b.sim.time.toFixed(2), released: b.sim.openingVolleys.released.length, detonations: fx_stats(b), projectiles: b.sim.projectiles.length };
  function fx_stats(b) { const n = b.view.effects.nuclear; return { asked: n.stats.detonations, dropped: n.stats.dropped, live: n.liveParts }; }
}, { seconds, until });
const camera = (mode, pred, opts = {}) => page.evaluate(({ mode, pred, opts }) => {
  const b = window.reaperwar.battle, rig = b.view.rig;
  // eslint-disable-next-line no-new-func
  const s = pred ? b.sim.ships.find((x) => x.alive && new Function('s', 'b', `return ${pred}`)(x, b)) : undefined;
  if (s) { b.view.followId = s.id; b.view.selectedIds.clear(); }
  b.setCamera(mode);
  if (mode === 'tactical') { if (s) rig.focus.set(s.pos.x * 10, s.pos.y * 10, s.pos.z * 10); else rig.focus.set(opts.x ?? 0, 0, opts.z ?? 0); rig.distance = opts.distance ?? 900; rig.yaw = opts.yaw ?? 0.9; rig.pitch = opts.pitch ?? 0.35; }
  if (mode === 'follow') { rig.distance = opts.distance ?? 320; rig.yaw = opts.yaw ?? 2.4; rig.pitch = opts.pitch ?? 0.2; }
  for (let i = 0; i < 40; i++) b.view.update(0.1, 1);
  b.view.render();
  return s?.name;
}, { mode, pred, opts });
const shot = async (name) => { await page.screenshot({ path: `${outDir}/${name}.jpg`, quality: 84 }); console.log('  captured', name); };
const peak = () => page.evaluate(() => window.qa.peak);

for (const job of jobsArg.split(',')) {
  console.log(job);
  if (job === 'volley' || job === 'canon') {
    const rules = job === 'volley' ? 'prime_apex' : 'canon_me3';
    for (const view of ['far', 'middle', 'close']) {
      await start(buildScenario('battle_of_earth', rules, 1));
      // To the release of the dreadnoughts' battery, then on through the volley's flight and its arrival.
      console.log('  ', JSON.stringify(await run(60, 'b.sim.openingVolleys.released.length > 0')));
      // From behind and beside the allied line, looking down the range at the Reapers.
      if (view === 'far') await camera('tactical', undefined, { distance: 430, yaw: Math.PI + 0.55, pitch: 0.28, z: 10 });
      if (view === 'middle') await camera('tactical', 's.role==="reaper_destroyer" || s.role==="reaper_capital"', { distance: 260, yaw: 2.6, pitch: 0.25 });
      if (view === 'close') await camera('follow', `s.id===b.sim.getShip(b.sim.ships.find((x)=>x.role==="dreadnought"&&x.alive).targetId)?.id`, { distance: 200, yaw: 2.5 });
      await run(0.9); await shot(`${job}-${view}-1-volley-away`);
      await run(1.6); await shot(`${job}-${view}-2-arriving`);
      await run(0.5); await shot(`${job}-${view}-3-strike`);
      console.log('  ', JSON.stringify(await run(0.25))); await shot(`${job}-${view}-4-detonation`);
      await run(1.2); await shot(`${job}-${view}-5-cooling`);
      console.log('   peak', JSON.stringify(await peak()));
    }
  }
  if (job === 'torpedo') {
    await start(buildCustomBattle({ seed: 3, rulesId: 'multiverse_crossover', rosterMode: 'multiverse', environment: 'deep_space', startingDistanceKm: 110, maxDuration: 400,
      sideA: { faction: 'imperium', name: 'Battlefleet', formation: 'line_abreast', counts: { imperium_retribution: 1, imperium_lunar: 3 } },
      sideB: { faction: 'reaper', name: 'Reapers', formation: 'line_abreast', counts: { reaper_capital: 3, reaper_destroyer: 4 } } }));
    // Until a torpedo is running; then watch the hull it is running at until it goes off.
    await run(240, 'b.sim.missiles.some((m) => m.alive && m.weapon.id === "wh_torpedo")');
    await camera('tactical', `s.id===b.sim.missiles.find((m) => m.alive && m.weapon.id === "wh_torpedo").targetId`, { distance: 90, yaw: 2.5, pitch: 0.22 });
    console.log('  ', JSON.stringify(await run(240, 'b.view.effects.nuclear.liveParts > 0')));
    await page.evaluate(() => { const b = window.reaperwar.battle, s = b.sim.getShip(b.view.followId); if (s) b.view.rig.focus.set(s.pos.x * 10, s.pos.y * 10, s.pos.z * 10); for (let i = 0; i < 6; i++) b.view.rig.update(0.2, { fleetCentre: b.view.rig.focus }); b.view.render(); });
    await shot('torpedo-1-flash');
    await run(0.15); await shot('torpedo-2-vapour');
    await run(0.45); await shot('torpedo-3-cooling');
    await run(1.0); await shot('torpedo-4-gone');
    console.log('   peak', JSON.stringify(await peak()));
  }
  if (job === 'bridge') {
    await start(buildScenario('battle_of_earth', 'prime_apex', 1));
    await run(60, 'b.sim.openingVolleys.released.length > 0');
    await camera('cockpit', 's.role==="dreadnought" && s.side==="A"');
    await run(0.6); await shot('bridge-1-volley-away');
    await run(2.4); await shot('bridge-2-detonations');
    console.log('   peak', JSON.stringify(await peak()));
  }
  if (job === 'large') {
    await start(buildCustomBattle({ seed: 42, rulesId: 'prime_apex', environment: 'deep_space', startingDistanceKm: 60, maxDuration: 600,
      sideA: { faction: 'alliance', name: 'Alliance line', formation: 'line_abreast', counts: { alliance_dreadnought: 96, alliance_cruiser: 288, alliance_frigate: 480 } },
      sideB: { faction: 'reaper', name: 'Reaper pressure', formation: 'strike_wedge', counts: { reaper_capital: 128, reaper_destroyer: 480 } } }));
    await camera('tactical', undefined, { distance: 2600, yaw: 1.1, pitch: 0.45 });
    console.log('  ', JSON.stringify(await run(60, 'b.sim.openingVolleys.released.length > 0')));
    await run(3); await shot('large-1-opening');
    console.log('  ', JSON.stringify(await run(12))); await shot('large-2-engaged');
    console.log('   peak', JSON.stringify(await peak()));
  }
}
console.log('errors', JSON.stringify(errors));
await browser.close();
