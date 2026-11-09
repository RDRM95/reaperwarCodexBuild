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
 * waves are measured at their authored stations) and reports, per side:
 *   - extents in the side's heading basis (lateral x depth x height) and their ratios;
 *   - nearest-neighbour distance p10 / p50 / p90 and coefficient of variation;
 *   - heading diversity: distinct headings, yaw spread and the share within 5 deg of the modal heading;
 *   - local density on a 16 x 12 footprint grid and on fixed 6 km cells: CV and empty-cell share;
 *   - battlegroup repetition: single-linkage clusters (2.4 km) with a similarity-invariant shape
 *     signature; the "distinct pattern share" is distinct signatures / clusters of three or more hulls.
 * It also writes a dependency-free PNG per case and seed (top-down above, side view below) via node:zlib.
 * Nothing here touches the combat RNG; the numbers are pure functions of the configuration.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
import type { BattleConfig, ShipState, Side } from '../src/simulation/types';
import type { CustomBattleInput } from '../src/scenarios/index';

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

// ------------------------------------------------------------------ geometry

interface P { x: number; y: number; z: number }
const r2 = (v: number): number => Math.round(v * 100) / 100;
const r3 = (v: number): number => Math.round(v * 1000) / 1000;
const mean = (v: number[]): number => v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
const sd = (v: number[]): number => { const m = mean(v); return Math.sqrt(mean(v.map(x => (x - m) ** 2))); };
const cv = (v: number[]): number => { const m = mean(v); return m > 0 ? sd(v) / m : 0; };
const quantile = (sorted: number[], q: number): number => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0;
const extent = (v: number[]): number => v.length ? Math.max(...v) - Math.min(...v) : 0;

/** Hull coordinates in a side's mean-heading basis: lateral (right), depth (forward), height (up). */
function sideBasis(ships: ShipState[], headings: P[]): { lateral: number[]; depth: number[]; height: number[]; forward: P } {
  let fx = 0, fz = 0;
  for (const h of headings) { fx += h.x; fz += h.z; }
  const norm = Math.hypot(fx, fz) || 1;
  const forward = { x: fx / norm, y: 0, z: fz / norm };
  const right = { x: forward.z, y: 0, z: -forward.x };
  const cx = mean(ships.map(s => s.pos.x)), cy = mean(ships.map(s => s.pos.y)), cz = mean(ships.map(s => s.pos.z));
  return {
    lateral: ships.map(s => (s.pos.x - cx) * right.x + (s.pos.z - cz) * right.z),
    depth: ships.map(s => (s.pos.x - cx) * forward.x + (s.pos.z - cz) * forward.z),
    height: ships.map(s => s.pos.y - cy),
    forward,
  };
}

function nearestNeighbours(ships: ShipState[]): number[] {
  const n = ships.length;
  const out = new Array<number>(n).fill(Infinity);
  for (let i = 0; i < n; i++) {
    const a = ships[i].pos;
    for (let j = i + 1; j < n; j++) {
      const b = ships[j].pos;
      const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      if (d < out[i]) out[i] = d;
      if (d < out[j]) out[j] = d;
    }
  }
  return out;
}

function densityGrid(lateral: number[], depth: number[], cols: number, rows: number): number[] {
  const minX = Math.min(...lateral), maxX = Math.max(...lateral);
  const minZ = Math.min(...depth), maxZ = Math.max(...depth);
  const bins = new Array<number>(cols * rows).fill(0);
  for (let i = 0; i < lateral.length; i++) {
    const c = Math.min(cols - 1, Math.floor((lateral[i] - minX) * cols / Math.max(1e-4, maxX - minX)));
    const r = Math.min(rows - 1, Math.floor((depth[i] - minZ) * rows / Math.max(1e-4, maxZ - minZ)));
    bins[r * cols + c]++;
  }
  return bins;
}

function fixedGrid(lateral: number[], depth: number[], cellKm: number): number[] {
  const cols = Math.max(1, Math.ceil(extent(lateral) / cellKm));
  const rows = Math.max(1, Math.ceil(extent(depth) / cellKm));
  return densityGrid(lateral, depth, cols, rows);
}

