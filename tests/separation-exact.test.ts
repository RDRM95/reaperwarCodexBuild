import { describe, expect, it } from 'vitest';
import { BattleSimulation } from '@/simulation/battle';
import { buildCustomBattle } from '@/scenarios';
import { SeparationField } from '@/simulation/separation';
import { ReferenceSeparationField } from './helpers/separationReference';

/**
 * The separation field was rewritten for speed (typed arrays, no per-pair allocation, empty grid cells skipped).
 * It must not change a single bit of any thrust request: battle outcomes are pinned elsewhere by seed.
 */
describe('separation field', () => {
  it('returns bit-identical thrust requests to the vector implementation it replaced', () => {
    for (const [seed, rulesId] of [[42, 'prime_apex'], [7, 'canon_me3']] as const) {
      const sim = new BattleSimulation(buildCustomBattle({
        seed, rulesId, environment: 'deep_space', startingDistanceKm: 30, maxDuration: 120,
        sideA: { faction: 'alliance', name: 'Line', formation: 'line_abreast', counts: { alliance_dreadnought: 6, alliance_cruiser: 18, alliance_frigate: 30 } },
        sideB: { faction: 'reaper', name: 'Reapers', formation: 'strike_wedge', counts: { reaper_capital: 8, reaper_destroyer: 30 } },
      }));
      let compared = 0, nonZero = 0;
      for (let tick = 0; tick < 600; tick++) {
        sim.step();
        if (tick % 40 !== 0) continue;
        const field = new SeparationField(sim.ships), reference = new ReferenceSeparationField(sim.ships);
        for (const ship of sim.ships) {
          const a = field.acceleration(ship), b = reference.acceleration(ship);
          expect(Object.is(a.x, b.x) && Object.is(a.y, b.y) && Object.is(a.z, b.z), `${ship.id} at tick ${tick}`).toBe(true);
          compared++;
          if (a.x !== 0 || a.y !== 0 || a.z !== 0) nonZero++;
        }
        expect(field.pairChecks).toBe(reference.pairChecks);
      }
      // The comparison is not vacuous: many hulls are actually being pushed apart.
      expect(compared).toBeGreaterThan(800);
      // Measured 47 and 46 of 1,380 since hulls take three-dimensional attack bearings; more than 50 crowded each
      // other while both fleets met in one plane.
      expect(nonZero).toBeGreaterThan(30);
    }
  });
});
