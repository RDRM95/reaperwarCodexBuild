import { describe, expect, it } from 'vitest';
import { buildScenario } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';

/**
 * A battle is not over while a fleet is still on its way.
 *
 * The end check looked only at the hulls present. A side that destroyed the first wave before the second was due
 * was declared the winner, and the second wave never arrived. Under prime_apex the Final Battle of Earth ended this
 * way in every one of twelve seeds, at 60 to 78 s, with its Reaper reinforcement due at 90 s: 21 Reaper hulls
 * fought and 11 never appeared. The Battle of Earth did in one seed of twelve (54 s, reinforcement due at 55 s).
 */
describe('the end of a battle', () => {
  const hulls = (sim: BattleSimulation, side: string) => sim.ships.filter(s => s.side === side && s.role !== 'fighter');

  it('the Final Battle of Earth goes on until its Reaper reinforcement has arrived and been fought', () => {
    const config = buildScenario('final_battle_of_earth', 'prime_apex', 3);
    const due = Math.max(...config.fleets.filter(f => f.side === 'B').map(f => f.arrivalTime ?? 0));
    expect(due).toBe(90);
    const sim = new BattleSimulation(config);
    let firstWaveGoneAt = -1;
    while (!sim.finished && sim.time < 400) {
      sim.step();
      if (firstWaveGoneAt < 0 && sim.time < due && !hulls(sim, 'B').some(s => s.alive && !s.escaped)) firstWaveGoneAt = sim.time;
    }
    // Measured: the first wave (21 hulls) is gone at 61 s, where the battle used to end; the second arrives at
    // 90 s; all 32 Reaper hulls are destroyed and the battle ends at 152 s with the Alliance the winner.
    expect(firstWaveGoneAt).toBeGreaterThan(40);
    expect(firstWaveGoneAt).toBeLessThan(due);
    expect(sim.finished).toBe(true);
    expect(sim.time).toBeGreaterThan(due);
    expect(hulls(sim, 'B').length).toBe(32);
    expect(hulls(sim, 'B').every(s => !s.alive)).toBe(true);
    expect(sim.result?.winner).toBe('A');
  });

  it('the Battle of Earth, seed 2, does not end a second before its second wave', () => {
    const sim = new BattleSimulation(buildScenario('battle_of_earth', 'prime_apex', 2));
    while (!sim.finished && sim.time < 400) sim.step();
    // Measured: 93 s and 14 Reaper hulls, where it ended at 54 s with 10.
    expect(sim.time).toBeGreaterThan(55);
    expect(hulls(sim, 'B').length).toBe(14);
    expect(sim.result?.winner).toBe('A');
  });

  it('a side with nothing left and nothing on its way has still lost', () => {
    const sim = new BattleSimulation(buildScenario('battle_of_earth', 'canon_me3', 1));
    while (!sim.finished && sim.time < 400) sim.step();
    // Measured: 113 s, as before; every Alliance hull lost, and the Reapers' second wave had long since arrived.
    expect(sim.finished).toBe(true);
    expect(sim.result?.winner).toBe('B');
    expect(hulls(sim, 'A').every(s => !s.alive || s.escaped)).toBe(true);
    expect(sim.time).toBeLessThan(200);
  });
});
