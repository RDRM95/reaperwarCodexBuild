import { describe, expect, it } from 'vitest';
import { clone, normalize, sub } from '@/core/vec3';
import { buildCustomBattle } from '@/scenarios';
import { BattleSimulation, SIM_DT } from '@/simulation/battle';
import type { ShipState, WeaponState } from '@/simulation/types';

const spinal = (ship: ShipState, weapon: WeaponState): boolean => ship.faction !== 'reaper' && ship.role === 'dreadnought' &&
  weapon.def.kind === 'mass_accelerator' && weapon.def.antiCapital && weapon.def.arc <= 20;

function battery(extraEscorts = false) {
  const sim = new BattleSimulation(buildCustomBattle({
    seed: 19, rulesId: 'prime_apex', environment: 'deep_space', startingDistanceKm: 24, maxDuration: 180,
    sideA: { faction: 'alliance', name: 'Spinal battery', formation: 'line_abreast', counts: {
      alliance_dreadnought: 2, alliance_omaha: 1, ...(extraEscorts ? { alliance_cruiser: 1, alliance_frigate: 1 } : {}),
    } },
    sideB: { faction: 'reaper', name: 'Target', formation: 'line_abreast', counts: { reaper_capital: 1 } },
  }));
  sim.issueOrders('custom-a', { order: 'hold_formation', primaryFire: 'hold' });
  sim.issueOrders('custom-b', { order: 'hold_formation' });
  const target = sim.ships.find(s => s.side === 'B')!;
  for (const ship of sim.ships) {
    for (const weapon of ship.weapons) {
      weapon.def = { ...weapon.def, damage: 0 };
      weapon.cooldown = 0;
    }
    if (ship.side === 'A') {
      ship.targetId = target.id;
      ship.forcedTargetId = target.id;
      ship.heading = normalize(sub(target.pos, ship.pos));
      ship.prevHeading = clone(ship.heading);
    }
  }
  const ships = sim.ships.filter(s => s.side === 'A' && s.role === 'dreadnought');
  const guns = ships.flatMap(ship => ship.weapons.filter(w => spinal(ship, w)).map(weapon => ({ ship, weapon })));
  return { sim, ships, guns, target };
}

function advance(sim: BattleSimulation, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) sim.step();
}

function primaryShots(sim: BattleSimulation) {
  return sim.events.filter(e => e.type === 'weapon_fired' && (() => {
    const ship = sim.getShip(e.shipId)!;
    return spinal(ship, ship.weapons[e.weaponIndex]);
  })());
}

