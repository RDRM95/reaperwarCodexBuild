import { describe, expect, it } from 'vitest';
import { buildCustomBattle } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';

/**
 * Hulls close to gun range. Each class's line moves forward as a block, so in a wide or deep fleet a hull's own
 * place could leave its target beyond its guns, and the correction for that was bounded at 15 % of its range. In
 * the default Custom Battle at four times its size (224 Alliance hulls against 48 Reapers, canon_me3, seed 1) 76 %
 * of Alliance frigates and 74 % of cruisers fired in a given 20 s between 60 and 140 s; the rest sat at about 1.2
 * times their gun range from their targets. At its ordinary size 57 % of frigates fired.
 */
function firingShare(scale: number, seed: number): Record<string, number> {
  const sim = new BattleSimulation(buildCustomBattle({
    seed, rulesId: 'canon_me3', environment: 'deep_space', theatreLayout: 'three_dimensional', startingDistanceKm: 76, maxDuration: 420,
    sideA: { faction: 'alliance', name: 'Alliance Task Force', formation: 'line_abreast', counts: { alliance_dreadnought: 8 * scale, alliance_carrier: scale, alliance_cruiser: 16 * scale, alliance_frigate: 30 * scale, alliance_frigate_thanix: scale } },
    sideB: { faction: 'reaper', name: 'Reaper harvest group', formation: 'strike_wedge', counts: { reaper_capital: 4 * scale, reaper_destroyer: 8 * scale } },
  }));
  const shots = new Map<string, number>(), samples: Record<string, number> = {}, firing: Record<string, number> = {};
  let next = 60;
  while (!sim.finished && sim.time < 140) {
    sim.step();
    if (sim.time < next) continue;
    next += 20;
    for (const ship of sim.ships) {
      if (!ship.alive || ship.escaped || ship.role === 'fighter') continue;
      const key = `${ship.side} ${ship.role}`;
      // A hull is counted from its second look on: the first only records how many shots it had fired by then.
      if (shots.has(ship.id)) {
        samples[key] = (samples[key] ?? 0) + 1;
        if (ship.stats.shotsFired > shots.get(ship.id)!) firing[key] = (firing[key] ?? 0) + 1;
      }
      shots.set(ship.id, ship.stats.shotsFired);
    }
  }
  const share: Record<string, number> = {};
  for (const key of Object.keys(samples)) share[key] = (firing[key] ?? 0) / samples[key];
  return share;
}

describe('hulls close to gun range', () => {
  it('in a battle four times the default size most escorts and the gun line are firing', () => {
    const share = firingShare(4, 1);
    // Measured: frigates 100 % (76 % before), cruisers 97 % (74 %), dreadnoughts 100 % (90 %), Reaper destroyers
    // 91 % (86 %).
    expect(share['A frigate']).toBeGreaterThan(0.8);
    expect(share['A cruiser']).toBeGreaterThan(0.75);
    expect(share['A dreadnought']).toBeGreaterThan(0.8);
    expect(share['B reaper_destroyer']).toBeGreaterThan(0.85);
  });

  it('at the default size nearly every frigate is firing', () => {
    const share = firingShare(1, 1);
    // Measured: 100 % (57 % before).
    expect(share['A frigate']).toBeGreaterThan(0.9);
  });
});
