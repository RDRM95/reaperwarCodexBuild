import type { ShipState, WeaponState } from './types';
import { isCommandedBattery, isMagazineMainGun } from './fireControl';

/** A little time to assemble a battery; subsequent windows share that battery's clock. */
export const HADES_ASSEMBLY_SECONDS = 0.6;
export const HADES_RELEASE_SECONDS = 0.5;

/** A gun with a magazine of capital-killing rounds fires when it bears: it does not wait for a salvo. Its reload
 * is its cycle (the NOVA Array's is 44 s), so a loaded gun that missed a window stood silent for most of a minute. */
export function isHadesSpinal(ship: ShipState, weapon: WeaponState): boolean {
  return isCommandedBattery(ship, weapon) && weapon.def.armourBypass > 0 && !isMagazineMainGun(weapon);
}

/** The guns of one kind in one fleet. */
const batteryKey = (fleetId: string, weapon: WeaponState): string => `${fleetId}|${weapon.def.id}`;

interface VolleyClock {
  releaseAt: number;
  period: number;
}

/**
 * Fleet-wide fire permission for HADES spinal batteries. Call only after the
 * normal readiness, heat, target, range and arc checks have passed. Unready or
 * out-of-position ships therefore never postpone the fleet's release.
 *
 * The first ready gun assembles a salvo for 0.6 s, then every ready gun gets
 * the same 0.5 s release window. Healthy batteries can recharge between windows;
 * damaged or slower mounts skip a window and join the next. This bounds the
 * wait to one fleet cycle and avoids a per-frame scan of every other mount.
 *
 * A fleet keeps one clock for each kind of gun. With a single clock the cycle was that of whichever gun asked
 * first, for every gun in the fleet: beside an Omaha (7.3 s) the fleet's hyper-mass accelerators (4.1 s) fired at
 * the Omaha's pace, and beside a NOVA Array (44 s) they would fire once in 46 s.
 */
export class HadesVolleyCoordinator {
  private clocks = new Map<string, VolleyClock>();

  /** Read-only timing observation. In particular, opening a HUD panel cannot
   * initialise a clock or move its next release. */
  secondsUntilRelease(time: number, fleetId: string, ship: ShipState, weapon: WeaponState): number {
    if (!isHadesSpinal(ship, weapon)) return 0;
    const clock = this.clocks.get(batteryKey(fleetId, weapon));
    if (!clock) return HADES_ASSEMBLY_SECONDS;
    let releaseAt = clock.releaseAt;
    if (time > releaseAt + HADES_RELEASE_SECONDS + 1e-8) {
      const cycles = Math.ceil((time - releaseAt - HADES_RELEASE_SECONDS) / clock.period);
      releaseAt += cycles * clock.period;
    }
    return Math.max(0, releaseAt - time);
  }

  canFire(time: number, fleetId: string, ship: ShipState, weapon: WeaponState): boolean {
    if (!isHadesSpinal(ship, weapon)) return true;
    const key = batteryKey(fleetId, weapon);
    let clock = this.clocks.get(key);
    if (!clock) {
      clock = {
        releaseAt: time + HADES_ASSEMBLY_SECONDS,
        // Existing weapon cooldown jitter tops out at 1.05. Add the release
        // width so a mount firing at the end can join the next fleet salvo.
        period: weapon.def.cooldown * 1.05 + HADES_RELEASE_SECONDS,
      };
      this.clocks.set(key, clock);
    }
    if (time > clock.releaseAt + HADES_RELEASE_SECONDS + 1e-8) {
      // Advance arithmetically after a long interruption; never replay missed
      // salvos, reset the clock for every caller, or wait for a dead target.
      const cycles = Math.ceil((time - clock.releaseAt - HADES_RELEASE_SECONDS) / clock.period);
      clock.releaseAt += cycles * clock.period;
    }
    return time + 1e-8 >= clock.releaseAt && time <= clock.releaseAt + HADES_RELEASE_SECONDS + 1e-8;
  }
}

// ------------------------------------------------------------------------------------------ the opening volley

/** A battery opens when this share of its guns have a firing solution... */
export const OPENING_SHARE = 0.6;
/** ...or when no further gun has come to bear for this long: in a fleet many ranks deep the rear ranks are a long way from bearing, and the leading ranks are the volley... */
export const OPENING_SETTLE_SECONDS = 1.2;
/** ...or this long after the first of them had one, whichever comes first: a gun that cannot bear does not keep the rest waiting. */
export const OPENING_HOLD_SECONDS = 5;
/** Under fire a battery does not stand on ceremony: it opens after this long at most. */
export const OPENING_HOLD_UNDER_FIRE = 0.6;
/** The guns of a battery fire within this long of its release, each at its own moment: an order carried out by crews, not one switch. */
export const OPENING_STAGGER_SECONDS = 0.7;

/**
 * The guns that open a battle together: the forward spinal mass accelerators (an arc of 20 degrees or less) of
 * conventional warships, which are those of dreadnoughts and cruisers, by fleet and by kind of gun. Not Reapers
 * (each fires as it pleases), not fighters, not a frigate's 30-degree mount, not broadsides, turrets, beams,
 * torpedoes or point defence.
 */
