import type { Vec3 } from '@/core/vec3';

export type OverlayDetail = 'auto' | 'ships' | 'fleets';
export type ResolvedOverlayDetail = Exclude<OverlayDetail, 'auto'>;

export interface FleetLabelShip {
  fleetId: string;
  alive: boolean;
  escaped: boolean;
  pos: Vec3;
}

export interface FleetLabelSummary {
  fleetId: string;
  count: number;
  position: Vec3;
}

/** One linear world-space pass. No camera projection or per-ship labels are
 * needed to describe a deployed fleet; absent reinforcements have no ships. */
export function summariseFleetLabels(ships: readonly FleetLabelShip[]): FleetLabelSummary[] {
  const fleets = new Map<string, FleetLabelSummary>();
  for (const ship of ships) {
    if (!ship.alive || ship.escaped) continue;
    let fleet = fleets.get(ship.fleetId);
    if (!fleet) {
      fleet = { fleetId: ship.fleetId, count: 0, position: { x: 0, y: 0, z: 0 } };
      fleets.set(ship.fleetId, fleet);
    }
    fleet.count++;
    fleet.position.x += ship.pos.x; fleet.position.y += ship.pos.y; fleet.position.z += ship.pos.z;
  }
  for (const fleet of fleets.values()) {
    fleet.position.x /= fleet.count; fleet.position.y /= fleet.count; fleet.position.z /= fleet.count;
  }
  return [...fleets.values()];
}

/** A casualty or arrival near the boundary must not flicker all annotations. */
export function resolveOverlayDetail(requested: OverlayDetail, previous: ResolvedOverlayDetail, liveShips: number): ResolvedOverlayDetail {
  if (requested !== 'auto') return requested;
  return liveShips >= 80 || previous === 'fleets' && liveShips >= 64 ? 'fleets' : 'ships';
}

export const OVERLAY_DETAIL_LABELS: Record<OverlayDetail, string> = {
  auto: 'Auto: fleet labels in large battles',
  ships: 'Individual ship labels',
  fleets: 'Fleet names and ship counts',
};
