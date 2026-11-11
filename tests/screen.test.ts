import { describe, expect, it } from 'vitest';
import { buildCustomBattle, buildScenario } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import { centroid, screenStation } from '@/simulation/ai';
import { slotToWorld } from '@/simulation/formations';
import type { OrderType, ShipState } from '@/simulation/types';

/**
 * Screen. A formation's escort stations face the way the fleet deployed. When the enemy came round a flank, a fleet
 * holding formation kept its escorts where they were: in the control battle below (weapons do no damage; the
 * Reapers flank) 7 of its 16 escorts ended between the capitals and the enemy, the escorts 60° off that line on
 * average, and the nearest Reaper stood 6.4 km from a dreadnought. Under the Screen order the capitals hold their
 * formation and the escorts stand between them and the enemy wherever it is: 16 of 16, 22° off the line, the nearest
 * Reaper 9.0 km from a dreadnought.
 */
const escort = (s: ShipState) => s.role === 'cruiser' || s.role === 'frigate' || s.role === 'reaper_destroyer';

function flanked(order: OrderType) {
  const sim = new BattleSimulation(buildCustomBattle({
    seed: 42, rulesId: 'prime_apex', environment: 'deep_space', startingDistanceKm: 70, maxDuration: 900,
    sideA: { faction: 'alliance', name: 'Line', formation: 'line_abreast', counts: { alliance_dreadnought: 4, alliance_cruiser: 8, alliance_frigate: 8 } },
    sideB: { faction: 'reaper', name: 'Reapers', formation: 'line_abreast', counts: { reaper_capital: 3, reaper_destroyer: 8 } },
  }));
  for (const ship of sim.ships) for (const weapon of ship.weapons) weapon.def = { ...weapon.def, damage: 0 };
  sim.issueOrders('custom-a', { order });
  sim.issueOrders('custom-b', { order: 'flank' });
  while (sim.time < 160) sim.step();
  const mine = sim.ships.filter(s => s.side === 'A' && s.role !== 'fighter');
  const capitals = mine.filter(s => !escort(s)), escorts = mine.filter(escort), enemy = sim.ships.filter(s => s.side === 'B');
  const centre = centroid(capitals)!, threat = centroid(enemy)!;
  const axis = { x: threat.x - centre.x, y: threat.y - centre.y, z: threat.z - centre.z }, axisLength = Math.hypot(axis.x, axis.y, axis.z);
  const bearings = escorts.map(s => {
    const v = { x: s.pos.x - centre.x, y: s.pos.y - centre.y, z: s.pos.z - centre.z };
    const along = (v.x * axis.x + v.y * axis.y + v.z * axis.z) / axisLength;
    return { along, angle: Math.acos(along / Math.hypot(v.x, v.y, v.z)) * 180 / Math.PI };
  });
  return {
    sim, capitals, escorts,
    between: bearings.filter(b => b.angle < 45 && b.along > 1).length,
    offAxis: bearings.reduce((n, b) => n + b.angle, 0) / bearings.length,
    nearestToCapital: Math.min(...enemy.map(e => Math.min(...capitals.map(c => Math.hypot(e.pos.x - c.pos.x, e.pos.y - c.pos.y, e.pos.z - c.pos.z))))),
    fired: mine.filter(s => s.stats.shotsFired > 0).length / mine.length,
  };
}

describe('the screen order', () => {
  it('keeps the escorts between the capitals and an enemy that comes round the flank', () => {
    const held = flanked('hold_formation'), screened = flanked('screen');
    // Holding formation: measured 7 of 16 between, 60° off the line, nearest Reaper 6.4 km from a dreadnought.
    expect(held.between).toBeLessThanOrEqual(9);
    expect(held.offAxis).toBeGreaterThan(45);
    // Screening: measured 16 of 16, 22° off the line, nearest Reaper 9.0 km from a dreadnought.
    expect(screened.between).toBe(16);
    expect(screened.offAxis).toBeLessThan(30);
    expect(screened.nearestToCapital).toBeGreaterThan(held.nearestToCapital * 1.3);
    // Every hull still fights, and the capitals are where the formation puts them.
    expect(screened.fired).toBe(1);
    const fleet = screened.sim.fleets.get('custom-a')!;
    for (const capital of screened.capitals) {
      const station = slotToWorld(fleet.anchor, fleet.heading, capital.slot);
      expect(Math.hypot(capital.pos.x - station.x, capital.pos.y - station.y, capital.pos.z - station.z)).toBeLessThan(1.5);
    }
  });

  it('gives every escort a station clear of the others, and no two hulls touch at any tick', () => {
    const sim = new BattleSimulation(buildScenario('battle_of_earth', 'prime_apex', 1));
    const fleet = [...sim.fleets.values()].find(f => f.spec.side === 'A')!;
    sim.issueOrders(fleet.spec.id, { order: 'screen' });
    let contacts = 0, clearance = Infinity;
    // 200 s: before hulls stopped giving way to fighters, two carriers of a screening fleet grazed each other late on.
    while (!sim.finished && sim.time < 200) {
      sim.step();
      const ships = sim.ships.filter(s => s.alive && !s.escaped && s.role !== 'fighter');
      for (let i = 0; i < ships.length; i++) for (let j = 0; j < i; j++) {
        const a = ships[i], b = ships[j], reach = a.radiusKm + b.radiusKm, dx = a.pos.x - b.pos.x;
        if (dx > reach || dx < -reach) continue;
        if (Math.hypot(dx, a.pos.y - b.pos.y, a.pos.z - b.pos.z) < reach) contacts++;
      }
      if (sim.tick % 200 !== 0) continue;
      const escorts = ships.filter(s => s.fleetId === fleet.spec.id && escort(s));
      const stations = escorts.map(s => screenStation(sim, fleet, s)!);
      for (let i = 0; i < escorts.length; i++) for (let j = 0; j < i; j++)
        clearance = Math.min(clearance, Math.hypot(stations[i].x - stations[j].x, stations[i].y - stations[j].y, stations[i].z - stations[j].z) - escorts[i].radiusKm - escorts[j].radiusKm);
    }
    // Measured: the closest pair of stations is 0.32 km clear of the two hulls' radii.
    expect(clearance).toBeGreaterThan(0.1);
    expect(contacts).toBe(0);
  });

  it('is the same for the same seed, and a later order drops the screen', () => {
    const run = () => {
      const sim = new BattleSimulation(buildScenario('battle_of_earth', 'prime_apex', 2));
      const id = [...sim.fleets.values()].find(f => f.spec.side === 'A')!.spec.id;
      sim.issueOrders(id, { order: 'screen' });
      while (sim.time < 40) sim.step();
      sim.issueOrders(id, { order: 'attack' });
      while (sim.time < 70) sim.step();
      return { positions: sim.ships.map(s => [s.pos.x, s.pos.y, s.pos.z]), order: sim.fleets.get(id)!.orders.order };
    };
    const a = run();
    expect(a).toEqual(run());
    expect(a.order).toBe('attack');
  });
});
