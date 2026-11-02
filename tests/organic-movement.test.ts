import { describe, expect, it } from 'vitest';
import { distance, dot, length, normalize, sub, v3 } from '@/core/vec3';
import { buildCustomBattle } from '@/scenarios';
import { BattleSimulation, SIM_DT } from '@/simulation/battle';
import { advanceMotion } from '@/simulation/motion';
import { SeparationField } from '@/simulation/separation';

function fixture() {
  const sim = new BattleSimulation(buildCustomBattle({
    seed: 23, rulesId: 'canon_me3', environment: 'deep_space', startingDistanceKm: 60, maxDuration: 180,
    sideA: { faction: 'alliance', name: 'Screen', formation: 'line_abreast', counts: { alliance_frigate: 2 } },
    sideB: { faction: 'reaper', name: 'Pressure', formation: 'line_abreast', counts: { reaper_capital: 2 } },
  }));
  return sim;
}

describe('local fleet clearance', () => {
  it('the real battle loop separates ships assigned to the same station without a persistent chase', () => {
    const sim = fixture();
    for (const fleet of sim.fleets.values()) sim.issueOrders(fleet.spec.id, { order: 'hold_formation' });
    for (const ship of sim.ships) for (const weapon of ship.weapons) weapon.def = { ...weapon.def, damage: 0 };
    const friendly = sim.ships.filter(ship => ship.side === 'A');
    const fleet = sim.fleets.get(friendly[0].fleetId)!;
    fleet.anchor = v3();
    friendly[0].pos = v3(-3, 0, 0); friendly[1].pos = v3(3, 0, 0);
    for (const ship of friendly) ship.slot = v3();
    let minimum = Infinity;
    for (let tick = 0; tick < 2400; tick++) {
      sim.step();
      minimum = Math.min(minimum, distance(friendly[0].pos, friendly[1].pos));
    }
    expect(sim.finished).toBe(false);
    expect(minimum).toBeGreaterThan((friendly[0].radiusKm + friendly[1].radiusKm) * 0.95);
    for (const ship of friendly) expect(length(ship.vel)).toBeLessThan(0.005);
  });

  it('gives converging hulls clearance and settles without breaking acceleration limits', () => {
    const sim = fixture();
    const ships = sim.ships.filter(ship => ship.side === 'A');
    ships[0].pos = v3(-3, 0, 0); ships[1].pos = v3(3, 0, 0);
    ships[0].vel = v3(ships[0].maxSpeed, 0, 0);
    ships[1].vel = v3(-ships[1].maxSpeed, 0, 0);
    let minimum = Infinity;
    let lateTravel = 0;
    for (let step = 0; step < 2400; step++) {
      const field = new SeparationField(ships);
      for (const ship of ships) {
        const before = { ...ship.vel }, position = { ...ship.pos };
        advanceMotion(ship, { position: v3(), speedFraction: 1, avoidanceAcceleration: field.acceleration(ship) }, SIM_DT);
        expect(length(sub(ship.vel, before))).toBeLessThanOrEqual(ship.acceleration * SIM_DT + 1e-8);
        if (step >= 2200) lateTravel += distance(ship.pos, position);
      }
      minimum = Math.min(minimum, distance(ships[0].pos, ships[1].pos));
    }
    expect(minimum).toBeGreaterThan((ships[0].radiusKm + ships[1].radiusKm) * 1.02);
    expect(lateTravel).toBeLessThan(0.03);
    for (const ship of ships) expect(length(ship.vel)).toBeLessThan(0.003);
  });

  it('uses lateral clearance for a Reaper facing an obstructed advance', () => {
    const sim = fixture();
    const reapers = sim.ships.filter(ship => ship.faction === 'reaper');
    const enemy = sim.ships[0];
    reapers[0].pos = v3(); reapers[1].pos = v3(0, 0, 0.8); enemy.pos = v3(0, 0, 20);
    for (const reaper of reapers) reaper.targetId = enemy.id;
    const field = new SeparationField(sim.ships);
    const force = field.acceleration(reapers[0]);
    expect(length(force)).toBeGreaterThan(0);
    expect(dot(force, normalize(sub(enemy.pos, reapers[0].pos)))).toBeGreaterThanOrEqual(-1e-8);
    expect(Math.hypot(force.x, force.y)).toBeGreaterThan(0);
  });

  it('does not disturb an isolated held station and excludes dead or escaped obstacles', () => {
    const sim = fixture();
    const ship = sim.ships[0], obstacle = sim.ships[1];
    ship.pos = v3(); ship.vel = v3(); obstacle.pos = v3(); obstacle.alive = false;
    let field = new SeparationField([ship, obstacle]);
    expect(field.acceleration(ship)).toEqual(v3());
    obstacle.alive = true; obstacle.escaped = true;
    field = new SeparationField([ship, obstacle]);
    expect(field.acceleration(ship)).toEqual(v3());
    advanceMotion(ship, { position: v3(), speedFraction: 1, avoidanceAcceleration: field.acceleration(ship) }, SIM_DT);
    expect(ship.pos).toEqual(v3()); expect(ship.vel).toEqual(v3());
  });

  it('checks local neighbours rather than every pair in a dispersed large fleet', () => {
    const template = fixture().ships[0];
    const ships = Array.from({ length: 1000 }, (_, index) => ({
      ...template, id: `clearance-${index}`, pos: v3((index % 25) * 20, Math.floor(index / 25) * 20, 0), vel: v3(),
    }));
    const field = new SeparationField(ships);
    for (const ship of ships) expect(field.acceleration(ship)).toEqual(v3());
    expect(field.pairChecks).toBeLessThan(ships.length * 4);
  });
});
