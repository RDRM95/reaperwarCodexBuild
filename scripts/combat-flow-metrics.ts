/**
 * Headless combat-flow metrics (deterministic, read-only).
 *
 *   node --import tsx/esm scripts/combat-flow-metrics.ts <scenario> [seed] [seconds] [flags...]
 *
 * scenario  duel | duel_cr | mixed | mixed_hc | big | big_hc | big3d | boe |
 *           scenario:<id>   (any built-in scenario id, e.g. scenario:battle_of_earth)
 * seed      battle seed (default 1); seconds: simulated time (default 150)
 * flags     harmless      every weapon deals 0 damage: isolates geometry and
 *                         fire-control from attrition (movement, arcs, ranges,
 *                         cooldowns and targeting all stay live)
 *           series        print a telemetry row every 5 simulated seconds
 *           rules=<id>    rule preset for scenario:<id> (default canon_me3)
 *           hardcore      alias for rules=reaper_hardcore
 *
 * The summary reports, per fleet: engagement mode seconds (approach / hold /
 * retire), focus changes, heading swing and yaw-rate reversals, anchor path,
 * the hold band and the core line's distance to the movement objective after
 * contact, the minimum catch-up throttle, and the fraction of heavy guns with
 * an enemy in range / a live weapon solution after first contact (mean, min,
 * longest run below one half). Per class: main-gun shots, in-range seconds,
 * the share of in-range time without a solution, quiet (no main-gun shot for
 * 1.5 cooldowns + beam + 1 s while in range), chosen target out of range,
 * target switches, out-of-arc time, reverse thrust time, lateral fraction of
 * motion and hulls that were never in range / never fired. Metrics re-invoke
 * pure functions (weaponTarget) on post-step state and never advance the RNG.
 * Wall time is printed so performance regressions show up next to behaviour.
 */
import { performance } from 'node:perf_hooks';
import { buildCustomBattle, buildScenario } from '../src/scenarios';
import { BattleSimulation, SIM_DT } from '../src/simulation/battle';
import { fleetHoldBand } from '../src/simulation/ai';
import { inWeaponArc, weaponTarget, weaponWorldOffset } from '../src/simulation/fireControl';
import { distance, dot, length, normalize, sub } from '../src/core/vec3';
import type { BattleEvent, FleetState, ShipState } from '../src/simulation/types';
import type { FormationType } from '../src/simulation/types';
import type { FactionId } from '../src/data/types';

const [scenarioName = 'big', seedArg = '1', secondsArg = '150', ...flags] = process.argv.slice(2);
const seed = Number(seedArg);
const seconds = Number(secondsArg);
if (!Number.isFinite(seed) || !Number.isFinite(seconds) || seconds <= 0) throw new Error('usage: <scenario> [seed] [seconds] [harmless] [series] [rules=<id>]');
const harmless = flags.includes('harmless');
const series = flags.includes('series');
const rulesFlag = flags.find(f => f.startsWith('rules='))?.slice(6) ?? (flags.includes('hardcore') ? 'reaper_hardcore' : undefined);

interface Side { faction: FactionId; name: string; formation: FormationType; counts: Record<string, number> }
interface Custom { rulesId: string; distance: number; a: Side; b: Side; theatre?: 'three_dimensional' | 'legacy_plane' }

const alliance = (counts: Record<string, number>, formation: FormationType = 'defensive_screen'): Side => ({ faction: 'alliance', name: 'Fleet', formation, counts });
const reapers = (counts: Record<string, number>, formation: FormationType = 'strike_wedge'): Side => ({ faction: 'reaper', name: 'Harvest', formation, counts });
const BIG_A = { alliance_dreadnought: 12, alliance_cruiser: 24, alliance_frigate: 30, alliance_carrier: 1 };
const BIG_B = { reaper_capital: 8, reaper_destroyer: 30 };
const MIXED_A = { alliance_dreadnought: 3, alliance_cruiser: 6, alliance_frigate: 6 };
const MIXED_B = { reaper_capital: 2, reaper_destroyer: 6 };
const CUSTOM: Record<string, Custom> = {
  duel: { rulesId: 'canon_me3', distance: 75, a: alliance({ alliance_dreadnought: 1 }, 'line_abreast'), b: reapers({ reaper_capital: 1 }, 'line_abreast') },
  duel_cr: { rulesId: 'canon_me3', distance: 60, a: alliance({ alliance_cruiser: 1 }, 'line_abreast'), b: reapers({ reaper_destroyer: 1 }, 'line_abreast') },
  mixed: { rulesId: 'canon_me3', distance: 90, a: alliance(MIXED_A), b: reapers(MIXED_B) },
  mixed_hc: { rulesId: 'reaper_hardcore', distance: 90, a: alliance(MIXED_A), b: reapers(MIXED_B) },
  big: { rulesId: 'canon_me3', distance: 100, a: alliance(BIG_A), b: reapers(BIG_B) },
  big_hc: { rulesId: 'reaper_hardcore', distance: 100, a: alliance(BIG_A), b: reapers(BIG_B) },
  big3d: { rulesId: 'canon_me3', distance: 100, theatre: 'three_dimensional', a: alliance(BIG_A), b: reapers(BIG_B) },
};

