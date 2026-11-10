import { beforeAll, describe, expect, it } from 'vitest';
import { distance, dot, length, v3 } from '@/core/vec3';
import { buildCustomBattle } from '@/scenarios';
import { BattleSimulation, SIM_DT } from '@/simulation/battle';
import { fleetHoldBand, formationCore, lineGeometry } from '@/simulation/ai';
import { weaponTarget, weaponWorldOffset } from '@/simulation/fireControl';
import type { FleetState, ShipState, WeaponState } from '@/simulation/types';

/** Keep real navigation, target selection, arcs and cooldowns live while
 * suppressing damage, so geometry is measured without attrition. */
function harmless(sim: BattleSimulation): void {
  for (const ship of sim.ships) for (const weapon of ship.weapons) weapon.def = { ...weapon.def, damage: 0 };
}

const isHeavyGun = (w: WeaponState): boolean => w.def.antiCapital && w.def.arc < 180 && !w.def.antiSmall;
const combatants = (sim: BattleSimulation, side: 'A' | 'B'): ShipState[] =>
  sim.ships.filter(s => s.side === side && s.alive && !s.escaped && s.role !== 'fighter');

interface FleetLog {
  contactAt?: number;
  firstHoldAt?: number;
  modeSeconds: Record<string, number>;
  modeFlips: number;
  lastMode?: string;
  minCatchup: number;
  inRange: number[];
  solutions: number[];
  /** Line distance samples from ten seconds after the first hold, once hulls have settled onto their stations. */
  distanceAfterHold: number[];
  headingSwing: number;
  lastYaw: number;
}

interface BattleLog {
  sim: BattleSimulation;
  fleets: Map<string, FleetLog>;
  firstSolution: Map<string, number>;
  heavyGuns: string[];
  reverseSeconds: Map<string, number>;
  distanceMismatch: number;
  lineAdvanceDrops: number;
  closeUpDrops: number;
}

const yaw = (h: { x: number; z: number }): number => Math.atan2(h.x, h.z);
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** Run a harmless battle and record the quantities the audit's probes report,
 * re-invoking only pure functions (weaponTarget) on post-step state. */
