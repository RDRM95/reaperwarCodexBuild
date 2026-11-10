/**
 * Fleet silhouette metrics: pure functions over deployed hull samples, shared by
 * scripts/silhouette-metrics.ts (reports and plots) and tests/fleet-composer.test.ts
 * (pinned thresholds). Nothing here touches the simulation or its RNG.
 *
 * A sample is a hull at deployment: position, heading and role, plus the composer's
 * battlegroup and echelon tags and the fleet-local slot when the deployment carries them.
 */

export interface Point { x: number; y: number; z: number }

export interface HullSample {
  pos: Point;
  heading: Point;
  role: string;
  /** Battlegroup index from the composer; absent for layouts that carry no tags. */
  battlegroup?: number;
  /** Order-of-battle echelon from the composer. */
  echelon?: string;
  /** Fleet-local slot (x right, y up, z forward, simulation km): depth behind the anchor is -z. */
  slot?: Point;
}

export interface SideMetrics {
  hulls: number;
  fleets: number;
  extentKm: { lateral: number; depth: number; height: number };
  ratios: { lateralOverDepth: number; lateralOverHeight: number };
  nearest: { p10: number; p50: number; p90: number; mean: number; cv: number; min: number };
  headings: { distinct: number; yawSdDeg: number; withinFiveDegOfMode: number; fleetHeadingsDistinct: number };
  density: { grid16x12Cv: number; grid16x12Empty: number; cell6kmCv: number; cell6kmEmpty: number; cell6kmNonEmptyCv: number };
  periodicity: { lateral: { lagKm: number; corr: number }; depth: { lagKm: number; corr: number } };
  groups: {
    method: 'battlegroup-tags' | 'single-linkage-2.4km'; clusters: number; ofThreeOrMore: number; singletons: number; sizeCv: number;
    distinctCompositions: number; distinctPatterns: number; distinctPatternShare: number; largestPatternFamily: number; echelons?: Record<string, number>;
  };
  /** Depth of the committed capital line behind the fleet anchor (slot -z, km); absent without slots. */
  reach?: { committedShare: number; capitalDepthP50Km: number; capitalDepthP90Km: number; capitalDepthMaxKm: number; capitals: number };
}

export const r2 = (v: number): number => Math.round(v * 100) / 100;
export const r3 = (v: number): number => Math.round(v * 1000) / 1000;
export const mean = (v: number[]): number => v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
export const sd = (v: number[]): number => { const m = mean(v); return Math.sqrt(mean(v.map(x => (x - m) ** 2))); };
export const cv = (v: number[]): number => { const m = mean(v); return m > 0 ? sd(v) / m : 0; };
export const quantile = (sorted: number[], q: number): number => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0;
export const extent = (v: number[]): number => v.length ? Math.max(...v) - Math.min(...v) : 0;

const CAPITAL_ROLES = new Set(['dreadnought', 'carrier', 'reaper_capital']);

/** Hull coordinates in a side's mean-heading basis: lateral (right), depth (forward), height (up). */
export function sideBasis(hulls: HullSample[], headings: Point[]): { lateral: number[]; depth: number[]; height: number[]; forward: Point } {
  let fx = 0, fz = 0;
  for (const h of headings) { fx += h.x; fz += h.z; }
  const norm = Math.hypot(fx, fz) || 1;
  const forward = { x: fx / norm, y: 0, z: fz / norm };
  const right = { x: forward.z, y: 0, z: -forward.x };
  const cx = mean(hulls.map(s => s.pos.x)), cy = mean(hulls.map(s => s.pos.y)), cz = mean(hulls.map(s => s.pos.z));
  return {
    lateral: hulls.map(s => (s.pos.x - cx) * right.x + (s.pos.z - cz) * right.z),
    depth: hulls.map(s => (s.pos.x - cx) * forward.x + (s.pos.z - cz) * forward.z),
    height: hulls.map(s => s.pos.y - cy),
    forward,
  };
}