describe('manual spinal fire control', () => {
  it('holds the battery, releases one aligned shot per mount, then returns to hold', () => {
    const { sim, guns } = battery();
    advance(sim, 1);
    expect(primaryShots(sim)).toHaveLength(0);
    expect(sim.fleetBatteryStatus('custom-a')!.held).toBe(true);
    expect(sim.releasePrimaryVolley('custom-a')).toBe(true);
    advance(sim, 0.6);
    const shots = primaryShots(sim);
    expect(shots).toHaveLength(guns.length);
    const releaseTimes = shots.map(e => e.t);
    expect(Math.max(...releaseTimes) - Math.min(...releaseTimes)).toBeLessThanOrEqual(0.5);
    advance(sim, 15);
    expect(primaryShots(sim)).toHaveLength(guns.length);
    expect(sim.fleetBatteryStatus('custom-a')!.held).toBe(true);
    expect(sim.fleetBatteryStatus('custom-a')!.volleyRemaining).toBe(0);
  });

  it('button spam neither extends a release window nor bypasses real weapon cooldowns', () => {
    const { sim, guns } = battery();
    expect(sim.releasePrimaryVolley('custom-a')).toBe(true);
    advance(sim, 0.1);
    const remaining = sim.fleetBatteryStatus('custom-a')!.volleyRemaining;
    for (let i = 0; i < 10; i++) expect(sim.releasePrimaryVolley('custom-a')).toBe(false);
    expect(sim.fleetBatteryStatus('custom-a')!.volleyRemaining).toBe(remaining);
    advance(sim, 0.5);
    expect(primaryShots(sim)).toHaveLength(guns.length);
    expect(sim.releasePrimaryVolley('custom-a')).toBe(true);
    advance(sim, 0.6);
    expect(primaryShots(sim)).toHaveLength(guns.length);
    advance(sim, 8);
    expect(primaryShots(sim)).toHaveLength(guns.length);
    expect(sim.releasePrimaryVolley('custom-a')).toBe(true);
    advance(sim, 0.6);
    expect(primaryShots(sim)).toHaveLength(guns.length * 2);
  });

  it.each(['cooling', 'aligning', 'overheated', 'out_of_ammo', 'out_of_range'] as const)(
    'a manual release respects %s and never queues a late shot', reason => {
      const { sim, ships, guns, target } = battery();
      for (const { ship, weapon } of guns) {
        if (reason === 'cooling') weapon.cooldown = 2;
        if (reason === 'aligning') ship.heading = { x: 0, y: 0, z: -1 };
        if (reason === 'overheated') { ship.overheated = true; ship.heat = ship.heatCapacity * 2; }
        if (reason === 'out_of_ammo') weapon.ammo = 0;
      }
      if (reason === 'out_of_range') target.pos.z += Math.max(...guns.map(g => g.weapon.def.range)) * 2;
      // Readiness describes the same physical constraints used by the firing loop.
      sim.issueOrders('custom-a', { primaryFire: 'free' });
      for (const ship of ships) expect(sim.primaryBatteryStatus(ship.id)!.reason).toBe(reason);
      sim.issueOrders('custom-a', { primaryFire: 'hold' });
      expect(sim.releasePrimaryVolley('custom-a')).toBe(true);
      advance(sim, 0.6);
      expect(primaryShots(sim)).toHaveLength(0);
      for (const { ship, weapon } of guns) {
        weapon.cooldown = 0;
        weapon.ammo = undefined;
        ship.overheated = false;
        ship.heat = 0;
      }
      target.pos = clone(sim.fleets.get('custom-b')!.anchor);
      for (const ship of ships) ship.heading = normalize(sub(target.pos, ship.pos));
      advance(sim, 1);
      expect(primaryShots(sim)).toHaveLength(0);
    },
  );

  it('a destroyed target cannot receive a manually released shot', () => {
    const { sim, ships, target } = battery();
    target.alive = false;
    sim.issueOrders('custom-a', { primaryFire: 'free' });
    for (const ship of ships) expect(sim.primaryBatteryStatus(ship.id)!.reason).toBe('no_target');
    sim.issueOrders('custom-a', { primaryFire: 'hold' });
    sim.releasePrimaryVolley('custom-a');
    advance(sim, 0.6);
    expect(primaryShots(sim)).toHaveLength(0);
  });

  it('hold applies only to organic dreadnought spinal batteries; escorts and Reapers fight on', () => {
    const { sim } = battery(true);
    sim.issueOrders('custom-b', { primaryFire: 'hold' });
    expect(sim.releasePrimaryVolley('custom-b')).toBe(false);
    advance(sim, 8);
    expect(primaryShots(sim)).toHaveLength(0);
    for (const role of ['cruiser', 'frigate', 'reaper_capital']) {
      expect(sim.events.some(e => e.type === 'weapon_fired' && sim.getShip(e.shipId)?.role === role)).toBe(true);
    }
    expect(sim.fleetBatteryStatus('custom-b')!.total).toBe(0);
  });

  it('resuming free fire needs no manual command and does not alter the existing salvo clock', () => {
    const { sim } = battery();
    advance(sim, 2);
    expect(primaryShots(sim)).toHaveLength(0);
    sim.issueOrders('custom-a', { primaryFire: 'free' });
    advance(sim, 8);
    expect(primaryShots(sim).length).toBeGreaterThan(0);
    expect(sim.fleetBatteryStatus('custom-a')!.held).toBe(false);
  });

  it('status queries are pure and identical commands preserve seeded determinism', () => {
    const a = battery();
    const b = battery();
    const before = JSON.stringify({ ships: a.sim.ships, events: a.sim.events });
    for (let i = 0; i < 100; i++) {
      a.sim.fleetBatteryStatus('custom-a');
      for (const ship of a.sim.ships) a.sim.primaryBatteryStatus(ship.id);
    }
    expect(JSON.stringify({ ships: a.sim.ships, events: a.sim.events })).toBe(before);
    expect(a.sim.rng.next()).toBe(b.sim.rng.next());
    for (let tick = 0; tick < 200; tick++) {
      if (tick === 3 || tick === 6 || tick === 80 || tick === 160) {
        expect(a.sim.releasePrimaryVolley('custom-a')).toBe(b.sim.releasePrimaryVolley('custom-a'));
      }
      a.sim.step();
      b.sim.step();
    }
    expect(a.sim.events).toEqual(b.sim.events);
    expect(a.sim.ships).toEqual(b.sim.ships);
  });
});
