import { normalize, v3 } from '@/core/vec3';
import { CURRENT_FLEET_LAYOUT_VERSION, FLEET_LAYOUT_VERSION_KEY, layoutNoise } from '@/simulation/formations';
import type { BattleConfig, Environment, FleetSpec } from '@/simulation/types';

/**
 * Strategic 3D theatre policy. Space is unbounded: these are staging
 * corridors, not collision walls or a flat arena.
 *
 * Fleet positions are specified in nominal kilometres and scaled by the
 * existing simulation engine. Staging changes only the initial fleet anchor
 * and, for allied fleets standing off their side's centre line, a seeded
 * heading toe-in. Every member keeps the exact battle-group slot relative to
 * its fleet anchor and heading.
 */
export const THEATRE_PROFILES: Record<Environment, {
  landmark: 'planet' | 'relay' | 'station' | 'none';
  /** Maximum fleet-to-midplane altitude at deployment (nominal kilometres). */
  verticalLayerKm: number;
  /** Suggested region for a strategic camera, never a hard gameplay bound. */
  overviewKm: number;
}> = {
  earth_orbit: { landmark: 'planet', verticalLayerKm: 10, overviewKm: 1600 },
  palaven_orbit: { landmark: 'planet', verticalLayerKm: 10, overviewKm: 1600 },
  thessia_orbit: { landmark: 'planet', verticalLayerKm: 10, overviewKm: 1600 },
  rannoch_orbit: { landmark: 'planet', verticalLayerKm: 10, overviewKm: 1600 },
  surkesh_orbit: { landmark: 'planet', verticalLayerKm: 10, overviewKm: 1600 },
  relay: { landmark: 'relay', verticalLayerKm: 12, overviewKm: 2400 },
  citadel: { landmark: 'station', verticalLayerKm: 6, overviewKm: 1600 },
  deep_space: { landmark: 'none', verticalLayerKm: 14, overviewKm: 3200 },
};

/** A scenario may explicitly retain its original deployment via world state. */
export const LEGACY_THEATRE_FLAG = 'legacy_plane';

/**
 * Stage fleets across separate vertical approach lanes while retaining every
 * original X/Z bearing, heading, unit count, tech rule and arrival time.
 * Altitude is limited to a fraction of the horizontal enemy separation:
 * even a close-starting scenario retains viable forward firing arcs.
 *
 * Keep authored altitudes (e.g. a high flanking Reaper wave) as offsets.
 * Static defence platforms retain their exact placed coordinates.
 */
export function stageThreeDimensionalTheatre(config: BattleConfig): BattleConfig {
  config = stageFleetLayout(config);
  // Older scenario IDs, replays and calibration seeds retain their exact
  // positions until the player selects the new spatial theatre.
  if (config.worldState?.theatre_layout !== 'three_dimensional') return config;
  const a = config.fleets.filter(f => f.side === 'A');
  const b = config.fleets.filter(f => f.side === 'B');
  if (!a.length || !b.length) return config;
  let nearestHorizontal = Infinity;
  for (const friend of a) for (const foe of b) {
    const x = friend.position.x - foe.position.x;
    const z = friend.position.z - foe.position.z;
    nearestHorizontal = Math.min(nearestHorizontal, Math.hypot(x, z));
  }
  const layer = Math.min(THEATRE_PROFILES[config.environment].verticalLayerKm,
    Math.max(0, nearestHorizontal) * 0.075);
  if (!(layer > 0)) return config;
  const rank: Record<'A' | 'B', number> = { A: 0, B: 0 };
  const fleets: FleetSpec[] = config.fleets.map(f => {
    if (f.ships.some(s => s.classId.includes('platform'))) return f;
    const i = rank[f.side]++;
    const side = f.side === 'A' ? -1 : 1;
    // Allied wings occupy different altitudes but remain in mutually
    // supporting range. Even/odd lanes mirror, rather than drift each tick.
    const step = Math.min(3, nearestHorizontal * 0.018);
    const echelon = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2) * step;
    return {
      ...f,
      position: { ...f.position, y: f.position.y + side * layer + echelon },
    };
  });
  return { ...config, fleets };
}

/** Toe-in of an off-axis allied fleet: 5 to 20 degrees towards the side's centre line (SIMULATION_ESTIMATE:
 * enough that the side's hulls are visibly not parallel, small enough that every fleet still closes on
 * the enemy). */
const TOE_IN_DEG = { min: 5, span: 15 };
/** Fleets within this lateral distance of their side's centre line keep the axial heading (nominal km). */
const CENTRE_LINE_KM = 2;

/**
 * Stamp the fleet layout generator version a configuration was built with, so
 * a saved configuration replays with the generator it was made with, and toe
 * in the fleets of a side that stand off the side's centre line, the lane of
 * its largest fleet: a fleet given the plain axial heading turns 5 to 20
 * degrees (seeded from the battle seed and its index) towards that lane, so a
 * side's hulls are not exactly parallel and flanking fleets converge on the
 * main body's objective. Authored off-axis headings, the largest fleet itself,
 * static platforms and version-1 configurations keep their headings. Idempotent.
 */
export function stageFleetLayout(config: BattleConfig): BattleConfig {
  const version = config.worldState?.[FLEET_LAYOUT_VERSION_KEY] ?? String(CURRENT_FLEET_LAYOUT_VERSION);
  const worldState = config.worldState?.[FLEET_LAYOUT_VERSION_KEY] === version ? config.worldState : { ...(config.worldState ?? {}), [FLEET_LAYOUT_VERSION_KEY]: version };
  if (version === '1') return worldState === config.worldState ? config : { ...config, worldState };
  const isPlatform = (f: FleetSpec): boolean => f.ships.some(s => s.classId.includes('platform'));
  const hulls = (f: FleetSpec): number => f.ships.reduce((sum, s) => sum + s.count, 0);
  const centre: Record<'A' | 'B', number> = { A: 0, B: 0 };
  for (const side of ['A', 'B'] as const) {
    const fleets = config.fleets.filter(f => f.side === side && !isPlatform(f));
    const largest = fleets.reduce<FleetSpec | undefined>((best, f) => !best || hulls(f) > hulls(best) ? f : best, undefined);
    centre[side] = largest?.position.x ?? 0;
  }
  const fleets = config.fleets.map((f, index) => {
    if (isPlatform(f)) return f;
    const axial = Math.abs(f.heading.x) < 1e-9 && Math.abs(f.heading.y) < 1e-9 && Math.abs(f.heading.z) > 1e-9;
    const offset = f.position.x - centre[f.side];
    if (!axial || Math.abs(offset) < CENTRE_LINE_KM) return f;
    const angle = (TOE_IN_DEG.min + TOE_IN_DEG.span * layoutNoise(config.seed, index, 61)) * Math.PI / 180;
    const forward = Math.sign(f.heading.z);
    return { ...f, heading: normalize(v3(-Math.sign(offset) * Math.sin(angle), 0, forward * Math.cos(angle))) };
  });
  return { ...config, worldState, fleets };
}