/** Peak autocorrelation of a 0.5 km occupancy profile for lags of 3 km or more: a lattice of equally
 * pitched battlegroups shows a strong peak at its pitch, an irregular order of battle does not. */
function periodicity(values: number[]): { lagKm: number; corr: number } {
  const binKm = 0.5;
  const min = Math.min(...values);
  const n = Math.max(8, Math.ceil(extent(values) / binKm) + 1);
  const profile = new Array<number>(n).fill(0);
  for (const v of values) profile[Math.min(n - 1, Math.floor((v - min) / binKm))]++;
  const pearson = (a: number[], b: number[]): number => {
    const ma = mean(a), mb = mean(b);
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < a.length; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
    return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
  };
  let best = { lagKm: 0, corr: 0 };
  for (let lag = Math.ceil(3 / binKm); lag < n / 2; lag++) {
    const c = pearson(profile.slice(0, n - lag), profile.slice(lag));
    if (c > best.corr) best = { lagKm: r2(lag * binKm), corr: r3(c) };
  }
  return best;
}

/** Single-linkage clusters at `link` km, grid-accelerated so thousands of hulls stay cheap. */
function clusters(ships: ShipState[], link: number): number[][] {
  const parent = ships.map((_, i) => i);
  const find = (i: number): number => parent[i] === i ? i : (parent[i] = find(parent[i]));
  const cells = new Map<string, number[]>();
  const key = (p: P): string => `${Math.floor(p.x / link)},${Math.floor(p.y / link)},${Math.floor(p.z / link)}`;
  ships.forEach((s, i) => { const k = key(s.pos); const cell = cells.get(k); if (cell) cell.push(i); else cells.set(k, [i]); });
  ships.forEach((s, i) => {
    const cx = Math.floor(s.pos.x / link), cy = Math.floor(s.pos.y / link), cz = Math.floor(s.pos.z / link);
    for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) for (let z = cz - 1; z <= cz + 1; z++) {
      for (const j of cells.get(`${x},${y},${z}`) ?? []) {
        if (j <= i) continue;
        const b = ships[j].pos;
        if (Math.hypot(s.pos.x - b.x, s.pos.y - b.y, s.pos.z - b.z) <= link) parent[find(i)] = find(j);
      }
    }
  });
  const members = new Map<number, number[]>();
  ships.forEach((_, i) => { const root = find(i); const list = members.get(root); if (list) list.push(i); else members.set(root, [i]); });
  return [...members.values()];
}

/** Similarity-invariant shape signature of one cluster in the lateral/depth plane. Rotation to the
 * principal frame removes yaw, RMS scaling removes size; coarse moment buckets absorb per-hull trims. */
function shapeSignature(lateral: number[], depth: number[], forward: P, roles: string[]): string {
  const n = lateral.length;
  const mx = mean(lateral), mz = mean(depth);
  const xs = lateral.map(v => v - mx), zs = depth.map(v => v - mz);
  let cxx = 0, czz = 0, cxz = 0;
  for (let i = 0; i < n; i++) { cxx += xs[i] * xs[i]; czz += zs[i] * zs[i]; cxz += xs[i] * zs[i]; }
  cxx /= n; czz /= n; cxz /= n;
  const theta = 0.5 * Math.atan2(2 * cxz, cxx - czz);
  const c = Math.cos(-theta), s = Math.sin(-theta);
  let major = xs.map((x, i) => x * c - zs[i] * s);
  let minor = xs.map((x, i) => x * s + zs[i] * c);
  const rms = Math.sqrt(mean(major.map((x, i) => x * x + minor[i] * minor[i]))) || 1;
  major = major.map(v => v / rms); minor = minor.map(v => v / rms);
  const skew = (v: number[]): number => { const d = sd(v); return d > 1e-6 ? mean(v.map(x => x ** 3)) / d ** 3 : 0; };
  // Orient the frame by the sign of the dominant skewness so mirror images stay distinct but a 180-degree
  // turn of the same pattern does not.
  let sMajor = skew(major), sMinor = skew(minor);
  if (Math.abs(sMajor) > 0.05 ? sMajor < 0 : sMinor < -0.05) { major = major.map(v => -v); minor = minor.map(v => -v); sMajor = -sMajor; sMinor = -sMinor; }
  const sdMajor = sd(major), sdMinor = sd(minor);
  const aspect = sdMinor > 1e-6 ? sdMajor / sdMinor : 99;
  const sortedMinor = [...minor].sort((a, b) => a - b);
  let bands = 1;
  for (let i = 1; i < sortedMinor.length; i++) if (sortedMinor[i] - sortedMinor[i - 1] > 0.22) bands++;
  // Arc or wedge curvature: least-squares parabola minor = k * major^2.
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += minor[i] * major[i] * major[i]; den += major[i] ** 4; }
  const curvature = den > 1e-9 ? num / den : 0;
  const kurtosis = sdMajor > 1e-6 ? mean(major.map(x => x ** 4)) / sdMajor ** 4 : 0;
  // Coarse yaw of the major axis against the fleet forward (30-degree bins): rotated copies read as the
  // same silhouette only when their tilt is also similar.
  const yaw = ((theta * 180 / Math.PI) % 180 + 180) % 180;
  const bucket = (v: number, size: number): number => Math.round(v / size);
  const composition = ['dreadnought', 'carrier', 'reaper_capital', 'cruiser', 'reaper_destroyer', 'frigate', 'fighter']
    .map(role => roles.filter(r => r === role).length > 0 ? role[0] : '').join('');
  void forward;
  return [composition, `b${bands}`, `a${bucket(Math.log2(Math.min(aspect, 32)), 0.5)}`, `s${bucket(sMajor, 0.3)}`,
    `t${bucket(sMinor, 0.3)}`, `k${bucket(kurtosis, 0.6)}`, `c${bucket(curvature, 0.25)}`, `y${bucket(yaw, 30) % 6}`].join('|');
}

