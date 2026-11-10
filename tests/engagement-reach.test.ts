import { describe, expect, it } from 'vitest';
import { distance, v3 } from '@/core/vec3';
import { BattleSimulation, SIM_DT } from '@/simulation/battle';
import { buildCustomBattle } from '@/scenarios';
import { movementGoal, shipEngagementRange } from '@/simulation/ai';
import { localReachTarget, reachableStation } from '@/simulation/engagementReach';

function battle() {
  const sim = new BattleSimulation(buildCustomBattle({
    seed: 42, rulesId: 'prime_apex', environment: 'deep_space', startingDistanceKm: 90, maxDuration: 400,
    sideA: { faction: 'alliance', name: 'Deep line', formation: 'line_abreast', counts: { alliance_dreadnought: 128 } },
    sideB: { faction: 'reaper', name: 'Contacts', formation: 'line_abreast', counts: { reaper_capital: 2 } },
  }));
  for (const ship of sim.ships) for (const weapon of ship.weapons) weapon.def = { ...weapon.def, damage: 0 };
  return sim;
}

describe('large fleet reach', () => {
  it('does not move a station that already supports fire', () => {
    const station = v3(3, 2, 8);
    expect(reachableStation(station, v3(), 20)).toBe(station);
    expect(distance(reachableStation(v3(12, 3, 40), v3(), 20), v3())).toBeCloseTo(18.8);
  });

  it('uses a local contact instead of an unreachable central focus and respects explicit targeting', () => {
    const sim = battle(), ship = sim.ships[0];
    const [near, remote] = sim.ships.filter(s => s.side === 'B');
    ship.pos = v3(); near.pos = v3(0, 0, 15); remote.pos = v3(30, 0, 30);
    expect(localReachTarget(ship, remote, near, 20)).toBe(near);
    ship.forcedTargetId = remote.id;
    expect(localReachTarget(ship, remote, near, 20)).toBe(remote);
  });

  it('does not send the capital line after a retreating contact beyond the existing leash', () => {
    const sim = battle(), ship = sim.ships[0], enemy = sim.ships.find(s => s.side === 'B')!;
    const fleet = sim.fleets.get(ship.fleetId)!;
    fleet.anchor = v3(); ship.pos = v3(); ship.slot = v3(); ship.targetId = enemy.id;
    enemy.pos = v3(0, 0, 200);
    sim.issueOrders(enemy.fleetId, { order: 'retreat' });
    // Reapers reject retreat orders by design; a withdrawing contact still
    // exercises the no-chase boundary independently of faction order policy.
    enemy.withdrawing = true;
    const range = shipEngagementRange(ship);
    expect(distance(movementGoal(sim, ship, fleet).position, ship.pos)).toBeLessThan(range * .8);
  });

  it('lets a rear capital close to gun range after the main anchor holds without changing its speed or weapon range', () => {
    const sim = battle();
    // Isolate one rear hull to test the controller, retaining the large-fleet
    // order of battle. Other allied hulls cannot kill the stationary contact.
    const ship = sim.ships[0], enemy = sim.ships.find(s => s.side === 'B')!;
    for (const other of sim.ships) if (other !== ship && other !== enemy) other.escaped = true;
    const fleet = sim.fleets.get(ship.fleetId)!;
    fleet.anchor = v3(); fleet.engagementMode = 'hold'; fleet.decisionTimer = 1000;
    fleet.focusTargetId = enemy.id; fleet.enemyCentre = enemy.pos = v3(0, 0, 15);
    ship.pos = v3(0, 0, -30); ship.slot = v3(0, 0, -30); ship.heading = v3(0, 0, 1);
    ship.targetId = enemy.id; enemy.pos = v3(0, 0, 15);
    sim.issueOrders(enemy.fleetId, { order: 'hold_formation' });
    sim.fleets.get(enemy.fleetId)!.anchor = { ...enemy.pos }; enemy.slot = v3();
    const range = shipEngagementRange(ship), speed = ship.maxSpeed;
    const goal = movementGoal(sim, ship, fleet);
    expect(distance(goal.position, enemy.pos)).toBeLessThan(range);
    for (let tick = 0; tick < Math.round(300 / SIM_DT) && !sim.finished; tick++) sim.step();
    expect(ship.stats.shotsFired).toBeGreaterThan(0);
    expect(ship.maxSpeed).toBe(speed);
    expect(shipEngagementRange(ship)).toBe(range);
  });
});
