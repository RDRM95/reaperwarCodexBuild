import { describe, expect, it } from 'vitest';
import { buildScenario } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import { REGROUP_FORMED_SHARE, REGROUP_TIME_LIMIT, regroupProgress } from '@/simulation/ai';
import type { FleetState, ShipState } from '@/simulation/types';

/**
 * Regroup. A fleet that has taken losses went on flying the formation it deployed in, with a hole wherever a hull
 * had died: in the Final Battle of Earth (canon_me3, seed 1) at 150 s the Alliance fleet is down to 21 of 49 hulls
 * with gaps of up to 7.1 km between neighbouring stations (2.85 km on average). No order closed it up; Hold
 * formation sent hulls back to the same holed layout. The Regroup order gives the survivors a fresh formation of
 * their own number where they stand, and resumes the attack once formed.
 */
const hulls = (sim: BattleSimulation, fleet: FleetState): ShipState[] =>
  sim.ships.filter(s => s.fleetId === fleet.spec.id && s.alive && !s.escaped && s.role !== 'fighter');
const nearest = (ships: ShipState[]): number[] => ships.map((a, i) =>
  Math.min(...ships.filter((_, j) => j !== i).map(b => Math.hypot(a.slot.x - b.slot.x, a.slot.y - b.slot.y, a.slot.z - b.slot.z))));
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const firstFleet = (sim: BattleSimulation) => [...sim.fleets.values()].find(f => f.spec.side === 'A')!;
const runTo = (sim: BattleSimulation, seconds: number) => { while (!sim.finished && sim.time < seconds) sim.step(); };

describe('the regroup order', () => {
  it('closes the gaps losses leave: survivors get a compact formation centred where they are', () => {
    const sim = new BattleSimulation(buildScenario('final_battle_of_earth', 'canon_me3', 1));
    const fleet = firstFleet(sim);
    const deployed = hulls(sim, fleet);
    runTo(sim, 150);
    const before = hulls(sim, fleet), gapBefore = mean(nearest(before)), worstBefore = Math.max(...nearest(before));
    // The fleet has taken losses. How many, and which, differs with every change to how battles go: three versions
    // of this battle left 21, 21 and 31 hulls of 49, with mean gaps between neighbouring stations of 2.69 to
    // 2.85 km and worst gaps of 7.1 to 15.6 km.
    expect(before.length).toBeLessThan(deployed.length * 0.8);
    expect(before.length).toBeGreaterThan(5);
    sim.issueOrders(fleet.spec.id, { order: 'regroup' });
    const after = hulls(sim, fleet);
    // Regrouping closes the gaps: in those versions the mean fell to 1.57 to 2.31 km and the worst to 2.3 to 5.4 km.
    // (The area the stations span is not asserted: above the battle-group size a fresh formation is no smaller.)
    expect(mean(nearest(after))).toBeLessThan(gapBefore * 0.9);
    expect(Math.max(...nearest(after))).toBeLessThan(worstBefore * 0.8);
    // The new formation is centred on the survivors, so the line closes up over the shortest distance.
    for (const axis of ['x', 'y', 'z'] as const) {
      expect(fleet.anchor[axis]).toBeCloseTo(mean(after.map(s => s.pos[axis])), 6);
      expect(mean(after.map(s => s.slot[axis]))).toBeCloseTo(0, 6);
    }
    expect(fleet.orders.order).toBe('regroup');
  });

  it('forms up in well under the time limit, keeps firing meanwhile, and resumes the attack on its own', () => {
    const sim = new BattleSimulation(buildScenario('battle_of_earth', 'prime_apex', 1));
    const fleet = firstFleet(sim);
    runTo(sim, 80);
    // Shots by every hull of the fleet, lost or not: a hull that dies while the fleet forms up still fired.
    const everyHull = sim.ships.filter(s => s.fleetId === fleet.spec.id && s.role !== 'fighter');
    const shots = () => everyHull.reduce((n, s) => n + s.stats.shotsFired, 0);
    const shotsBefore = shots();
    sim.issueOrders(fleet.spec.id, { order: 'regroup' });
    const startProgress = regroupProgress(fleet, sim.ships);
    let progress = startProgress, resumedAt = -1;
    while (!sim.finished && sim.time < 80 + REGROUP_TIME_LIMIT + 5) {
      if (fleet.orders.order === 'regroup') progress = regroupProgress(fleet, sim.ships);
      sim.step();
      if (fleet.orders.order !== 'regroup') { resumedAt = sim.time; break; }
    }
    // Measured: no hull on its new station at the order; 81 % formed and attacking again 38.9 s later, having fired
    // 167 shots meanwhile.
    expect(startProgress).toBeLessThan(0.2);
    expect(resumedAt - 80).toBeGreaterThan(10);
    expect(resumedAt - 80).toBeLessThan(REGROUP_TIME_LIMIT - 10);
    expect(progress).toBeGreaterThanOrEqual(REGROUP_FORMED_SHARE);
    expect(fleet.orders.order).toBe('attack');
    expect(shots()).toBeGreaterThan(shotsBefore + 50);
  });

  it('no two hulls touch at any tick while a fleet regroups', () => {
    const sim = new BattleSimulation(buildScenario('battle_of_earth', 'prime_apex', 1));
    const fleet = firstFleet(sim);
    runTo(sim, 80);
    sim.issueOrders(fleet.spec.id, { order: 'regroup' });
    let contacts = 0;
    while (!sim.finished && sim.time < 135) {
      sim.step();
      const ships = sim.ships.filter(s => s.alive && !s.escaped && s.role !== 'fighter');
      for (let i = 0; i < ships.length; i++) for (let j = 0; j < i; j++) {
        const a = ships[i], b = ships[j], reach = a.radiusKm + b.radiusKm, dx = a.pos.x - b.pos.x;
        if (dx > reach || dx < -reach) continue;
        if (Math.hypot(dx, a.pos.y - b.pos.y, a.pos.z - b.pos.z) < reach) contacts++;
      }
    }
    expect(contacts).toBe(0);
  });

  it('is the same manoeuvre for the same seed, and a fleet given no such order is not touched', () => {
    const run = (regroup: boolean) => {
      const sim = new BattleSimulation(buildScenario('battle_of_earth', 'prime_apex', 3));
      runTo(sim, 60);
      if (regroup) sim.issueOrders(firstFleet(sim).spec.id, { order: 'regroup' });
      runTo(sim, 100);
      return sim.ships.map(s => [s.pos.x, s.pos.y, s.pos.z, s.slot.x, s.slot.y, s.slot.z]);
    };
    const a = run(true);
    expect(a).toEqual(run(true));
    expect(a).not.toEqual(run(false));
  });
});
