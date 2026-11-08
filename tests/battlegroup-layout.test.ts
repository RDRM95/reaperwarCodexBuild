import { describe, expect, it } from 'vitest';
import { distance } from '@/core/vec3';
import { buildCustomBattle } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import { assignSlots, type SlotShip } from '@/simulation/formations';
import type { ShipState } from '@/simulation/types';

const extent = (positions: { x: number; y: number; z: number }[], axis: 'x' | 'y' | 'z') =>
  Math.max(...positions.map(p => p[axis])) - Math.min(...positions.map(p => p[axis]));
const capitals = (role: 'dreadnought' | 'reaper_capital', lengthKm: number): SlotShip[] =>
  Array.from({ length: 100 }, (_, i) => ({ id: `${role}-${i}`, role, lengthKm }));

function deployment(seed = 7) {
  return new BattleSimulation(buildCustomBattle({
    seed, rulesId: 'canon_me3', environment: 'deep_space', startingDistanceKm: 90, maxDuration: 120,
    sideA: { faction: 'alliance', name: 'Battlegroups', formation: 'line_abreast', counts: {
      alliance_dreadnought: 18, alliance_cruiser: 36, alliance_frigate: 36,
    } },
    sideB: { faction: 'reaper', name: 'Pressure front', formation: 'strike_wedge', counts: {
      reaper_capital: 12, reaper_destroyer: 24,
    } },
  }));
}

function nearestVariation(ships: SlotShip[]) {
  const positions = [...assignSlots(ships, 'line_abreast').values()];
  const nearest = positions.map((p, index) => Math.min(...positions.filter((_, i) => i !== index).map(q => distance(p, q))));
  const mean = nearest.reduce((a, b) => a + b, 0) / nearest.length;
  return Math.sqrt(nearest.reduce((sum, d) => sum + (d - mean) ** 2, 0) / nearest.length) / mean;
}

describe('cinematic battlegroup deployment', () => {
  it('deploys broad, shallow mixed fleets with clear hulls and escorts ahead of their gun line', () => {
    const sim = deployment();
    const fleet = sim.ships.filter(s => s.side === 'A');
    const points = fleet.map(s => s.pos);
    expect(extent(points, 'x')).toBeGreaterThan(extent(points, 'y') * 8);
    expect(extent(points, 'y')).toBeLessThan(7);
    expect(extent(points, 'z')).toBeGreaterThan(5);
    expect(extent(points, 'x')).toBeLessThan(55);
    const averageZ = (role: ShipState['role']) => {
      const members = fleet.filter(s => s.role === role);
      return members.reduce((sum, s) => sum + s.pos.z, 0) / members.length;
    };
    expect(averageZ('cruiser')).toBeGreaterThan(averageZ('dreadnought') + 1);
    expect(averageZ('frigate')).toBeGreaterThan(averageZ('cruiser') + 1);
    for (let i = 0; i < fleet.length; i++) for (let j = 0; j < i; j++) {
      expect(distance(fleet[i].pos, fleet[j].pos)).toBeGreaterThanOrEqual(fleet[i].radiusKm + fleet[j].radiusKm);
    }
    const gunLine = fleet.filter(s => s.role === 'dreadnought');
    for (const escort of fleet.filter(s => s.role === 'cruiser' || s.role === 'frigate')) {
      expect(Math.min(...gunLine.map(capital => distance(escort.pos, capital.pos)))).toBeLessThan(12);
    }
  });

  it('keeps organic spacing varied and Reaper wings ordered without random per-battle placement', () => {
    expect(nearestVariation(capitals('dreadnought', 0.888))).toBeGreaterThan(0.025);
    expect(nearestVariation(capitals('reaper_capital', 2))).toBeLessThan(0.01);
    const a = deployment(7), b = deployment(83), replay = deployment(7);
    // Different battles get different strategic silhouettes; the same battle
    // replays exactly, including its deterministic battle-group allocation.
    expect(a.ships.map(s => s.pos)).toEqual(replay.ships.map(s => s.pos));
    expect(a.ships.map(s => s.slot)).toEqual(replay.ships.map(s => s.slot));
    expect(a.ships.filter(s => s.side === 'A').map(s => s.slot))
      .not.toEqual(b.ships.filter(s => s.side === 'A').map(s => s.slot));
  });

  it('retains the selected column silhouette instead of making every large order a generic block', () => {
    const ships = capitals('reaper_capital', 2);
    const line = [...assignSlots(ships, 'line_abreast').values()];
    const column = [...assignSlots(ships, 'capital_column').values()];
    expect(extent(line, 'x')).toBeGreaterThan(extent(line, 'z') * 3);
    expect(extent(column, 'z')).toBeGreaterThan(extent(column, 'x') * 5);
    expect(extent(line, 'y')).toBeLessThan(8);
    expect(extent(column, 'y')).toBeLessThan(8);
  });
});
