import { describe, expect, it } from 'vitest';
import { buildCustomBattle } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import { v3 } from '@/core/vec3';

function duel() {
  const sim = new BattleSimulation(buildCustomBattle({
    seed: 42, rulesId: 'canon_me3', environment: 'deep_space', startingDistanceKm: 24, maxDuration: 60,
    sideA: { faction: 'alliance', name: 'Line', formation: 'line_abreast', counts: { alliance_dreadnought: 1 } },
    sideB: { faction: 'reaper', name: 'Beam', formation: 'line_abreast', counts: { reaper_capital: 1 } },
  }));
  for (const s of sim.ships) for (const w of s.weapons) w.cooldown = 100;
  sim.issueOrders('custom-a', { order: 'hold_formation' });
  sim.issueOrders('custom-b', { order: 'hold_formation' });
  return sim;
}

describe('live firing solutions', () => {
  it.each(['range', 'arc'] as const)('active beams stop damaging a target that leaves their %s', constraint => {
    const sim = duel();
    const target = sim.ships[0], shooter = sim.ships[1];
    const beam = shooter.weapons.find(w => w.def.kind === 'reaper_beam')!;
    beam.beamRemaining = 1;
    beam.beamHit = true;
    beam.beamTargetId = target.id;
    if (constraint === 'arc') shooter.heading = v3(0, 0, 1); // away from Alliance
    else {
      target.pos.z = shooter.pos.z - beam.def.range * 2;
      sim.fleets.get(target.fleetId)!.anchor = { ...target.pos };
    }
    const health = [target.hull, target.barriers];
    sim.step();
    expect([target.hull, target.barriers]).toEqual(health);
    expect(beam.beamRemaining).toBeLessThan(1);
  });

  it('does not waste later point-defence shots on a ship already killed in the same tick', () => {
    const sim = duel();
    const shooter = sim.ships[0], target = sim.ships[1];
    target.hull = 1; target.barriers = 0; target.armour = 0;
    for (const w of shooter.weapons) {
      w.cooldown = 0;
      w.def = { ...w.def, kind: 'gardian', damageType: 'laser', antiSmall: true, antiCapital: false, range: 100, arc: 360, accuracy: 10, damage: 10, heat: 0 };
    }
    sim.step();
    expect(target.alive).toBe(false);
    const destroyed = sim.events.findIndex(e => e.type === 'ship_destroyed' && e.shipId === target.id);
    expect(destroyed).toBeGreaterThan(0);
    expect(sim.events.slice(destroyed + 1).some(e => e.type === 'weapon_fired' && e.targetId === target.id)).toBe(false);
  });
});