/** Nearest-neighbour distance of every point, grid-accelerated so thousands of hulls stay cheap. */
export function nearestNeighbours(points: Point[]): number[] {
  const n = points.length;
  const out = new Array<number>(n).fill(Infinity);
  if (n < 2) return out;
  // Cell size from a density estimate: a few points per cell keeps the search local.
  const xs = points.map(p => p.x), ys = points.map(p => p.y), zs = points.map(p => p.z);
  const volume = Math.max(1e-6, extent(xs)) * Math.max(1e-6, extent(ys)) * Math.max(1e-6, extent(zs));
  const cell = Math.max(0.5, Math.cbrt(volume / n) * 1.5);
  const cells = new Map<string, number[]>();
  const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;
  const index = (p: Point): [number, number, number] => [Math.floor(p.x / cell), Math.floor(p.y / cell), Math.floor(p.z / cell)];
  points.forEach((p, i) => { const k = key(...index(p)); const list = cells.get(k); if (list) list.push(i); else cells.set(k, [i]); });
  for (let i = 0; i < n; i++) {
    const [cx, cy, cz] = index(points[i]);
    // Widen the ring until a neighbour is found and the ring radius exceeds the best distance.
    for (let ring = 1; ring < 64; ring++) {
      for (let x = cx - ring; x <= cx + ring; x++) for (let y = cy - ring; y <= cy + ring; y++) for (let z = cz - ring; z <= cz + ring; z++) {
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy), Math.abs(z - cz)) !== ring && ring > 1) continue;
        for (const j of cells.get(key(x, y, z)) ?? []) {
          if (j === i) continue;
          const d = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y, points[i].z - points[j].z);
          if (d < out[i]) out[i] = d;
        }
      }
      if (out[i] < (ring - 0.5) * cell) break;
    }
  }
  return out;
}

