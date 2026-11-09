import { describe, expect, it } from 'vitest';
import { dot, length, sub, v3 } from '@/core/vec3';
import { manoeuvreVelocity } from '@/simulation/propulsion';
import { advanceMotion } from '@/simulation/motion';
import { buildCustomBattle } from '@/scenarios';
import { BattleSimulation, SIM_DT } from '@/simulation/battle';

function hull(classId: string, faction: 'alliance' | 'reaper' = 'alliance') {
  return new BattleSimulation(buildCustomBattle({
    seed: 42, rulesId: 'prime_apex', environment: 'deep_space', startingDistanceKm: 90,
    sideA: { faction, name: 'Motion', formation: 'line_abreast', counts: { [classId]: 1 } },
    sideB: { faction: 'reaper', name: 'Target', formation: 'line_abreast', counts: { reaper_capital: 1 } },
  })).ships[0];
}

describe('class-dependent tactical speed', () => {
  it('preserves catalogue forward speed while separating capital and light-craft handling', () => {
    const bow = v3(0, 0, 1);
    expect(manoeuvreVelocity('dreadnought', bow, v3(0, 0, 1), 1)).toEqual(bow);
    expect(length(manoeuvreVelocity('dreadnought', bow, v3(1, 0, 0), 1))).toBeLessThan(.3);
    expect(length(manoeuvreVelocity('reaper_capital', bow, v3(0, 0, -1), 1))).toBeLessThan(.2);
    expect(length(manoeuvreVelocity('frigate', bow, v3(1, 0, 0), 1))).toBeGreaterThan(.6);
    expect(length(manoeuvreVelocity('fighter', bow, v3(1, 0, 0), 1))).toBeGreaterThan(.9);
  });

  it.each([
    ['alliance_dreadnought', 'alliance'], ['alliance_cruiser', 'alliance'],
    ['alliance_frigate', 'alliance'], ['reaper_capital', 'reaper'],
  ] as const)('%s cannot reach main-engine speed during a sustained broadside or reverse translation', (classId, faction) => {
    for (const direction of [v3(1, 0, 0), v3(0, 0, -1)]) {
      const ship = hull(classId, faction);
      ship.pos = v3(); ship.vel = v3(); ship.heading = v3(0, 0, 1);
      const goal = { position: { x: direction.x * 1000, y: 0, z: direction.z * 1000 }, speedFraction: 1 };
      for (let i = 0; i < 2400; i++) {
        const before = ship.vel;
        advanceMotion(ship, goal, SIM_DT);
        expect(length(sub(ship.vel, before))).toBeLessThanOrEqual(ship.acceleration * SIM_DT + 1e-9);
      }
      expect(length(ship.vel)).toBeLessThan(ship.maxSpeed * .8);
    }
  });

  it('brakes an existing lateral drift gradually when the bow changes', () => {
    const ship = hull('alliance_dreadnought');
    ship.pos = v3(); ship.heading = v3(0, 0, 1); ship.vel = v3(ship.maxSpeed, 0, 0);
    const before = { ...ship.vel };
    advanceMotion(ship, { position: v3(1000, 0, 0), speedFraction: 1 }, SIM_DT);
    expect(length(sub(ship.vel, before))).toBeLessThanOrEqual(ship.acceleration * SIM_DT + 1e-9);
    expect(length(ship.vel)).toBeGreaterThan(ship.maxSpeed * .95);
    ship.subsystems.engines = 0;
    const disabled = { ...ship.vel };
    advanceMotion(ship, { position: v3(), speedFraction: 1 }, SIM_DT);
    expect(ship.vel).toEqual(disabled);
    expect(dot(ship.vel, disabled)).toBeGreaterThan(0);
  });
});
