/**
 * Fleet silhouette metrics and plots for deployed battles (deterministic, headless).
 *
 *   node --import tsx/esm scripts/silhouette-metrics.ts [--out <dir>] [--seeds 1,2] [--cases a,b]
 *        [--repo <path>] [--no-png] [--json]
 *
 * Run it from a repository root. `--repo` (default: the current directory) names the checkout whose
 * src/ is measured, so one copy of this script can compare two checkouts: the `@/` alias inside the
 * measured sources resolves through the current directory's tsconfig, so run it from that same root.
 *
 * For every case and seed the script builds the real BattleConfig (custom builder or scenario, with the
 * UI's default three-dimensional theatre), deploys every fleet at t = 0 (arrival delays removed so late
 * waves are measured at their authored stations) and reports, per side (scripts/silhouette/metrics.ts):
 *   - extents in the side's heading basis (lateral x depth x height) and their ratios;
 *   - nearest-neighbour distance p10 / p50 / p90 and coefficient of variation;
 *   - heading diversity: distinct headings, yaw spread and the share within 5 deg of the modal heading;
 *   - local density on a 16 x 12 footprint grid and on fixed 6 km cells: CV and empty-cell share;
 *   - battlegroup repetition: the composer's battlegroup tags (single-linkage clusters at 2.4 km for
 *     layouts without tags) with a similarity-invariant shape signature; the "distinct pattern share"
 *     is distinct signatures / groups of three or more hulls;
 *   - reach: share of hulls outside the reserve and the depth of the committed capitals behind the
 *     fleet anchor (slot -z), the quantity the fleet's hold distance and per-hull leash must cover.
 * It also writes a dependency-free PNG per case and seed (top-down above, side view below) via node:zlib.
 * Nothing here touches the combat RNG; the numbers are pure functions of the configuration.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
import type { BattleConfig, ShipState, Side } from '../src/simulation/types';
import type { CustomBattleInput } from '../src/scenarios/index';
import { r2, silhouetteMetrics, type HullSample, type SideMetrics } from './silhouette/metrics';

type SimModule = typeof import('../src/simulation/battle');
type ScenarioModule = typeof import('../src/scenarios/index');

interface Case {
  id: string;
  label: string;
  /** Sides whose silhouette is the subject of the case; others are still plotted. */
  measure: Side[];
  build: (scenarios: ScenarioModule, seed: number) => BattleConfig;
}

const alliance = (dn: number, cr: number, fr: number): Record<string, number> =>
  ({ alliance_dreadnought: dn, alliance_cruiser: cr, alliance_frigate: fr });
const reapers = (capitals: number, destroyers: number): Record<string, number> =>
  ({ reaper_capital: capitals, reaper_destroyer: destroyers });
const custom = (seed: number, a: CustomBattleInput['sideA'], b: CustomBattleInput['sideB'], distance = 90): CustomBattleInput =>
  ({ seed, rulesId: 'canon_me3', environment: 'deep_space', startingDistanceKm: distance, maxDuration: 120,
    theatreLayout: 'three_dimensional', sideA: a, sideB: b });