function run(sim: BattleSimulation, seconds: number): BattleLog {
  harmless(sim);
  const fleets = new Map<string, FleetLog>();
  for (const f of sim.fleets.values()) fleets.set(f.spec.id, { modeSeconds: {}, modeFlips: 0, minCatchup: Infinity, inRange: [], solutions: [], distanceAfterHold: [], headingSwing: 0, lastYaw: yaw(f.heading) });
  const heavyGuns = sim.ships.filter(s => s.role !== 'fighter' && s.weapons.some(isHeavyGun)).map(s => s.id);
  const firstSolution = new Map<string, number>();
  const reverseSeconds = new Map<string, number>();
  let distanceMismatch = 0, lineAdvanceDrops = 0, closeUpDrops = 0;
  const previousAdvance = new Map<string, Partial<Record<string, number>>>();
  const previousCloseUp = new Map<string, number>();
  const ticks = Math.round(seconds / SIM_DT);
  const sampleEvery = Math.round(1 / SIM_DT);
  for (let i = 0; i < ticks; i++) {
    sim.step();
    expect(sim.finished).toBe(false);
    const t = sim.time;
    const distances: number[] = [];
    for (const f of sim.fleets.values()) {
      const log = fleets.get(f.spec.id)!;
      const mode = f.engagementMode ?? 'none';
      if (log.lastMode !== undefined && log.lastMode !== mode) log.modeFlips++;
      log.lastMode = mode;
      log.modeSeconds[mode] = (log.modeSeconds[mode] ?? 0) + SIM_DT;
      if (mode === 'hold' && log.firstHoldAt === undefined) log.firstHoldAt = t;
      if (f.catchup !== undefined && log.contactAt !== undefined) log.minCatchup = Math.min(log.minCatchup, f.catchup);
      if (f.objectiveDistance !== undefined) distances.push(f.objectiveDistance);
      if (log.firstHoldAt !== undefined && t >= log.firstHoldAt + 10 && f.objectiveDistance !== undefined) log.distanceAfterHold.push(f.objectiveDistance);
      const y = yaw(f.heading);
      const turned = Math.abs(wrap(y - log.lastYaw));
      log.headingSwing += turned;
      log.lastYaw = y;
      // Role lines never step backward on their own: an extension shrinks at
      // most by what the anchor advanced, and only a retiring anchor moves the
      // whole formation back. Depth close-ups ratchet while the basis is still
      // (their bound follows the live bearing, so sub-0.1 km drift is not a drop).
      const slowest = Math.min(...combatants(sim, f.spec.side).filter(s => s.fleetId === f.spec.id).map(s => s.maxSpeed));
      const before = previousAdvance.get(f.spec.id);
      if (before && f.lineAdvance && mode !== 'retire') {
        for (const [role, value] of Object.entries(f.lineAdvance)) {
          const was = before[role];
          if (was !== undefined && value !== undefined && value < was - slowest * SIM_DT - 1e-6) lineAdvanceDrops++;
        }
      }
      previousAdvance.set(f.spec.id, { ...(f.lineAdvance ?? {}) });
      for (const s of combatants(sim, f.spec.side)) {
        if (s.fleetId !== f.spec.id) continue;
        const was = previousCloseUp.get(s.id);
        const now = s.closeUpKm ?? 0;
        if (was !== undefined && turned < 1e-9 && mode !== 'none' && now < was - 0.1) closeUpDrops++;
        previousCloseUp.set(s.id, now);
      }
    }
    if (distances.length === 2) distanceMismatch = Math.max(distanceMismatch, Math.abs(distances[0] - distances[1]));
    for (const s of sim.ships) {
      if (!s.alive || s.role === 'fighter') continue;
      const axial = dot(s.vel, s.heading);
      if (axial < -0.25 * s.maxSpeed) reverseSeconds.set(s.id, (reverseSeconds.get(s.id) ?? 0) + SIM_DT);
    }
    if ((i + 1) % sampleEvery !== 0) continue;
    for (const f of sim.fleets.values()) {
      const log = fleets.get(f.spec.id)!;
      const mine = combatants(sim, f.spec.side).filter(s => s.fleetId === f.spec.id && s.weapons.some(isHeavyGun));
      const enemies = combatants(sim, f.spec.side === 'A' ? 'B' : 'A');
      let inRange = 0, solutions = 0;
      for (const s of mine) {
        const w = s.weapons.find(isHeavyGun)!;
        const origin = weaponWorldOffset(s, w);
        if (enemies.some(e => distance(origin, e.pos) <= w.def.range)) inRange++;
        if (weaponTarget(s, f, w, id => sim.getShip(id), enemies)) {
          solutions++;
          if (!firstSolution.has(s.id)) firstSolution.set(s.id, t);
        }
      }
      if (!mine.length) continue;
      if (log.contactAt === undefined && inRange > 0) log.contactAt = t;
      if (log.contactAt !== undefined) {
        log.inRange.push(inRange / mine.length);
        log.solutions.push(solutions / mine.length);
      }
    }
  }
  return { sim, fleets, firstSolution, heavyGuns, reverseSeconds, distanceMismatch, lineAdvanceDrops, closeUpDrops };
}

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

