import { describe, expect, it } from 'vitest';
import { buildScenario } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import { slotToWorld } from '@/simulation/formations';

/**
 * Hulls do not give way to fighters. The clearance field treated a fighter like any other hull, so a carrier was
 * pushed about by its own wing forming up and landing on it: holding formation in the Battle of Earth, carriers
 * drifted up to 5.1, 5.4 and 6.0 km off their stations (seeds 1 to 3; 1.1 to 1.5 km on average) while the
 * dreadnoughts beside them stayed within 0.8 km. Fighters still avoid hulls and each other.
 */
function heldFleet(seed: number) {
  const sim = new BattleSimulation(buildScenario('battle_of_earth', 'prime_apex', seed));
  const fleet = [...sim.fleets.values()].find(f => f.spec.side === 'A')!;
  sim.issueOrders(fleet.spec.id, { order: 'hold_formation' });
  let carrierWorst = 0, dreadnoughtWorst = 0, fighterHullContacts = 0, launched = 0;
  while (!sim.finished && sim.time < 150) {
    sim.step();
    if (sim.time < 20) continue;
    const live = sim.ships.filter(s => s.alive && !s.escaped);
    for (const s of live) {
      if (s.fleetId !== fleet.spec.id || s.withdrawing || (s.role !== 'carrier' && s.role !== 'dreadnought')) continue;
      const station = slotToWorld(fleet.anchor, fleet.heading, s.slot);
      const off = Math.hypot(s.pos.x - station.x, s.pos.y - station.y, s.pos.z - station.z);
      if (s.role === 'carrier') carrierWorst = Math.max(carrierWorst, off); else dreadnoughtWorst = Math.max(dreadnoughtWorst, off);
    }
    if (sim.tick % 10 !== 0) continue;
    const fighters = live.filter(s => s.role === 'fighter'), hulls = live.filter(s => s.role !== 'fighter');
    launched = Math.max(launched, fighters.length);
    // A fighter inside a hull's radius, other than a wing on or leaving its own carrier.
    for (const f of fighters) for (const h of hulls) {
      if (h.id === f.carrierId) continue;
      if (Math.hypot(f.pos.x - h.pos.x, f.pos.y - h.pos.y, f.pos.z - h.pos.z) < h.radiusKm * 0.5) fighterHullContacts++;
    }
  }
  return { carrierWorst, dreadnoughtWorst, fighterHullContacts, launched };
}

describe('carriers hold their station', () => {
  it.each([1, 2, 3])('a carrier holding formation stays on station with its wing in the air (seed %i)', seed => {
    const held = heldFleet(seed);
    // Measured: 0.01, 0.11 and 0.00 km, where they were 5.1, 5.4 and 6.0 km.
    expect(held.carrierWorst).toBeLessThan(0.5);
    expect(held.dreadnoughtWorst).toBeLessThan(1);
    // The wings did fly, and no fighter ended up deep inside a hull that was not its own carrier.
    expect(held.launched).toBeGreaterThan(20);
    expect(held.fighterHullContacts).toBe(0);
  });
});