export function densityGrid(lateral: number[], depth: number[], cols: number, rows: number): number[] {
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

export function fixedGrid(lateral: number[], depth: number[], cellKm: number): number[] {
  const cols = Math.max(1, Math.ceil(extent(lateral) / cellKm));
  const rows = Math.max(1, Math.ceil(extent(depth) / cellKm));
  return densityGrid(lateral, depth, cols, rows);
}

/** Peak autocorrelation of a 0.5 km occupancy profile for lags of 3 km or more: a lattice of equally
 * pitched battlegroups shows a strong peak at its pitch, an irregular order of battle does not. */
export function periodicity(values: number[]): { lagKm: number; corr: number } {
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
export function clusters(points: Point[], link: number): number[][] {
  const parent = points.map((_, i) => i);
  const find = (i: number): number => parent[i] === i ? i : (parent[i] = find(parent[i]));
  const cells = new Map<string, number[]>();
  const key = (p: Point): string => `${Math.floor(p.x / link)},${Math.floor(p.y / link)},${Math.floor(p.z / link)}`;
  points.forEach((p, i) => { const k = key(p); const cell = cells.get(k); if (cell) cell.push(i); else cells.set(k, [i]); });
  points.forEach((p, i) => {
    const cx = Math.floor(p.x / link), cy = Math.floor(p.y / link), cz = Math.floor(p.z / link);
    for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) for (let z = cz - 1; z <= cz + 1; z++) {
      for (const j of cells.get(`${x},${y},${z}`) ?? []) {
        if (j <= i) continue;
        const b = points[j];
        if (Math.hypot(p.x - b.x, p.y - b.y, p.z - b.z) <= link) parent[find(i)] = find(j);
      }
    }
  });
  const members = new Map<number, number[]>();
  points.forEach((_, i) => { const root = find(i); const list = members.get(root); if (list) list.push(i); else members.set(root, [i]); });
  return [...members.values()];
}

/** Similarity-invariant shape signature of one cluster in the lateral/depth plane. Rotation to the
 * principal frame removes yaw, RMS scaling removes size; coarse moment buckets absorb per-hull trims. */
export function shapeSignature(lateral: number[], depth: number[], roles: string[]): string {
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
  return [composition, `b${bands}`, `a${bucket(Math.log2(Math.min(aspect, 32)), 0.5)}`, `s${bucket(sMajor, 0.3)}`,
    `t${bucket(sMinor, 0.3)}`, `k${bucket(kurtosis, 0.6)}`, `c${bucket(curvature, 0.25)}`, `y${bucket(yaw, 30) % 6}`].join('|');
}

/** All silhouette metrics of one side's deployed hulls, in the side's mean-heading basis. */
export function silhouetteMetrics(hulls: HullSample[], fleetHeadings: Point[]): SideMetrics {
  const basis = sideBasis(hulls, fleetHeadings);
  const nn = nearestNeighbours(hulls.map(h => h.pos));
  const sortedNn = [...nn].sort((a, b) => a - b);
  const yawOf = (h: Point): number => Math.atan2(h.x * basis.forward.z - h.z * basis.forward.x, h.x * basis.forward.x + h.z * basis.forward.z) * 180 / Math.PI;
  const yaws = hulls.map(s => yawOf(s.heading));
  const bins = new Map<number, number>();
  for (const y of yaws) bins.set(Math.round(y), (bins.get(Math.round(y)) ?? 0) + 1);
  const mode = [...bins.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  const grid = densityGrid(basis.lateral, basis.depth, 16, 12);
  const fixed = fixedGrid(basis.lateral, basis.depth, 6);
  const fixedNonEmpty = fixed.filter(n => n > 0);
  // Battlegroup membership comes from the composer's tags when the deployment carries them (every hull
  // tagged); older layouts fall back to single-linkage clusters, a proxy that splits rows and merges
  // neighbours when the inter-group gap is no wider than the intra-group spacing.
  const tags = hulls.map(s => s.battlegroup);
  const tagged = tags.every(t => typeof t === 'number');
  const byTag = new Map<number, number[]>();
  if (tagged) tags.forEach((t, i) => { const list = byTag.get(t as number); if (list) list.push(i); else byTag.set(t as number, [i]); });
  const groups = tagged ? [...byTag.values()] : clusters(hulls.map(h => h.pos), 2.4);
  const big = groups.filter(g => g.length >= 3);
  const signatures = big.map(g => shapeSignature(g.map(i => basis.lateral[i]), g.map(i => basis.depth[i]), g.map(i => hulls[i].role)));
  const families = new Map<string, number>();
  for (const sig of signatures) families.set(sig, (families.get(sig) ?? 0) + 1);
  const compositions = new Set(groups.map(g => {
    const counts: Record<string, number> = {};
    for (const i of g) counts[hulls[i].role] = (counts[hulls[i].role] ?? 0) + 1;
    return JSON.stringify(counts);
  }));
  const echelonTags = hulls.map(s => s.echelon).filter((v): v is string => typeof v === 'string');
  const echelons: Record<string, number> = {};
  for (const e of echelonTags) echelons[e] = (echelons[e] ?? 0) + 1;
  const sizes = groups.map(g => g.length);
  const withSlots = hulls.filter(h => h.slot);
  let reach: SideMetrics['reach'];
  if (withSlots.length) {
    const committed = withSlots.filter(h => h.echelon !== 'reserve');
    const capitalDepths = committed.filter(h => CAPITAL_ROLES.has(h.role)).map(h => -h.slot!.z).sort((a, b) => a - b);
    reach = {
      committedShare: r3(committed.length / withSlots.length),
      capitalDepthP50Km: r2(quantile(capitalDepths, 0.5)), capitalDepthP90Km: r2(quantile(capitalDepths, 0.9)),
      capitalDepthMaxKm: r2(capitalDepths.length ? capitalDepths[capitalDepths.length - 1] : 0), capitals: capitalDepths.length,
    };
  }
  return {
    hulls: hulls.length,
    fleets: fleetHeadings.length,
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
    ...(reach ? { reach } : {}),
  };
}
