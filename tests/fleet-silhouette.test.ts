import { describe, expect, it } from 'vitest';
import { assignSlots, type SlotShip } from '@/simulation/formations';
import type { FormationType } from '@/simulation/types';

function allFrigates(n: number): SlotShip[] {
  return Array.from({ length: n }, (_, i) => ({
    id: 'alliance-frigate-' + i, role: 'frigate', lengthKm: 0.17,
  }));
}
function silhouette(ships: SlotShip[], formation: FormationType, seed: number): number[] {
  const points = [...assignSlots(ships, formation, seed).values()];
  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
  const minZ = Math.min(...points.map(p => p.z)), maxZ = Math.max(...points.map(p => p.z));
  const bins = Array<number>(16 * 12).fill(0);
  for (const p of points) {
    const col = Math.min(15, Math.floor((p.x - minX) * 16 / Math.max(0.0001, maxX - minX)));
    const row = Math.min(11, Math.floor((p.z - minZ) * 12 / Math.max(0.0001, maxZ - minZ)));
    bins[row * 16 + col]++;
  }
  return bins;
}

describe('zoomed-out organic fleet silhouette', () => {
  it('breaks repeated template patterns even with a single ship class', () => {
    const ships = allFrigates(960);
    const a = silhouette(ships, 'line_abreast', 391);
    const b = silhouette(ships, 'line_abreast', 762);
    expect(a).not.toEqual(b);
    expect(a.reduce((sum, n) => sum + n, 0)).toBe(960);
    // An irregular fleet should contain actual empty approach corridors, not
    // a regular 16x12 carpet of equally populated identical squadrons.
    expect(a.filter(n => n === 0).length).toBeGreaterThan(25);
    expect(Math.max(...a)).toBeGreaterThan(Math.min(...a.filter(n => n > 0)) * 2);
    expect(silhouette(ships, 'line_abreast', 391)).toEqual(a);
  });

  it('keeps different strategic formations recognisable with the same seed', () => {
    const ships = allFrigates(480);
    const line = assignSlots(ships, 'line_abreast', 9);
    const column = assignSlots(ships, 'capital_column', 9);
    const minMax = (list: number[]) => Math.max(...list) - Math.min(...list);
    const lineWidth = minMax([...line.values()].map(p => p.x));
    const columnWidth = minMax([...column.values()].map(p => p.x));
    const columnDepth = minMax([...column.values()].map(p => p.z));
    expect(lineWidth).toBeGreaterThan(columnWidth * 1.5);
    expect(columnDepth).toBeGreaterThan(columnWidth * 1.4);
  });

  it('preserves ordered Reaper-only fronts and established small fleets', () => {
    const reapers: SlotShip[] = Array.from({ length: 100 }, (_, i) => ({
      id: 'reaper-' + i, role: 'reaper_capital', lengthKm: 2,
    }));
    // Reaper identity is exact spacing, not seed independence: every wave keeps
    // the capital pitch (2 km hulls at 3.4 km, nearest-neighbour CV below 0.03,
    // measured 0.00-0.01) while the order of battle (horns, vanguard, wave
    // widths) is seeded, so two seeds give two fronts of the same discipline.
    // The old equality pinned the one constant-pitch lattice for every seed.
    for (const seed of [13, 82]) {
      const points = [...assignSlots(reapers, 'line_abreast', seed).values()];
      const nearest = points.map((p, i) => Math.min(...points.filter((_, j) => j !== i).map(q => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z))));
      const mean = nearest.reduce((a, b) => a + b, 0) / nearest.length;
      const cv = Math.sqrt(nearest.reduce((sum, d) => sum + (d - mean) ** 2, 0) / nearest.length) / mean;
      expect(Math.min(...nearest)).toBeGreaterThanOrEqual(3.3);
      expect(cv).toBeLessThan(0.03);
    }
    expect(assignSlots(reapers, 'line_abreast', 13)).not.toEqual(assignSlots(reapers, 'line_abreast', 82));
    const small = allFrigates(7);
    expect(assignSlots(small, 'strike_wedge', 11)).toEqual(assignSlots(small, 'strike_wedge', 63));
  });

  it('allocates thousands of hulls without changing their identity or making invalid positions', () => {
    const ships: SlotShip[] = [
      ...Array.from({ length: 100 }, (_, i) => ({ id: 'D' + i, role: 'dreadnought' as const, lengthKm: 0.888 })),
      ...Array.from({ length: 300 }, (_, i) => ({ id: 'C' + i, role: 'cruiser' as const, lengthKm: 0.5 })),
      ...allFrigates(960),
    ];
    const slots = assignSlots(ships, 'line_abreast', 222);
    expect(slots.size).toBe(ships.length);
    expect([...slots.values()].every(p => Number.isFinite(p.x + p.y + p.z))).toBe(true);
    expect(assignSlots(ships, 'line_abreast', 222)).toEqual(slots);
    expect(silhouette(ships, 'line_abreast', 222))
      .not.toEqual(silhouette(ships, 'line_abreast', 333));
  });
});
