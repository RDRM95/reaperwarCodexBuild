import { describe, expect, it } from 'vitest';
import { rotateY, v3 } from '@/core/vec3';
import { buildCustomBattle, buildScenario, type CustomBattleInput } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import {
  CURRENT_FLEET_LAYOUT_VERSION, FLEET_LAYOUT_VERSION_KEY, assignSlots, composeFleetLayout, parseFleetLayoutVersion,
  type FleetLayout, type SlotShip,
} from '@/simulation/formations';
import { silhouetteMetrics, type HullSample } from '../scripts/silhouette/metrics';

/*
 * Thresholds below are pinned from measured values of the version-2 composer
 * (scripts/silhouette-metrics.ts, seeds 1 and 2, 9 November 2026) with a margin:
 * they describe the order-of-battle silhouette, not one exact geometry.
 */

const group = (count: number, role: SlotShip['role'], lengthKm: number, prefix = role): SlotShip[] =>
  Array.from({ length: count }, (_, i) => ({ id: `${prefix}-${i}`, role, lengthKm }));
const allianceMixed = (dn: number, cr: number, fr: number): SlotShip[] =>
  [...group(dn, 'dreadnought', 0.888), ...group(cr, 'cruiser', 0.5), ...group(fr, 'frigate', 0.17)];
const reaperFleet = (capitals: number, destroyers: number): SlotShip[] =>
  [...group(capitals, 'reaper_capital', 2), ...group(destroyers, 'reaper_destroyer', 0.16)];

/** Dreadnought main battery at BATTLESPACE_SCALE: 50 km nominal, 20 km in simulation units. */
const DREADNOUGHT_RANGE_KM = 20;
const REAPER_RANGE_KM = 21.6;

function samples(ships: SlotShip[], layout: FleetLayout): HullSample[] {
  return ships.map(s => ({
    pos: layout.slots.get(s.id)!, heading: rotateY(v3(0, 0, 1), layout.headingTrims.get(s.id) ?? 0), role: s.role,
    battlegroup: layout.battlegroups.get(s.id), echelon: layout.echelons.get(s.id), slot: layout.slots.get(s.id),
  }));
}
const metrics = (ships: SlotShip[], layout: FleetLayout) => silhouetteMetrics(samples(ships, layout), [v3(0, 0, 1)]);
const degrees = (rad: number): number => rad * 180 / Math.PI;
const isCapital = (s: SlotShip): boolean => s.role === 'dreadnought' || s.role === 'carrier' || s.role === 'reaper_capital';

