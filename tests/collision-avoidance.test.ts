import { describe, expect, it } from 'vitest';
import { buildCustomBattle, buildScenario } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import type { BattleConfig } from '@/simulation/types';

/**
 * Hulls keep clear of each other at every tick, not only at the moments a sampler happens to look.
 *
 * Checked every 5 s, battles showed no overlapping hulls. Checked every tick, hulls on converging courses did touch:
 * over seeds 1 to 36 of the battle below, 10 seeds had a contact, 178 pair-ticks in all, the deepest 16.7 % of the two
 * hulls' combined radius. The clearance thrust only became strong a second or two before the pass, too late for a
 * hull closing at 0.8 to 1.6 km/s on 0.14 to 0.4 km/s² of thrust. A hull now also thrusts by what it takes to open
 * the predicted miss to a safe margin in the time left: the same 36 seeds have no contact.
 *
 * A hull's radius is half its length, so two radii touching is the first moment two hulls could meet end to end.
 */
function contacts(sim: BattleSimulation, seconds: number): { pairTicks: number; deepest: number; atDeployment: number } {
  let pairTicks = 0, deepest = 0, atDeployment = 0;
  const check = (deployment: boolean) => {
    const ships = sim.ships.filter(s => s.alive && !s.escaped && s.role !== 'fighter');
    for (let i = 0; i < ships.length; i++) {
      const a = ships[i];
      for (let j = 0; j < i; j++) {
        const b = ships[j], reach = a.radiusKm + b.radiusKm, dx = a.pos.x - b.pos.x;
        if (dx > reach || dx < -reach) continue;
        const gap = Math.hypot(dx, a.pos.y - b.pos.y, a.pos.z - b.pos.z);
        if (gap >= reach) continue;
        pairTicks++; deepest = Math.max(deepest, (reach - gap) / reach);
        if (deployment) atDeployment++;
      }
    }
  };
  check(true);
  while (!sim.finished && sim.time < seconds) { sim.step(); check(false); }
  return { pairTicks, deepest, atDeployment };
}

const line = (seed: number): BattleConfig => buildCustomBattle({
  seed, rulesId: 'prime_apex', environment: 'deep_space', startingDistanceKm: 60, maxDuration: 150,
  sideA: { faction: 'alliance', name: 'Alliance line', formation: 'line_abreast', counts: { alliance_dreadnought: 6, alliance_cruiser: 18, alliance_frigate: 30 } },
  sideB: { faction: 'reaper', name: 'Reaper pressure', formation: 'strike_wedge', counts: { reaper_capital: 8, reaper_destroyer: 30 } },
});

describe('collision avoidance at every tick', () => {
  // Seeds that had contacts before: 5 (destroyer into cruiser, 16.7 %), 11 (cruiser into its own dreadnought, 11.5 %),
  // 14 (destroyer into its own capital, 10.0 %) and 36 (15.2 %).
  it.each([5, 11, 14, 36])('54 hulls against 38 Reapers fight for 150 s without two hulls touching (seed %i)', seed => {
    const sim = new BattleSimulation(line(seed));
    expect(contacts(sim, 150)).toEqual({ pairTicks: 0, deepest: 0, atDeployment: 0 });
    // They did fight: this is not a battle where nothing closed.
    expect(sim.ships.filter(s => !s.alive).length).toBeGreaterThan(20);
  });

  it('allied fleets stationed side by side do not deploy inside each other', () => {
    // The Final Battle of Earth puts five allied fleets abreast. Before, seed 1 deployed three pairs of hulls from
    // different fleets overlapping, the worst a quarian heavy 35.1 % into an Alliance dreadnought.
    for (const seed of [1, 2, 3]) {
      const sim = new BattleSimulation(buildScenario('final_battle_of_earth', 'prime_apex', seed));
      expect(contacts(sim, 0).atDeployment, `seed ${seed}`).toBe(0);
    }
  });

  it('the Final Battle of Earth runs its first 100 s with no contact', () => {
    // Before: 473 pair-ticks over seeds 1 to 4 in 200 s, deployment overlaps included.
    const sim = new BattleSimulation(buildScenario('final_battle_of_earth', 'prime_apex', 1));
    expect(contacts(sim, 100).pairTicks).toBe(0);
  });

  it('a reinforcement arriving on top of a fight takes clear stations', () => {
    const config = line(3);
    const first = config.fleets.find(f => f.side === 'A')!;
    // A second Alliance wave arrives at 20 s exactly where the first deployed and may still be.
    config.fleets.push({ ...first, id: 'second-wave', name: 'Second wave', arrivalTime: 20 });
    const sim = new BattleSimulation(config);
    while (sim.time < 20.05) sim.step();
    const arrived = sim.ships.filter(s => s.fleetId === 'second-wave');
    expect(arrived.length).toBeGreaterThan(40);
    for (const ship of arrived) for (const other of sim.ships) {
      if (other === ship || !other.alive || other.role === 'fighter' || ship.role === 'fighter') continue;
      const gap = Math.hypot(ship.pos.x - other.pos.x, ship.pos.y - other.pos.y, ship.pos.z - other.pos.z);
      expect(gap, `${ship.id} and ${other.id}`).toBeGreaterThanOrEqual(ship.radiusKm + other.radiusKm);
    }
  });

  it('is deterministic', () => {
    const run = () => { const sim = new BattleSimulation(line(5)); while (sim.time < 40) sim.step(); return sim.ships.map(s => [s.pos.x, s.pos.y, s.pos.z]); };
    expect(run()).toEqual(run());
  });
});
