import { describe, expect, it } from 'vitest';
import { buildCustomBattle, buildScenario } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import { assessReapers } from '@/simulation/reaperIntel';
import type { BattleConfig } from '@/simulation/types';

/**
 * The fleet's "guns ready" readout costs what it should.
 *
 * It asked every commanded gun for a firing solution, and a gun with no target in reach walks every enemy to find
 * that out. With 144 dreadnoughts closing on a thousand hulls that was 5.7 of the 6.7 ms the interface took to
 * refresh, four times a second, and the simulation thread did the same for every fleet with each snapshot it sent.
 * The readout now skips guns that cannot be ready (reloading, overheated, empty, leaving) and the rest search the
 * index of where the ships are that the simulation's own firing uses. Measured at 1,881 ships: the refresh went from
 * 6.1 to 0.9 ms.
 *
 * What it reports must not change. A ship's own status panel still works every gun out in full, walking every enemy,
 * so the sum of those over a fleet is the old readout: these tests hold the fleet's figures to it.
 */
const custom = (): BattleConfig => buildCustomBattle({ seed: 42, rulesId: 'prime_apex', environment: 'deep_space', startingDistanceKm: 60, maxDuration: 600,
  sideA: { faction: 'alliance', name: 'Alliance line', formation: 'line_abreast', counts: { alliance_dreadnought: 12, alliance_cruiser: 36, alliance_frigate: 60 } },
  sideB: { faction: 'reaper', name: 'Reaper pressure', formation: 'strike_wedge', counts: { reaper_capital: 16, reaper_destroyer: 60 } } });

interface Tally { ready: number; cooling: number; total: number }
/** The fleet's figures the long way: every ship's full status, added up. */
function byShip(sim: BattleSimulation, fleetId: string): Tally {
  const sum = { ready: 0, cooling: 0, total: 0 };
  for (const ship of sim.ships) {
    if (ship.fleetId !== fleetId || !ship.alive || ship.escaped) continue;
    const status = sim.primaryBatteryStatus(ship.id);
    if (!status) continue;
    sum.ready += status.ready; sum.cooling += status.cooling; sum.total += status.total;
  }
  return sum;
}

describe('the fleet gun readout', () => {
  const seen = { ready: 0, cooling: 0, idle: 0 };
  it.each([
    ['a custom fleet action', custom],
    ['the Battle of Earth', () => buildScenario('battle_of_earth', 'prime_apex', 3)],
    ['the Final Battle of Earth', () => buildScenario('final_battle_of_earth', 'canon_me3', 1)],
  ] as const)('reports what every gun worked out in full would report: %s', (_name, build) => {
    const sim = new BattleSimulation(build());
    let compared = 0;
    for (let tick = 0; tick < 2400 && !sim.finished; tick++) {
      sim.step();
      if (tick % 20) continue;
      for (const id of sim.fleets.keys()) {
        const quick = sim.fleetBatteryStatus(id);
        const full = byShip(sim, id);
        expect({ ready: quick.ready, cooling: quick.cooling, total: quick.total }).toEqual(full);
        if (!full.total) continue;
        compared++;
        if (full.ready) seen.ready++;
        if (full.cooling) seen.cooling++;
        if (full.ready + full.cooling < full.total) seen.idle++;
      }
    }
    expect(compared).toBeGreaterThan(50);
  });

  it('and at every step of a fight with carriers, where fighters launch and hulls die between two reads', () => {
    const sim = new BattleSimulation(buildScenario('battle_of_earth', 'prime_apex', 5));
    // Before the first step there is no index from the simulation, and the readout builds its own.
    for (const id of sim.fleets.keys()) {
      const quick = sim.fleetBatteryStatus(id);
      expect({ ready: quick.ready, cooling: quick.cooling, total: quick.total }).toEqual(byShip(sim, id));
    }
    for (let tick = 0; tick < 900 && !sim.finished; tick++) {
      sim.step();
      if (tick < 500) continue;
      for (const id of sim.fleets.keys()) {
        const quick = sim.fleetBatteryStatus(id);
        expect({ ready: quick.ready, cooling: quick.cooling, total: quick.total }).toEqual(byShip(sim, id));
      }
    }
  });

  it('those comparisons covered guns with a solution, guns reloading, and guns with nothing in reach', () => {
    expect(seen.ready).toBeGreaterThan(20);
    expect(seen.cooling).toBeGreaterThan(20);
    expect(seen.idle).toBeGreaterThan(20);
  });

  it('reading it does not touch the battle', () => {
    const state = (sim: BattleSimulation): string => sim.ships
      .map(s => `${s.id}|${s.alive}|${s.hull}|${s.barriers}|${s.pos.x}|${s.pos.z}|${s.targetId}|${s.stats.shotsFired}|${s.stats.damageDealt}`).join(';');
    const watched = new BattleSimulation(custom()), alone = new BattleSimulation(custom());
    for (let tick = 0; tick < 1200; tick++) {
      watched.step(); alone.step();
      for (const id of watched.fleets.keys()) watched.fleetBatteryStatus(id);
    }
    expect(state(watched)).toBe(state(alone));
  });

  it('the Reaper assessment, now one walk of the ships, gives the figures its twelve passes gave, to the last bit', () => {
    // The figures as they were worked out: a list and a pass for each.
    const before = (sim: BattleSimulation) => {
      const reapers = sim.ships.filter((s) => s.faction === 'reaper');
      const organic = sim.ships.filter((s) => s.faction !== 'reaper' && s.role !== 'fighter');
      const reaperStart = reapers.reduce((a, s) => a + s.pointValue, 0);
      const reaperLost = reapers.filter((s) => !s.alive).reduce((a, s) => a + s.pointValue, 0);
      const organicStart = organic.reduce((a, s) => a + s.pointValue, 0);
      const organicRemaining = organic.filter((s) => s.alive && !s.escaped).reduce((a, s) => a + s.pointValue, 0);
      const damage = organic.reduce((a, s) => a + s.stats.damageDealt, 0);
      const shots = Math.max(1, organic.reduce((a, s) => a + s.stats.shotsFired, 0));
      return {
        reaperLossesFraction: reaperStart > 0 ? reaperLost / reaperStart : 0,
        reaperCapitalLosses: reapers.filter((s) => s.role === 'reaper_capital' && !s.alive).length,
        organicFleetStrength: organicStart > 0 ? organicRemaining / organicStart : 0,
        organicTechCapability: Math.max(0, Math.min(1, damage / shots / 900)),
      };
    };
    for (const build of [custom, () => buildScenario('final_battle_of_earth', 'prime_apex', 2)]) {
      const sim = new BattleSimulation(build());
      let losses = 0;
      for (let tick = 0; tick < 3000 && !sim.finished; tick++) {
        sim.step();
        if (tick % 50) continue;
        const now = assessReapers(sim), was = before(sim);
        expect(now.reaperLossesFraction).toBe(was.reaperLossesFraction);
        expect(now.reaperCapitalLosses).toBe(was.reaperCapitalLosses);
        expect(now.organicFleetStrength).toBe(was.organicFleetStrength);
        expect(now.organicTechCapability).toBe(was.organicTechCapability);
        if (was.reaperLossesFraction > 0 && was.organicFleetStrength < 1) losses++;
      }
      expect(losses).toBeGreaterThan(5); // compared while both sides were losing ships
    }
  });
});
