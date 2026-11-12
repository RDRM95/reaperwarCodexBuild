import { describe, expect, it } from 'vitest';
import { buildScenario } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import type { ShipState } from '@/simulation/types';

/**
 * Choosing a target walks every enemy hull. At two thousand ships that is a hundred thousand hulls a tick, and
 * between six and nine in ten of them are out of sensor range; each cost two memory fetches (the ship, then its
 * position) to find that out. The battle now keeps this tick's enemy positions as packed numbers, written through
 * as each hull moves, and the choice rejects hulls out of sight from those. A hull with nothing in sight also used
 * to walk the enemy a second time to find the nearest; that is now found in the same pass.
 *
 * Neither changes what is chosen. These tests hold that: the packed numbers are the hulls' positions at every
 * moment they are read, and a battle fought without them is the same battle.
 */
describe('target choice from packed enemy positions', () => {
  const state = (ships: ShipState[]): string => ships
    .map(s => `${s.id}|${s.alive}|${s.hull}|${s.barriers}|${s.pos.x}|${s.pos.y}|${s.pos.z}|${s.targetId}|${s.stats.shotsFired}|${s.stats.damageDealt}`).join(';');

  it('the packed numbers are the positions of the enemy list, hull for hull, whenever a hull chooses', () => {
    // The Battle of Earth has carriers: fighters launch in the middle of a tick and hulls die in the middle of one.
    const sim = new BattleSimulation(buildScenario('battle_of_earth', 'prime_apex', 2));
    const read = sim.enemyPositions.bind(sim);
    let asked = 0, wrong = 0;
    sim.enemyPositions = (side) => {
      const packed = read(side);
      if (!packed) return packed;
      const enemies = sim.enemiesOf(side);
      asked++;
      for (let k = 0; k < enemies.length; k++) {
        const pos = enemies[k].pos;
        if (packed[3 * k] !== pos.x || packed[3 * k + 1] !== pos.y || packed[3 * k + 2] !== pos.z) wrong++;
      }
      return packed;
    };
    while (!sim.finished && sim.time < 70) sim.step();
    expect(sim.ships.some(s => s.role === 'fighter')).toBe(true);
    expect(sim.ships.some(s => !s.alive)).toBe(true);
    // Measured: asked 4,431 times in 70 s and every number agreed every time. With the write-through taken out,
    // 52,634 numbers disagree, and the next test's two battles differ.
    expect(asked).toBeGreaterThan(3000);
    expect(wrong).toBe(0);
  });

  it('they are offered only while a step moves its hulls', () => {
    const sim = new BattleSimulation(buildScenario('battle_of_earth', 'prime_apex', 2));
    expect(sim.enemyPositions('A')).toBeUndefined();
    sim.step();
    // Between steps a caller may move hulls about; the packed numbers would not follow.
    expect(sim.enemyPositions('A')).toBeUndefined();
    expect(sim.enemyPositions('B')).toBeUndefined();
  });

  it('a battle fought without them is the same battle', () => {
    for (const [scenario, rules, seed, seconds] of [['battle_of_earth', 'prime_apex', 2, 80], ['final_battle_of_earth', 'canon_me3', 1, 80]] as const) {
      const withPacked = new BattleSimulation(buildScenario(scenario, rules, seed));
      const without = new BattleSimulation(buildScenario(scenario, rules, seed));
      without.enemyPositions = () => undefined;
      while (!withPacked.finished && withPacked.time < seconds) withPacked.step();
      while (!without.finished && without.time < seconds) without.step();
      expect(withPacked.events.length).toBe(without.events.length);
      expect(state(withPacked.ships)).toBe(state(without.ships));
    }
  });
});
