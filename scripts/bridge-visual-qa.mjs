// Visual QA of the modelled bridges: drive the built app and capture the Cockpit camera on several warships.
// Usage: node scripts/bridge-visual-qa.mjs <outDir> [baseUrl]      (the app must be served: npm run build && npm run preview)
// Software rendering in a container is not proof of how it looks on a graphics card.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const outDir = process.argv[2] ?? 'bridge-qa';
const base = process.argv[3] ?? 'http://localhost:4173';
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];

/** One battle: launch `scenario`, run it `seconds`, pause, hide the interface, then take each shot. */
async function battle(scenario, seconds, bloom, shots) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.goto(base + '/');
  await page.waitForSelector('[data-menu="quick-battle"]', { timeout: 60_000 });
  await page.evaluate(({ scenario, bloom }) => { const app = window.reaperwar; if (bloom !== undefined) app.prefs.graphics.bloom = bloom; app.show('briefing', { scenarioId: scenario }); }, { scenario, bloom });
  await page.click('[data-action="launch"]');
  await page.waitForSelector('[data-action="pause"]', { timeout: 60_000 });
  await page.evaluate((secs) => { const b = window.reaperwar.battle; const t = b.sim.time + secs; while (!b.sim.finished && b.sim.time < t) b.sim.step(); }, seconds);
  await page.click('[data-action="pause"]');
  await page.evaluate(() => { const b = window.reaperwar.battle; while (b.hudLevel !== 'none') b.toggleHud(); });
  for (const [name, pick, keys = [], prepare] of shots) {
    const found = await page.evaluate(({ pick, prepare }) => {
      const b = window.reaperwar.battle;
      const s = b.sim.ships.find(new Function('b', `return (s) => s.alive && !s.escaped && (${pick})`)(b)); // eslint-disable-line no-new-func
      if (!s) return null;
      if (prepare) new Function('s', prepare)(s); // eslint-disable-line no-new-func
      b.view.followId = s.id; b.setCamera('tactical'); b.setCamera('cockpit');
      return `${s.name} (${s.classId})`;
    }, { pick, prepare });
    if (!found) { console.log('no ship for', name); continue; }
    for (const key of keys) await page.keyboard.down(key);
    await page.waitForTimeout(2200);
    await page.screenshot({ path: `${outDir}/${name}.jpg`, type: 'jpeg', quality: 82 });
    for (const key of keys) await page.keyboard.up(key);
    console.log('captured', name, found, 'interior:', await page.evaluate(() => window.reaperwar.battle.view.interiorActive));
  }
  await page.close();
}

const ours = 's.side === b.config.perspectiveSide';
await battle('battle_of_earth', 34, undefined, [
  ['alliance-dreadnought-ahead', `s.role === "dreadnought" && ${ours} && s.hull > s.maxHull * 0.8`],
  ['alliance-dreadnought-port', `s.role === "dreadnought" && ${ours} && s.hull > s.maxHull * 0.8`, ['ArrowLeft']],
  ['alliance-dreadnought-rail', `s.role === "dreadnought" && ${ours} && s.hull > s.maxHull * 0.8`, ['ArrowDown']],
  ['alliance-dreadnought-overhead', `s.role === "dreadnought" && ${ours} && s.hull > s.maxHull * 0.8`, ['ArrowUp']],
  ['alliance-cruiser-starboard', `s.role === "cruiser" && ${ours}`, ['ArrowRight']],
  ['alliance-frigate-ahead', `s.role === "frigate" && ${ours}`],
  ['alliance-dreadnought-hull-failing', `s.role === "dreadnought" && ${ours}`, [], 's.hull = s.maxHull * 0.2; s.barriers = 0;'],
]);
await battle('final_battle_of_earth', 34, undefined, [
  ['turian-dreadnought-ahead', 's.faction === "turian" && s.role === "dreadnought"'],
  ['asari-flagship-ahead', 's.faction === "asari" && s.role !== "fighter"'],
  ['geth-dreadnought-port', 's.faction === "geth" && s.role !== "fighter"', ['ArrowLeft']],
  ['quarian-ahead', 's.faction === "quarian" && s.role !== "fighter"'],
]);
// Without bloom the bridge is drawn straight to the picture, by another path: one shot of it.
await battle('battle_of_earth', 34, false, [['alliance-dreadnought-no-bloom', `s.role === "dreadnought" && ${ours} && s.hull > s.maxHull * 0.8`]]);
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
process.exit(errors.length ? 1 : 0);
