import { describe, expect, it } from 'vitest';
import { buildCustomBattle } from '@/scenarios';
import { BattleSimulation, SIM_DT } from '@/simulation/battle';
import { BREAKTHROUGH_DEPTH, FLANK_ANGLE, centroid, manoeuvreReached } from '@/simulation/ai';
import { sampleGeometry } from '@/simulation/engagementGeometry';
import type { OrderType } from '@/simulation/types';

/**
 * Fleet intents: `flank` takes a fleet round to one side of the enemy at its own range, `breakthrough` drives it past
 * the enemy to the far side. Before these orders a fleet could only close straight at its enemy and stop. Weapons do
 * no damage here, so the battle is a control experiment on movement: firing, arcs and collision avoidance stay real.
 */
function exercise(order: OrderType, seconds = 400) {
  const sim = new BattleSimulation(buildCustomBattle({
    seed: 42, rulesId: 'prime_apex', environment: 'deep_space', startingDistanceKm: 70, maxDuration: 900,
    sideA: { faction: 'alliance', name: 'Line', formation: 'line_abreast', counts: { alliance_dreadnought: 4, alliance_cruiser: 8, alliance_frigate: 8 } },
    sideB: { faction: 'reaper', name: 'Reapers', formation: 'line_abreast', counts: { reaper_capital: 3, reaper_destroyer: 8 } },
  }));
  for (const ship of sim.ships) for (const weapon of ship.weapons) weapon.def = { ...weapon.def, damage: 0 };
  sim.issueOrders('custom-b', { order: 'hold_formation' });
  const fleet = sim.fleets.get('custom-a')!;
  const enemyAtStart = centroid(sim.ships.filter(s => s.side === 'B'))!;
  const axis = { x: fleet.anchor.x - enemyAtStart.x, z: fleet.anchor.z - enemyAtStart.z };
  const axisLength = Math.hypot(axis.x, axis.z);
  sim.issueOrders('custom-a', { order });
  let reachedAt = -1, overlaps = 0;
  const advance = (time: number) => {
    for (let i = 0; i < time / SIM_DT && !sim.finished; i++) {
      sim.step();
      if (reachedAt < 0 && manoeuvreReached(fleet)) reachedAt = sim.time;
      if (sim.tick % 200 === 0) for (const row of sampleGeometry(sim)) overlaps += row.overlaps;
    }
  };
  advance(seconds);
  /** A point's bearing round the enemy from the fleet's starting bearing, degrees, and its distance. */
  const round = (p: { x: number; z: number }) => {
    const enemy = centroid(sim.ships.filter(s => s.side === 'B'))!;
    const v = { x: p.x - enemy.x, z: p.z - enemy.z }, d = Math.hypot(v.x, v.z);
    return { angle: Math.acos(Math.max(-1, Math.min(1, (v.x * axis.x + v.z * axis.z) / (d * axisLength)))) * 180 / Math.PI, distance: d, along: (v.x * axis.x + v.z * axis.z) / axisLength };
  };
  const hulls = sim.ships.filter(s => s.side === 'A' && s.role !== 'fighter');
  return { sim, fleet, hulls, round, advance, reachedAt: () => reachedAt, overlaps: () => overlaps };
}

describe('fleet intents', () => {
  it('attack closes straight at the enemy, as before', () => {
    const run = exercise('attack');
    expect(manoeuvreReached(run.fleet)).toBeUndefined();
    expect(run.round(run.fleet.anchor).angle).toBeLessThan(5);
    expect(run.fleet.engagementMode).toBe('hold');
  });

  it('flank takes the fleet round to the enemy\'s side at its own range, and it fights from there', () => {
    const run = exercise('flank');
    // Measured: on station at 103 s, anchor 62.1° round at 14.3 km of a 17.6 km range, hulls' centre 57.8° round.
    expect(run.reachedAt()).toBeGreaterThan(40);
    expect(run.reachedAt()).toBeLessThan(200);
    const anchor = run.round(run.fleet.anchor);
    expect(anchor.angle).toBeGreaterThan(FLANK_ANGLE * 180 / Math.PI - 10);
    expect(anchor.angle).toBeLessThan(FLANK_ANGLE * 180 / Math.PI + 5);
    expect(anchor.distance).toBeGreaterThan(run.fleet.engagementRange! * 0.7);
    expect(anchor.distance).toBeLessThan(run.fleet.engagementRange! * 1.1);
    expect(run.round(centroid(run.hulls)!).angle).toBeGreaterThan(45);
    expect(run.fleet.engagementMode).toBe('hold');
    expect(run.hulls.every(s => s.stats.shotsFired > 0)).toBe(true);
    expect(run.overlaps()).toBe(0);
  });

  it('breakthrough carries the line past the enemy to the far side, firing as it goes', () => {
    const run = exercise('breakthrough');
    // Measured: through at 218.9 s, anchor 12.5 km beyond the enemy's centre, 15 of 20 hulls past it.
    expect(run.reachedAt()).toBeGreaterThan(100);
    expect(run.reachedAt()).toBeLessThan(300);
    expect(run.round(run.fleet.anchor).along).toBeLessThan(-run.fleet.engagementRange! * BREAKTHROUGH_DEPTH * 0.5);
    expect(run.hulls.filter(s => run.round(s.pos).along < 0).length).toBeGreaterThanOrEqual(12);
    expect(run.fleet.engagementMode).toBe('hold');
    expect(run.hulls.every(s => s.stats.shotsFired > 0)).toBe(true);
    expect(run.overlaps()).toBe(0);
  });

  it('is a manoeuvre with an end: a new order drops it, and the same order again starts from where the fleet now stands', () => {
    const run = exercise('flank', 60);
    expect(manoeuvreReached(run.fleet)).toBe(false);
    run.sim.issueOrders('custom-a', { order: 'attack' });
    run.advance(1);
    expect(manoeuvreReached(run.fleet)).toBeUndefined();
    const before = run.round(run.fleet.anchor).angle;
    run.sim.issueOrders('custom-a', { order: 'flank' });
    run.advance(250);
    expect(manoeuvreReached(run.fleet)).toBe(true);
    // A further 65° from where it was when the order was given again, not from the start of the battle.
    expect(run.round(run.fleet.anchor).angle).toBeGreaterThan(before + 40);
  });

  it('is reproducible: the same seed and order give the same positions', () => {
    const positions = () => exercise('flank', 150).sim.ships.map(s => [s.pos.x, s.pos.y, s.pos.z]);
    expect(positions()).toEqual(positions());
  });
});