describe('reach-aware battle lines in a wide, deep canon engagement (RC1)', () => {
  let log: BattleLog;
  beforeAll(() => {
    // The audit's "big" probe: 67 Alliance hulls in a 40 km wide, 34 km deep
    // battlegroup deployment against a 38-hull Reaper wedge. Before this
    // change 9 of 36 heavy guns never had an enemy in range in 150 s and the
    // Reaper fleet never left 'approach'.
    log = run(new BattleSimulation(buildCustomBattle({
      seed: 1, rulesId: 'canon_me3', environment: 'deep_space', startingDistanceKm: 100, maxDuration: 400, theatreLayout: 'legacy_plane',
      sideA: { faction: 'alliance', name: 'Fleet', formation: 'defensive_screen', counts: { alliance_dreadnought: 12, alliance_cruiser: 24, alliance_frigate: 30, alliance_carrier: 1 } },
      sideB: { faction: 'reaper', name: 'Harvest', formation: 'strike_wedge', counts: { reaper_capital: 8, reaper_destroyer: 30 } },
    })), 150);
  }, 180_000);

  it('gives every spinal and heavy mount a firing solution within 60 s of first contact', () => {
    const alliance = log.fleets.get('custom-a')!;
    const reapers = log.fleets.get('custom-b')!;
    expect(alliance.contactAt).toBeDefined();
    expect(reapers.contactAt).toBeDefined();
    for (const id of log.heavyGuns) {
      const ship = log.sim.getShip(id)!;
      const contact = (ship.side === 'A' ? alliance : reapers).contactAt!;
      const at = log.firstSolution.get(id);
      expect(at, `${id} never obtained a weapon solution`).toBeDefined();
      expect(at! - contact, `${id} needed ${(at! - contact).toFixed(1)} s after contact`).toBeLessThanOrEqual(60);
    }
  });

  it('keeps most heavy guns inside range of an enemy once contact is made', () => {
    // 89% of heavy guns averaged over the whole post-contact window (which
    // includes the 25 s approach ramp from first contact to the hold band);
    // the previous geometry left 25% of them permanently out of reach.
    const alliance = log.fleets.get('custom-a')!;
    expect(mean(alliance.inRange)).toBeGreaterThan(0.85);
    expect(mean(alliance.solutions)).toBeGreaterThan(0.75);
    expect(mean(log.fleets.get('custom-b')!.inRange)).toBeGreaterThan(0.85);
    // Once both lines are on station every Alliance heavy gun reaches something.
    const settled = alliance.inRange.slice(-60);
    expect(Math.min(...settled)).toBeGreaterThan(0.95);
  });

  it('measures one line distance for both fleets and lets the Reaper line reach its hold band', () => {
    expect(log.distanceMismatch).toBeLessThan(1e-6);
    const reapers = log.fleets.get('custom-b')!;
    expect(reapers.firstHoldAt).toBeDefined();
    expect(reapers.firstHoldAt! - reapers.contactAt!).toBeLessThanOrEqual(60);
    expect(reapers.modeSeconds.hold ?? 0).toBeGreaterThan(60);
    expect(reapers.minCatchup).toBeGreaterThan(0.5);
    expect(log.fleets.get('custom-a')!.minCatchup).toBeGreaterThan(0.5);
  });

  it('holds its ground without an advance/retire oscillation or wholesale reverse thrust', () => {
    const alliance = log.fleets.get('custom-a')!;
    expect(alliance.modeSeconds.retire ?? 0).toBeLessThanOrEqual(15);
    expect(alliance.modeFlips).toBeLessThanOrEqual(3);
    expect(log.lineAdvanceDrops).toBe(0);
    expect(log.closeUpDrops).toBe(0);
    const dreadnoughts = log.sim.ships.filter(s => s.role === 'dreadnought');
    const reverse = dreadnoughts.map(s => log.reverseSeconds.get(s.id) ?? 0);
    expect(mean(reverse)).toBeLessThan(10);
    for (const f of log.fleets.values()) expect(f.headingSwing * 180 / Math.PI).toBeLessThan(15);
  });
});

