/**
 * Orders given by dragging an area on the battle. Pure geometry and bookkeeping, so it can be tested without a
 * browser: what a dragged rectangle contains, where a click falls on a fleet's own level, and which ship of a
 * selection attacks which enemy when a whole group of them is marked.
 */

export interface ScreenRect { left: number; top: number; right: number; bottom: number }
export interface ScreenPoint { x: number; y: number }
export interface Placed { id: string; pos: { x: number; y: number; z: number } }

/** Pixels the pointer must travel before a press becomes a drag: under this it is a click. */
export const DRAG_THRESHOLD = 4;

/** The rectangle between two corners, whichever way it was dragged. */
export function rectBetween(a: ScreenPoint, b: ScreenPoint): ScreenRect {
  return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y) };
}

export function rectContains(rect: ScreenRect, point: ScreenPoint): boolean {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

/** Whether a drag has gone far enough to be an area and not a click. */
export function isArea(rect: ScreenRect): boolean {
  return rect.right - rect.left > DRAG_THRESHOLD || rect.bottom - rect.top > DRAG_THRESHOLD;
}

/**
 * Where a ray from `origin` along `direction` meets the level plane at height `level`, or undefined if it never
 * does (it runs level, or the plane is behind it) or meets it further off than `reach`.
 */
export function pointOnLevel(origin: { x: number; y: number; z: number }, direction: { x: number; y: number; z: number }, level: number, reach = Infinity): { x: number; y: number; z: number } | undefined {
  if (Math.abs(direction.y) < 1e-9) return undefined;
  const t = (level - origin.y) / direction.y;
  if (!(t > 0) || t > reach) return undefined;
  return { x: origin.x + direction.x * t, y: level, z: origin.z + direction.z * t };
}

/** The mean height of some ships: the level a move order for them is laid on. */
export function meanLevel(ships: readonly Placed[]): number {
  return ships.length ? ships.reduce((sum, s) => sum + s.pos.y, 0) / ships.length : 0;
}

/**
 * Share a group of marked enemies among the ships ordered to attack them. Each attacker takes the enemy nearest
 * it, counting an enemy that already has its share of attackers as further away, so that a marked group is engaged
 * as a group: ten ships sent at five enemies put about two on each, not ten on the nearest. Attackers are taken in
 * the order given and ties go to the earlier target, so the same order always makes the same assignment.
 * Returns target id -> the ids of the ships sent at it.
 */
export function assignAreaTargets(attackers: readonly Placed[], targets: readonly Placed[]): Map<string, string[]> {
  const assigned = new Map<string, string[]>();
  if (!attackers.length || !targets.length) return assigned;
  const share = Math.max(1, Math.ceil(attackers.length / targets.length));
  const load = new Map<string, number>();
  for (const ship of attackers) {
    let best: Placed | undefined, bestCost = Infinity;
    for (const target of targets) {
      const d = Math.hypot(target.pos.x - ship.pos.x, target.pos.y - ship.pos.y, target.pos.z - ship.pos.z);
      // An enemy with its full share already counts as that many times as far again.
      const cost = d * (1 + Math.floor((load.get(target.id) ?? 0) / share) * 4) + (load.get(target.id) ?? 0) * 1e-6;
      if (cost < bestCost) { bestCost = cost; best = target; }
    }
    if (!best) continue;
    load.set(best.id, (load.get(best.id) ?? 0) + 1);
    const list = assigned.get(best.id);
    if (list) list.push(ship.id); else assigned.set(best.id, [ship.id]);
  }
  return assigned;
}