const scenarioId = scenarioName === 'boe' ? 'battle_of_earth' : scenarioName.startsWith('scenario:') ? scenarioName.slice(9) : undefined;
const custom = scenarioId ? undefined : CUSTOM[scenarioName];
if (!scenarioId && !custom) throw new Error(`unknown scenario ${scenarioName}; use one of ${Object.keys(CUSTOM).join(', ')}, boe or scenario:<id>`);
const rulesId = rulesFlag ?? custom?.rulesId ?? 'canon_me3';
const config = scenarioId
  ? { ...buildScenario(scenarioId, rulesId, seed), maxDuration: seconds + 60 }
  : buildCustomBattle({
    seed, rulesId, environment: 'deep_space', startingDistanceKm: custom!.distance, maxDuration: seconds + 60,
    theatreLayout: custom!.theatre ?? 'legacy_plane', sideA: custom!.a, sideB: custom!.b,
  });
const sim = new BattleSimulation(config);
if (harmless) for (const ship of sim.ships) for (const w of ship.weapons) w.def = { ...w.def, damage: 0 };

const yawDeg = (h: { x: number; z: number }): number => Math.atan2(h.x, h.z) * 180 / Math.PI;
const wrap = (d: number): number => ((d + 540) % 360) - 180;
const round = (v: number, digits = 1): number => Number(v.toFixed(digits));
const isHeavy = (w: ShipState['weapons'][number]): boolean => w.def.antiCapital && w.def.arc < 180 && !w.def.antiSmall;

interface ShipTrack {
  cls: string; side: string; mainIndex?: number; mainRange: number; mainCooldown: number; mainBeam: number;
  mainShots: number; lastMainShot: number;
  inRangeSec: number; noSolutionSec: number; quietSec: number; targetOutOfRangeSec: number; outOfArcSec: number;
  targetSwitches: number; lastTarget?: string; reverseSec: number; lateralSum: number; movingSec: number;
  headingErrSum: number; headingErrN: number; speedMax: number; firstInRangeAt?: number; firstSolutionAt?: number; firstShotAt?: number; destroyedAt?: number;
}
interface FleetTrack {
  id: string; side: string; faction: string; modeFlips: number; lastMode?: string; modeSeconds: Record<string, number>;
  focusChanges: number; lastFocus?: string; headingSwing: number; lastYaw: number; yawReversals: number; lastYawRate: number;
  pathKm: number; lastAnchor: { x: number; y: number; z: number };
  holdBand?: { min: number; preferred: number; resume: number };
  contactAt?: number; firstHoldAt?: number; objectiveMin: number; objectiveMax: number; objectiveSum: number; objectiveN: number;
  catchupMin: number; solutionSamples: number[]; inRangeSamples: number[]; focusIds: Set<string>;
}

const tracks = new Map<string, ShipTrack>();
const fleetTracks = new Map<string, FleetTrack>();
const track = (s: ShipState): ShipTrack => {
  let t = tracks.get(s.id);
  if (!t) {
    const main = s.weapons.find(isHeavy);
    t = { cls: s.classId, side: s.side, mainIndex: main?.index, mainRange: main?.def.range ?? 0, mainCooldown: main?.def.cooldown ?? 0, mainBeam: main?.def.beamDuration ?? 0,
      mainShots: 0, lastMainShot: -Infinity, inRangeSec: 0, noSolutionSec: 0, quietSec: 0, targetOutOfRangeSec: 0, outOfArcSec: 0, targetSwitches: 0,
      reverseSec: 0, lateralSum: 0, movingSec: 0, headingErrSum: 0, headingErrN: 0, speedMax: 0 };
    tracks.set(s.id, t);
  }
  return t;
};
const fleetTrack = (f: FleetState): FleetTrack => {
  let t = fleetTracks.get(f.spec.id);
  if (!t) {
    t = { id: f.spec.id, side: f.spec.side, faction: f.spec.faction, modeFlips: 0, modeSeconds: {}, focusChanges: 0, headingSwing: 0, lastYaw: yawDeg(f.heading),
      yawReversals: 0, lastYawRate: 0, pathKm: 0, lastAnchor: { ...f.anchor }, objectiveMin: Infinity, objectiveMax: -Infinity, objectiveSum: 0, objectiveN: 0,
      catchupMin: Infinity, solutionSamples: [], inRangeSamples: [], focusIds: new Set() };
    fleetTracks.set(f.spec.id, t);
  }
  return t;
};

