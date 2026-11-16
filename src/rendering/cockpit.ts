/**
 * First-person seats and fixed chase positions. Pure tables and choices, so they can be tested without a renderer.
 *
 * A seat is where the cockpit camera sits in a hull, in hull lengths from its centre: forward along the heading
 * and up from it. What is drawn over the picture depends on what the hull is: a canopy for a piloted fighter, an
 * optic for an Oculus (it is an eye, not a cockpit), a bridge window for anything larger.
 */
export type CockpitStyle = 'canopy' | 'optic' | 'bridge';

export interface Seat { forward: number; up: number }

export function cockpitStyle(role: string, faction: string): CockpitStyle {
  if (role === 'fighter') return faction === 'reaper' ? 'optic' : 'canopy';
  return faction === 'reaper' ? 'optic' : 'bridge';
}

/** Where the eye is. A fighter's seat is over its fuselage, so its nose is in the picture; an Oculus looks out of
 * the front of its eye; a Reaper from the brow of its hood; a warship from a bridge on its back, a fifth of its
 * length ahead of centre, with its bow reaching out below. */
export function seatFor(role: string, faction: string): Seat {
  if (role === 'fighter') return faction === 'reaper' ? { forward: 0.52, up: 0 } : { forward: 0.1, up: 0.1 };
  if (faction === 'reaper') return { forward: 0.3, up: 0.12 };
  return { forward: 0.2, up: 0.085 };
}

/** The cockpit camera's field of view, in degrees: wider than the 50 of every other camera, as a view out of a canopy is. */
export const COCKPIT_FOV = 66;

export interface ChaseView { name: string; back: number; up: number; side: number }

/**
 * Fixed chase positions, in hull lengths from the hull's centre: behind (back), above (up) and to starboard
 * (side). The camera is held there rigidly and looks ahead over the hull; it cannot be dragged. Pressing the
 * Chase camera again steps to the next.
 */
export const CHASE_VIEWS: readonly ChaseView[] = [
  { name: 'Tail', back: 1.5, up: 0.38, side: 0 },
  { name: 'High tail', back: 2.4, up: 1.1, side: 0 },
  { name: 'Starboard quarter', back: 1.3, up: 0.3, side: 0.95 },
  { name: 'Port quarter', back: 1.3, up: 0.3, side: -0.95 },
  { name: 'Close tail', back: 0.75, up: 0.2, side: 0 },
];
