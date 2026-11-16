/**
 * The automatic gun camera. While it is on and the camera is with one ship (following, chasing or in its
 * cockpit), the view cuts to that ship's main-gun sight shortly before the gun fires, stays for the shot, and
 * cuts back. Only a main cannon earns the cut: a gun that fires every few seconds would have the picture
 * flickering between two cameras, so guns reloading in under SLOW_GUN_SECONDS are left alone.
 *
 * This file is the decision alone, so that it can be tested: what the camera should do now, given what the gun
 * is doing. Times are seconds on the caller's clock.
 */
export const SLOW_GUN_SECONDS = 8;
/** The cut is made this long before the gun is ready. */
export const GUN_CAM_LEAD = 1.2;
/** After the shot the view stays on the sight this long, to see it go. */
export const GUN_CAM_HOLD = 2.6;
/** With no shot in this long the view gives up and goes back (the target moved out of the arc, or died). */
export const GUN_CAM_PATIENCE = 7;

export interface GunCamState {
  /** The view the cut was made from, while the gun camera has the picture. */
  from?: string;
  /** When the cut was made, and when the gun fired after it. */
  since?: number;
  firedAt?: number;
}

export interface GunCamInput {
  now: number;
  /** The camera now in use. */
  mode: string;
  /** The followed ship's main gun: seconds a full reload takes, seconds until it is ready, and whether it has a target in range. */
  gun?: { reload: number; ready: number; hasTarget: boolean };
  /** The followed ship's main gun fired since the last call. */
  fired: boolean;
}

export type GunCamAction = { cut: 'gunnery' } | { back: string } | undefined;

const WITH_A_SHIP = new Set(['follow', 'chase', 'cockpit']);

/** One step. Mutates `state`; returns the camera change to make, if any. */
export function gunCamStep(state: GunCamState, input: GunCamInput): GunCamAction {
  if (state.from === undefined) {
    if (!WITH_A_SHIP.has(input.mode) || !input.gun) return undefined;
    if (input.gun.reload < SLOW_GUN_SECONDS || !input.gun.hasTarget || input.gun.ready > GUN_CAM_LEAD) return undefined;
    state.from = input.mode; state.since = input.now; state.firedAt = undefined;
    return { cut: 'gunnery' };
  }
  // The player took the camera elsewhere: the gun camera lets go without pulling it back.
  if (input.mode !== 'gunnery') { state.from = undefined; state.since = undefined; state.firedAt = undefined; return undefined; }
  if (input.fired && state.firedAt === undefined) state.firedAt = input.now;
  const done = state.firedAt !== undefined ? input.now - state.firedAt >= GUN_CAM_HOLD : input.now - (state.since ?? input.now) >= GUN_CAM_PATIENCE || !input.gun;
  if (!done) return undefined;
  const back = state.from;
  state.from = undefined; state.since = undefined; state.firedAt = undefined;
  return { back };
}