describe('hold is a band in both directions (RC5)', () => {
  let log: BattleLog;
  beforeAll(() => {
    // The audit's "mixed" probe, in which the Alliance anchor froze with its
    // catch-up throttle at zero while its hulls backed 5.8 km astern.
    log = run(new BattleSimulation(buildCustomBattle({
      seed: 1, rulesId: 'canon_me3', environment: 'deep_space', startingDistanceKm: 90, maxDuration: 400, theatreLayout: 'legacy_plane',
      sideA: { faction: 'alliance', name: 'TF', formation: 'defensive_screen', counts: { alliance_dreadnought: 3, alliance_cruiser: 6, alliance_frigate: 6 } },
      sideB: { faction: 'reaper', name: 'Harvest', formation: 'strike_wedge', counts: { reaper_capital: 2, reaper_destroyer: 6 } },
    })), 200);
  }, 120_000);

  it('keeps the anchor-to-enemy-line distance inside the hold band after arrival and never freezes the fleet', () => {
    const alliance = log.fleets.get('custom-a')!;
    const fleet = log.sim.fleets.get('custom-a')!;
    const core = formationCore(combatants(log.sim, 'A'));
    const band = fleetHoldBand(core, fleet.engagementRange!);
    expect(alliance.firstHoldAt).toBeDefined();
    expect(Math.min(...alliance.distanceAfterHold)).toBeGreaterThanOrEqual(band.min);
    expect(Math.max(...alliance.distanceAfterHold)).toBeLessThanOrEqual(band.resume);
    expect(alliance.minCatchup).toBeGreaterThan(0.5);
    expect(alliance.modeSeconds.retire ?? 0).toBeLessThan(10);
    expect(log.distanceMismatch).toBeLessThan(1e-6);
    for (const s of log.sim.ships.filter(ship => ship.role === 'dreadnought')) expect(log.reverseSeconds.get(s.id) ?? 0).toBeLessThan(2);
    expect(mean(alliance.solutions)).toBeGreaterThan(0.9);
  });

  it('gives ground at a deliberate pace to a short-range enemy pressing inside the minimum range, then stops', () => {
    const sim = new BattleSimulation(buildCustomBattle({
      seed: 3, rulesId: 'canon_me3', environment: 'deep_space', startingDistanceKm: 70, maxDuration: 400, theatreLayout: 'legacy_plane',
      sideA: { faction: 'alliance', name: 'Line', formation: 'line_abreast', counts: { alliance_dreadnought: 3 } },
      sideB: { faction: 'reaper', name: 'Pressure', formation: 'line_abreast', counts: { reaper_destroyer: 6 } },
    }));
    harmless(sim);
    const alliance = sim.fleets.get('custom-a')!;
    const dreadnoughts = sim.ships.filter(s => s.side === 'A');
    let retireSeconds = 0, retireEpisodes = 0, lastMode: string | undefined, path = 0, retireSpeedMax = 0;
    let last = { ...alliance.anchor };
    for (let i = 0; i < Math.round(180 / SIM_DT); i++) {
      sim.step();
      const mode = alliance.engagementMode;
      if (mode === 'retire') {
        retireSeconds += SIM_DT;
        if (lastMode !== 'retire') retireEpisodes++;
        retireSpeedMax = Math.max(retireSpeedMax, distance(alliance.anchor, last) / SIM_DT);
      }
      lastMode = mode;
      path += distance(alliance.anchor, last);
      last = { ...alliance.anchor };
    }
    expect(sim.finished).toBe(false);
    // Destroyers hold at 9.2 km, well inside the dreadnought band's 14.4 km
    // minimum: the line retires while they press, at half the slowest hull's
    // speed at most, and stops once they stop instead of chasing backwards.
    expect(retireSeconds).toBeGreaterThan(5);
    expect(retireSeconds).toBeLessThan(60);
    expect(retireEpisodes).toBeLessThanOrEqual(2);
    expect(retireSpeedMax).toBeLessThanOrEqual(Math.min(...dreadnoughts.map(s => s.maxSpeed)) * 0.5 + 1e-6);
    expect(alliance.engagementMode).toBe('hold');
    expect(path).toBeLessThan(45);
    for (const s of dreadnoughts) expect(s.stats.shotsFired).toBeGreaterThan(10);
  });
});

