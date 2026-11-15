import { add, distance, dot, normalize, rotateY, sub, v3, type Vec3 } from '@/core/vec3';
import type { FleetState, ShipState, TargetPriority, WeaponState } from './types';
import type { WeaponTargetField } from './weaponTargetField';

export const PRIMARY_VOLLEY_SECONDS = 0.5;

export type PrimaryBatteryReason = 'ready' | 'held' | 'cooling' | 'coordinating' |
  'out_of_range' | 'aligning' | 'overheated' | 'out_of_ammo' | 'no_target' |
  'retreating' | 'destroyed' | 'escaped';

export interface PrimaryBatteryStatus {
  shipId: string;
  reason: PrimaryBatteryReason;
  /** Physically ready mounts, before hold-fire and salvo timing permissions. */
  ready: number;
  cooling: number;
  total: number;
  volleyRemaining: number;
  cooldownRemaining: number;
  /** Simulation kilometres, measured from the actual firing origin. */
  range: number;
  distance?: number;
  targetId?: string;
  held: boolean;
}

export interface FleetBatteryStatus {
  fleetId: string;
  ready: number;
  cooling: number;
  total: number;
  volleyRemaining: number;
  held: boolean;
}

/** Player salvo commands affect organic capital spinal guns only. Escorts,
 * fighters, secondary batteries, point defence and Reapers remain independent. */
export function isCommandedBattery(ship: ShipState, weapon: WeaponState): boolean {
  return ship.faction !== 'reaper' && ship.role === 'dreadnought' &&
    weapon.def.kind === 'mass_accelerator' && weapon.def.antiCapital && weapon.def.arc <= 20 && Math.cos(weapon.facing) > 0.999;
}

/** Shared live firing geometry: diagnostics and the simulation use one source. */
export function weaponWorldOffset(ship: ShipState, weapon: WeaponState): Vec3 {
  const yaw = Math.atan2(ship.heading.x, ship.heading.z);
  return add(ship.pos, rotateY(weapon.offset, yaw));
}

export function inWeaponArc(ship: ShipState, weapon: WeaponState, target: Vec3): boolean {
  if (weapon.def.arc >= 360) return true;
  // Use the full 3D weapon bore direction. The previous horizontal-only
  // comparison rejected ships above/below the firing line even when the gun
  // was properly tracking them, leaving otherwise valid capital battles silent.
  const facing = normalize(rotateY(ship.heading, weapon.facing));
  const to = normalize(sub(target, weaponWorldOffset(ship, weapon)));
  const halfArc = weapon.def.arc * Math.PI / 360;
  return dot(facing, to) >= Math.cos(halfArc + 0.05);
}

function validEnemy(ship: ShipState, target: ShipState | undefined): target is ShipState {
  return !!target && target.alive && !target.escaped && target.side !== ship.side;
}

/** How much more a fleet under this target priority wants this target than another. */
export function priorityMultiplier(priority: TargetPriority, target: ShipState): number {
  switch (priority) {
    case 'reaper_destroyers': return target.role === 'reaper_destroyer' ? 4 : 1;
    case 'reaper_capitals': return target.role === 'reaper_capital' ? 4 : 1;
    case 'capitals': return isCapitalShip(target) ? 4 : 1;
    case 'escorts': return ['frigate', 'cruiser', 'reaper_destroyer'].includes(target.role) ? 3 : 1;
    case 'fighters': return target.role === 'fighter' ? 4 : 1;
    default: return 1;
  }
}

/** The ships of the line: dreadnoughts, carriers and Reaper capital ships. */
export function isCapitalShip(ship: Pick<ShipState, 'role'>): boolean {
  return ship.role === 'dreadnought' || ship.role === 'carrier' || ship.role === 'reaper_capital';
}

/** A gun that fires capital-killing rounds from a limited magazine: the Valkyrie's NOVA Array carries eight. */
export function isMagazineMainGun(weapon: WeaponState): boolean {
  const def = weapon.def;
  return def.magazine !== undefined && def.kind === 'mass_accelerator' && def.antiCapital;
}

/** Whether this hull still has such rounds aboard. */
export function carriesCapitalRounds(ship: ShipState): boolean {
  for (const w of ship.weapons) if (isMagazineMainGun(w) && (w.ammo ?? 0) > 0) return true;
  return false;
}

/**
 * Rounds kept for capital ships. A gun with a limited magazine of capital-killing rounds is not fired at a hull
 * that is not a capital ship and that the round would overkill (it carries more than the target's whole hull and
 * barriers), for as long as the enemy has a capital ship on the field. A target the player has named, by a ship
 * order, a fleet's commanded target or the fleet's target priority, is fired on regardless.
 *
 * Before this the rounds went to whatever came into range first, which against Reapers is the destroyers: they
 * are twice as fast as the capital ships they escort. In a battle of 100 Sovereigns and 300 destroyers the
 * Valkyrie's NOVA Array (one round destroys a Sovereign; eight rounds, 48 s to reload) fired twelve rounds from six
 * ships and nine of them at destroyers, and the Aegis command gun 25 of 27.
 */