const CASES: Case[] = [
  { id: 'alliance-200', label: 'Alliance mixed 200 (20/60/120) v 32 Reapers', measure: ['A'],
    build: (s, seed) => s.buildCustomBattle(custom(seed,
      { faction: 'alliance', name: 'Alliance 200', formation: 'line_abreast', counts: alliance(20, 60, 120) },
      { faction: 'reaper', name: 'Reaper wedge', formation: 'strike_wedge', counts: reapers(8, 24) })) },
  { id: 'alliance-1000', label: 'Alliance mixed 1000 (100/300/600) v 90 Reapers', measure: ['A'],
    build: (s, seed) => s.buildCustomBattle(custom(seed,
      { faction: 'alliance', name: 'Alliance 1000', formation: 'line_abreast', counts: alliance(100, 300, 600) },
      { faction: 'reaper', name: 'Reaper wedge', formation: 'strike_wedge', counts: reapers(30, 60) })) },
  { id: 'alliance-3000', label: 'Alliance mixed 3000 (300/900/1800) v 180 Reapers', measure: ['A'],
    build: (s, seed) => s.buildCustomBattle(custom(seed,
      { faction: 'alliance', name: 'Alliance 3000', formation: 'line_abreast', counts: alliance(300, 900, 1800) },
      { faction: 'reaper', name: 'Reaper wedge', formation: 'strike_wedge', counts: reapers(60, 120) })) },
  { id: 'alliance-cruisers-1000', label: 'Alliance 1000 cruisers v 90 Reapers', measure: ['A'],
    build: (s, seed) => s.buildCustomBattle(custom(seed,
      { faction: 'alliance', name: 'Cruiser fleet', formation: 'line_abreast', counts: { alliance_cruiser: 1000 } },
      { faction: 'reaper', name: 'Reaper wedge', formation: 'strike_wedge', counts: reapers(30, 60) })) },
  { id: 'reaper-300', label: 'Reaper 300 (100 capitals / 200 destroyers) v Alliance 200', measure: ['B'],
    build: (s, seed) => s.buildCustomBattle(custom(seed,
      { faction: 'alliance', name: 'Alliance 200', formation: 'line_abreast', counts: alliance(20, 60, 120) },
      { faction: 'reaper', name: 'Reaper 300', formation: 'strike_wedge', counts: reapers(100, 200) })) },
  { id: 'battle-of-earth', label: 'Battle of Earth (canon)', measure: ['A', 'B'],
    build: (s, seed) => s.buildScenario('battle_of_earth', 'canon_me3', seed, { theatre_layout: 'three_dimensional' }) },
  { id: 'final-battle', label: 'Final Battle of Earth (canon)', measure: ['A', 'B'],
    build: (s, seed) => s.buildScenario('final_battle_of_earth', 'canon_me3', seed, { theatre_layout: 'three_dimensional' }) },
];

// ------------------------------------------------------------------ arguments

const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const flag = (name: string): boolean => args.includes(`--${name}`);
const repo = resolve(option('repo') ?? process.cwd());
const outDir = resolve(option('out') ?? 'e2e-screenshots/silhouette');
const seeds = (option('seeds') ?? '1,2').split(',').map(Number).filter(Number.isFinite);
const wanted = option('cases')?.split(',').filter(Boolean);
const cases = wanted ? CASES.filter(c => wanted.includes(c.id)) : CASES;
if (!cases.length) throw new Error(`No cases matched. Known: ${CASES.map(c => c.id).join(', ')}`);
if (resolve(process.cwd()) !== repo) console.warn(`warning: run from ${repo} so its tsconfig resolves the '@/' alias of the measured sources`);

// ------------------------------------------------------------------- samples

/** Deployed hull as the metrics library sees it; tags are optional so older checkouts measure too. */
function sample(ship: ShipState): HullSample {
  const tagged = ship as unknown as { battlegroup?: number; echelon?: string };
  return { pos: ship.pos, heading: ship.heading, role: ship.role, battlegroup: tagged.battlegroup, echelon: tagged.echelon, slot: ship.slot };
}

// ----------------------------------------------------------------------- PNG

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
const crc32 = (bytes: Uint8Array): number => {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Uint8Array): Uint8Array => {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(type.split('').map(ch => ch.charCodeAt(0)), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
};

class Canvas {
  readonly data: Uint8Array;
  constructor(readonly width: number, readonly height: number) {
    this.data = new Uint8Array(width * height * 3);
  }
  fill(r: number, g: number, b: number): void { for (let i = 0; i < this.data.length; i += 3) { this.data[i] = r; this.data[i + 1] = g; this.data[i + 2] = b; } }
  set(x: number, y: number, r: number, g: number, b: number): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 3;
    this.data[i] = r; this.data[i + 1] = g; this.data[i + 2] = b;
  }
  rect(x: number, y: number, w: number, h: number, r: number, g: number, b: number): void {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, r, g, b);
  }
  png(): Uint8Array {
    const raw = new Uint8Array((this.width * 3 + 1) * this.height);
    for (let y = 0; y < this.height; y++) {
      raw[y * (this.width * 3 + 1)] = 0;
      raw.set(this.data.subarray(y * this.width * 3, (y + 1) * this.width * 3), y * (this.width * 3 + 1) + 1);
    }
    const header = new Uint8Array(13);
    const view = new DataView(header.buffer);
    view.setUint32(0, this.width); view.setUint32(4, this.height);
    header[8] = 8; header[9] = 2; header[10] = 0; header[11] = 0; header[12] = 0;
    const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', new Uint8Array(deflateSync(raw))), chunk('IEND', new Uint8Array())];
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let offset = 0;
    for (const p of parts) { out.set(p, offset); offset += p.length; }
    return out;
  }
}

