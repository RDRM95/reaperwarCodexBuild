import * as THREE from 'three';
import type { ShipState } from '@/simulation/types';

/**
 * The roll a hull holds about its own long axis, in radians. Drawing only: headings, hit geometry and the
 * simulation are untouched.
 *
 * A hull's drawn orientation was the shortest turn from "ahead" to its heading and nothing else, so every hull on
 * one heading sat at exactly the same angle. On Alliance ships that reads as a fleet in formation. On Reapers,
 * whose limbs make the roll of each hull plain to see, forty of them tilted alike read as one model pasted forty
 * times. There is no up in space and nothing makes a Reaper keep the same side toward the ecliptic as its
 * neighbour: each now holds its own roll and a few degrees of its own trim, fixed for the battle from its
 * identity, and sways about the roll slowly enough that it is a mass adjusting and not a wobble.
 */
export const REAPER_ROLL = {
  /** The most a hull's held roll differs from level. */
  capital: 0.38, // 22 degrees
  destroyer: 0.55, // 31 degrees
  /** The most a hull's bow is held off its heading, in yaw and in pitch: its own trim, as fixed as its roll. */
  capitalTrim: 0.07, // 4 degrees
  destroyerTrim: 0.1, // 6 degrees
  /** The slow sway about the held roll, and its period in seconds. */
  sway: 0.03,
  swaySeconds: 23,
} as const;

const held = new WeakMap<object, { roll: number; phase: number; yaw: number; pitch: number }>();

/** A number in [0, 1) from a hull's identity and a salt: the same for the same hull in every run. */
function fromIdentity(id: string, salt: number): number {
  let hash = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  // Mix the low bits up: consecutive hull numbers differ only in their last characters.
  hash ^= hash >>> 15; hash = Math.imul(hash, 2246822519); hash ^= hash >>> 13;
  return (hash >>> 0) / 4294967296;
}

/** The roll this hull holds, without the sway: zero for anything that is not a Reaper hull. */
export function heldRoll(ship: Pick<ShipState, 'id' | 'role' | 'faction'>): number {
  if (ship.role !== 'reaper_capital' && ship.role !== 'reaper_destroyer') return 0;
  let found = held.get(ship);
  if (!found) {
    const limit = ship.role === 'reaper_capital' ? REAPER_ROLL.capital : REAPER_ROLL.destroyer;
    const trim = ship.role === 'reaper_capital' ? REAPER_ROLL.capitalTrim : REAPER_ROLL.destroyerTrim;
    // Not near level: between three tenths of the limit and all of it, either way. Drawn evenly across the whole
    // range, a third of the hulls sat within a few degrees of level and of one another.
    const side = fromIdentity(ship.id, 5) < 0.5 ? -1 : 1;
    found = { roll: side * (0.3 + 0.7 * fromIdentity(ship.id, 1)) * limit, phase: fromIdentity(ship.id, 2) * Math.PI * 2,
      yaw: (fromIdentity(ship.id, 3) * 2 - 1) * trim, pitch: (fromIdentity(ship.id, 4) * 2 - 1) * trim };
    held.set(ship, found);
  }
  return found.roll;
}

/** The roll to draw this hull at now. `seconds` is battle time. */
export function hullRoll(ship: Pick<ShipState, 'id' | 'role' | 'faction'>, seconds: number): number {
  const roll = heldRoll(ship);
  if (ship.role !== 'reaper_capital' && ship.role !== 'reaper_destroyer') return 0;
  return roll + REAPER_ROLL.sway * Math.sin(seconds * (Math.PI * 2 / REAPER_ROLL.swaySeconds) + held.get(ship)!.phase);
}

/** The yaw and pitch a hull's bow is held off its heading: zero for anything that is not a Reaper hull. */
export function heldTrim(ship: Pick<ShipState, 'id' | 'role' | 'faction'>): { yaw: number; pitch: number } {
  heldRoll(ship);
  const found = held.get(ship);
  return found ? { yaw: found.yaw, pitch: found.pitch } : { yaw: 0, pitch: 0 };
}

const OFFSET = new THREE.Quaternion();
const EULER = new THREE.Euler();
/**
 * The turn to apply to a hull after it has been pointed along its heading: its trim, then its roll with any
 * banking added. Null where there is nothing to apply. The detailed model and the batched copy of a hull both
 * use this, so a hull does not change attitude when it changes level of detail.
 */
export function attitudeOffset(ship: Pick<ShipState, 'id' | 'role' | 'faction'>, seconds: number, bank = 0): THREE.Quaternion | null {
  const roll = bank + hullRoll(ship, seconds);
  const trim = heldTrim(ship);
  if (roll === 0 && trim.yaw === 0 && trim.pitch === 0) return null;
  return OFFSET.setFromEuler(EULER.set(trim.pitch, trim.yaw, roll, 'YXZ'));
}

/**
 * The roll a turning hull is drawn at, in radians: fighters bank hard, escorts a little, dreadnoughts and Reaper
 * capitals not at all. `hx`, `hz` are the hull's heading as it is drawn (between simulation steps).
 */
export function turnBank(s: Pick<ShipState, 'role' | 'prevHeading' | 'heading' | 'vel'>, hx: number, hz: number): number {
  const turn = s.prevHeading.x * s.heading.z - s.prevHeading.z * s.heading.x;
  // Speed across the heading, to the hull's level right (hz, 0, −hx).
  const lateral = s.vel.x * hz - s.vel.z * hx;
  const factor = s.role === 'fighter' ? .36 : s.role === 'frigate' ? .12 :
    s.role === 'cruiser' ? .025 : s.role === 'reaper_destroyer' ? .015 : 0;
  return THREE.MathUtils.clamp(turn * 3.5 + lateral * factor * .12, -factor, factor);
}

const AHEAD = new THREE.Vector3(0, 0, 1);
const DRAWN = new THREE.Quaternion();
/**
 * Which way a hull's own "up" points as it is drawn, at right angles to `heading` (the hull's drawn heading, of
 * length one). A camera that sits in or on a hull must use this, not the level of the battle: a hull is drawn by
 * the shortest turn from "ahead" to its heading, then its bank and any held roll, so a frigate that has come about
 * can be drawn far from level (measured in the Battle of Earth: up to 175 degrees). A seat placed "above" such a
 * hull by the battle's level is under its keel.
 */
export function drawnUp(ship: Pick<ShipState, 'id' | 'role' | 'faction' | 'prevHeading' | 'heading' | 'vel'>, heading: THREE.Vector3, seconds: number, out: THREE.Vector3): THREE.Vector3 {
  DRAWN.setFromUnitVectors(AHEAD, heading);
  const offset = attitudeOffset(ship, seconds, turnBank(ship, heading.x, heading.z));
  if (offset) DRAWN.multiply(offset);
  out.set(0, 1, 0).applyQuaternion(DRAWN);
  // A Reaper's trim holds its bow a few degrees off its heading: keep only what is across the heading.
  out.addScaledVector(heading, -out.dot(heading));
  return out.lengthSq() > 1e-9 ? out.normalize() : out.set(0, 1, 0);
}
