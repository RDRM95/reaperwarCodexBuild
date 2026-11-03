import { describe, expect, it } from 'vitest';
import { distance, dot, length, normalize, sub } from '@/core/vec3';
import { CROSSOVER_WEAPONS } from '@/data/crossover';
import { buildCustomBattle } from '@/scenarios';
import { BattleSimulation, SIM_DT } from '@/simulation/battle';

const classes = ['imperium_lunar', 'imperium_retribution', 'chaos_murder', 'chaos_desolator'] as const;

function duel(classId: typeof classes[number], startingDistanceKm = 80) {
  const faction = classId.startsWith('imperium') ? 'imperium' : 'chaos';
  const sim = new BattleSimulation(buildCustomBattle({
    seed: 9, rulesId: 'multiverse_crossover', environment: 'deep_space', startingDistanceKm, maxDuration: 360,
    sideA: { faction, name: 'Broadside line', formation: 'line_abreast', counts: { [classId]: 1 } },
    sideB: { faction: 'reaper', name: 'Stationary target', formation: 'line_abreast', counts: { reaper_capital: 1 } },
  }));
  for (const ship of sim.ships) for (const weapon of ship.weapons) weapon.def = { ...weapon.def, damage: 0 };
  sim.issueOrders('custom-b', { order: 'hold_formation' });
  return { sim, ship: sim.ships.find(ship => ship.side === 'A')!, target: sim.ships.find(ship => ship.side === 'B')! };
}

function advance(sim: BattleSimulation, seconds: number) {
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) sim.step();
  expect(sim.finished).toBe(false);
}

function shots(sim: BattleSimulation, shipId: string, family: string) {
  return sim.events.filter(event => event.type === 'weapon_fired' && event.shipId === shipId && event.weaponId.startsWith(family));
}

describe('Warhammer crossover broadside tactics', () => {
  it.each(classes)('%s brings a stable broadside to bear while its firing station settles', classId => {
    const { sim, ship, target } = duel(classId);
    advance(sim, 180);
    const settled = { ...ship.pos };
    const initialLateShots = shots(sim, ship.id, 'wh_macro').length;
    let travel = 0;
    for (let i = 0; i < Math.round(40 / SIM_DT); i++) {
      const previous = { ...ship.pos };
      sim.step();
      travel += distance(previous, ship.pos);
    }
    const macroShots = shots(sim, ship.id, 'wh_macro');
    expect(macroShots.length).toBeGreaterThan(initialLateShots);
    expect(shots(sim, ship.id, 'wh_lance').some(event => event.t > 180)).toBe(true);
    const flanks = new Set(macroShots.map(event => event.type === 'weapon_fired' ? Math.sign(Math.sin(ship.weapons[event.weaponIndex].facing)) : 0));
    expect(flanks.size).toBe(1);
    expect([...flanks][0]).not.toBe(0);
    expect(Math.abs(dot(ship.heading, normalize(sub(target.pos, ship.pos))))).toBeLessThan(0.1);
    expect(travel).toBeLessThan(0.05);
    expect(distance(ship.pos, settled)).toBeLessThan(0.02);
    expect(length(ship.vel)).toBeLessThan(ship.maxSpeed * 0.02);
    expect(CROSSOVER_WEAPONS.wh_macro_cruiser.arc).toBe(110);
    expect(CROSSOVER_WEAPONS.wh_macro_battleship.arc).toBe(110);
  });

  it('keeps its prow forward on approach and uses long-range lances before macro range', () => {
    const moving = duel('imperium_lunar', 150);
    advance(moving.sim, 30);
    expect(length(moving.ship.vel)).toBeGreaterThan(moving.ship.maxSpeed * 0.5);
    expect(dot(moving.ship.heading, normalize(sub(moving.target.pos, moving.ship.pos)))).toBeGreaterThan(0.99);
    expect(shots(moving.sim, moving.ship.id, 'wh_macro')).toHaveLength(0);

    const { sim, ship, target } = duel('imperium_lunar', 85);
    sim.issueOrders(ship.fleetId, { order: 'hold_formation' });
    advance(sim, 20);
    expect(shots(sim, ship.id, 'wh_macro')).toHaveLength(0);
    expect(shots(sim, ship.id, 'wh_lance').length).toBeGreaterThan(0);
    expect(shots(sim, ship.id, 'wh_torpedo').length).toBeGreaterThan(0);
    expect(dot(ship.heading, normalize(sub(target.pos, ship.pos)))).toBeGreaterThan(0.99);
    target.pos.z = ship.pos.z + 28;
    target.prevPos = { ...target.pos };
    sim.fleets.get(target.fleetId)!.anchor = { ...target.pos };
    advance(sim, 120);
    expect(shots(sim, ship.id, 'wh_macro').length).toBeGreaterThan(0);
    expect(length(ship.vel)).toBe(0);
  });

  it('returns to forward lance targeting when neither broadside has ammunition', () => {
    const { sim, ship, target } = duel('chaos_murder');
    advance(sim, 140);
    expect(shots(sim, ship.id, 'wh_macro').length).toBeGreaterThan(0);
    const before = shots(sim, ship.id, 'wh_macro').length;
    for (const weapon of ship.weapons) if (weapon.def.id.startsWith('wh_macro')) weapon.ammo = 0;
    advance(sim, 60);
    expect(shots(sim, ship.id, 'wh_macro')).toHaveLength(before);
    expect(dot(ship.heading, normalize(sub(target.pos, ship.pos)))).toBeGreaterThan(0.99);
    expect(shots(sim, ship.id, 'wh_lance').some(event => event.t > 140)).toBe(true);
  });

  it('chooses its flank without changing deterministic replay outcomes', () => {
    const a = duel('imperium_lunar'), b = duel('imperium_lunar');
    advance(a.sim, 160); advance(b.sim, 160);
    expect(a.sim.events).toEqual(b.sim.events);
    expect(a.ship.heading).toEqual(b.ship.heading);
    expect(a.ship.pos).toEqual(b.ship.pos);
  });

  it('leaves Omaha spinal facing and Reaper facing unchanged', () => {
    const sim = new BattleSimulation(buildCustomBattle({
      seed: 9, rulesId: 'prime_apex', environment: 'deep_space', startingDistanceKm: 24, maxDuration: 180,
      sideA: { faction: 'alliance', name: 'Spinal flagship', formation: 'line_abreast', counts: { alliance_omaha: 1 } },
      sideB: { faction: 'reaper', name: 'Reaper capital', formation: 'line_abreast', counts: { reaper_capital: 1 } },
    }));
    for (const fleet of sim.fleets.values()) sim.issueOrders(fleet.spec.id, { order: 'hold_formation' });
    for (const ship of sim.ships) for (const weapon of ship.weapons) weapon.def = { ...weapon.def, damage: 0 };
    advance(sim, 120);
    for (const ship of sim.ships) {
      const target = sim.getShip(ship.targetId!)!;
      expect(dot(ship.heading, normalize(sub(target.pos, ship.pos)))).toBeGreaterThan(0.99);
    }
  });
});