export function isOpeningBattery(ship: ShipState, weapon: WeaponState): boolean {
  return ship.faction !== 'reaper' && ship.role !== 'fighter' && weapon.def.kind === 'mass_accelerator' && !weapon.def.antiSmall &&
    weapon.def.arc <= 20 && Math.cos(weapon.facing) > 0.999;
}

/** A moment within the stagger that is this hull's own, the same in every run: from its identity, not from the battle's random numbers. */
export function openingStagger(shipId: string, weaponIndex: number): number {
  let hash = 2166136261 ^ weaponIndex;
  for (let i = 0; i < shipId.length; i++) hash = Math.imul(hash ^ shipId.charCodeAt(i), 16777619);
  hash ^= hash >>> 15; hash = Math.imul(hash, 2246822519); hash ^= hash >>> 13;
  return ((hash >>> 0) / 4294967296) * OPENING_STAGGER_SECONDS;
}

interface OpeningBattery {
  /** When the first gun of the battery had a solution. */
  firstAt: number;
  /** When the battery was released; undefined while it holds. */
  releaseAt?: number;
  /** Guns of the battery, counted when the first of them had a solution. */
  guns: number;
  /** Guns with a solution in the tick being counted, and in the tick before it. */
  tick: number;
  counting: number;
  counted: number;
  /** The most guns that have had a solution in one tick, and when that last grew. */
  most: number;
  mostAt: number;
}

/**
 * A fleet's first volley. Each kind of spinal gun in a fleet holds its fire from the moment the first of them has
 * a firing solution until most of them have one, then they fire together, each within a fraction of a second of
 * the release. After that the battery fires as it always did: this is the opening and nothing else.
 *
 * Before this each hull fired the instant its own gun bore. A fleet coming into range did so a hull at a time, over
 * ten or twenty seconds, and its first salvo was four or five rounds.
 *
 * Call `canFire` only for a gun that is loaded and has a target in range and in its arc, as for the HADES clock:
 * a gun without a solution is never asked, so it can never hold the battery. The wait is bounded
 * (`OPENING_HOLD_SECONDS`), and a fleet that has been hit opens at once.
 */
export class OpeningVolleyCoordinator {
  private batteries = new Map<string, OpeningBattery>();
  /** Batteries released so far, each with how many guns had a solution at the release: for the record and for tests. */
  readonly released: { fleetId: string; weaponId: string; t: number; ready: number; guns: number }[] = [];

  canFire(time: number, fleetId: string, ship: ShipState, weapon: WeaponState, underFire: boolean, guns: () => number): boolean {
    if (!isOpeningBattery(ship, weapon)) return true;
    const key = batteryKey(fleetId, weapon);
    let battery = this.batteries.get(key);
    if (!battery) {
      battery = { firstAt: time, guns: Math.max(1, guns()), tick: time, counting: 0, counted: 0, most: 0, mostAt: time };
      this.batteries.set(key, battery);
    }
    if (battery.releaseAt === undefined) {
      // Guns with a solution are counted over a whole tick; the count that decides is the last whole one.
      if (time > battery.tick + 1e-9) { battery.counted = battery.counting; battery.counting = 0; battery.tick = time; }
      battery.counting++;
      const ready = Math.max(battery.counted, battery.counting);
      if (ready > battery.most) { battery.most = ready; battery.mostAt = time; }
      const waited = time - battery.firstAt;
      const most = ready >= Math.ceil(OPENING_SHARE * battery.guns), settled = time - battery.mostAt >= OPENING_SETTLE_SECONDS - 1e-9;
      if (most || settled || waited >= (underFire ? OPENING_HOLD_UNDER_FIRE : OPENING_HOLD_SECONDS) - 1e-9) {
        battery.releaseAt = time;
        this.released.push({ fleetId, weaponId: weapon.def.id, t: time, ready: Math.max(battery.counted, battery.counting), guns: battery.guns });
      } else return false;
    }
    return time + 1e-9 >= battery.releaseAt + openingStagger(ship.id, weapon.index);
  }

  /** The player has released the fleet's guns by hand: its batteries are open. */
  open(time: number, fleetId: string, weapon: WeaponState): void {
    const key = batteryKey(fleetId, weapon), battery = this.batteries.get(key);
    if (battery) battery.releaseAt ??= time - OPENING_STAGGER_SECONDS;
    else this.batteries.set(key, { firstAt: time, releaseAt: time - OPENING_STAGGER_SECONDS, guns: 1, tick: time, counting: 0, counted: 0, most: 0, mostAt: time });
  }

  /** Whether this gun is being held for its battery's first volley now. Reads only: asking changes nothing. */
  holding(time: number, fleetId: string, ship: ShipState, weapon: WeaponState): boolean {
    if (!isOpeningBattery(ship, weapon)) return false;
    const battery = this.batteries.get(batteryKey(fleetId, weapon));
    if (!battery) return false;
    return battery.releaseAt === undefined || time + 1e-9 < battery.releaseAt + openingStagger(ship.id, weapon.index);
  }
}