const shotsByWindow: Record<string, Record<string, number>> = {};
const destroyed: string[] = [];
const firstShot: Record<string, number> = {};
sim.onEvent = (e: BattleEvent) => {
  if (e.type === 'weapon_fired') {
    const s = sim.getShip(e.shipId);
    if (!s) return;
    const win = String(Math.floor(e.t / 30) * 30);
    const key = `${s.side}:${e.kind}`;
    (shotsByWindow[win] ??= {})[key] = (shotsByWindow[win][key] ?? 0) + 1;
    firstShot[s.side] ??= e.t;
    const t = track(s);
    t.firstShotAt ??= e.t;
    if (t.mainIndex !== undefined && e.weaponIndex === t.mainIndex) { t.mainShots++; t.lastMainShot = e.t; }
  } else if (e.type === 'ship_destroyed') {
    destroyed.push(`${e.t.toFixed(1)} ${e.classId}(${e.side}) by ${e.killerId ?? '?'}`);
    const t = tracks.get(e.shipId);
    if (t) t.destroyedAt = e.t;
  }
};

const rows: string[] = [];
const ticks = Math.round(seconds / SIM_DT);
const sampleEvery = Math.round(1 / SIM_DT);
const wallStart = performance.now();
for (let i = 0; i < ticks && !sim.finished; i++) {
  sim.step();
  const t = sim.time;
  const dt = SIM_DT;
  const sample = (i + 1) % sampleEvery === 0;
  for (const f of sim.fleets.values()) {
    const ft = fleetTrack(f);
    const mode = f.engagementMode ?? 'none';
    if (ft.lastMode !== undefined && mode !== ft.lastMode) ft.modeFlips++;
    ft.lastMode = mode;
    ft.modeSeconds[mode] = (ft.modeSeconds[mode] ?? 0) + dt;
    if (ft.lastFocus !== f.focusTargetId) { if (ft.lastFocus !== undefined) ft.focusChanges++; ft.lastFocus = f.focusTargetId; }
    if (f.focusTargetId) ft.focusIds.add(f.focusTargetId);
    const yaw = yawDeg(f.heading);
    const dyaw = wrap(yaw - ft.lastYaw);
    ft.headingSwing += Math.abs(dyaw);
    if (Math.abs(dyaw) > 1e-6 && Math.abs(ft.lastYawRate) > 1e-6 && Math.sign(dyaw) !== Math.sign(ft.lastYawRate)) ft.yawReversals++;
    if (Math.abs(dyaw) > 1e-6) ft.lastYawRate = dyaw;
    ft.lastYaw = yaw;
    ft.pathKm += distance(f.anchor, ft.lastAnchor);
    ft.lastAnchor = { ...f.anchor };
    const mine = sim.ships.filter(s => s.fleetId === f.spec.id && s.alive && !s.escaped && s.role !== 'fighter' && !s.withdrawing);
    if (!mine.length) continue;
    if (!ft.holdBand && f.engagementRange) {
      const capitals = mine.filter(s => s.role === 'dreadnought' || s.role === 'reaper_capital');
      const core = capitals.length ? capitals : mine.filter(s => s.role === 'cruiser' || s.role === 'reaper_destroyer');
      ft.holdBand = fleetHoldBand(core.length ? core : mine, f.engagementRange);
    }
    if (mode === 'hold' && ft.firstHoldAt === undefined) ft.firstHoldAt = t;
    if (sample) {
      const enemies = sim.enemiesOf(f.spec.side).filter(e => e.alive && !e.escaped && e.role !== 'fighter');
      let guns = 0, inRange = 0, solutions = 0;
      for (const s of mine) {
        const tr = track(s);
        if (tr.mainIndex === undefined) continue;
        guns++;
        const w = s.weapons[tr.mainIndex];
        const origin = weaponWorldOffset(s, w);
        if (enemies.some(e => distance(origin, e.pos) <= w.def.range)) inRange++;
        if (weaponTarget(s, f, w, id => sim.getShip(id), enemies)) solutions++;
      }
      if (guns) {
        const fraction = solutions / guns;
        if (ft.contactAt === undefined && inRange > 0) ft.contactAt = t;
        if (ft.contactAt !== undefined) {
          ft.solutionSamples.push(fraction);
          ft.inRangeSamples.push(inRange / guns);
          if (f.objectiveDistance !== undefined) {
            ft.objectiveMin = Math.min(ft.objectiveMin, f.objectiveDistance);
            ft.objectiveMax = Math.max(ft.objectiveMax, f.objectiveDistance);
            ft.objectiveSum += f.objectiveDistance; ft.objectiveN++;
          }
          if (f.catchup !== undefined) ft.catchupMin = Math.min(ft.catchupMin, f.catchup);
        }
      }
    }
  }
  for (const s of sim.ships) {
    if (!s.alive || s.escaped || s.role === 'fighter') continue;
    const tr = track(s);
    const speed = length(s.vel);
    tr.speedMax = Math.max(tr.speedMax, speed);
    if (speed > s.maxSpeed * 0.1) {
      tr.movingSec += dt;
      const axial = dot(s.vel, s.heading);
      tr.lateralSum += Math.sqrt(Math.max(0, speed * speed - axial * axial)) / speed * dt;
      if (axial < -0.25 * s.maxSpeed) tr.reverseSec += dt;
    }
    if (tr.lastTarget !== s.targetId) { if (tr.lastTarget !== undefined) tr.targetSwitches++; tr.lastTarget = s.targetId; }
    if (tr.mainIndex === undefined) continue;
    const w = s.weapons[tr.mainIndex];
    const origin = weaponWorldOffset(s, w);
    const enemies = sim.enemiesOf(s.side).filter(e => e.alive && !e.escaped && e.role !== 'fighter');
    let nearest = Infinity;
    for (const e of enemies) nearest = Math.min(nearest, distance(origin, e.pos));
    if (nearest > w.def.range) continue;
    tr.inRangeSec += dt;
    tr.firstInRangeAt ??= t;
    const fleet = sim.fleets.get(s.fleetId)!;
    const solution = weaponTarget(s, fleet, w, id => sim.getShip(id), enemies);
    if (solution) tr.firstSolutionAt ??= t; else tr.noSolutionSec += dt;
    if (t - tr.lastMainShot > tr.mainCooldown * 1.5 + tr.mainBeam + 1) tr.quietSec += dt;
    const target = s.targetId ? sim.getShip(s.targetId) : undefined;
    if (target?.alive && !target.escaped) {
      if (distance(origin, target.pos) > w.def.range) tr.targetOutOfRangeSec += dt;
      const to = normalize(sub(target.pos, s.pos));
      tr.headingErrSum += Math.acos(Math.max(-1, Math.min(1, dot(to, s.heading)))) * 180 / Math.PI;
      tr.headingErrN++;
      if (!inWeaponArc(s, w, target.pos)) tr.outOfArcSec += dt;
    }
  }
  if (series && (i + 1) % Math.round(5 / SIM_DT) === 0) {
    const parts = [`t=${t.toFixed(0).padStart(3)}`];
    for (const f of sim.fleets.values()) {
      const ft = fleetTrack(f);
      const last = ft.solutionSamples.length ? ft.solutionSamples[ft.solutionSamples.length - 1] : undefined;
      const lastRange = ft.inRangeSamples.length ? ft.inRangeSamples[ft.inRangeSamples.length - 1] : undefined;
      const focus = f.focusTargetId ? sim.getShip(f.focusTargetId)?.classId.replace('alliance_', '').replace('reaper_', 'r_') : '-';
      parts.push(`${f.spec.side}:${(f.engagementMode ?? '-').padEnd(8)} d=${f.objectiveDistance?.toFixed(1) ?? '-'} band=${ft.holdBand ? `${ft.holdBand.min.toFixed(1)}/${ft.holdBand.preferred.toFixed(1)}/${ft.holdBand.resume.toFixed(1)}` : '-'} catchup=${f.catchup?.toFixed(2) ?? '-'} yaw=${yawDeg(f.heading).toFixed(0)} focus=${focus} inRange=${lastRange === undefined ? '-' : (lastRange * 100).toFixed(0) + '%'} sol=${last === undefined ? '-' : (last * 100).toFixed(0) + '%'}`);
    }
    rows.push(parts.join(' | '));
  }
}
const wallMs = performance.now() - wallStart;