const ROLE_SIZE: Record<string, number> = { reaper_capital: 4, dreadnought: 4, carrier: 4, cruiser: 3, reaper_destroyer: 3, frigate: 2, fighter: 1 };
const colour = (ship: ShipState): [number, number, number] => {
  const heavy = ship.role === 'dreadnought' || ship.role === 'carrier' || ship.role === 'reaper_capital';
  const mid = ship.role === 'cruiser' || ship.role === 'reaper_destroyer';
  const level = heavy ? 255 : mid ? 200 : 140;
  return ship.side === 'A' ? [Math.round(level * 0.45), Math.round(level * 0.75), level] : [level, Math.round(level * 0.45), Math.round(level * 0.35)];
};

/** Top-down (x right, z up the page) above a side view (x right, y up), common scale, 10 km bar. */
function plot(ships: ShipState[], path: string): void {
  const width = 1200, panel = 420, margin = 24;
  const canvas = new Canvas(width, panel * 2 + margin * 3);
  canvas.fill(12, 14, 20);
  const xs = ships.map(s => s.pos.x), ys = ships.map(s => s.pos.y), zs = ships.map(s => s.pos.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxZ - minZ, 1);
  const scale = (width - 2 * margin) / span;
  const sideScale = Math.min(scale, (panel - 2 * margin) / Math.max(maxY - minY, 4));
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, cy = (minY + maxY) / 2;
  // Panel frames.
  for (const top of [margin, panel + 2 * margin]) {
    canvas.rect(margin - 2, top - 2, width - 2 * margin + 4, 1, 60, 64, 80);
    canvas.rect(margin - 2, top + panel - margin, width - 2 * margin + 4, 1, 60, 64, 80);
  }
  const order = [...ships].sort((a, b) => ROLE_SIZE[a.role] - ROLE_SIZE[b.role]);
  for (const ship of order) {
    const [r, g, b] = colour(ship);
    const size = ROLE_SIZE[ship.role] ?? 2;
    const px = Math.round(width / 2 + (ship.pos.x - cx) * scale);
    const pz = Math.round(margin + panel / 2 - (ship.pos.z - cz) * scale);
    canvas.rect(px - (size >> 1), pz - (size >> 1), size, size, r, g, b);
    const py = Math.round(panel + 2 * margin + panel / 2 - (ship.pos.y - cy) * sideScale);
    canvas.rect(px - (size >> 1), py - (size >> 1), size, size, r, g, b);
  }
  // 10 km scale bars (horizontal scale is shared; the side panel's vertical scale may differ).
  canvas.rect(margin, margin + panel - margin - 6, Math.round(10 * scale), 2, 200, 200, 200);
  canvas.rect(margin, 2 * panel + 2 * margin - 6, Math.round(10 * scale), 2, 200, 200, 200);
  canvas.rect(margin + 4, 2 * panel + 2 * margin - 6 - Math.round(10 * sideScale), 2, Math.round(10 * sideScale), 200, 200, 200);
  writeFileSync(path, canvas.png());
}

// ---------------------------------------------------------------------- main

