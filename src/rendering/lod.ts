import type { ShipRole } from '@/data/types';

/**
 * Level-of-detail policy for ship visuals. Pure so it can be unit tested.
 *
 * - full: every mesh, engine glow sprites.
 * - reduced: hull and dark hull only (windows, accents, lights, seams and glow sprites hidden).
 * - point: the mesh is hidden and the ship is drawn as one vertex of the shared far-point cloud.
 */
export type LodLevel = 'full' | 'reduced' | 'point';

/** Mesh names that only matter up close. */
export const DETAIL_MESH_NAMES = new Set(['windows', 'accent', 'engine', 'lights', 'seams', 'plates', 'eye']);

/** Distance (render units) beyond which detail meshes are dropped, per unit of ship length. */
export const REDUCED_FACTOR = 70;
/** Distance beyond which the ship becomes a point, per unit of ship length. */
export const POINT_FACTOR = 700;
/** Small craft switch to points much earlier: they are sub-pixel long before the generic rule. */
export const FIGHTER_POINT_DISTANCE = 90;
export const FIGHTER_REDUCED_DISTANCE = 30;

/** `reach` scales every threshold: the Ultra preset keeps detail and models three times further out. */
export function lodLevel(distance: number, lengthUnits: number, role: ShipRole, enabled = true, reach = 1): LodLevel {
  if (!enabled) return 'full';
  if (role === 'fighter') {
    if (distance > FIGHTER_POINT_DISTANCE * reach) return 'point';
    return distance > FIGHTER_REDUCED_DISTANCE * reach ? 'reduced' : 'full';
  }
  const L = Math.max(0.5, lengthUnits);
  if (distance > L * POINT_FACTOR * reach) return 'point';
  if (distance > L * REDUCED_FACTOR * reach) return 'reduced';
  return 'full';
}

/** Match the original LOD thresholds using squared camera distance. */
export function lodLevelSquared(distanceSquared: number, lengthUnits: number, role: ShipRole, enabled = true, reach = 1): LodLevel {
  if (!enabled) return 'full';
  if (role === 'fighter') {
    return distanceSquared > (FIGHTER_POINT_DISTANCE * reach) ** 2 ? 'point'
      : distanceSquared > (FIGHTER_REDUCED_DISTANCE * reach) ** 2 ? 'reduced' : 'full';
  }
  const length = Math.max(0.5, lengthUnits);
  return distanceSquared > (length * POINT_FACTOR * reach) ** 2 ? 'point'
    : distanceSquared > (length * REDUCED_FACTOR * reach) ** 2 ? 'reduced' : 'full';
}
