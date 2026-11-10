import { add, distance, dot, normalize, rotateY, scale, sub, type Vec3 } from '@/core/vec3';
import type { ShipState, WeaponState } from './types';

/** Fleet sensor reports provide an approach contact even for a rear station
 * outside its own sensor bubble. Actual fire still requires range and arc.
 * Prefer a reachable local enemy over a remote fleet focus; never redirect an
 * explicit player target. The nearest contact is collected in the existing
 * scoring scan, avoiding another all-enemy scan in thousand-ship battles.
 */
export function localReachTarget(ship: ShipState, preferred: ShipState | undefined,
  nearest: ShipState | undefined, range: number): ShipState | undefined {
  if (ship.forcedTargetId || (preferred && distance(ship.pos, preferred.pos) <= range)) return preferred;
  if (nearest && (!nearest.alive || nearest.escaped || nearest.side === ship.side || nearest.role === 'fighter')) return preferred;
  return nearest ?? preferred;
}

/** The assigned station may remain unreachable after the fleet anchor holds.
 * Supply a reachable station rather than capping closure at 15% of gun range.
 * Already useful stations remain untouched. This only changes the waypoint:
 * acceleration, class speed, clearance, firing arc and weapon range still apply.
 * `limit` bounds how far the station may move toward the target (km): the
 * anti-chase trim toward a fleeing contact passes a fraction of gun range.
 */
export function reachableStation(station: Vec3, target: Vec3, range: number, limit = Infinity): Vec3 {
  const delta = sub(station, target);
  const dist = distance(station, target);
  const reach = range * .94;
  if (dist <= reach) return station;
  const step = Math.min(limit, dist - reach);
  return add(target, scale(normalize(delta), dist - step));
}

/** The mount that sets the ship's engagement range (the narrowest of those
 * reaching it): its arc, cooldown and burst decide whether a contact is a
 * feasible solution for this hull, as opposed to merely inside its range. */
export function principalMount(ship: ShipState, range: number): WeaponState | undefined {
  let best: WeaponState | undefined;
  for (const w of ship.weapons) {
    if (w.def.antiSmall || (w.ammo !== undefined && w.ammo <= 0) || w.def.range < range - 1e-9) continue;
    if (!best || w.def.arc < best.def.arc) best = w;
  }
  return best;
}

/** Combat-mass Reapers rotate deliberately: their high-speed turn relies on
 * mass-lightening not available while a capital main beam is in use.
 * SIMULATION_ESTIMATE, shared by the heading integrator and target choice. */
export const REAPER_CAPITAL_COMBAT_MASS = 0.72;

/** Yaw rate a hull can use now (rad/s): catalogue turn rate, engine state and
 * the Reaper capital's combat mass. The heading integrator and the target
 * feasibility estimate read one value, so a solution judged slewable within a
 * shot cycle is one the hull can actually bring to bear in that time. */
export function combatYawRate(ship: ShipState): number {
  const combatMass = ship.faction === 'reaper' && ship.role === 'reaper_capital' ? REAPER_CAPITAL_COMBAT_MASS : 1;
  return ship.turnRate * combatMass * (0.3 + 0.7 * ship.subsystems.engines);
}

/** Slack inWeaponArc allows beyond the half arc (radians). */
const ARC_SLACK = 0.05;

export interface SolutionFeasibility {
  inRange: boolean;
  /** Seconds of hull yaw before the principal mount bears; 0 when it already does. */
  slewSeconds: number;
  /** Seconds of closing at the hull's own speed before the contact is inside range; 0 when it is. */
  closeSeconds: number;
  /** Principal mount cooldown plus burst (s): the slew one shot cycle can afford. */
  cycle: number;
}

/** Whether, and how soon, this hull's principal mount can obtain a solution on
 * `target`: inside its range, and inside its arc or slewable there. Reads only
 * the hull's own heading, speed, mount and the contact's position. */
export function solutionFeasibility(ship: ShipState, target: ShipState, range: number): SolutionFeasibility {
  const dist = distance(ship.pos, target.pos);
  const inRange = dist <= range;
  const speed = ship.maxSpeed * (0.25 + 0.75 * ship.subsystems.engines);
  const closeSeconds = inRange ? 0 : speed > 1e-9 ? (dist - range) / speed : Infinity;
  const mount = principalMount(ship, range);
  if (!mount) return { inRange, slewSeconds: 0, closeSeconds, cycle: 1 };
  const cycle = mount.def.cooldown + (mount.def.beamDuration ?? 0);
  if (mount.def.arc >= 360) return { inRange, slewSeconds: 0, closeSeconds, cycle };
  const bore = normalize(rotateY(ship.heading, mount.facing));
  const to = normalize(sub(target.pos, ship.pos));
  const offset = Math.acos(Math.max(-1, Math.min(1, dot(bore, to))));
  const excess = Math.max(0, offset - (mount.def.arc * Math.PI / 360 + ARC_SLACK));
  const yaw = combatYawRate(ship);
  return { inRange, slewSeconds: excess <= 0 ? 0 : yaw > 1e-9 ? excess / yaw : Infinity, closeSeconds, cycle };
}

/** A solution this hull can have within one shot cycle: in range, and bearing
 * or slewable there before the mount is ready again. */
export const feasibleSolution = (f: SolutionFeasibility): boolean => f.inRange && f.slewSeconds <= f.cycle;

/** Score factor for the time a candidate costs before the mount can fire, in
 * shot cycles: yaw for a contact off the arc, closing at the hull's own speed
 * for one beyond range. A contact the mount already bears on keeps its
 * score; one a shot cycle away keeps half; a Reaper capital's 25 s swing
 * onto a flanker against a 12 s beam cycle keeps under a third, and a fleet
 * focus 2 km beyond a dreadnought's range (8 s of closing the formation may
 * never grant) keeps a third, so a bearing contact of similar worth wins. */
export const solutionFactor = (f: SolutionFeasibility): number => 1 / (1 + (f.slewSeconds + f.closeSeconds) / Math.max(1, f.cycle));

/** Voluntary target switches a hull may make per minute, or unlimited.
 * SIMULATION_ESTIMATE: a Reaper capital fires about five beam cycles a
 * minute and every switch beyond its arc costs most of one, so more than
 * three a minute is churn, not gunnery; destroyers cycle faster and slew
 * at four times the rate. */
export function switchesPerMinute(ship: Pick<ShipState, 'faction' | 'role'>): number | undefined {
  if (ship.faction !== 'reaper') return undefined;
  return ship.role === 'reaper_capital' ? 3 : ship.role === 'reaper_destroyer' ? 5 : undefined;
}

const recentSwitches = new WeakMap<ShipState, number[]>();

/** Whether a voluntary switch (the current target is still a usable solution)
 * is within the hull's budget at `time`. Switches forced by a lost or
 * unreachable target are never counted and never refused. */
export function switchAllowed(ship: ShipState, time: number): boolean {
  const cap = switchesPerMinute(ship);
  if (cap === undefined) return true;
  const times = (recentSwitches.get(ship) ?? []).filter(t => time - t < 60);
  recentSwitches.set(ship, times);
  return times.length < cap;
}

export function recordSwitch(ship: ShipState, time: number): void {
  if (switchesPerMinute(ship) === undefined) return;
  const times = (recentSwitches.get(ship) ?? []).filter(t => time - t < 60);
  times.push(time);
  recentSwitches.set(ship, times);
}
