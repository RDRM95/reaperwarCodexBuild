import { add, distance, normalize, scale, sub, type Vec3 } from '@/core/vec3';
import type { ShipState } from './types';

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