export function keptForCapitals(ship: ShipState, fleet: FleetState, weapon: WeaponState, target: ShipState, enemyCapitalOnField: boolean): boolean {
  if (!enemyCapitalOnField || !isMagazineMainGun(weapon) || isCapitalShip(target)) return false;
  if (weapon.def.damage <= target.maxHull + target.maxBarriers) return false;
  if (ship.forcedTargetId === target.id) return false;
  if (fleet.orders.order === 'attack_target' && fleet.orders.targetId === target.id) return false;
  return priorityMultiplier(fleet.orders.priority, target) <= 1;
}

/** Pure target solution for non-PD mounts, including the same targets of
 * opportunity as real firing. Calling it never commits a target or advances RNG. */
export function weaponTarget(
  ship: ShipState, fleet: FleetState, weapon: WeaponState,
  getShip: (id: string) => ShipState | undefined, enemies: readonly ShipState[],
  nearby?: WeaponTargetField,
  /** Whether the enemy has a capital ship on the field (see keptForCapitals). Asked only for a gun it matters to. */
  enemyCapitalOnField?: () => boolean,
): ShipState | undefined {
  const def = weapon.def;
  const origin = weaponWorldOffset(ship, weapon);
  const keeping = !!enemyCapitalOnField && isMagazineMainGun(weapon) && enemyCapitalOnField();
  const reachable = (target: ShipState | undefined): target is ShipState =>
    validEnemy(ship, target) && distance(origin, target.pos) <= def.range && inWeaponArc(ship, weapon, target.pos)
    && !(keeping && keptForCapitals(ship, fleet, weapon, target, true));
  let primary = ship.targetId ? getShip(ship.targetId) : undefined;
  if (fleet.orders.focusFire && isCommandedBattery(ship, weapon) && def.armourBypass > 0 && !ship.forcedTargetId) {
    const focus = fleet.focusTargetId ? getShip(fleet.focusTargetId) : undefined;
    if (reachable(focus)) primary = focus;
  }
  if (reachable(primary)) return primary;
  let best: ShipState | undefined;
  let bestScore = -Infinity;
  let bestIndex = Infinity;
  const consider = (enemy: ShipState, index: number) => {
    if (!validEnemy(ship, enemy) || enemy.role === 'fighter') return;
    const d = distance(origin, enemy.pos);
    if (d > def.range || !inWeaponArc(ship, weapon, enemy.pos)) return;
    if (keeping && keptForCapitals(ship, fleet, weapon, enemy, true)) return;
    const score = (def.antiCapital ? Math.log2(1 + enemy.pointValue) : 1) * (1 - d / def.range) + (1 - enemy.hull / enemy.maxHull) * 0.5;
    if (score > bestScore || (score === bestScore && index < bestIndex)) {
      best = enemy;
      bestScore = score;
      bestIndex = index;
    }
  };
  if (nearby) nearby.forRange(ship.side, origin, def.range, consider);
  else enemies.forEach(consider);
  return best;
}

/** Intended target for explaining a blocked solution, without changing it. */
export function batteryIntent(
  ship: ShipState, fleet: FleetState, getShip: (id: string) => ShipState | undefined,
  enemies: readonly ShipState[],
): ShipState | undefined {
  const primary = ship.targetId ? getShip(ship.targetId) : undefined;
  if (validEnemy(ship, primary)) return primary;
  const focus = fleet.focusTargetId ? getShip(fleet.focusTargetId) : undefined;
  if (validEnemy(ship, focus)) return focus;
  return enemies.find(enemy => validEnemy(ship, enemy) && enemy.role !== 'fighter');
}

interface ManualVolley {
  endsAt: number;
  fired: Set<string>;
}

/** A short, non-queued release. Every mount gets at most one shot; clicking
 * again cannot extend an active window or erase the shots already released. */
export class PrimaryVolleyControl {
  private windows = new Map<string, ManualVolley>();

  remaining(time: number, fleetId: string): number {
    return Math.max(0, (this.windows.get(fleetId)?.endsAt ?? time) - time);
  }

  open(time: number, fleetId: string): boolean {
    if (this.remaining(time, fleetId) > 1e-8) return false;
    this.windows.set(fleetId, { endsAt: time + PRIMARY_VOLLEY_SECONDS, fired: new Set() });
    return true;
  }

  allows(time: number, fleetId: string, ship: ShipState, weapon: WeaponState): boolean {
    const volley = this.windows.get(fleetId);
    return !!volley && time < volley.endsAt - 1e-8 && !volley.fired.has(`${ship.id}:${weapon.index}`);
  }

  fired(fleetId: string, ship: ShipState, weapon: WeaponState): void {
    this.windows.get(fleetId)?.fired.add(`${ship.id}:${weapon.index}`);
  }
}