const simModule: SimModule = await import(pathToFileURL(resolve(repo, 'src/simulation/battle.ts')).href);
const scenarioModule: ScenarioModule = await import(pathToFileURL(resolve(repo, 'src/scenarios/index.ts')).href);
mkdirSync(outDir, { recursive: true });
const results: { case: string; label: string; seed: number; wallMs: number; sides: (SideMetrics & { side: Side })[] }[] = [];
for (const c of cases) {
  for (const seed of seeds) {
    const config = c.build(scenarioModule, seed);
    const deployed: BattleConfig = { ...config, fleets: config.fleets.map(f => ({ ...f, arrivalTime: undefined })) };
    const t0 = performance.now();
    const sim = new simModule.BattleSimulation(deployed);
    const wallMs = performance.now() - t0;
    const sides: (SideMetrics & { side: Side })[] = [];
    for (const side of c.measure) {
      const ships = sim.ships.filter(s => s.side === side && s.alive);
      if (ships.length < 3) continue;
      const headings = [...sim.fleets.values()].filter(f => f.spec.side === side).map(f => f.heading);
      sides.push({ side, ...silhouetteMetrics(ships.map(sample), headings) });
    }
    results.push({ case: c.id, label: c.label, seed, wallMs: r2(wallMs), sides });
    if (!flag('no-png')) plot(sim.ships.filter(s => s.alive), resolve(outDir, `${c.id}-s${seed}.png`));
    for (const m of sides) {
      if (flag('json')) { console.log(JSON.stringify({ case: c.id, seed, wallMs: r2(wallMs), ...m })); continue; }
      console.log(`${c.id} seed ${seed} side ${m.side}: ${m.hulls} hulls in ${m.fleets} fleet(s), deploy ${r2(wallMs)} ms`);
      console.log(`  extent lateral x depth x height ${m.extentKm.lateral} x ${m.extentKm.depth} x ${m.extentKm.height} km (L/D ${m.ratios.lateralOverDepth}, L/H ${m.ratios.lateralOverHeight})`);
      console.log(`  nearest neighbour p10/p50/p90 ${m.nearest.p10}/${m.nearest.p50}/${m.nearest.p90} km, CV ${m.nearest.cv}, min ${m.nearest.min}`);
      console.log(`  headings distinct ${m.headings.distinct}, yaw SD ${m.headings.yawSdDeg} deg, within 5 deg of mode ${m.headings.withinFiveDegOfMode}, fleet headings ${m.headings.fleetHeadingsDistinct}`);
      console.log(`  density 16x12 CV ${m.density.grid16x12Cv} empty ${m.density.grid16x12Empty}; 6 km cells CV ${m.density.cell6kmCv} empty ${m.density.cell6kmEmpty} (non-empty CV ${m.density.cell6kmNonEmptyCv})`);
      console.log(`  periodicity lateral ${m.periodicity.lateral.corr} @ ${m.periodicity.lateral.lagKm} km, depth ${m.periodicity.depth.corr} @ ${m.periodicity.depth.lagKm} km`);
      console.log(`  groups (${m.groups.method}): ${m.groups.clusters} groups (${m.groups.ofThreeOrMore} of 3+, ${m.groups.singletons} singletons, size CV ${m.groups.sizeCv}); compositions ${m.groups.distinctCompositions}; distinct patterns ${m.groups.distinctPatterns}/${m.groups.ofThreeOrMore} = ${m.groups.distinctPatternShare}; largest family ${m.groups.largestPatternFamily}` +
        (m.groups.echelons ? `; echelons ${JSON.stringify(m.groups.echelons)}` : ''));
      if (m.reach) console.log(`  reach: committed share ${m.reach.committedShare}; committed capital depth behind anchor p50/p90/max ${m.reach.capitalDepthP50Km}/${m.reach.capitalDepthP90Km}/${m.reach.capitalDepthMaxKm} km (${m.reach.capitals} capitals)`);
    }
  }
}
writeFileSync(resolve(outDir, 'metrics.json'), JSON.stringify({ repo, seeds, results }, null, 2));
if (!flag('json')) console.log(`wrote ${resolve(outDir, 'metrics.json')}${flag('no-png') ? '' : ' and one PNG per case and seed'}`);