describe('line geometry', () => {
  function hull(id: string, side: 'A' | 'B', pos: { x: number; y: number; z: number }, vel = v3()): ShipState {
    return { id, side, pos, vel, pointValue: 100, alive: true, escaped: false, role: 'dreadnought' } as unknown as ShipState;
  }

  it('is symmetric: both fleets evaluating each other obtain the same distance along opposite bearings', () => {
    const a = [hull('a1', 'A', v3(-2, 0, 0)), hull('a2', 'A', v3(2, 0, 1)), hull('a3', 'A', v3(0, 0, -6)), hull('a4', 'A', v3(1, 0, -7))];
    const b = [hull('b1', 'B', v3(0, 0, 30), v3(0, 0, -0.3)), hull('b2', 'B', v3(3, 0, 34)), hull('b3', 'B', v3(-3, 0, 35)), hull('b4', 'B', v3(0, 0, 40))];
    const ab = lineGeometry(a, b)!;
    const ba = lineGeometry(b, a)!;
    expect(ab.distance).toBeCloseTo(ba.distance, 9);
    expect(ab.bearing.z).toBeGreaterThan(0.99);
    expect(ba.bearing.z).toBeLessThan(-0.99);
    // Leading quarters: a2 (z=1) and b1 (z=30): 29 km line to line, less than centre to centre.
    expect(ab.distance).toBeCloseTo(29, 1);
    expect(ab.distance).toBeLessThan(distance(ab.enemyCentre, a[0].pos) + 2);
    expect(ab.closing).toBeCloseTo(0.3 / 4 * (1 / 1), 1);
    expect(ba.closing).toBeLessThanOrEqual(0);
    expect(length(ab.bearing)).toBeCloseTo(1, 9);
  });

  it('derives the hold band from the core roles and keeps the resume margin above the preferred range', () => {
    const sim = new BattleSimulation(buildCustomBattle({
      seed: 1, rulesId: 'canon_me3', environment: 'deep_space', startingDistanceKm: 60, maxDuration: 60,
      sideA: { faction: 'alliance', name: 'A', formation: 'line_abreast', counts: { alliance_dreadnought: 2, alliance_cruiser: 2 } },
      sideB: { faction: 'reaper', name: 'B', formation: 'line_abreast', counts: { reaper_capital: 1 } },
    }));
    const core = formationCore(combatants(sim, 'A'));
    expect(core.every(s => s.role === 'dreadnought')).toBe(true);
    const band = fleetHoldBand(core, 20);
    expect(band.min).toBeCloseTo(14.4, 5);
    expect(band.preferred).toBeCloseTo(16.8, 5);
    expect(band.resume).toBeCloseTo(18.2, 5);
    expect(band.min).toBeLessThan(band.preferred);
    expect(band.preferred).toBeLessThan(band.resume);
  });

  it('exposes the fleet objective, bearing and both-way mode to the HUD and telemetry', () => {
    const sim = new BattleSimulation(buildCustomBattle({
      seed: 1, rulesId: 'canon_me3', environment: 'deep_space', startingDistanceKm: 60, maxDuration: 60,
      sideA: { faction: 'alliance', name: 'A', formation: 'line_abreast', counts: { alliance_dreadnought: 1 } },
      sideB: { faction: 'reaper', name: 'B', formation: 'line_abreast', counts: { reaper_capital: 1 } },
    }));
    sim.step();
    const fleet: FleetState = sim.fleets.get('custom-a')!;
    expect(fleet.objective).toBeDefined();
    expect(fleet.objectiveFront).toBeDefined();
    expect(fleet.objectiveBearing!.z).toBeGreaterThan(0.99);
    expect(fleet.objectiveDistance).toBeGreaterThan(20);
    expect(fleet.engagementMode).toBe('approach');
  });
});
