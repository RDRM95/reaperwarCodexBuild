import { describe, expect, it } from 'vitest';
import { buildScenario } from '@/scenarios';
import { buildCustomBattle } from '@/scenarios';
import { BattleSimulation, EARLY_ARRIVAL_SECONDS } from '@/simulation/battle';

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
    // Measured: the first wave (21 hulls) is gone at 61 s, where the battle used to end; the second arrives (five
    // seconds later, since it now comes early); all 32 Reaper hulls are destroyed and the battle ends at 114 s
    // with the Alliance the winner.
    expect(firstWaveGoneAt).toBeGreaterThan(40);
    expect(firstWaveGoneAt).toBeLessThan(due);
    expect(sim.finished).toBe(true);
    expect(sim.time).toBeGreaterThan(firstWaveGoneAt + 20);
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

  it('a fleet on its way comes early when its side has nothing left on the field', () => {
    // Waiting out the timetable left the victors of the first wave with nothing to shoot at: 22 to 31 s in this
    // battle over eight seeds. The second wave now arrives EARLY_ARRIVAL_SECONDS after the first wave's last hull.
    const config = buildScenario('final_battle_of_earth', 'prime_apex', 3);
    const second = config.fleets.find(f => f.side === 'B' && (f.arrivalTime ?? 0) > 0)!;
    const sim = new BattleSimulation(config);
    let absent = 0, firstWaveGoneAt = -1, secondArrivedAt = -1;
    while (!sim.finished && sim.time < 400) {
      sim.step();
      const present = hulls(sim, 'B').some(s => s.alive && !s.escaped);
      if (!present) { absent += 0.05; if (firstWaveGoneAt < 0) firstWaveGoneAt = sim.time; }
      if (secondArrivedAt < 0 && sim.fleets.has(second.id)) secondArrivedAt = sim.time;
    }
    // Measured: first wave gone at 61 s, second wave on the field at 66 s (its timetable says 90 s), the Reapers
    // absent for 5 s (31 s before), battle over at 114 s (152 s before) with all 32 Reaper hulls destroyed.
    expect(secondArrivedAt - firstWaveGoneAt).toBeGreaterThan(EARLY_ARRIVAL_SECONDS - 0.2);
    expect(secondArrivedAt - firstWaveGoneAt).toBeLessThan(EARLY_ARRIVAL_SECONDS + 0.2);
    expect(secondArrivedAt).toBeLessThan(90);
    expect(absent).toBeLessThan(EARLY_ARRIVAL_SECONDS + 0.2);
    expect(hulls(sim, 'B').length).toBe(32);
    expect(sim.result?.winner).toBe('A');
    // The scenario itself is not altered: a replay built from the same config sees the same timetable.
    expect(second.arrivalTime).toBe(90);
  });

  it('a side that has not yet taken the field keeps its timetable', () => {
    // An ambush: the Reapers are not there at the start and arrive at 30 s. Nothing of theirs has been destroyed,
    // so nothing is brought forward.
    const config = buildCustomBattle({ seed: 4, rulesId: 'canon_me3', environment: 'deep_space', startingDistanceKm: 40, maxDuration: 200,
      sideA: { faction: 'alliance', name: 'A', formation: 'line_abreast', counts: { alliance_cruiser: 2 } },
      sideB: { faction: 'reaper', name: 'B', formation: 'line_abreast', counts: { reaper_destroyer: 1 } } });
    const late = config.fleets.find(f => f.side === 'B')!;
    late.arrivalTime = 30;
    const sim = new BattleSimulation(config);
    let arrivedAt = -1;
    while (!sim.finished && sim.time < 60) { sim.step(); if (arrivedAt < 0 && hulls(sim, 'B').length > 0) arrivedAt = sim.time; }
    expect(sim.finished).toBe(false);
    expect(arrivedAt).toBeGreaterThan(29.9);
    expect(arrivedAt).toBeLessThan(30.2);
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