describe('order-of-battle fleet composer', () => {
  const fleet = allianceMixed(100, 300, 600);
  const options = { engagementRangeKm: DREADNOUGHT_RANGE_KM, faction: 'alliance' as const };

  it('is deterministic for a seed and distinct between seeds', () => {
    const a = composeFleetLayout(fleet, 'line_abreast', 391, options);
    const again = composeFleetLayout(fleet, 'line_abreast', 391, options);
    expect(again.slots).toEqual(a.slots);
    expect(again.headingTrims).toEqual(a.headingTrims);
    expect(again.battlegroups).toEqual(a.battlegroups);
    expect(again.echelons).toEqual(a.echelons);
    expect(new Set(a.slots.keys())).toEqual(new Set(fleet.map(s => s.id)));
    const b = composeFleetLayout(fleet, 'line_abreast', 762, options);
    expect(b.slots).not.toEqual(a.slots);
    expect(b.echelons).not.toEqual(a.echelons);
  });

  it('keeps every hull clear of every other after the clearance pass', () => {
    for (const seed of [1, 2]) {
      const layout = composeFleetLayout(fleet, 'line_abreast', seed, options);
      const positions = fleet.map(s => layout.slots.get(s.id)!);
      let worst = Infinity;
      for (let i = 0; i < fleet.length; i++) {
        expect(Number.isFinite(positions[i].x + positions[i].y + positions[i].z)).toBe(true);
        for (let j = 0; j < i; j++) {
          const a = positions[i], b = positions[j];
          worst = Math.min(worst, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) - (fleet[i].lengthKm + fleet[j].lengthKm) * 0.55);
        }
      }
      expect(worst).toBeGreaterThanOrEqual(-1e-8);
    }
  });

  it('bounds the committed depth by reach so rear ranks can bear from the hold point', () => {
    for (const seed of [1, 2]) {
      const layout = composeFleetLayout(fleet, 'line_abreast', seed, options);
      const m = metrics(fleet, layout);
      // Organics hold at 0.84 of range with a 0.55-range per-hull leash: a committed
      // capital can bear from at most 0.71 range behind the anchor. Measured p90 /
      // max 10.0-13.0 km against 20 km range; the legacy lattice put 88 % of a
      // 1000-hull fleet's dreadnoughts beyond that (combat audit FS4).
      expect(m.reach!.capitalDepthMaxKm).toBeLessThanOrEqual(DREADNOUGHT_RANGE_KM * 0.7);
      expect(m.reach!.capitalDepthP50Km).toBeLessThanOrEqual(DREADNOUGHT_RANGE_KM * 0.5);
      expect(m.reach!.committedShare).toBeGreaterThanOrEqual(0.75);
      // Reserve ranks are tagged, never silently parked: every hull carries an echelon.
      expect(fleet.every(s => layout.echelons.get(s.id) !== undefined)).toBe(true);
      expect(m.extentKm.depth).toBeLessThan(m.extentKm.lateral * 0.25);
    }
  });

  it('gives hulls their own headings, capitals within a disciplined gun-line sector', () => {
    for (const seed of [1, 2]) {
      const layout = composeFleetLayout(fleet, 'line_abreast', seed, options);
      const m = metrics(fleet, layout);
      const groups = new Set(layout.battlegroups.values()).size;
      expect(m.headings.distinct).toBeGreaterThanOrEqual(groups);
      // Measured 0.34-0.46 of hulls within 5 degrees of the modal heading; the
      // legacy deployment had every hull exactly parallel (1.0).
      expect(m.headings.withinFiveDegOfMode).toBeLessThan(0.6);
      expect(m.headings.yawSdDeg).toBeGreaterThan(5);
      for (const s of fleet) {
        const trim = Math.abs(degrees(layout.headingTrims.get(s.id)!));
        expect(trim).toBeLessThanOrEqual(isCapital(s) ? 8 + 1e-9 : 20 + 1e-9);
      }
    }
  });

  it('composes concentrations and gaps rather than a lattice', () => {
    for (const seed of [1, 2]) {
      const m = metrics(fleet, composeFleetLayout(fleet, 'line_abreast', seed, options));
      // 16 x 12 footprint grid: measured CV 0.97-1.18 and empty share 0.25-0.35
      // (legacy lattice 0.93-1.06 CV, 0.23-0.33 empty, with a regular pitch).
      expect(m.density.grid16x12Cv).toBeGreaterThan(0.8);
      expect(m.density.grid16x12Empty).toBeGreaterThan(0.2);
      expect(m.groups.echelons!.main).toBeGreaterThan(fleet.length * 0.5);
      expect(Object.keys(m.groups.echelons!).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('stands echelons in altitude bands proportional to width, within reach, with clearance', () => {
    // Measured height / width: 200 hulls 0.11-0.16, 1000 hulls 0.11, 90 hulls
    // 0.13-0.14; before the bands every organic deployment was 3-6 % tall.
    for (const [ships, range] of [[fleet, DREADNOUGHT_RANGE_KM], [allianceMixed(20, 60, 120), DREADNOUGHT_RANGE_KM]] as [SlotShip[], number][]) {
      for (const seed of [1, 2]) {
        const layout = composeFleetLayout(ships, 'line_abreast', seed, { engagementRangeKm: range, faction: 'alliance' });
        const m = metrics(ships, layout);
        expect(m.extentKm.height).toBeGreaterThanOrEqual(m.extentKm.lateral * 0.1);
        // Every band stays within the reach cap: 0.6 of the fleet range above or below the line.
        expect(m.extentKm.height).toBeLessThanOrEqual(2 * 0.6 * range + 2.5);
        // Group altitudes are not three or four even strata: no 0.5 km bin holds
        // more than a fifth of the groups (measured 7-13 %) and the groups occupy
        // at least 0.35 bins each (measured 0.45-0.93).
        const groupAltitude = new Map<number, number>();
        for (const s of ships) groupAltitude.set(layout.battlegroups.get(s.id)!, layout.slots.get(s.id)!.y);
        const bins = new Map<number, number>();
        for (const y of groupAltitude.values()) bins.set(Math.round(y * 2), (bins.get(Math.round(y * 2)) ?? 0) + 1);
        expect(bins.size).toBeGreaterThanOrEqual(groupAltitude.size * 0.35);
        expect(Math.max(...bins.values())).toBeLessThanOrEqual(groupAltitude.size * 0.2);
        const positions = ships.map(s => layout.slots.get(s.id)!);
        let worst = Infinity;
        for (let i = 0; i < ships.length; i++) for (let j = 0; j < i; j++) {
          const a = positions[i], b = positions[j];
          worst = Math.min(worst, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) - (ships[i].lengthKm + ships[j].lengthKm) * 0.55);
        }
        expect(worst).toBeGreaterThanOrEqual(-1e-8);
      }
    }
    // A 3000-hull line is wider than its guns can reach vertically: its height is
    // bounded by the reach cap (measured 25.5 km against 455-489 km of width).
    const wide = allianceMixed(300, 900, 1800);
    const m = metrics(wide, composeFleetLayout(wide, 'line_abreast', 1, options));
    expect(m.extentKm.height).toBeGreaterThan(m.extentKm.lateral * 0.04);
    expect(m.extentKm.height).toBeLessThanOrEqual(2 * 0.6 * DREADNOUGHT_RANGE_KM + 2.5);
    // Reaper horns and pickets stand whole layer pitches off the body, never a
    // fraction of one, so the exact wing pitch survives (checked below too).
    const reapers = reaperFleet(100, 200);
    const reaperLayout = composeFleetLayout(reapers, 'strike_wedge', 1, { engagementRangeKm: REAPER_RANGE_KM, faction: 'reaper' });
    expect(metrics(reapers, reaperLayout).extentKm.height).toBeGreaterThan(6);
  });

  it('gives at least 60 % of battlegroups a distinct pattern in large fleets', () => {
    const cases: [string, SlotShip[], number][] = [
      ['mixed 1000', fleet, DREADNOUGHT_RANGE_KM],
      ['cruisers 1000', group(1000, 'cruiser', 0.5), 36 * 0.4],
      ['mixed 200', allianceMixed(20, 60, 120), DREADNOUGHT_RANGE_KM],
    ];
    for (const [, ships, range] of cases) for (const seed of [1, 2]) {
      const m = metrics(ships, composeFleetLayout(ships, 'line_abreast', seed, { engagementRangeKm: range, faction: 'alliance' }));
      expect(m.groups.method).toBe('battlegroup-tags');
      // Measured 0.63-0.67 for single-class cruisers, 0.88-0.93 for mixed fleets.
      expect(m.groups.distinctPatternShare).toBeGreaterThanOrEqual(0.6);
    }
  });

  it('keeps Reaper fronts exact, ordered and committed while varying their order of battle', () => {
    const reapers = reaperFleet(100, 200);
    const a = composeFleetLayout(reapers, 'strike_wedge', 1, { engagementRangeKm: REAPER_RANGE_KM, faction: 'reaper' });
    const b = composeFleetLayout(reapers, 'strike_wedge', 2, { engagementRangeKm: REAPER_RANGE_KM, faction: 'reaper' });
    expect(a.slots).not.toEqual(b.slots);
    for (const layout of [a, b]) {
      const m = metrics(reapers, layout);
      expect(m.nearest.cv).toBeLessThan(0.3);
      expect(m.reach!.committedShare).toBe(1);
      expect(m.groups.distinctPatternShare).toBeGreaterThanOrEqual(0.5);
      for (const s of reapers) expect(Math.abs(degrees(layout.headingTrims.get(s.id)!))).toBeLessThanOrEqual(s.role === 'reaper_capital' ? 5 + 1e-9 : 10 + 1e-9);
      // Capital pairs keep the exact wave pitch: two-kilometre hulls at 3.4 km.
      const capitals = reapers.filter(s => s.role === 'reaper_capital').map(s => layout.slots.get(s.id)!);
      let closest = Infinity;
      for (let i = 0; i < capitals.length; i++) for (let j = 0; j < i; j++) closest = Math.min(closest, Math.hypot(capitals[i].x - capitals[j].x, capitals[i].y - capitals[j].y, capitals[i].z - capitals[j].z));
      expect(closest).toBeGreaterThanOrEqual(3.3);
    }
  });

  it('leaves small nominal layouts exactly where they were, with bounded trims', () => {
    const small = [...group(4, 'dreadnought', 0.888), ...group(6, 'cruiser', 0.55)];
    const layout = composeFleetLayout(small, 'line_abreast', 5, { layoutVersion: 2 });
    expect(layout.slots).toEqual(composeFleetLayout(small, 'line_abreast', 5, { layoutVersion: 1 }).slots);
    for (const s of small) expect(Math.abs(degrees(layout.headingTrims.get(s.id)!))).toBeLessThanOrEqual(isCapital(s) ? 3.2 + 1e-9 : 8 + 1e-9);
    expect(small.every(s => layout.echelons.get(s.id) === 'main' && layout.battlegroups.get(s.id) === 0)).toBe(true);
  });

  it('replays version-1 configurations with the legacy lattice', () => {
    expect(parseFleetLayoutVersion(undefined)).toBe(CURRENT_FLEET_LAYOUT_VERSION);
    expect(parseFleetLayoutVersion('2')).toBe(2);
    expect(parseFleetLayoutVersion('1')).toBe(1);
    const ships = allianceMixed(18, 36, 36);
    const legacy = composeFleetLayout(ships, 'line_abreast', 7, { layoutVersion: 1 });
    expect(composeFleetLayout(ships, 'line_abreast', 7, { layoutVersion: 1 }).slots).toEqual(legacy.slots);
    expect(legacy.slots).not.toEqual(composeFleetLayout(ships, 'line_abreast', 7, { layoutVersion: 2 }).slots);
    expect([...legacy.headingTrims.values()].every(t => t === 0)).toBe(true);
    // The legacy generator's first dreadnought station, measured at be9a99c.
    expect(assignSlots(ships, 'line_abreast', 7, { layoutVersion: 1 }).get('dreadnought-0')).toEqual(legacy.slots.get('dreadnought-0'));
  });

  it('deploys ships on their trimmed headings and tags them, within the per-tick budget', () => {
    const sim = new BattleSimulation(buildCustomBattle({
      seed: 1, rulesId: 'canon_me3', environment: 'deep_space', startingDistanceKm: 90, maxDuration: 120, theatreLayout: 'three_dimensional',
      sideA: { faction: 'alliance', name: 'Line', formation: 'line_abreast', counts: { alliance_dreadnought: 20, alliance_cruiser: 60, alliance_frigate: 120 } },
      sideB: { faction: 'reaper', name: 'Wedge', formation: 'strike_wedge', counts: { reaper_capital: 8, reaper_destroyer: 24 } },
    }));
    const line = sim.ships.filter(s => s.side === 'A');
    const fleet = sim.fleets.get('custom-a')!;
    expect(new Set(line.map(s => `${s.heading.x.toFixed(4)},${s.heading.z.toFixed(4)}`)).size).toBeGreaterThan(20);
    for (const s of line) {
      const expected = rotateY(fleet.heading, s.headingTrim ?? 0);
      expect(Math.abs(s.heading.x - expected.x) + Math.abs(s.heading.z - expected.z)).toBeLessThan(1e-9);
      expect(typeof s.battlegroup).toBe('number');
      expect(s.echelon).toBeDefined();
    }
    expect(sim.config.worldState?.[FLEET_LAYOUT_VERSION_KEY]).toBe(String(CURRENT_FLEET_LAYOUT_VERSION));
  });
});

describe('seeded fleet staging', () => {
  const setup = (seed: number): CustomBattleInput => ({
    seed, rulesId: 'canon_me3', environment: 'deep_space', startingDistanceKm: 90, maxDuration: 120,
    sideA: { faction: 'alliance' as const, name: 'Fifth Fleet', formation: 'line_abreast' as const, counts: { alliance_dreadnought: 2, alliance_cruiser: 6 } },
    sideB: { faction: 'reaper' as const, name: 'Harvest', formation: 'strike_wedge' as const, counts: { reaper_capital: 2, reaper_destroyer: 6 } },
    extraA: [
      { faction: 'turian' as const, name: 'Hierarchy wing', formation: 'line_abreast' as const, counts: { turian_cruiser: 6 } },
      { faction: 'asari' as const, name: 'Republics wing', formation: 'defensive_screen' as const, counts: { asari_cruiser: 6 } },
    ],
    extraB: [{ faction: 'cerberus' as const, name: 'Cerberus raiders', formation: 'strike_wedge' as const, counts: { cerberus_cruiser: 4 } }],
  });

  it('toes allied fleets in towards the centre line by a seeded 5-20 degrees and keeps the centre fleet axial', () => {
    const cfg = buildCustomBattle(setup(3));
    expect(buildCustomBattle(setup(3)).fleets).toEqual(cfg.fleets);
    const yaw = (h: { x: number; z: number }, forward: number): number => degrees(Math.atan2(h.x, h.z * forward));
    const a = cfg.fleets.filter(f => f.side === 'A');
    expect(a[0].heading).toEqual({ x: 0, y: 0, z: 1 });
    expect(new Set(a.map(f => `${f.heading.x.toFixed(4)},${f.heading.z.toFixed(4)}`)).size).toBe(a.length);
    for (const f of a.slice(1)) {
      const angle = yaw(f.heading, 1);
      expect(Math.abs(angle)).toBeGreaterThanOrEqual(5);
      expect(Math.abs(angle)).toBeLessThanOrEqual(20);
      // Towards the centre line: a fleet to the right (positive x) turns left.
      expect(Math.sign(angle)).toBe(-Math.sign(f.position.x));
      expect(Math.hypot(f.heading.x, f.heading.z)).toBeCloseTo(1, 9);
    }
    const b = cfg.fleets.filter(f => f.side === 'B');
    expect(b[0].heading).toEqual({ x: 0, y: 0, z: -1 });
    expect(Math.abs(yaw(b[1].heading, -1))).toBeGreaterThanOrEqual(5);
    expect(Math.sign(yaw(b[1].heading, -1))).toBe(-Math.sign(b[1].position.x));
    expect(cfg.worldState?.[FLEET_LAYOUT_VERSION_KEY]).toBe(String(CURRENT_FLEET_LAYOUT_VERSION));
    // Different seeds toe in by different angles.
    expect(buildCustomBattle(setup(4)).fleets[2].heading).not.toEqual(cfg.fleets[2].heading);
  });

  it('places the allied fleets of a side at distinct seeded altitudes, not mirrored echelons', () => {
    const wings = (n: number) => Array.from({ length: n }, (_, i) => ({ faction: 'turian' as const, name: `Wing ${i}`, formation: 'line_abreast' as const, counts: { turian_cruiser: 4 } }));
    const build = (seed: number) => buildCustomBattle({ ...setup(seed), theatreLayout: 'three_dimensional', extraA: wings(5) });
    const a = build(3).fleets.filter(f => f.side === 'A').map(f => f.position.y);
    expect(new Set(a.map(y => y.toFixed(6))).size).toBe(a.length);
    // Not the old symmetric +1, -1, +2, -2 stack: the offsets from the main fleet differ in magnitude.
    const magnitudes = a.slice(1).map(y => Math.abs(y - a[0]).toFixed(6));
    expect(new Set(magnitudes).size).toBe(magnitudes.length);
    expect(build(3).fleets.map(f => f.position.y)).toEqual(build(3).fleets.map(f => f.position.y));
    expect(build(4).fleets.filter(f => f.side === 'A').map(f => f.position.y)).not.toEqual(a);
  });

  it('keeps authored headings, single fleets and version-1 configurations untouched', () => {
    const single = buildCustomBattle({ ...setup(3), extraA: undefined, extraB: undefined });
    expect(single.fleets.map(f => f.heading)).toEqual([{ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }]);
    const earth = buildScenario('battle_of_earth', 'canon_me3', 17);
    const wave = earth.fleets.find(f => f.id === 'reaper-sol-2')!;
    expect(wave.heading).toEqual({ x: 0.4, y: 0, z: -1 });
    const legacy = buildScenario('final_battle_of_earth', 'canon_me3', 17, { [FLEET_LAYOUT_VERSION_KEY]: '1' });
    expect(legacy.worldState?.[FLEET_LAYOUT_VERSION_KEY]).toBe('1');
    expect(legacy.fleets.filter(f => f.side === 'A').every(f => f.heading.x === 0 || f.id === 'sword-geth' || f.id === 'sword-quarian')).toBe(true);
    const current = buildScenario('final_battle_of_earth', 'canon_me3', 17);
    expect(new Set(current.fleets.filter(f => f.side === 'A').map(f => f.heading.x.toFixed(4))).size).toBeGreaterThanOrEqual(3);
  });
});
