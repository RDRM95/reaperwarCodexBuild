import { describe, expect, it } from 'vitest';
import { resolveOverlayDetail, summariseFleetLabels, type FleetLabelShip } from '@/ui/fleetLabels';

const ship = (fleetId: string, x: number, alive = true, escaped = false): FleetLabelShip => ({ fleetId, pos: { x, y: x / 2, z: -x }, alive, escaped });

describe('fleet-level tactical annotations', () => {
  it('counts only deployed survivors and centres labels on the surviving fleet', () => {
    const ships = [ship('line', 2), ship('line', 6), ship('line', 100, false), ship('line', 200, true, true), ship('pressure', -4)];
    const before = structuredClone(ships);
    expect(summariseFleetLabels(ships)).toEqual([
      { fleetId: 'line', count: 2, position: { x: 4, y: 2, z: -4 } },
      { fleetId: 'pressure', count: 1, position: { x: -4, y: -2, z: 4 } },
    ]);
    expect(ships).toEqual(before);
    expect(summariseFleetLabels([])).toEqual([]);
    expect(summariseFleetLabels([ship('pending-or-lost', 0, false)])).toEqual([]);
  });

  it('collapses a thousand deployed hulls to four deterministic world-space labels', () => {
    const ships = Array.from({ length: 1000 }, (_, i) => ship(`fleet-${i % 4}`, i));
    const labels = summariseFleetLabels(ships);
    expect(labels).toHaveLength(4);
    expect(labels.map(fleet => fleet.count)).toEqual([250, 250, 250, 250]);
    expect(labels.map(fleet => fleet.position.x)).toEqual([498, 499, 500, 501]);
    expect(summariseFleetLabels(ships)).toEqual(labels);
  });

  it('uses arrival/casualty hysteresis and always honours an explicit detail choice', () => {
    let mode: 'ships' | 'fleets' = 'ships';
    const states = [79, 80, 79, 64, 63, 79, 80].map(count => {
      mode = resolveOverlayDetail('auto', mode, count); return mode;
    });
    expect(states).toEqual(['ships', 'fleets', 'fleets', 'fleets', 'ships', 'ships', 'fleets']);
    expect(resolveOverlayDetail('ships', 'fleets', 1000)).toBe('ships');
    expect(resolveOverlayDetail('fleets', 'ships', 2)).toBe('fleets');
  });
});
