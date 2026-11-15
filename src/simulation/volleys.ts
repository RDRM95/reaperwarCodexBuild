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