function longestRunBelow(samples: number[], threshold: number): number {
  let run = 0, longest = 0;
  for (const v of samples) { run = v < threshold ? run + 1 : 0; longest = Math.max(longest, run); }
  return longest;
}
const mean = (xs: number[]): number | null => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

const byClass = new Map<string, ShipTrack[]>();
for (const tr of tracks.values()) {
  const key = `${tr.side}:${tr.cls}`;
  const list = byClass.get(key) ?? [];
  list.push(tr);
  byClass.set(key, list);
}
const classes: Record<string, unknown> = {};
for (const [key, list] of byClass) {
  const guns = list.filter(tr => tr.mainIndex !== undefined);
  const sum = (f: (tr: ShipTrack) => number) => list.reduce((a, tr) => a + f(tr), 0);
  const inRange = sum(tr => tr.inRangeSec);
  const pct = (v: number) => inRange ? round(100 * v / inRange) : null;
  const moving = sum(tr => tr.movingSec);
  const headingN = sum(tr => tr.headingErrN);
  classes[key] = {
    n: list.length, mainRangeKm: round(list[0].mainRange, 2), mainShotsPerShip: round(sum(tr => tr.mainShots) / list.length),
    inRangeSecPerShip: round(inRange / list.length), noSolutionPctOfInRange: pct(sum(tr => tr.noSolutionSec)), quietPctOfInRange: pct(sum(tr => tr.quietSec)),
    targetOutOfRangePctOfInRange: pct(sum(tr => tr.targetOutOfRangeSec)), outOfArcPctOfInRange: pct(sum(tr => tr.outOfArcSec)),
    meanHeadingErrDeg: headingN ? round(sum(tr => tr.headingErrSum) / headingN) : null,
    targetSwitchesPerShip: round(sum(tr => tr.targetSwitches) / list.length), reverseSecPerShip: round(sum(tr => tr.reverseSec) / list.length),
    lateralFractionWhileMoving: moving ? round(sum(tr => tr.lateralSum) / moving, 2) : null, speedMaxKmS: round(Math.max(...list.map(tr => tr.speedMax)), 3),
    neverInRange: guns.filter(tr => tr.inRangeSec === 0).length, neverFiredMain: guns.filter(tr => tr.mainShots === 0).length,
    firstSolutionAt: guns.map(tr => tr.firstSolutionAt === undefined ? null : round(tr.firstSolutionAt)).sort((a, b) => (a ?? Infinity) - (b ?? Infinity)),
    destroyed: list.filter(tr => tr.destroyedAt !== undefined).length,
  };
}
const summary = {
  scenario: scenarioName, seed, rules: rulesId, harmless, simulated: round(sim.time, 2), finished: sim.finished, wallMs: round(wallMs, 0),
  result: sim.result ? { winner: sim.result.winner, reason: sim.result.reason } : undefined,
  firstShot, shotsByWindow, destroyedCount: destroyed.length, destroyed: destroyed.slice(0, 12),
  fleets: [...fleetTracks.values()].map(ft => ({
    id: ft.id, side: ft.side, faction: ft.faction, modeFlips: ft.modeFlips, modeSeconds: Object.fromEntries(Object.entries(ft.modeSeconds).map(([k, v]) => [k, round(v)])),
    firstHoldAt: ft.firstHoldAt === undefined ? null : round(ft.firstHoldAt), contactAt: ft.contactAt === undefined ? null : round(ft.contactAt),
    focusChanges: ft.focusChanges, distinctFocusTargets: ft.focusIds.size, headingSwingDeg: round(ft.headingSwing), yawRateReversals: ft.yawReversals, anchorPathKm: round(ft.pathKm, 2),
    holdBandKm: ft.holdBand ? { min: round(ft.holdBand.min, 2), preferred: round(ft.holdBand.preferred, 2), resume: round(ft.holdBand.resume, 2) } : null,
    objectiveDistanceAfterContactKm: ft.objectiveN ? { min: round(ft.objectiveMin, 2), mean: round(ft.objectiveSum / ft.objectiveN, 2), max: round(ft.objectiveMax, 2) } : null,
    catchupMinAfterContact: Number.isFinite(ft.catchupMin) ? round(ft.catchupMin, 2) : null,
    heavyGunsInRangeAfterContact: ft.inRangeSamples.length ? { mean: round(mean(ft.inRangeSamples)! * 100), min: round(Math.min(...ft.inRangeSamples) * 100) } : null,
    heavyGunSolutionsAfterContact: ft.solutionSamples.length ? { mean: round(mean(ft.solutionSamples)! * 100), min: round(Math.min(...ft.solutionSamples) * 100), longestRunBelowHalfSec: longestRunBelow(ft.solutionSamples, 0.5) } : null,
  })),
  classes,
};
console.log(JSON.stringify(summary, null, 1));
for (const row of rows) console.log(row);
