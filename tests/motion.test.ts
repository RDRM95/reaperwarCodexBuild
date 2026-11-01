import { describe, expect, it } from 'vitest';
import { distance, length, sub, v3 } from '@/core/vec3';
import { BattleSimulation, SIM_DT } from '@/simulation/battle';
import { advanceMotion } from '@/simulation/motion';
import { buildCustomBattle } from '@/scenarios';

function hull(classId: string) {
  return new BattleSimulation(buildCustomBattle({
    seed: 19, rulesId: 'canon_me3', environment: 'deep_space', startingDistanceKm: 60, maxDuration: 600,
    sideA: { faction: 'alliance', name: 'Arrival', formation: 'line_abreast', counts: { [classId]: 1 } },
    sideB: { faction: 'reaper', name: 'Unused', formation: 'line_abreast', counts: { reaper_capital: 1 } },
  })).ships[0];
}

describe('acceleration-limited three-dimensional arrival', () => {
  it.each(['alliance_dreadnought', 'alliance_omaha', 'alliance_frigate', 'alliance_fighter'])('%s dissipates lateral momentum and settles without a waypoint orbit', classId => {
    const ship = hull(classId);
    ship.pos = v3(-7, 3, -5);
    ship.vel = v3(0, 0, ship.maxSpeed);
    const goal = { position: v3(), speedFraction: 1 };
    for (let i = 0; i < 8000; i++) {
      const before = { ...ship.vel };
      advanceMotion(ship, goal, SIM_DT);
      expect(length(sub(ship.vel, before))).toBeLessThanOrEqual(ship.acceleration * SIM_DT + 1e-9);
      expect(length(ship.vel)).toBeLessThanOrEqual(ship.maxSpeed + 1e-9);
    }
    expect(distance(ship.pos, goal.position)).toBeLessThan(0.01);
    expect(length(ship.vel)).toBeLessThan(0.001);
  });

  it('brakes through an engine failure without deleting momentum or exceeding available thrust', () => {
    const ship = hull('alliance_dreadnought');
    ship.pos = v3(0, 0, -5);
    ship.vel = v3(ship.maxSpeed, 0, 0);
    ship.subsystems.engines = 0;
    const before = { ...ship.vel };
    advanceMotion(ship, { position: v3(), speedFraction: 1 }, SIM_DT);
    expect(length(sub(ship.vel, before))).toBeLessThanOrEqual(ship.acceleration * 0.25 * SIM_DT + 1e-9);
    expect(length(ship.vel)).toBeGreaterThan(ship.maxSpeed * 0.9);
  });
});
