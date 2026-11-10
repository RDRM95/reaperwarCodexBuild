import { describe, expect, it } from 'vitest';
import { assignSlots, type SlotShip } from '@/simulation/formations';
import { FORMATION_LABELS, type FormationType } from '@/simulation/types';

const formations = Object.keys(FORMATION_LABELS) as FormationType[];
const group = (count: number, role: SlotShip['role'], lengthKm: number): SlotShip[] =>
  Array.from({ length: count }, (_, i) => ({ id: `${role}-${i}`, role, lengthKm }));

describe('fleet formations', () => {
  for (const formation of formations) {
    it(`${formation}: keeps small mixed fleets finite, unique and repeatable`, () => {
      const ships = [...group(4, 'dreadnought', 0.888), ...group(6, 'cruiser', 0.55), ...group(8, 'frigate', 0.18), ...group(12, 'fighter', 0.018)];
      const slots = assignSlots(ships, formation);
      expect(slots.size).toBe(ships.length);
      expect(assignSlots(ships, formation)).toEqual(slots);
      expect(new Set([...slots.values()].map((p) => `${p.x},${p.y},${p.z}`)).size).toBe(ships.length);
      for (const p of slots.values()) expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
    });

    it(`${formation}: keeps a hundred 2 km capitals in clear, connected battlegroup waves`, () => {
      const ships = group(100, 'reaper_capital', 2);
      const slots = assignSlots(ships, formation);
      const positions = [...slots.values()];
      const extent = (axis: 'x' | 'y' | 'z') => Math.max(...positions.map(p => p[axis])) - Math.min(...positions.map(p => p[axis]));
      // A hundred two-kilometre hulls should span a broad front or a deliberate
      // column, rather than being packed into the old 40 x 40 x 40 km box.
      // The composer's Reaper front is seven wings with staggered waves and a
      // second altitude layer standing over the gaps between the columns, so
      // the hundred capitals span up to 154 units (85 km) measured, rather than
      // the 116 of the unstaggered lattice that the old bound of 120 encoded.
      // In height the front's horns, pickets and vanguard stand whole layer
      // pitches (3 km) above or below the body: measured 7.5-11.2 km against
      // the 8 km the flat two-layer stack encoded; the front is still at least
      // ten times wider than it is tall.
      expect(extent('y')).toBeLessThan(12);
      expect(extent('x')).toBeGreaterThan(extent('y') * 10);
      expect(extent('x')).toBeLessThan(formation === 'dispersed' ? 170 : 165);
      expect(extent('z')).toBeLessThan(formation === 'capital_column' ? 150 : formation === 'dispersed' ? 100 : 60);
      let minimumDistance = Infinity;
      let largestNearest = 0;
      for (let i = 0; i < positions.length; i++) {
        let nearest = Infinity;
        for (let j = 0; j < positions.length; j++) {
          if (i === j) continue;
          const a = positions[i], b = positions[j];
          const distance = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
          minimumDistance = Math.min(minimumDistance, distance);
          nearest = Math.min(nearest, distance);
        }
        largestNearest = Math.max(largestNearest, nearest);
      }
      expect(minimumDistance).toBeGreaterThanOrEqual(2.2 - 1e-8);
      expect(largestNearest).toBeLessThan(8);
    });

    it(`${formation}: prevents overlapping hull slots in massive mixed fleets`, () => {
      const ships = [...group(100, 'reaper_capital', 2), ...group(120, 'cruiser', 0.55), ...group(160, 'frigate', 0.18), ...group(240, 'fighter', 0.018)];
      const slots = assignSlots(ships, formation);
      expect(slots.size).toBe(ships.length);
      expect(assignSlots(ships, formation)).toEqual(slots);
      const positions = ships.map((ship) => slots.get(ship.id)!);
      let minimumClearance = Infinity;
      for (let i = 0; i < ships.length; i++) {
        expect(Number.isFinite(positions[i].x + positions[i].y + positions[i].z)).toBe(true);
        for (let j = 0; j < i; j++) {
          const a = positions[i], b = positions[j];
          minimumClearance = Math.min(minimumClearance, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) - (ships[i].lengthKm + ships[j].lengthKm) * 0.55);
        }
      }
      expect(minimumClearance).toBeGreaterThanOrEqual(-1e-8);
    });
  }

  it('preserves the original small line-abreast capital stations', () => {
    const slots = assignSlots(group(4, 'dreadnought', 0.888), 'line_abreast');
    expect([...slots.values()]).toEqual([
      { x: 0, y: 0, z: 0 },
      { x: 1.7600000000000002, y: 0, z: 0 },
      { x: -1.7600000000000002, y: 0, z: 0 },
      { x: 3.5200000000000005, y: 0, z: 0 },
    ]);
  });
});