interface SideMetrics {
  side: Side;
  fleets: number;
  hulls: number;
  extentKm: { lateral: number; depth: number; height: number };
  ratios: { lateralOverDepth: number; lateralOverHeight: number };
  nearest: { p10: number; p50: number; p90: number; mean: number; cv: number; min: number };
  headings: { distinct: number; yawSdDeg: number; withinFiveDegOfMode: number; fleetHeadingsDistinct: number };
  density: { grid16x12Cv: number; grid16x12Empty: number; cell6kmCv: number; cell6kmEmpty: number; cell6kmNonEmptyCv: number };
  periodicity: { lateral: { lagKm: number; corr: number }; depth: { lagKm: number; corr: number } };
  groups: { method: 'battlegroup-tags' | 'single-linkage-2.4km'; clusters: number; ofThreeOrMore: number; singletons: number; sizeCv: number;
    distinctCompositions: number; distinctPatterns: number; distinctPatternShare: number; largestPatternFamily: number; echelons?: Record<string, number> };
}

function measureSide(side: Side, ships: ShipState[], fleetHeadings: P[]): SideMetrics {
  const basis = sideBasis(ships, fleetHeadings);
  const nn = nearestNeighbours(ships);
  const sortedNn = [...nn].sort((a, b) => a - b);
  const yawOf = (h: P): number => Math.atan2(h.x * basis.forward.z - h.z * basis.forward.x, h.x * basis.forward.x + h.z * basis.forward.z) * 180 / Math.PI;
  const yaws = ships.map(s => yawOf(s.heading));
  const bins = new Map<number, number>();
  for (const y of yaws) bins.set(Math.round(y), (bins.get(Math.round(y)) ?? 0) + 1);
  const mode = [...bins.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  const grid = densityGrid(basis.lateral, basis.depth, 16, 12);
  const fixed = fixedGrid(basis.lateral, basis.depth, 6);
  const fixedNonEmpty = fixed.filter(n => n > 0);
  // Battlegroup membership comes from the composer's tags when the deployment carries them (every hull
  // tagged); older layouts fall back to single-linkage clusters, a proxy that splits rows and merges
  // neighbours when the inter-group gap is no wider than the intra-group spacing.
  const tags = ships.map(s => (s as unknown as { battlegroup?: number }).battlegroup);
  const tagged = tags.every(t => typeof t === 'number');
  const byTag = new Map<number, number[]>();
  if (tagged) tags.forEach((t, i) => { const list = byTag.get(t as number); if (list) list.push(i); else byTag.set(t as number, [i]); });
  const groups = tagged ? [...byTag.values()] : clusters(ships, 2.4);
  const big = groups.filter(g => g.length >= 3);
  const signatures = big.map(g => shapeSignature(g.map(i => basis.lateral[i]), g.map(i => basis.depth[i]), basis.forward, g.map(i => ships[i].role)));
  const families = new Map<string, number>();
  for (const sig of signatures) families.set(sig, (families.get(sig) ?? 0) + 1);
  const compositions = new Set(groups.map(g => {
    const counts: Record<string, number> = {};
    for (const i of g) counts[ships[i].role] = (counts[ships[i].role] ?? 0) + 1;
    return JSON.stringify(counts);
  }));
  const echelonTags = ships.map(s => (s as unknown as { echelon?: string }).echelon).filter((v): v is string => typeof v === 'string');
  const echelons: Record<string, number> = {};
  for (const e of echelonTags) echelons[e] = (echelons[e] ?? 0) + 1;
  const sizes = groups.map(g => g.length);
  return {
    side,
    fleets: fleetHeadings.length,
    hulls: ships.length,
    extentKm: { lateral: r2(extent(basis.lateral)), depth: r2(extent(basis.depth)), height: r2(extent(basis.height)) },
    ratios: { lateralOverDepth: r2(extent(basis.lateral) / Math.max(0.01, extent(basis.depth))), lateralOverHeight: r2(extent(basis.lateral) / Math.max(0.01, extent(basis.height))) },
    nearest: { p10: r2(quantile(sortedNn, 0.1)), p50: r2(quantile(sortedNn, 0.5)), p90: r2(quantile(sortedNn, 0.9)), mean: r2(mean(nn)), cv: r3(cv(nn)), min: r2(sortedNn[0] ?? 0) },
    headings: { distinct: new Set(yaws.map(y => Math.round(y * 2) / 2)).size, yawSdDeg: r2(sd(yaws)), withinFiveDegOfMode: r3(yaws.filter(y => Math.abs(y - mode) <= 5).length / yaws.length),
      fleetHeadingsDistinct: new Set(fleetHeadings.map(h => `${r3(h.x)},${r3(h.z)}`)).size },
    density: { grid16x12Cv: r3(cv(grid)), grid16x12Empty: r3(grid.filter(n => n === 0).length / grid.length), cell6kmCv: r3(cv(fixed)),
      cell6kmEmpty: r3(fixed.filter(n => n === 0).length / fixed.length), cell6kmNonEmptyCv: r3(cv(fixedNonEmpty)) },
    periodicity: { lateral: periodicity(basis.lateral), depth: periodicity(basis.depth) },
    groups: { method: tagged ? 'battlegroup-tags' : 'single-linkage-2.4km', clusters: groups.length, ofThreeOrMore: big.length, singletons: sizes.filter(n => n === 1).length, sizeCv: r3(cv(sizes)),
      distinctCompositions: compositions.size, distinctPatterns: families.size,
      distinctPatternShare: r3(big.length ? families.size / big.length : 1), largestPatternFamily: Math.max(0, ...families.values()),
      ...(echelonTags.length ? { echelons } : {}) },
  };
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
const results: { case: string; label: string; seed: number; wallMs: number; sides: SideMetrics[] }[] = [];
for (const c of cases) {
  for (const seed of seeds) {
    const config = c.build(scenarioModule, seed);
    const deployed: BattleConfig = { ...config, fleets: config.fleets.map(f => ({ ...f, arrivalTime: undefined })) };
    const t0 = performance.now();
    const sim = new simModule.BattleSimulation(deployed);
    const wallMs = performance.now() - t0;
    const sides: SideMetrics[] = [];
    for (const side of c.measure) {
      const ships = sim.ships.filter(s => s.side === side && s.alive);
      if (ships.length < 3) continue;
      const headings = [...sim.fleets.values()].filter(f => f.spec.side === side).map(f => f.heading);
      sides.push(measureSide(side, ships, headings));
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
    }
  }
}
writeFileSync(resolve(outDir, 'metrics.json'), JSON.stringify({ repo, seeds, results }, null, 2));
if (!flag('json')) console.log(`wrote ${resolve(outDir, 'metrics.json')}${flag('no-png') ? '' : ' and one PNG per case and seed'}`);
