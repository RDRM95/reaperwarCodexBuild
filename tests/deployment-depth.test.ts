import { describe, expect, it } from 'vitest';
import { buildCustomBattle, buildScenario } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import { ALTITUDE_BAND_LIMIT, assignSlots, type SlotShip } from '@/simulation/formations';

/**
 * Fleets deploy as a volume. Before this, a large fleet's battle groups all stood within a few kilometres of one
 * level whatever its width: the 91-hull Fifth Fleet was 41.9 km wide, 22.2 km deep and 2.6 km tall (6 % of its
 * width), and a 528-hull fleet 132 km wide was 3.2 km tall (2.4 %). Battle groups now stand in altitude bands.
 * Distances are the simulation's own, the scale hulls are drawn at.
 */
const extent = (points: { x: number; y: number; z: number }[], axis: 'x' | 'y' | 'z') =>
  Math.max(...points.map(p => p[axis])) - Math.min(...points.map(p => p[axis]));

const fleetSlots = (sim: BattleSimulation, fleetId: string) =>
  sim.ships.filter(s => s.fleetId === fleetId && s.role !== 'fighter');

const custom = (multiple: number, seed = 7) => new BattleSimulation(buildCustomBattle({
  seed, rulesId: 'canon_me3', environment: 'deep_space', startingDistanceKm: 90, maxDuration: 120,
  sideA: { faction: 'alliance', name: 'A', formation: 'line_abreast', counts: {
    alliance_dreadnought: 6 * multiple, alliance_cruiser: 14 * multiple, alliance_frigate: 24 * multiple } },
  sideB: { faction: 'reaper', name: 'B', formation: 'strike_wedge', counts: {
    reaper_capital: 3 * multiple, reaper_destroyer: 8 * multiple } },
}));

describe('deployment in depth', () => {
  it('a scenario fleet stands at least an eighth as tall as it is wide, with every hull clear of the next', () => {
    // Measured: Fifth Fleet 27.9 % (was 6.2 %), Sword Alliance 26.3 % (6.6 %), Hierarchy at Palaven 28.4 % (8.8 %).
    for (const [scenario, fleetId] of [['battle_of_earth', 'alliance-5th'], ['final_battle_of_earth', 'sword-alliance'],
      ['final_battle_of_earth', 'sword-turian'], ['final_battle_of_earth', 'reaper-blockade'], ['defence_of_palaven', 'hierarchy-palaven']]) {
      const ships = fleetSlots(new BattleSimulation(buildScenario(scenario, 'prime_apex', 1)), fleetId);
      const slots = ships.map(s => s.slot);
      expect(extent(slots, 'y') / extent(slots, 'x'), `${scenario} ${fleetId}`).toBeGreaterThan(0.125);
      for (let i = 0; i < ships.length; i++) for (let j = 0; j < i; j++) {
        const gap = Math.hypot(slots[i].x - slots[j].x, slots[i].y - slots[j].y, slots[i].z - slots[j].z);
        expect(gap).toBeGreaterThan(ships[i].radiusKm + ships[j].radiusKm);
      }
    }
  });

  it('the height grows with the fleet and stops at the limit, so a very large fleet stays within its own reach', () => {
    // Measured heights: 44 hulls 6.4 km, 176 hulls 14.1 km, 528 hulls 14.0 km (2.9, 3.0 and 3.2 km when flat).
    const heights = [1, 4, 12].map(multiple => extent(fleetSlots(custom(multiple), 'custom-a').map(s => s.slot), 'y'));
    expect(heights[0]).toBeGreaterThan(5);
    expect(heights[1]).toBeGreaterThan(heights[0] * 1.5);
    expect(Math.abs(heights[2] - heights[1])).toBeLessThan(1.5);
    // Group bands reach the limit either side of the fleet's level; hulls inside a group add a little to that.
    expect(heights[2]).toBeLessThan(2 * ALTITUDE_BAND_LIMIT + 3);
  });

  it('centres the bands on the fleet level, so its altitude lane and its anchor still mean what they did', () => {
    for (const multiple of [1, 4]) for (const fleetId of ['custom-a', 'custom-b']) {
      const slots = new BattleSimulation(buildCustomBattle({
        seed: 11, rulesId: 'canon_me3', environment: 'deep_space', startingDistanceKm: 90, maxDuration: 120,
        sideA: { faction: 'alliance', name: 'A', formation: 'line_abreast', counts: { alliance_dreadnought: 6 * multiple, alliance_cruiser: 14 * multiple, alliance_frigate: 24 * multiple } },
        sideB: { faction: 'reaper', name: 'B', formation: 'strike_wedge', counts: { reaper_capital: 6 * multiple, reaper_destroyer: 16 * multiple } },
      })).ships.filter(s => s.fleetId === fleetId).map(s => s.slot);
      const meanY = slots.reduce((sum, slot) => sum + slot.y, 0) / slots.length;
      // Clearance moves a few hulls after the bands are centred; the mean measured 0.000 to 0.009 km.
      expect(Math.abs(meanY)).toBeLessThan(0.05);
    }
  });

  it('puts hulls on both sides of the fleet level in every wave, not one tilted sheet', () => {
    const ships: SlotShip[] = Array.from({ length: 100 }, (_, i) => ({ id: `r${i}`, role: 'reaper_capital', lengthKm: 2 }));
    const slots = [...assignSlots(ships, 'line_abreast').values()];
    const left = slots.filter(p => p.x < -10), right = slots.filter(p => p.x > 10);
    for (const half of [left, right]) {
      // Measured: 19 above and 20 below on the left of 39, 18 above and 24 below on the right of 42.
      expect(half.filter(p => p.y > 2).length).toBeGreaterThan(12);
      expect(half.filter(p => p.y < -2).length).toBeGreaterThan(12);
    }
    // Height is not a function of lateral position: the correlation between x and y measured -0.03.
    const mx = slots.reduce((n, p) => n + p.x, 0) / slots.length, my = slots.reduce((n, p) => n + p.y, 0) / slots.length;
    const cov = slots.reduce((n, p) => n + (p.x - mx) * (p.y - my), 0);
    const sx = Math.sqrt(slots.reduce((n, p) => n + (p.x - mx) ** 2, 0)), sy = Math.sqrt(slots.reduce((n, p) => n + (p.y - my) ** 2, 0));
    expect(Math.abs(cov / (sx * sy))).toBeLessThan(0.15);
  });

  it('is the same deployment for the same seed and leaves small fleets as they were', () => {
    expect(custom(4, 7).ships.map(s => s.slot)).toEqual(custom(4, 7).ships.map(s => s.slot));
    // Under the battle-group threshold nothing changes: a ten-hull Reaper group keeps its three levels, 1.98 km.
    const small = fleetSlots(new BattleSimulation(buildScenario('battle_of_earth', 'prime_apex', 1)), 'reaper-sol').map(s => s.slot);
    expect(extent(small, 'y')).toBeCloseTo(1.98, 1);
  });
});
